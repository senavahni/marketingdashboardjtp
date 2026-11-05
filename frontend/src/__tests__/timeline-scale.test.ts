import { describe, expect, it } from 'vitest';
import { barGeometry } from '../components/views/timeline-model';
import { DAY_W, HOUR_W, anchorScrollLeft, buildHeader, gridBackground, jakartaNow, nowX, parseZoom, visibleDayWindow, withMinSpan } from '../components/views/timeline-scale';
import type { Task } from '../lib/types';

const bar = (start: string, end: string, milestone = false) => ({ start_date: start, end_date: end, is_milestone: milestone }) as Task;

describe('parseZoom', () => {
  it('menerima level valid dan fallback ke hari', () => {
    expect(parseZoom('hour')).toBe('hour');
    expect(parseZoom('month')).toBe('month');
    expect(parseZoom('year')).toBe('day');
    expect(parseZoom(null)).toBe('day');
  });
});

describe('skala', () => {
  it('lebar hari zoom jam = 24 kolom jam', () => {
    expect(DAY_W.hour).toBe(24 * HOUR_W);
  });

  it('bar zoom jam menutupi 00:00–24:00 tiap hari (tanpa jam di data)', () => {
    const g = barGeometry(bar('2026-11-03', '2026-11-04'), '2026-11-01', DAY_W.hour);
    expect(g).toEqual({ left: 2 * DAY_W.hour, width: 2 * DAY_W.hour });
  });

  it('withMinSpan hanya memperpanjang untuk zoom lebar', () => {
    const r = { start: '2026-11-01', days: 40 };
    expect(withMinSpan(r, 'hour')).toEqual(r);
    expect(withMinSpan(r, 'day')).toEqual(r);
    expect(withMinSpan(r, 'month').days).toBe(366);
    expect(withMinSpan({ start: '2026-11-01', days: 500 }, 'month').days).toBe(500);
  });
});

describe('jakartaNow & nowX', () => {
  it('mengonversi UTC ke tanggal/menit Asia/Jakarta (UTC+7)', () => {
    expect(jakartaNow(new Date('2026-11-05T09:30:00Z'))).toEqual({ date: '2026-11-05', minutes: 16 * 60 + 30 });
    expect(jakartaNow(new Date('2026-11-05T18:00:00Z'))).toEqual({ date: '2026-11-06', minutes: 60 });
    expect(jakartaNow(new Date('2026-11-05T17:00:00Z'))).toEqual({ date: '2026-11-06', minutes: 0 });
  });

  it('zoom jam: posisi presisi menit; zoom lain: tengah kolom hari', () => {
    const now = { date: '2026-11-03', minutes: 12 * 60 };
    expect(nowX('hour', '2026-11-01', now, DAY_W.hour)).toBe(2 * DAY_W.hour + DAY_W.hour / 2);
    expect(nowX('hour', '2026-11-01', { date: '2026-11-01', minutes: 90 }, DAY_W.hour)).toBe(HOUR_W * 1.5);
    expect(nowX('day', '2026-11-01', now, DAY_W.day)).toBe(2 * DAY_W.day + DAY_W.day / 2);
  });
});

describe('visibleDayWindow', () => {
  it('menghitung hari terlihat + overscan dan dibatasi total hari', () => {
    expect(visibleDayWindow(0, 1000, 960, 40)).toEqual({ from: 0, to: 3 });
    expect(visibleDayWindow(960 * 10, 1000, 960, 40)).toEqual({ from: 9, to: 13 });
    expect(visibleDayWindow(960 * 39, 2000, 960, 40)).toEqual({ from: 38, to: 40 });
  });
});

describe('anchorScrollLeft', () => {
  it('mempertahankan titik tengah saat skala berubah', () => {
    // tengah viewport (lebar 600) berada di hari ke-10 pada skala 36px/hari
    const left = anchorScrollLeft(10 * 36 - 300, 600, 36, 960);
    expect(left).toBe(10 * 960 - 300);
  });

  it('tidak negatif', () => {
    expect(anchorScrollLeft(0, 600, 960, 4)).toBe(0);
  });
});

describe('buildHeader', () => {
  const START = '2026-11-01'; // Minggu
  const TODAY = '2026-11-03';

  it('zoom jam: 24 sel jam per hari yang terlihat, header 2 baris', () => {
    const h = buildHeader('hour', START, 40, DAY_W.hour, TODAY, { from: 1, to: 3 });
    expect(h.top.map((c) => c.left)).toEqual([DAY_W.hour, 2 * DAY_W.hour]);
    expect(h.bottom).toHaveLength(48);
    expect(h.bottom[0].label).toBe('00');
    expect(h.bottom[23].label).toBe('23');
    expect(h.bottom[24].left).toBe(2 * DAY_W.hour);
    expect(h.bottom.filter((c) => c.today)).toHaveLength(24);
    expect(h.bottom.every((c) => c.width === HOUR_W)).toBe(true);
  });

  it('zoom jam menandai akhir pekan', () => {
    const h = buildHeader('hour', START, 7, DAY_W.hour, TODAY);
    const weekendDays = new Set(h.bottom.filter((c) => c.weekend).map((c) => c.key.slice(0, 10)));
    expect([...weekendDays].sort()).toEqual(['2026-11-01', '2026-11-07']);
  });

  it('zoom hari: baris atas = bulan, bawah = tanggal', () => {
    const h = buildHeader('day', '2026-10-30', 5, DAY_W.day, TODAY);
    expect(h.top).toHaveLength(2);
    expect(h.top[0].width).toBe(2 * DAY_W.day);
    expect(h.top[1].left).toBe(2 * DAY_W.day);
    expect(h.bottom.map((c) => c.label)).toEqual(['30', '31', '1', '2', '3']);
    expect(h.bottom[4].today).toBe(true);
  });

  it('zoom minggu: sel hanya pada hari Senin selebar 7 hari', () => {
    const h = buildHeader('week', START, 14, DAY_W.week, TODAY);
    expect(h.bottom).toHaveLength(2);
    expect(h.bottom[0].left).toBe(DAY_W.week);
    expect(h.bottom[0].width).toBe(7 * DAY_W.week);
    expect(h.bottom[0].today).toBe(true);
  });

  it('zoom bulan: baris atas = tahun, bawah = bulan selebar jumlah harinya', () => {
    const h = buildHeader('month', '2026-12-01', 62, DAY_W.month, TODAY);
    expect(h.top.map((c) => c.label)).toEqual(['2026', '2027']);
    expect(h.top[0].width).toBe(31 * DAY_W.month);
    expect(h.bottom).toHaveLength(2);
    expect(h.bottom[1].width).toBe(31 * DAY_W.month);
  });
});

describe('gridBackground', () => {
  it('zoom jam memuat garis jam, zoom bulan tanpa shading akhir pekan', () => {
    expect(gridBackground('hour', '2026-11-01', DAY_W.hour).backgroundImage).toContain(`${HOUR_W - 1}px`);
    expect(gridBackground('month', '2026-11-01', DAY_W.month)).toEqual({});
    expect(gridBackground('week', '2026-11-01', DAY_W.week).backgroundImage).toBeTruthy();
  });
});
