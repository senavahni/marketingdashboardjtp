import type { Task } from './types';

const byOrder = (a: Task, b: Task) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at);

/** Peta parent → anak (terurut). Key null = root. */
export function childrenMap(tasks: Task[]): Map<string | null, Task[]> {
  const ids = new Set(tasks.map((t) => t.id));
  const map = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const key = t.parent_task_id && ids.has(t.parent_task_id) ? t.parent_task_id : null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  for (const list of map.values()) list.sort(byOrder);
  return map;
}

/** Baris yang terlihat (DFS) dengan mempertimbangkan baris yang di-collapse. */
export function visibleRows(tasks: Task[], expanded: Set<string>): Task[] {
  const map = childrenMap(tasks);
  const out: Task[] = [];
  const walk = (parent: string | null) => {
    for (const t of map.get(parent) ?? []) {
      out.push(t);
      if (expanded.has(t.id)) walk(t.id);
    }
  };
  walk(null);
  return out;
}

export function descendantIds(tasks: Task[], id: string): string[] {
  const map = childrenMap(tasks);
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const c of map.get(pid) ?? []) {
      out.push(c.id);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}
