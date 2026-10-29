import { Tx } from '../../database/prisma.service';

/** Query rekursif hierarki task (recursive CTE). */
export const TaskHierarchy = {
  /** Task + seluruh turunannya (tidak termasuk yang terhapus). */
  async descendants(tx: Tx, taskId: string): Promise<{ id: string; depth: number; parent_task_id: string | null }[]> {
    return tx.$queryRaw`
      WITH RECURSIVE sub AS (
        SELECT id, depth, parent_task_id FROM tasks WHERE id = ${taskId}::uuid AND deleted_at IS NULL
        UNION ALL
        SELECT t.id, t.depth, t.parent_task_id FROM tasks t JOIN sub ON t.parent_task_id = sub.id WHERE t.deleted_at IS NULL
      )
      SELECT id::text AS id, depth::int AS depth, parent_task_id::text AS parent_task_id FROM sub`;
  },

  /** Ancestor dari root sampai parent langsung (tidak termasuk task itu sendiri). */
  async ancestors(tx: Tx, taskId: string): Promise<{ id: string; title: string; depth: number }[]> {
    const rows = await tx.$queryRaw<{ id: string; title: string; depth: number }[]>`
      WITH RECURSIVE up AS (
        SELECT id, parent_task_id, title, depth FROM tasks WHERE id = ${taskId}::uuid
        UNION ALL
        SELECT t.id, t.parent_task_id, t.title, t.depth FROM tasks t JOIN up ON up.parent_task_id = t.id
      )
      SELECT id::text AS id, title, depth::int AS depth FROM up WHERE id <> ${taskId}::uuid ORDER BY depth ASC`;
    return rows;
  },
};

/** Tinggi subtree relatif (0 = tanpa anak). */
export function subtreeHeight(nodes: { depth: number }[], rootDepth: number): number {
  return nodes.reduce((max, n) => Math.max(max, n.depth - rootDepth), 0);
}
