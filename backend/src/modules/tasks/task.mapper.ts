import { agent_run_status, Prisma } from '../../generated/prisma/client';
import { toDateString } from '../../utils/helpers/date.util';
import { ActorDto } from '../core/actor.service';

export const ACTIVE_RUN_STATUS_LIST: agent_run_status[] = ['queued', 'dispatched', 'running'];

/** Relasi yang selalu dimuat untuk membentuk Task DTO. */
export const taskInclude = {
  assignee_user: { select: { id: true, display_name: true, avatar_url: true } },
  assignee_agent: { select: { id: true, name: true, avatar_url: true } },
  agent_runs: {
    where: { status: { in: ACTIVE_RUN_STATUS_LIST } },
    select: { id: true, status: true, trigger: true },
    orderBy: { created_at: 'desc' },
    take: 1,
  },
  _count: { select: { children: { where: { deleted_at: null } } } },
} satisfies Prisma.tasksInclude;

export type TaskWithRelations = Prisma.tasksGetPayload<{ include: typeof taskInclude }>;

export function assigneeDto(t: TaskWithRelations) {
  if (t.assignee_type === 'user' && t.assignee_user) {
    return { type: 'user' as const, id: t.assignee_user.id, name: t.assignee_user.display_name, avatar_url: t.assignee_user.avatar_url };
  }
  if (t.assignee_type === 'agent' && t.assignee_agent) {
    return { type: 'agent' as const, id: t.assignee_agent.id, name: t.assignee_agent.name, avatar_url: t.assignee_agent.avatar_url };
  }
  return null;
}

/** Task DTO standar (TASK_002 §Objek Respons Standar). */
export function toTaskDto(t: TaskWithRelations, createdBy: ActorDto | null) {
  const run = t.agent_runs[0];
  return {
    id: t.id,
    project_id: t.project_id,
    parent_task_id: t.parent_task_id,
    depth: t.depth,
    title: t.title,
    status: t.status,
    priority: t.priority,
    assignee: assigneeDto(t),
    start_date: toDateString(t.start_date),
    end_date: toDateString(t.end_date),
    is_milestone: t.is_milestone,
    tags: t.tags,
    order_index: t.order_index,
    agent_status: t.agent_status,
    active_run: run ? { id: run.id, status: run.status, trigger: run.trigger } : null,
    subtask_count: t._count.children,
    created_by: createdBy ? { type: createdBy.type, id: createdBy.id, name: createdBy.name } : null,
    completed_at: t.completed_at,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

export type TaskDto = ReturnType<typeof toTaskDto>;
