import { AlertTriangle, Construction, FilterX, Inbox, Lock, PlugZap } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError, errorMessage } from '../../lib/api';
import { ListSkeleton } from '../ui/misc';

export type StateKind = 'loading' | 'empty' | 'filtered-empty' | 'error' | 'forbidden' | 'disabled' | 'coming-soon';

type Props = {
  kind: StateKind;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  error?: unknown;
};

const DEFAULTS: Record<Exclude<StateKind, 'loading'>, { icon: ReactNode; title: string }> = {
  empty: { icon: <Inbox size={22} />, title: 'Belum ada data' },
  'filtered-empty': { icon: <FilterX size={22} />, title: 'Tidak ada yang cocok dengan filter ini' },
  error: { icon: <AlertTriangle size={22} />, title: 'Data tidak dapat dimuat' },
  forbidden: { icon: <Lock size={22} />, title: 'Anda tidak memiliki akses' },
  disabled: { icon: <PlugZap size={22} />, title: 'Market Intelligence belum diaktifkan' },
  'coming-soon': { icon: <Construction size={22} />, title: 'Layar ini sedang dibangun' },
};

/** Satu komponen untuk state generik (V1_TASK_003_UIUX §C.8/§E): tidak ada layar kosong tanpa alasan. */
export function StateView({ kind, title, children, action, error }: Props) {
  if (kind === 'loading') return <ListSkeleton rows={6} />;
  const meta = DEFAULTS[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#D5DBE3] bg-white/60 px-6 py-12 text-center">
      <span aria-hidden className={kind === 'error' ? 'text-[#C2410C]' : 'text-[#5B6474]'}>
        {meta.icon}
      </span>
      <p className="text-[15px] font-semibold text-[#0F2340]">{title ?? meta.title}</p>
      {kind === 'error' && error !== undefined && (
        <p className="max-w-md text-[13px] text-ink-soft">
          {error instanceof ApiError && <code className="mr-1 rounded bg-stone-100 px-1">{error.code}</code>}
          {errorMessage(error)}
        </p>
      )}
      {children && <div className="max-w-md text-[13px] leading-relaxed text-ink-soft">{children}</div>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Pilih state dari error query: 503 FEATURE_DISABLED → disabled, 403 → forbidden, lainnya → error. */
export function stateFromError(error: unknown): StateKind {
  if (error instanceof ApiError && error.code === 'FEATURE_DISABLED') return 'disabled';
  if (error instanceof ApiError && error.status === 403) return 'forbidden';
  return 'error';
}
