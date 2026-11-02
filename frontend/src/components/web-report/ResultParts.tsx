import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { EMPTY, formatPercent, formatRoas, formatRupiah, formatRupiahShort } from '../../lib/web-report-format';
import { emptyReason, formatByUnit, INSIGHT_LABEL, INSIGHT_ORDER, METRICS } from '../../lib/web-report-metrics';
import type { Insight, InsightLevel, WebReportInputValues, WebReportResults } from '../../lib/web-report-types';
import { cn } from '../../lib/utils';

type Tone = 'success' | 'danger' | 'neutral';

type KpiCardProps = {
  label: string;
  value: string;
  /** Nilai penuh untuk tooltip (kartu memakai singkatan) */
  fullValue?: string;
  sub: string;
  tone?: Tone;
  isHero?: boolean;
  emptyHint?: string | null;
};

export function KpiCard({ label, value, fullValue, sub, tone = 'neutral', isHero = false, emptyHint }: KpiCardProps) {
  const isEmpty = value === EMPTY;
  return (
    <div
      className={cn(
        'relative flex flex-col justify-between overflow-hidden rounded-xl border p-4',
        isHero ? 'border-transparent bg-[#0F2340] text-white' : 'border-line bg-white',
      )}
    >
      {tone !== 'neutral' && <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1', tone === 'success' ? 'bg-[#0E9384]' : 'bg-[#C2410C]')} />}
      <span className={cn('text-[11px] font-semibold tracking-[0.08em] uppercase', isHero ? 'text-white/60' : 'text-ink-faint')}>{label}</span>
      <span
        title={isEmpty ? (emptyHint ?? undefined) : fullValue}
        className={cn('mt-2 font-semibold tracking-tight tabular-nums', isHero ? 'text-[34px] leading-none' : 'text-[26px] leading-none text-[#0F2340]', isEmpty && 'cursor-help opacity-60')}
      >
        {value}
      </span>
      <span className={cn('mt-3 text-[12px]', isHero ? 'text-white/70' : 'text-ink-soft')}>{sub}</span>
    </div>
  );
}

type KpiRowProps = { input: WebReportInputValues; results: WebReportResults };

export function KpiRow({ input, results }: KpiRowProps) {
  const roasTone: Tone = results.roas === null ? 'neutral' : results.roas >= 1 ? 'success' : 'danger';
  const roasStatus = results.roas === null ? 'Biaya belum diisi' : results.roas >= 1 ? 'biaya tertutup' : 'biaya belum tertutup';
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.25fr_1fr_1fr_1fr]">
      <KpiCard
        isHero
        label="ROAS"
        value={formatRoas(results.roas)}
        sub={`ROI ${formatPercent(results.roi)} · ${roasStatus}`}
        tone={roasTone}
        emptyHint={emptyReason('roas', input)}
      />
      <KpiCard label="AOV" value={formatRupiahShort(results.aov)} fullValue={formatRupiah(results.aov)} sub="rata-rata per sales" emptyHint={emptyReason('aov', input)} />
      <KpiCard
        label="RPV"
        value={formatRupiahShort(results.rpv)}
        fullValue={formatRupiah(results.rpv)}
        sub={`biaya/pengunjung ${formatRupiah(results.cost_per_visitor)}`}
        emptyHint={emptyReason('rpv', input)}
      />
      <KpiCard label="Omset" value={formatRupiahShort(input.revenue)} fullValue={formatRupiah(input.revenue)} sub={`total biaya ${formatRupiahShort(results.cost_total)}`} />
    </div>
  );
}

const INSIGHT_STYLE: Record<InsightLevel, { icon: typeof Info; className: string }> = {
  danger: { icon: XCircle, className: 'border-[#C2410C]/25 bg-[#FFF4ED] text-[#9A3412]' },
  warning: { icon: AlertTriangle, className: 'border-[#B45309]/25 bg-[#FFFBEB] text-[#92400E]' },
  info: { icon: Info, className: 'border-[#1D5FA8]/20 bg-[#EFF6FF] text-[#1E4F8A]' },
  success: { icon: CheckCircle2, className: 'border-[#0E9384]/25 bg-[#E6F4F2] text-[#0B5F56]' },
};

export function sortInsights(insights: Insight[]): Insight[] {
  return [...insights].sort((a, b) => INSIGHT_ORDER.indexOf(a.level) - INSIGHT_ORDER.indexOf(b.level));
}

export function InsightList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return <p className="text-[13px] text-ink-faint">Tidak ada catatan khusus untuk periode ini.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {sortInsights(insights).map((i) => {
        const { icon: Icon, className } = INSIGHT_STYLE[i.level];
        return (
          <li key={i.code} className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-snug', className)}>
            <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              <span className="sr-only">{INSIGHT_LABEL[i.level]}: </span>
              {i.message}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type MetricTableProps = { input: WebReportInputValues; results: WebReportResults };

export function MetricTable({ input, results }: MetricTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-[#F5F7FA] text-left text-[11px] tracking-wide text-ink-soft uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Metrik</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Nilai</th>
            <th scope="col" className="px-3 py-2 font-semibold">Rumus</th>
            <th scope="col" className="px-3 py-2 font-semibold">Arti</th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => {
            const value = formatByUnit(m.unit, results[m.key]);
            return (
              <tr key={m.key} className="border-t border-line align-top">
                <th scope="row" className="px-3 py-2 text-left font-medium text-ink">{m.label}</th>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap text-[#0F2340] tabular-nums" title={value === EMPTY ? (emptyReason(m.key, input) ?? undefined) : undefined}>
                  {value}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-ink-soft">{m.formula}</td>
                <td className="px-3 py-2 text-ink-soft">{m.meaning}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
