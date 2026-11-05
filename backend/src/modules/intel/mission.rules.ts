import { task_status } from '../../generated/prisma/client';
import { MissionPlan, MissionPlanTask } from '../../shared/schemas/mission.schema';

/** Aturan murni misi (M3_TASK_013) — tanpa DB, mudah diuji. */

export type IntelStage = 'collect' | 'analyze' | 'index';
export type StageEvent = 'started' | 'completed' | 'skipped' | 'failed' | 'cancelled';

export const MISSION_TAG = 'misi';
export const STAGE_TITLE: Record<IntelStage, string> = {
  collect: 'Kumpulkan data',
  analyze: 'Analisis sentimen & tren',
  index: 'Indeks ke Knowledge Base',
};
export const PLANNER_TOOLSET = 'task';
export const PREFERRED_PLANNER_KEY = 'strategist';

export const stageTag = (stage: IntelStage) => `tahap:${stage}`;
export const executorTag = (executor: 'agent' | 'human') => `eksekutor:${executor}`;

/** Status task subtask tahap untuk event tahap job riset; null = status tidak berubah. */
export function stageTaskStatus(event: StageEvent): task_status | null {
  if (event === 'started' || event === 'failed') return 'in_progress';
  if (event === 'completed' || event === 'skipped') return 'done';
  return null;
}

/** Teks deskripsi task (paragraf blok) — termasuk dependensi dalam bentuk judul. */
export function planItemDescription(item: Pick<MissionPlanTask, 'description' | 'depends_on'>, titleByRef: Map<string, string>): string[] {
  const lines = item.description
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const deps = item.depends_on.map((ref) => titleByRef.get(ref) ?? ref);
  return deps.length ? [...lines, `Bergantung pada: ${deps.join(', ')}`] : lines;
}

export function titleIndex(plan: MissionPlan): Map<string, string> {
  return new Map(plan.tasks.flatMap((t) => [t, ...t.subtasks]).map((x) => [x.ref, x.title]));
}

/** Pilih agent planner: yang diminta (bila mampu), lalu `strategist`, lalu agent mampu pertama. */
export function pickPlanner<T extends { id: string; mcp_agent_key: string }>(
  agents: T[],
  capableKeys: Set<string>,
  requestedId?: string,
): T | null {
  const capable = agents.filter((a) => capableKeys.has(a.mcp_agent_key));
  if (requestedId) return capable.find((a) => a.id === requestedId) ?? null;
  return capable.find((a) => a.mcp_agent_key === PREFERRED_PLANNER_KEY) ?? capable[0] ?? null;
}
