import { PipeTransform } from '@nestjs/common';
import { Errors } from '../exceptions/app.exception';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Param ID yang bukan UUID diperlakukan sebagai "tidak ditemukan". */
export class UuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID_RE.test(value)) throw Errors.notFound();
    return value.toLowerCase();
  }
}
