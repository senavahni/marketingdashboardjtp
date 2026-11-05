import { AppException } from '../../src/common/exceptions/app.exception';
import { pickPlanner, planItemDescription, stageTaskStatus } from '../../src/modules/intel/mission.rules';
import { MissionService } from '../../src/modules/intel/mission.service';
import { MissionPlan, missionPlanSchema, planViolation } from '../../src/shared/schemas/mission.schema';

// M3_TASK_013: job riset → task induk + subtask tahap → rencana tindak lanjut (auto/review)

const ws = '44444444-4444-4444-8444-444444444444';
const project = '33333333-3333-4333-8333-333333333333';
const jobId = '55555555-5555-4555-8555-555555555555';
const missionId = '99999999-9999-4999-8999-999999999999';
const user = { id: '77777777-7777-4777-8777-777777777777', username: 'member', display_name: 'Member Demo' };
const planner = { id: '00000000-0000-4000-8000-000000000201', name: 'Agent_Strategist', mcp_agent_key: 'strategist' };

const PLAN: MissionPlan = missionPlanSchema.parse({
  summary: 'Tindak lanjut',
  tasks: [
    {
      ref: 't1',
      title: 'Konten edukasi harga',
      description: 'Buat 3 draf post',
      start_date: '2026-11-10',
      end_date: '2026-11-14',
      executor: 'agent',
      agent_key: 'strategist',
      subtasks: [{ ref: 't1.1', title: 'Draf post 1', start_date: '2026-11-10', end_date: '2026-11-11' }],
    },
    { ref: 't2', title: 'Review & publikasi', start_date: '2026-11-15', end_date: '2026-11-16', depends_on: ['t1'] },
  ],
});

type MissionRow = ReturnType<typeof baseMission> & { materialized_revision: number | null; plan_revision: number; cost_usd: number; status: string };
type CreateParams = { parent: { depth: number } | null; title: string };

function mission(over: Record<string, unknown> = {}): MissionRow {
  return { ...baseMission(), ...over } as MissionRow;
}

