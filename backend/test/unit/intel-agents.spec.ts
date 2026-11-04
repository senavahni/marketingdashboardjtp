import { AppException } from '../../src/common/exceptions/app.exception';
import { IntelService, assertSourcesSupported } from '../../src/modules/intel/intel.service';
import { AgentInfo } from '../../src/shared/schemas/intel.schema';

// M3_TASK_008 (pemilihan agent per tahap) & M3_TASK_009 (status key Gateway)

const ws = '44444444-4444-4444-8444-444444444444';
const ids = { researcher: '00000000-0000-4000-8000-000000000202', analyst: '00000000-0000-4000-8000-000000000204', strategist: '00000000-0000-4000-8000-000000000201', ghost: '00000000-0000-4000-8000-000000000299' };
const user = { id: '77777777-7777-4777-8777-777777777777' } as never;

function profile(agent_key: string, capabilities: AgentInfo['capabilities'], toolsets: string[], extra: Partial<AgentInfo> = {}): AgentInfo {
  return { agent_key, display_name: agent_key, is_active: true, route: 'smart', run_token_budget: 1000, toolsets, capabilities, gateway_key: { source: 'agent', prefix: `lgw_${agent_key.slice(0, 8).padEnd(8, '0')}` }, ...extra };
}

const PROFILES: AgentInfo[] = [
  profile('researcher', ['collect', 'analyze', 'index'], ['social', 'web', 'trends', 'kb', 'analysis']),
  profile('analyst', ['analyze', 'index'], ['analysis', 'kb'], { gateway_key: { source: 'system', prefix: 'lgw_system01' } }),
  profile('strategist', ['index'], ['kb']),
  profile('social_only', ['collect'], ['social']),
];

const LOCAL = [
  { id: ids.analyst, name: 'Agent_Analyst', mcp_agent_key: 'analyst' },
  { id: ids.ghost, name: 'Agent_Ghost', mcp_agent_key: 'ghost' },
  { id: ids.researcher, name: 'Agent_Researcher', mcp_agent_key: 'researcher' },
  { id: ids.strategist, name: 'Agent_Strategist', mcp_agent_key: 'strategist' },
];

function harness(mcpResult: unknown = { agents: PROFILES }) {
  const tx = { intel_stage_defaults: { upsert: jest.fn().mockResolvedValue(undefined) } };
  const prisma = {
    agents: {
      findMany: jest.fn().mockResolvedValue(LOCAL),
      findFirst: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(LOCAL.find((a) => a.id === where.id) ?? null)),
    },
    intel_stage_defaults: { findMany: jest.fn().mockResolvedValue([]) },
    tx: jest.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const access = { assertWorkspace: jest.fn().mockResolvedValue({ role: 'admin' }) };
  const redis = { client: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') } };
  const mcp = { call: jest.fn().mockResolvedValue(mcpResult) };
  const config = { isIntelEnabled: true };
  const service = new IntelService(config as never, prisma as never, access as never, redis as never, mcp as never, {} as never);
  return { service, prisma, access, mcp, tx, config };
}

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (err) {
    return err instanceof AppException ? err.code : (err as Error).message;
  }
  return undefined;
}

describe('IntelService.agents', () => {
  it('menggabungkan agent workspace dengan profil MCP; tanpa profil → UNKNOWN_AGENT', async () => {
    const { service } = harness();
    const { data } = await service.agents(user, ws, false);
    const byKey = Object.fromEntries(data.map((a) => [a.mcp_agent_key, a]));
    expect(byKey.researcher).toMatchObject({ capabilities: ['collect', 'analyze', 'index'], route: 'smart', gateway_key: { source: 'agent' } });
    expect(byKey.analyst).toMatchObject({ capabilities: ['analyze', 'index'], gateway_key: { source: 'system', prefix: 'lgw_system01' } });
    expect(byKey.ghost).toEqual({ id: ids.ghost, name: 'Agent_Ghost', mcp_agent_key: 'ghost', capabilities: [], reason: 'UNKNOWN_AGENT' });
  });

  it('profil MCP nonaktif → reason AGENT_INACTIVE', async () => {
    const { service } = harness({ agents: [profile('analyst', ['analyze'], ['analysis'], { is_active: false })] });
    const { data } = await service.agents(user, ws, false);
    expect(data.find((a) => a.mcp_agent_key === 'analyst')).toMatchObject({ reason: 'AGENT_INACTIVE' });
  });

  it('modul nonaktif (MCP_INTEL_API_KEY kosong) → 503 FEATURE_DISABLED', async () => {
    const h = harness();
    h.config.isIntelEnabled = false;
    expect(await errorCode(h.service.agents(user, ws, false))).toBe('FEATURE_DISABLED');
  });
});

