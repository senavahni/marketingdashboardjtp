import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { RedisService } from '../../redis/redis.service';

export const MCP_QUEUE = 'mcp-outbound';

export type McpJobKind = 'dispatch' | 'mention' | 'prompt_block' | 'cancel';

export interface McpJobData {
  kind: McpJobKind;
  run_id: string;
  mcp_run_id?: string | null;
  reason?: string;
}

/** Antrian pemanggilan MCP (Dashboard → MCP selalu asinkron, M1_ARCHITECTURE §8). */
@Injectable()
export class McpQueueService implements OnModuleDestroy {
  readonly queue: Queue<McpJobData>;

  constructor(
    redis: RedisService,
    private readonly config: AppConfigService,
  ) {
    this.queue = new Queue<McpJobData>(MCP_QUEUE, { connection: redis.createConnection('bullmq-queue', { forBullmq: true }) });
  }

  async enqueue(data: McpJobData): Promise<void> {
    await this.queue.add(data.kind, data, {
      jobId: `${data.kind}-${data.run_id}`,
      attempts: data.kind === 'cancel' ? 3 : this.config.env.MCP_DISPATCH_MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close().catch(() => undefined);
  }
}
