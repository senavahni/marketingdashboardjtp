import { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, errorMessage } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
    mutations: {
      onError: (err) => toast.error(errorMessage(err)),
    },
  },
});

/** Query key terpusat agar invalidasi konsisten di seluruh aplikasi. */
export const qk = {
  me: ['me'] as const,
  projects: (ws: string) => ['projects', ws] as const,
  project: (id: string) => ['project', id] as const,
  tasks: (projectId: string) => ['tasks', projectId] as const,
  task: (id: string) => ['task', id] as const,
  blocks: (projectId: string, taskId: string | null) => ['blocks', projectId, taskId ?? 'brief'] as const,
  comments: (type: string, id: string) => ['comments', type, id] as const,
  activity: (type: 'task' | 'project', id: string) => ['activity', type, id] as const,
  notifications: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
  members: (ws: string) => ['members', ws] as const,
  agents: (ws: string) => ['agents', ws] as const,
  assignees: (ws: string, q: string) => ['assignees', ws, q] as const,
};
