import { z } from 'zod';
import type { McpToolImport } from './intel-1.3-import.schema';
import type { McpToolKnowledge } from './intel-1.3-knowledge.schema';
import { uuid } from './common.schema';
import {
  COMPANY_ORIGINS,
  CONTENT_PLATFORMS,
  KN_ASSET_STATUSES,
  LIMITS_13,
  ORG_TYPES,
  kbliCode,
  mcpRef,
  pageInputShape,
  pageOf,
  regionCode,
  uploadId,
} from './intel-1.3.schema';

/**
 * Kontrak 1.3 — toolset baca yang dipakai Dashboard (proxy tipis per layar) + respons `POST /uploads`.
 * Prefiks: `mi_*` market, `ci_*` company, `opp_*` opportunity, `ct_*` konten, `kn_*` knowledge, `data_export`.
 * Daftar final tool per prefiks ditetapkan di task MCP masing-masing; tool di sini adalah yang dibutuhkan layar V1.
 */

const awareDatetime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();
const fraction = z.number().min(0).max(1);
const priority = z.enum(['high', 'medium', 'low']);
const precision = z.enum(['rooftop', 'street', 'district', 'city', 'province', 'unknown']);
const sourceRef = z.object({ source_url: z.string().max(2048).nullable(), source_kind: z.string().max(32), collected_at: awareDatetime.nullable() });

export const MCP_TOOLS_13 = [
  'intel_job_estimate',
  'intel_job_create',
  'intel_job_get',
  'intel_job_cancel',
  'intel_job_review',
  'intel_job_resume',
  'mi_kpis',
  'ci_company_list',
  'ci_company_get',
  'ci_geo_clusters',
  'opp_list',
  'opp_explain',
  'ct_batch_get',
  'kn_asset_list',
  'data_export',
] as const;
/** Termasuk toolset import/Contact Finder & knowledge (file schema terpisah, kontrak 1.3 aditif). */
export type McpTool13 = (typeof MCP_TOOLS_13)[number] | McpToolImport | McpToolKnowledge | 'intel_agents_list';

// ---------------------------------------------------------------------------- upload (HTTP, bukan tool)

export const UPLOAD_KINDS = ['pdf', 'xlsx', 'csv'] as const;
export const UPLOAD_PURPOSES = ['book', 'brand', 'import'] as const;

export const uploadAcceptedSchema = z.object({
  upload_id: uploadId,
  kind: z.enum(UPLOAD_KINDS),
  filename: z.string().max(255),
  size: z.number().int().min(1).max(LIMITS_13.pdfMaxBytes),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.literal('stored'),
});
export type UploadAccepted = z.infer<typeof uploadAcceptedSchema>;

// ---------------------------------------------------------------------------- mi_kpis

const periodSchema = z.strictObject({ since: isoDate, until: isoDate });

export const miKpisInputSchema = z.strictObject({
  workspace_id: uuid,
  period: periodSchema,
  compare: z.enum(['previous_period', 'yoy']).nullable().default('previous_period'),
});

export const kpiSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  label: z.string().max(100),
  value: z.number().nullable(),
  unit: z.enum(['count', 'percent', 'usd', 'idr', 'score']),
  delta: z.number().nullable().optional(),
  definition: z.string().max(500),
  period: periodSchema,
  source: z.string().max(100),
  as_of: awareDatetime,
  insufficient_data: z.boolean().default(false),
});
export const miKpisSchema = z.object({ kpis: z.array(kpiSchema).max(50), as_of: awareDatetime });
export type Kpi = z.infer<typeof kpiSchema>;

// ---------------------------------------------------------------------------- ci_*

export const companyFilterSchema = z.strictObject({
  q: z.string().trim().max(100).nullable().optional(),
  kbli_codes: z.array(kbliCode).max(50).default([]),
  region_codes: z.array(regionCode).max(LIMITS_13.regionCodesMax).default([]),
  org_types: z.array(z.enum(ORG_TYPES)).default([]),
  origins: z.array(z.enum(COMPANY_ORIGINS)).default([]),
  min_completeness: fraction.nullable().optional(),
  product_id: uuid.nullable().optional(),
});

export const ciCompanyListInputSchema = z.strictObject({
  workspace_id: uuid,
  filter: companyFilterSchema.default({ kbli_codes: [], region_codes: [], org_types: [], origins: [] }),
  order_by: z.enum(['-updated_at', 'name', '-top_score', '-completeness']).default('-updated_at'),
  ...pageInputShape,
});