describe('IntelService.updateStageDefaults', () => {
  it('menyimpan agent yang mampu dan mewajibkan peran admin', async () => {
    const { service, access, tx } = harness();
    await service.updateStageDefaults(user, ws, { collect: ids.researcher, analyze: ids.analyst });
    expect(access.assertWorkspace).toHaveBeenCalledWith(expect.anything(), ws, 'admin');
    expect(tx.intel_stage_defaults.upsert).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ collect: ids.strategist }, 'AGENT_NOT_CAPABLE'],
    [{ analyze: ids.strategist }, 'AGENT_NOT_CAPABLE'],
    [{ collect: ids.analyst }, 'AGENT_NOT_CAPABLE'],
    [{ analyze: ids.ghost }, 'UNKNOWN_AGENT'],
  ])('%j ditolak %s tanpa menulis apa pun', async (input, code) => {
    const { service, tx } = harness();
    expect(await errorCode(service.updateStageDefaults(user, ws, input))).toBe(code);
    expect(tx.intel_stage_defaults.upsert).not.toHaveBeenCalled();
  });
});

describe('assertSourcesSupported', () => {
  it('menolak sumber web bila agent collect tidak punya toolset web', () => {
    expect(() => assertSourcesSupported('researcher', [{ type: 'x' }, { type: 'web' }, { type: 'trends' }], PROFILES)).not.toThrow();
    expect(() => assertSourcesSupported('social_only', [{ type: 'x' }, { type: 'threads' }], PROFILES)).not.toThrow();
    let caught: unknown;
    try {
      assertSourcesSupported('social_only', [{ type: 'x' }, { type: 'web' }], PROFILES);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppException);
    expect((caught as AppException).code).toBe('AGENT_NOT_CAPABLE');
    expect((caught as AppException).details).toEqual({ sources: ['web'] });
  });
});

describe('IntelService.events (tab Log)', () => {
  it('mengembalikan metadata event job berurutan setelah cek akses workspace', async () => {
    const { service, prisma, access } = harness();
    const rows = [{ event_id: 'e1', event_type: 'intel.job.started', status: 'processed', received_at: new Date(), processed_at: new Date() }];
    Object.assign(prisma, {
      intel_jobs: { findFirst: jest.fn().mockResolvedValue({ id: 'j1', workspace_id: ws, stages: [], insight: null }) },
      mcp_webhook_events: { findMany: jest.fn().mockResolvedValue(rows) },
    });
    const res = await service.events(user, 'j1');
    expect(access.assertWorkspace).toHaveBeenCalledWith(expect.anything(), ws);
    expect(res).toEqual({ data: rows });
    const [args] = (prisma as unknown as { mcp_webhook_events: { findMany: jest.Mock } }).mcp_webhook_events.findMany.mock.calls[0];
    expect(args).toMatchObject({ where: { job_id: 'j1' }, orderBy: { received_at: 'asc' } });
    expect(Object.keys(args.select)).not.toContain('payload');
  });
});

describe('IntelService.llmStatus', () => {
  it('hanya admin dan tidak pernah mengembalikan key lgw_ lengkap', async () => {
    const fullKey = `lgw_ab12cd34_${'x'.repeat(43)}`;
    const { service, access, mcp } = harness({
      agents: [
        { agent_key: 'analyst', key_source: 'agent', key_prefix: 'lgw_ab12cd34', key_status: 'invalid', last_error: `401 untuk ${fullKey}`, usage: { calls: 3, prompt_tokens: 10, completion_tokens: 5, usd: 0.01 } },
      ],
      project: null,
    });
    const res = await service.llmStatus(user, ws, { range_days: '30' });
    expect(access.assertWorkspace).toHaveBeenCalledWith(expect.anything(), ws, 'admin');
    expect(mcp.call).toHaveBeenCalledWith('intel_llm_status', { range_days: 30 }, expect.anything(), undefined);
    expect(JSON.stringify(res)).not.toContain(fullKey);
    expect(res.agents[0].key_prefix).toBe('lgw_ab12cd34');
  });
});
