import { z } from 'zod';
import { Errors } from '../../common/exceptions/app.exception';

/** Cursor opaque berbasis offset (cukup untuk skala M1). */
export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { o?: unknown };
    if (typeof parsed.o === 'number' && parsed.o >= 0) return parsed.o;
  } catch {
    /* jatuh ke error di bawah */
  }
  throw Errors.validation('cursor tidak valid');
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

/** Ambil limit+1 baris lalu panggil fungsi ini untuk membentuk respons halaman. */
export function toPage<T>(rows: T[], offset: number, limit: number): Page<T> {
  const hasMore = rows.length > limit;
  return { data: hasMore ? rows.slice(0, limit) : rows, next_cursor: hasMore ? encodeCursor(offset + limit) : null };
}

export const paginationQuery = (defaultLimit = 50, maxLimit = 200) =>
  z.object({
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
    cursor: z.string().max(200).optional(),
  });
