import { AppException } from '../../src/common/exceptions/app.exception';
import { nextIntelStatus } from '../../src/modules/intel/intel-state';

describe('Intel job state transitions', () => {
  it.each([
    ['queued', 'intel.job.stage.started', { stage: 'collect' }, 'collecting'],
    ['collecting', 'intel.job.stage.started', { stage: 'analyze' }, 'analyzing'],
    ['analyzing', 'intel.job.stage.started', { stage: 'index' }, 'indexing'],
    ['cancelling', 'intel.job.completed', {}, 'completed'],
    ['indexing', 'intel.job.failed', { stage: 'index' }, 'failed'],
  ] as const)('transitions %s on %s', (current, eventType, data, expected) => {
    expect(nextIntelStatus(current, eventType, data)).toBe(expected);
  });

  it('rejects events that are invalid for the current state', () => {
    expect(() => nextIntelStatus('queued', 'intel.job.stage.started', { stage: 'analyze' })).toThrow(AppException);
    expect(() => nextIntelStatus('completed', 'intel.job.progress', { stage: 'collect' })).toThrow(AppException);
  });
});
