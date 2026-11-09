import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { IntelService } from './intel.service';
import { MissionExecutorService } from './mission-executor.service';
import { MissionService } from './mission.service';

const INTEL_MAINTENANCE_QUEUE = 'intel-maintenance';
const SWEEP_INTERVAL_MS = 120_000;
const MAX_JOBS_PER_SWEEP = 25;

@Injectable()
export class IntelMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntelMaintenanceService.name);
  private queue?: Queue<Record<string, never>>;
  private worker?: Worker<Record<string, never>>;
  private running = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly intel: IntelService,
    private readonly missions: MissionService,
    private readonly executor: MissionExecutorService,
  ) {}

  async onModuleInit() {
    if (!this.config.env.RUN_WORKERS) return;
    this.queue = new Queue(INTEL_MAINTENANCE_QUEUE, {
      connection: this.redis.createConnection('intel-maintenance-queue', { forBullmq: true }),
    });
    await this.queue.upsertJobScheduler(
      'intel-maintenance-repeat',
      { every: SWEEP_INTERVAL_MS },
      {
        name: 'sync-stale-jobs',
        data: {},
        opts: {
          removeOnComplete: true,
          removeOnFail: 10,
        },
      },
    );
    this.worker = new Worker(INTEL_MAINTENANCE_QUEUE, (job) => this.process(job), {
      connection: this.redis.createConnection('intel-maintenance-worker', { forBullmq: true }),
      concurrency: 1,
    });
    this.worker.on('failed', (job, error) => this.logger.error({ job_id: job?.id, error }, 'Job sweeper Intel gagal'));
    this.worker.on('error', (error) => this.logger.error({ error }, 'Worker sweeper Intel gagal'));
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  private async process(_job: Job<Record<string, never>>) {
    await this.sweep();
  }

  private async sweep() {
    if (this.running || !this.config.isIntelEnabled) return;
    this.running = true;
    try {
      const staleAt = new Date(Date.now() - SWEEP_INTERVAL_MS);
      const jobs = await this.prisma.intel_jobs.findMany({
        where: {
          deleted_at: null,
          mcp_job_id: { not: null },
          kind: null, // job kontrak 1.3 disinkronkan lewat Jobs13Service
          OR: [
            { status: { in: ['queued', 'collecting', 'analyzing', 'indexing', 'cancelling'] }, updated_at: { lt: staleAt } },
            { insight_pending: true },
          ],
        },
        orderBy: { updated_at: 'asc' },
        take: MAX_JOBS_PER_SWEEP,
        select: { id: true },
      });
      for (const job of jobs) {
        try {
          await this.intel.refreshFromMcp(job.id);
        } catch (error) {
          this.logger.warn({ job_id: job.id, error: (error as Error).message }, 'Sinkronisasi job Intel tertunda');
        }
      }
      const recovered = await this.missions.recoverStale();
      if (recovered) this.logger.log({ recovered }, 'Planning misi dipulihkan');
      const dispatched = await this.executor.tick();
      if (dispatched) this.logger.log({ dispatched }, 'Task misi dikirim ke agent');
    } catch (error) {
      this.logger.error({ error }, 'Sweeper job Intel gagal');
    } finally {
      this.running = false;
    }
  }
}
