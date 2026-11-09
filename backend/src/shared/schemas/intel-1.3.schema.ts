import { z } from 'zod';
import { uuid } from './common.schema';
import { agentKey, costViewSchema, mcpJobId, periodSchema } from './intel.schema';

/**
 * Kontrak 1.3 Dashboard ↔ MCP (DSH-V1-00 / MCP-V1-00) — ADITIF terhadap 1.2:
 * - job `kind` baru dengan parameter per kind, `llm_assist` (default false) & `budget_usd` di semua job;
 * - status job baru `awaiting_review` & `paused`; tool review & resume;
 * - event baru (`intel.job.awaiting_review`, `intel.job.paused`, `intel.company.upserted`, `ci.import.status`,
 *   `kn.asset.status`, `opp.scores.updated`, `ct.batch.ready`);
 * - pagination seragam (`cursor`, `limit ≤ 200`, `total_estimate`) & kode error baru.
 * Tool & schema 1.2 (`intel.schema.ts`) TIDAK berubah. Batas di sini harus identik dengan Pydantic MCP;
 * keduanya diuji terhadap fixture bersama `contracts/1.3/` (test/contract/intel-1.3-fixtures.spec.ts).
 */

export const CONTRACT_13_VERSION = '1.3';
/** Versi kontrak yang membawa fitur 1.3 (1.3, 1.4, …, 1.10, …). */
export const contract13Version = z.string().regex(/^1\.([3-9]|\d{2,})$/, 'contract_version harus ≥ 1.3');

export const LIMITS_13 = {
  pageMax: 200,
  pageDefault: 50,
  budgetUsdMax: 100,
  pdfMaxBytes: 100 * 1024 * 1024,
  sheetMaxBytes: 20 * 1024 * 1024,
  importMaxRows: 50_000,
  discoveryMaxCompanies: 500,
  discoveryDefaultCompanies: 50,
  regionCodesMax: 38,
  contactTargetsMax: 1_000,
  keywordsMax: 10,
  contentCountMax: 60,
  contentCountDefault: 30,
  insightRefsMax: 20,
  objectiveMaxChars: 500,
  feedbackMaxChars: 2_000,
  summaryMaxChars: 500,
  messageMaxChars: 300,
} as const;
const L = LIMITS_13;

