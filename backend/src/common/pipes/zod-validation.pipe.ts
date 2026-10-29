import { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../exceptions/app.exception';

/** Validasi body/query/param dengan schema Zod → 400 VALIDATION_ERROR berisi detail per field. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw Errors.validation('Data tidak valid', {
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
