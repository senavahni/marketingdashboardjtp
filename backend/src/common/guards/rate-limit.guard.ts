import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppConfigService } from '../../config/app-config.service';
import { RedisService } from '../../redis/redis.service';
import { RATE_LIMIT_KEY, RateLimitGroup } from '../decorators/rate-limit.decorator';
import { Errors } from '../exceptions/app.exception';
import { AppRequest } from '../types/request.types';

interface Window {
  limit: number;
  windowSec: number;
}

/** Batas per grup (TASK_001 §C.3). */
export const RATE_LIMITS: Record<Exclude<RateLimitGroup, 'none'>, Window[]> = {
  auth: [
    { limit: 5, windowSec: 60 },
    { limit: 20, windowSec: 3600 },
  ],
  refresh: [{ limit: 30, windowSec: 60 }],
  blockWrite: [{ limit: 120, windowSec: 60 }],
  comment: [{ limit: 30, windowSec: 60 }],
  general: [{ limit: 300, windowSec: 60 }],
  webhook: [{ limit: 600, windowSec: 60 }],
  agentApi: [{ limit: 300, windowSec: 60 }],
};

/** Rate limiter fixed-window berbasis Redis. Jika Redis tidak tersedia, request tetap diizinkan (fail-open) dan dicatat. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http' || !this.config.env.RATE_LIMIT_ENABLED) return true;
    const group =
      this.reflector.getAllAndOverride<RateLimitGroup>(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]) ?? 'general';
    if (group === 'none') return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const subject = this.subject(group, req);

    for (const w of RATE_LIMITS[group]) {
      const bucket = Math.floor(Date.now() / 1000 / w.windowSec);
      const key = `rl:${group}:${w.windowSec}:${subject}:${bucket}`;
      let count: number;
      try {
        const res = await this.redis.client.multi().incr(key).expire(key, w.windowSec + 1).exec();
        count = Number(res?.[0]?.[1] ?? 0);
      } catch (err) {
        this.logger.warn(`Rate limit dilewati (Redis error): ${(err as Error).message}`);
        return true;
      }
      if (count > w.limit) {
        const retryAfter = w.windowSec - (Math.floor(Date.now() / 1000) % w.windowSec);
        throw Errors.rateLimited(retryAfter);
      }
    }
    return true;
  }

  private subject(group: RateLimitGroup, req: AppRequest): string {
    const body = (req.body ?? {}) as Record<string, unknown>;
    switch (group) {
      case 'auth': {
        const identifier = String(body.identifier ?? body.email ?? '').toLowerCase().slice(0, 254);
        return `${req.ip}:${identifier}`;
      }
      case 'refresh':
        return String(req.ip);
      case 'webhook':
        return String(body.agent_id ?? req.ip).slice(0, 64);
      case 'agentApi':
        return String(req.params?.runId ?? req.ip).slice(0, 64);
      default:
        return req.user?.id ?? String(req.ip);
    }
  }
}
