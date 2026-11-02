import { AlertTriangle, TrendingUp } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCompareWebReports } from '../../hooks/web-report-queries';
import { formatPercent, formatPeriod, formatRupiah, formatRupiahShort } from '../../lib/web-report-format';
import { formatByUnit, METRICS, type MetricDef } from '../../lib/web-report-metrics';
import { REPORT_COLORS } from '../../lib/web-report-theme';
import type { WebReportSession } from '../../lib/web-report-types';
import { Dialog } from '../ui/dialog';
import { Spinner } from '../ui/misc';

type Props = { workspaceId: string; ids: string[]; onClose: () => void };

/** Indeks sesi dengan nilai terbaik untuk satu metrik (null jika semua kosong / sama). */
export function bestIndex(sessions: WebReportSession[], metric: Pick<MetricDef, 'key' | 'lowerIsBetter'>): number | null {
  const values = sessions.map((s) => (s.results[metric.key] === null ? null : Number(s.results[metric.key])));
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < 2 || valid.every((v) => v === valid[0])) return null;
  const target = metric.lowerIsBetter ? Math.min(...valid) : Math.max(...valid);
  return values.indexOf(target);
}

const axisTick = { fontSize: 11, fill: REPORT_COLORS.inkSoft };

export function WebReportCompareModal({ workspaceId, ids, onClose }: Props) {
  const { data: sessions, isLoading } = useCompareWebReports(workspaceId, ids);
  const isMixed = !!sessions && new Set(sessions.map((s) => s.period_type)).size > 1;
  const rows = (sessions ?? []).map((s) => ({
    name: formatPeriod(s.period_type, s.period_start, s.period_end),
    revenue: Number(s.input.revenue),
    rpv: s.results.rpv === null ? null : Number(s.results.rpv),
    lead_cr: s.results.lead_cr,
    sales_cr: s.results.sales_cr,
    lead_to_sales_cr: s.results.lead_to_sales_cr,
  }));

  return (
    <Dialog open={ids.length > 0} onOpenChange={(o) => !o && onClose()} title="Perbandingan laporan" description="Nominal lebih menentukan keberhasilan daripada persentase konversi saja." className="max-h-[92vh]! max-w-[1100px]!">
      {isLoading || !sessions ? (
        <div className="flex h-60 items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {isMixed && (
            <div role="alert" className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              <AlertTriangle size={15} /> Jenis periode berbeda (mis. bulanan & tahunan) — angka absolut tidak sebanding langsung.
            </div>
          )}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-line p-4" aria-label="Laporan finansial: omset dan RPV per periode">
              <h3 className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-ink-faint uppercase">Laporan finansial · Omset & RPV</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rows} margin={{ top: 10, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={REPORT_COLORS.line} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={axisTick} />
                    <YAxis yAxisId="rev" tickLine={false} axisLine={false} width={64} tick={axisTick} tickFormatter={(v: number) => formatRupiahShort(v)} />
                    <YAxis yAxisId="rpv" orientation="right" tickLine={false} axisLine={false} width={64} tick={axisTick} tickFormatter={(v: number) => formatRupiahShort(v)} />
                    <Tooltip formatter={(v, name) => [formatRupiah(Number(v)), name]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="rev" dataKey="revenue" name="Omset" fill={REPORT_COLORS.revenue} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false} />
                    <Line yAxisId="rpv" dataKey="rpv" name="RPV (per pengunjung)" stroke={REPORT_COLORS.navy} strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="rounded-xl border border-line p-4" aria-label="Laporan efisiensi: conversion rate per periode">
              <h3 className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-ink-faint uppercase">Laporan efisiensi · Conversion rate</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={REPORT_COLORS.line} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={axisTick} />
                    <YAxis tickLine={false} axisLine={false} width={52} tick={axisTick} tickFormatter={(v: number) => formatPercent(v)} />
                    <Tooltip formatter={(v, name) => [formatPercent(Number(v)), name]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line dataKey="lead_cr" name="Lead CR" stroke={REPORT_COLORS.leads} strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
                    <Line dataKey="sales_cr" name="Sales CR" stroke={REPORT_COLORS.navy} strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
                    <Line dataKey="lead_to_sales_cr" name="Lead → Sales" stroke={REPORT_COLORS.costMaintenance} strokeWidth={2.5} strokeDasharray="5 4" dot={{ r: 4 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-[#F5F7FA] text-[11px] tracking-wide text-ink-soft uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Metrik</th>
                  {sessions.map((s) => (
                    <th key={s.id} scope="col" className="px-3 py-2 text-right font-semibold" title={s.title}>
                      {formatPeriod(s.period_type, s.period_start, s.period_end)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => {
                  const best = bestIndex(sessions, m);
                  return (
                    <tr key={m.key} className="border-t border-line">
                      <th scope="row" className="px-3 py-2 text-left font-medium">{m.short}</th>
                      {sessions.map((s, i) => (
                        <td key={s.id} className={i === best ? 'bg-[#E6F4F2] px-3 py-2 text-right font-semibold text-[#0B5F56] tabular-nums' : 'px-3 py-2 text-right tabular-nums'}>
                          {i === best && (
                            <span aria-label={m.lowerIsBetter ? 'terendah (terbaik)' : 'tertinggi'} className="mr-1">
                              <TrendingUp size={12} className="inline" aria-hidden />
                            </span>
                          )}
                          {formatByUnit(m.unit, s.results[m.key])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Dialog>
  );
}