function baseMission() {
  return {
    id: missionId,
    workspace_id: ws,
    project_id: project,
    agent_id: planner.id,
    agent: planner,
    source: 'intel_job',
    intel_job_id: jobId,
    title: 'Riset kopi',
    instruction: 'Susun task tindak lanjut',
    start_date: new Date('2026-11-10T00:00:00Z'),
    end_date: new Date('2026-11-30T00:00:00Z'),
    approval_mode: 'auto',
    status: 'waiting_research',
    plan: null as unknown,
    plan_revision: 0,
    materialized_revision: null as number | null,
    feedback: null,
    error: null as unknown,
    root_task_id: 'root-1',
    cost_usd: 0,
    execution_enabled: true,
    max_runs: 10,
    runs_dispatched: 0,
    task_map: null as unknown,
    completed_at: null,
    created_by: user.id,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function harness(state: Record<string, unknown> = {}) {
  let current = mission(state);
  let seq = 0;
  const tx = {
    projects: { findFirst: jest.fn().mockResolvedValue({ id: project }), create: jest.fn(({ data }: { data: object }) => Promise.resolve({ id: 'ai-project', ...data })) },
    agents: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: planner.id, name: planner.name }) },
    agent_missions: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'm-new', ...data })),
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn(() => {
        if (current.materialized_revision !== null && current.materialized_revision >= current.plan_revision) return Promise.resolve({ count: 0 });
        current = { ...current, materialized_revision: current.plan_revision, status: 'scheduled' };
        return Promise.resolve({ count: 1 });
      }),
    },
    tasks: { findFirst: jest.fn().mockResolvedValue({ id: 'root-1', depth: 1, project_id: project }) },
  };
  const prisma = {
    tx: jest.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    agent_missions: {
      findFirst: jest.fn(() => Promise.resolve(current)),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(current)),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const inc = (data.cost_usd as { increment?: number } | undefined)?.increment;
        current = { ...current, ...data, ...(inc !== undefined ? { cost_usd: current.cost_usd + inc } : {}) };
        return Promise.resolve(current);
      }),
    },
    intel_insights: { findUnique: jest.fn().mockResolvedValue({ summary_md: '## Ringkasan', recommendations: ['Promo bundling'] }) },
    tasks: {
      findMany: jest.fn().mockResolvedValue([{ title: 'Brief', start_date: null, end_date: null }]),
      findFirst: jest.fn().mockResolvedValue({ id: 'stage-1', status: 'todo', project_id: project, title: 'Kumpulkan data', assignee_agent: { id: 'a1', name: 'Agent_Researcher' } }),
    },
    agents: { findMany: jest.fn().mockResolvedValue([{ mcp_agent_key: 'strategist' }, { mcp_agent_key: 'researcher' }]) },
  };
  const tasks = {
    createInTx: jest.fn((_tx: unknown, p: { parent: { depth: number } | null }) =>
      Promise.resolve({ id: `task-${++seq}`, project_id: project, depth: (p.parent?.depth ?? 0) + 1, title: 'x' }),
    ),
    updateAs: jest.fn().mockResolvedValue(undefined),
  };
  const deps = {
    access: { assertWorkspace: jest.fn().mockResolvedValue({ role: 'member' }) },
    reader: { getDto: jest.fn().mockResolvedValue({}) },
    blocks: { applyAs: jest.fn().mockResolvedValue(undefined) },
    comments: { createAs: jest.fn().mockResolvedValue(undefined) },
    notifications: { notify: jest.fn().mockResolvedValue(undefined) },
    realtime: { toProject: jest.fn() },
    mcp: { call: jest.fn().mockResolvedValue({ plan: PLAN, cost: { llm_tokens: 1200, usd: 0.012 } }) },
    activity: { log: jest.fn().mockResolvedValue(undefined) },
    executor: { tickMission: jest.fn().mockResolvedValue(0), progress: jest.fn().mockResolvedValue(null), cancelRuns: jest.fn().mockResolvedValue(undefined) },
  };
  const service = new MissionService(
    prisma as never,
    deps.access as never,
    tasks as never,
    deps.reader as never,
    deps.blocks as never,
    deps.comments as never,
    deps.notifications as never,
    deps.realtime as never,
    deps.mcp as never,
    deps.activity as never,
    deps.executor as never,
  );
  return { service, prisma, tx, tasks, ...deps, state: () => current };
}

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error instanceof AppException ? error.message : (error as Error).message;
  }
  return undefined;
}

