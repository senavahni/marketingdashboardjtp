import { z } from 'zod';
import { Permission } from '../../../common/constants/permissions';
import { JOB_KINDS, JobKind, LIMITS_13, ReviewSubject, jobSpec13Schema } from '../../../shared/schemas/intel-1.3.schema';

export const estimateJob13Schema = z.strictObject({ spec: jobSpec13Schema });
export const createJob13Schema = z.strictObject({ spec: jobSpec13Schema, confirm_cost: z.boolean().default(false) });
export type CreateJob13Input = z.infer<typeof createJob13Schema>;

export const jobs13QuerySchema = z.strictObject({
  kind: z.enum(JOB_KINDS),
  status: z.enum(['queued', 'running', 'awaiting_review', 'paused', 'completed', 'failed', 'cancelling', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

export const reviewJob13Schema = z
  .strictObject({
    decision: z.enum(['approve', 'reject', 'revise']),
    edits: z.record(z.string(), z.unknown()).optional(),
    comment: z.string().trim().max(LIMITS_13.feedbackMaxChars).optional(),
  })
  .refine((v) => v.decision !== 'revise' || Boolean(v.comment), { message: 'revise butuh comment', path: ['comment'] });
export type ReviewJob13Input = z.infer<typeof reviewJob13Schema>;

/** Body `POST .../intel/jobs` berkontrak 1.3 bila `spec.kind` ada (tanpa kind = job sosial Modul 3). */
export function isJob13Body(body: unknown): boolean {
  const spec = (body as { spec?: { kind?: unknown } } | null)?.spec;
  return typeof spec?.kind === 'string';
}

/** Izin minimum menjalankan job per kind (null = cukup member). */
export const KIND_PERMISSION: Record<JobKind, Permission | null> = {
  company_discovery: null,
  company_import: 'data:import',
  contact_finder: 'data:import',
  social_listening: null,
  book_ingest: 'knowledge:upload',
  opportunity_scoring: null,
  strategy: null,
  content_bank: null,
};

/** Izin untuk memutuskan review per subject (null = cukup member). */
export const REVIEW_PERMISSION: Record<ReviewSubject, Permission | null> = {
  product_analysis: null,
  keyword_set: null,
  mission_plan: null,
  import_review: 'data:import',
  contact_batch: 'contacts:review',
  knowledge_card: 'knowledge:approve',
  doctrine: 'knowledge:approve',
  strategy: 'strategy:approve',
  content_batch: 'content:approve',
};
