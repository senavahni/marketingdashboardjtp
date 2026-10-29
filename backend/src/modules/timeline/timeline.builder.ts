import { addDays, diffDays, durationInclusive } from '../../utils/helpers/date.util';

export interface TimelineTask {
  id: string;
  parent_task_id: string | null;
  depth: number;
  title: string;
  status: string;
  priority: string;
  assignee: unknown;
  agent_status: string;
  start_date: string | null;
  end_date: string | null;
  is_milestone: boolean;
  order_index: number;
}

export interface TimelineItem extends Omit<TimelineTask, 'order_index'> {
  has_children: boolean;
  duration_days: number | null;
  offset_days: number | null;
  outside_parent_range: boolean;
}

export interface TimelineResult {
  range: { start: string | null; end: string | null };
  items: TimelineItem[];
  unscheduled: Pick<TimelineTask, 'id' | 'parent_task_id' | 'depth' | 'title' | 'status'>[];
}

const isScheduled = (t: TimelineTask) => !!t.start_date && !!t.end_date;

function overlaps(t: TimelineTask, from?: string, to?: string): boolean {
  if (!isScheduled(t)) return false;
  if (from && (t.end_date as string) < from) return false;
  if (to && (t.start_date as string) > to) return false;
  return true;
}

/**
 * Menyusun data Gantt (TASK_003 §Timeline):
 * - items dalam urutan DFS; sibling diurutkan start_date asc (null terakhir) lalu order_index
 * - task tanpa tanggal lengkap → unscheduled; tetap muncul di items sebagai baris grup jika punya turunan terjadwal
 * - duration_days inklusif (milestone = 0), offset_days relatif terhadap range.start
 * - filter from/to: task yang beririsan + seluruh ancestor-nya
 */
export function buildTimeline(tasks: TimelineTask[], opts: { from?: string; to?: string } = {}): TimelineResult {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const children = new Map<string | null, TimelineTask[]>();
  for (const t of tasks) {
    const parentKey = t.parent_task_id && byId.has(t.parent_task_id) ? t.parent_task_id : null;
    if (!children.has(parentKey)) children.set(parentKey, []);
    children.get(parentKey)!.push(t);
  }
  for (const list of children.values()) {
    list.sort((a, b) => {
      if (a.start_date !== b.start_date) {
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        return a.start_date < b.start_date ? -1 : 1;
      }
      return a.order_index - b.order_index;
    });
  }

  // Task terjadwal yang masuk filter + ancestor-nya
  const filtered = !!(opts.from || opts.to);
  const included = new Set<string>();
  for (const t of tasks) {
    if (filtered ? overlaps(t, opts.from, opts.to) : isScheduled(t)) {
      let cur: TimelineTask | undefined = t;
      while (cur && !included.has(cur.id)) {
        included.add(cur.id);
        cur = cur.parent_task_id ? byId.get(cur.parent_task_id) : undefined;
      }
    }
  }

  const ordered: TimelineTask[] = [];
  const unscheduled: TimelineResult['unscheduled'] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null) => {
    for (const t of children.get(parentId) ?? []) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      if (!isScheduled(t)) unscheduled.push({ id: t.id, parent_task_id: t.parent_task_id, depth: t.depth, title: t.title, status: t.status });
      if (included.has(t.id)) ordered.push(t);
      walk(t.id);
    }
  };
  walk(null);

  const scheduled = ordered.filter(isScheduled);
  const start = scheduled.reduce<string | null>((m, t) => (!m || (t.start_date as string) < m ? (t.start_date as string) : m), null);
  const end = scheduled.reduce<string | null>((m, t) => (!m || (t.end_date as string) > m ? (t.end_date as string) : m), null);

  const items: TimelineItem[] = ordered.map((t) => {
    const parent = t.parent_task_id ? byId.get(t.parent_task_id) : undefined;
    const sched = isScheduled(t);
    const outside =
      sched && !!parent && isScheduled(parent) && ((t.start_date as string) < (parent.start_date as string) || (t.end_date as string) > (parent.end_date as string));
    const { order_index: _ignored, ...rest } = t;
    return {
      ...rest,
      has_children: (children.get(t.id)?.length ?? 0) > 0,
      duration_days: sched ? (t.is_milestone ? 0 : durationInclusive(t.start_date as string, t.end_date as string)) : null,
      offset_days: sched && start ? diffDays(start, t.start_date as string) : null,
      outside_parent_range: outside,
    };
  });

  return { range: { start, end }, items, unscheduled };
}

/** Geser tanggal sebesar delta hari (null tetap null). */
export function shiftDate(value: string | null, delta: number): string | null {
  return value ? addDays(value, delta) : null;
}