describe('MissionService.createForIntelJobInTx', () => {
  const params = {
    workspaceId: ws,
    job: { id: jobId, title: 'Riset kopi' },
    schedule: {
      project_id: project,
      period: { start_date: '2026-11-10', end_date: '2026-11-30' },
      approval_mode: 'auto' as const,
      execution_enabled: false,
      max_runs: 3,
    },
    plannerAgentId: planner.id,
    stages: [
      { stage: 'collect' as const, agent: { id: 'a1', name: 'Agent_Researcher' } },
      { stage: 'analyze' as const, agent: { id: 'a2', name: 'Agent_Analyst' } },
    ],
    user,
    timezone: 'Asia/Jakarta',
  };

  it('membuat task induk + subtask tahap (assignee agent tanpa dispatch) + misi waiting_research', async () => {
    const h = harness();
    const effects = { add: jest.fn() };
    await h.service.createForIntelJobInTx(h.tx as never, params, effects as never);
    const calls = h.tasks.createInTx.mock.calls.map(([, p]) => p);
    expect(calls[0]).toMatchObject({ parent: null, title: 'Riset: Riset kopi', endDate: '2026-11-30', tags: ['misi', 'riset'], assignee: null });
    expect(calls.slice(1)).toEqual([
      expect.objectContaining({ title: 'Kumpulkan data', assignee: { type: 'agent', id: 'a1', name: 'Agent_Researcher' }, triggerAssignmentEffects: false, tags: ['misi', 'tahap:collect'] }),
      expect.objectContaining({ title: 'Analisis sentimen & tren', tags: ['misi', 'tahap:analyze'] }),
    ]);
    expect(h.tx.agent_missions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        intel_job_id: jobId,
        status: 'waiting_research',
        root_task_id: 'task-1',
        agent_id: planner.id,
        approval_mode: 'auto',
        execution_enabled: false,
        max_runs: 3,
      }),
    });
    expect(effects.add).toHaveBeenCalled(); // realtime TASK_CREATED setelah commit
  });

  it('tanpa project_id → project baru milik AI (dibuat agent planner) untuk job ini', async () => {
    const h = harness();
    const { project_id: _omit, ...schedule } = params.schedule;
    await h.service.createForIntelJobInTx(h.tx as never, { ...params, schedule }, { add: jest.fn() } as never);
    expect(h.tx.projects.findFirst).not.toHaveBeenCalled();
    expect(h.tx.projects.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ workspace_id: ws, title: 'Riset: Riset kopi', icon: '🤖', created_by: null }),
    });
    expect(h.activity.log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'project.created', actor: { type: 'agent', id: planner.id, name: planner.name } }), expect.anything());
    expect(h.tasks.createInTx.mock.calls[0][1]).toMatchObject({ projectId: 'ai-project', parent: null });
    expect(h.tx.agent_missions.create).toHaveBeenCalledWith({ data: expect.objectContaining({ project_id: 'ai-project' }) });
  });

  it('Ulangi job: misi yang belum menulis rencana dipindah ke job baru, subtask tahap direset ke todo', async () => {
    const h = harness({ status: 'failed' });
    const stageTasks = [
      { id: 's1', status: 'in_progress', tags: ['misi', 'tahap:collect'] },
      { id: 's2', status: 'done', tags: ['misi', 'tahap:analyze'] },
    ];
    Object.assign(h.tx, {
      agent_missions: { ...h.tx.agent_missions, findFirst: jest.fn().mockResolvedValue({ id: missionId, root_task_id: 'root-1', project_id: project }) },
      tasks: {
        ...h.tx.tasks,
        findMany: jest.fn().mockResolvedValue(stageTasks),
        update: jest.fn().mockResolvedValue(undefined),
        findFirst: jest.fn().mockResolvedValue({ id: 'root-1', depth: 1, project_id: project }),
      },
    });
    const moved = await h.service.reattachInTx(
      h.tx as never,
      { oldJobId: jobId, newJobId: 'new-job', workspaceId: ws, user, timezone: 'Asia/Jakarta', stages: [...params.stages, { stage: 'index' as const, agent: { id: 'a3', name: 'Agent_Strategist' } }] },
      { add: jest.fn() } as never,
    );
    expect(moved).toBe(true);
    expect(h.tx.agent_missions.update).toHaveBeenCalledWith({
      where: { id: missionId },
      data: expect.objectContaining({ intel_job_id: 'new-job', status: 'waiting_research', planning_started_at: null }),
    });
    const tx = h.tx as unknown as { tasks: { update: jest.Mock } };
    expect(tx.tasks.update.mock.calls.map(([a]) => [a.where.id, a.data.status])).toEqual([['s1', 'todo'], ['s2', 'todo']]);
    // tahap baru (index) yang belum punya subtask dibuat
    expect(h.tasks.createInTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Indeks ke Knowledge Base', tags: ['misi', 'tahap:index'] }), expect.anything());
  });

  it('project di luar workspace ditolak', async () => {
    const h = harness();
    h.tx.projects.findFirst.mockResolvedValue(null);
    expect(await code(h.service.createForIntelJobInTx(h.tx as never, params, { add: jest.fn() } as never))).toMatch(/Project penjadwalan/);
    expect(h.tasks.createInTx).not.toHaveBeenCalled();
  });
});

