import { ArrowDown } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCount, formatPercent, formatRupiah, formatRupiahShort } from '../../lib/web-report-format';
import type { WebReportInputValues, WebReportResults } from '../../lib/web-report-types';
import { REPORT_COLORS } from '../../lib/web-report-theme';

/** Lebar minimum bar funnel agar tahap kecil (mis. 2 dari 34.505) tetap terlihat. */
export const FUNNEL_MIN_WIDTH_PCT = 2;

export function funnelWidth(value: number, visitors: number): number {
  if (visitors <= 0) return value > 0 ? 100 : FUNNEL_MIN_WIDTH_PCT;
  return Math.max(FUNNEL_MIN_WIDTH_PCT, (value / visitors) * 100);
}

type FunnelProps = { input: WebReportInputValues; results: WebReportResults };

export function FunnelChart({ input, results }: FunnelProps) {
  const stages = [
    { label: 'Pengunjung', value: input.visitors, color: REPORT_COLORS.visitors },
    { label: 'Leads', value: input.leads, color: REPORT_COLORS.leads, step: { label: 'Lead CR', value: results.lead_cr } },
    { label: 'Sales', value: input.sales_count, color: REPORT_COLORS.sales, step: { label: 'Lead → Sales', value: results.lead_to_sales_cr } },
  ];
  const summary = `Funnel: ${stages.map((s) => `${s.label} ${formatCount(s.value)}`).join(', ')}. Sales CR ${formatPercent(results.sales_cr)}.`;

  return (
    <figure role="img" aria-label={summary} className="flex flex-col gap-1">
      {stages.map((s) => (
        <div key={s.label}>
          {s.step && (
            <div className="flex items-center gap-1.5 py-1 pl-1 text-[12px] text-ink-soft">
              <ArrowDown size={13} className="text-ink-faint" />
              {s.step.label} <span className="font-semibold text-ink tabular-nums">{formatPercent(s.step.value)}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-[13px] text-ink-soft">{s.label}</span>
            <div className="h-7 flex-1 rounded bg-[#F5F7FA]">
              <div className="h-full rounded transition-[width] duration-500" style={{ width: `${funnelWidth(s.value, input.visitors)}%`, background: s.color }} />
            </div>
            <span className="w-20 shrink-0 text-right text-sm font-semibold text-ink tabular-nums">{formatCount(s.value)}</span>
          </div>
        </div>
      ))}
      <figcaption className="mt-2 rounded-md bg-[#F5F7FA] px-3 py-2 text-[12px] text-ink-soft">
        Sales CR (pengunjung → sales): <span className="font-semibold text-ink tabular-nums">{formatPercent(results.sales_cr)}</span>
      </figcaption>
    </figure>
  );
}

type RevenueCostProps = { input: WebReportInputValues };

export function RevenueCostChart({ input }: RevenueCostProps) {
  const data = [
    { name: 'Omset', value: Number(input.revenue), color: REPORT_COLORS.revenue },
    { name: 'Maintenance', value: Number(input.cost_maintenance), color: REPORT_COLORS.costMaintenance },
    { name: 'Iklan', value: Number(input.cost_ads), color: REPORT_COLORS.costAds },
  ];
  const noCost = data[1].value + data[2].value === 0;
  const summary = `Omset ${formatRupiah(input.revenue)}, biaya maintenance ${formatRupiah(input.cost_maintenance)}, biaya iklan ${formatRupiah(input.cost_ads)}.`;

  return (
    <figure role="img" aria-label={summary} className="flex flex-col">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={REPORT_COLORS.line} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: REPORT_COLORS.inkSoft }} />
            <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 11, fill: REPORT_COLORS.inkSoft }} tickFormatter={(v: number) => formatRupiahShort(v)} />
            <Tooltip cursor={{ fill: 'rgba(15,35,64,0.04)' }} formatter={(v) => [formatRupiah(Number(v)), 'Nilai']} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={72} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
              <LabelList dataKey="value" position="top" formatter={(v) => formatRupiahShort(Number(v))} style={{ fontSize: 11, fill: REPORT_COLORS.ink, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {noCost && <figcaption className="text-[12px] text-ink-faint">Biaya belum diisi — perbandingan omset vs biaya belum bisa dinilai.</figcaption>}
    </figure>
  );
}
