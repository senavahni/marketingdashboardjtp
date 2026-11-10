import { z } from 'zod';
import { isIP } from 'node:net';
import { uuid } from './common.schema';

/**
 * Kontrak 1.2 Dashboard ↔ MCP untuk toolset `intel` (Documentation/modul3/M3_MCP_INTEGRATION.md).
 * Batas & default HARUS identik dengan Pydantic MCP `mcp_marketing/schemas/intel.py`; keduanya diuji
 * terhadap fixture bersama `contracts/intel-1.2/` (test/contract/intel-fixtures.spec.ts).
 */

export const INTEL_CONTRACT_VERSION = '1.2';

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
  itemsPageMax: 100,
  itemsPageDefault: 50,
  queryMaxChars: 100,
  summaryMdMaxChars: 4_000,
  summaryPreviewMaxChars: 500,
  recommendationsMax: 5,
  topMax: 10,
  examplesMax: 3,
} as const;

const L = INTEL_LIMITS;
const DAY_MS = 86_400_000;

export const INTEL_STAGES = ['collect', 'analyze', 'index'] as const;
export const INTEL_SOURCE_TYPES = ['x', 'threads', 'web', 'trends'] as const;
export const INTEL_JOB_STATUSES = ['queued', 'collecting', 'analyzing', 'indexing', 'completed', 'failed', 'cancelling', 'cancelled'] as const;
export const INTEL_STAGE_STATUSES = ['pending', 'running', 'completed', 'skipped', 'failed', 'cancelled'] as const;
export const INTEL_TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'] as const;
export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const;
export const CAPABILITIES = ['collect', 'analyze', 'index'] as const;
/** Kapabilitas tahap kontrak 1.3 (MCP-V1-03) — aditif: profil agent boleh melaporkannya tanpa menggagalkan intel_agents_list. */
export const CAPABILITIES_13 = ['analyze_product', 'discover', 'enrich', 'import_map', 'find_contacts', 'extract_knowledge', 'strategize', 'create_content'] as const;

const stage = z.enum(INTEL_STAGES);
const sourceType = z.enum(INTEL_SOURCE_TYPES);
const sourceMode = z.enum(['api', 'browser', 'unofficial', 'none']);
const isoDate = z.iso.date();
const awareDatetime = z.iso.datetime({ offset: true });
const keyword = z.string().trim().min(1).max(L.keywordMaxChars);
const url = z
  .string()
  .trim()
  .max(L.urlMaxChars)
  .regex(/^https?:\/\/[^\s/$.?#][^\s]*$/, 'URL harus http/https')
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return;
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (parsed.username || parsed.password || isPrivateHost(host)) {
      ctx.addIssue({ code: 'custom', message: 'URL tidak boleh mengarah ke host privat atau memuat kredensial' });
    }
  });

function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const octets = host.split('.').map(Number);
    const [first, second] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    );
  }
  if (ipVersion === 6) {
    return host === '::' || host === '::1' || /^f[cd]/i.test(host) || /^fe[89ab]/i.test(host) || host.startsWith('::ffff:');
  }
  return false;
}
export const agentKey = z.string().regex(/^[a-z][a-z0-9_]{1,99}$/, 'agent_key tidak valid');
export const mcpJobId = z.string().regex(/^j_[0-9a-z]{10}$/, 'mcp_job_id tidak valid');
const handle = z.string().regex(/^h_[0-9a-z]{10}$/);

// ---------------------------------------------------------------------------- JobSpec

export const xSourceSchema = z.strictObject({
  type: z.literal('x'),
  keywords: z.array(keyword).min(1).max(L.keywordsMax),
  match: z.enum(['any', 'all']).default('any'),
  lang: z.string().max(8).nullable().default('id'),
  exclude_retweets: z.boolean().default(true),
  exclude_replies: z.boolean().default(false),
  max_items: z.number().int().min(1).max(L.xMaxItems).default(L.xDefaultItems),
  provider: z.enum(['auto', 'x_api', 'browser']).default('auto'),
});

export const threadsSourceSchema = z.strictObject({
  type: z.literal('threads'),
  keywords: z.array(keyword).min(1).max(L.keywordsMax),
  search_type: z.enum(['TOP', 'RECENT']).default('RECENT'),
  max_items: z.number().int().min(1).max(L.threadsMaxItems).default(L.threadsDefaultItems),
});