const regionView = z.object({
  province_code: regionCode,
  province_name: z.string().max(100),
  regency_code: regionCode.nullable().optional(),
  regency_name: z.string().max(100).nullable().optional(),
});

export const companySummarySchema = z.object({
  company_id: uuid,
  name: z.string().max(300),
  org_type: z.enum(ORG_TYPES),
  kbli_code: kbliCode.nullable(),
  isic_code: z.string().max(8).nullable(),
  region: regionView.nullable(),
  completeness: fraction,
  top_score: z.number().min(0).max(100).nullable(),
  origin: z.enum(COMPANY_ORIGINS),
  updated_at: awareDatetime,
});
export const ciCompanyListSchema = pageOf(companySummarySchema);
export type CompanySummary = z.infer<typeof companySummarySchema>;

export const ciCompanyGetInputSchema = z.strictObject({ workspace_id: uuid, company_id: uuid });

export const contactSchema = z.object({
  contact_id: uuid,
  kind: z.enum(['email', 'phone', 'whatsapp', 'social', 'form']),
  value: z.string().max(500),
  contact_type: z.enum(['generic', 'personal', 'role']),
  person_name: z.string().max(200).nullable().optional(),
  job_title: z.string().max(200).nullable().optional(),
  review_status: z.enum(['pending', 'approved', 'rejected']),
  suppressed: z.boolean().default(false),
  source: sourceRef,
});
export type Contact = z.infer<typeof contactSchema>;

export const companyProfileSchema = companySummarySchema.extend({
  legal_name: z.string().max(300).nullable().optional(),
  description_quotes: z.array(z.object({ quote: z.string().max(300), source: sourceRef })).max(10).default([]),
  domains: z.array(z.object({ domain: z.string().max(253), is_primary: z.boolean(), confidence: fraction })).default([]),
  locations: z
    .array(
      z.object({
        address_raw: z.string().max(500).nullable(),
        region_code: regionCode.nullable(),
        lat: z.number().min(-90).max(90).nullable(),
        lng: z.number().min(-180).max(180).nullable(),
        precision,
        geocode_source: z.enum(['jsonld', 'gmaps', 'nominatim', 'import', 'manual']).nullable(),
      }),
    )
    .default([]),
  contacts: z.array(contactSchema).default([]),
  needs: z
    .array(z.object({ need: z.string().max(300), category: z.string().max(64), confidence: fraction, evidence: z.array(z.object({ quote: z.string().max(300), source: sourceRef })).max(5) }))
    .default([]),
  signals: z.array(z.object({ kind: z.string().max(48), text: z.string().max(500), strength: fraction, observed_at: awareDatetime })).default([]),
  scores: z.array(z.object({ product_id: uuid, score: z.number().min(0).max(100), priority, score_model_version: z.string().max(32) })).default([]),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;

export const ciGeoClustersInputSchema = z.strictObject({
  workspace_id: uuid,
  bbox: z
    .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)])
    .refine(([w, s, e, n]) => w <= e && s <= n, 'bbox harus [west, south, east, north]'),
  zoom: z.number().int().min(0).max(20),
  filter: companyFilterSchema.default({ kbli_codes: [], region_codes: [], org_types: [], origins: [] }),
});

export const geoClustersSchema = z.object({
  clusters: z
    .array(
      z.object({
        id: z.string().max(64),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        count: z.number().int().min(1),
        top_priority: priority.nullable().optional(),
        /** Diisi bila count = 1 (titik tunggal). */
        company_id: uuid.nullable().optional(),
        precision: precision.nullable().optional(),
      }),
    )
    .max(5_000),
  total: z.number().int().min(0),
});
export type GeoClusters = z.infer<typeof geoClustersSchema>;

// ---------------------------------------------------------------------------- opp_*

export const oppListInputSchema = z.strictObject({
  workspace_id: uuid,
  filter: z
    .strictObject({
      product_id: uuid.nullable().optional(),
      priorities: z.array(priority).default([]),
      kbli_codes: z.array(kbliCode).max(50).default([]),
      region_codes: z.array(regionCode).max(LIMITS_13.regionCodesMax).default([]),
      org_types: z.array(z.enum(ORG_TYPES)).default([]),
      insufficient_data: z.boolean().nullable().optional(),
    })
    .default({ priorities: [], kbli_codes: [], region_codes: [], org_types: [] }),
  order_by: z.enum(['-score', '-scored_at']).default('-score'),
  ...pageInputShape,
});

