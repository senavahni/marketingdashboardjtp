import type { LlmAgentStatus } from './intel-types';

/** Hasil rotasi key Gateway; hanya prefix, key lengkap tidak pernah sampai ke browser. */
export type LlmKeyRotateResult = {
  agent_key: string;
  key_prefix: string;
  rotated_at: string;
  old_key_revoked: boolean;
};

/** Rotasi hanya untuk agent yang punya key sendiri di MCP; agent yang memakai key system/env belum punya yang bisa diganti. */
export const canRotateKey = (agent: Pick<LlmAgentStatus, 'key_source'>) => agent.key_source === 'agent';

export function rotationOutcome(agentName: string, result: LlmKeyRotateResult): { level: 'success' | 'warning'; message: string } {
  const base = `Key ${agentName} dirotasi (${result.key_prefix}…)`;
  if (result.old_key_revoked) return { level: 'success', message: `${base}. Key lama sudah dicabut.` };
  return { level: 'warning', message: `${base}, tetapi key lama belum bisa dicabut di Gateway. Cabut manual di konsol Gateway.` };
}
