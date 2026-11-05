import { describe, expect, it } from 'vitest';
import { FpsMonitor, detectStaticFallback, isWebGLAvailable, prefersReducedMotion } from '../components/intel/viz3d/fallback';
import {
  MAX_POINTS,
  SCENE,
  UNANALYZED_COLOR,
  branchSegments,
  flowActivity,
  isRunning,
  layoutCloud,
  limitPoints,
  pointColor,
  sanitizeTokens,
  sentimentLabel,
  sourceColor,
  streamControlPoints,
  visibleCount,
} from '../components/intel/viz3d/mapping';
import { mockFlowEvents, mockProjectionPoints } from '../components/intel/viz3d/mock-data';
import type { ProjectionPoint } from '../components/intel/viz3d/types';
import { SENTIMENT_META, SOURCE_META } from '../lib/intel-format';

const point = (over: Partial<ProjectionPoint> = {}): ProjectionPoint => ({
  id: 'p',
  x: 0,
  y: 0,
  z: 0,
  source: 'web',
  sentiment: 'neutral',
  label: 'x',
  ...over,
});

describe('pemetaan titik → warna', () => {
  it('memakai SENTIMENT_META untuk tiap sentimen', () => {
    for (const s of ['positive', 'neutral', 'negative'] as const) {
      expect(pointColor(point({ sentiment: s }))).toBe(SENTIMENT_META[s].color);
    }
  });
  it('sentimen null memakai warna "belum dianalisis" dan label terpisah', () => {
    expect(pointColor(point({ sentiment: null }))).toBe(UNANALYZED_COLOR);
    expect(sentimentLabel(point({ sentiment: null }))).toBe('Belum dianalisis');
    expect(sentimentLabel(point({ sentiment: 'negative' }))).toBe(SENTIMENT_META.negative.label);
  });
  it('warna sumber diambil dari SOURCE_META', () => {
    for (const s of ['x', 'threads', 'web', 'trends'] as const) expect(sourceColor(s)).toBe(SOURCE_META[s].color);
  });
});

describe('tata letak awan titik', () => {
  it('memusatkan dan memuat titik dalam bola jaringan', () => {
    const pts = [point({ x: 10, y: 0, z: 0 }), point({ x: -10, y: 0, z: 0 }), point({ x: 0, y: 4, z: 0 })];
    const out = layoutCloud(pts);
    const [cx, cy, cz] = SCENE.networkCenter;
    const dist = (i: number) => Math.hypot(out[i * 3] - cx, out[i * 3 + 1] - cy, out[i * 3 + 2] - cz);
    // Titik terjauh tepat di tepi bola; sisanya di dalam
    expect(Math.max(dist(0), dist(1), dist(2))).toBeCloseTo(SCENE.networkRadius, 5);
    expect(dist(2)).toBeLessThanOrEqual(SCENE.networkRadius);
  });
  it('aman untuk kosong, satu titik, dan nilai non-finite', () => {
    expect(layoutCloud([]).length).toBe(0);
    const one = layoutCloud([point({ x: 3, y: 3, z: 3 })]);
    expect([...one]).toEqual([...SCENE.networkCenter]);
    const bad = layoutCloud([point({ x: Number.NaN }), point({ x: Infinity, y: 1 })]);
    expect([...bad].every(Number.isFinite)).toBe(true);
  });
  it('membatasi jumlah titik maksimal 2.000', () => {
    const many = mockProjectionPoints(MAX_POINTS);
    expect(many).toHaveLength(MAX_POINTS);
    expect(limitPoints([...many, ...many])).toHaveLength(MAX_POINTS);
  });
  it('cabang: sampel merata dan dibatasi', () => {
    const pos = layoutCloud(mockProjectionPoints(500));
    expect(branchSegments(pos, 500).length).toBe(120 * 6);
    expect(branchSegments(pos, 5).length).toBe(5 * 6);
    expect(branchSegments(pos, 0).length).toBe(0);
  });
  it('stream berawal di kiri dan berakhir di node sumber', () => {
    const [start, , , end] = streamControlPoints(1, 4);
    expect(start[0]).toBe(SCENE.streamStartX);
    expect(end[0]).toBe(SCENE.nodeX);
  });
});

