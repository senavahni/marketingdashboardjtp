/**
 * Tipe visualisasi 3D live (M3_TASK_011). Sengaja berdiri sendiri (tidak mengimpor intel-types.ts)
 * karena belum tersambung ke API; bentuknya mengikuti kontrak tool `intel_kb_projection`
 * dan event `intel.job.progress` tahap `index`.
 */
export type ProjectionSource = 'x' | 'threads' | 'web' | 'trends';
export type ProjectionSentiment = 'positive' | 'neutral' | 'negative';

export interface ProjectionPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  source: ProjectionSource;
  /** null = belum dianalisis. */
  sentiment: ProjectionSentiment | null;
  /** Maksimal 60 karakter (sudah dipotong server). */
  label: string;
}

export type FlowStage = 'collect' | 'analyze' | 'index';

export interface FlowEvent {
  stage: FlowStage;
  done: number;
  total: number;
  /** ≤ 20 kata terbaru, sudah disanitasi server. */
  sample_tokens?: string[];
}

export type Vec3 = readonly [number, number, number];

export type FallbackReason = 'no-webgl' | 'reduced-motion' | 'low-fps';

export interface IntelFlow3DProps {
  points: ProjectionPoint[];
  event?: FlowEvent | null;
  /** Default: true selama event belum selesai (done < total). */
  running?: boolean;
  /** Dipanggil tiap frame dengan timestamp (ms); dipakai penjaga FPS di panel. */
  onFrame?: (nowMs: number) => void;
  /** Dipanggil bila konteks WebGL hilang saat berjalan. */
  onContextLost?: () => void;
  onSelect?: (point: ProjectionPoint | null) => void;
  className?: string;
}
