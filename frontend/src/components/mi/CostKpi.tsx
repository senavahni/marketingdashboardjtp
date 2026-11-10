import { AlertTriangle, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatUsd } from '../../lib/intel-format';
import { formatDateTime } from '../../lib/utils';
import { Popover } from '../ui/popover';

/** "estimasi $0,15 · aktual $0,09" + bar tipis; melewati estimasi → ⚠ (§C.8). */
export function CostPair({ estimate, actual, budget }: { estimate: number | null | undefined; actual: number | null | undefined; budget?: number | null }) {
  const est = estimate ?? null;
  const act = actual ?? 0;
  const over = est !== null && act > est;
  const cap = budget ?? est;
  const pct = cap ? Math.min(100, (act / cap) * 100) : 0;
  return (
    <div className="min-w-[10rem] text-[12px]">
      <div className="flex items-center gap-1 text-ink-soft">
        <span>est. {est === null ? '—' : formatUsd(est)}</span>
        <span aria-hidden>·</span>
        <span className="font-medium text-[#0F2340]">aktual {formatUsd(act)}</span>
        {over && <AlertTriangle size={12} className="text-[#B45309]" aria-label="Melewati estimasi" />}
      </div>
      {cap ? (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#EDF0F4]" aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? '#B45309' : '#0E9384' }} />
        </div>
      ) : null}
      {budget != null && <div className="mt-0.5 text-[11px] text-ink-faint">batas {formatUsd(budget)}</div>}
    </div>
  );
}

type KpiProps = {
  label: string;
  value: number | null;
  unit?: string;
  delta?: number | null;
  definition: string;
  period: string;
  source: string;
  asOf: string;
  insufficientReason?: string | null;
  children?: ReactNode;
};

/** Kartu KPI (§C.1): definisi (popover), periode, sumber, as_of; data kurang → teks, bukan 0. */
export function KpiCard({ label, value, unit, delta, definition, period, source, asOf, insufficientReason, children }: KpiProps) {
  const defId = `kpi-def-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const deltaText = delta == null ? null : `${delta >= 0 ? '▲ +' : '▼ '}${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(delta * 100)}%`;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#E3E7ED] bg-white p-4" aria-describedby={defId}>
      <span className="absolute inset-x-0 top-0 h-1 bg-[#0F2340]" aria-hidden />
      <div className="flex items-center gap-1 text-[11px] font-semibold tracking-[0.08em] text-ink-soft uppercase">
        {label}
        <Popover className="w-64 p-3" trigger={<button type="button" aria-label={`Definisi ${label}`} className="text-ink-faint hover:text-ink"><Info size={12} /></button>}>
          <p id={defId} className="text-[12px] normal-case tracking-normal text-ink">{definition}</p>
        </Popover>
      </div>
      {insufficientReason || value === null ? (
        <p className="mt-2 text-[14px] font-medium text-[#B45309]">
          Data belum cukup<span className="block text-[12px] font-normal text-ink-soft">{insufficientReason ?? 'Sumber belum memberi nilai'}</span>
        </p>
      ) : (
        <div className="mt-1 flex items-end gap-2">
          <span className="text-[26px] leading-tight font-semibold tracking-tight text-[#0F2340] tabular-nums">
            {new Intl.NumberFormat('id-ID').format(value)}
            {unit && <span className="ml-0.5 text-[15px] text-ink-soft">{unit}</span>}
          </span>
          {deltaText && <span className={delta! >= 0 ? 'text-[12px] text-[#0B7A6E]' : 'text-[12px] text-[#C2410C]'}>{deltaText}</span>}
        </div>
      )}
      {children}
      <p className="mt-2 text-[11px] text-ink-faint">
        {period} · sumber: {source} · as_of {formatDateTime(asOf)}
      </p>
    </section>
  );
}

/** "Sumber: ci_company_list · as_of 14:02 · cache 60 s" (§C.8). */
export function SourceFooter({ tool, asOf, cacheSeconds }: { tool: string; asOf?: string | null; cacheSeconds?: number }) {
  return (
    <p className="mt-2 text-[11px] text-ink-faint">
      Sumber: <code>{tool}</code>
      {asOf && ` · as_of ${formatDateTime(asOf)}`}
      {cacheSeconds ? ` · cache ${cacheSeconds} s` : ''}
    </p>
  );
}
