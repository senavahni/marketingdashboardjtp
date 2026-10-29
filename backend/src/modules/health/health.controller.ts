import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Status DB & Redis untuk load balancer / monitoring. 503 jika salah satu down. */
  @Public()
  @RateLimit('none')
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'up' as const).catch(() => 'down' as const),
      this.redis.client.ping().then(() => 'up' as const).catch(() => 'down' as const),
    ]);
    const ok = database === 'up' && redis === 'up';
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'degraded', checks: { database, redis }, time: new Date().toISOString() };
  }
}
