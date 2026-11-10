import type {
  CardType,
  CfStatus,
  DoctrineRole,
  Estimate13,
  Job13Status,
  JobKind,
  KgNodeType,
  KnAssetStatus,
  MappingEntry,
  PauseReason,
  ReviewSubject,
  UploadPurpose,
} from './mi-types';
/** Nada semantik MI (palet §A): info biru · review biru · warn amber · success teal/hijau · danger merah-oranye. */
export type MiTone = 'idle' | 'info' | 'review' | 'warn' | 'success' | 'danger' | 'muted';
export const MI_TONE_CLASS: Record<MiTone, string> = {
  idle: 'bg-stone-100 text-stone-700',
  info: 'bg-[#E8F0FA] text-[#1D5FA8]',
  review: 'bg-[#E8F0FA] text-[#0F2340]',
  warn: 'bg-[#FEF3E2] text-[#B45309]',
  success: 'bg-[#E6F4F2] text-[#0B7A6E]',
  danger: 'bg-[#FDECE7] text-[#C2410C]',
  muted: 'bg-stone-100 text-stone-500',
};

/** Label & aturan tampilan Market Intelligence v1.0.0 (V1_TASK_003_UIUX §C, §E). Fungsi murni → diuji Vitest. */

export const KIND_LABEL: Record<JobKind, string> = {
  company_discovery: 'Cari perusahaan',
  company_import: 'Import data',
  contact_finder: 'Contact Finder',
  social_listening: 'Social listening',
  book_ingest: 'Ingest buku',
  opportunity_scoring: 'Scoring opportunity',
  strategy: 'Strategi',
  content_bank: 'Bank konten',
};

const STAGE_LABEL: Record<string, string> = {
  product_analysis: 'Analisis produk',
  discovery: 'Discovery',
  enrichment: 'Enrichment',
  index: 'Indeks',
  scoring: 'Scoring',
  profile: 'Profil file',
  mapping: 'Mapping kolom',
  normalize: 'Normalisasi',
  classify: 'Klasifikasi KBLI',
  insert: 'Simpan',
  search: 'Pencarian',
  verify: 'Verifikasi',
  crawl_contacts: 'Ambil kontak',
  keyword_expand: 'Kata kunci',
  collect: 'Kumpulkan',
  analyze: 'Analisis',
  extract: 'Ekstraksi PDF',
  chunk: 'Chunking',
  embed: 'Embedding lokal',
  cards: 'Knowledge card',
  graph: 'Knowledge graph',
  doctrine: 'Doktrin',
  fit: 'Product-fit',
  score: 'Skor',
  insight: 'Insight',
  strategize: 'Strategi',
  ideate: 'Ide konten',
  evaluate: 'Evaluasi',
  originality: 'Cek orisinalitas',
};
export const stageLabel = (stage: string): string => STAGE_LABEL[stage] ?? stage.replace(/_/g, ' ');

export const JOB13_STATUS_META: Record<Job13Status, { label: string; tone: MiTone; spinning?: boolean }> = {
  queued: { label: 'Antre', tone: 'idle' },
  running: { label: 'Berjalan', tone: 'info', spinning: true },
  awaiting_review: { label: 'Menunggu review', tone: 'review' },
  paused: { label: 'Dijeda', tone: 'warn' },
  completed: { label: 'Selesai', tone: 'success' },
  failed: { label: 'Gagal', tone: 'danger' },
  cancelling: { label: 'Membatalkan', tone: 'muted', spinning: true },
  cancelled: { label: 'Dibatalkan', tone: 'muted' },
};
export const isActive13 = (s: Job13Status): boolean => ['queued', 'running', 'awaiting_review', 'paused', 'cancelling'].includes(s);

