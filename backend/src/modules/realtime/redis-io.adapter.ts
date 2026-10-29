import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { ServerOptions } from 'socket.io';
import { RedisService } from '../../redis/redis.service';

/** Socket.IO adapter berbasis Redis agar event tersebar ke semua instance backend. */
export class RedisIoAdapter extends IoAdapter {
  private readonly adapterLogger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  connect(redis: RedisService): void {
    const pub = redis.createConnection('socket-pub');
    const sub = redis.createConnection('socket-sub');
    this.adapterConstructor = createAdapter(pub, sub);
    this.adapterLogger.log('Socket.IO memakai Redis adapter');
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
