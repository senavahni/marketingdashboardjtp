import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppException, Errors } from '../../common/exceptions/app.exception';
import { Actor } from '../../common/types/request.types';
import { PrismaService, Tx } from '../../database/prisma.service';
import { agents, agent_runs, Prisma, tasks } from '../../generated/prisma/client';
import { EventData, eventDataSchemas, McpEventType, WebhookEnvelope, webhookEnvelopeSchema } from '../../shared/schemas/mcp.schema';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { excerpt } from '../../utils/helpers/text.util';
import { ActivityService } from '../activity/activity.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { BlockOperation, BlockScope, BlocksService } from '../blocks/blocks.service';
import { commentInclude, CommentsService } from '../comments/comments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { TaskHierarchy } from '../tasks/task-hierarchy.repository';
import { TaskReaderService } from '../tasks/task-reader.service';
import { ACTIVE_RUN_STATUS_LIST } from '../tasks/task.mapper';
import { TasksService } from '../tasks/tasks.service';

type RunCtx = agent_runs & { agent: agents; workspace: { id: string; timezone: string } };

interface HandlerContext {
  tx: Tx;
  run: RunCtx;
  env: WebhookEnvelope;
  /** Task target event (task run atau turunannya); null untuk run level project */
  task: tasks | null;
  agent: Actor;
  effects: AfterCommit;
}

const EVENT_STALE_MS = 60_000;

/**
 * Penerima webhook MCP (TASK_003 §MCP Webhook Receiver, M1_MCP_INTEGRATION §5):
 * validasi → idempotency → validasi run & scope task → handler per event (1 transaksi) → efek setelah commit.
 */
@Injectable()
export class McpWebhookService {
  private readonly logger = new Logger(McpWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: AgentRunsService,
    private readonly blocks: BlocksService,
    private readonly tasks: TasksService,
    private readonly comments: CommentsService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
    private readonly reader: TaskReaderService,
  ) {}

