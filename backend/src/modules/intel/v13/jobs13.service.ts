import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ErrorCode } from '../../../common/constants/error-codes';
import { hasRole } from '../../../common/constants/domain';
import { AppException, Errors } from '../../../common/exceptions/app.exception';
import { AuthUser } from '../../../common/types/request.types';
import { AppConfigService } from '../../../config/app-config.service';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma, intel_jobs } from '../../../generated/prisma/client';
import {
  CONTRACT_13_VERSION,
  JOB_STATUSES_13,
  JobSpec13,
  JobView13,
  estimate13Schema,
  jobAccepted13Schema,
  jobCreate13InputSchema,
  jobResumeOutputSchema,
  jobReviewOutputSchema,
  jobView13Schema,
} from '../../../shared/schemas/intel-1.3.schema';
import { decodeCursor, toPage } from '../../../utils/helpers/pagination.util';
import { AccessService } from '../../core/access.service';
import { IntelMcpClient } from '../intel-mcp-client.service';
import { redactGatewayKeys } from '../intel-sanitizer';
import { recordReviewDecision, recordReviewRequest } from './approval-sync';
import { ACTIVE_13, initialStages } from './job13.state';
import { KIND_PERMISSION, REVIEW_PERMISSION, createJob13Schema, estimateJob13Schema, jobs13QuerySchema, reviewJob13Schema } from './jobs13.schemas';

const cancel13Schema = z.object({ cancelled: z.boolean(), status: z.enum(JOB_STATUSES_13) });
/** Status MCP yang tidak dipakai job 1.3 (collecting/analyzing/indexing milik 1.2) dipetakan ke `running`. */
const toDbStatus = (status: JobView13['status']) => (['collecting', 'analyzing', 'indexing'].includes(status) ? 'running' : status) as intel_jobs['status'];

