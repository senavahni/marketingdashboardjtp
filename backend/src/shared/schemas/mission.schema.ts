import { z } from 'zod';

/** Misi agent (M3_TASK_013): cermin `MissionPlan` MCP (`services/intel/mission_plan.py`). */
export const MISSION_LIMITS = {
  maxTasks: 15,
  maxSubtasks: 8,
  maxItems: 60,
  maxDays: 180,
  titleMaxChars: 150,
  instructionMaxChars: 4_000,
  feedbackMaxChars: 1_000,
  maxRevisions: 3,
} as const;

export const MISSION_STATUSES = [
  'waiting_research',
  'planning',
  'awaiting_review',
  'scheduled',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
] as const;

const isoDate = z.iso.date();
const priority = z.enum(['none', 'low', 'medium', 'high', 'urgent']);

const planSubtaskSchema = z.object({
  ref: z.string().min(1).max(40),
  title: z.string().min(1).max(200),
  description: z.string().max(2_000).default(''),
  start_date: isoDate,
  end_date: isoDate,
  priority: priority.default('medium'),
  tags: z.array(z.string().max(50)).max(5).default([]),
  executor: z.enum(['agent', 'human']).default('human'),
  agent_key: z.string().max(100).nullable().optional(),
  depends_on: z.array(z.string()).max(10).default([]),
});

const planTaskSchema = planSubtaskSchema.extend({
  subtasks: z.array(planSubtaskSchema).max(MISSION_LIMITS.maxSubtasks).default([]),
});

export const missionPlanSchema = z.object({
  summary: z.string().max(600).default(''),
  assumptions: z.array(z.string().max(300)).max(10).default([]),
  risks: z
    .array(z.object({ code: z.enum(['TIMELINE_TIGHT', 'LOW_DATA', 'OUT_OF_SCOPE', 'OTHER']), message: z.string().max(300) }))
    .max(10)
    .default([]),
  tasks: z.array(planTaskSchema).min(1).max(MISSION_LIMITS.maxTasks),
});

export const missionPlanOutputSchema = z.object({
  plan: missionPlanSchema,
  cost: z.object({ llm_tokens: z.number().int(), usd: z.number() }),
});

export type MissionPlan = z.infer<typeof missionPlanSchema>;
export type MissionPlanTask = z.infer<typeof planTaskSchema>;

/** Cek ulang rencana sebelum ditulis ke Penjadwalan (MCP sudah memvalidasi; ini pertahanan kedua). */
export function planViolation(plan: MissionPlan, start: string, end: string): string | null {
  const items = plan.tasks.flatMap((t) => [t, ...t.subtasks]);
  if (items.length > MISSION_LIMITS.maxItems) return `Rencana maksimal ${MISSION_LIMITS.maxItems} task + subtask`;
  const refs = new Set(items.map((x) => x.ref));
  if (refs.size !== items.length) return 'ref ganda dalam rencana';
  for (const task of plan.tasks) {
    for (const x of [task, ...task.subtasks]) {
      if (x.end_date < x.start_date) return `${x.ref}: end_date sebelum start_date`;
      if (x.start_date < start || x.end_date > end) return `${x.ref}: tanggal di luar timeline`;
    }
    for (const s of task.subtasks) {
      if (s.start_date < task.start_date || s.end_date > task.end_date) return `${s.ref}: di luar rentang task ${task.ref}`;
    }
  }
  const unknown = items.find((x) => x.depends_on.some((d) => !refs.has(d)));
  return unknown ? `${unknown.ref}: depends_on tidak dikenal` : null;
}

const period = z
  .strictObject({ start_date: isoDate, end_date: isoDate })
  .refine((p) => p.end_date >= p.start_date, { message: 'end_date harus >= start_date', path: ['end_date'] })
  .refine((p) => (Date.parse(p.end_date) - Date.parse(p.start_date)) / 86_400_000 + 1 <= MISSION_LIMITS.maxDays, {
    message: `Timeline maksimal ${MISSION_LIMITS.maxDays} hari`,
    path: ['end_date'],
  });

/** Bagian "Masukkan ke Penjadwalan" pada wizard job riset. */
export const intelScheduleInputSchema = z.strictObject({
  // kosong = buat project baru milik AI (dibuat agent planner) khusus job ini
  project_id: z.uuid().optional(),
  period,
  approval_mode: z.enum(['auto', 'review']).default('auto'),
  planner_agent_id: z.uuid().optional(),
});

export const missionReviseSchema = z.strictObject({
  feedback: z.string().trim().min(1).max(MISSION_LIMITS.feedbackMaxChars),
});

export const missionsQuerySchema = z.strictObject({
  status: z.enum(MISSION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

export type IntelScheduleInput = z.infer<typeof intelScheduleInputSchema>;
