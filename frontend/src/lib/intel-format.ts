/**
 * Aturan tampilan Modul 3 (M3_TASK_003 §A): satu warna = satu makna, status selalu ikon + teks.
 * Fungsi di sini murni (tanpa React) agar bisa diuji Vitest dan dipakai ulang oleh exporter.
 */
import type { FlowEvent } from '../components/intel/viz3d/types';
import type { Insight, IntelJob, JobStatus, JobUpdatedEvent, Sentiment, SourceType, StageStatus, Table } from './intel-types';

export const INTEL_COLORS = {
  ink: '#0F2340',
  accent: '#0E9384',
  paper: '#F5F7FA',
  line: '#E3E7ED',
  positive: '#0E9384',
  neutral: '#8FA3BF',
  negative: '#C2410C',
} as const;

export const SENTIMENT_META: Record<Sentiment, { label: string; color: string }> = {
  positive: { label: 'Positif', color: INTEL_COLORS.positive },
  neutral: { label: 'Netral', color: INTEL_COLORS.neutral },
  negative: { label: 'Negatif', color: INTEL_COLORS.negative },
};
export const SENTIMENTS: Sentiment[] = ['positive', 'neutral', 'negative'];

export const SOURCE_META: Record<SourceType, { label: string; color: string; glyph: string }> = {
  x: { label: 'X', color: '#0F2340', glyph: '𝕏' },
  threads: { label: 'Threads', color: '#7C3AED', glyph: '@' },
  web: { label: 'Web', color: '#1D5FA8', glyph: '◎' },
  trends: { label: 'Google Trends', color: '#D97706', glyph: '↗' },
};
export const SOURCE_TYPES: SourceType[] = ['x', 'threads', 'web', 'trends'];

export type StatusTone = 'idle' | 'collect' | 'analyze' | 'index' | 'success' | 'danger' | 'muted';

export const JOB_STATUS_META: Record<JobStatus, { label: string; tone: StatusTone; spinning: boolean }> = {
  queued: { label: 'Antre', tone: 'idle', spinning: false },
  collecting: { label: 'Mengumpulkan', tone: 'collect', spinning: true },
  analyzing: { label: 'Menganalisis', tone: 'analyze', spinning: true },
  indexing: { label: 'Mengindeks', tone: 'index', spinning: true },
  completed: { label: 'Selesai', tone: 'success', spinning: false },
  failed: { label: 'Gagal', tone: 'danger', spinning: false },
  cancelling: { label: 'Membatalkan', tone: 'muted', spinning: true },
  cancelled: { label: 'Dibatalkan', tone: 'muted', spinning: false },
};

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  pending: 'Menunggu',
  running: 'Berjalan',
  completed: 'Selesai',
  skipped: 'Dilewati',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
};

export const TONE_CLASS: Record<StatusTone, string> = {
  idle: 'bg-stone-100 text-stone-700',
  collect: 'bg-[#E8F0FA] text-[#1D5FA8]',
  analyze: 'bg-[#F1ECFE] text-[#6D28D9]',
  index: 'bg-[#E6F4F2] text-[#0B7A6E]',
  success: 'bg-[#E7F6EC] text-[#15803D]',
  danger: 'bg-[#FDECE7] text-[#C2410C]',
  muted: 'bg-stone-100 text-stone-500',
};

const ACTIVE: JobStatus[] = ['queued', 'collecting', 'analyzing', 'indexing', 'cancelling'];
const CANCELLABLE: JobStatus[] = ['queued', 'collecting', 'analyzing', 'indexing'];
const RETRYABLE: JobStatus[] = ['failed', 'cancelled', 'completed'];

export const isActiveStatus = (s: JobStatus) => ACTIVE.includes(s);
export const canCancel = (s: JobStatus) => CANCELLABLE.includes(s);
export const canRetry = (s: JobStatus) => RETRYABLE.includes(s);

