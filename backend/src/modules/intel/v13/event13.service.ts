import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppException, Errors } from '../../../common/exceptions/app.exception';
import { PrismaService, Tx } from '../../../database/prisma.service';
import { Prisma, intel_jobs } from '../../../generated/prisma/client';
import { Event13Envelope, StageView13, event13DataSchemas, event13EnvelopeSchema } from '../../../shared/schemas/intel-1.3.schema';
import { ctBatchSchema } from '../../../shared/schemas/intel-1.3-tools.schema';
import { AfterCommit } from '../../../utils/helpers/after-commit';
import { NotificationsService } from '../../notifications/notifications.service';
import { RealtimeEvent, RealtimeEventName } from '../../realtime/realtime.events';
import { RealtimeService } from '../../realtime/realtime.service';
import { IntelEventService } from '../intel-event.service';
import { IntelMcpClient } from '../intel-mcp-client.service';
import { redactGatewayKeys } from '../intel-sanitizer';
import { recordReviewRequest } from './approval-sync';
import { Job13State, Job13Status, PauseState, applyEvent13 } from './job13.state';

const EVENT_STALE_MS = 60_000;

/** Nama event Socket.IO per tipe event 1.3 (event progres umum memakai `intel.job.updated`). */
const SOCKET_EVENT: Partial<Record<Event13Envelope['event_type'], RealtimeEventName>> = {
  'intel.job.paused': RealtimeEvent.INTEL_JOB_PAUSED,
  'intel.job.awaiting_review': RealtimeEvent.INTEL_JOB_AWAITING_REVIEW,
  'intel.company.upserted': RealtimeEvent.INTEL_COMPANY_UPSERTED,
  'ci.import.status': RealtimeEvent.CI_IMPORT_STATUS,
  'kn.asset.status': RealtimeEvent.KN_ASSET_STATUS,
  'opp.scores.updated': RealtimeEvent.OPP_SCORES_UPDATED,
  'ct.batch.ready': RealtimeEvent.CT_BATCH_READY,
};

/**
 * Penerima webhook kontrak 1.3 (DSH-V1-02): validasi → idempotency (`mcp_webhook_events`) → urutan `sequence`
 * → transisi state (job13.state) + efek DB dalam satu transaksi → Socket.IO/notifikasi/ingest setelah commit.
 * Event untuk job Modul 3 (kind null) diteruskan ke IntelEventService tanpa perubahan perilaku.
 */
@Injectable()
export class Event13Service {
  private readonly logger = new Logger(Event13Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly legacy: IntelEventService,
    private readonly mcp: IntelMcpClient,
  ) {}