describe('MissionService misi manual (M3_TASK_014 Fase A)', () => {
  const input = {
    title: 'Kampanye Harbolnas',
    instruction: 'Siapkan kampanye Harbolnas di Instagram & X',
    expected_outcome: 'Kalender konten 2 minggu',
    period: { start_date: '2026-11-10', end_date: '2026-11-30' },
    approval_mode: 'review' as const,
    execution_enabled: true,
    max_runs: 5,
  };

  it('tanpa project → project AI + task induk "Misi: …" + misi planning (instruksi memuat hasil yang diharapkan)', async () => {
    const h = harness();
    const effects = { add: jest.fn() };
    const id = await h.service.createManualInTx(h.tx as never, { workspaceId: ws, user, plannerAgentId: planner.id, input }, effects as never);
    expect(h.tx.projects.create).toHaveBeenCalledWith({ data: expect.objectContaining({ title: 'Misi: Kampanye Harbolnas', icon: '🤖', created_by: null }) });
    expect(h.tasks.createInTx.mock.calls[0][1]).toMatchObject({
      projectId: 'ai-project',
      parent: null,
      title: 'Misi: Kampanye Harbolnas',
      startDate: '2026-11-10',
      endDate: '2026-11-30',
      tags: ['misi'],
    });
    const data = h.tx.agent_missions.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ source: 'manual', status: 'planning', approval_mode: 'review', project_id: 'ai-project', root_task_id: 'task-1' });
    expect(data).not.toHaveProperty('intel_job_id');
    expect(data.instruction).toBe('Siapkan kampanye Harbolnas di Instagram & X\n\nHasil yang diharapkan: Kalender konten 2 minggu');
    expect(typeof id).toBe('string');
  });

  it('daftar misi workspace (viewer) terbaru dulu', async () => {
    const h = harness();
    Object.assign(h.prisma.agent_missions, { findMany: jest.fn().mockResolvedValue([mission({ source: 'manual', intel_job_id: null })]) });
    const out = await h.service.list(user, ws, { limit: 50 });
    expect(h.access.assertWorkspace).toHaveBeenCalledWith(user.id, ws);
    expect((h.prisma.agent_missions as unknown as { findMany: jest.Mock }).findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspace_id: ws, deleted_at: null }, orderBy: { created_at: 'desc' }, take: 50 }),
    );
    expect(out.data[0]).toMatchObject({ id: missionId, source: 'manual', instruction: 'Susun task tindak lanjut' });
  });
});

describe('MissionService.onStageEvent', () => {
  it('started → in_progress oleh agent tahap; failed → komentar alasan', async () => {
    const h = harness();
    await h.service.onStageEvent(jobId, 'collect', 'started');
    expect(h.prisma.tasks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ parent_task_id: 'root-1', tags: { has: 'tahap:collect' } }) }));
    expect(h.tasks.updateAs).toHaveBeenCalledWith({ type: 'agent', id: 'a1', name: 'Agent_Researcher' }, expect.anything(), ws, { status: 'in_progress' }, null);

    await h.service.onStageEvent(jobId, 'collect', 'failed', 'Sumber X tidak tersedia');
    expect(h.comments.createAs).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ content: 'Tahap gagal: Sumber X tidak tersedia' }), null);
  });
});

