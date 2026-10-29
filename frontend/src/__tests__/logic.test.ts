import { describe, expect, it } from 'vitest';
import { blockHash, diffDocument, flattenEditor, toEditorBlocks, type Snapshot } from '../components/editor/adapters';
import { barGeometry, buildRows } from '../components/views/timeline-model';
import { addDays, diffDays, durationInclusive, formatRange } from '../lib/dates';
import { descendantIds, visibleRows } from '../lib/task-tree';
import type { Block, Task } from '../lib/types';

const task = (p: Partial<Task> & { id: string }): Task => ({
  project_id: 'p',
  parent_task_id: null,
  depth: 1,
  title: p.id,
  status: 'todo',
  priority: 'none',
  assignee: null,
  start_date: null,
  end_date: null,
  is_milestone: false,
  tags: [],
  order_index: 0,
  agent_status: 'idle',
  active_run: null,
  subtask_count: 0,
  created_by: null,
  completed_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...p,
});

describe('dates (plain date, bebas timezone)', () => {
  it('aritmatika lintas bulan/tahun', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-11-01', '2026-11-05')).toBe(4);
    expect(durationInclusive('2026-11-01', '2026-11-05')).toBe(5);
    expect(formatRange('2026-11-20', '2026-11-20')).toBe(formatRange('2026-11-20', null).replace(' → …', ''));
  });
});

describe('editor adapters & diff auto-save', () => {
  const server: Block[] = [
    {
      id: 'a', project_id: 'p', task_id: 't', parent_block_id: null, block_type: 'paragraph', order_index: 0, version: 2, last_edited_by: null,
      content_json: { props: {}, content: [{ type: 'text', text: 'Halo', styles: {} }] },
      children: [{ id: 'b', project_id: 'p', task_id: 't', parent_block_id: 'a', block_type: 'divider', order_index: 0, version: 1, last_edited_by: null, content_json: { props: {} }, children: [] }],
    },
  ];
  const editorDoc = toEditorBlocks(server);

  it('round-trip server → editor → flat mempertahankan parent & urutan', () => {
    const flat = flattenEditor(editorDoc);
    expect(flat.map((f) => [f.id, f.parent_block_id, f.order_index])).toEqual([
      ['a', null, 0],
      ['b', 'a', 0],
    ]);
    expect(flat[1].content_json).toEqual({ props: {} });
  });

  it('diff: tidak ada perubahan → tanpa operasi; ubah/tambah/hapus terdeteksi dengan expected_version', () => {
    const snap = new Map<string, Snapshot>(flattenEditor(editorDoc).map((f) => [f.id, { hash: blockHash(f), version: f.id === 'a' ? 2 : 1 }]));
    expect(diffDocument(flattenEditor(editorDoc), snap).ops).toEqual([]);

    const changed = [{ ...editorDoc[0], content: [{ type: 'text', text: 'Halo dunia', styles: {} }], children: [] }, { id: 'c', type: 'paragraph', props: {}, content: [], children: [] }];
    const { ops } = diffDocument(flattenEditor(changed), snap);
    expect(ops).toEqual([
      expect.objectContaining({ op: 'upsert', expected_version: 2, block: expect.objectContaining({ id: 'a' }) }),
      expect.objectContaining({ op: 'upsert', block: expect.objectContaining({ id: 'c', order_index: 1 }) }),
      { op: 'delete', id: 'b', expected_version: 1 },
    ]);
    expect(ops[1]).not.toHaveProperty('expected_version');
  });
});

describe('task tree', () => {
  const tasks = [task({ id: 'r1', order_index: 1 }), task({ id: 'r0', order_index: 0 }), task({ id: 'c', parent_task_id: 'r1', depth: 2 }), task({ id: 'g', parent_task_id: 'c', depth: 3 })];
  it('baris terlihat mengikuti expand', () => {
    expect(visibleRows(tasks, new Set()).map((t) => t.id)).toEqual(['r0', 'r1']);
    expect(visibleRows(tasks, new Set(['r1', 'c'])).map((t) => t.id)).toEqual(['r0', 'r1', 'c', 'g']);
  });
  it('descendants', () => expect(descendantIds(tasks, 'r1')).toEqual(['c', 'g']));
});

describe('timeline model', () => {
  const tasks = [
    task({ id: 'mr', start_date: '2026-11-01', end_date: '2026-11-05' }),
    task({ id: 'meta', parent_task_id: 'mr', depth: 2, start_date: '2026-11-04', end_date: '2026-11-07' }),
    task({ id: 'nodate', parent_task_id: 'mr', depth: 2 }),
    task({ id: 'ms', start_date: '2026-11-20', end_date: '2026-11-20', is_milestone: true }),
  ];
  it('urutan, unscheduled & di luar rentang parent', () => {
    const { rows, unscheduled } = buildRows(tasks, new Set());
    expect(rows.map((r) => r.task.id)).toEqual(['mr', 'meta', 'ms']);
    expect(unscheduled.map((t) => t.id)).toEqual(['nodate']);
    expect(rows[1].outsideParent).toBe(true);
    expect(buildRows(tasks, new Set(['mr'])).rows.map((r) => r.task.id)).toEqual(['mr', 'ms']);
  });
  it('geometri bar & milestone', () => {
    expect(barGeometry(tasks[0], '2026-10-30', 10)).toEqual({ left: 20, width: 50 });
    expect(barGeometry(tasks[3], '2026-10-30', 10)?.width).toBe(10);
    expect(barGeometry(tasks[2], '2026-10-30', 10)).toBeNull();
  });
});
