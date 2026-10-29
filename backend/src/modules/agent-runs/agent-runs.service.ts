import { Injectable } from '@nestjs/common';
import { Actor } from '../../common/types/request.types';
import { Tx } from '../../database/prisma.service';
import { agent_run_trigger, agent_runs, agent_work_status, Prisma } from '../../generated/prisma/client';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { ActivityService } from '../activity/activity.service';
import { toBlockDto } from '../blocks/block.mapper';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { ACTIVE_RUN_STATUS_LIST } from '../tasks/task.mapper';
import { McpJobKind, McpQueueService } from './mcp-queue.service';

const JOB_FOR_TRIGGER: Record<agent_run_trigger, McpJobKind> = {
  assignment: 'dispatch',
  mention: 'mention',
  prompt_block: 'prompt_block',
};

export interface RunError {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface CreateRunInput {
  workspaceId: string;
  projectId: string;
  taskId: string | null;
  agentId: string;
  trigger: agent_run_trigger;
  triggerRefId?: string | null;
  dispatchedBy: string | null;
}

/** Siklus hidup agent run (M1_MCP_INTEGRATION §4). */
@Injectable()
export class AgentRunsService {
  constructor(
    private readonly queue: McpQueueService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
  ) {}

  /** Membuat run (queued) dan menjadwalkan job MCP setelah commit. */
  async createRun(tx: Tx, input: CreateRunInput, effects: AfterCommit): Promise<agent_runs> {
    const run = await tx.agent_runs.create({
      data: {
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        task_id: input.taskId,
        agent_id: input.agentId,
        trigger: input.trigger,
        trigger_ref_id: input.triggerRefId ?? null,
        dispatched_by: input.dispatchedBy,
      },
    });
    if (input.taskId) await tx.tasks.update({ where: { id: input.taskId }, data: { agent_status: 'queued' } });
    effects.add(() => this.queue.enqueue({ kind: JOB_FOR_TRIGGER[input.trigger], run_id: run.id }));
    this.emitStatus(effects, run, 'queued');
    return run;
  }

  /** Membatalkan run aktif yang cocok dengan filter dan meminta MCP menghentikan agent. */
  async cancelActive(tx: Tx, where: Prisma.agent_runsWhereInput, reason: string, actor: Actor, effects: AfterCommit): Promise<number> {
    const runs = await tx.agent_runs.findMany({ where: { ...where, status: { in: ACTIVE_RUN_STATUS_LIST } } });
    if (runs.length === 0) return 0;
    await tx.agent_runs.updateMany({ where: { id: { in: runs.map((r) => r.id) } }, data: { status: 'cancelled', completed_at: new Date() } });
    const taskIds = [...new Set(runs.map((r) => r.task_id).filter((id): id is string => !!id))];
    if (taskIds.length) {
      // agent_status kembali idle hanya jika tidak ada run lain yang masih aktif di task tersebut
      const stillActive = await tx.agent_runs.findMany({
        where: { task_id: { in: taskIds }, status: { in: ACTIVE_RUN_STATUS_LIST } },
        select: { task_id: true },
      });
      const busy = new Set(stillActive.map((r) => r.task_id));
      const idleIds = taskIds.filter((id) => !busy.has(id));
      if (idleIds.length) await tx.tasks.updateMany({ where: { id: { in: idleIds } }, data: { agent_status: 'idle' } });
    }

    for (const run of runs) {
      await this.activity.log(
        tx,
        {
          workspaceId: run.workspace_id,
          projectId: run.project_id,
          entityType: 'task',
          entityId: run.task_id ?? run.project_id,
          action: 'agent.cancelled',
          actor,
          metadata: { run_id: run.id, trigger: run.trigger, reason, task_id: run.task_id },
        },
        effects,
      );
      if (run.status !== 'queued' || run.mcp_run_id) {
        effects.add(() => this.queue.enqueue({ kind: 'cancel', run_id: run.id, mcp_run_id: run.mcp_run_id, reason }));
      }
      this.emitStatus(effects, run, 'idle');
    }
    return runs.length;
  }

