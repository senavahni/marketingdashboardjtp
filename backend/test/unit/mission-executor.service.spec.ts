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

type Row = { id: string; parent_task_id: string; title: string; status: string; assignee_type: string | null; agent_status: string; start_date: Date; tags: string[] };
const row = (id: string, title: string, tags: string[], over: Partial<Row> = {}): Row => ({
  id,
  parent_task_id: 'root',
  title,
  status: 'todo',
  assignee_type: null,
  agent_status: 'idle',
  start_date: new Date('2026-11-01T00:00:00Z'),
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
      findFirst: jest.fn().mockResolvedValue({ id: 'root', status: 'todo' }),
    },
    agent_runs: { count: jest.fn().mockResolvedValue(activeRuns) },
    agents: { findFirst: jest.fn(({ where }: { where: { mcp_agent_key: string } }) => Promise.resolve(where.mcp_agent_key === 'researcher' ? researcher : null)) },
    users: { findUnique: jest.fn().mockResolvedValue(owner) },
  };
  const tasks = { updateAs: jest.fn().mockResolvedValue(undefined) };
  const blocks = { applyAs: jest.fn().mockResolvedValue(undefined) };
  const runs = { cancelActive: jest.fn() };
  const service = new MissionExecutorService(prisma as never, tasks as never, blocks as never, runs as never);
  return { service, prisma, tasks, blocks };
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

  it('progress menghitung task rencana & task agent', async () => {
    const r = rows().map((x) => (x.id === 'k1' ? { ...x, status: 'done' } : x.id === 'k2' ? { ...x, agent_status: 'working' } : x));
    expect(await harness(r).service.progress('root')).toEqual({ total: 3, done: 1, agent_total: 2, agent_done: 1, agent_running: 1, agent_failed: 0 });
  });
});
