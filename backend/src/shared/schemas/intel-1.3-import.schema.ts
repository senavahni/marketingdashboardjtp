import { z } from 'zod';
import { uuid } from './common.schema';
import { IMPORT_STATUSES, LIMITS_13, kbliCode, mcpRef, pageInputShape, pageOf, regionCode, uploadId } from './intel-1.3.schema';

/**
 * Kontrak 1.3 (aditif, DSH-V1-06 / MCP-V1-08) — Import XLSX/CSV agentic & Contact Finder (F1b).
 * Batch & baris import serta target Contact Finder milik MCP (V1-K3); Dashboard hanya membaca & mengirim keputusan.
 */

export const MCP_TOOLS_13_IMPORT = [
  'ci_upload_profile',
  'ci_import_batches',
  'ci_import_batch_get',
  'ci_import_rows',
  'ci_import_row_decide',
  'ci_import_rollback',
  'cf_targets',
  'cf_target_update',
] as const;
export type McpToolImport = (typeof MCP_TOOLS_13_IMPORT)[number];

const awareDatetime = z.iso.datetime({ offset: true });
const fraction = z.number().min(0).max(1);
const field = z.string().regex(/^[a-z][a-z0-9_.]{1,63}$/);
const ws = { workspace_id: uuid };

// ---------------------------------------------------------------------------- profil file

export const ciUploadProfileInputSchema = z.strictObject({ ...ws, upload_id: uploadId });
export const uploadProfileSchema = z.object({
  upload_id: uploadId,
  sheets: z
    .array(
      z.object({
        name: z.string().max(100),
        rows_estimate: z.number().int().min(0).max(LIMITS_13.importMaxRows),
        headers: z.array(z.string().max(200)).max(200),
        /** ≤ 20 baris pratinjau, sel sudah dipotong ≤ 200 karakter. */
        preview: z.array(z.array(z.string().max(200))).max(20),
      }),
    )
    .min(1)
    .max(50),
});
export type UploadProfile = z.infer<typeof uploadProfileSchema>;

// ---------------------------------------------------------------------------- batch

export const mappingEntrySchema = z.object({
  source_col: z.string().max(200),
  /** null = kolom diabaikan. */
  field: field.nullable(),
  transform: z.string().max(64).nullable(),
  confidence: fraction.nullable(),
  method: z.enum(['local', 'llm', 'manual']),
});
export type MappingEntry = z.infer<typeof mappingEntrySchema>;

export const importBatchSummarySchema = z.object({
  batch_id: mcpRef,
  upload_id: uploadId,
  dashboard_job_id: uuid.nullable(),
  filename: z.string().max(255),
  sheet: z.string().max(100).nullable(),
  mode: z.enum(['fill_db', 'contact_targets']),
  status: z.enum(IMPORT_STATUSES),
  rows_total: z.number().int().min(0).max(LIMITS_13.importMaxRows),
  rows_inserted: z.number().int().min(0),
  rows_merged: z.number().int().min(0),
  rows_review: z.number().int().min(0),
  rows_failed: z.number().int().min(0),
  created_at: awareDatetime,
  rolled_back_at: awareDatetime.nullable(),
});
export type ImportBatchSummary = z.infer<typeof importBatchSummarySchema>;

export const ciImportBatchesInputSchema = z.strictObject({ ...ws, ...pageInputShape });
export const importBatchListSchema = pageOf(importBatchSummarySchema);

export const ciImportBatchGetInputSchema = z.strictObject({ ...ws, batch_id: mcpRef });
export const importBatchDetailSchema = importBatchSummarySchema.extend({
  column_mapping: z.array(mappingEntrySchema).max(200),
  /** Field tujuan yang boleh dipilih saat mengubah mapping. */
  fields: z.array(z.object({ field, label: z.string().max(100) })).max(100),
});
export type ImportBatchDetail = z.infer<typeof importBatchDetailSchema>;

// ---------------------------------------------------------------------------- baris (antrean review)

export const ciImportRowsInputSchema = z.strictObject({ ...ws, batch_id: mcpRef, status: z.enum(['review', 'failed']).default('review'), ...pageInputShape });
export const importRowSchema = z.object({
  row_id: mcpRef,
  row_no: z.number().int().min(1),
  raw: z.record(z.string().max(200), z.string().max(500)),
  status: z.enum(['inserted', 'merged', 'review', 'failed', 'ignored']),
  issues: z.array(z.string().max(200)).max(20),
  candidates: z.array(z.object({ company_id: uuid, name: z.string().max(300), address: z.string().max(500).nullable(), similarity: fraction })).max(5),
});
export type ImportRow = z.infer<typeof importRowSchema>;
export const importRowListSchema = pageOf(importRowSchema);