/**
 * Event aliran untuk visualisasi 3D (M3_TASK_011): tahap yang sedang berjalan, atau tahap terakhir
 * yang sudah lewat; `total` null (belum diketahui) dianggap sama dengan `done`.
 */
export function flowEventFromJob(job: IntelJob, sampleTokens: string[]): FlowEvent | null {
  const stage = job.stages.find((s) => s.status === 'running') ?? [...job.stages].reverse().find((s) => s.status !== 'pending');
  if (!stage) return null;
  return { stage: stage.stage, done: stage.progress_done, total: stage.progress_total ?? stage.progress_done, sample_tokens: sampleTokens };
}

/** Jumlah chunk tersimpan di Knowledge Base (tahap index selesai), selain itu null. */
export function kbChunks(job: IntelJob): number | null {
  const index = job.stages.find((s) => s.stage === 'index');
  const chunks = index?.status === 'completed' ? index.stats?.chunks : undefined;
  return typeof chunks === 'number' ? chunks : null;
}

// ---------------------------------------------------------------------------- angka

const idNumber = new Intl.NumberFormat('id-ID');
const idDecimal = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatCount = (v: number | null | undefined) => (v === null || v === undefined ? '—' : idNumber.format(v));
export const formatPct = (fraction: number) => `${Math.round(fraction * 100)}%`;
/** Biaya USD: dua desimal, empat bila di bawah 1 sen (format Indonesia). */
export const formatUsd = (v: number | null | undefined) =>
  v === null || v === undefined
    ? '—'
    : `$${new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < 0.01 ? 4 : 2 }).format(v)}`;
export const formatNet = (v: number) => `${v > 0 ? '+' : ''}${idDecimal.format(v)}`;
export const formatTokens = (v: number) => (v >= 1000 ? `${idNumber.format(Math.round(v / 100) / 10)} rb` : idNumber.format(v));

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} dtk`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} mnt` : `${Math.floor(m / 60)} j ${m % 60} mnt`;
}

export function stageDurationSeconds(startedAt: string | null, finishedAt: string | null, now = Date.now()): number | null {
  if (!startedAt) return null;
  return Math.max(0, ((finishedAt ? Date.parse(finishedAt) : now) - Date.parse(startedAt)) / 1000);
}

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
export const formatPeriod = (p: { since: string; until: string }) =>
  `${dateFmt.format(new Date(`${p.since}T00:00:00`))} – ${dateFmt.format(new Date(`${p.until}T00:00:00`))}`;

// ---------------------------------------------------------------------------- job

/** Tahap yang sedang berjalan (untuk progres di daftar job). */
export function activeStage(job: Pick<IntelJob, 'stages'>) {
  return job.stages.find((s) => s.status === 'running') ?? null;
}

export function progressPct(done: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((done / total) * 100));
}

export const STAGE_ORDER = ['collect', 'analyze', 'index'] as const;
export const sortStages = <T extends { stage: string }>(stages: T[]) =>
  [...stages].sort((a, b) => STAGE_ORDER.indexOf(a.stage as never) - STAGE_ORDER.indexOf(b.stage as never));

// ---------------------------------------------------------------------------- insight → model tampilan

export type DayRow = { day: string } & Record<string, number | string>;