export const oppScoreSchema = z.object({
  company_id: uuid,
  company_name: z.string().max(300),
  product_id: uuid,
  score: z.number().min(0).max(100),
  priority,
  confidence: fraction,
  insufficient_data: z.boolean(),
  score_model_version: z.string().max(32),
  scored_at: awareDatetime,
});
export const oppListSchema = pageOf(oppScoreSchema);
export type OppScore = z.infer<typeof oppScoreSchema>;

export const oppExplainInputSchema = z.strictObject({ workspace_id: uuid, product_id: uuid, company_id: uuid, score_model_version: z.string().max(32).nullable().optional() });
export const oppExplainSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: fraction,
  score_model_version: z.string().max(32),
  components: z.array(
    z.object({
      key: z.string().max(48),
      label: z.string().max(100),
      weight: fraction,
      value: fraction.nullable(),
      known: z.boolean(),
      evidence: z.array(z.object({ quote: z.string().max(300), source: sourceRef })).max(5).default([]),
    }),
  ),
  missing_info: z.array(z.string().max(200)).max(20).default([]),
});
export type OppExplain = z.infer<typeof oppExplainSchema>;

// ---------------------------------------------------------------------------- ct_* (Bank Konten)

export const ctBatchGetInputSchema = z.strictObject({ workspace_id: uuid, batch_id: mcpRef });

export const contentDraftSchema = z.object({
  item_ref: mcpRef,
  platform: z.enum(CONTENT_PLATFORMS),
  format: z.string().max(32),
  pillar: z.string().max(100),
  funnel_stage: z.enum(['awareness', 'consideration', 'conversion', 'retention']),
  segment: z.string().max(100).nullable(),
  hook: z.string().max(300),
  caption: z.string().max(3_000),
  cta: z.string().max(200),
  hashtags: z.array(z.string().regex(/^#?[\p{L}\p{N}_]{1,60}$/u)).max(30),
  visual_brief: z.string().max(1_000),
  framework_refs: z.array(z.object({ card_id: mcpRef, card_title: z.string().max(200), book_title: z.string().max(200), page: z.number().int().min(1) })).max(5),
  insight_refs: z.array(z.object({ kind: z.string().max(32), ref: z.string().max(64), label: z.string().max(200) })).max(10),
  eval_score: fraction.nullable(),
  eval_reason: z.string().max(500).nullable(),
});
export const ctBatchSchema = z.object({
  batch_id: mcpRef,
  strategy_report_id: mcpRef,
  items: z.array(contentDraftSchema).max(LIMITS_13.contentCountMax),
});
export type ContentDraft = z.infer<typeof contentDraftSchema>;

// ---------------------------------------------------------------------------- kn_*

export const knAssetListInputSchema = z.strictObject({
  workspace_id: uuid,
  kind: z.enum(['book', 'brand']).nullable().optional(),
  ...pageInputShape,
});
export const knAssetSchema = z.object({
  asset_id: mcpRef,
  upload_id: uploadId,
  title: z.string().max(200),
  kind: z.enum(['book', 'brand']),
  status: z.enum(KN_ASSET_STATUSES),
  pages: z.number().int().min(0).nullable(),
  chunks: z.number().int().min(0).nullable(),
  needs_ocr: z.boolean(),
  error: z.object({ code: z.string().max(48), message: z.string().max(500) }).nullable(),
});
export const knAssetListSchema = pageOf(knAssetSchema);

// ---------------------------------------------------------------------------- data_export

export const EXPORT_DATASETS = ['companies', 'opportunities', 'contacts_generic'] as const;
export const dataExportInputSchema = z.strictObject({
  workspace_id: uuid,
  dataset: z.enum(EXPORT_DATASETS),
  format: z.enum(['csv', 'xlsx']),
  filter: companyFilterSchema.default({ kbli_codes: [], region_codes: [], org_types: [], origins: [] }),
  /** Kontak personal hanya bila peminta berizin; MCP tetap menyaring yang belum review/suppressed. */
  include_personal_contacts: z.boolean().default(false),
});
export const dataExportSchema = z.object({
  export_id: mcpRef,
  rows: z.number().int().min(0),
  download_path: z.string().regex(/^\/exports\/[a-z]{1,4}_[0-9a-z]{10}$/),
  expires_at: awareDatetime,
  /** MCP menjamin nilai berawalan =,+,-,@ sudah di-escape dan kontak suppressed tidak ikut. */
  sanitized: z.literal(true),
});
export type DataExport = z.infer<typeof dataExportSchema>;
