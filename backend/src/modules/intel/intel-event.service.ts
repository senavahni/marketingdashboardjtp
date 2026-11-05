import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppException, Errors } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, intel_job_status } from '../../generated/prisma/client';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { INTEL_STAGES, IntelEventEnvelope, intelEventDataSchemas, intelEventEnvelopeSchema } from '../../shared/schemas/intel.schema';
import { IntelService } from './intel.service';
import { nextIntelStatus } from './intel-state';
import { MissionService } from './mission.service';

const EVENT_STALE_MS = 60_000;

@Injectable()
export class IntelEventService {
  private readonly logger = new Logger(IntelEventService.name);
  private readonly lastEmitByJob = new Map<string, number>();
  private readonly pendingEmitByJob = new Map<string, NodeJS.Timeout>();
  /** Kata terbaru tahap index (M3_TASK_011): tidak disimpan di DB, ikut pancaran real-time berikutnya. */
  private readonly sampleTokensByJob = new Map<string, string[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly intel: IntelService,
    private readonly missions: MissionService,
  ) {}

  async handle(body: unknown): Promise<{ status: 'processed' | 'duplicate' }> {
    const parsed = intelEventEnvelopeSchema.safeParse(body);
    if (!parsed.success) throw Errors.validation('Envelope webhook Intel tidak valid');
    const envelope = parsed.data;
    const dataResult = intelEventDataSchemas[envelope.event_type].safeParse(envelope.data);
    if (!dataResult.success) {
      throw Errors.validation(`data untuk ${envelope.event_type} tidak valid`, {
        issues: dataResult.error.issues.map((issue) => ({ path: `data.${issue.path.join('.')}`, message: issue.message })),
      });
    }
    const eventData: Record<string, unknown> = Object.assign({}, dataResult.data);

    const existing = await this.prisma.mcp_webhook_events.findUnique({ where: { event_id: envelope.event_id } });
    if (existing?.status === 'processed') return { status: 'duplicate' };
    if (existing?.status === 'processing' && Date.now() - existing.received_at.getTime() < EVENT_STALE_MS) {
      throw new AppException(ErrorCode.EVENT_IN_PROGRESS, 'Event sedang diproses, coba lagi', 429, { retry_after: 5 });
    }

    const effects = new AfterCommit();
    try {
      const updated = await this.prisma.tx(async (tx) => {
        const txEvent = await tx.mcp_webhook_events.findUnique({ where: { event_id: envelope.event_id } });
        if (txEvent?.status === 'processed') return null;
        const job = await tx.intel_jobs.findUnique({
          where: { id: envelope.job_id },
          include: { stages: true },
        });
        if (!job) throw Errors.notFound('Job intel tidak ditemukan');
        if (job.mcp_job_id && job.mcp_job_id !== envelope.mcp_job_id) {
          throw Errors.conflict(ErrorCode.BUSINESS_RULE_VIOLATION, 'mcp_job_id tidak cocok dengan job Dashboard');
        }
        if (['completed', 'failed', 'cancelled'].includes(job.status)) {
          throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Job sudah berada pada status terminal');
        }

        const isStale = envelope.sequence <= job.last_event_sequence;
        const now = new Date();
        if (isStale) {
          await tx.mcp_webhook_events.upsert({
            where: { event_id: envelope.event_id },
            create: {
              event_id: envelope.event_id,
              event_type: envelope.event_type,
              job_id: job.id,
              status: 'processed',
              processed_at: now,
            },
            update: { status: 'processed', job_id: job.id, processed_at: now, error: Prisma.DbNull },
          });
          return null;
        }
        this.assertStageAgent(job.stages, envelope, eventData);
        const nextStatus = nextIntelStatus(job.status, envelope.event_type, eventData);
        await tx.mcp_webhook_events.upsert({
          where: { event_id: envelope.event_id },
          create: {
            event_id: envelope.event_id,
            event_type: envelope.event_type,
            job_id: job.id,
            status: 'processed',
            processed_at: now,
          },
          update: {
            event_type: envelope.event_type,
            job_id: job.id,
            status: 'processed',
            error: Prisma.DbNull,
            processed_at: now,
            received_at: now,
          },
        });
        const updatedCount = await tx.intel_jobs.updateMany({
          where: { id: job.id, last_event_sequence: job.last_event_sequence },
          data: {
            status: nextStatus,
            mcp_job_id: job.mcp_job_id ?? envelope.mcp_job_id,
            last_event_sequence: envelope.sequence,
            started_at: job.started_at ?? (envelope.event_type === 'intel.job.started' ? now : undefined),
            finished_at: ['completed', 'failed', 'cancelled'].includes(nextStatus) ? now : undefined,
            terminal_notified_at: ['completed', 'failed'].includes(nextStatus) ? now : undefined,
            ...(envelope.event_type === 'intel.job.completed'
              ? {
                  total_items: (eventData.totals as { items: number }).items,
                  cost: eventData.cost as Prisma.InputJsonValue,
                  insight_pending: true,
                }
              : {}),
            ...(envelope.event_type === 'intel.job.failed' ? { error: eventData.error as Prisma.InputJsonValue } : {}),
          },
        });
        if (!updatedCount.count) {
          const current = await tx.intel_jobs.findUnique({ where: { id: job.id }, select: { last_event_sequence: true } });
          if (current && envelope.sequence <= current.last_event_sequence) return null;
          throw new AppException(ErrorCode.EVENT_IN_PROGRESS, 'Job sedang diperbarui, coba lagi', 429);
        }

        await this.updateStage(tx, job.id, envelope, eventData, now);
        if (nextStatus === 'completed' || nextStatus === 'failed') {
          await this.notifications.notify(
            tx,
            {
              recipients: [job.created_by],
              workspaceId: job.workspace_id,
              type: nextStatus === 'completed' ? 'intel_job_completed' : 'intel_job_failed',
              title: nextStatus === 'completed' ? 'Riset intel selesai' : 'Riset intel gagal',
              body: job.title,
              entityId: job.id,
              actor: { type: 'system', id: null },
            },
            effects,
          );
        }
        return { jobId: job.id, workspaceId: job.workspace_id, status: nextStatus };
      });

      await effects.run();
      if (!updated) return { status: 'duplicate' };
      const tokens = eventData.sample_tokens;
      if (envelope.event_type === 'intel.job.progress' && Array.isArray(tokens) && tokens.length) {
        this.sampleTokensByJob.set(updated.jobId, tokens as string[]);
      }
      try {
        await this.emitUpdate(updated.jobId, updated.workspaceId);
      } catch (error) {
        this.logger.error({ job_id: updated.jobId, error }, 'Gagal memancarkan update real-time Intel');
      }
      if (envelope.event_type === 'intel.job.completed') {
        try {
          await this.intel.refreshFromMcp(envelope.job_id);
        } catch (error) {
          this.logger.warn(
            { job_id: envelope.job_id, error: (error as Error).message },
            'Hasil lengkap Intel belum dapat diambil; job ditandai untuk retry',
          );
        }
      }
      await this.syncMission(envelope.event_type, updated.jobId, eventData);
      return { status: 'processed' };
    } catch (error) {
      await this.prisma.mcp_webhook_events
        .updateMany({
          where: { event_id: envelope.event_id, status: { not: 'processed' } },
          data: {
            status: 'rejected',
            error: error instanceof AppException ? { code: error.code, message: error.message } : { code: 'INTERNAL_ERROR' },
            processed_at: new Date(),
          },
        })
        .catch((updateError: unknown) =>
          this.logger.error({ event_id: envelope.event_id, error: updateError }, 'Gagal mencatat kegagalan webhook Intel'),
        );
      this.logger.warn({ event_id: envelope.event_id, job_id: envelope.job_id, error }, 'Webhook Intel ditolak');
      throw error;
    }
  }

