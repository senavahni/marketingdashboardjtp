import { HttpStatus } from '@nestjs/common';
import { Transform, TransformCallback } from 'node:stream';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { LIMITS_13 } from '../../shared/schemas/intel-1.3.schema';

export type UploadKind = 'pdf' | 'xlsx' | 'csv';
export type UploadPurpose = 'book' | 'brand' | 'import';

export const UPLOAD_LIMIT_BYTES: Record<UploadKind, number> = { pdf: LIMITS_13.pdfMaxBytes, xlsx: LIMITS_13.sheetMaxBytes, csv: LIMITS_13.sheetMaxBytes };
const MAGIC_BYTES = 8;

export const tooLarge = (kind: UploadKind) =>
  new AppException(ErrorCode.UPLOAD_TOO_LARGE, `Ukuran file melebihi batas ${UPLOAD_LIMIT_BYTES[kind] / 1024 / 1024} MB`, HttpStatus.PAYLOAD_TOO_LARGE);
export const unsupported = (message: string) => new AppException(ErrorCode.UNSUPPORTED_FILE, message, HttpStatus.UNSUPPORTED_MEDIA_TYPE);

/** Jenis file dari ekstensi + kecocokan dengan tujuan upload (buku/brand = PDF, import = XLSX/CSV). */
export function uploadKindFor(filename: string, purpose: UploadPurpose): UploadKind {
  const ext = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase();
  const kind = ext === 'pdf' || ext === 'xlsx' || ext === 'csv' ? ext : null;
  if (!kind) throw unsupported('Hanya file PDF, XLSX, atau CSV yang didukung');
  if ((purpose === 'import') !== (kind !== 'pdf')) throw unsupported(purpose === 'import' ? 'Import hanya menerima XLSX/CSV' : 'Buku/brand guideline harus PDF');
  return kind;
}

/** Cek magic bytes potongan pertama: PDF `%PDF-`, XLSX = ZIP `PK\x03\x04`, CSV = teks (tanpa byte NUL, bukan PDF/ZIP). */
export function magicMatches(kind: UploadKind, head: Buffer): boolean {
  const isPdf = head.subarray(0, 5).toString('latin1') === '%PDF-';
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (kind === 'pdf') return isPdf;
  if (kind === 'xlsx') return isZip;
  return head.length > 0 && !isPdf && !isZip && !head.includes(0x00);
}

/**
 * Transform pass-through: menahan ≤ 8 byte pertama untuk cek magic, lalu meneruskan chunk apa adanya sambil
 * menghitung ukuran. Melewati batas → stream error `UPLOAD_TOO_LARGE` (tidak pernah menahan file utuh di memori).
 */
export class UploadGuard extends Transform {
  bytes = 0;
  failure: AppException | null = null;
  private head: Buffer | null = Buffer.alloc(0);

  constructor(private readonly kind: UploadKind) {
    super();
  }

  override _transform(chunk: Buffer, _enc: BufferEncoding, done: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.bytes > UPLOAD_LIMIT_BYTES[this.kind]) return this.fail(tooLarge(this.kind), done);
    if (this.head) {
      this.head = Buffer.concat([this.head, chunk]);
      if (this.head.length < MAGIC_BYTES) return done();
      return this.releaseHead(done);
    }
    done(null, chunk);
  }

  override _flush(done: TransformCallback): void {
    if (this.bytes === 0) return this.fail(unsupported('File kosong'), done);
    if (this.head) return this.releaseHead(done);
    done();
  }

  private releaseHead(done: TransformCallback): void {
    const head = this.head as Buffer;
    this.head = null;
    if (!magicMatches(this.kind, head.subarray(0, 4096))) return this.fail(unsupported(`Isi file bukan ${this.kind.toUpperCase()} yang valid`), done);
    done(null, head);
  }

  private fail(error: AppException, done: TransformCallback): void {
    this.failure = error;
    done(error);
  }
}
