/** Logika murni (tanpa three/React) untuk visualisasi 3D: warna, tata letak, dan aktivitas animasi. */
import { INTEL_COLORS, SENTIMENT_META, SOURCE_META, SOURCE_TYPES } from '../../../lib/intel-format';
import type { FlowEvent, ProjectionPoint, ProjectionSource, Vec3 } from './types';

export const MAX_POINTS = 2000;
export const MAX_BRANCHES = 120;

/** Titik yang belum punya sentimen: abu-abu gelap, dibedakan dari netral (biru-abu) pada latar terang. */
export const UNANALYZED_COLOR = '#475569';

export const SCENE = {
  streamStartX: -9,
  nodeX: -2,
  nodeSpacing: 1.8,
  networkCenter: [5, 0, 0] as Vec3,
  networkRadius: 3.2,
} as const;

export const pointColor = (p: Pick<ProjectionPoint, 'sentiment'>): string =>
  p.sentiment ? SENTIMENT_META[p.sentiment].color : UNANALYZED_COLOR;

export const sourceColor = (s: ProjectionSource): string => SOURCE_META[s]?.color ?? INTEL_COLORS.neutral;

export const sentimentLabel = (p: Pick<ProjectionPoint, 'sentiment'>): string =>
  p.sentiment ? SENTIMENT_META[p.sentiment].label : 'Belum dianalisis';

export const limitPoints = (points: ProjectionPoint[]): ProjectionPoint[] =>
  points.length > MAX_POINTS ? points.slice(0, MAX_POINTS) : points;

/**
 * Memusatkan awan titik lalu menskalakannya agar muat dalam bola `radius` di sekitar `center`.
 * Hasil: array datar [x,y,z,...]. Titik bernilai non-finite dianggap 0.
 */
export function layoutCloud(
  points: ProjectionPoint[],
  center: Vec3 = SCENE.networkCenter,
  radius: number = SCENE.networkRadius,
): Float32Array {
  const n = points.length;
  const out = new Float32Array(n * 3);
  if (n === 0) return out;
  const finite = (v: number) => (Number.isFinite(v) ? v : 0);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of points) {
    cx += finite(p.x);
    cy += finite(p.y);
    cz += finite(p.z);
  }
  cx /= n;
  cy /= n;
  cz /= n;
  let maxR = 0;
  for (const p of points) {
    maxR = Math.max(maxR, Math.hypot(finite(p.x) - cx, finite(p.y) - cy, finite(p.z) - cz));
  }
  const scale = maxR > 0 ? radius / maxR : 0;
  points.forEach((p, i) => {
    out[i * 3] = center[0] + (finite(p.x) - cx) * scale;
    out[i * 3 + 1] = center[1] + (finite(p.y) - cy) * scale;
    out[i * 3 + 2] = center[2] + (finite(p.z) - cz) * scale;
  });
  return out;
}

/** Posisi vertikal node sumber, terpusat di y = 0. */
export const sourceNodePosition = (index: number, count: number): Vec3 => [
  SCENE.nodeX,
  ((count - 1) / 2 - index) * SCENE.nodeSpacing,
  0,
];

/** Sumber yang digambar: urutan tetap SOURCE_TYPES agar posisi node stabil antar render. */
export const SOURCES: readonly ProjectionSource[] = SOURCE_TYPES;

/** Empat titik kontrol kurva Bézier kubik stream sumber ke-`index`: melengkung dari kiri jauh ke node. */
export function streamControlPoints(index: number, count: number): [Vec3, Vec3, Vec3, Vec3] {
  const [nx, ny, nz] = sourceNodePosition(index, count);
  const side = index % 2 === 0 ? 1 : -1;
  const startY = ny * 1.3 + side * 0.8;
  const startZ = side * (1 + index * 0.4);
  return [
    [SCENE.streamStartX, startY, startZ],
    [SCENE.streamStartX * 0.55, startY + side * 2.2, startZ * 0.5],
    [nx - 2.5, ny - side * 1.4, nz],
    [nx, ny, nz],
  ];
}

/** Pasangan segmen [hub → titik] untuk cabang jaringan; sampel merata, maksimal `max` cabang. */
export function branchSegments(
  positions: Float32Array,
  count: number,
  hub: Vec3 = SCENE.networkCenter,
  max: number = MAX_BRANCHES,
): Float32Array {
  const n = Math.min(count, Math.floor(positions.length / 3));
  const branches = Math.min(n, max);
  const out = new Float32Array(branches * 6);
  for (let b = 0; b < branches; b++) {
    const i = Math.floor((b * n) / branches);
    out.set(hub, b * 6);
    out[b * 6 + 3] = positions[i * 3];
    out[b * 6 + 4] = positions[i * 3 + 1];
    out[b * 6 + 5] = positions[i * 3 + 2];
  }
  return out;
}

export const flowProgress = (event: FlowEvent | null | undefined): number =>
  event && event.total > 0 ? Math.min(1, Math.max(0, event.done / event.total)) : 0;

export const isRunning = (event: FlowEvent | null | undefined, running?: boolean): boolean =>
  running ?? (event ? event.done < event.total : false);

/** Jumlah titik jaringan yang tampak: tumbuh seiring progres indeks, penuh bila tidak sedang indexing. */
export function visibleCount(total: number, event: FlowEvent | null | undefined, running: boolean): number {
  if (running && event?.stage === 'index') return Math.floor(total * flowProgress(event));
  return total;
}

/** Intensitas gerak 0..1 per area (stream, node, jaringan) menurut tahap yang sedang berjalan. */
export function flowActivity(
  event: FlowEvent | null | undefined,
  running: boolean,
): { stream: number; nodes: number; network: number } {
  if (!running) return { stream: 0, nodes: 0, network: 0 };
  switch (event?.stage) {
    case 'collect':
      return { stream: 1, nodes: 0.8, network: 0.1 };
    case 'analyze':
      return { stream: 0.4, nodes: 1, network: 0.3 };
    case 'index':
      return { stream: 0.3, nodes: 0.5, network: 1 };
    default:
      return { stream: 0.3, nodes: 0.3, network: 0.1 };
  }
}

const MAX_TOKEN_CHARS = 24;
/** Token untuk animasi stream: dipotong & dibatasi 20 agar tekstur kanvas tetap kecil. */
export const sanitizeTokens = (tokens: string[] | undefined): string[] =>
  (tokens ?? [])
    .map((t) => t.trim().slice(0, MAX_TOKEN_CHARS))
    .filter(Boolean)
    .slice(0, 20);