  /** Penjadwalan (M3_TASK_013): subtask tahap ikut event; planning dimulai di latar saat job selesai. */
  private async syncMission(eventType: string, jobId: string, data: Record<string, unknown>): Promise<void> {
    const stage = INTEL_STAGES.find((item) => item === data.stage);
    try {
      if (eventType === 'intel.job.stage.started' && stage) await this.missions.onStageEvent(jobId, stage, 'started');
      if (eventType === 'intel.job.stage.completed' && stage) {
        await this.missions.onStageEvent(jobId, stage, data.status === 'skipped' ? 'skipped' : 'completed');
      }
      if (eventType === 'intel.job.failed') {
        const message = (data.error as { message?: string } | undefined)?.message;
        if (stage) await this.missions.onStageEvent(jobId, stage, 'failed', message);
        await this.missions.onJobTerminal(jobId, 'failed');
      }
      if (eventType === 'intel.job.cancelled') await this.missions.onJobTerminal(jobId, 'cancelled');
      if (eventType === 'intel.job.completed') {
        void this.missions
          .onJobTerminal(jobId, 'completed')
          .catch((error: unknown) => this.logger.error({ job_id: jobId, error }, 'Planning misi gagal dimulai'));
      }
    } catch (error) {
      this.logger.warn({ job_id: jobId, event_type: eventType, error: (error as Error).message }, 'Sinkron misi gagal');
    }
  }