export const JOB_KINDS = [
  'company_discovery',
  'company_import',
  'contact_finder',
  'social_listening',
  'book_ingest',
  'opportunity_scoring',
  'strategy',
  'content_bank',
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

/** Tahap per kind (urutan eksekusi). Tahap bertanda review berhenti di `awaiting_review` sampai diputuskan manusia. */
export const KIND_STAGES: Record<JobKind, readonly string[]> = {
  company_discovery: ['product_analysis', 'discovery', 'enrichment', 'index', 'scoring'],
  company_import: ['profile', 'mapping', 'normalize', 'classify', 'insert'],
  contact_finder: ['search', 'verify', 'crawl_contacts'],
  social_listening: ['keyword_expand', 'collect', 'analyze', 'index'],
  book_ingest: ['extract', 'chunk', 'embed', 'cards', 'graph', 'doctrine'],
  opportunity_scoring: ['fit', 'score'],
  strategy: ['insight', 'strategize'],
  content_bank: ['ideate', 'evaluate', 'originality'],
};

export const JOB_STATUSES_13 = [
  'queued',
  'collecting',
  'analyzing',
  'indexing',
  'running',
  'awaiting_review',
  'paused',
  'completed',
  'failed',
  'cancelling',
  'cancelled',
] as const;
export const STAGE_STATUSES_13 = ['pending', 'running', 'awaiting_review', 'paused', 'completed', 'skipped', 'failed', 'cancelled'] as const;
export const PAUSE_REASONS = ['captcha', 'budget', 'manual', 'local_model_unavailable'] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

export const REVIEW_SUBJECTS = [
  'product_analysis',
  'keyword_set',
  'strategy',
  'content_batch',
  'knowledge_card',
  'doctrine',
  'contact_batch',
  'import_review',
  'mission_plan',
] as const;
export type ReviewSubject = (typeof REVIEW_SUBJECTS)[number];

/** Kode error baru 1.3 (dikembalikan tool MCP / `POST /uploads`). */
export const ERROR_CODES_13 = ['UPLOAD_TOO_LARGE', 'UNSUPPORTED_FILE', 'REVIEW_REQUIRED', 'CAPTCHA_REQUIRED', 'LOCAL_MODEL_UNAVAILABLE'] as const;

export const CONTENT_PLATFORMS = ['instagram', 'tiktok', 'linkedin', 'x', 'threads'] as const;
export const ORG_TYPES = ['company', 'government', 'education', 'health', 'ngo', 'other'] as const;
export const COMPANY_ORIGINS = ['discovery', 'import', 'manual'] as const;
export const SOCIAL_PLATFORMS = ['x', 'threads', 'trends'] as const;

// ---------------------------------------------------------------------------- primitif

export const stageName = z.string().regex(/^[a-z][a-z_]{1,31}$/, 'nama tahap tidak valid');
export const uploadId = z.string().regex(/^u_[0-9a-z]{10}$/, 'upload_id tidak valid');
export const reviewId = z.string().regex(/^r_[0-9a-z]{10}$/, 'review_id tidak valid');
export const mcpRef = z.string().regex(/^[a-z]{1,4}_[0-9a-z]{10}$/, 'referensi MCP tidak valid');
/** Kode wilayah Kemendagri: provinsi `NN` atau kab/kota `NN.NN`. */
export const regionCode = z.string().regex(/^\d{2}(\.\d{2})?$/, 'kode wilayah Kemendagri tidak valid');
export const kbliCode = z.string().regex(/^\d{1,5}$/, 'kode KBLI tidak valid');
const awareDatetime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();
const fraction = z.number().min(0).max(1);
const text = (max: number) => z.string().trim().min(1).max(max);

const datePeriod = z
  .strictObject({ since: isoDate, until: isoDate })
  .refine((v) => Date.parse(v.until) >= Date.parse(v.since), { message: 'until tidak boleh sebelum since', path: ['until'] });

// ---------------------------------------------------------------------------- parameter per kind

export const companyDiscoveryParams = z.strictObject({
  product_id: uuid,
  region: z.strictObject({
    scope: z.enum(['national', 'province', 'regency_city']),
    codes: z.array(regionCode).max(L.regionCodesMax).default([]),
  }),
  max_companies: z.number().int().min(1).max(L.discoveryMaxCompanies).default(L.discoveryDefaultCompanies),
});

const columnMappingEntry = z.strictObject({
  source_col: text(200),
  field: z.string().regex(/^[a-z][a-z0-9_.]{1,63}$/),
  transform: z.string().max(64).nullable().optional(),
});

export const companyImportParams = z.strictObject({
  upload_id: uploadId,
  sheet: z.string().max(100).nullable().optional(),
  mode: z.enum(['fill_db', 'contact_targets']),
  /** Diisi saat pengguna mengubah ringkasan mapping lalu menjalankan ulang. */
  column_mapping: z.array(columnMappingEntry).max(200).nullable().optional(),
});

export const contactFinderParams = z
  .strictObject({
    target_ids: z.array(uuid).min(1).max(L.contactTargetsMax).nullable().optional(),
    import_batch_id: mcpRef.nullable().optional(),
    rerun_statuses: z.array(z.enum(['not_found', 'ambiguous', 'needs_hint'])).default([]),
  })
  .refine((v) => Boolean(v.target_ids?.length) || Boolean(v.import_batch_id), {
    message: 'butuh target_ids atau import_batch_id',
    path: ['target_ids'],
  });

export const socialListeningParams = z.strictObject({
  product_id: uuid,
  /** Kosong → `researcher` mengekspansi kata kunci dari produk (tahap review `keyword_set`). */
  keywords: z.array(text(100)).max(L.keywordsMax).default([]),
  platforms: z
    .array(z.enum(SOCIAL_PLATFORMS))
    .min(1)
    .refine((v) => new Set(v).size === v.length, 'platform duplikat'),
  period: periodSchema,
});

export const bookIngestParams = z.strictObject({
  upload_id: uploadId,
  asset_kind: z.enum(['book', 'brand']),
  title: text(200),
  author: z.string().max(200).nullable().optional(),
  usage_rights_confirmed: z.literal(true, { message: 'hak pakai internal wajib dikonfirmasi' }),
});

export const opportunityScoringParams = z.strictObject({
  product_id: uuid,
  company_filter: z
    .strictObject({
      kbli_codes: z.array(kbliCode).max(50).default([]),
      region_codes: z.array(regionCode).max(L.regionCodesMax).default([]),
      org_types: z.array(z.enum(ORG_TYPES)).default([]),
    })
    .default({ kbli_codes: [], region_codes: [], org_types: [] }),
  score_model_version: z.string().max(32).nullable().optional(),
});

export const strategyParams = z.strictObject({
  product_id: uuid,
  segment_refs: z.array(mcpRef).max(20).default([]),
  objective: text(L.objectiveMaxChars),
  period: datePeriod,
  insight_refs: z
    .array(z.strictObject({ kind: z.enum(['social_report', 'segment', 'opportunity']), ref: z.string().max(64) }))
    .max(L.insightRefsMax)
    .default([]),
  /** Revisi (`st_revise`): laporan strategi sebelumnya + umpan balik reviewer. */
  revise_of: z.strictObject({ report_id: mcpRef, feedback: text(L.feedbackMaxChars) }).nullable().optional(),
});

export const contentBankParams = z.strictObject({
  strategy_report_id: mcpRef,
  count: z.number().int().min(1).max(L.contentCountMax).default(L.contentCountDefault),
  platforms: z
    .array(z.enum(CONTENT_PLATFORMS))
    .min(1)
    .refine((v) => new Set(v).size === v.length, 'platform duplikat'),
  period: datePeriod,
  feedback: z.string().max(L.feedbackMaxChars).nullable().optional(),
});

export const KIND_PARAMS = {
  company_discovery: companyDiscoveryParams,
  company_import: companyImportParams,
  contact_finder: contactFinderParams,
  social_listening: socialListeningParams,
  book_ingest: bookIngestParams,
  opportunity_scoring: opportunityScoringParams,
  strategy: strategyParams,
  content_bank: contentBankParams,
} satisfies Record<JobKind, z.ZodType>;

// ---------------------------------------------------------------------------- JobSpec 1.3

const specBase = {
  title: text(150),
  language: z.enum(['id', 'en']).default('id'),
  llm_assist: z.boolean().default(false),
  budget_usd: z.number().min(0).max(L.budgetUsdMax).nullable().default(null),
  /** Override agent per tahap; tahap yang tidak disebut memakai default MCP untuk kind tsb. */
  agents: z.record(stageName, agentKey).default({}),
};

function specFor<K extends JobKind>(kind: K) {
  return z.strictObject({ kind: z.literal(kind), ...specBase, params: KIND_PARAMS[kind] });
}

export const jobSpec13Schema = z
  .discriminatedUnion('kind', [
    specFor('company_discovery'),
    specFor('company_import'),
    specFor('contact_finder'),
    specFor('social_listening'),
    specFor('book_ingest'),
    specFor('opportunity_scoring'),
    specFor('strategy'),
    specFor('content_bank'),
  ])
  .superRefine((spec, ctx) => {
    const allowed = new Set(KIND_STAGES[spec.kind]);
    for (const stage of Object.keys(spec.agents)) {
      if (!allowed.has(stage)) ctx.addIssue({ code: 'custom', message: `tahap ${stage} tidak ada di kind ${spec.kind}`, path: ['agents', stage] });
    }
  });
export type JobSpec13 = z.infer<typeof jobSpec13Schema>;

// ---------------------------------------------------------------------------- input tool job

export const jobEstimate13InputSchema = z.strictObject({ workspace_id: uuid, spec: jobSpec13Schema });

export const jobCreate13InputSchema = z.strictObject({
  contract_version: contract13Version,
  dashboard_job_id: uuid,
  workspace_id: uuid,
  requested_by: z.strictObject({ user_id: uuid, name: z.string().max(100) }),
  spec: jobSpec13Schema,
  confirm_cost: z.boolean().default(false),
});

export const jobReviewInputSchema = z
  .strictObject({
    workspace_id: uuid,
    mcp_job_id: mcpJobId,
    review_id: reviewId,
    decision: z.enum(['approve', 'reject', 'revise']),
    /** Perubahan reviewer (mis. segmen/kata kunci yang diedit); bentuk bergantung pada subject. */
    edits: z.record(z.string(), z.unknown()).nullable().optional(),
    comment: z.string().max(L.feedbackMaxChars).nullable().optional(),
    decided_by: z.strictObject({ user_id: uuid, name: z.string().max(100) }),
  })
  .refine((v) => v.decision !== 'revise' || Boolean(v.comment?.trim()), { message: 'revise butuh comment', path: ['comment'] });

export const jobResumeInputSchema = z.strictObject({ workspace_id: uuid, mcp_job_id: mcpJobId });

// ---------------------------------------------------------------------------- output tool job

const warningSchema = z.object({ code: z.string().max(48), message: z.string().max(300) });
const errorInfoSchema = z.object({ code: z.string().max(48), message: z.string().max(500), retryable: z.boolean() });

export const estimate13Schema = z.object({
  kind: z.enum(JOB_KINDS),
  /** Rentang durasi (rem volume Chrome membuat discovery bisa berjalan berjam-jam/berhari-hari). */
  duration_seconds: z.object({ min: z.number().int().min(0), max: z.number().int().min(0) }),
  llm: z.object({
    tokens_est: z.number().int().min(0),
    usd_est: z.number().min(0),
    llm_assist_usd_est: z.number().min(0).default(0),
    by_stage: z.array(z.object({ stage: stageName, agent_key: z.string(), route: z.string(), tokens_est: z.number().int().min(0) })),
  }),
  external: z.object({ units: z.number().int().min(0), usd: z.number().min(0) }),
  requires_confirmation: z.boolean(),
  warnings: z.array(warningSchema).default([]),
});
export type Estimate13 = z.infer<typeof estimate13Schema>;

export const jobAccepted13Schema = z.object({ accepted: z.literal(true), mcp_job_id: mcpJobId, kind: z.enum(JOB_KINDS), estimate: estimate13Schema });

export const reviewInfoSchema = z.object({
  review_id: reviewId,
  subject_type: z.enum(REVIEW_SUBJECTS),
  subject_ref: z.string().max(64),
  summary: z.string().max(L.summaryMaxChars),
  /** true = tidak memblokir job (mis. antrean review baris import). */
  non_blocking: z.boolean().default(false),
});

export const pauseInfoSchema = z.object({
  reason: z.enum(PAUSE_REASONS),
  message: z.string().max(L.messageMaxChars),
  since: awareDatetime,
  resume_hint: z.string().max(L.messageMaxChars).nullable().optional(),
});

export const stageView13Schema = z.object({
  stage: stageName,
  agent_key: z.string().nullable(),
  status: z.enum(STAGE_STATUSES_13),
  progress: z.object({ done: z.number().int().min(0), total: z.number().int().min(0).nullable().optional() }).default({ done: 0 }),
  started_at: awareDatetime.nullable().optional(),
  finished_at: awareDatetime.nullable().optional(),
  review: reviewInfoSchema.nullable().optional(),
  error: errorInfoSchema.nullable().optional(),
});
export type StageView13 = z.infer<typeof stageView13Schema>;

export const costView13Schema = costViewSchema.extend({
  by_stage: z.array(z.object({ stage: stageName, agent_key: z.string(), llm_tokens: z.number().int().min(0), usd_llm: z.number().min(0) })).default([]),
  budget_usd: z.number().min(0).nullable().optional(),
});

export const jobView13Schema = z.object({
  mcp_job_id: mcpJobId,
  dashboard_job_id: uuid,
  kind: z.enum(JOB_KINDS),
  status: z.enum(JOB_STATUSES_13),
  stages: z.array(stageView13Schema),
  pause: pauseInfoSchema.nullable().optional(),
  /** Ringkasan hasil per kind (angka & referensi); data lengkap dibaca lewat toolset `ci_*`/`mi_*`/…. */
  result: z
    .object({
      summary: z.string().max(L.summaryMaxChars).nullable().optional(),
      refs: z.record(z.string(), z.string().max(64)).default({}),
      counts: z.record(z.string(), z.number().int().min(0)).default({}),
      partial: z.boolean().default(false),
      warnings: z.array(warningSchema).default([]),
    })
    .nullable()
    .optional(),
  cost: costView13Schema,
  error: errorInfoSchema.extend({ stage: stageName.nullable().optional() }).nullable().optional(),
});
export type JobView13 = z.infer<typeof jobView13Schema>;

export const jobReviewOutputSchema = z.object({ accepted: z.literal(true), status: z.enum(JOB_STATUSES_13) });
export const jobResumeOutputSchema = z.object({ resumed: z.boolean(), status: z.enum(JOB_STATUSES_13) });

// ---------------------------------------------------------------------------- pagination seragam

export const pageInputShape = {
  cursor: z.string().max(500).nullable().optional(),
  limit: z.number().int().min(1).max(L.pageMax).default(L.pageDefault),
};

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item).max(L.pageMax),
    next_cursor: z.string().max(500).nullable(),
    total_estimate: z.number().int().min(0),
  });
}