export const webSourceSchema = z
  .strictObject({
    type: z.literal('web'),
    mode: z.enum(['scrape', 'crawl']),
    urls: z.array(url).min(1).max(L.urlsMax).nullable().optional(),
    start_url: url.nullable().optional(),
    max_pages: z.number().int().min(1).max(L.crawlMaxPages).default(L.crawlDefaultPages),
    max_depth: z.number().int().min(0).max(L.crawlMaxDepth).default(2),
    include_patterns: z.array(z.string().max(200)).max(10).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'scrape' && !v.urls?.length) ctx.addIssue({ code: 'custom', message: 'mode scrape butuh urls' });
    if (v.mode === 'crawl' && !v.start_url) ctx.addIssue({ code: 'custom', message: 'mode crawl butuh start_url' });
  });

export const trendsSourceSchema = z.strictObject({
  type: z.literal('trends'),
  keywords: z.array(keyword).min(1).max(L.trendsKeywordsMax),
  geo: z
    .string()
    .regex(/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/)
    .default('ID'),
});

export const intelSourceSchema = z.discriminatedUnion('type', [xSourceSchema, threadsSourceSchema, webSourceSchema, trendsSourceSchema]);

export const periodSchema = z
  .strictObject({ since: isoDate, until: isoDate })
  .superRefine((v, ctx) => {
    const days = (Date.parse(v.until) - Date.parse(v.since)) / DAY_MS;
    if (days < 0) ctx.addIssue({ code: 'custom', message: 'until tidak boleh sebelum since' });
    else if (days + 1 > L.periodMaxDays) ctx.addIssue({ code: 'custom', message: `rentang periode maksimal ${L.periodMaxDays} hari` });
  });

const stageAgentSchema = z.strictObject({ agent_key: agentKey });

export const stagesSchema = z.strictObject({
  collect: stageAgentSchema,
  analyze: z.strictObject({
    agent_key: agentKey,
    aspects: z.array(z.string().trim().min(1).max(L.aspectMaxChars)).max(L.aspectsMax).default([]),
    method: z.enum(['auto', 'model', 'llm']).default('auto'),
  }),
  index: z.strictObject({ agent_key: agentKey, enabled: z.boolean().default(false) }).nullable().optional(),
});

export const jobSpecSchema = z.strictObject({
  title: z.string().trim().min(1).max(L.titleMaxChars),
  language: z.enum(['id', 'en']).default('id'),
  period: periodSchema,
  sources: z
    .array(intelSourceSchema)
    .min(1)
    .max(L.maxSources)
    .refine((sources) => new Set(sources.map((s) => s.type)).size === sources.length, 'maksimal satu sumber per type'),
  stages: stagesSchema,
});

// ---------------------------------------------------------------------------- input tool

export const jobEstimateInputSchema = z.strictObject({ workspace_id: uuid, spec: jobSpecSchema });

export const jobCreateInputSchema = z.strictObject({
  contract_version: z.string().regex(/^1\.\d+$/, 'contract_version tidak didukung (harus 1.x)'),
  dashboard_job_id: uuid,
  workspace_id: uuid,
  requested_by: z.strictObject({ user_id: uuid, name: z.string().max(100) }),
  spec: jobSpecSchema,
  confirm_cost: z.boolean().default(false),
});

export const jobRefInputSchema = z.strictObject({ workspace_id: uuid, mcp_job_id: mcpJobId });

export const itemsInputSchema = z.strictObject({
  workspace_id: uuid,
  mcp_job_id: mcpJobId,
  filter: z
    .strictObject({
      source: sourceType.nullable().optional(),
      sentiment: z.enum(SENTIMENTS).nullable().optional(),
      q: z.string().trim().max(L.queryMaxChars).nullable().optional(),
    })
    .default({}),
  order_by: z.enum(['-created_at', 'created_at', '-engagement']).default('-created_at'),
  limit: z.number().int().min(1).max(L.itemsPageMax).default(L.itemsPageDefault),
  cursor: z.string().max(500).nullable().optional(),
});

// ---------------------------------------------------------------------------- output tool

const warningSchema = z.object({ code: z.string().max(48), message: z.string().max(300) });
const errorInfoSchema = z.object({ code: z.string().max(48), message: z.string().max(500), retryable: z.boolean() });
const tableSchema = z.object({ cols: z.array(z.string()), rows: z.array(z.array(z.unknown())) });

export const agentInfoSchema = z.object({
  agent_key: z.string(),
  display_name: z.string(),
  is_active: z.boolean(),
  route: z.string(),
  run_token_budget: z.number().int(),
  toolsets: z.array(z.string()),
  capabilities: z.array(z.enum([...CAPABILITIES, ...CAPABILITIES_13])),
  gateway_key: z.object({ source: z.enum(['agent', 'system', 'env']), prefix: z.string().nullable().optional() }),
});
export const agentsListSchema = z.object({ agents: z.array(agentInfoSchema) });

