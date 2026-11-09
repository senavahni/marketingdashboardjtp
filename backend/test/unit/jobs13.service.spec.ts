/**
 * DSH-V1-02 — Jobs13Service dengan IntelMcpClient sungguhan terhadap mock MCP 1.3 (Prisma di-mock).
 */
import { AppException } from '../../src/common/exceptions/app.exception';
import { IntelMcpClient } from '../../src/modules/intel/intel-mcp-client.service';
import { Jobs13Service } from '../../src/modules/intel/v13/jobs13.service';
import { MockMcp13, startMockMcp13 } from '../../src/scripts/mock-mcp-13';

const KEY = 'mcpk_test0003_' + 'c'.repeat(43);
const WS = '00000000-0000-4000-8000-000000000001';
const PRODUCT = '00000000-0000-4000-8000-000000000601';
const user = { id: '00000000-0000-4000-8000-000000000103', username: 'member', display_name: 'Member Demo' };

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (err) {
    return err instanceof AppException ? err.code : (err as Error).message;
  }
}

function harness(mock: MockMcp13) {
  const jobs = new Map<string, Record<string, unknown>>();
  const approvals: Record<string, unknown>[] = [];
  const strategyDocs: Record<string, unknown>[] = [];
  const tx = {
    intel_jobs: {
      create: jest.fn(({ data }) => (jobs.set(data.id, { ...data, status: 'queued', deleted_at: null, started_at: null, finished_at: null }), Promise.resolve(data))),
      update: jest.fn(({ where, data }) => (jobs.set(where.id, { ...jobs.get(where.id), ...data }), Promise.resolve(jobs.get(where.id)))),
    },
    strategy_docs: { create: jest.fn(({ data }) => (strategyDocs.push(data), Promise.resolve(data))), findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    approvals: {
      findUnique: jest.fn(({ where }) => Promise.resolve(approvals.find((a) => a.mcp_review_id === where.mcp_review_id) ?? null)),
      create: jest.fn(({ data }) => (approvals.push({ id: `a${approvals.length}`, status: 'pending', ...data }), Promise.resolve(data))),
      update: jest.fn(({ where, data }) => Promise.resolve(Object.assign(approvals.find((a) => a.id === where.id) ?? {}, data))),
    },
  };
  const prisma = {
    ...tx,
    intel_jobs: { ...tx.intel_jobs, findFirst: jest.fn(({ where }) => Promise.resolve(jobs.get(where.id) ?? null)) },
    products: { findFirst: jest.fn(({ where }) => Promise.resolve(where.id === PRODUCT ? { status: 'active' } : null)) },
    upload_refs: { findFirst: jest.fn(({ where }) => Promise.resolve(where.mcp_upload_id === 'u_abc123def4' ? { purpose: 'book' } : null)) },
    approvals: { ...tx.approvals, findFirst: jest.fn(() => Promise.resolve(approvals.find((a) => a.status === 'pending') ?? null)) },
    tx: jest.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const access = { assertWorkspace: jest.fn().mockResolvedValue({ role: 'member' }), assertPermission: jest.fn().mockResolvedValue({ role: 'admin' }) };
  const client = new IntelMcpClient({ env: { MCP_INTEL_API_KEY: KEY, MCP_SERVER_URL: `${mock.url}/mcp` } } as never);
  const service = new Jobs13Service({ isIntelEnabled: true } as never, prisma as never, access as never, client);
  return { service, prisma, access, jobs, approvals, strategyDocs };
}

const spec = (kind: string, params: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ spec: { kind, title: `Uji ${kind}`, params, ...extra } });

describe('Jobs13Service × mock MCP 1.3', () => {
  let mock: MockMcp13;
  beforeAll(async () => {
    mock = await startMockMcp13({ apiKey: KEY });
  });
  afterAll(() => mock.close());

  it('create company_discovery: kontrak 1.3 terkirim (llm_assist default false), mcp_job_id tersimpan', async () => {
    const h = harness(mock);
    const dto = await h.service.create(user, WS, spec('company_discovery', { product_id: PRODUCT, region: { scope: 'province', codes: ['32'] } }, { budget_usd: 3 }));
    expect(dto).toMatchObject({ kind: 'company_discovery', llm_assist: false, budget_usd: 3, status: 'queued' });
    expect(dto.mcp_job_id).toMatch(/^j_[0-9a-z]{10}$/);
    expect((dto.stages as unknown[]).length).toBe(5);
    const call = mock.stats.calls.filter((c) => c.tool === 'intel_job_create').at(-1);
    expect(call?.args).toMatchObject({ contract_version: '1.3', workspace_id: WS, spec: { llm_assist: false, budget_usd: 3 } });
  });

  it('produk workspace lain ditolak sebelum MCP dipanggil (anti-IDOR)', async () => {
    const h = harness(mock);
    const before = mock.stats.calls.length;
    expect(await codeOf(h.service.create(user, WS, spec('opportunity_scoring', { product_id: '00000000-0000-4000-8000-000000000999' })))).toBe('VALIDATION_ERROR');
    expect(mock.stats.calls.length).toBe(before);
  });

  it('book_ingest butuh knowledge:upload dan upload milik workspace', async () => {
    const h = harness(mock);
    await h.service.create(user, WS, spec('book_ingest', { upload_id: 'u_abc123def4', asset_kind: 'book', title: 'Buku', usage_rights_confirmed: true }));
    expect(h.access.assertPermission).toHaveBeenCalledWith(user.id, WS, 'knowledge:upload');
    expect(await codeOf(h.service.create(user, WS, spec('book_ingest', { upload_id: 'u_zzzzzzzzzz', asset_kind: 'book', title: 'Buku', usage_rights_confirmed: true })))).toBe('VALIDATION_ERROR');
  });

  it('content_bank tanpa strategi approved ditolak (AC DSH-V1-11)', async () => {
    const h = harness(mock);
    const params = { strategy_report_id: 'sr_abc123def4', platforms: ['instagram'], period: { since: '2026-12-01', until: '2026-12-31' } };
    expect(await codeOf(h.service.create(user, WS, spec('content_bank', params)))).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('strategy membuat strategy_docs draft yang ditautkan ke job', async () => {
    const h = harness(mock);
    const dto = await h.service.create(user, WS, spec('strategy', { product_id: PRODUCT, objective: 'Lead SMK', period: { since: '2026-12-01', until: '2027-01-31' } }));
    expect(h.strategyDocs).toEqual([expect.objectContaining({ intel_job_id: dto.id, product_id: PRODUCT, version: 1 })]);
  });

  it('get menyinkronkan view MCP: review → approvals; review memakai izin subject lalu diteruskan ke MCP', async () => {
    const h = harness(mock);
    const dto = await h.service.create(user, WS, spec('company_discovery', { product_id: PRODUCT, region: { scope: 'national', codes: [] } }));
    const synced = await h.service.get(user, dto.id);
    expect(synced.status).toBe('awaiting_review');
    expect(h.approvals).toEqual([expect.objectContaining({ subject_type: 'product_analysis', mcp_review_id: 'r_abc123def4', intel_job_id: dto.id })]);
    await h.service.review(user, WS, dto.id, { decision: 'approve', edits: { segments: ['SMK'] } });
    const call = mock.stats.calls.filter((c) => c.tool === 'intel_job_review').at(-1);
    expect(call?.args).toMatchObject({ review_id: 'r_abc123def4', decision: 'approve', edits: { segments: ['SMK'] }, decided_by: { user_id: user.id } });
    expect(h.approvals[0]).toMatchObject({ status: 'approved', decided_by: user.id });
  });

  it('resume hanya untuk job paused', async () => {
    const h = harness(mock);
    const dto = await h.service.create(user, WS, spec('opportunity_scoring', { product_id: PRODUCT }));
    expect(await codeOf(h.service.resume(user, WS, dto.id))).toBe('JOB_NOT_ACTIVE');
    h.jobs.set(dto.id, { ...h.jobs.get(dto.id), status: 'paused' });
    await h.service.resume(user, WS, dto.id);
    expect(mock.stats.calls.some((c) => c.tool === 'intel_job_resume')).toBe(true);
  });
});