  /** Menandai run gagal + notifikasi + (opsional) komentar sistem di task. */
  async failRun(tx: Tx, run: agent_runs, error: RunError, effects: AfterCommit, opts: { systemComment?: boolean } = {}): Promise<void> {
    const updated = await tx.agent_runs.updateMany({
      where: { id: run.id, status: { in: ACTIVE_RUN_STATUS_LIST } },
      data: { status: 'failed', completed_at: new Date(), last_error: error as unknown as Prisma.InputJsonValue },
    });
    if (updated.count === 0) return;

    const agent = await tx.agents.findUnique({ where: { id: run.agent_id }, select: { name: true } });
    const agentActor: Actor = { type: 'agent', id: run.agent_id, name: agent?.name };
    let taskTitle: string | null = null;
    if (run.task_id) {
      const task = await tx.tasks.update({ where: { id: run.task_id }, data: { agent_status: 'failed' }, select: { title: true } });
      taskTitle = task.title;
    }
    if (run.trigger === 'prompt_block' && run.trigger_ref_id) {
      await this.setPromptBlockStatus(tx, run.trigger_ref_id, 'failed', run.id, agentActor, effects);
    }
    if (opts.systemComment && run.task_id) {
      const comment = await tx.comments.create({
        data: {
          project_id: run.project_id,
          entity_type: 'task',
          entity_id: run.task_id,
          author_type: 'system',
          content: `${agent?.name ?? 'Agent'} gagal mengerjakan task: ${error.message} (${error.code})`,
        },
      });
      const taskId = run.task_id;
      effects.add(() =>
        this.realtime.toProjectAndTask(run.project_id, taskId, RealtimeEvent.COMMENT_CREATED, {
          comment: {
            id: comment.id,
            project_id: comment.project_id,
            entity_type: comment.entity_type,
            entity_id: comment.entity_id,
            parent_comment_id: null,
            author: { type: 'system', id: null, name: 'Sistem', avatar_url: null },
            content: comment.content,
            mentions: [],
            edited_at: null,
            created_at: comment.created_at,
            reply_count: 0,
          },
        }),
      );
    }
    await this.activity.log(
      tx,
      {
        workspaceId: run.workspace_id,
        projectId: run.project_id,
        entityType: 'task',
        entityId: run.task_id ?? run.project_id,
        action: 'agent.failed',
        actor: agentActor,
        metadata: { run_id: run.id, trigger: run.trigger, error, task_id: run.task_id },
      },
      effects,
    );
    await this.notifications.notify(
      tx,
      {
        recipients: [run.dispatched_by],
        workspaceId: run.workspace_id,
        type: 'agent_task_failed',
        title: `${agent?.name ?? 'Agent'} gagal mengerjakan ${taskTitle ?? 'permintaan Anda'}`,
        body: error.message,
        projectId: run.project_id,
        entityType: run.task_id ? 'task' : 'project',
        entityId: run.task_id ?? run.project_id,
        actor: agentActor,
      },
      effects,
    );
    this.emitStatus(effects, run, 'failed', error.message);
  }

  /** Update props.status pada blok aiPrompt (P1). */
  async setPromptBlockStatus(tx: Tx, blockId: string, status: string, runId: string, actor: Actor, effects: AfterCommit): Promise<void> {
    const block = await tx.document_blocks.findFirst({ where: { id: blockId, deleted_at: null } });
    if (!block || block.block_type !== 'aiPrompt') return;
    const content = (block.content_json ?? {}) as { props?: Record<string, unknown> };
    const updated = await tx.document_blocks.update({
      where: { id: blockId },
      data: {
        content_json: { ...content, props: { ...(content.props ?? {}), status, last_run_id: runId } } as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    effects.add(() =>
      this.realtime.toTaskOrProject(updated.project_id, updated.task_id, RealtimeEvent.BLOCK_UPSERTED, {
        task_id: updated.task_id,
        project_id: updated.project_id,
        blocks: [toBlockDto(updated, { type: updated.last_edited_by_type, id: updated.last_edited_by_id, name: actor.name ?? '', avatar_url: null })],
      }, { actor }),
    );
  }

  emitStatus(effects: AfterCommit, run: Pick<agent_runs, 'id' | 'project_id' | 'task_id' | 'agent_id'>, status: agent_work_status | 'idle', message?: string): void {
    effects.add(() =>
      this.realtime.toProjectAndTask(run.project_id, run.task_id, RealtimeEvent.AGENT_STATUS, {
        task_id: run.task_id,
        agent_id: run.agent_id,
        run_id: run.id,
        status,
        message: message ?? null,
      }),
    );
  }
}