describe('MissionService planning & materialisasi', () => {
  it('mode auto: rencana MCP langsung ditulis di bawah task induk, tepat sekali', async () => {
    const h = harness();
    await h.service.onJobTerminal(jobId, 'completed');
    const [tool, args, , , timeout] = h.mcp.call.mock.calls[0];
    expect(tool).toBe('intel_mission_plan');
    expect(timeout).toBeGreaterThan(60_000);
    expect(args).toMatchObject({
      mission_id: missionId,
      agent_key: 'strategist',
      period: { start_date: '2026-11-10', end_date: '2026-11-30' },
      context: { insight_md: '## Ringkasan', recommendations: ['Promo bundling'], existing_tasks: [{ title: 'Brief', start_date: null, end_date: null }] },
      available_agents: ['strategist', 'researcher'],
    });
    const created = h.tasks.createInTx.mock.calls.map(([, p]) => p as CreateParams);
    expect(created.map((p) => [p.title, p.parent?.depth])).toEqual([
      ['Konten edukasi harga', 1],
      ['Draf post 1', 2],
      ['Review & publikasi', 1],
    ]);
    expect(created[0]).toMatchObject({ actor: { type: 'agent', id: planner.id }, tags: ['misi', 'eksekutor:agent'], assignee: null });
    expect(h.state()).toMatchObject({ status: 'scheduled', plan_revision: 1, materialized_revision: 1, cost_usd: 0.012 });
    // task_map (ref → id) disimpan untuk dependensi penjadwal & eksekusi langsung dipicu (Fase B)
    expect(h.tx.agent_missions.update).toHaveBeenCalledWith({ where: { id: missionId }, data: { task_map: { t1: 'task-1', 't1.1': 'task-2', t2: 'task-3' } } });
    expect(h.executor.tickMission).toHaveBeenCalledWith(missionId);
    // deskripsi + dependensi ditulis sebagai blok paragraf
    const texts = h.blocks.applyAs.mock.calls.map(([, , ops]) => ops.map((o: { block: { content_json: { content: { text: string }[] } } }) => o.block.content_json.content[0].text));
    expect(texts).toContainEqual(['Buat 3 draf post']);
    expect(texts).toContainEqual(['Bergantung pada: Konten edukasi harga']);

    h.tasks.createInTx.mockClear();
    await h.service.materialize(missionId, 1); // event/klik ganda
    expect(h.tasks.createInTx).not.toHaveBeenCalled();
  });

  it('mode review: menunggu tinjauan + notifikasi, belum ada task; approve lalu menulis', async () => {
    const h = harness({ approval_mode: 'review' });
    await h.service.startPlanning(missionId);
    expect(h.state().status).toBe('awaiting_review');
    expect(h.tasks.createInTx).not.toHaveBeenCalled();
    expect(h.notifications.notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'mission_plan_ready', recipients: [user.id] }), expect.anything());

    await h.service.approve(user, missionId);
    expect(h.tasks.createInTx).toHaveBeenCalledTimes(3);
    expect(h.state().status).toBe('scheduled');
  });

  it('MCP gagal → misi failed dengan kode error, tanpa task', async () => {
    const h = harness();
    h.mcp.call.mockRejectedValue(Object.assign(new Error('Output LLM bukan JSON valid'), { code: 'UPSTREAM_ERROR' }));
    await h.service.startPlanning(missionId);
    expect(h.state()).toMatchObject({ status: 'failed', error: { code: 'UPSTREAM_ERROR' } });
    expect(h.tasks.createInTx).not.toHaveBeenCalled();
  });

  it('rencana di luar timeline ditolak saat materialisasi (PLAN_INVALID)', async () => {
    const bad = { ...PLAN, tasks: [{ ...PLAN.tasks[1], start_date: '2026-12-01', end_date: '2026-12-02', depends_on: [] }] };
    const h = harness({ status: 'awaiting_review', plan: bad, plan_revision: 1 });
    await h.service.approve(user, missionId);
    expect(h.state()).toMatchObject({ status: 'failed', error: { code: 'PLAN_INVALID' } });
    expect(h.tasks.createInTx).not.toHaveBeenCalled();
  });

  it('retry: misi gagal dengan job riset selesai → planning ulang; job belum selesai ditolak', async () => {
    const h = harness({ status: 'failed', error: { code: 'LLM_QUOTA_EXCEEDED', message: 'Kuota habis' } });
    Object.assign(h.prisma, { intel_jobs: { findFirst: jest.fn().mockResolvedValue({ status: 'completed' }) } });
    await h.service.retry(user, missionId);
    await new Promise((r) => setImmediate(r));
    expect(h.mcp.call).toHaveBeenCalledWith('intel_mission_plan', expect.anything(), expect.anything(), undefined, expect.any(Number));

    const early = harness({ status: 'failed' });
    const noRetry = ({ where }: { where: Record<string, unknown> }) => Promise.resolve(where.retry_of_job_id ? null : { status: 'failed' });
    Object.assign(early.prisma, { intel_jobs: { findFirst: jest.fn(noRetry) } });
    expect(await code(early.service.retry(user, missionId))).toMatch(/belum selesai/);
  });

  it('retry: job misi gagal tetapi hasil Ulangi-nya selesai → misi pindah ke job ulangan lalu planning', async () => {
    const retryJob = '66666666-6666-4666-8666-666666666666';
    const h = harness({ status: 'failed', error: { code: 'RESEARCH_FAILED', message: 'Job riset tidak selesai' } });
    Object.assign(h.prisma, {
      intel_jobs: {
        findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(where.retry_of_job_id ? { id: retryJob, stages: [{ stage: 'collect', status: 'completed' }, { stage: 'analyze', status: 'skipped' }] } : { status: 'failed' }),
        ),
      },
    });
    await h.service.retry(user, missionId);
    await new Promise((r) => setImmediate(r));
    expect(h.state().intel_job_id).toBe(retryJob);
    expect(h.tasks.updateAs.mock.calls.map(([, , , input]) => input)).toEqual([{ status: 'done' }, { status: 'done' }]);
    expect(h.mcp.call).toHaveBeenCalledWith('intel_mission_plan', expect.anything(), expect.anything(), undefined, expect.any(Number));
  });

  it('revisi dibatasi & aksi hanya pada status yang sesuai', async () => {
    expect(await code(harness({ status: 'scheduled' }).service.approve(user, missionId))).toMatch(/tidak tersedia/);
    expect(await code(harness({ status: 'awaiting_review', plan_revision: 4 }).service.revise(user, missionId, 'lebih singkat'))).toMatch(/Revisi maksimal/);
  });
});

