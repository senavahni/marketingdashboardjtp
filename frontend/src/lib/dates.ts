/**
 * Utilitas "plain date" (YYYY-MM-DD) tanpa zona waktu — semua aritmatika di UTC agar
 * tanggal tidak bergeser karena timezone browser (lihat TASK_006 §Data & State).
 */
const DAY = 86_400_000;

export const toUtc = (d: string): number => Date.parse(`${d}T00:00:00Z`);
export const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number): string => fromUtc(toUtc(d) + n * DAY);
export const diffDays = (a: string, b: string): number => Math.round((toUtc(b) - toUtc(a)) / DAY);
export const durationInclusive = (s: string, e: string): number => diffDays(s, e) + 1;
export const dayOfWeek = (d: string): number => new Date(toUtc(d)).getUTCDay();
export const isWeekend = (d: string): boolean => [0, 6].includes(dayOfWeek(d));

export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

const fmtShort = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtMonth = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const formatShort = (d: string): string => fmtShort.format(new Date(toUtc(d)));
export const formatMonth = (d: string): string => fmtMonth.format(new Date(toUtc(d)));

export function formatRange(start: string | null, end: string | null): string {
  if (!start && !end) return '';
  if (start && end && start === end) return formatShort(start);
  return `${start ? formatShort(start) : '…'} → ${end ? formatShort(end) : '…'}`;
}