  async handle(body: unknown): Promise<{ status: 'processed' | 'duplicate' }> {
    const parsed = event13EnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('Envelope webhook 1.3 tidak valid', { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    const env = parsed.data;
    const dataResult = event13DataSchemas[env.event_type].safeParse(env.data);
    if (!dataResult.success) {
      throw Errors.validation(`data untuk ${env.event_type} tidak valid`, { issues: dataResult.error.issues.map((i) => ({ path: `data.${i.path.join('.')}`, message: i.message })) });
    }
    const data = { ...(dataResult.data as Record<string, unknown>) };

    const target = await this.prisma.intel_jobs.findUnique({ where: { id: env.job_id }, select: { kind: true } });
    if (!target) throw Errors.notFound('Job intel tidak ditemukan');
    if (target.kind === null) return this.legacy.handle(body);

    const existing = await this.prisma.mcp_webhook_events.findUnique({ where: { event_id: env.event_id } });
    if (existing?.status === 'processed') return { status: 'duplicate' };
    if (existing?.status === 'processing' && Date.now() - existing.received_at.getTime() < EVENT_STALE_MS) {
      throw new AppException(ErrorCode.EVENT_IN_PROGRESS, 'Event sedang diproses, coba lagi', 429, { retry_after: 5 });
    }

    const effects = new AfterCommit();
    const result = await this.prisma.tx(async (tx) => {
      const job = await tx.intel_jobs.findUniqueOrThrow({ where: { id: env.job_id } });
      if (job.mcp_job_id && job.mcp_job_id !== env.mcp_job_id) throw Errors.conflict(ErrorCode.BUSINESS_RULE_VIOLATION, 'mcp_job_id tidak cocok dengan job Dashboard');
      const now = new Date();
      const markProcessed = () =>
        tx.mcp_webhook_events.upsert({
          where: { event_id: env.event_id },
          create: { event_id: env.event_id, event_type: env.event_type, job_id: job.id, status: 'processed', processed_at: now },
          update: { event_type: env.event_type, job_id: job.id, status: 'processed', error: Prisma.DbNull, processed_at: now },
        });
      if (env.sequence <= job.last_event_sequence) {
        await markProcessed();
        return 'duplicate' as const;
      }
      const before: Job13State = { status: job.status as Job13Status, stages: (job.stage_view ?? []) as StageView13[], pause: job.pause as PauseState | null };
      const next = applyEvent13(before, env.event_type, data, env.occurred_at);
      await markProcessed();
      const updated = await tx.intel_jobs.updateMany({
        where: { id: job.id, last_event_sequence: job.last_event_sequence },
        data: {
          status: next.status,
          stage_view: next.stages as Prisma.InputJsonValue,
          pause: next.pause ? (next.pause as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          mcp_job_id: job.mcp_job_id ?? env.mcp_job_id,
          last_event_sequence: env.sequence,
          started_at: job.started_at ?? (env.event_type === 'intel.job.started' ? now : undefined),
          finished_at: ['completed', 'failed', 'cancelled'].includes(next.status) ? now : undefined,
          ...this.terminalColumns(env, data),
        },
      });
      if (!updated.count) throw new AppException(ErrorCode.EVENT_IN_PROGRESS, 'Event job lain sedang diproses, coba lagi', 429, { retry_after: 1 });
      await this.sideEffects(tx, job, env, data, effects);
      effects.add(() => this.emit(job, env, data, next.status));
      return 'processed' as const;
    });
    await effects.run();
    return { status: result };
  }

  private terminalColumns(env: Event13Envelope, data: Record<string, unknown>): Prisma.intel_jobsUpdateManyMutationInput {
    if (env.event_type === 'intel.job.completed') {
      return { cost: data.cost as Prisma.InputJsonValue, result_summary: { summary: data.summary_preview, counts: (data.totals as { counts: unknown }).counts, partial: data.partial } as Prisma.InputJsonValue };
    }
    if (env.event_type === 'intel.job.failed') return { error: data.error as Prisma.InputJsonValue };
    return {};
  }

  private async sideEffects(tx: Tx, job: intel_jobs, env: Event13Envelope, data: Record<string, unknown>, effects: AfterCommit): Promise<void> {
    const system = { type: 'system' as const, id: null };
    switch (env.event_type) {
      case 'intel.job.awaiting_review': {
        const stage = ((job.stage_view ?? []) as StageView13[]).find((s) => s.stage === data.stage);
        const review = { review_id: String(data.review_id), subject_type: data.subject_type as never, subject_ref: String(data.subject_ref), summary: String(data.summary), non_blocking: data.non_blocking === true };
        const created = await recordReviewRequest(tx, job, review, stage?.agent_key ?? null);
        if (created) {
          await this.notifications.notify(tx, { recipients: [job.created_by], workspaceId: job.workspace_id, type: 'intel_review_requested', title: 'Menunggu review', body: `${job.title}: ${review.summary}`.slice(0, 500), entityId: job.id, actor: system }, effects);
          effects.add(() => this.realtime.toWorkspace(job.workspace_id, RealtimeEvent.APPROVAL_CREATED, { job_id: job.id, subject_type: review.subject_type }));
        }
        return;
      }
      case 'intel.job.paused':
        await this.notifications.notify(tx, { recipients: [job.created_by], workspaceId: job.workspace_id, type: 'intel_job_paused', title: 'Job dijeda', body: `${job.title}: ${String(data.message)}`.slice(0, 500), entityId: job.id, actor: system }, effects);
        return;
      case 'kn.asset.status':
        await tx.upload_refs.updateMany({ where: { workspace_id: job.workspace_id, mcp_upload_id: String(data.upload_id) }, data: { status_cache: String(data.status) } });
        return;
      case 'ct.batch.ready':
        // Ambil isi batch dari MCP setelah commit (panggilan jaringan di luar transaksi)
        effects.add(() => this.ingestContentBatch(job, String(data.batch_id), String(data.strategy_report_id)));
        return;
      default:
        return;
    }
  }

  /** `ct.batch.ready` → `content_items` (idempoten per item_ref) di bawah strategi approved yang sesuai. */
  async ingestContentBatch(job: Pick<intel_jobs, 'id' | 'workspace_id' | 'created_by' | 'title'>, batchId: string, strategyReportId: string): Promise<number> {
    try {
      const strategy = await this.prisma.strategy_docs.findFirst({ where: { workspace_id: job.workspace_id, mcp_report_id: strategyReportId, status: 'approved', deleted_at: null } });
      if (!strategy) throw Errors.business(ErrorCode.BUSINESS_RULE_VIOLATION, 'Strategi approved untuk batch konten tidak ditemukan');
      const batch = await this.mcp.call('ct_batch_get', { workspace_id: job.workspace_id, batch_id: batchId }, ctBatchSchema);
      const effects = new AfterCommit();
      const count = await this.prisma.tx(async (tx) => {
        const res = await tx.content_items.createMany({
          skipDuplicates: true,
          data: batch.items.map((item) => ({
            workspace_id: job.workspace_id,
            strategy_doc_id: strategy.id,
            mcp_batch_id: batch.batch_id,
            mcp_item_ref: item.item_ref,
            platform: item.platform,
            format: item.format,
            pillar: item.pillar,
            funnel_stage: item.funnel_stage,
            segment: item.segment,
            hook: item.hook,
            caption: item.caption,
            cta: item.cta,
            hashtags: item.hashtags,
            visual_brief: item.visual_brief,
            framework_refs: item.framework_refs as Prisma.InputJsonValue,
            insight_refs: item.insight_refs as Prisma.InputJsonValue,
            eval_score: item.eval_score,
            eval_reason: item.eval_reason,
          })),
        });
        await this.notifications.notify(tx, { recipients: [job.created_by], workspaceId: job.workspace_id, type: 'content_batch_ready', title: 'Bank konten siap direview', body: `${res.count} draf konten — ${job.title}`, entityId: job.id, actor: { type: 'system', id: null } }, effects);
        return res.count;
      });
      await effects.run();
      return count;
    } catch (error) {
      this.logger.error({ job_id: job.id, batch_id: batchId, err: error instanceof Error ? error.message : String(error) }, 'Gagal menyimpan batch konten');
      return 0;
    }
  }

  private emit(job: intel_jobs, env: Event13Envelope, data: Record<string, unknown>, status: string): void {
    const payload = redactGatewayKeys({ job_id: job.id, kind: job.kind, event_type: env.event_type, status, sequence: env.sequence, data });
    this.realtime.toWorkspace(job.workspace_id, RealtimeEvent.INTEL_JOB_UPDATED, payload);
    const specific = SOCKET_EVENT[env.event_type];
    if (specific) this.realtime.toWorkspace(job.workspace_id, specific, payload);
  }
}
