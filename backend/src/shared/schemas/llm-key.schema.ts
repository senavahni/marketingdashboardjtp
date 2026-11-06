import { z } from 'zod';

/** Rotasi key LLM Gateway per agent dari Dashboard. Cermin `tools/intel_keys.py` MCP. */
export const llmKeyAgentKeySchema = z.string().regex(/^[a-z0-9_-]{2,64}$/, 'agent_key: huruf kecil, angka, - atau _ (2–64 karakter)');

// hanya prefix (lgw_ + 8 karakter); key lengkap tidak pernah boleh lolos ke klien
export const llmKeyRotateResultSchema = z.object({
  agent_key: z.string(),
  key_prefix: z.string().regex(/^lgw_[a-z0-9]{8}$/),
  rotated_at: z.string(),
  old_key_revoked: z.boolean(),
});

export type LlmKeyRotateResult = z.infer<typeof llmKeyRotateResultSchema>;
