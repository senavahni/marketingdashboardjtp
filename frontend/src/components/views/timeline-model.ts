import { addDays, diffDays, durationInclusive, today } from '../../lib/dates';
import type { Task } from '../../lib/types';

export interface TimelineRow {
  task: Task;
  scheduled: boolean;
  hasChildren: boolean;
  outsideParent: boolean;
}

const scheduled = (t: Task) => !!t.start_date && !!t.end_date;

/**
 * Susunan baris timeline (sama dengan aturan backend TASK_003):
 * DFS; sibling urut start_date (null terakhir) lalu order_index; task tanpa tanggal muncul sebagai
 * baris grup jika punya turunan terjadwal, selebihnya masuk daftar "Belum dijadwalkan".
 */
export function buildRows(tasks: Task[], collapsed: Set<string>): { rows: TimelineRow[]; unscheduled: Task[] } {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const kids = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const key = t.parent_task_id && byId.has(t.parent_task_id) ? t.parent_task_id : null;
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key)!.push(t);
  }
  for (const list of kids.values()) {
    list.sort((a, b) => {
      if (a.start_date !== b.start_date) {
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        return a.start_date < b.start_date ? -1 : 1;
      }
      return a.order_index - b.order_index;
    });
  }
  const hasScheduledDesc = (id: string): boolean => (kids.get(id) ?? []).some((c) => scheduled(c) || hasScheduledDesc(c.id));

  const rows: TimelineRow[] = [];
  const unscheduled: Task[] = [];
  const walk = (parent: string | null, hidden: boolean) => {
    for (const t of kids.get(parent) ?? []) {
      const sch = scheduled(t);
      if (!sch) unscheduled.push(t);
      if (!hidden && (sch || hasScheduledDesc(t.id))) {
        const p = t.parent_task_id ? byId.get(t.parent_task_id) : undefined;
        const outside = sch && !!p && scheduled(p) && (t.start_date! < p.start_date! || t.end_date! > p.end_date!);
        rows.push({ task: t, scheduled: sch, hasChildren: (kids.get(t.id)?.length ?? 0) > 0, outsideParent: outside });
      }
      walk(t.id, hidden || collapsed.has(t.id));
    }
  };
  walk(null, false);
  return { rows, unscheduled };
}

export function timelineRange(tasks: Task[]): { start: string; days: number } {
  const t = today();
  let min = addDays(t, -7);
  let max = addDays(t, 30);
  for (const x of tasks) {
    if (x.start_date && x.start_date < addDays(min, 7)) min = addDays(x.start_date, -7);
    if (x.end_date && x.end_date > addDays(max, -21)) max = addDays(x.end_date, 21);
  }
  return { start: min, days: diffDays(min, max) + 1 };
}

export function barGeometry(task: Task, rangeStart: string, dayW: number): { left: number; width: number } | null {
  if (!task.start_date || !task.end_date) return null;
  return { left: diffDays(rangeStart, task.start_date) * dayW, width: task.is_milestone ? dayW : durationInclusive(task.start_date, task.end_date) * dayW };
}
