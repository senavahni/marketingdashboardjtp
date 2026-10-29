import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import { Env } from '../../config/env.schema';

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

/** Konfigurasi logger pino (JSON terstruktur; pretty di development). */
export function buildLoggerParams(env: Env): Params {
  const pretty = env.NODE_ENV === 'development';
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      transport: pretty ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } } : undefined,
      // Request ID: pakai header X-Request-Id dari klien jika valid, kalau tidak buat baru.
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customProps: (req: IncomingMessage) => {
        const user = (req as IncomingMessage & { user?: { id: string } }).user;
        return user ? { user_id: user.id } : {};
      },
      autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
      // Jangan pernah log token, cookie, signature, atau password
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-mcp-signature"]',
          'res.headers["set-cookie"]',
          'password',
          '*.password',
          '*.password_hash',
          '*.token',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    },
  };
}
