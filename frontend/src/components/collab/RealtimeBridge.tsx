import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { CLIENT_ID } from '../../lib/api';
import { qk } from '../../lib/query-client';
import { getSocket } from '../../lib/realtime';
import type { Notification, Task } from '../../lib/types';

interface Envelope {
  origin_client_id?: string | null;
  [k: string]: any;
}

const TOAST_TYPES = new Set(['agent_task_completed', 'agent_comment', 'agent_task_failed', 'comment_mention', 'task_assigned']);

/**
 * Menghubungkan event Socket.IO ke cache TanStack Query (TASK_007 §Pemetaan event → cache).
 * Event dari tab ini sendiri (origin_client_id) diabaikan karena sudah di-update optimistik.
 */
export function RealtimeBridge() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const s = getSocket();
    const mine = (p: Envelope) => p.origin_client_id === CLIENT_ID;

    const patchTask = (task: Task) => {
      qc.setQueryData<Task[]>(qk.tasks(task.project_id), (old) => (old ? (old.some((t) => t.id === task.id) ? old.map((t) => (t.id === task.id ? task : t)) : [...old, task]) : old));
      qc.invalidateQueries({ queryKey: qk.task(task.id) });
      if (task.parent_task_id) qc.invalidateQueries({ queryKey: qk.task(task.parent_task_id) });
    };

    const handlers: Record<string, (p: Envelope) => void> = {
      'task.created': (p) => !mine(p) && p.task && patchTask(p.task),
      'task.updated': (p) => !mine(p) && p.task && patchTask(p.task),
      'tasks.rescheduled': (p) => !mine(p) && (p.tasks as Task[]).forEach(patchTask),
      'task.deleted': (p) => {
        if (mine(p)) return;
        const ids = new Set<string>(p.deleted_ids ?? []);
        qc.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) => old?.filter((t) => !ids.has(t.id)));
      },
      'tasks.reordered': (p) => !mine(p) && qc.invalidateQueries({ queryKey: ['tasks'] }),
      'comment.created': () => qc.invalidateQueries({ queryKey: ['comments'] }),
      'comment.updated': () => qc.invalidateQueries({ queryKey: ['comments'] }),
      'comment.deleted': () => qc.invalidateQueries({ queryKey: ['comments'] }),
      'activity.created': () => qc.invalidateQueries({ queryKey: ['activity'] }),
      'agent.status': (p) => {
        const status = p.status === 'idle' ? 'idle' : p.status;
        qc.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) => old?.map((t) => (t.id === p.task_id ? { ...t, agent_status: status } : t)));
        if (p.task_id) qc.invalidateQueries({ queryKey: qk.task(p.task_id) });
      },
      'notification.created': (p) => {
        const n = p.notification as Notification;
        qc.setQueryData(qk.unread, p.unread_count);
        qc.invalidateQueries({ queryKey: qk.notifications, exact: true });
        if (TOAST_TYPES.has(n.type)) {
          const fn = n.type === 'agent_task_failed' ? toast.error : toast;
          fn(n.title, {
            description: n.body ?? undefined,
            action: n.url ? { label: 'Buka', onClick: () => navigate(n.url!.replace(/\/t\/([^/]+)$/, '?p=$1')) } : undefined,
          });
        }
      },
    };

    const onReconnect = () => qc.invalidateQueries(); // event selama terputus tidak di-replay
    Object.entries(handlers).forEach(([e, h]) => s.on(e, h));
    s.io.on('reconnect', onReconnect);
    return () => {
      Object.entries(handlers).forEach(([e, h]) => s.off(e, h));
      s.io.off('reconnect', onReconnect);
    };
  }, [qc, navigate]);

  return null;
}
