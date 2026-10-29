import { z } from 'zod';
import { dateString } from '../../shared/schemas/common.schema';

export const timelineQuery = z
  .object({ from: dateString.optional(), to: dateString.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'from harus ≤ to', path: ['to'] });

export const rescheduleSchema = z.object({
  start_date: dateString.nullable(),
  end_date: dateString.nullable(),
  cascade: z.enum(['shift', 'none']).optional(),
});
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
