/**
 * Model & validasi wizard job (M3_TASK_004). Batas memakai INTEL_LIMITS yang sama dengan Zod backend,
 * sehingga error tampil di langkah yang tepat sebelum request dikirim.
 */
import {
  CAPABILITY_LABEL,
  INTEL_LIMITS as L,
  unsupportedSources,
  type IntelAgent,
  type IntelJob,
  type JobInput,
  type ScheduleInput,
  type SelectableStage,
  type SourceSpec,
  type SourceType,
  type StageDefaults,
} from './intel-types';

export type WizardStep = 0 | 1 | 2 | 3;
export const WIZARD_STEPS = ['Sumber & target', 'Waktu & batas', 'Agent', 'Estimasi'] as const;

export interface WizardDraft {
  title: string;
  language: 'id' | 'en';
  enabled: Record<SourceType, boolean>;
  x: { keywords: string[]; match: 'any' | 'all'; max_items: number; exclude_retweets: boolean };
  threads: { keywords: string[]; search_type: 'TOP' | 'RECENT'; max_items: number };
  web: { mode: 'scrape' | 'crawl'; urls: string[]; start_url: string; max_pages: number; max_depth: number };
  trends: { keywords: string[]; geo: string };
  since: string;
  until: string;
  aspects: string[];
  /** Simpan hasil ke Knowledge Base (tahap Indeks, M3_TASK_010). */
  saveToKb: boolean;
  agents: { collect: string; analyze: string; index?: string };
  /** Masukkan ke Penjadwalan (M3_TASK_013); `projectId` = NEW_AI_PROJECT → project baru dibuat agent. */
  schedule: { enabled: boolean; projectId: string; start: string; end: string; mode: 'auto' | 'review' };
}

export const NEW_AI_PROJECT = 'new';

const SCHEDULE_DEFAULT_DAYS = 14;
const SCHEDULE_MAX_DAYS = 180;

export type DraftErrors = Partial<Record<string, string>>;

const DAY_MS = 86_400_000;

export function isoDay(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function presetPeriod(days: number, today = new Date()): { since: string; until: string } {
  return { since: isoDay(new Date(today.getTime() - (days - 1) * DAY_MS)), until: isoDay(today) };
}

export function emptyDraft(today = new Date()): WizardDraft {
  return {
    title: '',
    language: 'id',
    enabled: { x: true, threads: false, web: false, trends: false },
    x: { keywords: [], match: 'any', max_items: L.xDefaultItems, exclude_retweets: true },
    threads: { keywords: [], search_type: 'RECENT', max_items: L.threadsDefaultItems },
    web: { mode: 'scrape', urls: [], start_url: '', max_pages: L.crawlDefaultPages, max_depth: 2 },
    trends: { keywords: [], geo: 'ID' },
    ...presetPeriod(30, today),
    aspects: [],
    saveToKb: false,
    agents: { collect: '', analyze: '' },
    schedule: {
      enabled: true,
      projectId: NEW_AI_PROJECT,
      start: isoDay(today),
      end: isoDay(new Date(today.getTime() + (SCHEDULE_DEFAULT_DAYS - 1) * DAY_MS)),
      mode: 'auto',
    },
  };
}

export const enabledSources = (d: WizardDraft): SourceType[] => (['x', 'threads', 'web', 'trends'] as const).filter((t) => d.enabled[t]);

const PRIVATE_HOST =
  /^(localhost|.*\.localhost|.*\.local|.*\.internal|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?)$/i;

/** Validasi URL di sisi klien (pemeriksaan SSRF final tetap di MCP). */
export function urlError(raw: string): string | null {
  if (raw.length > L.urlMaxChars) return `URL maksimal ${L.urlMaxChars} karakter`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'URL tidak valid';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'URL harus diawali http:// atau https://';
  if (url.username || url.password || PRIVATE_HOST.test(url.hostname)) return 'URL tidak boleh mengarah ke host privat';
  return null;
}

function keywordsError(list: string[], max: number): string | null {
  if (list.length === 0) return 'Isi minimal satu keyword';
  if (list.length > max) return `Maksimal ${max} keyword`;
  if (list.some((k) => k.length > L.keywordMaxChars)) return `Keyword maksimal ${L.keywordMaxChars} karakter`;
  return null;
}

const intIn = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;

function sourceErrors(d: WizardDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.title.trim()) e.title = 'Judul wajib diisi';
  else if (d.title.trim().length > L.titleMaxChars) e.title = `Judul maksimal ${L.titleMaxChars} karakter`;
  if (enabledSources(d).length === 0) e.sources = 'Pilih minimal satu sumber';
  const put = (key: string, msg: string | null) => msg && (e[key] = msg);
  if (d.enabled.x) put('x.keywords', keywordsError(d.x.keywords, L.keywordsMax));
  if (d.enabled.threads) put('threads.keywords', keywordsError(d.threads.keywords, L.keywordsMax));
  if (d.enabled.trends) {
    put('trends.keywords', keywordsError(d.trends.keywords, L.trendsKeywordsMax));
    if (!/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(d.trends.geo)) e['trends.geo'] = 'Kode wilayah ISO, mis. ID';
  }
  if (d.enabled.web) {
    if (d.web.mode === 'scrape') {
      if (d.web.urls.length === 0) e['web.urls'] = 'Isi minimal satu URL';
      else if (d.web.urls.length > L.urlsMax) e['web.urls'] = `Maksimal ${L.urlsMax} URL`;
      else put('web.urls', d.web.urls.map(urlError).find(Boolean) ?? null);
    } else put('web.start_url', d.web.start_url ? urlError(d.web.start_url) : 'URL awal wajib diisi');
  }
  return e;
}

