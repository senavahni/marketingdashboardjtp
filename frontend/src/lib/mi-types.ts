/**
 * Tipe respons API Market Intelligence v1.0.0 — salinan bentuk kontrak 1.3
 * (backend `shared/schemas/intel-1.3*.schema.ts`) dan DTO Dashboard (`modules/intel/v13`, `modules/market-intel`).
 */

export const JOB_KINDS = ['company_discovery', 'company_import', 'contact_finder', 'social_listening', 'book_ingest', 'opportunity_scoring', 'strategy', 'content_bank'] as const;
export type JobKind = (typeof JOB_KINDS)[number];
export type Job13Status = 'queued' | 'running' | 'awaiting_review' | 'paused' | 'completed' | 'failed' | 'cancelling' | 'cancelled';
export type StageStatus = 'pending' | 'running' | 'awaiting_review' | 'paused' | 'completed' | 'skipped' | 'failed' | 'cancelled';
export type PauseReason = 'captcha' | 'budget' | 'manual' | 'local_model_unavailable';
export type ReviewSubject =
  | 'product_analysis'
  | 'keyword_set'
  | 'strategy'
  | 'content_batch'
  | 'knowledge_card'
  | 'doctrine'
  | 'contact_batch'
  | 'import_review'
  | 'mission_plan';

export interface ErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
}

export interface StageView {
  stage: string;
  agent_key: string | null;
  status: StageStatus;
  progress: { done: number; total?: number | null };
  started_at?: string | null;
  finished_at?: string | null;
  review?: { review_id: string; subject_type: ReviewSubject; subject_ref: string; summary: string; non_blocking: boolean } | null;
  error?: ErrorInfo | null;
}

export interface PauseInfo {
  reason: PauseReason;
  message: string;
  since: string;
  resume_hint?: string | null;
  stage?: string | null;
}

export interface Cost13 {
  llm_tokens: number;
  usd_llm: number;
  external_units: number;
  usd_external: number;
  budget_usd?: number | null;
}

export interface Estimate13 {
  kind: JobKind;
  duration_seconds: { min: number; max: number };
  llm: { tokens_est: number; usd_est: number; llm_assist_usd_est: number; by_stage: { stage: string; agent_key: string; route: string; tokens_est: number }[] };
  external: { units: number; usd: number };
  requires_confirmation: boolean;
  warnings: { code: string; message: string }[];
}

export interface Job13 {
  id: string;
  workspace_id: string;
  kind: JobKind;
  title: string;
  status: Job13Status;
  spec: { kind: JobKind; params: Record<string, unknown>; llm_assist: boolean; budget_usd: number | null };
  llm_assist: boolean;
  budget_usd: number | null;
  estimate: Estimate13 | null;
  mcp_job_id: string | null;
  stages: StageView[];
  pause: PauseInfo | null;
  result: { summary?: string | null; counts?: Record<string, number>; refs?: Record<string, string>; partial?: boolean } | null;
  cost: Cost13 | null;
  error: (ErrorInfo & { stage?: string | null }) | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** Bagian spec yang sama untuk semua kind (wizard: langkah Batas & biaya). */
export interface JobLimits {
  llm_assist: boolean;
  budget_usd: number | null;
}

export interface Approval {
  id: string;
  subject_type: ReviewSubject;
  subject_ref: string;
  intel_job_id: string | null;
  mcp_review_id: string | null;
  summary: string | null;
  non_blocking: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'revise';
  requested_by_agent: string | null;
  decided_by: string | null;
  decided_at: string | null;
  comment: string | null;
  created_at: string;
  can_decide: boolean;
  intel_job: { id: string; kind: JobKind | null; title: string } | null;
}

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
  total_estimate: number;
}

// ---------------------------------------------------------------- upload & import
export type UploadPurpose = 'book' | 'brand' | 'import';
export interface UploadRef {
  id: string;
  upload_id: string;
  kind: 'pdf' | 'xlsx' | 'csv';
  purpose: UploadPurpose;
  filename: string;
  size: number;
  status: string;
  created_at: string;
}

export interface UploadProfile {
  upload_id: string;
  sheets: { name: string; rows_estimate: number; headers: string[]; preview: string[][] }[];
}

