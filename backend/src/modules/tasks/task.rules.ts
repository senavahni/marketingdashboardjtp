import { MAX_TASK_DEPTH } from '../../common/constants/domain';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';

export interface Schedule {
  start_date: string | null;
  end_date: string | null;
  is_milestone: boolean;
}

/**
 * Validasi & normalisasi jadwal (TASK_002 §Business Logic):
 * - end_date ≥ start_date
 * - milestone: wajib bertanggal dan start_date = end_date (tanggal yang kosong disamakan)
 */
export function normalizeSchedule(s: Schedule): Schedule {
  let { start_date, end_date } = s;
  if (s.is_milestone) {
    const date = start_date ?? end_date;
    if (!date) throw Errors.business(ErrorCode.INVALID_DATE_RANGE, 'Milestone wajib memiliki tanggal', { field: 'start_date' });
    start_date = date;
    end_date = date;
  }
  if (start_date && end_date && end_date < start_date) {
    throw Errors.business(ErrorCode.INVALID_DATE_RANGE, 'end_date tidak boleh lebih kecil dari start_date', { field: 'end_date' });
  }
  return { start_date, end_date, is_milestone: s.is_milestone };
}

/** Depth untuk anak dari parent tertentu (null = root). */
export function childDepth(parentDepth: number | null): number {
  const depth = parentDepth === null ? 1 : parentDepth + 1;
  if (depth > MAX_TASK_DEPTH) {
    throw Errors.business(ErrorCode.HIERARCHY_DEPTH_EXCEEDED, `Kedalaman task maksimal ${MAX_TASK_DEPTH} level`, { max_depth: MAX_TASK_DEPTH });
  }
  return depth;
}

/** Validasi pemindahan subtree: kedalaman akhir tidak boleh melebihi batas. */
export function assertMoveDepth(newRootDepth: number, height: number): void {
  if (newRootDepth + height > MAX_TASK_DEPTH) {
    throw Errors.business(ErrorCode.HIERARCHY_DEPTH_EXCEEDED, `Kedalaman task maksimal ${MAX_TASK_DEPTH} level`, { max_depth: MAX_TASK_DEPTH });
  }
}

export function uniqueTags(tags: string[] | undefined): string[] | undefined {
  return tags ? [...new Set(tags.map((t) => t.trim()).filter(Boolean))] : undefined;
}
