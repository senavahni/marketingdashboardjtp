import { AppException } from '../../src/common/exceptions/app.exception';
import { Job13State, applyEvent13, initialStages } from '../../src/modules/intel/v13/job13.state';

const AT = '2026-11-09T03:00:00Z';
const fresh = (): Job13State => ({ status: 'queued', stages: initialStages('company_discovery', { discovery: 'prospector' }), pause: null });
const code = (fn: () => unknown) => {
  try {
    fn();
    return 'OK';
  } catch (e) {
    return (e as AppException).code;
  }
};

describe('applyEvent13 (state job kontrak 1.3)', () => {
  it('tahap awal mengikuti KIND_STAGES; agent override dipakai, sisanya default MCP (null)', () => {
    const stages = fresh().stages;
    expect(stages.map((s) => s.stage)).toEqual(['product_analysis', 'discovery', 'enrichment', 'index', 'scoring']);
    expect(stages.find((s) => s.stage === 'discovery')?.agent_key).toBe('prospector');
    expect(stages.find((s) => s.stage === 'enrichment')?.agent_key).toBeNull();
  });

  it('alur F1: started → review produk → keputusan → pause CAPTCHA → lanjut → selesai', () => {
    let s = applyEvent13(fresh(), 'intel.job.started', {}, AT);
    expect(s.status).toBe('running');
    s = applyEvent13(s, 'intel.job.stage.started', { stage: 'product_analysis', agent_key: 'analyst' }, AT);
    s = applyEvent13(s, 'intel.job.awaiting_review', { stage: 'product_analysis', review_id: 'r_abc123def4', subject_type: 'product_analysis', subject_ref: 'pa_1', summary: '3 industri' }, AT);
    expect(s.status).toBe('awaiting_review');
    expect(s.stages[0]).toMatchObject({ status: 'awaiting_review', review: { review_id: 'r_abc123def4' } });
    s = applyEvent13(s, 'intel.job.stage.completed', { stage: 'product_analysis' }, AT);
    expect(s.stages[0]).toMatchObject({ status: 'completed', review: null });
    s = applyEvent13(s, 'intel.job.stage.started', { stage: 'discovery', agent_key: 'prospector' }, AT);
    expect(s.status).toBe('running');
    s = applyEvent13(s, 'intel.job.paused', { stage: 'discovery', reason: 'captcha', message: 'CAPTCHA', resume_hint: 'Selesaikan di Chrome' }, AT);
    expect(s).toMatchObject({ status: 'paused', pause: { reason: 'captcha', stage: 'discovery' } });
    expect(s.stages[1].status).toBe('paused');
    s = applyEvent13(s, 'intel.job.progress', { stage: 'discovery', done: 20, total: 50 }, AT);
    expect(s).toMatchObject({ status: 'running', pause: null });
    expect(s.stages[1]).toMatchObject({ status: 'running', progress: { done: 20, total: 50 } });
    s = applyEvent13(s, 'intel.job.completed', {}, AT);
    expect(s.status).toBe('completed');
  });

  it('review non-blocking (antrean baris import) tidak menghentikan job', () => {
    let s: Job13State = { status: 'queued', stages: initialStages('company_import', {}), pause: null };
    s = applyEvent13(s, 'intel.job.started', {}, AT);
    s = applyEvent13(s, 'intel.job.awaiting_review', { stage: 'insert', review_id: 'r_abc123def4', subject_type: 'import_review', subject_ref: 'ib_1', summary: '5 baris', non_blocking: true }, AT);
    expect(s.status).toBe('running');
    expect(s.stages.find((x) => x.stage === 'insert')?.review?.non_blocking).toBe(true);
  });

  it('immutable: state lama tidak berubah', () => {
    const before = fresh();
    const snapshot = JSON.stringify(before);
    applyEvent13(before, 'intel.job.started', {}, AT);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('job terminal / tahap asing / started ganda ditolak', () => {
    const done: Job13State = { ...fresh(), status: 'completed' };
    expect(code(() => applyEvent13(done, 'intel.job.progress', { stage: 'discovery', done: 1 }, AT))).toBe('JOB_NOT_ACTIVE');
    const running = applyEvent13(fresh(), 'intel.job.started', {}, AT);
    expect(code(() => applyEvent13(running, 'intel.job.started', {}, AT))).toBe('JOB_NOT_ACTIVE');
    expect(code(() => applyEvent13(running, 'intel.job.stage.started', { stage: 'collect' }, AT))).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('cancelled menandai tahap yang belum selesai; event data (ci.import.status) tidak mengubah status', () => {
    const running = applyEvent13(fresh(), 'intel.job.started', {}, AT);
    expect(applyEvent13(running, 'ci.import.status', {}, AT)).toBe(running);
    const cancelled = applyEvent13({ ...running, status: 'cancelling' }, 'intel.job.cancelled', {}, AT);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.stages.every((x) => x.status === 'cancelled')).toBe(true);
  });

  it('failed mencatat error di tahap', () => {
    const running = applyEvent13(fresh(), 'intel.job.started', {}, AT);
    const failed = applyEvent13(running, 'intel.job.failed', { stage: 'enrichment', error: { code: 'X', message: 'y', retryable: false } }, AT);
    expect(failed.status).toBe('failed');
    expect(failed.stages[2]).toMatchObject({ status: 'failed', error: { code: 'X' } });
  });
});