export const sourceStatusSchema = z.object({
  source: sourceType,
  available: z.boolean(),
  mode: sourceMode,
  detail: z.string().max(300),
  checked_at: awareDatetime,
});
export const sourcesStatusSchema = z.object({
  sources: z.array(sourceStatusSchema),
  llm: z.object({ routes: z.array(z.object({ route: z.string(), available: z.boolean() })) }),
  checked_at: awareDatetime,
});

export const estimateSchema = z.object({
  seconds: z.number().int().min(0),
  sources: z.array(
    z.object({ type: sourceType, mode: sourceMode, external_units: z.number().int().min(0), usd_external: z.number().min(0) }),
  ),
  llm: z.object({
    tokens_est: z.number().int().min(0),
    usd_est: z.number().min(0),
    by_stage: z.array(z.object({ stage, agent_key: z.string(), route: z.string(), tokens_est: z.number().int().min(0) })),
  }),
  requires_confirmation: z.boolean(),
  warnings: z.array(warningSchema).default([]),
});

export const jobAcceptedSchema = z.object({ accepted: z.literal(true), mcp_job_id: mcpJobId, estimate: estimateSchema });

const stageViewSchema = z.object({
  stage,
  agent_key: z.string(),
  status: z.enum(INTEL_STAGE_STATUSES),
  progress: z.object({ done: z.number().int().min(0), total: z.number().int().min(0).nullable().optional() }).default({ done: 0 }),
  started_at: awareDatetime.nullable().optional(),
  finished_at: awareDatetime.nullable().optional(),
  error: errorInfoSchema.nullable().optional(),
});

