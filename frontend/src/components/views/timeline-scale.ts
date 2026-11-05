import { addDays, dayOfWeek, diffDays, formatShort, isWeekend } from '../../lib/dates';

/**
 * Skala & header timeline (fungsi murni). Task hanya punya tanggal (tanpa jam), jadi di zoom "hour"
 * bar digambar penuh 00:00–24:00 per hari: lebar bar = jumlah hari × DAY_W.hour.
 */
export const ZOOMS = ['hour', 'day', 'week', 'month'] as const;
export type TimelineZoom = (typeof ZOOMS)[number];

export const DEFAULT_ZOOM: TimelineZoom = 'day';
export const ZOOM_LABEL: Record<TimelineZoom, string> = { hour: 'Jam', day: 'Hari', week: 'Minggu', month: 'Bulan' };

export const HOUR_W = 40;
export const DAY_W: Record<TimelineZoom, number> = { hour: 24 * HOUR_W, day: 36, week: 14, month: 6 };

// Zoom lebar (minggu/bulan) butuh rentang minimal agar header tidak terlihat kosong
const MIN_SPAN_DAYS: Record<TimelineZoom, number> = { hour: 0, day: 0, week: 112, month: 366 };

export interface HeaderCell {
  key: string;
  label: string;
  left: number;
  width: number;
  weekend: boolean;
  today: boolean;
}

export const parseZoom = (raw: string | null | undefined): TimelineZoom => (ZOOMS as readonly string[]).includes(raw ?? '') ? (raw as TimelineZoom) : DEFAULT_ZOOM;

export function withMinSpan(range: { start: string; days: number }, zoom: TimelineZoom): { start: string; days: number } {
  return { start: range.start, days: Math.max(range.days, MIN_SPAN_DAYS[zoom]) };
}

const jakartaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Tanggal (YYYY-MM-DD) dan menit-sejak-00:00 di Asia/Jakarta, zona yang sama dengan `today()`. */
export function jakartaNow(now: Date): { date: string; minutes: number } {
  const p = Object.fromEntries(jakartaFmt.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** Posisi-x garis "sekarang": presisi menit di zoom jam, tengah kolom hari di zoom lain. */
export function nowX(zoom: TimelineZoom, rangeStart: string, now: { date: string; minutes: number }, dayW: number): number {
  const base = diffDays(rangeStart, now.date) * dayW;
  return zoom === 'hour' ? base + (now.minutes / 1440) * dayW : base + dayW / 2;
}

/** Rentang indeks hari [from, to) yang perlu dirender untuk viewport tertentu (virtualisasi header zoom jam). */
export function visibleDayWindow(scrollLeft: number, viewportW: number, dayW: number, totalDays: number, overscan = 1): { from: number; to: number } {
  const from = Math.max(0, Math.floor(scrollLeft / dayW) - overscan);
  const to = Math.min(totalDays, Math.ceil((scrollLeft + viewportW) / dayW) + overscan);
  return { from: Math.min(from, totalDays), to: Math.max(from, to) };
}

/** Scroll-left baru agar titik tengah viewport tetap pada tanggal yang sama setelah zoom berubah. */
export function anchorScrollLeft(scrollLeft: number, viewportW: number, prevDayW: number, nextDayW: number): number {
  const centerDay = (scrollLeft + viewportW / 2) / prevDayW;
  return Math.max(0, Math.round(centerDay * nextDayW - viewportW / 2));
}

const fmtMonthShort = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'UTC' });
const fmtMonthLong = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtDayLong = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const atUtc = (d: string) => new Date(`${d}T00:00:00Z`);

interface MonthSegment {
  date: string;
  offset: number;
  span: number;
}

function monthSegments(start: string, days: number): MonthSegment[] {
  const out: MonthSegment[] = [];
  let i = 0;
  while (i < days) {
    const d = addDays(start, i);
    const daysInMonth = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate();
    const span = Math.min(daysInMonth - Number(d.slice(8)) + 1, days - i);
    out.push({ date: d, offset: i, span });
    i += span;
  }
  return out;
}

