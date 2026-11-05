import { ExecTask, dependencyIds, pickRunnable, planComplete } from '../../src/modules/intel/mission.rules';
import { missionPlanSchema } from '../../src/shared/schemas/mission.schema';

// M3_TASK_014 Fase B: pemilihan task yang siap dikerjakan agent

const t = (id: string, over: Partial<ExecTask> = {}): ExecTask => ({
  id,
  parent_task_id: 'root',
  title: id,
  status: 'todo',
  assignee_type: null,
  agent_status: 'idle',
  start_date: '2026-11-10',
  tags: ['misi', 'eksekutor:agent'],
  ...over,
});

describe('pickRunnable', () => {
  it('hanya task agent todo, belum di-assign, idle, sudah waktunya — urut tanggal, dibatasi slot', () => {
    const tasks = [
      t('later', { start_date: '2026-11-12' }),
      t('human', { tags: ['misi', 'eksekutor:human'] }),
      t('assigned', { assignee_type: 'agent' }),
      t('failed', { agent_status: 'failed' }),
      t('future', { start_date: '2026-11-20' }),
      t('first', { start_date: '2026-11-09' }),
      t('done', { status: 'done' }),
    ];
    expect(pickRunnable(tasks, new Map(), '2026-11-12', 5).map((x) => x.id)).toEqual(['first', 'later']);
    expect(pickRunnable(tasks, new Map(), '2026-11-12', 1).map((x) => x.id)).toEqual(['first']);
    expect(pickRunnable(tasks, new Map(), '2026-11-12', 0)).toEqual([]);
  });

  it('menunggu dependensi & subtask selesai', () => {
    const tasks = [t('a'), t('b'), t('parent'), t('child', { parent_task_id: 'parent', tags: ['misi', 'eksekutor:human'] })];
    const deps = new Map([['b', ['a']]]);
    expect(pickRunnable(tasks, deps, '2026-11-10', 5).map((x) => x.id)).toEqual(['a']);
    const doneA = tasks.map((x) => (x.id === 'a' || x.id === 'child' ? { ...x, status: 'done' as const } : x));
    expect(pickRunnable(doneA, deps, '2026-11-10', 5).map((x) => x.id)).toEqual(['b', 'parent']);
  });
});

describe('planComplete & dependencyIds', () => {
  it('subtask tahap riset tidak dihitung; rencana kosong belum selesai', () => {
    expect(planComplete([{ status: 'done', tags: ['misi', 'eksekutor:agent'] }, { status: 'todo', tags: ['misi', 'tahap:collect'] }])).toBe(true);
    expect(planComplete([{ status: 'todo', tags: ['misi', 'eksekutor:human'] }])).toBe(false);
    expect(planComplete([{ status: 'done', tags: ['misi', 'tahap:collect'] }])).toBe(false);
  });

  it('ref dependensi dipetakan ke id task', () => {
    const plan = missionPlanSchema.parse({
      tasks: [
        { ref: 't1', title: 'A', start_date: '2026-11-10', end_date: '2026-11-11' },
        { ref: 't2', title: 'B', start_date: '2026-11-12', end_date: '2026-11-13', depends_on: ['t1', 'zz'], subtasks: [{ ref: 't2.1', title: 'C', start_date: '2026-11-12', end_date: '2026-11-12', depends_on: ['t1'] }] },
      ],
    });
    const deps = dependencyIds(plan, { t1: 'id1', t2: 'id2', 't2.1': 'id3' });
    expect(deps.get('id2')).toEqual(['id1']);
    expect(deps.get('id3')).toEqual(['id1']);
    expect(deps.get('id1')).toEqual([]);
  });
});
