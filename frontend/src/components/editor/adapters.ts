import type { Block as ServerBlock } from '../../lib/types';

/** Bentuk blok editor yang kita butuhkan (subset Block BlockNote). */
export interface EditorBlockLike {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content?: unknown;
  children: EditorBlockLike[];
}

export interface FlatBlock {
  id: string;
  parent_block_id: string | null;
  block_type: string;
  content_json: { props: Record<string, unknown>; content?: unknown };
  order_index: number;
}

/** Tree dari server → PartialBlock BlockNote. */
export function toEditorBlocks(blocks: ServerBlock[]): any[] {
  return blocks.map((b) => {
    const c = b.content_json ?? {};
    return {
      id: b.id,
      type: b.block_type,
      props: c.props ?? {},
      ...(c.content !== undefined ? { content: c.content } : {}),
      children: toEditorBlocks(b.children ?? []),
    };
  });
}

/** Dokumen editor → daftar datar (parent + urutan) sesuai format API batch. */
export function flattenEditor(doc: EditorBlockLike[], parent: string | null = null, out: FlatBlock[] = []): FlatBlock[] {
  doc.forEach((b, i) => {
    out.push({
      id: b.id,
      parent_block_id: parent,
      block_type: b.type,
      content_json: b.content === undefined ? { props: b.props } : { props: b.props, content: b.content },
      order_index: i,
    });
    flattenEditor(b.children ?? [], b.id, out);
  });
  return out;
}

export function flattenServer(tree: ServerBlock[], out: ServerBlock[] = []): ServerBlock[] {
  for (const b of tree) {
    out.push(b);
    flattenServer(b.children ?? [], out);
  }
  return out;
}

/** Hash untuk mendeteksi perubahan per blok (konten + posisi). */
export const blockHash = (b: FlatBlock): string => JSON.stringify([b.block_type, b.content_json, b.parent_block_id, b.order_index]);

export interface Snapshot {
  hash: string;
  version: number;
}

export type BatchOp =
  | { op: 'upsert'; block: FlatBlock; expected_version?: number }
  | { op: 'delete'; id: string; expected_version?: number };

/** Hitung operasi batch dari perbedaan dokumen editor vs snapshot tersimpan. O(n). */
export function diffDocument(flat: FlatBlock[], snapshot: Map<string, Snapshot>): { ops: BatchOp[]; hashes: Map<string, string> } {
  const ops: BatchOp[] = [];
  const hashes = new Map<string, string>();
  const seen = new Set<string>();
  for (const b of flat) {
    seen.add(b.id);
    const h = blockHash(b);
    hashes.set(b.id, h);
    const snap = snapshot.get(b.id);
    if (!snap) ops.push({ op: 'upsert', block: b });
    else if (snap.hash !== h) ops.push({ op: 'upsert', block: b, expected_version: snap.version });
  }
  for (const [id, snap] of snapshot) if (!seen.has(id)) ops.push({ op: 'delete', id, expected_version: snap.version });
  return { ops, hashes };
}
