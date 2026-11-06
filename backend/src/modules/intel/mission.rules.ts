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

// ================= Eksekusi misi (M3_TASK_014 Fase B) =================

export const MAX_ACTIVE_RUNS_PER_MISSION = 2;
const AGENT_EXECUTOR_TAG = executorTag('agent');

export interface ExecTask {
  id: string;
  parent_task_id: string | null;
  title: string;
  status: task_status;
  assignee_type: string | null;
  agent_status: string;
  start_date: string | null;
  end_date: string | null;
  tags: string[];
}

const DAY_MS = 86_400_000;

/** Tanggal ISO (YYYY-MM-DD) + n hari. */
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export interface Reschedule {
  changes: { id: string; start_date: string; end_date: string }[];
  /** Ada task yang kini berakhir setelah timeline misi. */
  overrun: boolean;
}

/**
 * Penjadwalan ulang deterministik (tanpa LLM): task rencana `todo` yang sudah lewat tenggat digeser
 * ke hari ini (durasi tetap); dependen digeser agar mulai ≥ selesainya dependensi (hari yang sama
 * boleh); rentang task induk diperlebar menutup subtask-nya. Task berjalan/selesai tidak diubah.
 */
export function rescheduleOverdue(tasks: ExecTask[], deps: Map<string, string[]>, today: string, missionEnd: string): Reschedule {
  const dates = new Map(tasks.map((t) => [t.id, { start: t.start_date, end: t.end_date }]));
  const movable = (t: ExecTask) => isPlanTask(t) && t.status === 'todo' && t.start_date !== null && t.end_date !== null;
  const moved = new Set<string>();
  const shift = (id: string, newStart: string) => {
    const d = dates.get(id)!;
    const len = daysBetween(d.start!, d.end!);
    dates.set(id, { start: newStart, end: addDays(newStart, len) });
    moved.add(id);
  };
  for (const t of tasks) if (movable(t) && t.end_date! < today) shift(t.id, today);
  // propagasi hanya dari dependensi yang benar-benar digeser (tumpang-tindih bawaan rencana dibiarkan)
  for (let pass = 0; pass < tasks.length; pass++) {
    let changed = false;
    for (const t of tasks.filter(movable)) {
      const latest = (deps.get(t.id) ?? [])
        .filter((d) => moved.has(d))
        .map((d) => dates.get(d)?.end)
        .filter((x): x is string => !!x)
        .sort()
        .pop();
      const cur = dates.get(t.id)!;
      if (latest && cur.start! < latest) {
        shift(t.id, latest);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // induk menutup subtask
  for (const parent of tasks.filter(isPlanTask)) {
    const kids = tasks.filter((c) => c.parent_task_id === parent.id).map((c) => dates.get(c.id)!);
    const cur = dates.get(parent.id)!;
    if (!kids.length || !cur.start || !cur.end) continue;
    const start = [cur.start, ...kids.map((k) => k.start!).filter(Boolean)].sort()[0];
    const end = [cur.end, ...kids.map((k) => k.end!).filter(Boolean)].sort().pop()!;
    dates.set(parent.id, { start, end });
  }
  const changes = tasks
    .filter((t) => {
      const d = dates.get(t.id)!;
      return d.start !== t.start_date || d.end !== t.end_date;
    })
    .map((t) => ({ id: t.id, start_date: dates.get(t.id)!.start!, end_date: dates.get(t.id)!.end! }));
  return { changes, overrun: changes.some((c) => c.end_date > missionEnd) };
}

const isPlanTask = (t: Pick<ExecTask, 'tags'>) => t.tags.includes(MISSION_TAG) && !t.tags.some((tag) => tag.startsWith('tahap:'));

/**
 * Task misi yang siap dikerjakan agent: bertanda eksekutor agent, `todo`, belum di-assign, agent idle,
 * tanggal mulai sudah tiba, semua dependensi & subtask selesai. Urut tanggal mulai, maksimal `slots`.
 */
export function pickRunnable(tasks: ExecTask[], deps: Map<string, string[]>, today: string, slots: number): ExecTask[] {
  if (slots <= 0) return [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const done = (id: string) => byId.get(id)?.status === 'done';
  const childrenOpen = (id: string) => tasks.some((t) => t.parent_task_id === id && t.status !== 'done');
  return tasks
    .filter(
      (t) =>
        t.tags.includes(AGENT_EXECUTOR_TAG) &&
        t.status === 'todo' &&
        t.assignee_type === null &&
        t.agent_status === 'idle' &&
        (!t.start_date || t.start_date <= today) &&
        (deps.get(t.id) ?? []).every(done) &&
        !childrenOpen(t.id),
    )
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? '') || a.title.localeCompare(b.title))
    .slice(0, slots);
}

/** Misi selesai bila semua task rencana (bukan subtask tahap riset) berstatus done. */
export function planComplete(tasks: Pick<ExecTask, 'status' | 'tags'>[]): boolean {
  const plan = tasks.filter(isPlanTask);
  return plan.length > 0 && plan.every((t) => t.status === 'done');
}

/** Ref dependensi rencana → id task (via `task_map` misi). Ref yang tidak terpetakan diabaikan. */
export function dependencyIds(plan: MissionPlan, taskMap: Record<string, string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const item of plan.tasks.flatMap((t) => [t, ...t.subtasks])) {
    const id = taskMap[item.ref];
    if (!id) continue;
    out.set(
      id,
      item.depends_on.map((ref) => taskMap[ref]).filter((x): x is string => !!x),
    );
  }
  return out;
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
