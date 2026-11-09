import { z } from 'zod';
import { multiValue } from '../../shared/schemas/common.schema';
import { COMPANY_ORIGINS, ORG_TYPES, kbliCode, regionCode } from '../../shared/schemas/intel-1.3.schema';

const uuid = z.uuid();
const isoDate = z.iso.date();
const page = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(500).optional(),
};

/** Filter perusahaan dari query string (`?region_codes=32,33&org_types=education`). */
const companyFilterQuery = {
  q: z.string().trim().max(100).optional(),
  kbli_codes: multiValue(kbliCode),
  region_codes: multiValue(regionCode),
  org_types: multiValue(z.enum(ORG_TYPES)),
  origins: multiValue(z.enum(COMPANY_ORIGINS)),
  min_completeness: z.coerce.number().min(0).max(1).optional(),
  product_id: uuid.optional(),
};

export const kpisQuerySchema = z
  .strictObject({ since: isoDate, until: isoDate, compare: z.enum(['previous_period', 'yoy', 'none']).default('previous_period') })
  .refine((v) => v.until >= v.since, { message: 'until tidak boleh sebelum since', path: ['until'] });

export const companiesQuerySchema = z.strictObject({
  ...companyFilterQuery,
  order_by: z.enum(['-updated_at', 'name', '-top_score', '-completeness']).default('-updated_at'),
  ...page,
});

export const geoClustersQuerySchema = z.strictObject({
  ...companyFilterQuery,
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, 'bbox = west,south,east,north')
    .transform((v) => v.split(',').map(Number) as [number, number, number, number]),
  zoom: z.coerce.number().int().min(0).max(20),
});

export const oppScoresQuerySchema = z.strictObject({
  product_id: uuid.optional(),
  priorities: multiValue(z.enum(['high', 'medium', 'low'])),
  kbli_codes: multiValue(kbliCode),
  region_codes: multiValue(regionCode),
  org_types: multiValue(z.enum(ORG_TYPES)),
  insufficient_data: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  order_by: z.enum(['-score', '-scored_at']).default('-score'),
  ...page,
});

export const oppExplainQuerySchema = z.strictObject({ product_id: uuid, company_id: uuid, score_model_version: z.string().max(32).optional() });

export const knAssetsQuerySchema = z.strictObject({ kind: z.enum(['book', 'brand']).optional(), ...page });

type CompanyFilterQuery = { [K in keyof typeof companyFilterQuery]?: z.infer<(typeof companyFilterQuery)[K]> };

/** Query HTTP → `filter` kontrak 1.3 (array kosong = tanpa filter). */
export function toCompanyFilter(q: CompanyFilterQuery) {
  return {
    q: q.q ?? null,
    kbli_codes: q.kbli_codes ?? [],
    region_codes: q.region_codes ?? [],
    org_types: q.org_types ?? [],
    origins: q.origins ?? [],
    min_completeness: q.min_completeness ?? null,
    product_id: q.product_id ?? null,
  };
}
