import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../database/prisma.service';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { TokenService } from '../auth/token.service';
import { AgentRunsService } from './agent-runs.service';

const SWEEP_INTERVAL_MS = 5 * 60_000;
const TOKEN_CLEANUP_INTERVAL_MS = 24 * 60 * 60_000;

/**
 * Tugas pemeliharaan berkala:
 * - runs.timeout_sweeper: run dispatched/running tanpa event > AGENT_RUN_TIMEOUT_MINUTES → failed (RUN_TIMEOUT)
 * - tokens.cleanup: hapus refresh token kedaluwarsa > 30 hari
 */
@Injectable()
export class RunMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunMaintenanceService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly runs: AgentRunsService,
    private readonly tokens: TokenService,
  ) {}

  onModuleInit(): void {
    if (!this.config.env.RUN_WORKERS) return;
    this.timers.push(setInterval(() => void this.sweepTimedOutRuns(), SWEEP_INTERVAL_MS).unref());
    this.timers.push(setInterval(() => void this.cleanupTokens(), TOKEN_CLEANUP_INTERVAL_MS).unref());
  }

  onModuleDestroy(): void {
    this.timers.forEach(clearInterval);
  }

  async sweepTimedOutRuns(): Promise<number> {
    const cutoff = new Date(Date.now() - this.config.env.AGENT_RUN_TIMEOUT_MINUTES * 60_000);
    const stale = await this.prisma.agent_runs.findMany({
      where: {
        status: { in: ['dispatched', 'running'] },
        OR: [{ last_event_at: { lt: cutoff } }, { last_event_at: null, updated_at: { lt: cutoff } }],
      },
      take: 100,
    });
    for (const run of stale) {
      const effects = new AfterCommit();
      await this.prisma.tx((tx) =>
        this.runs.failRun(
          tx,
          run,
          { code: 'RUN_TIMEOUT', message: `Tidak ada aktivitas agent selama ${this.config.env.AGENT_RUN_TIMEOUT_MINUTES} menit`, retryable: true },
          effects,
          { systemComment: true },
        ),
      );
      await effects.run();
    }
    if (stale.length) this.logger.warn(`${stale.length} agent run ditandai gagal karena timeout`);
    return stale.length;
  }

  async cleanupTokens(): Promise<void> {
    const count = await this.tokens.cleanupExpired().catch(() => 0);
    if (count) this.logger.log(`${count} refresh token kedaluwarsa dihapus`);
  }
}
