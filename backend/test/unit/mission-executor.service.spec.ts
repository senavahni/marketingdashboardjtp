import { MissionExecutorService } from '../../src/modules/intel/mission-executor.service';
import { missionPlanSchema } from '../../src/shared/schemas/mission.schema';

// M3_TASK_014 Fase B: penjadwal eksekusi misi → assign task ke agent (run Modul 2)

const ws = '44444444-4444-4444-8444-444444444444';
const planner = { id: 'a-strategist', name: 'Agent_Strategist', mcp_agent_key: 'strategist' };
const researcher = { id: 'a-researcher' };
const owner = { id: 'u1', display_name: 'Owner Demo' };

const PLAN = missionPlanSchema.parse({
  tasks: [
    { ref: 't1', title: 'Riset kompetitor', start_date: '2026-11-01', end_date: '2026-11-02', executor: 'agent', agent_key: 'researcher' },
    { ref: 't2', title: 'Kalender konten', start_date: '2026-11-03', end_date: '2026-11-04', executor: 'agent', agent_key: 'strategist', depends_on: ['t1'] },
    { ref: 't3', title: 'Approval manajer', start_date: '2026-11-01', end_date: '2026-11-01' },
  ],
});

type Row = {
  id: string;
  parent_task_id: string;
  title: string;
  status: string;
  assignee_type: string | null;
  agent_status: string;
  start_date: Date;
  end_date: Date;
  tags: string[];
};
// end_date jauh di depan agar tidak memicu penjadwalan ulang di tes yang tidak membahasnya
const row = (id: string, title: string, tags: string[], over: Partial<Row> = {}): Row => ({
  id,
  parent_task_id: 'root',
  title,
  status: 'todo',
  assignee_type: null,
  agent_status: 'idle',
  start_date: new Date('2026-11-01T00:00:00Z'),
  end_date: new Date('2099-12-31T00:00:00Z'),
  tags,
  ...over,
});

function harness(rows: Row[], mission: Record<string, unknown> = {}, activeRuns = 0) {
  const m = {
    id: 'm1',
    workspace_id: ws,
    project_id: 'p1',
    root_task_id: 'root',
    title: 'Kampanye',
    instruction: 'Siapkan kampanye Harbolnas',
    start_date: new Date('2026-11-01T00:00:00Z'),
    end_date: new Date('2026-11-30T00:00:00Z'),
    status: 'scheduled',
    execution_enabled: true,
    max_runs: 10,
    runs_dispatched: 0,
    budget_usd: null as number | null,
    runs_cost_usd: 0,
    last_reschedule_on: null as Date | null,
    approval_mode: 'auto',
    plan: PLAN,
    task_map: { t1: 'k1', t2: 'k2', t3: 'k3' },
    created_by: owner.id,
    agent: planner,
    workspace: { timezone: 'Asia/Jakarta' },
    ...mission,
  };
  let dispatched = m.runs_dispatched as number;
  const prisma = {
    agent_missions: {
      findMany: jest.fn().mockResolvedValue([{ id: 'm1' }]),
      findFirst: jest.fn().mockResolvedValue(m),
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        if (data.runs_dispatched) {
          if (dispatched >= (m.max_runs as number)) return Promise.resolve({ count: 0 });
          dispatched += 1;
        }
        return Promise.resolve({ count: 1 });
      }),
    },
    tasks: {
      findMany: jest.fn(({ where }: { where: { parent_task_id: unknown } }) => Promise.resolve(where.parent_task_id === 'root' ? rows : [])),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(rows.find((r) => r.id === where.id))),
      findFirst: jest.fn().mockResolvedValue({ id: 'root', status: 'todo', title: 'Misi: Kampanye', project_id: 'p1' }),
      update: jest.fn().mockResolvedValue(undefined),
    },
    agent_runs: { count: jest.fn().mockResolvedValue(activeRuns), findMany: jest.fn().mockResolvedValue([]) },
    agents: { findFirst: jest.fn(({ where }: { where: { mcp_agent_key: string } }) => Promise.resolve(where.mcp_agent_key === 'researcher' ? researcher : null)) },
    users: { findUnique: jest.fn().mockResolvedValue(owner) },
  };
  const tasks = { updateAs: jest.fn().mockResolvedValue(undefined) };
  const blocks = { applyAs: jest.fn().mockResolvedValue(undefined) };
  const runs = { cancelActive: jest.fn() };
  const mcp = { call: jest.fn().mockResolvedValue({ runs: [], total_usd: 0 }) };
  const comments = { createAs: jest.fn().mockResolvedValue(undefined) };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  Object.assign(prisma, { tx: jest.fn((cb: (t: unknown) => Promise<unknown>) => cb({})) });
  const service = new MissionExecutorService(
    prisma as never,
    tasks as never,
    blocks as never,
    runs as never,
    mcp as never,
    comments as never,
    notifications as never,
  );
  return { service, prisma, tasks, blocks, mcp, comments, notifications };
}

