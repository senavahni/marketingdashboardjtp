import { ErrorCode } from '../../../common/constants/error-codes';
import { Errors } from '../../../common/exceptions/app.exception';
import { intel_job_status } from '../../../generated/prisma/client';
import { Event13Type, JobKind, KIND_STAGES, PauseReason, StageView13 } from '../../../shared/schemas/intel-1.3.schema';

/** Status job kontrak 1.3 yang tersimpan di DB (subset enum Prisma). */
export type Job13Status = Extract<intel_job_status, 'queued' | 'running' | 'awaiting_review' | 'paused' | 'completed' | 'failed' | 'cancelling' | 'cancelled'>;

export interface PauseState {
  reason: PauseReason;
  message: string;
  since: string;
  resume_hint?: string | null;
  stage?: string | null;
}

export interface Job13State {
  status: Job13Status;
  stages: StageView13[];
  pause: PauseState | null;
}

export const TERMINAL_13: readonly Job13Status[] = ['completed', 'failed', 'cancelled'];
export const ACTIVE_13: readonly Job13Status[] = ['queued', 'running', 'awaiting_review', 'paused', 'cancelling'];

/** Tahap awal job: semua pending, agent dari override spec (null = default MCP). */
export function initialStages(kind: JobKind, agents: Record<string, string>): StageView13[] {
  return KIND_STAGES[kind].map((stage) => ({ stage, agent_key: agents[stage] ?? null, status: 'pending' as const, progress: { done: 0 } }));
}

function patchStage(stages: StageView13[], name: string, patch: Partial<StageView13>): StageView13[] {
  const found = stages.some((s) => s.stage === name);
  if (!found) throw Errors.conflict(ErrorCode.BUSINESS_RULE_VIOLATION, `Tahap ${name} tidak dikenal untuk job ini`);
  return stages.map((s) => (s.stage === name ? { ...s, ...patch } : s));
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Transisi state job 1.3 akibat satu event webhook (immutable). Event non-status
 * (`intel.company.upserted`, `ci.import.status`, `kn.asset.status`, `opp.scores.updated`, `ct.batch.ready`)
 * tidak mengubah status — efek sampingnya ditangani Event13Service.
 */
export function applyEvent13(state: Job13State, type: Event13Type, data: Record<string, unknown>, occurredAt: string): Job13State {
  if (TERMINAL_13.includes(state.status)) throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Job sudah berada pada status terminal');
  // Event kerja setelah pause/review = job berjalan lagi (resume/keputusan review diproses MCP)
  const resumed = (): Pick<Job13State, 'status' | 'pause'> => ({ status: state.status === 'cancelling' ? 'cancelling' : 'running', pause: null });

  switch (type) {
    case 'intel.job.started':
      if (state.status !== 'queued') throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Job sudah mulai diproses');
      return { ...state, status: 'running' };
    case 'intel.job.stage.started':
      return {
        ...state,
        ...resumed(),
        stages: patchStage(state.stages, str(data.stage), {
          status: 'running',
          started_at: occurredAt,
          ...(typeof data.agent_key === 'string' ? { agent_key: data.agent_key } : {}),
        }),
      };
    case 'intel.job.progress':
      return {
        ...state,
        ...resumed(),
        stages: patchStage(state.stages, str(data.stage), {
          status: 'running',
          progress: { done: Number(data.done), total: (data.total as number | null | undefined) ?? null },
        }),
      };
    case 'intel.job.stage.completed':
      return {
        ...state,
        ...resumed(),
        stages: patchStage(state.stages, str(data.stage), { status: data.status === 'skipped' ? 'skipped' : 'completed', finished_at: occurredAt, review: null }),
      };
    case 'intel.job.awaiting_review': {
      const review = {
        review_id: str(data.review_id),
        subject_type: data.subject_type as NonNullable<StageView13['review']>['subject_type'],
        subject_ref: str(data.subject_ref),
        summary: str(data.summary),
        non_blocking: data.non_blocking === true,
      };
      // Review tidak memblokir (mis. antrean baris import) → job tetap berjalan
      if (review.non_blocking) return { ...state, stages: patchStage(state.stages, str(data.stage), { review }) };
      return { ...state, status: 'awaiting_review', stages: patchStage(state.stages, str(data.stage), { status: 'awaiting_review', review }) };
    }
    case 'intel.job.paused': {
      const stage = typeof data.stage === 'string' ? data.stage : null;
      const pause: PauseState = {
        reason: data.reason as PauseReason,
        message: str(data.message),
        since: occurredAt,
        resume_hint: (data.resume_hint as string | null | undefined) ?? null,
        stage,
      };
      return { ...state, status: 'paused', pause, stages: stage ? patchStage(state.stages, stage, { status: 'paused' }) : state.stages };
    }
    case 'intel.job.completed':
      if (state.status === 'queued') throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Job belum mulai');
      return { ...state, status: 'completed', pause: null };
    case 'intel.job.failed': {
      const stage = typeof data.stage === 'string' ? data.stage : null;
      const error = data.error as StageView13['error'];
      return { ...state, status: 'failed', pause: null, stages: stage ? patchStage(state.stages, stage, { status: 'failed', error, finished_at: occurredAt }) : state.stages };
    }
    case 'intel.job.cancelled':
      return { ...state, status: 'cancelled', pause: null, stages: state.stages.map((s) => (['pending', 'running', 'paused', 'awaiting_review'].includes(s.status) ? { ...s, status: 'cancelled' } : s)) };
    default:
      return state;
  }
}
