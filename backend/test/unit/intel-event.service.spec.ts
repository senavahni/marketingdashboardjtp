import { IntelEventService } from '../../src/modules/intel/intel-event.service';

const jobId = '55555555-5555-4555-8555-555555555555';
const workspaceId = '44444444-4444-4444-8444-444444444444';
const baseEvent = {
  contract_version: '1.2',
  event_id: '66666666-6666-4666-8666-666666666666',
  event_type: 'intel.job.started',
  occurred_at: '2026-11-04T01:00:00Z',
  job_id: jobId,
  mcp_job_id: 'j_k3m9x2qa1b',
  sequence: 1,
  data: {},
};

function createHarness(jobOverrides: Record<string, unknown> = {}, eventAlreadyProcessed = false) {
  const job = {
    id: jobId,
    workspace_id: workspaceId,
    status: 'queued',
    mcp_job_id: null,
    last_event_sequence: 0,
    started_at: null,
    created_by: '77777777-7777-4777-8777-777777777777',
    title: 'Riset pasar',
    stages: [
      { stage: 'collect', agent_key: 'researcher' },
      { stage: 'analyze', agent_key: 'analyst' },
    ],
    ...jobOverrides,
  };
  const tx = {
    mcp_webhook_events: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
    },
    intel_jobs: {
      findUnique: jest.fn().mockResolvedValue(job),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    intel_job_stages: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    mcp_webhook_events: {
      findUnique: jest.fn().mockResolvedValue(eventAlreadyProcessed ? { status: 'processed' } : null),
    },
    intel_jobs: { findUnique: jest.fn().mockResolvedValue(job) },
    tx: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const notifications = { notify: jest.fn() };
  const realtime = { toWorkspace: jest.fn() };
  const intel = { refreshFromMcp: jest.fn() };
  const service = new IntelEventService(prisma as never, notifications as never, realtime as never, intel as never);
  return { service, prisma, tx, notifications, realtime };
}

describe('IntelEventService', () => {
  it('correlates and processes an event transactionally, advancing sequence and status', async () => {
    const harness = createHarness();

    await expect(harness.service.handle(baseEvent)).resolves.toEqual({ status: 'processed' });
    expect(harness.tx.intel_jobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: jobId, last_event_sequence: 0 },
        data: expect.objectContaining({
          status: 'queued',
          mcp_job_id: 'j_k3m9x2qa1b',
          last_event_sequence: 1,
        }),
      }),
    );
    expect(harness.tx.mcp_webhook_events.upsert).toHaveBeenCalled();
    expect(harness.realtime.toWorkspace).toHaveBeenCalledWith(
      workspaceId,
      'intel.job.updated',
      expect.objectContaining({ id: jobId, status: 'queued' }),
    );
  });

  it('returns 200-shaped duplicate without applying an already processed event', async () => {
    const harness = createHarness({}, true);

    await expect(harness.service.handle(baseEvent)).resolves.toEqual({ status: 'duplicate' });
    expect(harness.prisma.tx).not.toHaveBeenCalled();
    expect(harness.realtime.toWorkspace).not.toHaveBeenCalled();
  });

  it('records and ignores an event whose sequence is stale', async () => {
    const harness = createHarness({ status: 'collecting', last_event_sequence: 5 });

    await expect(harness.service.handle({ ...baseEvent, sequence: 3 })).resolves.toEqual({ status: 'duplicate' });
    expect(harness.tx.mcp_webhook_events.upsert).toHaveBeenCalled();
    expect(harness.tx.intel_jobs.updateMany).not.toHaveBeenCalled();
    expect(harness.realtime.toWorkspace).not.toHaveBeenCalled();
  });
});