function limitErrors(d: WizardDraft): DraftErrors {
  const e: DraftErrors = {};
  const since = Date.parse(d.since);
  const until = Date.parse(d.until);
  if (Number.isNaN(since) || Number.isNaN(until)) e.period = 'Tanggal tidak valid';
  else if (until < since) e.period = 'Tanggal akhir tidak boleh sebelum tanggal mulai';
  else if ((until - since) / DAY_MS + 1 > L.periodMaxDays) e.period = `Rentang maksimal ${L.periodMaxDays} hari`;
  if (d.enabled.x && !intIn(d.x.max_items, 1, L.xMaxItems)) e['x.max_items'] = `1–${L.xMaxItems.toLocaleString('id-ID')}`;
  if (d.enabled.threads && !intIn(d.threads.max_items, 1, L.threadsMaxItems))
    e['threads.max_items'] = `1–${L.threadsMaxItems.toLocaleString('id-ID')}`;
  if (d.enabled.web && d.web.mode === 'crawl') {
    if (!intIn(d.web.max_pages, 1, L.crawlMaxPages)) e['web.max_pages'] = `1–${L.crawlMaxPages}`;
    if (!intIn(d.web.max_depth, 0, L.crawlMaxDepth)) e['web.max_depth'] = `0–${L.crawlMaxDepth}`;
  }
  if (d.aspects.length > L.aspectsMax) e.aspects = `Maksimal ${L.aspectsMax} aspek`;
  else if (d.aspects.some((a) => a.length > L.aspectMaxChars)) e.aspects = `Aspek maksimal ${L.aspectMaxChars} karakter`;
  return e;
}

function agentErrors(d: WizardDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.agents.collect) e['agents.collect'] = 'Pilih agent pengumpul';
  if (!d.agents.analyze) e['agents.analyze'] = 'Pilih agent analis';
  if (d.saveToKb && !d.agents.index) e['agents.index'] = 'Pilih agent indeks';
  return { ...e, ...scheduleErrors(d) };
}

function scheduleErrors({ schedule: s }: WizardDraft): DraftErrors {
  if (!s.enabled) return {};
  const e: DraftErrors = {};
  if (!s.projectId) e['schedule.project'] = 'Pilih project penjadwalan';
  const start = Date.parse(s.start);
  const end = Date.parse(s.end);
  if (Number.isNaN(start) || Number.isNaN(end)) e['schedule.period'] = 'Tanggal tidak valid';
  else if (end < start) e['schedule.period'] = 'Tanggal selesai tidak boleh sebelum tanggal mulai';
  else if ((end - start) / DAY_MS + 1 > SCHEDULE_MAX_DAYS) e['schedule.period'] = `Timeline maksimal ${SCHEDULE_MAX_DAYS} hari`;
  return e;
}

/** Bagian `schedule` body create job (tidak ikut estimasi). */
export function draftToSchedule({ schedule: s }: WizardDraft): ScheduleInput | undefined {
  if (!s.enabled) return undefined;
  return {
    ...(s.projectId === NEW_AI_PROJECT ? {} : { project_id: s.projectId }),
    period: { start_date: s.start, end_date: s.end },
    approval_mode: s.mode,
  };
}

/** Error untuk satu langkah (langkah 3 = estimasi tidak punya field sendiri). */
export function validateStep(d: WizardDraft, step: WizardStep): DraftErrors {
  if (step === 0) return sourceErrors(d);
  if (step === 1) return limitErrors(d);
  if (step === 2) return agentErrors(d);
  return {};
}

/** Langkah pertama yang masih punya error, atau null bila draft siap dikirim. */
export function firstInvalidStep(d: WizardDraft): WizardStep | null {
  for (const step of [0, 1, 2] as const) if (Object.keys(validateStep(d, step)).length) return step;
  return null;
}