  async handle(body: unknown): Promise<{ status: 'processed' | 'duplicate'; result?: unknown }> {
    const envParsed = webhookEnvelopeSchema.safeParse(body);
    if (!envParsed.success) {
      throw Errors.validation('Envelope webhook tidak valid', { issues: envParsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    const env = envParsed.data;
    const dataParsed = eventDataSchemas[env.event_type].safeParse(env.data);
    if (!dataParsed.success) {
      throw Errors.validation(`data untuk ${env.event_type} tidak valid`, {
        issues: dataParsed.error.issues.map((i) => ({ path: `data.${i.path.join('.')}`, message: i.message })),
      });
    }

    // Idempotency berdasarkan event_id
    const existing = await this.prisma.mcp_webhook_events.findUnique({ where: { event_id: env.event_id } });
    if (existing?.status === 'processed') return { status: 'duplicate' };
    if (existing?.status === 'processing' && Date.now() - existing.received_at.getTime() < EVENT_STALE_MS) {
      throw new AppException(ErrorCode.EVENT_IN_PROGRESS, 'Event sedang diproses, coba lagi', 429, { retry_after: 5 });
    }
    try {
      await this.prisma.mcp_webhook_events.upsert({
        where: { event_id: env.event_id },
        create: { event_id: env.event_id, event_type: env.event_type, status: 'processing' },
        update: { status: 'processing', error: Prisma.DbNull, received_at: new Date() },
      });
    } catch {
      throw new AppException(ErrorCode.EVENT_IN_PROGRESS, 'Event sedang diproses, coba lagi', 429, { retry_after: 5 });
    }

    try {
      const result = await this.process(env, dataParsed.data);
      await this.prisma.mcp_webhook_events.update({
        where: { event_id: env.event_id },
        data: { status: 'processed', processed_at: new Date(), run_id: env.run_id },
      });
      return { status: 'processed', result };
    } catch (err) {
      const error =
        err instanceof AppException ? { code: err.code, message: err.message } : { code: 'INTERNAL_ERROR', message: (err as Error).message };
      await this.prisma.mcp_webhook_events
        .update({ where: { event_id: env.event_id }, data: { status: 'rejected', error, processed_at: new Date() } })
        .catch(() => undefined);
      this.logger.warn({ event_id: env.event_id, event_type: env.event_type, run_id: env.run_id, error }, 'Webhook MCP ditolak');
      throw err;
    }
  }

  private async process(env: WebhookEnvelope, data: unknown): Promise<unknown> {
    const run = await this.prisma.agent_runs.findUnique({
      where: { id: env.run_id },
      include: { agent: true, workspace: { select: { id: true, timezone: true } } },
    });
    if (!run || run.agent_id !== env.agent_id) throw Errors.notFound('Agent run tidak ditemukan');
    if (!ACTIVE_RUN_STATUS_LIST.includes(run.status)) {
      throw Errors.conflict(ErrorCode.RUN_NOT_ACTIVE, `Run berstatus ${run.status}; hentikan pengiriman event`);
    }

    const task = await this.resolveTargetTask(run, env);
    const effects = new AfterCommit();
    const agent: Actor = { type: 'agent', id: run.agent_id, name: run.agent.name };

    const result = await this.prisma.tx(async (tx) => {
      const ctx: HandlerContext = { tx, run, env, task, agent, effects };
      await this.touchRun(ctx);
      return this.dispatchEvent(env.event_type, ctx, data);
    });
    await effects.run();
    return result;
  }

  private dispatchEvent(type: McpEventType, ctx: HandlerContext, data: unknown): Promise<unknown> {
    switch (type) {
      case 'agent.task.started':
        return this.onStarted(ctx);
      case 'agent.status.changed':
        return this.onStatusChanged(ctx, data as EventData<'agent.status.changed'>);
      case 'agent.block.appended':
        return this.onBlockAppended(ctx, data as EventData<'agent.block.appended'>);
      case 'agent.subtask.created':
        return this.onSubtaskCreated(ctx, data as EventData<'agent.subtask.created'>);
      case 'agent.comment.added':
        return this.onCommentAdded(ctx, data as EventData<'agent.comment.added'>);
      case 'agent.task.completed':
        return this.onCompleted(ctx, data as EventData<'agent.task.completed'>);
      case 'agent.task.failed':
        return this.onFailed(ctx, data as EventData<'agent.task.failed'>);
    }
  }

  /** task_id envelope harus task milik run atau turunannya. */
  private async resolveTargetTask(run: agent_runs, env: WebhookEnvelope): Promise<tasks | null> {
    const targetId = env.task_id ?? run.task_id;
    if (!targetId) return null;
    if (!run.task_id) throw Errors.business(ErrorCode.BUSINESS_RULE_VIOLATION, 'Run level project tidak dapat menulis ke task');
    if (targetId !== run.task_id) {
      const scope = await TaskHierarchy.descendants(this.prisma, run.task_id);
      if (!scope.some((n) => n.id === targetId)) throw Errors.notFound('Task berada di luar cakupan run ini');
    }
    const task = await this.prisma.tasks.findFirst({ where: { id: targetId, deleted_at: null } });
    if (!task) throw Errors.notFound('Task tidak ditemukan');
    return task;
  }

  private async touchRun({ tx, run }: HandlerContext): Promise<void> {
    const now = new Date();
    await tx.agent_runs.update({
      where: { id: run.id },
      data: { status: 'running', last_event_at: now, ...(run.started_at ? {} : { started_at: now }) },
    });
  }

  // ---------------- handlers ----------------

  private async onStarted(ctx: HandlerContext) {
    const { tx, run, agent, effects } = ctx;
    if (run.task_id) {
      const t = await tx.tasks.findUniqueOrThrow({ where: { id: run.task_id } });
      const toInProgress = run.trigger === 'assignment' && t.status === 'todo';
      await tx.tasks.update({ where: { id: run.task_id }, data: { agent_status: 'working', ...(toInProgress ? { status: 'in_progress' } : {}) } });
      this.emitTaskUpdated(effects, run.project_id, run.task_id, toInProgress ? ['status', 'agent_status'] : ['agent_status'], agent);
    }
    await this.logRun(ctx, 'agent.started');
    this.runs.emitStatus(effects, run, 'working');
    return {};
  }

  private async onStatusChanged(ctx: HandlerContext, data: EventData<'agent.status.changed'>) {
    const { tx, run, effects } = ctx;
    if (run.task_id) await tx.tasks.update({ where: { id: run.task_id }, data: { agent_status: data.status } });
    this.runs.emitStatus(effects, run, data.status, data.message);
    return {};
  }

  private async onBlockAppended(ctx: HandlerContext, data: EventData<'agent.block.appended'>) {
    const { tx, run, task, agent, effects } = ctx;
    const project = await tx.projects.findUniqueOrThrow({ where: { id: run.project_id }, select: { title: true } });
    const scope: BlockScope = { workspaceId: run.workspace_id, projectId: run.project_id, taskId: task?.id ?? null, title: task?.title ?? project.title };

    const ops: BlockOperation[] = data.operations.map((o) =>
      o.op === 'append'
        ? {
            op: 'upsert',
            mode: 'insert',
            block: { id: o.block.id ?? randomUUID(), parent_block_id: o.block.parent_block_id, block_type: o.block.block_type, content_json: o.block.content_json },
            after_block_id: o.after_block_id ?? null,
          }
        : {
            op: 'upsert',
            mode: 'update',
            block: { id: o.block.id, parent_block_id: o.block.parent_block_id, block_type: o.block.block_type, content_json: o.block.content_json },
            expected_version: o.expected_version,
          },
    );
    const result = await this.blocks.applyOperations(tx, scope, ops, agent, { requireVersionForUpdate: false });

    const appended = data.operations.filter((o) => o.op === 'append').length;
    await this.activity.log(
      tx,
      {
        workspaceId: run.workspace_id,
        projectId: run.project_id,
        entityType: task ? 'task' : 'project',
        entityId: task?.id ?? run.project_id,
        action: 'block.agent_updated',
        actor: agent,
        metadata: { run_id: run.id, block_ids: result.applied.map((a) => a.id), appended, updated: data.operations.length - appended, task_id: task?.id ?? null },
      },
      effects,
    );
    if (result.newUserMentions.length) {
      await this.notifications.notify(
        tx,
        {
          recipients: result.newUserMentions,
          workspaceId: run.workspace_id,
          type: 'comment_mention',
          title: `${run.agent.name} menyebut Anda di dokumen ${scope.title}`,
          projectId: run.project_id,
          entityType: task ? 'task' : 'project',
          entityId: task?.id ?? run.project_id,
          actor: agent,
        },
        effects,
      );
    }
    effects.add(() => this.blocks.emitChanges(scope, result, agent, null));
    return {
      applied: result.applied,
      conflicts: result.conflicts.map((c) => ({ id: c.id, server_version: c.server_version })),
    };
  }

  private async onSubtaskCreated(ctx: HandlerContext, data: EventData<'agent.subtask.created'>) {
    const { tx, run, task, agent, effects } = ctx;
    if (!task) throw Errors.business(ErrorCode.BUSINESS_RULE_VIOLATION, 'Subtask hanya dapat dibuat pada run task');
    let parent = task;
    if (data.parent_task_id && data.parent_task_id !== task.id) {
      const scope = await TaskHierarchy.descendants(tx, run.task_id as string);
      if (!scope.some((n) => n.id === data.parent_task_id)) throw Errors.notFound('parent_task_id di luar cakupan run ini');
      parent = await tx.tasks.findUniqueOrThrow({ where: { id: data.parent_task_id } });
    }

    const created: { client_ref: string | null; id: string }[] = [];
    for (const s of data.subtasks) {
      const t = await this.tasks.createInTx(
        tx,
        {
          workspaceId: run.workspace_id,
          projectId: run.project_id,
          parent,
          title: s.title,
          priority: s.priority,
          startDate: s.start_date,
          endDate: s.end_date,
          tags: s.tags,
          assignee: s.assign_to_self ? { type: 'agent', id: run.agent_id, name: run.agent.name } : null,
          actor: agent,
          triggerAssignmentEffects: false,
        },
        effects,
      );
      if (s.initial_blocks?.length) {
        const blockScope: BlockScope = { workspaceId: run.workspace_id, projectId: run.project_id, taskId: t.id, title: t.title };
        await this.blocks.applyOperations(
          tx,
          blockScope,
          s.initial_blocks.map((b) => ({ op: 'upsert', mode: 'insert', block: { id: randomUUID(), block_type: b.block_type, content_json: b.content_json } })),
          agent,
          { requireVersionForUpdate: false },
        );
      }
      created.push({ client_ref: s.client_ref ?? null, id: t.id });
    }

    effects.add(async () => {
      const dtos = await this.reader.getDtos(created.map((c) => c.id));
      for (const dto of dtos) this.realtime.toProject(run.project_id, RealtimeEvent.TASK_CREATED, { task: dto }, { actor: agent });
    });
    this.emitTaskUpdated(effects, run.project_id, parent.id, ['subtask_count'], agent);
    return { created };
  }

  private async onCommentAdded(ctx: HandlerContext, data: EventData<'agent.comment.added'>) {
    const { tx, run, task, agent, effects } = ctx;
    const entityType = task ? ('task' as const) : ('project' as const);
    const entityId = task?.id ?? run.project_id;

    let parentId: string | null = null;
    if (data.parent_comment_id) {
      const parent = await tx.comments.findFirst({
        where: { id: data.parent_comment_id, project_id: run.project_id, entity_id: entityId, deleted_at: null },
      });
      if (!parent) throw Errors.validation('parent_comment_id tidak ditemukan pada entity ini');
      parentId = parent.parent_comment_id ?? parent.id;
    }
    const { valid, users } = await this.comments.validateMentions(run.workspace_id, data.mentions ?? []);

    const comment = await tx.comments.create({
      data: {
        project_id: run.project_id,
        entity_type: entityType,
        entity_id: entityId,
        parent_comment_id: parentId,
        author_type: 'agent',
        author_agent_id: run.agent_id,
        content: data.content,
        mentions: valid as unknown as Prisma.InputJsonValue,
      },
      include: commentInclude,
    });
    const title = task?.title ?? (await tx.projects.findUniqueOrThrow({ where: { id: run.project_id }, select: { title: true } })).title;

    await this.activity.log(
      tx,
      {
        workspaceId: run.workspace_id,
        projectId: run.project_id,
        entityType,
        entityId,
        action: 'comment.created',
        actor: agent,
        metadata: { comment_id: comment.id, excerpt: excerpt(comment.content), task_id: task?.id ?? null, run_id: run.id },
      },
      effects,
    );
    // Mention agent oleh agent TIDAK memicu agent lain (pencegahan loop)
    await this.notifications.notify(
      tx,
      {
        recipients: users.map((u) => u.id),
        workspaceId: run.workspace_id,
        type: 'comment_mention',
        title: `${run.agent.name} menyebut Anda di ${title}`,
        body: excerpt(comment.content, 200),
        projectId: run.project_id,
        entityType,
        entityId,
        actor: agent,
      },
      effects,
    );
    await this.notifications.notify(
      tx,
      {
        recipients: [run.dispatched_by, this.creatorUserId(task)].filter((id) => !users.some((u) => u.id === id)),
        workspaceId: run.workspace_id,
        type: 'agent_comment',
        title: `${run.agent.name} berkomentar di ${title}`,
        body: excerpt(comment.content, 200),
        projectId: run.project_id,
        entityType,
        entityId,
        actor: agent,
      },
      effects,
    );
    const dto = this.comments.toDto(comment, new Map());
    effects.add(() => this.realtime.toProjectAndTask(run.project_id, task?.id ?? null, RealtimeEvent.COMMENT_CREATED, { comment: dto }, { actor: agent }));
    return { comment_id: comment.id };
  }

  private async onCompleted(ctx: HandlerContext, data: EventData<'agent.task.completed'>) {
    const { tx, run, agent, effects } = ctx;
    const now = new Date();
    await tx.agent_runs.update({ where: { id: run.id }, data: { status: 'completed', completed_at: now } });

    let taskTitle: string | null = null;
    let creator: string | null = null;
    if (run.task_id) {
      const isAssignment = run.trigger === 'assignment';
      const t = await tx.tasks.update({
        where: { id: run.task_id },
        data: { agent_status: 'completed', ...(isAssignment ? { status: 'done', completed_at: now } : {}) },
      });
      taskTitle = t.title;
      creator = this.creatorUserId(t);
      this.emitTaskUpdated(effects, run.project_id, run.task_id, isAssignment ? ['status', 'agent_status'] : ['agent_status'], agent);
    }
    if (run.trigger === 'prompt_block' && run.trigger_ref_id) {
      await this.runs.setPromptBlockStatus(tx, run.trigger_ref_id, 'completed', run.id, agent, effects);
    }
    await this.logRun(ctx, 'agent.completed', { summary: data.summary ?? null });
    await this.notifications.notify(
      tx,
      {
        recipients: [run.dispatched_by, creator],
        workspaceId: run.workspace_id,
        type: 'agent_task_completed',
        title: `${run.agent.name} menyelesaikan ${taskTitle ?? 'permintaan Anda'}`,
        body: data.summary ? excerpt(data.summary, 200) : null,
        projectId: run.project_id,
        entityType: run.task_id ? 'task' : 'project',
        entityId: run.task_id ?? run.project_id,
        actor: agent,
      },
      effects,
    );
    this.runs.emitStatus(effects, run, 'completed');
    return {};
  }

  private async onFailed(ctx: HandlerContext, data: EventData<'agent.task.failed'>) {
    const { tx, run, effects } = ctx;
    await this.runs.failRun(tx, run, { code: data.error_code, message: data.message, retryable: data.retryable }, effects, { systemComment: true });
    return {};
  }

  // ---------------- helpers ----------------

  private creatorUserId(task: Pick<tasks, 'created_by_type' | 'created_by_id'> | null): string | null {
    return task?.created_by_type === 'user' ? task.created_by_id : null;
  }

  private async logRun(ctx: HandlerContext, action: string, extra: Record<string, unknown> = {}): Promise<void> {
    const { tx, run, agent, effects } = ctx;
    await this.activity.log(
      tx,
      {
        workspaceId: run.workspace_id,
        projectId: run.project_id,
        entityType: run.task_id ? 'task' : 'project',
        entityId: run.task_id ?? run.project_id,
        action,
        actor: agent,
        metadata: { run_id: run.id, trigger: run.trigger, task_id: run.task_id, ...extra },
      },
      effects,
    );
  }

  private emitTaskUpdated(effects: AfterCommit, projectId: string, taskId: string, changed: string[], actor: Actor): void {
    effects.add(async () => {
      const dto = await this.reader.getDto(taskId);
      if (dto) this.realtime.toProjectAndTask(projectId, taskId, RealtimeEvent.TASK_UPDATED, { task: dto, changed_fields: changed }, { actor });
    });
  }
}
