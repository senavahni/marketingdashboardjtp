/**
 * DSH-V1-00: klien MCP Dashboard (IntelMcpClient) terhadap mock MCP 1.3 lewat HTTP sungguhan —
 * respons sesuai kontrak diterima, respons menyimpang ditolak (MCP_ERROR), input invalid ditolak MCP.
 */
import { AppException } from '../../src/common/exceptions/app.exception';
import { IntelMcpClient } from '../../src/modules/intel/intel-mcp-client.service';
import { jobAccepted13Schema, jobCreate13InputSchema, jobView13Schema } from '../../src/shared/schemas/intel-1.3.schema';
import { ciCompanyListSchema, miKpisSchema } from '../../src/shared/schemas/intel-1.3-tools.schema';
import { MockMcp13, startMockMcp13 } from '../../src/scripts/mock-mcp-13';

const KEY = 'mcpk_test0001_' + 'a'.repeat(43);
const WS = '11111111-1111-4111-8111-111111111111';

function clientFor(mock: MockMcp13): IntelMcpClient {
  return new IntelMcpClient({ env: { MCP_INTEL_API_KEY: KEY, MCP_SERVER_URL: `${mock.url}/mcp` } } as never);
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (err) {
    return err instanceof AppException ? err.code : (err as Error).message;
  }
  return undefined;
}

const createArgs = jobCreate13InputSchema.parse({
  contract_version: '1.3',
  dashboard_job_id: '22222222-2222-4222-8222-222222222222',
  workspace_id: WS,
  requested_by: { user_id: '33333333-3333-4333-8333-333333333333', name: 'Owner' },
  spec: { kind: 'book_ingest', title: 'Buku', params: { upload_id: 'u_abc123def4', asset_kind: 'book', title: 'Buku', usage_rights_confirmed: true } },
});

describe('IntelMcpClient × mock MCP 1.3', () => {
  let normal: MockMcp13;
  let drift: MockMcp13;

  beforeAll(async () => {
    normal = await startMockMcp13({ apiKey: KEY });
    drift = await startMockMcp13({ apiKey: KEY, mode: 'drift' });
  });
  afterAll(async () => {
    await normal.close();
    await drift.close();
  });

  it('job create → get: respons sesuai kontrak 1.3 diterima', async () => {
    const client = clientFor(normal);
    const accepted = await client.call('intel_job_create', createArgs, jobAccepted13Schema);
    expect(accepted).toMatchObject({ accepted: true, kind: 'book_ingest' });
    const view = await client.call('intel_job_get', { workspace_id: WS, mcp_job_id: accepted.mcp_job_id }, jobView13Schema);
    expect(view).toMatchObject({ dashboard_job_id: createArgs.dashboard_job_id, kind: 'book_ingest', status: 'awaiting_review' });
  });

  it('toolset baca (mi_kpis, ci_company_list) diterima', async () => {
    const client = clientFor(normal);
    const kpis = await client.call('mi_kpis', { workspace_id: WS, period: { since: '2026-10-01', until: '2026-10-31' } }, miKpisSchema);
    expect(kpis.kpis.length).toBeGreaterThan(0);
    const page = await client.call('ci_company_list', { workspace_id: WS, limit: 50 }, ciCompanyListSchema);
    expect(page.total_estimate).toBeGreaterThan(0);
  });

  it('respons tidak sesuai schema ditolak sebagai MCP_ERROR', async () => {
    const client = clientFor(drift);
    expect(await codeOf(client.call('mi_kpis', { workspace_id: WS, period: { since: '2026-10-01', until: '2026-10-31' } }, miKpisSchema))).toBe('MCP_ERROR');
  });

  it('input yang melanggar kontrak ditolak MCP (VALIDATION_ERROR)', async () => {
    const client = clientFor(normal);
    expect(await codeOf(client.call('ci_company_list', { workspace_id: WS, limit: 500 }, ciCompanyListSchema))).toBe('VALIDATION_ERROR');
  });

  it('key salah → MCP_UNAVAILABLE (tanpa membocorkan detail)', async () => {
    const client = new IntelMcpClient({ env: { MCP_INTEL_API_KEY: 'salah', MCP_SERVER_URL: `${normal.url}/mcp` } } as never);
    expect(await codeOf(client.call('mi_kpis', { workspace_id: WS, period: { since: '2026-10-01', until: '2026-10-31' } }, miKpisSchema))).toBe('MCP_UNAVAILABLE');
  });
});
