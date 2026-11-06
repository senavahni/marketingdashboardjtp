/** Form "Perintah ke Agent" (M3_TASK_014 Fase A): model, validasi, dan body API. */
import { NEW_AI_PROJECT, isoDay } from './intel-wizard';

const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 14;
export const MISSION_MAX_DAYS = 180;
export const MISSION_TITLE_MAX = 150;
export const MISSION_INSTRUCTION_MAX = 4_000;
export const MISSION_OUTCOME_MAX = 1_000;

export interface MissionForm {
  title: string;
  instruction: string;
  expectedOutcome: string;
  projectId: string; // NEW_AI_PROJECT = project baru milik AI
  start: string;
  end: string;
  mode: 'auto' | 'review';
  /** Fase B: agent mengerjakan task bagiannya; `maxRuns` = budget jumlah run agent. */
  execute: boolean;
  maxRuns: number;
  /** Budget biaya run agent (USD) sebagai teks input; kosong = tanpa batas USD. */
  budgetUsd: string;
}

export const MISSION_MAX_BUDGET_USD = 100;

export const MISSION_MAX_RUNS = 50;
export const MISSION_DEFAULT_RUNS = 10;

export type MissionFormErrors = Partial<Record<'title' | 'instruction' | 'expectedOutcome' | 'period' | 'maxRuns' | 'budgetUsd', string>>;

export type CreateMissionBody = {
  title: string;
  instruction: string;
  expected_outcome?: string;
  project_id?: string;
  period: { start_date: string; end_date: string };
  approval_mode: 'auto' | 'review';
  execution_enabled: boolean;
  max_runs: number;
  budget_usd: number | null;
};

const parseBudget = (raw: string): number | null => (raw.trim() ? Number(raw.replace(',', '.')) : null);

export function emptyMissionForm(today = new Date()): MissionForm {
  return {
    title: '',
    instruction: '',
    expectedOutcome: '',
    projectId: NEW_AI_PROJECT,
    start: isoDay(today),
    end: isoDay(new Date(today.getTime() + (DEFAULT_DAYS - 1) * DAY_MS)),
    mode: 'auto',
    execute: true,
    maxRuns: MISSION_DEFAULT_RUNS,
    budgetUsd: '',
  };
}

export function validateMissionForm(f: MissionForm): MissionFormErrors {
  const e: MissionFormErrors = {};
  const title = f.title.trim();
  if (!title) e.title = 'Judul wajib diisi';
  else if (title.length > MISSION_TITLE_MAX) e.title = `Judul maksimal ${MISSION_TITLE_MAX} karakter`;
  const instruction = f.instruction.trim();
  if (instruction.length < 10) e.instruction = 'Tulis perintah minimal 10 karakter';
  else if (instruction.length > MISSION_INSTRUCTION_MAX) e.instruction = `Perintah maksimal ${MISSION_INSTRUCTION_MAX} karakter`;
  if (f.expectedOutcome.trim().length > MISSION_OUTCOME_MAX) e.expectedOutcome = `Maksimal ${MISSION_OUTCOME_MAX} karakter`;
  const start = Date.parse(f.start);
  const end = Date.parse(f.end);
  if (Number.isNaN(start) || Number.isNaN(end)) e.period = 'Tanggal tidak valid';
  else if (end < start) e.period = 'Tanggal selesai tidak boleh sebelum tanggal mulai';
  else if ((end - start) / DAY_MS + 1 > MISSION_MAX_DAYS) e.period = `Timeline maksimal ${MISSION_MAX_DAYS} hari`;
  if (f.execute && !(Number.isInteger(f.maxRuns) && f.maxRuns >= 1 && f.maxRuns <= MISSION_MAX_RUNS)) e.maxRuns = `1–${MISSION_MAX_RUNS} run`;
  const budget = parseBudget(f.budgetUsd);
  if (f.execute && budget !== null && !(Number.isFinite(budget) && budget > 0 && budget <= MISSION_MAX_BUDGET_USD)) {
    e.budgetUsd = `Budget 0,01–${MISSION_MAX_BUDGET_USD} USD atau kosongkan`;
  }
  return e;
}

export function missionFormToBody(f: MissionForm): CreateMissionBody {
  const outcome = f.expectedOutcome.trim();
  return {
    title: f.title.trim(),
    instruction: f.instruction.trim(),
    ...(outcome ? { expected_outcome: outcome } : {}),
    ...(f.projectId === NEW_AI_PROJECT ? {} : { project_id: f.projectId }),
    period: { start_date: f.start, end_date: f.end },
    approval_mode: f.mode,
    execution_enabled: f.execute,
    max_runs: f.execute ? f.maxRuns : 0,
    budget_usd: f.execute ? parseBudget(f.budgetUsd) : null,
  };
}
