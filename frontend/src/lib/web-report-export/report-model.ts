/**
 * Model laporan netral → dipakai semua exporter (PDF/CSV/XLSX/PPTX), agar angka identik dengan modal.
 * Tidak menghitung ulang apa pun: semua nilai berasal dari `session.results` (snapshot backend).
 */
import { formatDateRange, formatPercent, formatPeriod, formatRoas, formatRupiah, PERIOD_LABEL } from '../web-report-format';
import { formatByUnit, INPUT_FIELDS, INSIGHT_LABEL, INSIGHT_ORDER, METRICS, type MetricUnit } from '../web-report-metrics';
import type { InsightLevel, WebReportSession } from '../web-report-types';

export interface ReportRow {
  key: string;
  label: string;
  unit: MetricUnit;
  /** Nilai mentah (persen dalam satuan %, rupiah sebagai number) atau null */
  raw: number | null;
  display: string;
}

export interface ReportMetricRow extends ReportRow {
  formula: string;
  meaning: string;
}

export interface ReportModel {
  title: string;
  workspaceName: string;
  periodTypeLabel: string;
  periodLabel: string;
  dateRange: string;
  isYearly: boolean;
  notes: string | null;
  formulaVersion: number;
  generatedAt: string;
  footer: string;
  kpis: { key: string; label: string; value: string; sub: string }[];
  inputs: ReportRow[];
  metrics: ReportMetricRow[];
  funnel: { label: string; value: number; pctOfVisitors: number | null; pctOfPrevious: number | null }[];
  costs: { revenue: number; maintenance: number; ads: number };
  insights: { level: InsightLevel; label: string; message: string }[];
}

const toRaw = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

export function buildReportModel(session: WebReportSession, workspaceName: string, now = new Date()): ReportModel {
  const { input, results } = session;
  const generatedAt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(now);
  const roasStatus = results.roas === null ? 'biaya belum diisi' : results.roas >= 1 ? 'biaya tertutup' : 'biaya belum tertutup';

  return {
    title: session.title,
    workspaceName,
    periodTypeLabel: PERIOD_LABEL[session.period_type],
    periodLabel: formatPeriod(session.period_type, session.period_start, session.period_end),
    dateRange: formatDateRange(session.period_start, session.period_end),
    isYearly: session.period_type === 'yearly',
    notes: session.notes,
    formulaVersion: session.formula_version,
    generatedAt,
    footer: `Dibuat dari Marketing Dashboard · ${generatedAt} · Rumus versi ${session.formula_version}`,
    kpis: [
      { key: 'roas', label: 'Return on Ad Spend (ROAS)', value: formatRoas(results.roas), sub: `ROI ${formatPercent(results.roi)} · ${roasStatus}` },
      { key: 'aov', label: 'Average Order Value (AOV)', value: formatRupiah(results.aov), sub: 'Rata-rata nominal per transaksi sales' },
      { key: 'rpv', label: 'Revenue per Visitor (RPV)', value: formatRupiah(results.rpv), sub: `Biaya per pengunjung ${formatRupiah(results.cost_per_visitor)}` },
      { key: 'revenue', label: 'Total Omset', value: formatRupiah(input.revenue), sub: `Total biaya ${formatRupiah(results.cost_total)}` },
    ],
    inputs: INPUT_FIELDS.map((f) => ({ key: f.key, label: f.label, unit: f.unit, raw: toRaw(input[f.key]), display: formatByUnit(f.unit, input[f.key]) })),
    metrics: METRICS.map((m) => ({
      key: m.key,
      label: m.label,
      unit: m.unit,
      raw: toRaw(results[m.key]),
      display: formatByUnit(m.unit, results[m.key]),
      formula: m.formula,
      meaning: m.meaning,
    })),
    funnel: [
      { label: 'Pengunjung', value: input.visitors, pctOfVisitors: input.visitors > 0 ? 100 : null, pctOfPrevious: null },
      { label: 'Leads', value: input.leads, pctOfVisitors: results.lead_cr, pctOfPrevious: results.lead_cr },
      { label: 'Sales', value: input.sales_count, pctOfVisitors: results.sales_cr, pctOfPrevious: results.lead_to_sales_cr },
    ],
    costs: { revenue: Number(input.revenue), maintenance: Number(input.cost_maintenance), ads: Number(input.cost_ads) },
    insights: [...(results.insights ?? [])]
      .sort((a, b) => INSIGHT_ORDER.indexOf(a.level) - INSIGHT_ORDER.indexOf(b.level))
      .map((i) => ({ level: i.level, label: INSIGHT_LABEL[i.level], message: i.message })),
  };
}
