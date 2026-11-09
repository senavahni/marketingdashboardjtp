/** DSH-V1-02 — penerima webhook kontrak 1.3 (Prisma, realtime, MCP di-mock). */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Event13Service } from '../../src/modules/intel/v13/event13.service';
import { initialStages } from '../../src/modules/intel/v13/job13.state';

const FIX = resolve(__dirname, '../../../contracts/1.3/fixtures');
const fixture = (name: string) => (JSON.parse(readFileSync(join(FIX, `${name}.json`), 'utf8')) as { payload: Record<string, unknown> }).payload;
const JOB = '22222222-2222-4222-8222-222222222222';
const WS = '11111111-1111-4111-8111-111111111111';

function harness(job: Record<string, unknown> | null) {
  const row = job ? { id: JOB, workspace_id: WS, kind: 'company_discovery', title: 'Uji', status: 'running', mcp_job_id: 'j_0123456789', last_event_sequence: 1, stage_view: initialStages('company_discovery', {}), pause: null, created_by: 'u1', started_at: new Date(), ...job } : null;
  const events = new Map<string, { status: string; received_at: Date }>();
  const approvals: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const tx = {
    intel_jobs: { findUniqueOrThrow: jest.fn().mockResolvedValue(row), updateMany: jest.fn(({ data }) => (updates.push(data), Promise.resolve({ count: 1 }))) },
    mcp_webhook_events: { upsert: jest.fn(({ where }) => (events.set(where.event_id, { status: 'processed', received_at: new Date() }), Promise.resolve({}))) },
    approvals: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(({ data }) => (approvals.push(data), Promise.resolve(data))) },
    strategy_docs: { updateMany: jest.fn() },
    upload_refs: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    content_items: { createMany: jest.fn(({ data }) => Promise.resolve({ count: data.length })) },
  };
  const prisma = {
    ...tx,
    intel_jobs: { ...tx.intel_jobs, findUnique: jest.fn().mockResolvedValue(row ? { kind: row.kind } : null) },
    mcp_webhook_events: { ...tx.mcp_webhook_events, findUnique: jest.fn(({ where }) => Promise.resolve(events.get(where.event_id) ?? null)) },
    strategy_docs: { findFirst: jest.fn().mockResolvedValue({ id: 'sd1', status: 'approved' }) },
    tx: jest.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const realtime = { toWorkspace: jest.fn() };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const legacy = { handle: jest.fn().mockResolvedValue({ status: 'processed' }) };
  const mcp = { call: jest.fn().mockResolvedValue(fixture('valid_ct_batch')) };
  const service = new Event13Service(prisma as never, realtime as never, notifications as never, legacy as never, mcp as never);
  return { service, prisma, tx, realtime, notifications, legacy, mcp, approvals, updates };
}

describe('Event13Service', () => {
  it('job Modul 3 (kind null) diteruskan ke penerima lama tanpa diproses di sini', async () => {
    const h = harness({ kind: null });
    const body = { ...fixture('valid_event_progress_eta'), event_type: 'intel.job.started', data: {} };
    await h.service.handle(body);
    expect(h.legacy.handle).toHaveBeenCalledWith(body);
    expect(h.tx.intel_jobs.updateMany).not.toHaveBeenCalled();
  });

  it('awaiting_review → status, approval baru, notifikasi, socket ke room workspace', async () => {
    const h = harness({});
    const res = await h.service.handle(fixture('valid_event_awaiting_review'));
    expect(res.status).toBe('processed');
    expect(h.updates[0]).toMatchObject({ status: 'awaiting_review', last_event_sequence: 2 });
    expect(h.approvals).toEqual([expect.objectContaining({ subject_type: 'product_analysis', mcp_review_id: 'r_abc123def4', intel_job_id: JOB })]);
    expect(h.notifications.notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'intel_review_requested', recipients: ['u1'] }), expect.anything());
    const emitted = h.realtime.toWorkspace.mock.calls.map((c) => c[1]);
    expect(emitted).toEqual(expect.arrayContaining(['approval.created', 'intel.job.updated', 'intel.job.awaiting_review']));
    expect(h.realtime.toWorkspace.mock.calls.every((c) => c[0] === WS)).toBe(true);
  });

  it('event ganda (event_id sama) → duplicate; sequence lama → diabaikan', async () => {
    const h = harness({});
    const body = fixture('valid_event_paused_captcha');
    await h.service.handle(body);
    expect(await h.service.handle(body)).toEqual({ status: 'duplicate' });
    const stale = harness({ last_event_sequence: 5 });
    expect(await stale.service.handle(body)).toEqual({ status: 'duplicate' });
    expect(stale.tx.intel_jobs.updateMany).not.toHaveBeenCalled();
  });

  it('paused CAPTCHA → status paused + info pause + notifikasi', async () => {
    const h = harness({});
    await h.service.handle(fixture('valid_event_paused_captcha'));
    expect(h.updates[0]).toMatchObject({ status: 'paused', pause: { reason: 'captcha', resume_hint: 'Selesaikan di Chrome' } });
    expect(h.notifications.notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'intel_job_paused' }), expect.anything());
  });

  it('kn.asset.status memperbarui status_cache upload', async () => {
    const h = harness({ kind: 'book_ingest', stage_view: initialStages('book_ingest', {}) });
    await h.service.handle(fixture('valid_event_asset_status'));
    expect(h.tx.upload_refs.updateMany).toHaveBeenCalledWith({ where: { workspace_id: WS, mcp_upload_id: 'u_abc123def4' }, data: { status_cache: 'embedding' } });
  });

  it('ct.batch.ready → ambil batch dari MCP setelah commit → content_items (skipDuplicates)', async () => {
    const h = harness({ kind: 'content_bank', stage_view: initialStages('content_bank', {}) });
    await h.service.handle(fixture('valid_event_batch_ready'));
    expect(h.mcp.call).toHaveBeenCalledWith('ct_batch_get', { workspace_id: WS, batch_id: 'cb_abc123def4' }, expect.anything());
    const [{ data, skipDuplicates }] = h.tx.content_items.createMany.mock.calls[0];
    expect(skipDuplicates).toBe(true);
    expect(data[0]).toMatchObject({ strategy_doc_id: 'sd1', platform: 'instagram', mcp_item_ref: 'ci_abc123def4', framework_refs: [expect.objectContaining({ page: 42 })] });
  });

  it('data event invalid → VALIDATION_ERROR dengan path data.*', async () => {
    const h = harness({});
    const bad = { ...fixture('valid_event_paused_captcha'), data: { reason: 'lelah', message: 'x' } };
    await expect(h.service.handle(bad)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
