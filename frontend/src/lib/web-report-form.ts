/** State & validasi form input sesi (mirror aturan backend M2_TASK_001 §C). Pure — mudah dites. */
import { periodRange, suggestTitle } from './web-report-format';
import type { PeriodType, WebReportPayload, WebReportSession } from './web-report-types';

export const MAX_COUNT = 2_000_000_000;
const MONEY_RE = /^\d{1,15}(\.\d{1,2})?$/;
const COUNT_RE = /^\d+$/;

/** Nilai form disimpan sebagai string mentah tanpa pemisah ribuan ("20000", "150000000.5"). */
export interface WebReportFormState {
  title: string;
  titleTouched: boolean;
  period_type: PeriodType;
  year: number;
  /** Bulan (1–12) atau kuartal (1–4) */
  index: number;
  custom_start: string;
  custom_end: string;
  visitors: string;
  leads: string;
  sales_count: string;
  revenue: string;
  cost_maintenance: string;
  cost_ads: string;
  notes: string;
}

export type FormField = 'title' | 'period' | 'visitors' | 'leads' | 'sales_count' | 'revenue' | 'cost_maintenance' | 'cost_ads' | 'notes';
export type FormErrors = Partial<Record<FormField, string>>;

const toMoney = (v: string) => (v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v);

export function initialFormState(now = new Date(), session?: WebReportSession): WebReportFormState {
  if (session) {
    const [y, m] = session.period_start.split('-').map(Number);
    return {
      title: session.title,
      titleTouched: true,
      period_type: session.period_type,
      year: y,
      index: session.period_type === 'quarterly' ? Math.floor((m - 1) / 3) + 1 : m,
      custom_start: session.period_start,
      custom_end: session.period_end,
      visitors: String(session.input.visitors),
      leads: String(session.input.leads),
      sales_count: String(session.input.sales_count),
      revenue: toMoney(session.input.revenue),
      cost_maintenance: toMoney(session.input.cost_maintenance),
      cost_ads: toMoney(session.input.cost_ads),
      notes: session.notes ?? '',
    };
  }
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const { start, end } = periodRange('monthly', year, month);
  return {
    title: suggestTitle('monthly', start, end),
    titleTouched: false,
    period_type: 'monthly',
    year,
    index: month,
    custom_start: start,
    custom_end: end,
    visitors: '',
    leads: '',
    sales_count: '',
    revenue: '',
    cost_maintenance: '0',
    cost_ads: '0',
    notes: '',
  };
}

export function resolvePeriod(s: WebReportFormState): { start: string; end: string } {
  if (s.period_type === 'custom') return { start: s.custom_start, end: s.custom_end };
  return periodRange(s.period_type, s.year, s.index);
}

/** Perbarui field; judul otomatis mengikuti periode selama belum diubah user. */
export function updateForm(s: WebReportFormState, patch: Partial<WebReportFormState>): WebReportFormState {
  const next = { ...s, ...patch };
  if ('title' in patch) return { ...next, titleTouched: true };
  if (next.titleTouched) return next;
  const { start, end } = resolvePeriod(next);
  return start && end ? { ...next, title: suggestTitle(next.period_type, start, end) } : next;
}

function countError(raw: string, label: string): string | undefined {
  if (raw.trim() === '') return `${label} wajib diisi`;
  if (!COUNT_RE.test(raw)) return `${label} harus bilangan bulat ≥ 0`;
  if (Number(raw) > MAX_COUNT) return `${label} terlalu besar`;
  return undefined;
}

function moneyError(raw: string, label: string): string | undefined {
  if (raw.trim() === '') return `${label} wajib diisi`;
  if (!MONEY_RE.test(raw)) return `${label} harus angka ≥ 0 (maks. 2 desimal)`;
  return undefined;
}

export function validateForm(s: WebReportFormState): FormErrors {
  const errors: FormErrors = {};
  const title = s.title.trim();
  if (!title) errors.title = 'Judul wajib diisi';
  else if (title.length > 150) errors.title = 'Judul maksimal 150 karakter';

  const { start, end } = resolvePeriod(s);
  if (!start || !end) errors.period = 'Tanggal periode wajib diisi';
  else if (end < start) errors.period = 'Tanggal akhir tidak boleh sebelum tanggal awal';

  errors.visitors = countError(s.visitors, 'Pengunjung');
  errors.leads = countError(s.leads, 'Leads');
  errors.sales_count = countError(s.sales_count, 'Sales');
  if (!errors.visitors && !errors.leads && Number(s.leads) > Number(s.visitors)) errors.leads = 'Leads tidak boleh melebihi jumlah pengunjung';
  if (!errors.leads && !errors.sales_count && Number(s.sales_count) > Number(s.leads)) errors.sales_count = 'Sales tidak boleh melebihi jumlah leads';

  errors.revenue = moneyError(s.revenue, 'Omset');
  errors.cost_maintenance = moneyError(s.cost_maintenance, 'Biaya maintenance');
  errors.cost_ads = moneyError(s.cost_ads, 'Biaya iklan');
  if (s.notes.length > 2000) errors.notes = 'Catatan maksimal 2000 karakter';

  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v)) as FormErrors;
}

export function toPayload(s: WebReportFormState): WebReportPayload {
  const { start, end } = resolvePeriod(s);
  return {
    title: s.title.trim(),
    period_type: s.period_type,
    period_start: start,
    period_end: end,
    visitors: Number(s.visitors),
    leads: Number(s.leads),
    sales_count: Number(s.sales_count),
    revenue: s.revenue,
    cost_maintenance: s.cost_maintenance,
    cost_ads: s.cost_ads,
    notes: s.notes.trim() || null,
  };
}

/** Total biaya untuk ringkasan di bawah form (bukan perhitungan metrik — itu tugas backend). */
export function costTotalPreview(s: WebReportFormState): number | null {
  if (!MONEY_RE.test(s.cost_maintenance) || !MONEY_RE.test(s.cost_ads)) return null;
  return Number(s.cost_maintenance) + Number(s.cost_ads);
}

/** Field backend → field form (untuk memetakan error API `details.field`). */
export function apiFieldToFormField(field: unknown): FormField | null {
  if (field === 'period_start' || field === 'period_end') return 'period';
  const known: FormField[] = ['title', 'visitors', 'leads', 'sales_count', 'revenue', 'cost_maintenance', 'cost_ads', 'notes'];
  return known.includes(field as FormField) ? (field as FormField) : null;
}