export type ImportStatus = 'profiling' | 'mapping' | 'inserting' | 'completed' | 'failed' | 'rolled_back';
export interface ImportBatch {
  batch_id: string;
  upload_id: string;
  dashboard_job_id: string | null;
  filename: string;
  sheet: string | null;
  mode: 'fill_db' | 'contact_targets';
  status: ImportStatus;
  rows_total: number;
  rows_inserted: number;
  rows_merged: number;
  rows_review: number;
  rows_failed: number;
  created_at: string;
  rolled_back_at: string | null;
}
export interface MappingEntry {
  source_col: string;
  field: string | null;
  transform: string | null;
  confidence: number | null;
  method: 'local' | 'llm' | 'manual';
}
export interface ImportBatchDetail extends ImportBatch {
  column_mapping: MappingEntry[];
  fields: { field: string; label: string }[];
}
export interface ImportRow {
  row_id: string;
  row_no: number;
  raw: Record<string, string>;
  status: 'inserted' | 'merged' | 'review' | 'failed' | 'ignored';
  issues: string[];
  candidates: { company_id: string; name: string; address: string | null; similarity: number }[];
}
export interface RollbackImpact {
  batch_id: string;
  dry_run: boolean;
  companies_deleted: number;
  merges_reverted: number;
  kept_in_use: number;
  status: ImportStatus;
}

export type CfStatus = 'queued' | 'found' | 'ambiguous' | 'not_found' | 'needs_hint';
export interface CfHint {
  city?: string | null;
  address?: string | null;
  website?: string | null;
  keywords?: string[];
}
export interface CfCandidate {
  candidate_id: string;
  name: string;
  address: string | null;
  domain: string | null;
  distance_km: number | null;
  reason: string;
  confidence: number;
}
export interface CfTarget {
  target_id: string;
  company_id: string;
  name: string;
  kbli_code: string | null;
  region_name: string | null;
  priority: number;
  hint: CfHint;
  status: CfStatus;
  attempts: number;
  candidates: CfCandidate[];
  found: { website: string | null; phone: string | null; email_generic: string | null } | null;
  last_attempt_at: string | null;
}
export interface CfTargetList extends CursorPage<CfTarget> {
  summary: { counts: Partial<Record<CfStatus, number>>; eta_seconds: number | null; paused: { reason: PauseReason; since: string } | null };
}

// ---------------------------------------------------------------- knowledge
export type KnAssetStatus = 'uploaded' | 'extracting' | 'chunking' | 'embedding' | 'carding' | 'ready' | 'needs_ocr' | 'failed';
export interface KnAsset {
  asset_id: string;
  upload_id: string;
  title: string;
  kind: 'book' | 'brand';
  status: KnAssetStatus;
  pages: number | null;
  chunks: number | null;
  needs_ocr: boolean;
  error: { code: string; message: string } | null;
}
export interface Citation {
  asset_id: string;
  book_title: string;
  page: number;
  chapter: string | null;
}
export interface SearchResult {
  chunk_id: string;
  text: string;
  citation: Citation;
  score: number;
}
export type CardType = 'framework' | 'persuasion' | 'copy_formula' | 'content_format' | 'channel_tactic' | 'kpi' | 'anti_pattern';
export type DoctrineRole = 'analyst' | 'strategist' | 'creative';
export interface KnowledgeCard {
  card_id: string;
  asset_id: string;
  book_title: string;
  card_type: CardType;
  title: string;
  body: string;
  page_from: number;
  page_to: number;
  roles: DoctrineRole[];
  status: 'draft' | 'approved' | 'rejected';
  version: number;
}
export interface DoctrineVersion {
  version: number;
  text: string;
  tokens: number;
  card_ids: string[];
  created_at: string;
  approved_at: string | null;
}
export interface Doctrine {
  role: DoctrineRole;
  active: DoctrineVersion | null;
  pending: DoctrineVersion | null;
  history: { version: number; status: 'active' | 'superseded' | 'rejected' | 'pending'; created_at: string }[];
}
export interface PlaybookSummary {
  playbook_id: string;
  name: string;
  role: DoctrineRole;
  version: number;
  updated_at: string;
  last_run_at: string | null;
}
export interface Playbook extends PlaybookSummary {
  yaml: string;
  versions: { version: number; created_at: string; created_by: string | null }[];
  runs: { run_id: string; status: 'queued' | 'running' | 'completed' | 'failed'; started_at: string; finished_at: string | null }[];
}
export type KgNodeType = 'concept' | 'framework' | 'company' | 'segment' | 'theme' | 'product' | 'book';
export interface KgNode {
  node_id: string;
  label: string;
  type: KgNodeType;
  definition: string | null;
}
export interface KgEdge {
  edge_id: string;
  source: string;
  target: string;
  relation: string;
  provenance: { card_id: string | null; book_title: string | null; page: number | null; source_url: string | null };
}
export interface KgGraph {
  nodes: KgNode[];
  edges: KgEdge[];
  truncated: boolean;
}
export interface KgNeighbors extends KgGraph {
  node: KgNode;
  sources: Citation[];
}
