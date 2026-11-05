/**
 * Tipe respons API Intel Modul 3 — salinan bentuk kontrak 1.2 (backend `shared/schemas/intel.schema.ts`)
 * dan DTO Dashboard (`modules/intel/intel.service.ts`).
 */

export type Capability = 'collect' | 'analyze' | 'index';
export type SelectableStage = 'collect' | 'analyze' | 'index';
export type KeySource = 'agent' | 'system' | 'env';
export type SourceType = 'x' | 'threads' | 'web' | 'trends';
export type Sentiment = 'positive' | 'neutral' | 'negative';
export type JobStatus = 'queued' | 'collecting' | 'analyzing' | 'indexing' | 'completed' | 'failed' | 'cancelling' | 'cancelled';
export type StageStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed' | 'cancelled';
export type SourceMode = 'api' | 'browser' | 'unofficial' | 'none';

/** Batas validasi — identik dengan INTEL_LIMITS di backend (Zod) & MCP (Pydantic). */
export const INTEL_LIMITS = {
  maxSources: 4,
  keywordsMax: 10,
  keywordMaxChars: 100,
  trendsKeywordsMax: 5,
  xMaxItems: 5_000,
  xDefaultItems: 500,
  threadsMaxItems: 2_000,
  threadsDefaultItems: 300,
  urlsMax: 50,
  urlMaxChars: 2_048,
  crawlMaxPages: 200,
  crawlDefaultPages: 50,
  crawlMaxDepth: 3,
  aspectsMax: 10,
  aspectMaxChars: 40,
  periodMaxDays: 366,
  titleMaxChars: 150,
  queryMaxChars: 100,
} as const;

export type IntelAgent = {
  id: string;
  name: string;
  mcp_agent_key: string;
  capabilities: Capability[];
  toolsets?: string[];
  is_active?: boolean;
  route?: string;
  run_token_budget?: number;
  gateway_key?: { source: KeySource; prefix?: string | null };
  reason?: 'UNKNOWN_AGENT' | 'AGENT_INACTIVE';
};

/** Profil agent di MCP (sumber autocomplete "MCP agent key"). */
export type McpProfile = {
  agent_key: string;
  display_name: string;
  is_active: boolean;
  capabilities: Capability[];
  used_by: { id: string; name: string } | null;
};

export type StageDefaults =Partial<Record<SelectableStage, { id: string; name: string; mcp_agent_key: string }>>;

export type LlmAgentStatus = {
  agent_key: string;
  key_source: KeySource;
  key_prefix?: string | null;
  key_status: 'active' | 'revoked' | 'invalid' | 'unknown';
  last_error?: string | null;
  usage: { calls: number; prompt_tokens: number; completion_tokens: number; usd: number };
};

export type LlmStatus = {
  agents: LlmAgentStatus[];
  project?: { slug?: string | null; start: string; end: string; data: Record<string, unknown>[] } | null;
};

// ---------------------------------------------------------------------------- spec

export type XSource = {
  type: 'x';
  keywords: string[];
  match?: 'any' | 'all';
  lang?: string | null;
  exclude_retweets?: boolean;
  exclude_replies?: boolean;
  max_items?: number;
  provider?: 'auto' | 'x_api' | 'browser';
};
export type ThreadsSource = { type: 'threads'; keywords: string[]; search_type?: 'TOP' | 'RECENT'; max_items?: number };
export type WebSource = {
  type: 'web';
  mode: 'scrape' | 'crawl';
  urls?: string[] | null;
  start_url?: string | null;
  max_pages?: number;
  max_depth?: number;
  include_patterns?: string[];
};
export type TrendsSource = { type: 'trends'; keywords: string[]; geo?: string };
export type SourceSpec = XSource | ThreadsSource | WebSource | TrendsSource;

/** Spec yang disimpan di job (format MCP, termasuk agent per tahap). */
export type JobSpec = {
  title: string;
  language: 'id' | 'en';
  period: { since: string; until: string };
  sources: SourceSpec[];
  stages?: { collect: { agent_key: string }; analyze: { agent_key: string; aspects?: string[] } };
};

/** Body POST jobs / jobs/estimate (agent dipilih dengan ID agent Dashboard). */
export type JobInput = {
  spec: { title: string; language: 'id' | 'en'; period: { since: string; until: string }; sources: SourceSpec[]; aspects: string[] };
  /** `index` diisi = simpan hasil ke Knowledge Base (M3_TASK_010). */
  agents: { collect: string; analyze: string; index?: string };
};

/** "Masukkan ke Penjadwalan" (M3_TASK_013) — hanya untuk create, tidak ikut estimasi. */
export type ScheduleInput = { project_id?: string; period: { start_date: string; end_date: string }; approval_mode: 'auto' | 'review' };

// ---------------------------------------------------------------------------- misi (M3_TASK_013)

export type MissionStatus =
  | 'waiting_research'
  | 'planning'
  | 'awaiting_review'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PlanItem = {
  ref: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  priority: 'none' | 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  executor: 'agent' | 'human';
  agent_key?: string | null;
  depends_on: string[];
};
export type PlanTask = PlanItem & { subtasks: PlanItem[] };
export type MissionPlan = { summary: string; assumptions: string[]; risks: { code: string; message: string }[]; tasks: PlanTask[] };

export type Mission = {
  id: string;
  workspace_id: string;
  project_id: string;
  source: 'intel_job' | 'manual';
  intel_job_id: string | null;
  title: string;
  start_date: string;
  end_date: string;
  approval_mode: 'auto' | 'review';
  status: MissionStatus;
  plan: MissionPlan | null;
  plan_revision: number;
  revisions_left: number;
  root_task_id: string | null;
  cost_usd: number;
  error: { code: string; message: string } | null;
  agent: { id: string; name: string; mcp_agent_key: string };
};

