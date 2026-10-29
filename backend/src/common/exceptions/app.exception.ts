import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodeValue } from '../constants/error-codes';

/** Exception standar aplikasi → dirender sebagai { error: { code, message, details }, request_id }. */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCodeValue,
    message: string,
    status: number,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

/** Factory error yang sering dipakai, agar pesan & status konsisten. */
export const Errors = {
  validation: (message = 'Data tidak valid', details?: unknown) =>
    new AppException(ErrorCode.VALIDATION_ERROR, message, HttpStatus.BAD_REQUEST, details),
  unauthenticated: (message = 'Autentikasi diperlukan', code: ErrorCodeValue = ErrorCode.UNAUTHENTICATED) =>
    new AppException(code, message, HttpStatus.UNAUTHORIZED),
  forbidden: (message = 'Anda tidak memiliki akses untuk aksi ini') =>
    new AppException(ErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN),
  notFound: (message = 'Data tidak ditemukan', code: ErrorCodeValue = ErrorCode.NOT_FOUND) =>
    new AppException(code, message, HttpStatus.NOT_FOUND),
  conflict: (code: ErrorCodeValue, message: string, details?: unknown) =>
    new AppException(code, message, HttpStatus.CONFLICT, details),
  business: (code: ErrorCodeValue, message: string, details?: unknown) =>
    new AppException(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details),
  rateLimited: (retryAfterSec: number) =>
    new AppException(ErrorCode.RATE_LIMITED, 'Terlalu banyak permintaan, coba lagi nanti', HttpStatus.TOO_MANY_REQUESTS, {
      retry_after: retryAfterSec,
    }),
};
