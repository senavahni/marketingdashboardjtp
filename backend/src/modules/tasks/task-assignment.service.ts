import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { Actor } from '../../common/types/request.types';
import { PrismaService, Tx } from '../../database/prisma.service';
import { tasks } from '../../generated/prisma/client';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { ActivityService } from '../activity/activity.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssigneeInput } from './tasks.schemas';

export interface ResolvedAssignee {
  type: 'user' | 'agent';
  id: string;
  name: string;
}

export interface AssigneeColumns {
  assignee_type: 'user' | 'agent' | null;
  assignee_user_id: string | null;
  assignee_agent_id: string | null;
}

/** Logika assignee (TASK_002 §Logika Assignee): validasi, notifikasi, dan dispatch/cancel agent. */
@Injectable()
export class TaskAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: AgentRunsService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
  ) {}

  /** Validasi assignee baru di workspace (user: anggota non-viewer; agent: aktif). */
  async resolve(workspaceId: string, input: AssigneeInput | undefined): Promise<ResolvedAssignee | null | undefined> {
    if (input === undefined) return undefined;
    if (input === null) return null;
    if (input.type === 'user') {
      const m = await this.prisma.workspace_members.findUnique({
        where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: input.id } },
        include: { user: { select: { display_name: true, is_active: true } } },
      });
      if (!m || !m.user.is_active || m.role === 'viewer') {
        throw Errors.business(ErrorCode.INVALID_ASSIGNEE, 'Assignee harus anggota workspace dengan role selain Viewer', { field: 'assignee' });
      }
      return { type: 'user', id: input.id, name: m.user.display_name };
    }
    const agent = await this.prisma.agents.findFirst({ where: { id: input.id, workspace_id: workspaceId, deleted_at: null } });
    if (!agent) throw Errors.business(ErrorCode.INVALID_ASSIGNEE, 'Agent tidak ditemukan di workspace ini', { field: 'assignee' });
    if (!agent.is_active) throw Errors.business(ErrorCode.AGENT_INACTIVE, `Agent ${agent.name} tidak aktif`, { field: 'assignee' });
    return { type: 'agent', id: agent.id, name: agent.name };
  }

  columns(a: ResolvedAssignee | null): AssigneeColumns {
    return {
      assignee_type: a?.type ?? null,
      assignee_user_id: a?.type === 'user' ? a.id : null,
      assignee_agent_id: a?.type === 'agent' ? a.id : null,
    };
  }

  static same(task: Pick<tasks, 'assignee_type' | 'assignee_user_id' | 'assignee_agent_id'>, a: ResolvedAssignee | null): boolean {
    if (!a) return task.assignee_type === null;
    return a.type === 'user' ? task.assignee_user_id === a.id : task.assignee_agent_id === a.id;
  }

  /**
   * Dipanggil di dalam transaksi SETELAH kolom assignee ditulis.
   * previous = kondisi sebelum perubahan; task = kondisi sesudah.
   */
  async afterChange(
    tx: Tx,
    ctx: { workspaceId: string; actor: Actor },
    previous: Pick<tasks, 'assignee_type' | 'assignee_user_id' | 'assignee_agent_id'> | null,
    task: tasks,
    next: ResolvedAssignee | null,
    effects: AfterCommit,
  ): Promise<void> {
    // Assignee lama adalah agent → hentikan run aktif
    if (previous?.assignee_type === 'agent' && previous.assignee_agent_id) {
      await this.runs.cancelActive(tx, { task_id: task.id, agent_id: previous.assignee_agent_id, trigger: 'assignment' }, 'unassigned', ctx.actor, effects);
    }

    if (next?.type === 'user') {
      await this.notifications.notify(
        tx,
        {
          recipients: [next.id],
          workspaceId: ctx.workspaceId,
          type: 'task_assigned',
          title: `${ctx.actor.name ?? 'Seseorang'} menugaskan Anda: ${task.title}`,
          projectId: task.project_id,
          entityType: 'task',
          entityId: task.id,
          actor: ctx.actor,
        },
        effects,
      );
    }

    if (next?.type === 'agent') {
      await this.runs.createRun(
        tx,
        {
          workspaceId: ctx.workspaceId,
          projectId: task.project_id,
          taskId: task.id,
          agentId: next.id,
          trigger: 'assignment',
          dispatchedBy: ctx.actor.type === 'user' ? ctx.actor.id : null,
        },
        effects,
      );
    }

    if (previous) {
      await this.activity.log(
        tx,
        {
          workspaceId: ctx.workspaceId,
          projectId: task.project_id,
          entityType: 'task',
          entityId: task.id,
          action: 'task.assigned',
          actor: ctx.actor,
          metadata: {
            from: previous.assignee_type ? { type: previous.assignee_type, id: previous.assignee_user_id ?? previous.assignee_agent_id } : null,
            to: next ? { type: next.type, id: next.id, name: next.name } : null,
          },
        },
        effects,
      );
    }
  }
}
