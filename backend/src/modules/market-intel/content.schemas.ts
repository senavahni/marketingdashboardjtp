import { z } from 'zod';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { content_status } from '../../generated/prisma/client';
import { multiValue } from '../../shared/schemas/common.schema';
import { CONTENT_PLATFORMS } from '../../shared/schemas/intel-1.3.schema';

const uuid = z.uuid();
const STATUSES = ['draft', 'approved', 'rejected', 'scheduled', 'published'] as const;

export const contentQuerySchema = z.strictObject({
  strategy_doc_id: uuid.optional(),
  status: multiValue(z.enum(STATUSES)),
  platform: multiValue(z.enum(CONTENT_PLATFORMS)),
  pillar: z.string().trim().max(100).optional(),
  /** Rentang kalender (scheduled_at). */
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().max(200).optional(),
});

export const updateContentSchema = z
  .strictObject({
    /** Optimistic locking: versi yang sedang diedit klien. */
    version: z.number().int().min(1),
    hook: z.string().trim().min(1).max(300).optional(),
    caption: z.string().trim().min(1).max(3_000).optional(),
    cta: z.string().trim().min(1).max(200).optional(),
    hashtags: z.array(z.string().regex(/^#?[\p{L}\p{N}_]{1,60}$/u)).max(30).optional(),
    visual_brief: z.string().trim().max(1_000).optional(),
    pillar: z.string().trim().min(1).max(100).optional(),
  })
  .refine((v) => Object.keys(v).length > 1, 'tidak ada perubahan');

export const contentDecisionSchema = z.strictObject({ decision: z.enum(['approve', 'reject']), comment: z.string().trim().max(1_000).optional() });
export const bulkContentDecisionSchema = contentDecisionSchema.extend({ ids: z.array(uuid).min(1).max(100) });

export const scheduleContentSchema = z.strictObject({
  project_id: uuid,
  scheduled_at: z.iso.datetime({ offset: true }),
  assignee_user_id: uuid.optional(),
});

export const publishContentSchema = z.strictObject({ published_url: z.url({ protocol: /^https?$/ }).max(2_048) });

export const strategiesQuerySchema = z.strictObject({
  product_id: uuid.optional(),
  status: z.enum(['draft', 'in_review', 'approved', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

/** Status konten yang boleh menerima aksi tertentu. */
const ALLOWED: Record<'edit' | 'decide' | 'schedule' | 'publish', readonly content_status[]> = {
  edit: ['draft', 'approved', 'rejected'],
  decide: ['draft', 'rejected', 'approved'],
  schedule: ['approved'],
  publish: ['scheduled'],
};

export function assertContentAction(action: keyof typeof ALLOWED, status: content_status): void {
  if (!ALLOWED[action].includes(status)) throw Errors.business(ErrorCode.BUSINESS_RULE_VIOLATION, `Konten berstatus ${status} tidak dapat di-${action}`);
}
