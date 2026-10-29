import { workspace_role } from '../../generated/prisma/client';

export const MAX_TASK_DEPTH = 3;
export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'done'] as const;
export const TASK_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export const ACTIVE_RUN_STATUSES = ['queued', 'dispatched', 'running'] as const;
export const MCP_CONTRACT_VERSION = '1.0';

/** Urutan role untuk perbandingan hak akses. */
export const ROLE_RANK: Record<workspace_role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export function hasRole(actual: workspace_role, required: workspace_role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}
