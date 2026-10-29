import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { McpPayloadBuilder } from '../agent-runs/mcp-payload.builder';
import { BlocksService } from '../blocks/blocks.service';
import { commentInclude, CommentsService } from '../comments/comments.service';
import { TaskHierarchy } from '../tasks/task-hierarchy.repository';
import { ACTIVE_RUN_STATUS_LIST } from '../tasks/task.mapper';

interface ContextQueryInput {
  query: string;
  scope: 'project' | 'task';
  task_id?: string | null;
  top_k: number;
}

/** Agent API: akses baca MCP Server, di-scope ke project milik run yang aktif (M1_MCP_INTEGRATION §6). */
@Injectable()
export class AgentApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payloads: McpPayloadBuilder,
    private readonly blocks: BlocksService,
    private readonly comments: CommentsService,
  ) {}

  private async activeRun(runId: string) {
    const run = await this.prisma.agent_runs.findUnique({
      where: { id: runId },
      include: {
        agent: { select: { id: true, name: true, handle: true, mcp_agent_key: true } },
        task: true,
        dispatcher: { select: { id: true, display_name: true } },
      },
    });
    if (!run) throw Errors.notFound('Agent run tidak ditemukan');
    if (!ACTIVE_RUN_STATUS_LIST.includes(run.status)) throw Errors.conflict(ErrorCode.RUN_NOT_ACTIVE, `Run berstatus ${run.status}`);
    return run;
  }

  async run(runId: string) {
    const run = await this.activeRun(runId);
    const triggerComment =
      run.trigger === 'mention' && run.trigger_ref_id
        ? await this.prisma.comments.findFirst({ where: { id: run.trigger_ref_id, deleted_at: null }, include: commentInclude })
        : null;
    return {
      id: run.id,
      trigger: run.trigger,
      status: run.status,
      agent: run.agent,
      workspace_id: run.workspace_id,
      project_id: run.project_id,
      task: run.task && !run.task.deleted_at ? this.payloads.taskSnapshot(run.task, run.workspace_id) : null,
      dispatched_by: run.dispatcher ? { user_id: run.dispatcher.id, display_name: run.dispatcher.display_name } : null,
      trigger_comment: triggerComment ? this.comments.toDto(triggerComment, new Map()) : null,
    };
  }

  async task(runId: string, taskId: string) {
    const run = await this.activeRun(runId);
    const task = await this.prisma.tasks.findFirst({ where: { id: taskId, project_id: run.project_id, deleted_at: null } });
    if (!task) throw Errors.notFound('Task tidak ditemukan di project run ini');
    const [blocks, subtasks, comments] = await Promise.all([
      this.blocks.tree(run.project_id, task.id),
      this.prisma.tasks.findMany({
        where: { parent_task_id: task.id, deleted_at: null },
        select: { id: true, title: true, status: true, depth: true, start_date: true, end_date: true },
        orderBy: { order_index: 'asc' },
      }),
      this.prisma.comments.findMany({
        where: { entity_type: 'task', entity_id: task.id, deleted_at: null },
        include: commentInclude,
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
    ]);
    return {
      task: this.payloads.taskSnapshot(task, run.workspace_id),
      blocks,
      subtasks,
      comments: comments.reverse().map((c) => this.comments.toDto(c, new Map())),
    };
  }

  async projectBrief(runId: string) {
    const run = await this.activeRun(runId);
    return { project_id: run.project_id, blocks: await this.blocks.tree(run.project_id, null) };
  }

  /** Full-text search PostgreSQL atas plain_text blok di project run. */
  async contextQuery(runId: string, input: ContextQueryInput) {
    const run = await this.activeRun(runId);
    let taskFilter = Prisma.empty;
    if (input.scope === 'task') {
      const rootTask = input.task_id ?? run.task_id;
      if (!rootTask) throw Errors.validation('task_id wajib untuk scope task');
      const owner = await this.prisma.tasks.findFirst({ where: { id: rootTask, project_id: run.project_id, deleted_at: null }, select: { id: true } });
      if (!owner) throw Errors.notFound('Task tidak ditemukan di project run ini');
      const ids = (await TaskHierarchy.descendants(this.prisma, rootTask)).map((n) => n.id);
      taskFilter = Prisma.sql`AND b.task_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`;
    }

    type Row = { block_id: string; task_id: string | null; task_title: string | null; block_type: string; text: string; rank: number };
    let rows: Row[];
    if (input.query.trim()) {
      rows = await this.prisma.$queryRaw<Row[]>`
        SELECT b.id::text AS block_id, b.task_id::text AS task_id, t.title AS task_title, b.block_type,
               left(b.plain_text, 2000) AS text, ts_rank(b.search_vector, q)::float AS rank
        FROM document_blocks b
        LEFT JOIN tasks t ON t.id = b.task_id
        CROSS JOIN websearch_to_tsquery('simple', ${input.query}) AS q
        WHERE b.project_id = ${run.project_id}::uuid
          AND b.deleted_at IS NULL
          AND (b.task_id IS NULL OR t.deleted_at IS NULL)
          AND b.search_vector @@ q
          ${taskFilter}
        ORDER BY rank DESC
        LIMIT ${input.top_k}`;
    } else {
      const brief = await this.payloads.contextBlocks(run.project_id, null);
      rows = brief
        .filter((b) => b.plain_text)
        .slice(0, input.top_k)
        .map((b) => ({ block_id: b.id, task_id: null, task_title: null, block_type: b.block_type, text: b.plain_text.slice(0, 2000), rank: 0 }));
    }
    return {
      results: rows.map((r) => ({ ...r, source: r.task_id ? 'task' : 'project_brief', rank: Number(r.rank) })),
    };
  }
}