export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  waiting_research: 'Menunggu riset selesai',
  planning: 'Agent menyusun rencana…',
  awaiting_review: 'Menunggu tinjauan',
  scheduled: 'Terjadwal di Penjadwalan',
  running: 'Berjalan',
  paused: 'Dijeda',
  completed: 'Selesai',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
};

// ---------------------------------------------------------------------------- hasil

export type Table = { cols: string[]; rows: unknown[][] };
export type Warning = { code: string; message: string };
export type ErrorInfo = { code: string; message: string; retryable?: boolean; stage?: string | null };

export type Estimate = {
  seconds: number;
  sources: { type: SourceType; mode: SourceMode; external_units: number; usd_external: number }[];
  llm: { tokens_est: number; usd_est: number; by_stage: { stage: string; agent_key: string; route: string; tokens_est: number }[] };
  requires_confirmation: boolean;
  warnings: Warning[];
};

export type CostView = {
  llm_tokens: number;
  usd_llm: number;
  external_units: number;
  usd_external: number;
  by_stage: { stage: string; agent_key: string; llm_tokens: number; usd_llm: number }[];
};

export type PostExample = {
  id: string;
  source: string;
  author?: string | null;
  text: string;
  url?: string | null;
  created_at?: string | null;
};

export type SentimentResult = {
  distribution: Record<Sentiment, number>;
  net_sentiment: number;
  by_day: Table;
  aspects?: Table | null;
  examples: { positive: PostExample[]; negative: PostExample[] };
};

export type TrendsResult = {
  topics: { label: string; count: number; share: number }[];
  hashtags: [string, number][];
  authors: [string, number][];
};

export type GoogleTrends = {
  summary?: string;
  stats?: { share_of_search?: Record<string, number> };
  items?: Table;
};

export type Insight = {
  summary_md: string | null;
  recommendations: string[];
  sentiment: SentimentResult | null;
  trends: TrendsResult | null;
  volume_by_day: Table | null;
  google_trends: GoogleTrends | null;
  partial: boolean;
  warnings: Warning[];
  generated_at: string;
};

export type JobStage = {
  stage: Capability;
  agent_id: string;
  agent_key: string;
  status: StageStatus;
  progress_done: number;
  progress_total: number | null;
  error: ErrorInfo | null;
  started_at: string | null;
  finished_at: string | null;
  /** Statistik `intel.job.stage.completed` (index: documents, created, skipped, chunks, collection). */
  stats?: { documents?: number; chunks?: number; [key: string]: unknown } | null;
};

export type IntelJob = {
  id: string;
  workspace_id: string;
  title: string;
  status: JobStatus;
  spec: JobSpec;
  sources: SourceType[];
  estimate: Estimate | null;
  mcp_job_id: string | null;
  total_items: number | null;
  items_expire_at: string | null;
  cost: CostView | null;
  error: ErrorInfo | null;
  retry_of_job_id: string | null;
  created_by: string | null;
  stages: JobStage[];
  insight: Insight | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  insight_pending: boolean;
};

export type SourcesStatus = {
  sources: { source: SourceType; available: boolean; mode: SourceMode; detail: string; checked_at: string }[];
  llm: { routes: { route: string; available: boolean }[] };
  checked_at: string;
};

export type ItemsPage = { cols: string[]; rows: unknown[][]; total: number; next_cursor?: string | null; expires_at?: string | null };

export type JobEvent = { event_id: string; event_type: string; status: string; received_at: string; processed_at: string | null };

/** Payload Socket.IO `intel.job.updated`. */
export type JobUpdatedEvent = {
  id: string;
  status: JobStatus;
  stages: { stage: Capability; status: StageStatus; progress: { done: number; total: number | null } }[];
  total_items: number | null;
  /** Kata terbaru tahap index untuk animasi stream 3D (M3_TASK_011); hanya bila ada. */
  sample_tokens?: string[];
};

export const CAPABILITY_LABEL: Record<Capability, string> = { collect: 'Kumpulkan', analyze: 'Analisis', index: 'Indeks' };
export const STAGE_LABEL: Record<SelectableStage, string> = {
  collect: 'Kumpulkan data',
  analyze: 'Analisis',
  index: 'Indeks ke Knowledge Base',
};
export const KEY_SOURCE_LABEL: Record<KeySource, string> = { agent: 'Key agent', system: 'Key system', env: 'Key env (fallback)' };

/** Toolset MCP yang dibutuhkan tiap tipe sumber (sama dengan MCP capabilities.py). */
export const SOURCE_TOOLSET: Record<SourceType, string> = { x: 'social', threads: 'social', web: 'web', trends: 'trends' };

/** Agent yang boleh dipilih untuk tahap tertentu: aktif di MCP dan punya kapabilitasnya. */
export function capableFor(agents: IntelAgent[], stage: SelectableStage): IntelAgent[] {
  return agents.filter((a) => !a.reason && a.capabilities.includes(stage));
}

/** Tipe sumber yang tidak didukung toolset agent pengumpul (kosong = semua didukung / toolset tidak diketahui). */
export function unsupportedSources(agent: IntelAgent | undefined, sources: SourceType[]): SourceType[] {
  if (!agent?.toolsets) return [];
  return sources.filter((s) => !agent.toolsets!.includes(SOURCE_TOOLSET[s]));
}
