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
  const activity = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new IntelService(config as never, prisma as never, access as never, redis as never, mcp as never, {} as never, activity as never, {} as never);
  return { service, prisma, access, mcp, tx, config, activity };
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

  it('menyimpan default tahap index (agent dengan kapabilitas index)', async () => {
    const { service, tx } = harness();
    await service.updateStageDefaults(user, ws, { index: ids.strategist });
    expect(tx.intel_stage_defaults.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id_stage: { workspace_id: ws, stage: 'index' } } }));
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

describe('IntelService.mcpProfiles (autocomplete MCP agent key)', () => {
  it('mengembalikan profil MCP + agent workspace yang sudah memakainya', async () => {
    const { service, prisma } = harness();
    prisma.agents.findMany.mockResolvedValue([{ id: ids.researcher, name: 'Agent_Researcher', mcp_agent_key: 'researcher' }]);
    const { data } = await service.mcpProfiles(user, ws);
    expect(data.map((p) => p.agent_key)).toEqual(['researcher', 'analyst', 'strategist', 'social_only']);
    expect(data[0]).toEqual({ agent_key: 'researcher', display_name: 'researcher', is_active: true, capabilities: ['collect', 'analyze', 'index'], used_by: { id: ids.researcher, name: 'Agent_Researcher' } });
    expect(data[1].used_by).toBeNull();
    expect(JSON.stringify(data)).not.toContain('lgw_');
  });
});

describe('IntelService.bootstrapAgents (Tambah agent default)', () => {
  function bootstrapHarness(existing: unknown[], defaults: { stage: string }[] = []) {
    const h = harness();
    let seq = 0;
    const tx = {
      agents: { create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: `new-${++seq}`, is_active: true, ...data })) },
      intel_stage_defaults: { create: jest.fn().mockResolvedValue(undefined) },
    };
    h.prisma.agents.findMany.mockResolvedValue(existing);
    h.prisma.intel_stage_defaults.findMany.mockResolvedValue(defaults);
    h.prisma.tx.mockImplementation(((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)) as never);
    return { ...h, tx };
  }

  it('workspace kosong → buat researcher/analyst/strategist + default collect/analyze/index (admin)', async () => {
    const { service, access, tx, activity } = bootstrapHarness([]);
    const res = await service.bootstrapAgents(user, ws);
    expect(access.assertWorkspace).toHaveBeenCalledWith(expect.anything(), ws, 'admin');
    expect(tx.agents.create.mock.calls.map(([a]) => a.data.mcp_agent_key)).toEqual(['researcher', 'analyst', 'strategist']);
    expect(tx.agents.create.mock.calls[0][0].data).toMatchObject({ workspace_id: ws, name: 'Agent_Researcher', handle: 'Agent_Researcher' });
    expect(tx.intel_stage_defaults.create.mock.calls.map(([a]) => a.data.stage)).toEqual(['collect', 'analyze', 'index']);
    expect(activity.log).toHaveBeenCalledTimes(3);
    expect(res).toEqual({ created: ['Agent_Researcher', 'Agent_Analyst', 'Agent_Strategist'], defaults: ['collect', 'analyze', 'index'] });
  });

  it('agent dengan key yang sama dipakai ulang; default yang sudah ada tidak ditimpa; handle bentrok diberi akhiran', async () => {
    const existing = [
      { id: 'a1', name: 'Peneliti', handle: 'Peneliti', mcp_agent_key: 'researcher', is_active: true },
      { id: 'a2', name: 'Lain', handle: 'agent_analyst', mcp_agent_key: 'other', is_active: true },
    ];
    const { service, tx } = bootstrapHarness(existing, [{ stage: 'analyze' }]);
    const res = await service.bootstrapAgents(user, ws);
    expect(tx.agents.create.mock.calls.map(([a]) => a.data.handle)).toEqual(['Agent_Analyst_2', 'Agent_Strategist']);
    expect(tx.intel_stage_defaults.create.mock.calls.map(([a]) => a.data)).toEqual([
      expect.objectContaining({ stage: 'collect', agent_id: 'a1' }),
      expect.objectContaining({ stage: 'index' }),
    ]);
    expect(res.defaults).toEqual(['collect', 'index']);
  });

  it('profil yang tidak ada / nonaktif di MCP dilewati', async () => {
    const h = bootstrapHarness([]);
    h.mcp.call.mockResolvedValue({ agents: [profile('researcher', ['collect'], ['web']), profile('analyst', ['analyze'], ['analysis'], { is_active: false })] });
    const res = await h.service.bootstrapAgents(user, ws);
    expect(res).toEqual({ created: ['Agent_Researcher'], defaults: ['collect'] });
  });
});

