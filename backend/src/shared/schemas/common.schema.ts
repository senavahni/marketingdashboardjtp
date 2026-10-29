import { z } from 'zod';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../common/constants/domain';
import { isValidDateString } from '../../utils/helpers/date.util';

export const uuid = z.uuid().transform((v) => v.toLowerCase());
export const dateString = z.string().refine(isValidDateString, 'Format tanggal harus YYYY-MM-DD');
export const taskStatus = z.enum(TASK_STATUSES);
export const taskPriority = z.enum(TASK_PRIORITIES);
export const tag = z.string().trim().min(1).max(50);

/** Query param multi-nilai: ?status=a&status=b atau ?status=a,b */
export const multiValue = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return undefined;
    const arr = Array.isArray(v) ? v : [v];
    return arr.flatMap((x) => String(x).split(',')).map((x) => x.trim()).filter(Boolean);
  }, z.array(item).optional());

export const booleanQuery = z.preprocess((v) => (v === undefined ? undefined : v === 'true' || v === '1' || v === true), z.boolean().optional());