describe('aktivitas alur & event progres', () => {
  it('running default: done < total', () => {
    expect(isRunning({ stage: 'collect', done: 1, total: 2 })).toBe(true);
    expect(isRunning({ stage: 'index', done: 2, total: 2 })).toBe(false);
    expect(isRunning(null)).toBe(false);
    expect(isRunning({ stage: 'index', done: 2, total: 2 }, true)).toBe(true);
  });
  it('titik jaringan tumbuh seiring progres tahap index', () => {
    expect(visibleCount(1000, { stage: 'index', done: 50, total: 200 }, true)).toBe(250);
    expect(visibleCount(1000, { stage: 'index', done: 200, total: 200 }, false)).toBe(1000);
    expect(visibleCount(1000, { stage: 'collect', done: 1, total: 200 }, true)).toBe(1000);
  });
  it('stream aktif saat collect, diam saat tidak berjalan', () => {
    expect(flowActivity({ stage: 'collect', done: 1, total: 2 }, true).stream).toBe(1);
    expect(flowActivity({ stage: 'index', done: 1, total: 2 }, true).network).toBe(1);
    expect(flowActivity({ stage: 'index', done: 2, total: 2 }, false)).toEqual({ stream: 0, nodes: 0, network: 0 });
  });
  it('token disanitasi: dipotong, dibuang yang kosong, maksimal 20', () => {
    const t = sanitizeTokens(['  halo ', '', 'a'.repeat(50), ...Array.from({ length: 30 }, (_, i) => `k${i}`)]);
    expect(t).toHaveLength(20);
    expect(t[0]).toBe('halo');
    expect(t[1]).toHaveLength(24);
    expect(sanitizeTokens(undefined)).toEqual([]);
  });
  it('data dummy deterministik dan valid', () => {
    expect(mockProjectionPoints()).toEqual(mockProjectionPoints());
    expect(mockProjectionPoints().every((p) => p.label.length <= 60)).toBe(true);
    const ev = mockFlowEvents(100, 4);
    expect(ev[0].stage).toBe('collect');
    expect(ev.at(-1)).toMatchObject({ stage: 'index', done: 100, total: 100 });
    expect(ev.every((e) => (e.sample_tokens?.length ?? 0) <= 20)).toBe(true);
  });
});

describe('fallback ke timeline 2D', () => {
  const webgl = () => ({ getContext: (id: string) => (id === 'webgl2' ? {} : null) });
  const noWebgl = () => ({ getContext: () => null });
  const motion = (matches: boolean) => () => ({ matches });

  it('WebGL tidak tersedia → no-webgl (konteks null, atau melempar error)', () => {
    expect(isWebGLAvailable(noWebgl)).toBe(false);
    expect(
      isWebGLAvailable(() => {
        throw new Error('blocked');
      }),
    ).toBe(false);
    expect(detectStaticFallback({ createCanvas: noWebgl, matchMedia: motion(false) })).toBe('no-webgl');
  });
  it('WebGL 1 saja tetap dianggap tersedia dan konteks uji dilepas', () => {
    let lost = false;
    const gl = { getExtension: () => ({ loseContext: () => (lost = true) }) };
    expect(isWebGLAvailable(() => ({ getContext: (id: string) => (id === 'webgl' ? gl : null) }))).toBe(true);
    expect(lost).toBe(true);
  });
  it('prefers-reduced-motion → reduced-motion, diprioritaskan di atas WebGL', () => {
    expect(prefersReducedMotion(motion(true))).toBe(true);
    expect(detectStaticFallback({ createCanvas: webgl, matchMedia: motion(true) })).toBe('reduced-motion');
    expect(detectStaticFallback({ createCanvas: noWebgl, matchMedia: motion(true) })).toBe('reduced-motion');
  });
  it('lingkungan normal → 3D boleh dipakai', () => {
    expect(detectStaticFallback({ createCanvas: webgl, matchMedia: motion(false) })).toBeNull();
  });

  const run = (monitor: FpsMonitor, fps: number, fromMs: number, toMs: number) => {
    const step = 1000 / fps;
    let tripped = -1;
    for (let t = fromMs; t <= toMs; t += step) if (monitor.tick(t) && tripped < 0) tripped = t;
    return tripped;
  };

  it('FPS rendah (< 30) selama 3 detik → true setelah warm-up + 3 detik', () => {
    const tripped = run(new FpsMonitor(), 20, 0, 8000);
    expect(tripped).toBeGreaterThanOrEqual(1000 + 3000 - 600);
    expect(tripped).toBeLessThan(6000);
  });
  it('FPS rendah kurang dari 3 detik lalu pulih → tidak memicu fallback', () => {
    const m = new FpsMonitor();
    expect(run(m, 60, 0, 2000)).toBe(-1);
    expect(run(m, 15, 2000, 4000)).toBe(-1);
    expect(run(m, 60, 4000, 10000)).toBe(-1);
  });
  it('FPS sehat (≥ 45) tidak pernah memicu fallback', () => {
    expect(run(new FpsMonitor(), 60, 0, 15000)).toBe(-1);
  });
  it('lonjakan lambat saat warm-up (kompilasi shader) diabaikan', () => {
    const m = new FpsMonitor();
    expect(run(m, 5, 0, 900)).toBe(-1);
    expect(run(m, 60, 1000, 8000)).toBe(-1);
  });
  it('jeda panjang antar frame (tab tersembunyi) mengulang pengukuran', () => {
    const m = new FpsMonitor();
    run(m, 20, 0, 2500);
    expect(m.tick(60_000)).toBe(false);
    expect(run(m, 60, 60_016, 70_000)).toBe(-1);
  });
});
