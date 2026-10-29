import { useActivity } from '../../hooks/queries';
import { statusMeta } from '../../lib/constants';
import { formatRange } from '../../lib/dates';
import type { Activity, TaskStatus } from '../../lib/types';
import { formatDateTime, timeAgo } from '../../lib/utils';
import { ActorAvatar } from '../ui/avatar';
import { Spinner } from '../ui/misc';

const FIELD_LABEL: Record<string, string> = { title: 'judul', priority: 'prioritas', tags: 'tag', is_milestone: 'milestone' };

/** Kalimat aktivitas (katalog action di TASK_002). */
export function describeActivity(a: Activity): string {
  const m = a.metadata ?? {};
  switch (a.action) {
    case 'project.created':
      return 'membuat project ini';
    case 'project.updated':
      return 'mengubah detail project';
    case 'task.created':
      return `membuat task “${m.title ?? ''}”`;
    case 'task.updated':
      return `mengubah ${Object.keys(m.changes ?? {}).map((k) => FIELD_LABEL[k] ?? k).join(', ')}`;
    case 'task.status_changed':
      return `mengubah status dari ${statusMeta(m.from as TaskStatus).label} ke ${statusMeta(m.to as TaskStatus).label}`;
    case 'task.assigned':
      return m.to ? `menugaskan ke ${m.to.name ?? (m.to.type === 'agent' ? 'agent' : 'user')}` : 'menghapus assignee';
    case 'task.rescheduled':
      return `menjadwalkan ulang ke ${formatRange(m.to?.start_date ?? null, m.to?.end_date ?? null) || 'tanpa tanggal'}${m.shifted_count ? ` (${m.shifted_count} subtask ikut digeser)` : ''}`;
    case 'task.moved':
      return 'memindahkan task ke parent lain';
    case 'task.deleted':
      return `menghapus task “${m.title ?? ''}”`;
    case 'task.content_edited':
      return 'mengedit konten';
    case 'block.agent_updated':
      return `memperbarui konten (${(m.block_ids ?? []).length} blok)`;
    case 'comment.created':
      return `berkomentar: “${m.excerpt ?? ''}”`;
    case 'agent.estimated':
      return `mengestimasi pengerjaan ${formatRange(m.start_date, m.end_date)}`;
    case 'agent.estimation_failed':
      return 'gagal memberikan estimasi waktu';
    case 'agent.dispatched':
      return 'mengirim task ke agent';
    case 'agent.started':
      return 'mulai mengerjakan';
    case 'agent.completed':
      return 'menyelesaikan pekerjaan';
    case 'agent.failed':
      return `gagal: ${m.error?.message ?? ''}`;
    case 'agent.cancelled':
      return 'menghentikan agent';
    default:
      return a.action;
  }
}

export function ActivityFeed({ type, id }: { type: 'task' | 'project'; id: string }) {
  const { data, isLoading } = useActivity(type, id);
  if (isLoading) return <Spinner />;
  if (!data?.length) return <div className="text-[13px] text-ink-faint">Belum ada aktivitas.</div>;
  return (
    <ol className="space-y-2.5">
      {data.map((a) => (
        <li key={a.id} className="flex items-start gap-2 text-[13px]">
          <ActorAvatar type={a.actor?.type ?? 'system'} name={a.actor?.name} size={18} className="mt-0.5" />
          <div className="min-w-0">
            <span className="font-medium">{a.actor?.name ?? 'Sistem'}</span> <span className="text-ink-soft">{describeActivity(a)}</span>
            <div className="text-[11px] text-ink-faint" title={formatDateTime(a.created_at)}>
              {timeAgo(a.created_at)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