describe('aturan misi', () => {
  it('status subtask tahap & deskripsi dependensi', () => {
    expect(stageTaskStatus('started')).toBe('in_progress');
    expect(stageTaskStatus('skipped')).toBe('done');
    expect(stageTaskStatus('cancelled')).toBeNull();
    expect(planItemDescription({ description: 'a\n\n b ', depends_on: ['t1', 'zz'] }, new Map([['t1', 'Riset']]))).toEqual(['a', 'b', 'Bergantung pada: Riset, zz']);
  });

  it('pickPlanner: diminta (bila mampu) → strategist → mampu pertama', () => {
    const agents = [
      { id: 'a', mcp_agent_key: 'analyst' },
      { id: 's', mcp_agent_key: 'strategist' },
      { id: 'x', mcp_agent_key: 'writer' },
    ];
    expect(pickPlanner(agents, new Set(['strategist', 'writer']))?.id).toBe('s');
    expect(pickPlanner(agents, new Set(['writer']))?.id).toBe('x');
    expect(pickPlanner(agents, new Set(['writer']), 'a')).toBeNull();
    expect(pickPlanner(agents, new Set())).toBeNull();
  });

  it('planViolation memeriksa batas tanggal & ref', () => {
    expect(planViolation(PLAN, '2026-11-10', '2026-11-30')).toBeNull();
    expect(planViolation(PLAN, '2026-11-11', '2026-11-30')).toMatch(/di luar timeline/);
    const dup = { ...PLAN, tasks: [PLAN.tasks[0], { ...PLAN.tasks[1], ref: 't1' }] };
    expect(planViolation(dup, '2026-11-10', '2026-11-30')).toMatch(/ganda/);
  });
});
