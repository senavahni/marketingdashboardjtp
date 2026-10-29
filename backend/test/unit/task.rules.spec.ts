import { AppException } from '../../src/common/exceptions/app.exception';
import { subtreeHeight } from '../../src/modules/tasks/task-hierarchy.repository';
import { assertMoveDepth, childDepth, normalizeSchedule, uniqueTags } from '../../src/modules/tasks/task.rules';

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AppException).code;
  }
  return null;
};

describe('task.rules', () => {
  describe('normalizeSchedule', () => {
    it('menolak end_date < start_date', () => {
      expect(codeOf(() => normalizeSchedule({ start_date: '2026-11-05', end_date: '2026-11-01', is_milestone: false }))).toBe('INVALID_DATE_RANGE');
    });
    it('mengizinkan tanggal parsial & kosong', () => {
      expect(normalizeSchedule({ start_date: '2026-11-01', end_date: null, is_milestone: false })).toEqual({ start_date: '2026-11-01', end_date: null, is_milestone: false });
      expect(normalizeSchedule({ start_date: null, end_date: null, is_milestone: false }).start_date).toBeNull();
    });
    it('milestone: tanggal disamakan & wajib ada', () => {
      expect(normalizeSchedule({ start_date: '2026-11-20', end_date: null, is_milestone: true })).toEqual({ start_date: '2026-11-20', end_date: '2026-11-20', is_milestone: true });
      expect(normalizeSchedule({ start_date: '2026-11-01', end_date: '2026-11-05', is_milestone: true }).end_date).toBe('2026-11-01');
      expect(codeOf(() => normalizeSchedule({ start_date: null, end_date: null, is_milestone: true }))).toBe('INVALID_DATE_RANGE');
    });
  });

  describe('hierarki', () => {
    it('depth maksimal 3', () => {
      expect(childDepth(null)).toBe(1);
      expect(childDepth(2)).toBe(3);
      expect(codeOf(() => childDepth(3))).toBe('HIERARCHY_DEPTH_EXCEEDED');
    });
    it('memindahkan subtree memperhitungkan tinggi subtree', () => {
      const subtree = [{ depth: 1 }, { depth: 2 }, { depth: 3 }];
      expect(subtreeHeight(subtree, 1)).toBe(2);
      expect(() => assertMoveDepth(1, 2)).not.toThrow();
      expect(codeOf(() => assertMoveDepth(2, 2))).toBe('HIERARCHY_DEPTH_EXCEEDED');
    });
  });

  it('tags unik & dirapikan', () => {
    expect(uniqueTags([' a ', 'a', 'b'])).toEqual(['a', 'b']);
    expect(uniqueTags(undefined)).toBeUndefined();
  });
});
