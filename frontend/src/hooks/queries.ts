import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { qk } from '../lib/query-client';
import type {
  Activity,
  Agent,
  Assignees,
  Block,
  Comment,
  Member,
  Notification,
  Page,
  Project,
  Task,
  TaskDetail,
  TaskStatus,
  WorkspaceSummary,
} from '../lib/types';

// ======================= Queries =======================

export const useWorkspaces = () =>
  useQuery({ queryKey: ['workspaces'], queryFn: () => api<Page<WorkspaceSummary & { owner_id: string }>>('/workspaces').then((r) => r.data) });

export const useProjects = (ws: string | undefined) =>
  useQuery({ queryKey: qk.projects(ws ?? ''), enabled: !!ws, queryFn: () => api<Page<Project>>(`/workspaces/${ws}/projects`).then((r) => r.data) });

export const useProject = (id: string | undefined) =>
  useQuery({ queryKey: qk.project(id ?? ''), enabled: !!id, queryFn: () => api<Project>(`/projects/${id}`) });

/** Semua task project (termasuk subtask) — satu sumber data untuk Tabel, Board & Timeline. */
export const useTasks = (projectId: string | undefined) =>
  useQuery({
    queryKey: qk.tasks(projectId ?? ''),
    enabled: !!projectId,
    queryFn: () => api<Page<Task>>(`/projects/${projectId}/tasks`, { query: { view: 'list', limit: 2000 } }).then((r) => r.data),
  });

export const useTask = (id: string | null | undefined) =>
  useQuery({ queryKey: qk.task(id ?? ''), enabled: !!id, queryFn: () => api<TaskDetail>(`/tasks/${id}`) });

export const useBlocks = (projectId: string, taskId: string | null) =>
  useQuery({
    queryKey: qk.blocks(projectId, taskId),
    queryFn: () => api<{ blocks: Block[] }>(taskId ? `/tasks/${taskId}/blocks` : `/projects/${projectId}/brief/blocks`).then((r) => r.blocks),
    staleTime: Infinity,
  });

export const useComments = (type: 'task' | 'project', id: string) =>
  useQuery({ queryKey: qk.comments(type, id), queryFn: () => api<Page<Comment>>('/comments', { query: { entity_type: type, entity_id: id, limit: 100 } }).then((r) => r.data) });

export const useActivity = (type: 'task' | 'project', id: string) =>
  useQuery({ queryKey: qk.activity(type, id), queryFn: () => api<Page<Activity>>(`/${type === 'task' ? 'tasks' : 'projects'}/${id}/activity`, { query: { limit: 100 } }).then((r) => r.data) });

export const useNotifications = () =>
  useQuery({ queryKey: qk.notifications, queryFn: () => api<Page<Notification>>('/notifications', { query: { limit: 50 } }).then((r) => r.data) });

export const useUnreadCount = () => useQuery({ queryKey: qk.unread, queryFn: () => api<{ count: number }>('/notifications/unread-count').then((r) => r.count) });

export const useMembers = (ws: string | undefined) =>
  useQuery({ queryKey: qk.members(ws ?? ''), enabled: !!ws, queryFn: () => api<Page<Member>>(`/workspaces/${ws}/members`).then((r) => r.data) });

export const useAgents = (ws: string | undefined, includeInactive = false) =>
  useQuery({
    queryKey: [...qk.agents(ws ?? ''), includeInactive],
    enabled: !!ws,
    queryFn: () => api<Page<Agent>>(`/workspaces/${ws}/agents`, { query: { include_inactive: includeInactive } }).then((r) => r.data),
  });

export const fetchAssignees = (ws: string, q: string) => api<Assignees>(`/workspaces/${ws}/assignees`, { query: { q } });

export const useAssignees = (ws: string | undefined, q = '') =>
  useQuery({ queryKey: qk.assignees(ws ?? '', q), enabled: !!ws, queryFn: () => fetchAssignees(ws as string, q), staleTime: 60_000 });

// ======================= Mutations: tasks =======================

export type TaskPatch = Partial<Pick<Task, 'title' | 'status' | 'priority' | 'start_date' | 'end_date' | 'is_milestone' | 'tags'>> & {
  assignee?: { type: 'user' | 'agent'; id: string } | null;
};

