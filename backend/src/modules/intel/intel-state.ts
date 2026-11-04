import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { intel_job_status } from '../../generated/prisma/client';
import { IntelEventType } from '../../shared/schemas/intel.schema';

const terminal = new Set<intel_job_status>(['completed', 'failed', 'cancelled']);
const stageStatus: Record<string, intel_job_status> = {
  collect: 'collecting',
  analyze: 'analyzing',
  index: 'indexing',
};

export function nextIntelStatus(current: intel_job_status, eventType: IntelEventType, data: Record<string, unknown>): intel_job_status {
  if (terminal.has(current)) throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Job sudah berada pada status terminal');

  if (eventType === 'intel.job.started') {
    if (current === 'queued') return current;
    throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Job sudah mulai diproses');
  }

  if (eventType === 'intel.job.stage.started') {
    const stage = typeof data.stage === 'string' ? data.stage : '';
    const next = stageStatus[stage];
    const expectedCurrent: Record<string, intel_job_status> = {
      collect: 'queued',
      analyze: 'collecting',
      index: 'analyzing',
    };
    if (!next || expectedCurrent[stage] !== current) {
      throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Transisi tahap job tidak valid');
    }
    return next;
  }

  if (eventType === 'intel.job.progress' || eventType === 'intel.job.stage.completed') {
    const stage = typeof data.stage === 'string' ? data.stage : '';
    const isSkippedAnalyze = eventType === 'intel.job.stage.completed' && data.status === 'skipped' && stage === 'analyze';
    const isSkippedIndex = eventType === 'intel.job.stage.completed' && data.status === 'skipped' && stage === 'index';
    if (isSkippedAnalyze && current === 'collecting') return current;
    if (isSkippedIndex && current === 'analyzing') return current;
    if (stageStatus[stage] !== current) throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Event tahap tidak cocok dengan status job');
    return current;
  }

  if (eventType === 'intel.job.completed') {
    if (['collecting', 'analyzing', 'indexing', 'cancelling'].includes(current)) return 'completed';
  }

  if (eventType === 'intel.job.failed') {
    if (['queued', 'collecting', 'analyzing', 'indexing'].includes(current)) return 'failed';
  }

  if (eventType === 'intel.job.cancelled' && current === 'cancelling') return 'cancelled';
  throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Transisi status job tidak valid');
}