// ---------------------------------------------------------------------------- event webhook 1.3

export const EVENT_TYPES_13_NEW = [
  'intel.job.awaiting_review',
  'intel.job.paused',
  'intel.company.upserted',
  'ci.import.status',
  'kn.asset.status',
  'opp.scores.updated',
  'ct.batch.ready',
] as const;
export const EVENT_TYPES_12_JOB = [
  'intel.job.started',
  'intel.job.stage.started',
  'intel.job.progress',
  'intel.job.stage.completed',
  'intel.job.completed',
  'intel.job.failed',
  'intel.job.cancelled',
] as const;
export const EVENT_TYPES_13 = [...EVENT_TYPES_12_JOB, ...EVENT_TYPES_13_NEW] as const;
export type Event13Type = (typeof EVENT_TYPES_13)[number];

export const event13EnvelopeSchema = z.strictObject({
  contract_version: contract13Version,
  event_id: uuid,
  event_type: z.enum(EVENT_TYPES_13),
  occurred_at: awareDatetime,
  job_id: uuid,
  mcp_job_id: mcpJobId,
  sequence: z.number().int().min(1),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type Event13Envelope = z.infer<typeof event13EnvelopeSchema>;

const totals13 = z.object({ counts: z.record(z.string(), z.number().int().min(0)).default({}) });

export const KN_ASSET_STATUSES = ['uploaded', 'extracting', 'chunking', 'embedding', 'carding', 'ready', 'needs_ocr', 'failed'] as const;
export const IMPORT_STATUSES = ['profiling', 'mapping', 'inserting', 'completed', 'failed', 'rolled_back'] as const;

/** Data event 1.3. Event 1.2 berlaku untuk kind baru dengan `stage` = nama tahap bebas (lihat KIND_STAGES). */
export const event13DataSchemas = {
  'intel.job.started': z.strictObject({ kind: z.enum(JOB_KINDS).nullable().optional() }),
  'intel.job.stage.started': z.strictObject({ stage: stageName, agent_key: agentKey.nullable() }),
  'intel.job.progress': z.strictObject({
    stage: stageName,
    done: z.number().int().min(0),
    total: z.number().int().min(0).nullable().optional(),
    message: z.string().max(L.messageMaxChars).nullable().optional(),
    eta_seconds: z.number().int().min(0).nullable().optional(),
  }),
  'intel.job.stage.completed': z.strictObject({
    stage: stageName,
    status: z.enum(['completed', 'skipped']).default('completed'),
    stats: z.record(z.string(), z.unknown()).nullable().optional(),
    warnings: z.array(warningSchema).default([]),
  }),
  'intel.job.completed': z.strictObject({
    summary_preview: z.string().max(L.summaryMaxChars).default(''),
    totals: totals13,
    cost: costView13Schema,
    partial: z.boolean().default(false),
  }),
  'intel.job.failed': z.strictObject({ stage: stageName.nullable().optional(), error: errorInfoSchema }),
  'intel.job.cancelled': z.strictObject({}),
  'intel.job.awaiting_review': z.strictObject({
    stage: stageName,
    review_id: reviewId,
    subject_type: z.enum(REVIEW_SUBJECTS),
    subject_ref: z.string().max(64),
    summary: z.string().max(L.summaryMaxChars),
    non_blocking: z.boolean().default(false),
  }),
  'intel.job.paused': z.strictObject({
    stage: stageName.nullable().optional(),
    reason: z.enum(PAUSE_REASONS),
    message: z.string().max(L.messageMaxChars),
    resume_hint: z.string().max(L.messageMaxChars).nullable().optional(),
  }),
  'intel.company.upserted': z.strictObject({
    company_id: uuid,
    name: z.string().max(300),
    origin: z.enum(COMPANY_ORIGINS),
    created: z.boolean(),
  }),
  'ci.import.status': z.strictObject({
    batch_id: mcpRef,
    status: z.enum(IMPORT_STATUSES),
    rows_total: z.number().int().min(0).max(L.importMaxRows),
    rows_inserted: z.number().int().min(0),
    rows_merged: z.number().int().min(0),
    rows_review: z.number().int().min(0),
    rows_failed: z.number().int().min(0),
  }),
  'kn.asset.status': z.strictObject({
    asset_id: mcpRef,
    upload_id: uploadId,
    status: z.enum(KN_ASSET_STATUSES),
    pages: z.number().int().min(0).nullable().optional(),
    chunks: z.number().int().min(0).nullable().optional(),
    error: errorInfoSchema.nullable().optional(),
  }),
  'opp.scores.updated': z.strictObject({
    product_id: uuid,
    scored: z.number().int().min(0),
    insufficient_data: z.number().int().min(0).default(0),
    score_model_version: z.string().max(32),
  }),
  'ct.batch.ready': z.strictObject({
    batch_id: mcpRef,
    strategy_report_id: mcpRef,
    items_count: z.number().int().min(0).max(L.contentCountMax),
  }),
} satisfies Record<Event13Type, z.ZodType>;

/**
 * Event yang harus ditangani penerima 1.3: semua tipe baru, atau event job dengan `contract_version` ≥ 1.3.
 * Event 1.2 (`contract_version` 1.0–1.2) tetap ke penerima Modul 3 tanpa perubahan perilaku.
 */
export function isEvent13Body(body: unknown): boolean {
  const b = body as { event_type?: unknown; contract_version?: unknown } | null;
  if (typeof b?.event_type !== 'string') return false;
  if ((EVENT_TYPES_13_NEW as readonly string[]).includes(b.event_type)) return true;
  return typeof b.contract_version === 'string' && contract13Version.safeParse(b.contract_version).success && b.event_type.startsWith('intel.job.');
}