export type BannerTone = 'amber' | 'blue' | 'red' | 'yellow';
/** Banner jeda (C.7). Tidak ada aksi "pakai CPU" untuk model lokal mati (V1-K7). */
export const PAUSE_META: Record<PauseReason, { tone: BannerTone; title: string; body: string; canResume: boolean }> = {
  captcha: {
    tone: 'amber',
    title: 'Google meminta verifikasi (CAPTCHA)',
    body: 'Buka jendela Chrome profil pencarian, selesaikan verifikasi, lalu klik Lanjutkan. Sistem tidak mengakali CAPTCHA.',
    canResume: true,
  },
  budget: { tone: 'amber', title: 'Anggaran job tercapai', body: 'Naikkan batas anggaran atau selesaikan dengan hasil sementara.', canResume: true },
  manual: { tone: 'amber', title: 'Job dijeda manual', body: 'Lanjutkan bila sudah siap.', canResume: true },
  local_model_unavailable: {
    tone: 'amber',
    title: 'Model embedding lokal (embed-local) tidak aktif',
    body: 'Pekerjaan menunggu sampai model lokal hidup. Cek status di Data → Sumber. Tidak ada jalur cadangan ke CPU.',
    canResume: true,
  },
};
export const CAPTCHA_STEPS = [
  'Buka jendela Google Chrome dengan profil pencarian yang dipakai MCP.',
  'Selesaikan verifikasi "Saya bukan robot" di halaman Google yang terbuka.',
  'Kembali ke sini lalu klik Lanjutkan — job meneruskan dari baris terakhir.',
];

export const SUBJECT_LABEL: Record<ReviewSubject, string> = {
  product_analysis: 'Analisis produk',
  keyword_set: 'Kata kunci',
  strategy: 'Strategi',
  content_batch: 'Batch konten',
  knowledge_card: 'Knowledge card',
  doctrine: 'Doktrin',
  contact_batch: 'Kontak personal',
  import_review: 'Review import',
  mission_plan: 'Rencana misi',
};
/** Keputusan PO #4 (10 Nov 2026): keputusan massal hanya untuk kartu pengetahuan (dan item konten di Bank Konten). */
export const BULK_SUBJECTS: readonly ReviewSubject[] = ['knowledge_card'];
export const canBulkDecide = (subject: ReviewSubject): boolean => BULK_SUBJECTS.includes(subject);

export const CF_STATUS_META: Record<CfStatus, { label: string; tone: MiTone; glyph: string }> = {
  queued: { label: 'Antre', tone: 'idle', glyph: '◷' },
  found: { label: 'Ditemukan', tone: 'success', glyph: '✔' },
  ambiguous: { label: 'Ambigu', tone: 'warn', glyph: '?' },
  not_found: { label: 'Tidak ditemukan', tone: 'danger', glyph: '✖' },
  needs_hint: { label: 'Butuh petunjuk', tone: 'info', glyph: 'i' },
};

export const ASSET_STATUS_META: Record<KnAssetStatus, { label: string; tone: MiTone; processing: boolean }> = {
  uploaded: { label: 'Terunggah', tone: 'idle', processing: true },
  extracting: { label: 'Ekstraksi', tone: 'info', processing: true },
  chunking: { label: 'Chunking', tone: 'info', processing: true },
  embedding: { label: 'Embedding', tone: 'info', processing: true },
  carding: { label: 'Membuat kartu', tone: 'info', processing: true },
  ready: { label: 'Siap', tone: 'success', processing: false },
  needs_ocr: { label: 'Perlu OCR', tone: 'warn', processing: false },
  failed: { label: 'Gagal', tone: 'danger', processing: false },
};
export const ASSET_PIPELINE: KnAssetStatus[] = ['uploaded', 'extracting', 'chunking', 'embedding', 'carding', 'ready'];

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  framework: 'Framework strategi',
  persuasion: 'Prinsip persuasi',
  copy_formula: 'Formula copywriting',
  content_format: 'Format konten',
  channel_tactic: 'Taktik channel',
  kpi: 'KPI',
  anti_pattern: 'Anti-pola',
};
export const ROLE_LABEL: Record<DoctrineRole, string> = { analyst: 'Analyst', strategist: 'Strategist', creative: 'Creative' };

/** Bentuk + warna per tipe node (bukan hanya warna — WCAG 1.4.1). */
export const KG_TYPE_META: Record<KgNodeType, { label: string; color: string; shape: 'circle' | 'square' | 'diamond' | 'triangle' }> = {
  concept: { label: 'Konsep', color: '#1D5FA8', shape: 'circle' },
  framework: { label: 'Framework', color: '#0E9384', shape: 'square' },
  company: { label: 'Perusahaan', color: '#0F2340', shape: 'diamond' },
  segment: { label: 'Segmen', color: '#B45309', shape: 'triangle' },
  theme: { label: 'Tema', color: '#7C3AED', shape: 'circle' },
  product: { label: 'Produk', color: '#C2410C', shape: 'square' },
  book: { label: 'Buku', color: '#5B6474', shape: 'diamond' },
};

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export function confidenceLevel(v: number): ConfidenceLevel {
  if (v >= 0.8) return 'high';
  return v >= 0.5 ? 'medium' : 'low';
}
export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };

