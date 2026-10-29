import { SetMetadata } from '@nestjs/common';

export type RateLimitGroup = 'auth' | 'refresh' | 'blockWrite' | 'comment' | 'general' | 'webhook' | 'agentApi' | 'none';

export const RATE_LIMIT_KEY = 'rateLimitGroup';
/** Memilih grup rate limit (default: general). Lihat TASK_001 §C.3. */
export const RateLimit = (group: RateLimitGroup) => SetMetadata(RATE_LIMIT_KEY, group);
