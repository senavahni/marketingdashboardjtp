import { z } from 'zod';
import { multiValue } from '../../shared/schemas/common.schema';
import { kbliCode, mcpRef, regionCode, uploadId } from '../../shared/schemas/intel-1.3.schema';
import { CF_STATUSES } from '../../shared/schemas/intel-1.3-import.schema';
import { CARD_TYPES, DOCTRINE_ROLES, KG_LIMITS, KG_NODE_TYPES } from '../../shared/schemas/intel-1.3-knowledge.schema';

/** Body/query HTTP Dashboard untuk Import, Contact Finder & Knowledge (DSH-V1-06/09). Divalidasi lalu dipetakan ke kontrak 1.3. */

export const refParam = mcpRef;
export const uploadIdParam = uploadId;
const page = { limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().max(500).optional() };

// ---------------------------------------------------------------- import
export const importRowsQuerySchema = z.strictObject({ status: z.enum(['review', 'failed']).default('review'), ...page });
export const importBatchesQuerySchema = z.strictObject(page);
export const rowDecisionSchema = z
  .strictObject({ decision: z.enum(['merge', 'new', 'ignore']), company_id: z.uuid().optional() })
  .refine((v) => v.decision !== 'merge' || Boolean(v.company_id), { message: 'merge butuh company_id', path: ['company_id'] });
/** Rollback nyata wajib mengetik ulang nama file batch (dicek di server, bukan hanya di UI). */
export const rollbackSchema = z.strictObject({ dry_run: z.boolean(), confirm_filename: z.string().max(255).optional() });

// ---------------------------------------------------------------- Contact Finder
export const cfTargetsQuerySchema = z.strictObject({
  statuses: multiValue(z.enum(CF_STATUSES)),
  import_batch_id: mcpRef.optional(),
  region_codes: multiValue(regionCode),
  kbli_codes: multiValue(kbliCode),
  ...page,
});
export const cfUpdateSchema = z
  .strictObject({
    priority: z.number().int().min(1).max(5).optional(),
    hint: z
      .strictObject({
        city: z.string().trim().max(100).optional(),
        address: z.string().trim().max(300).optional(),
        website: z.string().trim().max(253).optional(),
        keywords: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
      })
      .optional(),
    select_candidate_id: mcpRef.optional(),
    rerun: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'tidak ada perubahan');

// ---------------------------------------------------------------- knowledge
export const knSearchQuerySchema = z.strictObject({ q: z.string().trim().min(2).max(300), asset_ids: multiValue(mcpRef), limit: z.coerce.number().int().min(1).max(20).default(10) });
export const knCardsQuerySchema = z.strictObject({
  asset_id: mcpRef.optional(),
  card_type: z.enum(CARD_TYPES).optional(),
  role: z.enum(DOCTRINE_ROLES).optional(),
  status: z.enum(['draft', 'approved', 'rejected']).optional(),
  ...page,
});
export const cardDecisionSchema = z.strictObject({ card_ids: z.array(mcpRef).min(1).max(100), decision: z.enum(['approve', 'reject']) });
export const cardUpdateSchema = z
  .strictObject({
    version: z.number().int().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).max(2_000).optional(),
    roles: z.array(z.enum(DOCTRINE_ROLES)).max(3).optional(),
  })
  .refine((v) => Object.keys(v).length > 1, 'tidak ada perubahan');
export const roleParam = z.enum(DOCTRINE_ROLES);
export const doctrineDecisionSchema = z.strictObject({ version: z.number().int().min(1), decision: z.enum(['approve', 'reject']) });
export const playbookSaveSchema = z.strictObject({ base_version: z.number().int().min(1), yaml: z.string().min(1).max(KG_LIMITS.playbookMaxChars) });
export const kgSearchQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  types: multiValue(z.enum(KG_NODE_TYPES)),
  limit: z.coerce.number().int().min(1).max(KG_LIMITS.nodesMax).default(200),
});
export const kgNeighborsQuerySchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(KG_LIMITS.nodesMax).default(50) });
