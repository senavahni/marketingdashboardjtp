import { ExecTask, addDays, rescheduleOverdue } from '../../src/modules/intel/mission.rules';

// M3_TASK_014: penjadwalan ulang deterministik task misi yang terlambat (tanpa LLM)

const t = (id: string, start: string, end: string, over: Partial<ExecTask> = {}): ExecTask => ({
  id,
  parent_task_id: 'root',
  title: id,
  status: 'todo',
  assignee_type: null,
  agent_status: 'idle',
  start_date: start,
  end_date: end,
  tags: ['misi', 'eksekutor:agent'],
  ...over,
});

describe('rescheduleOverdue', () => {
  it('addDays', () => {
    expect(addDays('2026-11-30', 2)).toBe('2026-12-02');
    expect(addDays('2026-11-05', -5)).toBe('2026-10-31');
  });

  it('task todo terlambat digeser ke hari ini (durasi tetap); task selesai/berjalan dibiarkan', () => {
    const tasks = [
      t('late', '2026-11-01', '2026-11-03'),
      t('done', '2026-11-01', '2026-11-02', { status: 'done' }),
      t('working', '2026-11-01', '2026-11-02', { status: 'in_progress' }),
      t('ok', '2026-11-10', '2026-11-12'),
    ];
    const out = rescheduleOverdue(tasks, new Map(), '2026-11-06', '2026-11-30');
    expect(out.changes).toEqual([{ id: 'late', start_date: '2026-11-06', end_date: '2026-11-08' }]);
    expect(out.overrun).toBe(false);
  });

  it('dependen ikut bergeser; induk diperlebar menutup subtask; melewati timeline → overrun', () => {
    const tasks = [
      t('a', '2026-11-01', '2026-11-02'),
      t('b', '2026-11-03', '2026-11-05'),
      t('parent', '2026-11-03', '2026-11-05'),
      t('child', '2026-11-03', '2026-11-05', { parent_task_id: 'parent' }),
    ];
    const deps = new Map([
      ['b', ['a']],
      ['child', ['a']],
    ]);
    const out = rescheduleOverdue(tasks, deps, '2026-11-06', '2026-11-08');
    const byId = Object.fromEntries(out.changes.map((c) => [c.id, c]));
    expect(byId.a).toEqual({ id: 'a', start_date: '2026-11-06', end_date: '2026-11-07' });
    // b mulai setelah a selesai (hari yang sama boleh) → 2026-11-07..09
    expect(byId.b).toEqual({ id: 'b', start_date: '2026-11-07', end_date: '2026-11-09' });
    expect(byId.child).toEqual({ id: 'child', start_date: '2026-11-07', end_date: '2026-11-09' });
    expect(byId.parent).toEqual({ id: 'parent', start_date: '2026-11-06', end_date: '2026-11-09' });
    expect(out.overrun).toBe(true);
  });

  it('tumpang-tindih bawaan rencana (dependensi tidak digeser) dibiarkan', () => {
    const tasks = [t('a', '2026-11-10', '2026-11-20', { status: 'done' }), t('b', '2026-11-12', '2026-11-14')];
    expect(rescheduleOverdue(tasks, new Map([['b', ['a']]]), '2026-11-06', '2026-11-30').changes).toEqual([]);
  });

  it('tidak ada yang terlambat → tidak ada perubahan', () => {
    expect(rescheduleOverdue([t('x', '2026-11-10', '2026-11-11')], new Map(), '2026-11-06', '2026-11-30')).toEqual({ changes: [], overrun: false });
  });
});