describe('MissionExecutorService.tickMission', () => {
  const rows = () => [row('k1', 'Riset kompetitor', ['misi', 'eksekutor:agent']), row('k2', 'Kalender konten', ['misi', 'eksekutor:agent']), row('k3', 'Approval manajer', ['misi', 'eksekutor:human'])];

  it('assign task agent yang siap ke agent dari rencana (atas nama pembuat misi) + konteks misi; dependensi menunggu', async () => {
    const h = harness(rows());
    expect(await h.service.tickMission('m1')).toBe(1);
    expect(h.tasks.updateAs).toHaveBeenCalledTimes(1);
    const [actor, task, wsId, input] = h.tasks.updateAs.mock.calls[0];
    expect(actor).toEqual({ type: 'user', id: owner.id, name: owner.display_name });
    expect(task.id).toBe('k1');
    expect(wsId).toBe(ws);
    expect(input).toEqual({ assignee: { type: 'agent', id: researcher.id } });
    const texts = h.blocks.applyAs.mock.calls[0][2].map((op: { block: { content_json: { content: { text: string }[] } } }) => op.block.content_json.content[0].text);
    expect(texts[0]).toContain('Siapkan kampanye Harbolnas');
    expect(h.prisma.agent_missions.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'running' } });
  });

  it('dependensi selesai → task berikutnya memakai agent planner bila agent rencana = planner', async () => {
    const r = rows().map((x) => (x.id === 'k1' ? { ...x, status: 'done' } : x));
    const h = harness(r);
    expect(await h.service.tickMission('m1')).toBe(1);
    expect(h.tasks.updateAs.mock.calls[0][3]).toEqual({ assignee: { type: 'agent', id: planner.id } });
    expect(h.blocks.applyAs.mock.calls[0][2].map((op: { block: { content_json: { content: { text: string }[] } } }) => op.block.content_json.content[0].text)).toContainEqual(
      'Task sebelumnya yang sudah selesai: Riset kompetitor.',
    );
  });

  it('kuota run habis / slot penuh → tidak ada run baru', async () => {
    expect(await harness(rows(), { runs_dispatched: 10 }).service.tickMission('m1')).toBe(0);
    const busy = harness(rows(), {}, 2);
    expect(await busy.service.tickMission('m1')).toBe(0);
    expect(busy.tasks.updateAs).not.toHaveBeenCalled();
  });

  it('semua task rencana selesai → misi completed & task induk done', async () => {
    const h = harness(rows().map((x) => ({ ...x, status: 'done' })));
    await h.service.tickMission('m1');
    expect(h.prisma.agent_missions.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }));
    expect(h.tasks.updateAs).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent', id: planner.id }), expect.anything(), ws, { status: 'done' }, null);
  });

  it('task induk/project dihapus → misi dibatalkan tanpa dispatch', async () => {
    const h = harness(rows());
    h.prisma.tasks.findFirst.mockResolvedValue(null);
    expect(await h.service.tickMission('m1')).toBe(0);
    expect(h.prisma.agent_missions.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: expect.objectContaining({ status: 'cancelled' }) });
    expect(h.tasks.updateAs).not.toHaveBeenCalled();
  });

  it('biaya run melewati budget USD → misi dijeda + notifikasi, tanpa run baru', async () => {
    const h = harness(rows(), { budget_usd: 0.5 });
    h.prisma.agent_runs.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    h.mcp.call.mockResolvedValue({ runs: [], total_usd: 0.62 });
    expect(await h.service.tickMission('m1')).toBe(0);
    expect(h.mcp.call).toHaveBeenCalledWith('intel_run_costs', { workspace_id: ws, run_ids: ['r1', 'r2'] }, expect.anything());
    expect(h.prisma.agent_missions.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { runs_cost_usd: 0.62 } });
    expect(h.prisma.agent_missions.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: expect.objectContaining({ status: 'paused', error: expect.objectContaining({ code: 'BUDGET_REACHED' }) }) });
    expect(h.notifications.notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'mission_budget_reached', recipients: [owner.id] }), expect.anything());
    expect(h.tasks.updateAs).not.toHaveBeenCalled();
  });

  it('run gagal sekali → task dilepas & dikerjakan ulang; gagal 2× → dibiarkan untuk manusia', async () => {
    const failedRow = () => row('k1', 'Riset kompetitor', ['misi', 'eksekutor:agent'], { agent_status: 'failed', assignee_type: 'agent' });
    const once = harness([failedRow()]);
    once.prisma.agent_runs.count.mockImplementation(({ where }: { where: { status: unknown } }) => Promise.resolve(where.status === 'failed' ? 1 : 0));
    await once.service.tickMission('m1');
    expect(once.tasks.updateAs.mock.calls[0][3]).toEqual({ assignee: null });
    expect(once.prisma.tasks.update).toHaveBeenCalledWith({ where: { id: 'k1' }, data: { agent_status: 'idle' } });

    const twice = harness([failedRow()]);
    twice.prisma.agent_runs.count.mockImplementation(({ where }: { where: { status: unknown } }) => Promise.resolve(where.status === 'failed' ? 2 : 0));
    await twice.service.tickMission('m1');
    expect(twice.tasks.updateAs).not.toHaveBeenCalled();
  });

  it('task terlambat: mode auto → jadwal digeser + komentar; mode review → hanya usulan; sekali per hari', async () => {
    const late = () => [row('k3', 'Approval manajer', ['misi', 'eksekutor:human'], { start_date: new Date('2026-01-01T00:00:00Z'), end_date: new Date('2026-01-02T00:00:00Z') })];
    const auto = harness(late());
    await auto.service.tickMission('m1');
    const [, , , input] = auto.tasks.updateAs.mock.calls.find(([, , , i]) => 'start_date' in i)!;
    expect(input.end_date > input.start_date).toBe(true); // durasi 2 hari dipertahankan
    expect(auto.comments.createAs).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ content: expect.stringContaining('Jadwal disesuaikan otomatis') }), null);

    const review = harness(late(), { approval_mode: 'review' });
    await review.service.tickMission('m1');
    expect(review.tasks.updateAs.mock.calls.some(([, , , i]) => 'start_date' in i)).toBe(false);
    expect(review.comments.createAs).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ content: expect.stringContaining('Usulan penjadwalan ulang') }), null);

    const done = harness(late(), { last_reschedule_on: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) });
    await done.service.tickMission('m1');
    expect(done.comments.createAs).not.toHaveBeenCalled();
  });

  it('progress menghitung task rencana & task agent', async () => {
    const r = rows().map((x) => (x.id === 'k1' ? { ...x, status: 'done' } : x.id === 'k2' ? { ...x, agent_status: 'working' } : x));
    expect(await harness(r).service.progress('root')).toEqual({ total: 3, done: 1, agent_total: 2, agent_done: 1, agent_running: 1, agent_failed: 0 });
  });
});
