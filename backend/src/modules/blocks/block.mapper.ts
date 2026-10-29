import { document_blocks } from '../../generated/prisma/client';
import { ActorDto } from '../core/actor.service';

export interface BlockDto {
  id: string;
  project_id: string;
  task_id: string | null;
  parent_block_id: string | null;
  block_type: string;
  content_json: unknown;
  order_index: number;
  version: number;
  last_edited_by: { type: string; id: string | null; name: string } | null;
  children: BlockDto[];
  created_at: Date;
  updated_at: Date;
}

export function toBlockDto(b: document_blocks, editor: ActorDto | null): BlockDto {
  return {
    id: b.id,
    project_id: b.project_id,
    task_id: b.task_id,
    parent_block_id: b.parent_block_id,
    block_type: b.block_type,
    content_json: b.content_json,
    order_index: b.order_index,
    version: b.version,
    last_edited_by: editor ? { type: editor.type, id: editor.id, name: editor.name } : null,
    children: [],
    created_at: b.created_at,
    updated_at: b.updated_at,
  };
}

/** Susun blok datar menjadi tree (children) terurut order_index. Aman terhadap siklus/parent yatim. */
export function buildBlockTree<T extends { id: string; parent_block_id: string | null; order_index: number; children: T[] }>(blocks: T[]): T[] {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const roots: T[] = [];
  for (const b of blocks) {
    const parent = b.parent_block_id ? byId.get(b.parent_block_id) : undefined;
    if (parent && parent !== b) parent.children.push(b);
    else roots.push(b);
  }
  const sortRec = (list: T[], seen: Set<string>): T[] => {
    list.sort((a, b) => a.order_index - b.order_index);
    for (const item of list) {
      if (seen.has(item.id)) {
        item.children = [];
        continue;
      }
      seen.add(item.id);
      sortRec(item.children, seen);
    }
    return list;
  };
  return sortRec(roots, new Set());
}

/** Urutan dokumen (DFS) dari tree. */
export function flattenBlockTree<T extends { children: T[] }>(tree: T[]): T[] {
  const out: T[] = [];
  const walk = (list: T[]) => {
    for (const b of list) {
      out.push(b);
      walk(b.children);
    }
  };
  walk(tree);
  return out;
}
