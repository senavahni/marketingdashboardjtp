import { buildTimeline, TimelineTask } from '../../src/modules/timeline/timeline.builder';

const t = (p: Partial<TimelineTask> & { id: string }): TimelineTask => ({
  parent_task_id: null,
  depth: 1,
  title: p.id,
  status: 'todo',
  priority: 'none',
  assignee: null,
  agent_status: 'idle',
  start_date: null,
  end_date: null,
  is_milestone: false,
  order_index: 0,
  ...p,
});

describe('buildTimeline', () => {
  const tasks = [
    t({ id: 'launch', start_date: '2026-11-20', end_date: '2026-11-20', is_milestone: true, order_index: 3 }),
    t({ id: 'mr', start_date: '2026-11-01', end_date: '2026-11-05', order_index: 0 }),
    t({ id: 'meta', parent_task_id: 'mr', depth: 2, start_date: '2026-11-04', end_date: '2026-11-06', order_index: 2 }),
    t({ id: 'tw', parent_task_id: 'mr', depth: 2, start_date: '2026-11-01', end_date: '2026-11-02', order_index: 1 }),
    t({ id: 'nodate', parent_task_id: 'mr', depth: 2, order_index: 0 }),
    t({ id: 'group', order_index: 4 }),
    t({ id: 'groupChild', parent_task_id: 'group', depth: 2, start_date: '2026-11-10', end_date: '2026-11-11' }),
  ];

  it('urutan DFS; sibling urut start_date lalu order_index', () => {
    const r = buildTimeline(tasks);
    expect(r.items.map((i) => i.id)).toEqual(['mr', 'tw', 'meta', 'launch', 'group', 'groupChild']);
  });

  it('range, durasi inklusif, offset, milestone 0 hari', () => {
    const r = buildTimeline(tasks);
    expect(r.range).toEqual({ start: '2026-11-01', end: '2026-11-20' });
    const byId = Object.fromEntries(r.items.map((i) => [i.id, i]));
    expect(byId.mr.duration_days).toBe(5);
    expect(byId.meta.offset_days).toBe(3);
    expect(byId.launch.duration_days).toBe(0);
    expect(byId.group.duration_days).toBeNull();
    expect(byId.mr.has_children).toBe(true);
  });

  it('unscheduled terpisah; grup tanpa tanggal tetap di items bila punya anak terjadwal', () => {
    const r = buildTimeline(tasks);
    expect(r.unscheduled.map((u) => u.id)).toEqual(['nodate', 'group']);
  });

  it('menandai subtask di luar rentang parent', () => {
    const r = buildTimeline(tasks);
    expect(r.items.find((i) => i.id === 'meta')?.outside_parent_range).toBe(true);
    expect(r.items.find((i) => i.id === 'tw')?.outside_parent_range).toBe(false);
  });

  it('filter from/to menyertakan ancestor', () => {
    const r = buildTimeline(tasks, { from: '2026-11-10', to: '2026-11-12' });
    expect(r.items.map((i) => i.id)).toEqual(['group', 'groupChild']);
  });
});