export function draftToSources(d: WizardDraft): SourceSpec[] {
  const out: SourceSpec[] = [];
  if (d.enabled.x)
    out.push({
      type: 'x',
      keywords: d.x.keywords,
      match: d.x.match,
      max_items: d.x.max_items,
      exclude_retweets: d.x.exclude_retweets,
      lang: d.language,
    });
  if (d.enabled.threads)
    out.push({ type: 'threads', keywords: d.threads.keywords, search_type: d.threads.search_type, max_items: d.threads.max_items });
  if (d.enabled.web)
    out.push(
      d.web.mode === 'scrape'
        ? { type: 'web', mode: 'scrape', urls: d.web.urls }
        : { type: 'web', mode: 'crawl', start_url: d.web.start_url, max_pages: d.web.max_pages, max_depth: d.web.max_depth },
    );
  if (d.enabled.trends) out.push({ type: 'trends', keywords: d.trends.keywords, geo: d.trends.geo });
  return out;
}

export function draftToInput(d: WizardDraft): JobInput {
  return {
    spec: {
      title: d.title.trim(),
      language: d.language,
      period: { since: d.since, until: d.until },
      sources: draftToSources(d),
      aspects: d.aspects,
    },
    agents: {
      collect: d.agents.collect,
      analyze: d.agents.analyze,
      ...(d.saveToKb && d.agents.index ? { index: d.agents.index } : {}),
    },
  };
}

/** Mode Ulangi: draft diisi dari spec + agent job lama. */
export function draftFromJob(job: IntelJob, today = new Date()): WizardDraft {
  const base = emptyDraft(today);
  const index = job.stages.find((s) => s.stage === 'index');
  const draft: WizardDraft = {
    ...base,
    title: job.spec.title,
    language: job.spec.language ?? 'id',
    enabled: { x: false, threads: false, web: false, trends: false },
    since: job.spec.period.since,
    until: job.spec.period.until,
    aspects: job.spec.stages?.analyze.aspects ?? [],
    saveToKb: !!index,
    // Ulangi tidak membuat project/jadwal baru kecuali user mengaktifkannya
    schedule: { ...base.schedule, enabled: false },
    agents: {
      collect: job.stages.find((s) => s.stage === 'collect')?.agent_id ?? '',
      analyze: job.stages.find((s) => s.stage === 'analyze')?.agent_id ?? '',
      ...(index ? { index: index.agent_id } : {}),
    },
  };
  for (const s of job.spec.sources) {
    draft.enabled = { ...draft.enabled, [s.type]: true };
    if (s.type === 'x')
      draft.x = {
        keywords: s.keywords,
        match: s.match ?? 'any',
        max_items: s.max_items ?? L.xDefaultItems,
        exclude_retweets: s.exclude_retweets ?? true,
      };
    if (s.type === 'threads')
      draft.threads = { keywords: s.keywords, search_type: s.search_type ?? 'RECENT', max_items: s.max_items ?? L.threadsDefaultItems };
    if (s.type === 'trends') draft.trends = { keywords: s.keywords, geo: s.geo ?? 'ID' };
    if (s.type === 'web')
      draft.web = {
        mode: s.mode,
        urls: s.urls ?? [],
        start_url: s.start_url ?? '',
        max_pages: s.max_pages ?? L.crawlDefaultPages,
        max_depth: s.max_depth ?? 2,
      };
  }
  return draft;
}

const SOURCE_LABEL: Record<SourceType, string> = { x: 'X', threads: 'Threads', web: 'Web', trends: 'Google Trends' };

/** Apakah agent bisa dipilih untuk tahap ini, beserta alasan bila tidak. */
export function agentOption(agent: IntelAgent, stage: SelectableStage, sources: SourceType[]): { disabled: boolean; reason?: string } {
  if (agent.reason === 'UNKNOWN_AGENT') return { disabled: true, reason: 'Tidak dikenal oleh MCP' };
  if (agent.reason === 'AGENT_INACTIVE') return { disabled: true, reason: 'Nonaktif di MCP' };
  if (!agent.capabilities.includes(stage)) return { disabled: true, reason: `Tidak punya kapabilitas ${CAPABILITY_LABEL[stage]}` };
  if (stage === 'collect') {
    const missing = unsupportedSources(agent, sources);
    if (missing.length) return { disabled: true, reason: `Tidak mendukung sumber ${missing.map((s) => SOURCE_LABEL[s]).join(', ')}` };
  }
  return { disabled: false };
}

/** Default agent tahap: dari stage-defaults bila masih bisa dipilih, selain itu agent mampu pertama (urut nama). */
export function defaultAgentId(agents: IntelAgent[], stage: SelectableStage, sources: SourceType[], defaults?: StageDefaults): string {
  const selectable = agents.filter((a) => !agentOption(a, stage, sources).disabled).sort((a, b) => a.name.localeCompare(b.name));
  const preferred = defaults?.[stage]?.id;
  return selectable.find((a) => a.id === preferred)?.id ?? selectable[0]?.id ?? '';
}

/** Kode error create yang berarti pilihan agent harus diperiksa ulang (kembali ke langkah 3). */
export const AGENT_ERROR_CODES = new Set(['AGENT_NOT_CAPABLE', 'UNKNOWN_AGENT', 'AGENT_INACTIVE']);
