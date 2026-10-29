import { z } from 'zod';
import { uuid } from '../../shared/schemas/common.schema';

const timezone = z.string().max(64).refine((tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'Zona waktu tidak dikenal');

export const createWorkspaceSchema = z.object({ name: z.string().trim().min(1).max(100), timezone: timezone.optional() });
export const updateWorkspaceSchema = z
  .object({ name: z.string().trim().min(1).max(100).optional(), timezone: timezone.optional() })
  .refine((v) => Object.keys(v).length > 0, 'Minimal satu field diisi');
export const addMemberSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});
export const updateMemberSchema = z.object({ role: z.enum(['admin', 'member', 'viewer']) });
export const transferOwnershipSchema = z.object({ user_id: uuid });
export const assigneesQuery = z.object({ q: z.string().trim().max(100).optional() });

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
