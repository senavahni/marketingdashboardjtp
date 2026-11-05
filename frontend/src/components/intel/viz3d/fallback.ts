/** Deteksi & penjaga fallback ke timeline 2D (M3_TASK_011): WebGL tidak ada, reduced-motion, FPS rendah. */
import type { FallbackReason } from './types';

export const LOW_FPS_THRESHOLD = 30;
export const LOW_FPS_DURATION_MS = 3000;

interface CanvasLike {
  getContext(id: string): unknown;
}

/** WebGL tersedia bila konteks bisa dibuat; konteks uji langsung dilepas agar tidak memakan slot. */
export function isWebGLAvailable(createCanvas?: () => CanvasLike): boolean {
  try {
    const canvas = createCanvas ? createCanvas() : document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as {
      getExtension?: (name: string) => { loseContext?: () => void } | null;
    } | null;
    if (!gl) return false;
    gl.getExtension?.('WEBGL_lose_context')?.loseContext?.();
    return true;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(matchMedia?: (query: string) => { matches: boolean }): boolean {
  try {
    const mm = matchMedia ?? (typeof window !== 'undefined' ? window.matchMedia?.bind(window) : undefined);
    return mm ? mm('(prefers-reduced-motion: reduce)').matches : false;
  } catch {
    return false;
  }
}

export interface FallbackEnv {
  createCanvas?: () => CanvasLike;
  matchMedia?: (query: string) => { matches: boolean };
}

/** Alasan fallback statis (sebelum render); null = 3D boleh dipakai. Reduced-motion diprioritaskan. */
export function detectStaticFallback(env: FallbackEnv = {}): FallbackReason | null {
  if (prefersReducedMotion(env.matchMedia)) return 'reduced-motion';
  if (!isWebGLAvailable(env.createCanvas)) return 'no-webgl';
  return null;
}

export const FALLBACK_MESSAGE: Record<FallbackReason, string> = {
  'no-webgl': 'WebGL tidak tersedia di perangkat ini.',
  'reduced-motion': 'Animasi dikurangi sesuai pengaturan sistem Anda.',
  'low-fps': 'Perangkat terlalu lambat untuk visualisasi 3D (di bawah 30 fps).',
};

/**
 * Penjaga FPS: panggil `tick(nowMs)` tiap frame. Mengembalikan true bila FPS rata-rata per jendela
 * `windowMs` tetap < `threshold` selama `durationMs` berturut-turut. Warm-up (kompilasi shader) diabaikan,
 * dan jeda panjang antar frame (tab tersembunyi) mengulang pengukuran.
 */
export class FpsMonitor {
  private windowStart: number | null = null;
  private lastTick = 0;
  private frames = 0;
  private lowSince: number | null = null;
  private startedAt: number | null = null;

  constructor(
    private readonly threshold = LOW_FPS_THRESHOLD,
    private readonly durationMs = LOW_FPS_DURATION_MS,
    private readonly windowMs = 500,
    private readonly warmupMs = 1000,
    private readonly maxGapMs = 1000,
  ) {}

  tick(nowMs: number): boolean {
    if (this.startedAt === null || nowMs - this.lastTick > this.maxGapMs) {
      this.reset(nowMs);
    }
    this.lastTick = nowMs;
    if (nowMs - (this.startedAt as number) < this.warmupMs) return false;
    if (this.windowStart === null) {
      this.windowStart = nowMs;
      this.frames = 0;
      return false;
    }
    this.frames += 1;
    const elapsed = nowMs - this.windowStart;
    if (elapsed < this.windowMs) return this.isLow(nowMs);
    const fps = (this.frames * 1000) / elapsed;
    this.windowStart = nowMs;
    this.frames = 0;
    if (fps >= this.threshold) this.lowSince = null;
    else if (this.lowSince === null) this.lowSince = nowMs - elapsed;
    return this.isLow(nowMs);
  }

  private isLow(nowMs: number): boolean {
    return this.lowSince !== null && nowMs - this.lowSince >= this.durationMs;
  }

  private reset(nowMs: number) {
    this.startedAt = nowMs;
    this.windowStart = null;
    this.frames = 0;
    this.lowSince = null;
  }
}