/** Job intel kontrak 1.3 (DSH-V1-02): estimate, create, list, get, review, resume, cancel. */
@Injectable()
export class Jobs13Service {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly mcp: IntelMcpClient,
  ) {}

  /** `kind` job (null = job sosial Modul 3) — dipakai controller untuk memilih penangan. */
  async kindOf(jobId: string): Promise<string | null> {
    const job = await this.prisma.intel_jobs.findFirst({ where: { id: jobId, deleted_at: null }, select: { kind: true } });
    if (!job) throw Errors.notFound('Job intel tidak ditemukan');
    return job.kind;
  }

  async estimate(user: AuthUser, workspaceId: string, raw: unknown, requestId?: string) {
    this.assertEnabled();
    const { spec } = estimateJob13Schema.parse(raw);
    await this.assertCanRun(user, workspaceId, spec);
    return this.mcp.call('intel_job_estimate', { workspace_id: workspaceId, spec }, estimate13Schema, requestId);
  }

  async create(user: AuthUser, workspaceId: string, raw: unknown, requestId?: string) {
    this.assertEnabled();
    const input = createJob13Schema.parse(raw);
    await this.assertCanRun(user, workspaceId, input.spec);
    const jobId = randomUUID();
    const requestedBy = { user_id: user.id, name: user.display_name.slice(0, 100) };
    await this.prisma.tx(async (tx) => {
      await tx.intel_jobs.create({
        data: {
          id: jobId,
          workspace_id: workspaceId,
          title: input.spec.title,
          kind: input.spec.kind,
          spec: input.spec as Prisma.InputJsonValue,
          sources: [],
          llm_assist: input.spec.llm_assist,
          budget_usd: input.spec.budget_usd,
          confirm_cost: input.confirm_cost,
          requested_by_name: requestedBy.name,
          created_by: user.id,
          stage_view: initialStages(input.spec.kind, input.spec.agents) as Prisma.InputJsonValue,
        },
      });
      if (input.spec.kind === 'strategy') {
        const revisionOf = input.spec.params.revise_of?.report_id;
        const previous = revisionOf ? await tx.strategy_docs.findFirst({ where: { workspace_id: workspaceId, mcp_report_id: revisionOf }, select: { version: true } }) : null;
        await tx.strategy_docs.create({
          data: { workspace_id: workspaceId, product_id: input.spec.params.product_id, intel_job_id: jobId, title: input.spec.title, version: (previous?.version ?? 0) + 1, created_by: user.id },
        });
      }
    });
    const mcpInput = jobCreate13InputSchema.parse({ contract_version: CONTRACT_13_VERSION, dashboard_job_id: jobId, workspace_id: workspaceId, requested_by: requestedBy, spec: input.spec, confirm_cost: input.confirm_cost });
    try {
      const accepted = await this.mcp.call('intel_job_create', mcpInput, jobAccepted13Schema, requestId);
      await this.prisma.intel_jobs.update({ where: { id: jobId }, data: { mcp_job_id: accepted.mcp_job_id, estimate: accepted.estimate as Prisma.InputJsonValue } });
    } catch (error) {
      if (error instanceof AppException) throw new AppException(error.code, error.message, error.getStatus(), { job_id: jobId, retry_create: true });
      throw error;
    }
    return this.toDto(await this.findJob(jobId));
  }

  async list(user: AuthUser, workspaceId: string, raw: unknown) {
    this.assertEnabled();
    await this.access.assertWorkspace(user.id, workspaceId);
    const query = jobs13QuerySchema.parse(raw);
    const offset = decodeCursor(query.cursor);
    const rows = await this.prisma.intel_jobs.findMany({
      where: { workspace_id: workspaceId, deleted_at: null, kind: query.kind === 'all' ? { not: null } : query.kind, ...(query.status ? { status: query.status } : {}) },
      orderBy: { created_at: 'desc' },
      skip: offset,
      take: query.limit + 1,
    });
    return toPage(rows.map((row) => this.toDto(row)), offset, query.limit);
  }

  async get(user: AuthUser, jobId: string, requestId?: string) {
    this.assertEnabled();
    const job = await this.findJob(jobId);
    await this.access.assertWorkspace(user.id, job.workspace_id);
    if (job.mcp_job_id) await this.refreshFromMcp(job, requestId);
    return this.toDto(await this.findJob(jobId));
  }

  async review(user: AuthUser, workspaceId: string, jobId: string, raw: unknown, requestId?: string) {
    this.assertEnabled();
    const input = reviewJob13Schema.parse(raw);
    const job = await this.findJob(jobId, workspaceId);
    if (!job.mcp_job_id) throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Job belum terhubung ke MCP');
    const approval = await this.prisma.approvals.findFirst({ where: { intel_job_id: job.id, status: 'pending' }, orderBy: { created_at: 'desc' } });
    if (!approval?.mcp_review_id) throw Errors.conflict(ErrorCode.BUSINESS_RULE_VIOLATION, 'Tidak ada review yang menunggu keputusan');
    const permission = REVIEW_PERMISSION[approval.subject_type];
    if (permission) await this.access.assertPermission(user.id, workspaceId, permission);
    else await this.access.assertWorkspace(user.id, workspaceId, 'member');
    const out = await this.mcp.call(
      'intel_job_review',
      {
        workspace_id: workspaceId,
        mcp_job_id: job.mcp_job_id,
        review_id: approval.mcp_review_id,
        decision: input.decision,
        edits: input.edits ?? null,
        comment: input.comment ?? null,
        decided_by: { user_id: user.id, name: user.display_name.slice(0, 100) },
      },
      jobReviewOutputSchema,
      requestId,
    );
    await this.prisma.tx(async (tx) => {
      await recordReviewDecision(tx, approval, input.decision, user.id, input.comment);
      await tx.intel_jobs.update({ where: { id: job.id }, data: { status: toDbStatus(out.status) } });
    });
    return this.get(user, job.id, requestId);
  }

  async resume(user: AuthUser, workspaceId: string, jobId: string, requestId?: string) {
    this.assertEnabled();
    const job = await this.findJob(jobId, workspaceId);
    await this.assertCanModify(user, workspaceId, job.created_by);
    if (job.status !== 'paused' || !job.mcp_job_id) throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Job tidak sedang dijeda');
    const out = await this.mcp.call('intel_job_resume', { workspace_id: workspaceId, mcp_job_id: job.mcp_job_id }, jobResumeOutputSchema, requestId);
    if (out.resumed) await this.prisma.intel_jobs.update({ where: { id: job.id }, data: { status: toDbStatus(out.status), pause: Prisma.DbNull } });
    return this.get(user, job.id, requestId);
  }

  async cancel(user: AuthUser, jobId: string, requestId?: string) {
    this.assertEnabled();
    const job = await this.findJob(jobId);
    await this.assertCanModify(user, job.workspace_id, job.created_by);
    if (!job.mcp_job_id || !ACTIVE_13.includes(job.status as never)) throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Job tidak sedang berjalan');
    const out = await this.mcp.call('intel_job_cancel', { workspace_id: job.workspace_id, mcp_job_id: job.mcp_job_id }, cancel13Schema, requestId);
    await this.prisma.intel_jobs.update({ where: { id: job.id }, data: { status: out.cancelled ? 'cancelling' : toDbStatus(out.status) } });
    return { cancelled: out.cancelled, status: out.cancelled ? 'cancelling' : out.status };
  }

  async remove(user: AuthUser, jobId: string, requestId?: string): Promise<void> {
    this.assertEnabled();
    const job = await this.findJob(jobId);
    await this.assertCanModify(user, job.workspace_id, job.created_by);
    if (job.mcp_job_id && ACTIVE_13.includes(job.status as never) && job.status !== 'cancelling') await this.cancel(user, jobId, requestId);
    await this.prisma.intel_jobs.update({ where: { id: job.id }, data: { deleted_at: new Date() } });
  }

  /** Sinkron dari `intel_job_get` (cadangan webhook): status, tahap, pause, biaya, ringkasan, review → approvals. */
  private async refreshFromMcp(job: intel_jobs, requestId?: string): Promise<void> {
    const view = await this.mcp.call('intel_job_get', { workspace_id: job.workspace_id, mcp_job_id: job.mcp_job_id }, jobView13Schema, requestId);
    if (view.dashboard_job_id !== job.id || view.kind !== job.kind) throw new AppException(ErrorCode.MCP_ERROR, 'Respons job MCP tidak cocok dengan job Dashboard', 502);
    const terminal = ['completed', 'failed', 'cancelled'].includes(view.status);
    await this.prisma.tx(async (tx) => {
      await tx.intel_jobs.update({
        where: { id: job.id },
        data: {
          status: toDbStatus(view.status),
          stage_view: view.stages as Prisma.InputJsonValue,
          pause: view.pause ? (view.pause as Prisma.InputJsonValue) : Prisma.DbNull,
          cost: view.cost as Prisma.InputJsonValue,
          error: view.error ? (view.error as Prisma.InputJsonValue) : Prisma.DbNull,
          result_summary: view.result ? (view.result as Prisma.InputJsonValue) : undefined,
          started_at: view.status === 'queued' ? undefined : (job.started_at ?? new Date()),
          finished_at: terminal ? (job.finished_at ?? new Date()) : null,
        },
      });
      for (const stage of view.stages) if (stage.review) await recordReviewRequest(tx, job, stage.review, stage.agent_key);
    });
  }

  /** Izin per kind + kepemilikan resource yang dirujuk spec (anti-IDOR lintas workspace). */
  private async assertCanRun(user: AuthUser, workspaceId: string, spec: JobSpec13): Promise<void> {
    const permission = KIND_PERMISSION[spec.kind];
    if (permission) await this.access.assertPermission(user.id, workspaceId, permission);
    else await this.access.assertWorkspace(user.id, workspaceId, 'member');
    const params = spec.params as Record<string, unknown>;
    if (typeof params.product_id === 'string') {
      const product = await this.prisma.products.findFirst({ where: { id: params.product_id, workspace_id: workspaceId, deleted_at: null }, select: { status: true } });
      if (!product) throw Errors.validation('Produk tidak ditemukan di workspace ini', { field: 'spec.params.product_id' });
      if (product.status === 'archived') throw Errors.business(ErrorCode.BUSINESS_RULE_VIOLATION, 'Produk sudah diarsipkan');
    }
    if (typeof params.upload_id === 'string') {
      const upload = await this.prisma.upload_refs.findFirst({ where: { mcp_upload_id: params.upload_id, workspace_id: workspaceId }, select: { purpose: true } });
      if (!upload) throw Errors.validation('File upload tidak ditemukan di workspace ini', { field: 'spec.params.upload_id' });
      const expected = spec.kind === 'company_import' ? ['import'] : ['book', 'brand'];
      if (!expected.includes(upload.purpose)) throw Errors.validation('Jenis upload tidak sesuai dengan job', { field: 'spec.params.upload_id' });
    }
    if (spec.kind === 'content_bank') {
      // AC DSH-V1-11: bank konten tidak dapat dibuat tanpa strategi approved
      const strategy = await this.prisma.strategy_docs.findFirst({ where: { workspace_id: workspaceId, mcp_report_id: spec.params.strategy_report_id, deleted_at: null }, select: { status: true } });
      if (strategy?.status !== 'approved') throw Errors.business(ErrorCode.BUSINESS_RULE_VIOLATION, 'Bank konten hanya dapat dibuat dari strategi yang sudah disetujui');
    }
  }

  private async assertCanModify(user: AuthUser, workspaceId: string, createdBy: string | null): Promise<void> {
    const { role } = await this.access.assertWorkspace(user.id, workspaceId, 'member');
    if (!hasRole(role, 'admin') && createdBy !== user.id) throw Errors.forbidden('Hanya pembuat job atau Admin/Owner yang dapat melakukan aksi ini');
  }

  private async findJob(id: string, workspaceId?: string): Promise<intel_jobs> {
    const job = await this.prisma.intel_jobs.findFirst({ where: { id, deleted_at: null, kind: { not: null }, ...(workspaceId ? { workspace_id: workspaceId } : {}) } });
    if (!job) throw Errors.notFound('Job intel tidak ditemukan');
    return job;
  }

  private assertEnabled(): void {
    if (!this.config.isIntelEnabled) throw new AppException(ErrorCode.FEATURE_DISABLED, 'Modul Intel belum diaktifkan', 503);
  }

  private toDto(job: intel_jobs) {
    return redactGatewayKeys({
      id: job.id,
      workspace_id: job.workspace_id,
      kind: job.kind,
      title: job.title,
      status: job.status,
      spec: job.spec,
      llm_assist: job.llm_assist,
      budget_usd: job.budget_usd,
      estimate: job.estimate,
      mcp_job_id: job.mcp_job_id,
      stages: job.stage_view ?? [],
      pause: job.pause,
      result: job.result_summary,
      cost: job.cost,
      error: job.error,
      created_by: job.created_by,
      created_at: job.created_at,
      started_at: job.started_at,
      finished_at: job.finished_at,
    });
  }
}