describe('IntelService.estimate (spec ke MCP)', () => {
  it('memindahkan aspects ke stages.analyze dan lolos jobSpecSchema strict', async () => {
    const { service, mcp } = harness();
    mcp.call.mockImplementation((tool: string) => Promise.resolve(tool === 'intel_agents_list' ? { agents: PROFILES } : { estimate: true }));
    const input = {
      spec: { title: 'Uji', language: 'id', period: { since: '2026-10-29', until: '2026-11-05' }, sources: [{ type: 'web', mode: 'scrape', urls: ['https://example.com/'] }], aspects: ['harga'] },
      agents: { collect: ids.researcher, analyze: ids.analyst },
    };
    await service.estimate(user, ws, input);
    const [, args] = mcp.call.mock.calls.find(([tool]: [string]) => tool === 'intel_job_estimate');
    expect(args.spec).not.toHaveProperty('aspects');
    expect(args.spec.stages.analyze).toMatchObject({ agent_key: 'analyst', aspects: ['harga'] });
    expect(args.spec.stages).not.toHaveProperty('index');
  });

  it('agents.index → stages.index aktif dengan agent berkapabilitas index (M3_TASK_010)', async () => {
    const { service, mcp } = harness();
    mcp.call.mockImplementation((tool: string) => Promise.resolve(tool === 'intel_agents_list' ? { agents: PROFILES } : { estimate: true }));
    const spec = { title: 'Uji', language: 'id', period: { since: '2026-10-29', until: '2026-11-05' }, sources: [{ type: 'web', mode: 'scrape', urls: ['https://example.com/'] }] };
    await service.estimate(user, ws, { spec, agents: { collect: ids.researcher, analyze: ids.analyst, index: ids.strategist } });
    const [, args] = mcp.call.mock.calls.find(([tool]: [string]) => tool === 'intel_job_estimate');
    expect(args.spec.stages.index).toEqual({ agent_key: 'strategist', enabled: true });

    expect(await errorCode(service.estimate(user, ws, { spec, agents: { collect: ids.researcher, analyze: ids.analyst, index: ids.ghost } }))).toBe('UNKNOWN_AGENT');
  });
});

describe('IntelService.projection (M3_TASK_011)', () => {
  function withJob(stages: string[], mcpJobId: string | null = 'j_mcp1') {
    const h = harness();
    const job = { id: 'j1', workspace_id: ws, mcp_job_id: mcpJobId, status: 'completed', stages: stages.map((stage) => ({ stage })), insight: null };
    Object.assign(h.prisma, { intel_jobs: { findFirst: jest.fn().mockResolvedValue(job) } });
    return h;
  }
  const point = { id: 'd1', x: 0.1, y: -0.2, z: 0, source: 'web', sentiment: 'neutral', label: 'Example Domain' };

  it('job dengan tahap index → proxy intel_kb_projection (akses viewer cukup)', async () => {
    const h = withJob(['collect', 'analyze', 'index']);
    h.mcp.call.mockResolvedValue({ points: [point], method: 'pca', generated_at: '2026-11-05T04:00:00Z' });
    const res = await h.service.projection(user, 'j1');
    expect(h.access.assertWorkspace).toHaveBeenCalledWith(expect.anything(), ws);
    expect(h.mcp.call).toHaveBeenCalledWith('intel_kb_projection', { workspace_id: ws, mcp_job_id: 'j_mcp1', limit: 2000 }, expect.anything(), undefined);
    expect(res.points).toEqual([point]);
  });

  it('tanpa tahap index / belum terhubung MCP → titik kosong tanpa memanggil MCP', async () => {
    for (const h of [withJob(['collect', 'analyze']), withJob(['collect', 'analyze', 'index'], null)]) {
      const res = await h.service.projection(user, 'j1');
      expect(res).toEqual({ points: [], method: 'pca', generated_at: null });
      expect(h.mcp.call).not.toHaveBeenCalled();
    }
  });
});

describe('IntelService.remove (purge Knowledge Base)', () => {
  function removable(stages: string[], purge: () => Promise<unknown>) {
    const h = harness();
    const job = { id: 'j1', workspace_id: ws, mcp_job_id: 'j_mcp1', status: 'completed', created_by: '77777777-7777-4777-8777-777777777777', stages: stages.map((stage) => ({ stage })), insight: null };
    Object.assign(h.prisma, {
      intel_jobs: { findFirst: jest.fn().mockResolvedValue(job), update: jest.fn().mockResolvedValue(job) },
      agent_missions: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });
    h.mcp.call.mockImplementation((tool: string) => (tool === 'intel_job_purge_index' ? purge() : Promise.resolve({})));
    return h;
  }

  it('misi job yang belum menulis rencana ikut dibatalkan (M3_TASK_013)', async () => {
    const h = removable(['collect', 'analyze'], () => Promise.resolve({}));
    await h.service.remove(user, 'j1');
    const missions = (h.prisma as unknown as { agent_missions: { updateMany: jest.Mock } }).agent_missions;
    expect(missions.updateMany).toHaveBeenCalledWith({
      where: { intel_job_id: 'j1', status: { in: ['waiting_research', 'planning', 'awaiting_review'] } },
      data: { status: 'cancelled' },
    });
  });

  it('job dengan tahap index → panggil intel_job_purge_index lalu soft delete', async () => {
    const h = removable(['collect', 'analyze', 'index'], () => Promise.resolve({ deleted_documents: 6, deleted_chunks: 7 }));
    await h.service.remove(user, 'j1');
    expect(h.mcp.call).toHaveBeenCalledWith('intel_job_purge_index', { workspace_id: ws, mcp_job_id: 'j_mcp1' }, expect.anything(), undefined);
    expect((h.prisma as unknown as { intel_jobs: { update: jest.Mock } }).intel_jobs.update).toHaveBeenCalledWith(expect.objectContaining({ data: { deleted_at: expect.any(Date) } }));
  });

  it('purge gagal tidak menghalangi penghapusan; tanpa tahap index tidak memanggil purge', async () => {
    const failing = removable(['collect', 'analyze', 'index'], () => Promise.reject(new Error('MCP mati')));
    await expect(failing.service.remove(user, 'j1')).resolves.toBeUndefined();
    const plain = removable(['collect', 'analyze'], () => Promise.resolve({}));
    await plain.service.remove(user, 'j1');
    expect(plain.mcp.call).not.toHaveBeenCalledWith('intel_job_purge_index', expect.anything(), expect.anything(), undefined);
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
