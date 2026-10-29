/**
 * Utilitas "plain date" (YYYY-MM-DD tanpa zona waktu).
 * Kolom Postgres DATE dibaca Prisma sebagai Date pada 00:00 UTC, jadi semua aritmatika dilakukan di UTC.
 */
const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function toDateString(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function fromDateString(value: string): Date;
export function fromDateString(value: string | null | undefined): Date | null;
export function fromDateString(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

/** Selisih hari b - a. */
export function diffDays(a: string, b: string): number {
  return Math.round((fromDateString(b).getTime() - fromDateString(a).getTime()) / DAY_MS);
}

export function addDays(value: string, days: number): string {
  return toDateString(new Date(fromDateString(value).getTime() + days * DAY_MS)) as string;
}

/** Durasi inklusif (1–5 Nov = 5 hari). */
export function durationInclusive(start: string, end: string): number {
  return diffDays(start, end) + 1;
}

/** Tanggal hari ini (YYYY-MM-DD) di zona waktu tertentu. */
export function todayInTimezone(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}
