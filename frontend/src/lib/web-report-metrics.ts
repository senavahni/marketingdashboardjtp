/** Definisi metrik (label, rumus, arti) — satu sumber untuk tabel metrik di modal & semua ekspor. */
import { formatCount, formatPercent, formatRoas, formatRupiah } from './web-report-format';
import type { InsightLevel, WebReportInputValues, WebReportResults } from './web-report-types';

export type MetricUnit = 'percent' | 'rupiah' | 'ratio' | 'count';
export type MetricGroup = 'efisiensi' | 'finansial';

export interface MetricDef {
  key: keyof Omit<WebReportResults, 'funnel' | 'insights'>;
  label: string;
  short: string;
  group: MetricGroup;
  unit: MetricUnit;
  formula: string;
  meaning: string;
  /** Untuk perbandingan sesi: nilai lebih kecil lebih baik. */
  lowerIsBetter?: boolean;
}

export const METRICS: MetricDef[] = [
  { key: 'lead_cr', label: 'Lead CR (Website → Lead)', short: 'Lead CR', group: 'efisiensi', unit: 'percent', formula: 'Leads ÷ Pengunjung × 100%', meaning: 'Persentase pengunjung yang mengisi form / mengirim order.' },
  { key: 'sales_cr', label: 'Sales CR (Website → Sales)', short: 'Sales CR', group: 'efisiensi', unit: 'percent', formula: 'Sales ÷ Pengunjung × 100%', meaning: 'Persentase pengunjung yang akhirnya membayar (closing lunas).' },
  { key: 'lead_to_sales_cr', label: 'Lead-to-Sales CR', short: 'Lead→Sales', group: 'efisiensi', unit: 'percent', formula: 'Sales ÷ Leads × 100%', meaning: 'Kualitas lead & efektivitas follow-up. Di bawah 2% = traffic kurang tertarget.' },
  { key: 'roas', label: 'ROAS', short: 'ROAS', group: 'finansial', unit: 'ratio', formula: 'Omset ÷ Total biaya', meaning: 'Omset dibanding biaya website. ≥ 1x berarti biaya tertutup.' },
  { key: 'roi', label: 'ROI', short: 'ROI', group: 'finansial', unit: 'percent', formula: '(Omset − Biaya) ÷ Biaya × 100%', meaning: 'Pengembalian atas biaya website, dalam persen.' },
  { key: 'aov', label: 'AOV (Average Order Value)', short: 'AOV', group: 'finansial', unit: 'rupiah', formula: 'Omset ÷ Jumlah sales', meaning: 'Rata-rata nominal per transaksi. Makin tinggi, makin besar nilai tiap closing.' },
  { key: 'rpv', label: 'RPV (Revenue per Visitor)', short: 'RPV', group: 'finansial', unit: 'rupiah', formula: 'Omset ÷ Pengunjung', meaning: 'Nilai rupiah yang disumbang setiap 1 pengunjung.' },
  { key: 'cost_per_visitor', label: 'Biaya per pengunjung', short: 'Biaya/pengunjung', group: 'finansial', unit: 'rupiah', formula: 'Total biaya ÷ Pengunjung', meaning: 'Biaya mendatangkan 1 pengunjung. Idealnya jauh di bawah RPV.', lowerIsBetter: true },
  { key: 'cost_total', label: 'Total biaya website', short: 'Total biaya', group: 'finansial', unit: 'rupiah', formula: 'Biaya maintenance + Biaya iklan', meaning: 'Total pengeluaran website pada periode ini.', lowerIsBetter: true },
  { key: 'revenue_minus_cost', label: 'Selisih omset − biaya', short: 'Omset − biaya', group: 'finansial', unit: 'rupiah', formula: 'Omset − Total biaya', meaning: 'Bukan profit: belum memperhitungkan HPP.' },
];

export const INPUT_FIELDS: { key: keyof WebReportInputValues; label: string; unit: MetricUnit }[] = [
  { key: 'visitors', label: 'Total pengunjung website', unit: 'count' },
  { key: 'leads', label: 'Total order masuk (leads)', unit: 'count' },
  { key: 'sales_count', label: 'Total sales (closing/lunas)', unit: 'count' },
  { key: 'revenue', label: 'Total omset', unit: 'rupiah' },
  { key: 'cost_maintenance', label: 'Biaya maintenance website', unit: 'rupiah' },
  { key: 'cost_ads', label: 'Biaya iklan', unit: 'rupiah' },
];

export function formatByUnit(unit: MetricUnit, value: number | string | null | undefined): string {
  if (unit === 'percent') return formatPercent(value);
  if (unit === 'rupiah') return formatRupiah(value);
  if (unit === 'ratio') return formatRoas(value);
  return formatCount(value);
}

/** Alasan nilai kosong, untuk tooltip "—". */
export function emptyReason(key: MetricDef['key'], input: WebReportInputValues): string | null {
  const noCost = Number(input.cost_maintenance) + Number(input.cost_ads) === 0;
  if ((key === 'roas' || key === 'roi') && noCost) return 'Biaya belum diisi — ROAS & ROI tidak dihitung.';
  if (key === 'aov' && input.sales_count === 0) return 'Belum ada sales, AOV tidak dapat dihitung.';
  if (key === 'lead_to_sales_cr' && input.leads === 0) return 'Belum ada leads.';
  if (input.visitors === 0) return 'Belum ada pengunjung.';
  return null;
}

export const INSIGHT_ORDER: InsightLevel[] = ['danger', 'warning', 'info', 'success'];
export const INSIGHT_LABEL: Record<InsightLevel, string> = { danger: 'Perlu tindakan', warning: 'Perhatian', info: 'Info', success: 'Baik' };
export const INSIGHT_SYMBOL: Record<InsightLevel, string> = { danger: '✖', warning: '⚠', info: 'ℹ', success: '✔' };
