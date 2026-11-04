import { z } from 'zod';
import {
  INTEL_JOB_STATUSES,
  INTEL_LIMITS,
  INTEL_SOURCE_TYPES,
  INTEL_STAGES,
  intelSourceSchema,
  periodSchema,
} from '../../shared/schemas/intel.schema';

const uuid = z.uuid();

export const intelJobInputSchema = z.strictObject({
  spec: z.strictObject({
    title: z.string().trim().min(1).max(INTEL_LIMITS.titleMaxChars),
    language: z.enum(['id', 'en']).default('id'),
    period: periodSchema,
    sources: z
      .array(intelSourceSchema)
      .min(1)
      .max(INTEL_LIMITS.maxSources)
      .refine((sources) => new Set(sources.map((source) => source.type)).size === sources.length, 'maksimal satu sumber per type'),
    aspects: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  }),
  agents: z.strictObject({ collect: uuid, analyze: uuid }),
});

export const createIntelJobSchema = intelJobInputSchema.extend({
  confirm_cost: z.boolean().default(false),
  retry_of_job_id: uuid.optional(),
});

export const stageDefaultsInputSchema = z.strictObject({
  collect: uuid.optional(),
  analyze: uuid.optional(),
});

export const intelJobsQuerySchema = z.strictObject({
  status: z.enum(INTEL_JOB_STATUSES).optional(),
  source: z.enum(INTEL_SOURCE_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

export const intelItemsQuerySchema = z.strictObject({
  source: z.enum(INTEL_SOURCE_TYPES).optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  q: z.string().trim().max(100).optional(),
  order_by: z.enum(['-created_at', 'created_at', '-engagement']).default('-created_at'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(500).optional(),
});

export const llmStatusQuerySchema = z.strictObject({
  range_days: z.coerce
    .number()
    .int()
    .refine((v) => v === 7 || v === 30)
    .default(7),
});

export const intelStageSchema = z.enum(INTEL_STAGES);
