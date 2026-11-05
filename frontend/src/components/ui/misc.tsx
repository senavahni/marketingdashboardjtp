import { Loader2 } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { AGENT_STATUS, priorityMeta, statusMeta } from '../../lib/constants';
import type { AgentStatus, TaskPriority, TaskStatus } from '../../lib/types';
import { cn } from '../../lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 role="status" aria-label="Memuat" className={cn('animate-spin text-ink-faint', className)} size={16} />;
}

export function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" style={style} className={cn('animate-pulse rounded bg-hover-strong motion-reduce:animate-none', className)} />;
}

/** Kerangka tabel/daftar saat data view dimuat (menggantikan spinner layar penuh). */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Memuat data" className="flex-1">
      <Skeleton className="mb-3 h-8 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-9 items-center gap-4 border-b border-line">
          <Skeleton className="h-3.5" style={{ width: `${32 + ((i * 17) % 28)}%` }} />
          <Skeleton className="ml-auto h-3.5 w-20" />
          <Skeleton className="hidden h-3.5 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}

export function StatusChip({ status }: { status: TaskStatus }) {
  const m = statusMeta(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[12px] whitespace-nowrap', m.chip)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: TaskPriority }) {
  if (priority === 'none') return null;
  const m = priorityMeta(priority);
  return <span className={cn('rounded px-1.5 py-0.5 text-[12px] whitespace-nowrap', m.chip)}>{m.label}</span>;
}

export function TagChip({ tag }: { tag: string }) {
  return <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[12px] text-stone-700">{tag}</span>;
}

/** Badge status agent: Menunggu / Thinking… / Working… / Done / Gagal. */
export function AgentStatusBadge({ status, className }: { status: AgentStatus; className?: string }) {
  const meta = AGENT_STATUS[status];
  if (!meta) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', meta.className, className)}>
      {meta.label}
      {meta.animated && (
        <span className="dot-pulse">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      )}
    </span>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-16 text-center text-[13px] text-ink-soft">
      {icon && (
        <div aria-hidden="true" className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-sidebar text-3xl">
          {icon}
        </div>
      )}
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {children && <div className="flex max-w-md flex-col items-center gap-2 leading-relaxed">{children}</div>}
    </div>
  );
}