function patchTasksCache(qc: ReturnType<typeof useQueryClient>, projectId: string, fn: (t: Task) => Task) {
  qc.setQueryData<Task[]>(qk.tasks(projectId), (old) => old?.map(fn));
}

/** Update task dengan optimistic update di cache bersama (semua view langsung konsisten). */
export function useUpdateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => api<Task>(`/tasks/${id}`, { method: 'PATCH', body: patch }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.tasks(projectId) });
      const prev = qc.getQueryData<Task[]>(qk.tasks(projectId));
      const { assignee: _a, ...simple } = patch;
      patchTasksCache(qc, projectId, (t) => (t.id === id ? { ...t, ...simple } : t));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.tasks(projectId), ctx.prev),
    onSuccess: (task) => {
      patchTasksCache(qc, projectId, (t) => (t.id === task.id ? task : t));
      qc.invalidateQueries({ queryKey: qk.task(task.id) });
    },
  });
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ parentId, body }: { parentId?: string | null; body: TaskPatch & { title: string; after_task_id?: string } }) =>
      api<Task>(parentId ? `/tasks/${parentId}/subtasks` : `/projects/${projectId}/tasks`, { method: 'POST', body }),
    onSuccess: (task) => {
      qc.setQueryData<Task[]>(qk.tasks(projectId), (old) => (old && !old.some((t) => t.id === task.id) ? [...old, task] : old));
      if (task.parent_task_id) {
        patchTasksCache(qc, projectId, (t) => (t.id === task.parent_task_id ? { ...t, subtask_count: t.subtask_count + 1 } : t));
        qc.invalidateQueries({ queryKey: qk.task(task.parent_task_id) });
      }
    },
  });
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks(projectId) }),
  });
}

export function useReorderTasks(projectId: string) {
  return useMutation({
    mutationFn: (body: { status: TaskStatus; ordered_task_ids: string[] }) =>
      api('/tasks/reorder', { method: 'PATCH', body: { project_id: projectId, ...body } }),
  });
}

export function useReschedule(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; start_date: string | null; end_date: string | null; cascade?: 'shift' | 'none' }) =>
      api<{ updated: Task[]; shifted_count: number }>(`/tasks/${id}/reschedule`, { method: 'PATCH', body }),
    onSuccess: ({ updated }) => {
      const byId = new Map(updated.map((t) => [t.id, t]));
      patchTasksCache(qc, projectId, (t) => byId.get(t.id) ?? t);
    },
    // Error 409 CASCADE_DECISION_REQUIRED ditangani pemanggil (dialog), jangan toast otomatis
    onError: () => undefined,
  });
}

export function useAgentRunAction(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'retry' | 'cancel' }) => api(`/tasks/${id}/agent-run/${action}`, { method: 'POST' }),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: qk.tasks(projectId) });
      qc.invalidateQueries({ queryKey: qk.task(id) });
    },
  });
}

// ======================= Mutations: projects =======================

export function useCreateProject(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; icon?: string | null }) => api<Project>('/projects', { method: 'POST', body: { workspace_id: ws, ...body } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects(ws) }),
  });
}

export function useUpdateProject(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; icon?: string | null; description?: string | null }) =>
      api<Project>(`/projects/${id}`, { method: 'PATCH', body }),
    onSuccess: (p) => {
      qc.setQueryData<Project>(qk.project(p.id), (old) => (old ? { ...old, ...p } : p));
      qc.invalidateQueries({ queryKey: qk.projects(ws) });
    },
  });
}

export function useDeleteProject(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects(ws) }),
  });
}

// ======================= Mutations: comments & notifications =======================

export function useCreateComment(type: 'task' | 'project', id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { content: string; mentions: { type: 'user' | 'agent'; id: string }[]; parent_comment_id?: string | null }) =>
      api<Comment & { warnings: string[] }>('/comments', { method: 'POST', body: { entity_type: type, entity_id: id, ...body } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.comments(type, id) }),
  });
}

export function useDeleteComment(type: 'task' | 'project', id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api(`/comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.comments(type, id) }),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | 'all') => (id === 'all' ? api('/notifications/read-all', { method: 'POST' }) : api(`/notifications/${id}/read`, { method: 'PATCH' })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}
