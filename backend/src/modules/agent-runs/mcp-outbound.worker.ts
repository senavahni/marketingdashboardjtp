import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, UnrecoverableError, Worker } from 'bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { MCP_CONTRACT_VERSION } from '../../common/constants/domain';
import { Actor } from '../../common/types/request.types';
import { PrismaService } from '../../database/prisma.service';
import { agent_runs, Prisma } from '../../generated/prisma/client';
import { RedisService } from '../../redis/redis.service';
import { cancelOutputSchema, dispatchOutputSchema, estimationOutputSchema } from '../../shared/schemas/mcp.schema';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { fromDateString, todayInTimezone } from '../../utils/helpers/date.util';
import { ActivityService } from '../activity/activity.service';
import { RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { TaskReaderService } from '../tasks/task-reader.service';
import { AgentRunsService } from './agent-runs.service';
import { McpCallError, McpClientService } from './mcp-client.service';
import { McpPayloadBuilder } from './mcp-payload.builder';
import { MCP_QUEUE, McpJobData } from './mcp-queue.service';

const runInclude = {
  agent: true,
  workspace: { select: { id: true, timezone: true } },
  task: true,
  dispatcher: { select: { id: true, display_name: true } },
} satisfies Prisma.agent_runsInclude;
type RunWithRelations = Prisma.agent_runsGetPayload<{ include: typeof runInclude }>;

/** Worker antrian mcp-outbound: estimasi, dispatch, mention, prompt block, cancel. */
@Injectable()
export class McpOutboundWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpOutboundWorker.name);
  private worker: Worker<McpJobData> | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly mcp: McpClientService,
    private readonly payloads: McpPayloadBuilder,
    private readonly runs: AgentRunsService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
    private readonly taskReader: TaskReaderService,
  ) {}

  onModuleInit(): void {
    if (!this.config.env.RUN_WORKERS) return;
    this.worker = new Worker<McpJobData>(MCP_QUEUE, (job) => this.process(job), {
      connection: this.redis.createConnection('bullmq-worker', { forBullmq: true }),
      concurrency: 5,
    });
    this.worker.on('failed', (job, err) => void this.onFailed(job, err));
    this.worker.on('error', (err) => this.logger.warn(`Worker error: ${err.message}`));
    this.logger.log('Worker mcp-outbound aktif');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
  }

  async process(job: Job<McpJobData>): Promise<void> {
    const { kind, run_id } = job.data;
    if (kind === 'cancel') return this.cancel(job.data);

    const run = await this.prisma.agent_runs.findUnique({ where: { id: run_id }, include: runInclude });
    if (!run || run.status !== 'queued') {
      this.logger.debug({ run_id, status: run?.status }, 'Run tidak lagi queued, job dilewati');
      return;
    }
    if (!run.agent.is_active || run.agent.deleted_at) throw new UnrecoverableError('AGENT_INACTIVE: Agent tidak aktif');
    await this.prisma.agent_runs.update({ where: { id: run.id }, data: { attempts: { increment: 1 } } });

    try {
      if (kind === 'dispatch') await this.dispatch(run);
      else if (kind === 'mention') await this.mention(run);
      else if (kind === 'prompt_block') await this.promptBlock(run);
    } catch (err) {
      if (err instanceof McpCallError && !err.retryable) throw new UnrecoverableError(`${err.code}: ${err.message}`);
      throw err;
    }
  }

  // ---------- dispatch (assignment) ----------
  private async dispatch(run: RunWithRelations): Promise<void> {
    const task = run.task;
    if (!task || task.deleted_at) throw new UnrecoverableError('TASK_DELETED: Task sudah dihapus');

    if (!task.start_date && !task.end_date) await this.estimate(run);

    const fresh = await this.prisma.tasks.findUniqueOrThrow({ where: { id: task.id } });
    const blocks = await this.payloads.contextBlocks(task.project_id, task.id);
    const subtasks = await this.prisma.tasks.findMany({
      where: { parent_task_id: task.id, deleted_at: null },
      select: { id: true, title: true, status: true, depth: true },
      orderBy: { order_index: 'asc' },
    });

    if (!(await this.stillQueued(run.id))) return;
    const out = dispatchOutputSchema.parse(
      await this.mcp.callTool(
        'pm_dispatch_task_to_agent',
        {
          contract_version: MCP_CONTRACT_VERSION,
          run_id: run.id,
          agent_key: run.agent.mcp_agent_key,
          agent_id: run.agent_id,
          task: this.payloads.taskSnapshot(fresh, run.workspace_id),
          task_description: this.payloads.description(blocks),
          context_blocks: blocks,
          subtasks,
          dispatched_by: run.dispatcher ? { user_id: run.dispatcher.id, display_name: run.dispatcher.display_name } : null,
          callback: this.payloads.callback(),
          limits: { max_depth: 3, max_subtasks_per_event: 20, max_blocks_per_event: 50 },
        },
        this.config.env.MCP_CALL_TIMEOUT_MS,
      ),
    );
    await this.markDispatched(run, out);
  }

  /** pm_request_agent_estimation — gagal tidak menghentikan dispatch. */
  private async estimate(run: RunWithRelations): Promise<void> {
    const task = run.task!;
    const agentActor: Actor = { type: 'agent', id: run.agent_id, name: run.agent.name };
    const today = todayInTimezone(run.workspace.timezone);
    const effects = new AfterCommit();
    try {
      const blocks = await this.payloads.contextBlocks(task.project_id, task.id);
      const out = estimationOutputSchema.parse(
        await this.mcp.callTool(
          'pm_request_agent_estimation',
          {
            contract_version: MCP_CONTRACT_VERSION,
            run_id: run.id,
            agent_key: run.agent.mcp_agent_key,
            task: this.payloads.taskSnapshot(task, run.workspace_id),
            task_description: this.payloads.description(blocks),
            context_blocks: blocks,
            earliest_start_date: today,
            timezone: run.workspace.timezone,
          },
          this.config.env.MCP_ESTIMATION_TIMEOUT_MS,
        ),
      );
      if (out.end_date < out.start_date || out.start_date < today) throw new Error('Estimasi tanggal tidak valid');

      await this.prisma.tx(async (tx) => {
        // Hanya isi jika tanggal masih kosong (tanggal dari user tidak ditimpa)
        const res = await tx.tasks.updateMany({
          where: { id: task.id, start_date: null, end_date: null, is_milestone: false },
          data: { start_date: fromDateString(out.start_date), end_date: fromDateString(out.end_date) },
        });
        if (res.count === 0) return;
        await this.activity.log(
          tx,
          {
            workspaceId: run.workspace_id,
            projectId: task.project_id,
            entityType: 'task',
            entityId: task.id,
            action: 'agent.estimated',
            actor: agentActor,
            metadata: { run_id: run.id, start_date: out.start_date, end_date: out.end_date, estimated_days: out.estimated_days ?? null },
          },
          effects,
        );
        if (out.message) {
          const comment = await tx.comments.create({
            data: { project_id: task.project_id, entity_type: 'task', entity_id: task.id, author_type: 'agent', author_agent_id: run.agent_id, content: out.message },
          });
          effects.add(() =>
            this.realtime.toProjectAndTask(task.project_id, task.id, RealtimeEvent.COMMENT_CREATED, {
              comment: {
                id: comment.id,
                project_id: comment.project_id,
                entity_type: 'task',
                entity_id: task.id,
                parent_comment_id: null,
                author: { type: 'agent', id: run.agent_id, name: run.agent.name, avatar_url: run.agent.avatar_url },
                content: comment.content,
                mentions: [],
                edited_at: null,
                created_at: comment.created_at,
                reply_count: 0,
              },
            }, { actor: agentActor }),
          );
        }
        effects.add(async () => {
          const dto = await this.taskReader.getDto(task.id);
          if (dto) this.realtime.toProjectAndTask(task.project_id, task.id, RealtimeEvent.TASK_UPDATED, { task: dto, changed_fields: ['start_date', 'end_date'] }, { actor: agentActor });
        });
      });
    } catch (err) {
      this.logger.warn({ run_id: run.id, err: (err as Error).message }, 'Estimasi agent gagal, lanjut dispatch');
      await this.prisma.tx((tx) =>
        this.activity.log(
          tx,
          {
            workspaceId: run.workspace_id,
            projectId: task.project_id,
            entityType: 'task',
            entityId: task.id,
            action: 'agent.estimation_failed',
            actor: agentActor,
            metadata: { run_id: run.id, error: (err as Error).message },
          },
          effects,
        ),
      );
    }
    await effects.run();
  }

  // ---------- mention ----------
  private async mention(run: RunWithRelations): Promise<void> {
    const comment = run.trigger_ref_id
      ? await this.prisma.comments.findFirst({ where: { id: run.trigger_ref_id, deleted_at: null }, include: { author_user: true } })
      : null;
    if (!comment) throw new UnrecoverableError('COMMENT_DELETED: Komentar pemicu tidak ditemukan');
    const rootId = comment.parent_comment_id ?? comment.id;
    const thread = await this.prisma.comments.findMany({
      where: { OR: [{ id: rootId }, { parent_comment_id: rootId }], deleted_at: null },
      include: { author_user: { select: { display_name: true } }, author_agent: { select: { name: true } } },
      orderBy: { created_at: 'asc' },
      take: 50,
    });
    const blocks = await this.payloads.contextBlocks(run.project_id, run.task_id);

    if (!(await this.stillQueued(run.id))) return;
    const out = dispatchOutputSchema.parse(
      await this.mcp.callTool(
        'pm_notify_agent_mention',
        {
          contract_version: MCP_CONTRACT_VERSION,
          run_id: run.id,
          agent_key: run.agent.mcp_agent_key,
          agent_id: run.agent_id,
          task: run.task ? this.payloads.taskSnapshot(run.task, run.workspace_id) : null,
          project_id: run.project_id,
          comment: {
            id: comment.id,
            parent_comment_id: comment.parent_comment_id,
            content: comment.content,
            author: { type: comment.author_type, id: comment.author_user_id, display_name: comment.author_user?.display_name ?? null },
            created_at: comment.created_at.toISOString(),
          },
          thread: thread.map((c) => ({
            id: c.id,
            content: c.content,
            author: {
              type: c.author_type,
              id: c.author_user_id ?? c.author_agent_id,
              display_name: c.author_user?.display_name ?? c.author_agent?.name ?? 'Sistem',
            },
          })),
          context_blocks: blocks,
          callback: this.payloads.callback(),
        },
        this.config.env.MCP_CALL_TIMEOUT_MS,
      ),
    );
    await this.markDispatched(run, out);
  }

  // ---------- prompt block (P1) ----------
  private async promptBlock(run: RunWithRelations): Promise<void> {
    const block = run.trigger_ref_id ? await this.prisma.document_blocks.findFirst({ where: { id: run.trigger_ref_id, deleted_at: null } }) : null;
    if (!block) throw new UnrecoverableError('BLOCK_DELETED: Prompt block tidak ditemukan');
    const props = ((block.content_json ?? {}) as { props?: { prompt?: string } }).props ?? {};
    const blocks = await this.payloads.contextBlocks(run.project_id, run.task_id);

    if (!(await this.stillQueued(run.id))) return;
    const out = dispatchOutputSchema.parse(
      await this.mcp.callTool(
        'pm_execute_prompt_block',
        {
          contract_version: MCP_CONTRACT_VERSION,
          run_id: run.id,
          agent_key: run.agent.mcp_agent_key,
          agent_id: run.agent_id,
          task: run.task ? this.payloads.taskSnapshot(run.task, run.workspace_id) : null,
          project_id: run.project_id,
          prompt_block: { id: block.id, prompt: props.prompt ?? '', version: block.version },
          context_blocks: blocks,
          callback: this.payloads.callback(),
        },
        this.config.env.MCP_CALL_TIMEOUT_MS,
      ),
    );
    await this.markDispatched(run, out);
  }

  // ---------- cancel ----------
  private async cancel(data: McpJobData): Promise<void> {
    cancelOutputSchema.parse(
      await this.mcp.callTool(
        'pm_cancel_agent_run',
        { contract_version: MCP_CONTRACT_VERSION, run_id: data.run_id, mcp_run_id: data.mcp_run_id ?? null, reason: data.reason ?? 'user_cancelled' },
        this.config.env.MCP_CALL_TIMEOUT_MS,
      ),
    );
  }

  // ---------- helpers ----------
  private async stillQueued(runId: string): Promise<boolean> {
    const r = await this.prisma.agent_runs.findUnique({ where: { id: runId }, select: { status: true } });
    return r?.status === 'queued';
  }

  private async markDispatched(run: agent_runs, out: { accepted: boolean; mcp_run_id?: string }): Promise<void> {
    if (!out.accepted) throw new UnrecoverableError('DISPATCH_REJECTED: MCP Server menolak pekerjaan');
    const effects = new AfterCommit();
    await this.prisma.tx(async (tx) => {
      const res = await tx.agent_runs.updateMany({
        where: { id: run.id, status: 'queued' },
        data: { status: 'dispatched', mcp_run_id: out.mcp_run_id ?? null, last_event_at: new Date() },
      });
      if (res.count === 0) return;
      await this.activity.log(
        tx,
        {
          workspaceId: run.workspace_id,
          projectId: run.project_id,
          entityType: 'task',
          entityId: run.task_id ?? run.project_id,
          action: 'agent.dispatched',
          actor: { type: 'system', id: null },
          metadata: { run_id: run.id, trigger: run.trigger, agent_id: run.agent_id, task_id: run.task_id },
        },
        effects,
      );
    });
    await effects.run();
  }

  /** Dipanggil BullMQ saat job gagal; pada kegagalan final run ditandai failed. */
  private async onFailed(job: Job<McpJobData> | undefined, err: Error): Promise<void> {
    if (!job) return;
    const final = err.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1);
    this.logger.warn({ run_id: job.data.run_id, kind: job.data.kind, attempt: job.attemptsMade, final, err: err.message }, 'Job MCP gagal');
    if (!final || job.data.kind === 'cancel') return;

    const run = await this.prisma.agent_runs.findUnique({ where: { id: job.data.run_id } });
    if (!run) return;
    const [code, ...rest] = err.message.split(': ');
    const hasCode = rest.length > 0 && /^[A-Z_]+$/.test(code);
    const effects = new AfterCommit();
    await this.prisma.tx((tx) =>
      this.runs.failRun(
        tx,
        run,
        { code: hasCode ? code : 'MCP_UNAVAILABLE', message: hasCode ? rest.join(': ') : err.message, retryable: false },
        effects,
      ),
    );
    await effects.run();
  }
}