/** Header 2 baris. `win` (indeks hari) hanya membatasi sel per-hari/per-jam agar zoom jam tetap ringan. */
export function buildHeader(zoom: TimelineZoom, start: string, days: number, dayW: number, todayStr: string, win?: { from: number; to: number } | null): { top: HeaderCell[]; bottom: HeaderCell[] } {
  const from = win?.from ?? 0;
  const to = win?.to ?? days;
  const cell = (key: string, label: string, left: number, width: number, d: string): HeaderCell => ({ key, label, left, width, weekend: isWeekend(d), today: d === todayStr });

  if (zoom === 'hour') {
    const top: HeaderCell[] = [];
    const bottom: HeaderCell[] = [];
    for (let i = from; i < to; i++) {
      const d = addDays(start, i);
      top.push(cell(d, fmtDayLong.format(atUtc(d)), i * dayW, dayW, d));
      for (let h = 0; h < 24; h++) bottom.push(cell(`${d}T${h}`, String(h).padStart(2, '0'), i * dayW + h * HOUR_W, HOUR_W, d));
    }
    return { top, bottom };
  }

  const months = monthSegments(start, days);
  if (zoom === 'month') {
    const top: HeaderCell[] = [];
    for (const m of months) {
      const year = m.date.slice(0, 4);
      const last = top[top.length - 1];
      if (last && last.key === year) last.width += m.span * dayW;
      else top.push({ key: year, label: year, left: m.offset * dayW, width: m.span * dayW, weekend: false, today: false });
    }
    const bottom = months.map((m) => ({
      key: m.date,
      label: fmtMonthShort.format(atUtc(m.date)),
      left: m.offset * dayW,
      width: m.span * dayW,
      weekend: false,
      today: todayStr >= m.date && todayStr < addDays(m.date, m.span),
    }));
    return { top, bottom };
  }

  const top = months.map((m) => ({ key: m.date, label: fmtMonthLong.format(atUtc(m.date)), left: m.offset * dayW, width: m.span * dayW, weekend: false, today: false }));
  const bottom: HeaderCell[] = [];
  for (let i = from; i < to; i++) {
    const d = addDays(start, i);
    if (zoom === 'day') bottom.push(cell(d, String(Number(d.slice(8))), i * dayW, dayW, d));
    else if (dayOfWeek(d) === 1) bottom.push({ ...cell(d, formatShort(d), i * dayW, 7 * dayW, d), weekend: false, today: todayStr >= d && todayStr < addDays(d, 7) });
  }
  return { top, bottom };
}

const WEEKEND = 'rgba(55,53,47,0.05)';
const HOUR_LINE = 'rgba(55,53,47,0.07)';
const DAY_LINE = 'rgba(55,53,47,0.16)';

/** Latar grid baris: akhir pekan + garis per hari/jam, murah untuk ratusan hari (gradient, bukan elemen). */
export function gridBackground(zoom: TimelineZoom, rangeStart: string, dayW: number): { backgroundImage?: string } {
  const layers: string[] = [];
  if (zoom !== 'month') {
    const sat = ((6 - dayOfWeek(rangeStart) + 7) % 7) * dayW;
    layers.push(`repeating-linear-gradient(90deg, transparent 0, transparent ${sat}px, ${WEEKEND} ${sat}px, ${WEEKEND} ${sat + 2 * dayW}px, transparent ${sat + 2 * dayW}px, transparent ${sat + 7 * dayW}px)`);
  }
  if (zoom === 'hour') {
    layers.push(`repeating-linear-gradient(90deg, transparent 0, transparent ${dayW - 1}px, ${DAY_LINE} ${dayW - 1}px, ${DAY_LINE} ${dayW}px)`);
    layers.push(`repeating-linear-gradient(90deg, transparent 0, transparent ${HOUR_W - 1}px, ${HOUR_LINE} ${HOUR_W - 1}px, ${HOUR_LINE} ${HOUR_W}px)`);
  } else if (zoom === 'day') {
    layers.push(`repeating-linear-gradient(90deg, transparent 0, transparent ${dayW - 1}px, rgba(55,53,47,0.06) ${dayW - 1}px, rgba(55,53,47,0.06) ${dayW}px)`);
  }
  return layers.length ? { backgroundImage: layers.join(', ') } : {};
}
