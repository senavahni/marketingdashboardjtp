/** Format angka & periode Modul 2 (M2_PRD §6.4). Dipakai modal, daftar, dan semua ekspor. */
import type { PeriodType } from './web-report-types';

export const EMPTY = '—';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const PERIOD_LABEL: Record<PeriodType, string> = {
  monthly: 'Bulanan',
  quarterly: 'Kuartalan',
  yearly: 'Tahunan',
  custom: 'Kustom',
};

const SHORT_UNITS: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'M'],
  [1e6, 'jt'],
];

const fmt = (value: number, minDigits: number, maxDigits = minDigits) =>
  new Intl.NumberFormat('id-ID', { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits }).format(value);

type Num = number | string | null | undefined;
const toNumber = (v: Num): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function formatCount(value: Num): string {
  const n = toNumber(value);
  return n === null ? EMPTY : fmt(n, 0);
}

/** "Rp56.380.950" (tanpa desimal). */
export function formatRupiah(value: Num): string {
  const n = toNumber(value);
  if (n === null) return EMPTY;
  const sign = n < 0 ? '−' : '';
  return `${sign}Rp${fmt(Math.abs(n), 0)}`;
}

/** Singkatan untuk kartu KPI: nilai ≥ 1 juta → "Rp56,4 jt", "Rp1,2 M"; di bawahnya nilai penuh. */
export function formatRupiahShort(value: Num): string {
  const n = toNumber(value);
  if (n === null) return EMPTY;
  const abs = Math.abs(n);
  const unit = SHORT_UNITS.find(([size]) => abs >= size);
  if (!unit) return formatRupiah(n);
  const sign = n < 0 ? '−' : '';
  return `${sign}Rp${fmt(abs / unit[0], 0, 1)} ${unit[1]}`;
}

/** Persen adaptif: 2 desimal; jika 0 < nilai < 0,01 → 4 desimal agar tidak tampil menyesatkan. */
export function formatPercent(value: Num): string {
  const n = toNumber(value);
  if (n === null) return EMPTY;
  const digits = n > 0 && n < 0.01 ? 4 : 2;
  return `${fmt(n, digits)}%`;
}

export function formatRoas(value: Num): string {
  const n = toNumber(value);
  return n === null ? EMPTY : `${fmt(n, 2)}x`;
}

// ---------- Periode ----------

const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Rentang tanggal untuk jenis periode non-custom. `index` = bulan (1–12) atau kuartal (1–4). */
export function periodRange(type: Exclude<PeriodType, 'custom'>, year: number, index = 1): { start: string; end: string } {
  const startMonth = type === 'monthly' ? index : type === 'quarterly' ? (index - 1) * 3 + 1 : 1;
  const endMonth = type === 'monthly' ? index : type === 'quarterly' ? startMonth + 2 : 12;
  return { start: `${year}-${pad(startMonth)}-01`, end: `${year}-${pad(endMonth)}-${pad(lastDay(year, endMonth))}` };
}

const quarterOf = (month: number) => Math.floor((month - 1) / 3) + 1;
const shortDate = (date: string) => {
  const [y, m, d] = parts(date);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
};

/** Label periode ringkas: "Okt 2026", "Q4 2026", "2026", "1 Okt 2026 – 15 Nov 2026". */
export function formatPeriod(type: PeriodType, start: string, end: string): string {
  const [y, m] = parts(start);
  if (type === 'monthly') return `${MONTHS_SHORT[m - 1]} ${y}`;
  if (type === 'quarterly') return `Q${quarterOf(m)} ${y}`;
  if (type === 'yearly') return String(y);
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** Bagian periode untuk nama file: "2026-10", "2026-Q4", "2026", "20261001-20261115". */
export function periodKey(type: PeriodType, start: string, end: string): string {
  const [y, m] = parts(start);
  if (type === 'monthly') return `${y}-${pad(m)}`;
  if (type === 'quarterly') return `${y}-Q${quarterOf(m)}`;
  if (type === 'yearly') return String(y);
  return `${start.replaceAll('-', '')}-${end.replaceAll('-', '')}`;
}

/** Judul yang disarankan saat membuat laporan. */
export function suggestTitle(type: PeriodType, start: string, end: string): string {
  const [y, m] = parts(start);
  if (type === 'monthly') return `Website — ${MONTHS_LONG[m - 1]} ${y}`;
  if (type === 'quarterly') return `Website — Q${quarterOf(m)} ${y}`;
  if (type === 'yearly') return `Laporan Tahunan Website ${y}`;
  return `Website — ${formatPeriod(type, start, end)}`;
}

/** Rentang tanggal lengkap: "1–31 Okt 2026". */
export function formatDateRange(start: string, end: string): string {
  const [ys, ms, ds] = parts(start);
  const [ye, me, de] = parts(end);
  if (ys === ye && ms === me) return `${ds}–${de} ${MONTHS_SHORT[ms - 1]} ${ys}`;
  return `${shortDate(start)} – ${shortDate(end)}`;
}