const exampleSchema = z.object({
  id: z.string(),
  source: z.string(),
  author: z.string().nullable().optional(),
  text: z.string().max(280),
  url: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

const fraction = z.number().min(0).max(1);
const sentimentResultSchema = z.object({
  distribution: z.object({ positive: fraction, neutral: fraction, negative: fraction }),
  net_sentiment: z.number().min(-1).max(1),
  by_day: tableSchema,
  aspects: tableSchema.nullable().optional(),
  examples: z.object({
    positive: z.array(exampleSchema).max(L.examplesMax).default([]),
    negative: z.array(exampleSchema).max(L.examplesMax).default([]),
  }),
});

const countPair = z.tuple([z.string(), z.number().int()]);
const totalsSchema = z.object({ items: z.number().int().min(0), by_source: z.record(z.string(), z.number().int()) });

export const costViewSchema = z.object({
  llm_tokens: z.number().int().min(0).default(0),
  usd_llm: z.number().min(0).default(0),
  external_units: z.number().int().min(0).default(0),
  usd_external: z.number().min(0).default(0),
  by_stage: z
    .array(z.object({ stage, agent_key: z.string(), llm_tokens: z.number().int().min(0), usd_llm: z.number().min(0) }))
    .default([]),
});

export const jobResultViewSchema = z.object({
  totals: totalsSchema,
  sentiment: sentimentResultSchema.nullable().optional(),
  trends: z.object({
    topics: z
      .array(z.object({ label: z.string().max(80), count: z.number().int().min(0), share: fraction }))
      .max(L.topMax)
      .default([]),
    hashtags: z.array(countPair).max(L.topMax).default([]),
    authors: z.array(countPair).max(L.topMax).default([]),
  }),
  volume_by_day: tableSchema,
  google_trends: z.record(z.string(), z.unknown()).nullable().optional(),
  summary_md: z.string().max(L.summaryMdMaxChars).nullable().optional(),
  recommendations: z.array(z.string().max(300)).max(L.recommendationsMax).default([]),
  items_handle: handle.nullable().optional(),
  items_expire_at: awareDatetime.nullable().optional(),
  partial: z.boolean().default(false),
  warnings: z.array(warningSchema).default([]),
});

export const jobViewSchema = z.object({
  mcp_job_id: mcpJobId,
  dashboard_job_id: uuid,
  status: z.enum(INTEL_JOB_STATUSES),
  stages: z.array(stageViewSchema),
  result: jobResultViewSchema.nullable().optional(),
  cost: costViewSchema,
  error: errorInfoSchema.extend({ stage: stage.nullable().optional() }).nullable().optional(),
});

export const cancelOutputSchema = z.object({ cancelled: z.boolean(), status: z.enum(INTEL_JOB_STATUSES) });

/** `intel_kb_projection` (M3_TASK_011): awan titik 3D hasil PCA embedding item job. */
export const PROJECTION_MAX_POINTS = 2_000;
export const projectionSchema = z.object({
  points: z
    .array(
      z.object({
        id: z.string(),
        x: z.number(),
        y: z.number(),
        z: z.number(),
        source: z.enum(INTEL_SOURCE_TYPES),
        sentiment: z.enum(['positive', 'neutral', 'negative']).nullable(),
        label: z.string().max(60),
      }),
    )
    .max(PROJECTION_MAX_POINTS),
  method: z.literal('pca'),
  generated_at: awareDatetime.nullable(),
});

/** `intel_job_purge_index` (M3_TASK_010): dokumen job dibuang dari koleksi KB `intel:<workspace_id>`. */
export const purgeIndexOutputSchema = z.object({ deleted_documents: z.number().int().min(0), deleted_chunks: z.number().int().min(0) });

export const itemsPageSchema = z.object({
  cols: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  total: z.number().int().min(0),
  next_cursor: z.string().nullable().optional(),
  expires_at: awareDatetime.nullable().optional(),
});

export const llmStatusSchema = z.object({
  agents: z.array(
    z.object({
      agent_key: z.string(),
      key_source: z.enum(['agent', 'system', 'env']),
      key_prefix: z.string().nullable().optional(),
      key_status: z.enum(['active', 'revoked', 'invalid', 'unknown']),
      last_error: z.string().nullable().optional(),
      usage: z.object({
        calls: z.number().int().min(0),
        prompt_tokens: z.number().int().min(0),
        completion_tokens: z.number().int().min(0),
        usd: z.number().min(0),
      }),
    }),
  ),
  project: z
    .object({ slug: z.string().nullable().optional(), start: isoDate, end: isoDate, data: z.array(z.record(z.string(), z.unknown())) })
    .nullable()
    .optional(),
});

// ---------------------------------------------------------------------------- event webhook

export const INTEL_EVENT_TYPES = [
  'intel.job.started',
  'intel.job.stage.started',
  'intel.job.progress',
  'intel.job.stage.completed',
  'intel.job.completed',
  'intel.job.failed',
  'intel.job.cancelled',
] as const;
export type IntelEventType = (typeof INTEL_EVENT_TYPES)[number];

export const intelEventEnvelopeSchema = z.strictObject({
  contract_version: z.string().regex(/^1\.\d+$/, 'contract_version tidak didukung (harus 1.x)'),
  event_id: uuid,
  event_type: z.enum(INTEL_EVENT_TYPES),
  occurred_at: awareDatetime,
  job_id: uuid,
  mcp_job_id: mcpJobId,
  sequence: z.number().int().min(1),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type IntelEventEnvelope = z.infer<typeof intelEventEnvelopeSchema>;

export const intelEventDataSchemas = {
  'intel.job.started': z.strictObject({}),
  'intel.job.stage.started': z.strictObject({ stage, agent_key: agentKey }),
  'intel.job.progress': z.strictObject({
    stage,
    done: z.number().int().min(0),
    total: z.number().int().min(0).nullable().optional(),
    message: z.string().max(300).nullable().optional(),
    // M3_TASK_011 (tahap index): ≤ 20 kata tersanitasi untuk animasi stream 3D
    sample_tokens: z.array(z.string().max(24)).max(20).nullable().optional(),
  }),
  'intel.job.stage.completed': z.strictObject({
    stage,
    status: z.enum(['completed', 'skipped']).default('completed'),
    stats: z.record(z.string(), z.unknown()).nullable().optional(),
    warnings: z.array(warningSchema).default([]),
  }),
  'intel.job.completed': z.strictObject({
    summary_preview: z.string().max(L.summaryPreviewMaxChars).default(''),
    totals: totalsSchema,
    cost: costViewSchema,
    partial: z.boolean().default(false),
  }),
  'intel.job.failed': z.strictObject({ stage: stage.nullable().optional(), error: errorInfoSchema }),
  'intel.job.cancelled': z.strictObject({}),
} satisfies Record<IntelEventType, z.ZodType>;

/** Event webhook berawalan `intel.` memakai envelope varian job (kontrak 1.2), bukan envelope run Modul 1. */
export function isIntelEventBody(body: unknown): boolean {
  const type = (body as { event_type?: unknown } | null)?.event_type;
  return typeof type === 'string' && type.startsWith('intel.');
}

export type JobSpec = z.infer<typeof jobSpecSchema>;
export type IntelSource = z.infer<typeof intelSourceSchema>;
export type JobView = z.infer<typeof jobViewSchema>;
export type Estimate = z.infer<typeof estimateSchema>;
export type AgentInfo = z.infer<typeof agentInfoSchema>;
