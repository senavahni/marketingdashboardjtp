import { z } from 'zod';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { opportunity_status } from '../../generated/prisma/client';

const uuid = z.uuid();
export const OPPORTUNITY_STATUSES = ['new', 'qualified', 'contacted', 'meeting', 'proposal', 'won', 'lost', 'dropped'] as const;
const status = z.enum(OPPORTUNITY_STATUSES);
const priority = z.enum(['high', 'medium', 'low']);

/** "Jadikan opportunity" dari tabel skor (data skor disalin sebagai cache; sumber kebenaran skor = MCP). */
export const createOpportunitySchema = z.strictObject({
  product_id: uuid,
  mcp_company_id: uuid,
  company_name: z.string().trim().min(1).max(300),
  latest_score: z.number().min(0).max(100).nullable().optional(),
  priority: priority.nullable().optional(),
  score_model_version: z.string().max(32).nullable().optional(),
  owner_user_id: uuid.nullable().optional(),
  notes: z.string().trim().max(5_000).nullable().optional(),
});

export const updateOpportunitySchema = z
  .strictObject({
    status: status.optional(),
    owner_user_id: uuid.nullable().optional(),
    next_action_at: z.iso.datetime({ offset: true }).nullable().optional(),
    notes: z.string().trim().max(5_000).nullable().optional(),
    /** Alasan perubahan status (dicatat di opportunity_events). */
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'reason'), 'tidak ada perubahan');

export const opportunityNoteSchema = z.strictObject({ note: z.string().trim().min(1).max(5_000) });

export const opportunitiesQuerySchema = z.strictObject({
  status: status.optional(),
  product_id: uuid.optional(),
  owner_user_id: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});

const TERMINAL: readonly opportunity_status[] = ['won', 'lost', 'dropped'];
const REOPEN_TO: readonly opportunity_status[] = ['new', 'qualified'];

/**
 * Workflow opportunity: maju/mundur bebas di antara status aktif; status akhir (won/lost/dropped)
 * hanya bisa dibuka ulang ke new/qualified. Won/lost hanya lewat API pengguna (agent tidak punya endpoint ini — V1-K19).
 */
export function assertOpportunityTransition(from: opportunity_status, to: opportunity_status): void {
  if (from === to) throw Errors.business(ErrorCode.BUSINESS_RULE_VIOLATION, 'Status opportunity tidak berubah');
  if (TERMINAL.includes(from) && !REOPEN_TO.includes(to)) {
    throw Errors.business(ErrorCode.BUSINESS_RULE_VIOLATION, `Opportunity ${from} hanya dapat dibuka ulang ke new/qualified`);
  }
}
