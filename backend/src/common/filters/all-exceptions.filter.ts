import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { ErrorCode, ErrorCodeValue } from '../constants/error-codes';
import { AppException } from '../exceptions/app.exception';
import { AppRequest } from '../types/request.types';

interface ErrorBody {
  code: ErrorCodeValue | string;
  message: string;
  details?: unknown;
}

const STATUS_TO_CODE: Record<number, ErrorCodeValue> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.ALREADY_EXISTS,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  422: ErrorCode.BUSINESS_RULE_VIOLATION,
  429: ErrorCode.RATE_LIMITED,
};

/**
 * Handler error global: semua error dirender dalam format standar
 * { error: { code, message, details }, request_id } (M1_ARCHITECTURE §4).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<AppRequest>();
    const res = ctx.getResponse<Response>();

    const { status, body } = this.resolve(exception);
    if (status >= 500) {
      this.logger.error({ err: exception, request_id: req.id, path: req.url }, 'Unhandled error');
    }
    if (status === 429 && typeof body.details === 'object' && body.details && 'retry_after' in body.details) {
      res.setHeader('Retry-After', String((body.details as { retry_after: number }).retry_after));
    }
    res.status(status).json({ error: body, request_id: req.id ?? null });
  }

  private resolve(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: { code: exception.code, message: exception.message, details: exception.details },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : Array.isArray((response as { message?: unknown }).message)
            ? ((response as { message: string[] }).message.join(', '))
            : String((response as { message?: unknown }).message ?? exception.message);
      return { status, body: { code: STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_ERROR, message } };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            body: { code: ErrorCode.ALREADY_EXISTS, message: 'Data dengan nilai unik tersebut sudah ada', details: exception.meta },
          };
        case 'P2025':
          return { status: HttpStatus.NOT_FOUND, body: { code: ErrorCode.NOT_FOUND, message: 'Data tidak ditemukan' } };
        case 'P2003':
          return { status: HttpStatus.UNPROCESSABLE_ENTITY, body: { code: ErrorCode.BUSINESS_RULE_VIOLATION, message: 'Referensi data tidak valid' } };
      }
    }

    // Error body-parser Express (JSON rusak / terlalu besar)
    const err = exception as { type?: string; status?: number };
    if (err?.type === 'entity.too.large') {
      return { status: 413, body: { code: ErrorCode.PAYLOAD_TOO_LARGE, message: 'Ukuran request terlalu besar' } };
    }
    if (err?.type === 'entity.parse.failed') {
      return { status: 400, body: { code: ErrorCode.VALIDATION_ERROR, message: 'Body JSON tidak valid' } };
    }

    return { status: 500, body: { code: ErrorCode.INTERNAL_ERROR, message: 'Terjadi kesalahan pada server' } };
  }
}
