import { z } from 'zod';
import { dateString, multiValue, uuid } from '../../shared/schemas/common.schema';
import { paginationQuery } from '../../utils/helpers/pagination.util';

export const WEB_REPORT_PERIOD_TYPES = ['monthly', 'quarterly', 'yearly', 'custom'] as const;
export const MAX_COUNT = 2_000_000_000;
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 12;

/** Rupiah ≥ 0, maks 15 digit bulat + 2 desimal (NUMERIC(18,2)). Diterima sebagai string atau number. */
const MONEY_RE = /^\d{1,15}(\.\d{1,2})?$/;
const money = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .pipe(z.string().regex(MONEY_RE, 'Nominal rupiah harus angka ≥ 0 dengan maksimal 2 desimal'));
const count = z.number().int('Harus bilangan bulat').min(0, 'Tidak boleh negatif').max(MAX_COUNT);

const sessionFields = {
  title: z.string().trim().min(1).max(150),
  period_type: z.enum(WEB_REPORT_PERIOD_TYPES),
  period_start: dateString,
  period_end: dateString,
  visitors: count,
  leads: count,
  sales_count: count,
  revenue: money,
  cost_maintenance: money,
  cost_ads: money,
  notes: z.string().max(2000).nullable(),
};

export const createWebReportSchema = z.object({
  ...sessionFields,
  period_type: sessionFields.period_type.default('monthly'),
  cost_maintenance: money.default('0'),
  cost_ads: money.default('0'),
  notes: sessionFields.notes.optional(),
});

export const updateWebReportSchema = z
  .object(sessionFields)
  .partial()
  .extend({ version: z.number().int().min(1) })
  .refine((v) => Object.keys(v).length > 1, 'Minimal satu field diisi');

export const listWebReportsQuery = paginationQuery().extend({
  period_type: z.enum(WEB_REPORT_PERIOD_TYPES).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const compareWebReportsQuery = z.object({
  ids: multiValue(uuid).pipe(z.array(z.string()).min(COMPARE_MIN).max(COMPARE_MAX)),
});

export type CreateWebReportInput = z.infer<typeof createWebReportSchema>;
export type UpdateWebReportInput = z.infer<typeof updateWebReportSchema>;
export type ListWebReportsQuery = z.infer<typeof listWebReportsQuery>;
