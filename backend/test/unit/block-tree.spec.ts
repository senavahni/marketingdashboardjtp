import { buildBlockTree, flattenBlockTree } from '../../src/modules/blocks/block.mapper';
import { decodeCursor, encodeCursor, toPage } from '../../src/utils/helpers/pagination.util';
import { parseDurationToSeconds } from '../../src/utils/helpers/duration.util';

type B = { id: string; parent_block_id: string | null; order_index: number; children: B[] };
const b = (id: string, parent: string | null, order: number): B => ({ id, parent_block_id: parent, order_index: order, children: [] });

describe('block tree', () => {
  it('menyusun tree terurut & flatten dalam urutan dokumen', () => {
    const tree = buildBlockTree([b('c', 'a', 1), b('a', null, 0), b('d', null, 1), b('e', 'a', 0)]);
    expect(tree.map((x) => x.id)).toEqual(['a', 'd']);
    expect(tree[0].children.map((x) => x.id)).toEqual(['e', 'c']);
    expect(flattenBlockTree(tree).map((x) => x.id)).toEqual(['a', 'e', 'c', 'd']);
  });

  it('parent yatim menjadi root', () => {
    expect(buildBlockTree([b('x', 'missing', 0)]).map((x) => x.id)).toEqual(['x']);
  });
});

describe('pagination & duration', () => {
  it('cursor round-trip dan halaman', () => {
    expect(decodeCursor(encodeCursor(40))).toBe(40);
    expect(decodeCursor(undefined)).toBe(0);
    expect(() => decodeCursor('rusak')).toThrow();
    const page = toPage([1, 2, 3], 0, 2);
    expect(page.data).toEqual([1, 2]);
    expect(decodeCursor(page.next_cursor as string)).toBe(2);
    expect(toPage([1], 0, 2).next_cursor).toBeNull();
  });

  it('durasi JWT', () => {
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('900')).toBe(900);
    expect(parseDurationToSeconds('1d')).toBe(86400);
  });
});