export const ciImportRowDecideInputSchema = z
  .strictObject({ ...ws, batch_id: mcpRef, row_id: mcpRef, decision: z.enum(['merge', 'new', 'ignore']), company_id: uuid.nullable().optional(), decided_by: uuid })
  .refine((v) => v.decision !== 'merge' || Boolean(v.company_id), { message: 'merge butuh company_id', path: ['company_id'] });
export const importRowDecisionSchema = z.object({ row_id: mcpRef, status: z.enum(['inserted', 'merged', 'ignored']) });

// ---------------------------------------------------------------------------- rollback

export const ciImportRollbackInputSchema = z.strictObject({ ...ws, batch_id: mcpRef, dry_run: z.boolean(), requested_by: uuid });
export const importRollbackSchema = z.object({
  batch_id: mcpRef,
  dry_run: z.boolean(),
  companies_deleted: z.number().int().min(0),
  merges_reverted: z.number().int().min(0),
  /** Perusahaan yang sudah dipakai (mis. opportunity Dashboard) tidak dihapus. */
  kept_in_use: z.number().int().min(0),
  status: z.enum(IMPORT_STATUSES),
});
export type ImportRollback = z.infer<typeof importRollbackSchema>;

// ---------------------------------------------------------------------------- Contact Finder

export const CF_STATUSES = ['queued', 'found', 'ambiguous', 'not_found', 'needs_hint'] as const;
export type CfStatus = (typeof CF_STATUSES)[number];

const hintSchema = z.strictObject({
  city: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  website: z.string().trim().max(253).nullable().optional(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
});

export const cfTargetSchema = z.object({
  target_id: mcpRef,
  company_id: uuid,
  name: z.string().max(300),
  kbli_code: kbliCode.nullable(),
  region_name: z.string().max(100).nullable(),
  priority: z.number().int().min(1).max(5),
  hint: hintSchema,
  status: z.enum(CF_STATUSES),
  attempts: z.number().int().min(0),
  candidates: z
    .array(
      z.object({
        candidate_id: mcpRef,
        name: z.string().max(300),
        address: z.string().max(500).nullable(),
        domain: z.string().max(253).nullable(),
        distance_km: z.number().min(0).nullable(),
        reason: z.string().max(300),
        confidence: fraction,
      }),
    )
    .max(10),
  found: z.object({ website: z.string().max(253).nullable(), phone: z.string().max(40).nullable(), email_generic: z.string().max(254).nullable() }).nullable(),
  last_attempt_at: awareDatetime.nullable(),
});
export type CfTarget = z.infer<typeof cfTargetSchema>;

export const cfTargetsInputSchema = z.strictObject({
  ...ws,
  filter: z
    .strictObject({
      statuses: z.array(z.enum(CF_STATUSES)).default([]),
      import_batch_id: mcpRef.nullable().optional(),
      region_codes: z.array(regionCode).max(LIMITS_13.regionCodesMax).default([]),
      kbli_codes: z.array(kbliCode).max(50).default([]),
    })
    .default({ statuses: [], region_codes: [], kbli_codes: [] }),
  ...pageInputShape,
});
export const cfTargetListSchema = pageOf(cfTargetSchema).extend({
  summary: z.object({
    counts: z.record(z.enum(CF_STATUSES), z.number().int().min(0)),
    /** Perkiraan sisa waktu (rem volume Chrome) — bisa berhari-hari. */
    eta_seconds: z.number().int().min(0).nullable(),
    paused: z.object({ reason: z.enum(['captcha', 'budget', 'manual', 'local_model_unavailable']), since: awareDatetime }).nullable(),
  }),
});
export type CfTargetList = z.infer<typeof cfTargetListSchema>;

export const cfTargetUpdateInputSchema = z
  .strictObject({
    ...ws,
    target_id: mcpRef,
    priority: z.number().int().min(1).max(5).optional(),
    hint: hintSchema.optional(),
    select_candidate_id: mcpRef.optional(),
    rerun: z.boolean().optional(),
    updated_by: uuid,
  })
  .refine((v) => v.priority !== undefined || v.hint !== undefined || v.select_candidate_id !== undefined || v.rerun === true, { message: 'tidak ada perubahan', path: ['target_id'] });
