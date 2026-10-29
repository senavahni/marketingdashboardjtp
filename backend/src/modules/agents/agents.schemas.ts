import { z } from 'zod';
import { booleanQuery } from '../../shared/schemas/common.schema';
import { isSafeUrl } from '../../utils/helpers/text.util';

const handle = z.string().regex(/^[A-Za-z0-9_]{3,32}$/, 'handle 3–32 karakter: huruf, angka, underscore');
const avatarUrl = z.string().max(2048).refine((v) => isSafeUrl(v), 'avatar_url harus http(s)').nullable();

export const createAgentSchema = z.object({
  name: z.string().trim().min(1).max(100),
  handle,
  mcp_agent_key: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/, 'mcp_agent_key hanya huruf, angka, _ . -'),
  description: z.string().trim().max(2000).nullable().optional(),
  avatar_url: avatarUrl.optional(),
});
export const updateAgentSchema = createAgentSchema
  .partial()
  .extend({ is_active: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Minimal satu field diisi');
export const listAgentsQuery = z.object({ include_inactive: booleanQuery });

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