/** Durasi panjang (rem volume Chrome): "±1,5 hari", "±6 jam", "±20 mnt". */
export function formatEta(seconds: number): string {
  const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
  if (seconds >= 86_400) return `±${nf.format(seconds / 86_400)} hari`;
  if (seconds >= 3_600) return `±${nf.format(seconds / 3_600)} jam`;
  return `±${Math.max(1, Math.round(seconds / 60))} mnt`;
}

export function formatDurationRange(d: Estimate13['duration_seconds']): string {
  return d.min === d.max ? formatEta(d.min) : `${formatEta(d.min)} – ${formatEta(d.max).replace('±', '')}`;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n / 1024 / 1024)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export const MAPPING_REVIEW_THRESHOLD = 0.7;
/** Ringkasan mapping (C.6): confidence rendah di atas, kolom diabaikan di bawah; urutan stabil. */
export function sortMapping(entries: MappingEntry[]): MappingEntry[] {
  const rank = (m: MappingEntry) => (m.field === null ? 2 : (m.confidence ?? 1) < MAPPING_REVIEW_THRESHOLD ? 0 : 1);
  return entries.map((m, i) => ({ m, i })).sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i).map(({ m }) => m);
}
export const averageConfidence = (entries: MappingEntry[]): number | null => {
  const known = entries.filter((m) => m.field !== null && m.confidence !== null).map((m) => m.confidence as number);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};
/** Mapping berubah dari hasil agent → kirim sebagai override `column_mapping` (method manual). */
export function mappingChanged(original: MappingEntry[], edited: MappingEntry[]): boolean {
  const key = (m: MappingEntry) => `${m.source_col}=${m.field ?? ''}`;
  return original.map(key).sort().join('|') !== edited.map(key).sort().join('|');
}

export const UPLOAD_LIMITS: Record<UploadPurpose, { exts: string[]; maxBytes: number; label: string }> = {
  book: { exts: ['pdf'], maxBytes: 100 * 1024 * 1024, label: 'PDF maks 100 MB' },
  brand: { exts: ['pdf'], maxBytes: 100 * 1024 * 1024, label: 'PDF maks 100 MB' },
  import: { exts: ['xlsx', 'csv'], maxBytes: 20 * 1024 * 1024, label: 'XLSX/CSV maks 20 MB · 50.000 baris' },
};
/** Cek awal di browser (server tetap memvalidasi ukuran & magic bytes). */
export function validateUploadFile(file: { name: string; size: number }, purpose: UploadPurpose): string | null {
  const rule = UPLOAD_LIMITS[purpose];
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  if (!rule.exts.includes(ext)) return `Jenis file tidak didukung — ${rule.label}`;
  if (file.size === 0) return 'File kosong';
  if (file.size > rule.maxBytes) return `Ukuran ${formatBytes(file.size)} melebihi batas (${rule.label})`;
  return null;
}

/** Budget di bawah estimasi → peringatan (bukan blokir). */
export function budgetWarning(budget: number | null, estimate: Estimate13 | null | undefined, llmAssist: boolean): string | null {
  if (budget === null || !estimate) return null;
  const est = estimate.llm.usd_est + estimate.external.usd + (llmAssist ? estimate.llm.llm_assist_usd_est : 0);
  return budget < est ? `Budget $${budget.toFixed(2)} di bawah estimasi $${est.toFixed(2)} — job akan dijeda saat anggaran tercapai` : null;
}

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string };
/** Diff baris sederhana (LCS) untuk membandingkan versi doktrin. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ kind: 'del', text: a[i++] });
    else out.push({ kind: 'add', text: b[j++] });
  }
  while (i < a.length) out.push({ kind: 'del', text: a[i++] });
  while (j < b.length) out.push({ kind: 'add', text: b[j++] });
  return out;
}