  private assertStageAgent(stages: { stage: string; agent_key: string }[], envelope: IntelEventEnvelope, data: Record<string, unknown>) {
    if (!['intel.job.stage.started', 'intel.job.progress', 'intel.job.stage.completed', 'intel.job.failed'].includes(envelope.event_type)) {
      return;
    }
    if (typeof data.stage !== 'string') return;
    const stage = stages.find((item) => item.stage === data.stage);
    if (!stage) throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Tahap webhook tidak terdaftar pada job');
    if (envelope.event_type === 'intel.job.stage.started' && data.agent_key !== stage.agent_key) {
      throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Agent webhook tidak cocok dengan tahap job');
    }
  }

  private async updateStage(
    tx: Prisma.TransactionClient,
    jobId: string,
    envelope: IntelEventEnvelope,
    data: Record<string, unknown>,
    now: Date,
  ) {
    if (envelope.event_type === 'intel.job.cancelled') {
      await tx.intel_job_stages.updateMany({
        where: { job_id: jobId, status: 'running' },
        data: { status: 'cancelled', finished_at: now },
      });
      return;
    }
    const stage = INTEL_STAGES.find((item) => item === data.stage);
    if (!stage) return;
    if (envelope.event_type === 'intel.job.stage.started') {
      await tx.intel_job_stages.updateMany({
        where: { job_id: jobId, stage },
        data: { status: 'running', started_at: now },
      });
      return;
    }
    if (envelope.event_type === 'intel.job.progress') {
      await tx.intel_job_stages.updateMany({
        where: { job_id: jobId, stage },
        data: {
          progress_done: data.done as number,
          progress_total: (data.total as number | null | undefined) ?? null,
        },
      });
      return;
    }
    if (envelope.event_type === 'intel.job.stage.completed') {
      const skipped = data.status === 'skipped';
      await tx.intel_job_stages.updateMany({
        where: { job_id: jobId, stage },
        data: {
          status: skipped ? 'skipped' : 'completed',
          stats: jsonInput(data.stats),
          finished_at: now,
        },
      });
      return;
    }
    if (envelope.event_type === 'intel.job.failed') {
      await tx.intel_job_stages.updateMany({
        where: { job_id: jobId, stage },
        data: { status: 'failed', error: data.error as Prisma.InputJsonValue, finished_at: now },
      });
      return;
    }
  }

  private async emitUpdate(jobId: string, workspaceId: string) {
    const now = Date.now();
    const previous = this.lastEmitByJob.get(jobId) ?? 0;
    if (now - previous < 1_000) {
      if (!this.pendingEmitByJob.has(jobId)) {
        const timer = setTimeout(
          () => {
            this.pendingEmitByJob.delete(jobId);
            void this.emitUpdate(jobId, workspaceId).catch((error: unknown) =>
              this.logger.error({ job_id: jobId, error }, 'Gagal memancarkan update real-time Intel'),
            );
          },
          1_000 - (now - previous),
        );
        timer.unref();
        this.pendingEmitByJob.set(jobId, timer);
      }
      return;
    }
    const pending = this.pendingEmitByJob.get(jobId);
    if (pending) {
      clearTimeout(pending);
      this.pendingEmitByJob.delete(jobId);
    }
    this.lastEmitByJob.set(jobId, now);
    if (this.lastEmitByJob.size > 2_000) {
      for (const [id, at] of this.lastEmitByJob) if (now - at > 60_000) this.lastEmitByJob.delete(id);
    }
    const job = await this.prisma.intel_jobs.findUnique({
      where: { id: jobId },
      include: { stages: true },
    });
    if (!job) return;
    const sampleTokens = this.sampleTokensByJob.get(jobId);
    this.sampleTokensByJob.delete(jobId);
    this.realtime.toWorkspace(workspaceId, RealtimeEvent.INTEL_JOB_UPDATED, {
      id: job.id,
      status: job.status,
      stages: job.stages.map((stage) => ({
        stage: stage.stage,
        status: stage.status,
        progress: { done: stage.progress_done, total: stage.progress_total },
      })),
      total_items: job.total_items,
      ...(sampleTokens ? { sample_tokens: sampleTokens } : {}),
    });
  }
}

function jsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value == null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}