export interface InsightView {
  dominant: { key: Sentiment; share: number } | null;
  distribution: { key: Sentiment; label: string; color: string; share: number }[];
  net: number | null;
  /** Volume per hari: stacked per sentimen bila ada sentimen, selain itu per sumber. */
  volume: { rows: DayRow[]; series: { key: string; label: string; color: string }[] };
  aspects: { aspect: string; mentions: number; positive: number; neutral: number; negative: number; net: number }[];
  topics: { label: string; count: number; share: number }[];
  hashtags: [string, number][];
  authors: [string, number][];
  trends: { rows: DayRow[]; keywords: string[]; share: Record<string, number> } | null;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

function tableObjects(t: Table | null | undefined): Record<string, unknown>[] {
  if (!t?.cols || !Array.isArray(t.rows)) return [];
  return t.rows.map((r) => Object.fromEntries(t.cols.map((c, i) => [c, r[i]])));
}

function volumeView(insight: Insight): InsightView['volume'] {
  const byDay = tableObjects(insight.sentiment?.by_day);
  if (byDay.length) {
    return {
      rows: byDay.map((r) => ({ day: String(r.day), positive: num(r.positive), neutral: num(r.neutral), negative: num(r.negative) })),
      series: SENTIMENTS.map((s) => ({ key: s, label: SENTIMENT_META[s].label, color: SENTIMENT_META[s].color })),
    };
  }
  const days = new Map<string, DayRow>();
  const sources = new Set<SourceType>();
  for (const r of tableObjects(insight.volume_by_day)) {
    const day = String(r.day);
    const source = String(r.source) as SourceType;
    sources.add(source);
    const row: DayRow = days.get(day) ?? { day };
    days.set(day, { ...row, [source]: num(row[source]) + num(r.count) });
  }
  return {
    rows: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    series: [...sources].map((s) => ({ key: s, label: SOURCE_META[s]?.label ?? s, color: SOURCE_META[s]?.color ?? INTEL_COLORS.neutral })),
  };
}

function trendsView(insight: Insight): InsightView['trends'] {
  const items = insight.google_trends?.items;
  if (!items?.cols?.length || !items.rows?.length) return null;
  const [periodCol, ...keywords] = items.cols;
  return {
    keywords,
    rows: tableObjects(items).map((r) => ({ day: String(r[periodCol]), ...Object.fromEntries(keywords.map((k) => [k, num(r[k])])) })),
    share: insight.google_trends?.stats?.share_of_search ?? {},
  };
}

export function buildInsightView(insight: Insight): InsightView {
  const s = insight.sentiment;
  const distribution = s
    ? SENTIMENTS.map((key) => ({
        key,
        label: SENTIMENT_META[key].label,
        color: SENTIMENT_META[key].color,
        share: num(s.distribution[key]),
      }))
    : [];
  const top = distribution.reduce<(typeof distribution)[number] | null>((best, d) => (!best || d.share > best.share ? d : best), null);
  return {
    dominant: top && top.share > 0 ? { key: top.key, share: top.share } : null,
    distribution,
    net: s ? num(s.net_sentiment) : null,
    volume: volumeView(insight),
    aspects: tableObjects(s?.aspects).map((r) => ({
      aspect: String(r.aspect),
      mentions: num(r.mentions),
      positive: num(r.positive),
      neutral: num(r.neutral),
      negative: num(r.negative),
      net: num(r.net),
    })),
    topics: insight.trends?.topics ?? [],
    hashtags: insight.trends?.hashtags ?? [],
    authors: insight.trends?.authors ?? [],
    trends: trendsView(insight),
  };
}

/** Terapkan event Socket.IO `intel.job.updated` ke job di cache (immutable). */
export function applyJobUpdate(job: IntelJob, ev: JobUpdatedEvent): IntelJob {
  if (job.id !== ev.id) return job;
  return {
    ...job,
    status: ev.status,
    total_items: ev.total_items ?? job.total_items,
    stages: job.stages.map((s) => {
      const u = ev.stages.find((x) => x.stage === s.stage);
      return u ? { ...s, status: u.status, progress_done: u.progress.done, progress_total: u.progress.total } : s;
    }),
  };
}

/** Estimasi biaya total (LLM + eksternal) dari estimasi tersimpan. */
export const estimateUsd = (job: Pick<IntelJob, 'estimate'>) =>
  job.estimate ? job.estimate.llm.usd_est + job.estimate.sources.reduce((sum, s) => sum + s.usd_external, 0) : null;
export const actualUsd = (job: Pick<IntelJob, 'cost'>) => (job.cost ? job.cost.usd_llm + job.cost.usd_external : null);
