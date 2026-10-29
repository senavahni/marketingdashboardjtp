import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/app-config.service';

/** Koneksi Redis bersama (rate limit, cache membership, penanda throttle activity). */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly config: AppConfigService) {
    this.client = this.createConnection('app');
  }

  /** Membuat koneksi baru (BullMQ & Socket.IO adapter butuh koneksi terpisah). */
  createConnection(name: string, opts: { forBullmq?: boolean } = {}): Redis {
    const conn = new Redis(this.config.env.REDIS_URL, {
      connectionName: `matrika-${name}`,
      maxRetriesPerRequest: opts.forBullmq ? null : 3,
      lazyConnect: false,
    });
    conn.on('error', (err) => this.logger.warn(`Redis (${name}) error: ${err.message}`));
    return conn;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}
