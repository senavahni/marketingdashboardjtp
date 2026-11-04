import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hasRole } from '../../common/constants/domain';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppException, Errors } from '../../common/exceptions/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, intel_job_status } from '../../generated/prisma/client';
import { RedisService } from '../../redis/redis.service';
import { AfterCommit } from '../../utils/helpers/after-commit';
import {
  AgentInfo,
  IntelSource,
  agentsListSchema,
  cancelOutputSchema,
  estimateSchema,
  itemsPageSchema,
  jobAcceptedSchema,
  jobCreateInputSchema,
  jobSpecSchema,
  jobViewSchema,
  llmStatusSchema,
  sourcesStatusSchema,
} from '../../shared/schemas/intel.schema';
import { decodeCursor, toPage } from '../../utils/helpers/pagination.util';
import { AccessService } from '../core/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IntelMcpClient } from './intel-mcp-client.service';
import { csvCell } from './intel-csv';
import { redactGatewayKeys } from './intel-sanitizer';
import {
  createIntelJobSchema,
  intelItemsQuerySchema,
  intelJobsQuerySchema,
  intelJobInputSchema,
  llmStatusQuerySchema,
  stageDefaultsInputSchema,
} from './intel.schemas';

const CACHE_SECONDS = 60;
const EVENTS_LIMIT = 500;
const ACTIVE_STATUSES: intel_job_status[] = ['queued', 'collecting', 'analyzing', 'indexing', 'cancelling'];
const stageCapability: Record<'collect' | 'analyze', 'collect' | 'analyze'> = { collect: 'collect', analyze: 'analyze' };

type JobInput = ReturnType<typeof intelJobInputSchema.parse>;

@Injectable()
export class IntelService {
  private readonly logger = new Logger(IntelService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly redis: RedisService,
    private readonly mcp: IntelMcpClient,
    private readonly notifications: NotificationsService,
  ) {}

  async agents(user: AuthUser, workspaceId: string, refresh: boolean, requestId?: string) {
    this.assertEnabled();
    const { role } = await this.access.assertWorkspace(user.id, workspaceId);
    if (refresh && !hasRole(role, 'admin')) throw Errors.forbidden('Hanya Admin/Owner yang dapat memaksa refresh agent');
    const profiles = await this.cachedMcp('intel:agents', refresh, () =>
      this.mcp.call('intel_agents_list', {}, agentsListSchema, requestId),
    );
    const localAgents = await this.prisma.agents.findMany({
      where: { workspace_id: workspaceId, is_active: true, deleted_at: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, mcp_agent_key: true },
    });
    const profileByKey = new Map(profiles.agents.map((profile) => [profile.agent_key, profile]));
    return redactGatewayKeys({
      data: localAgents.map((agent) => {
        const profile = profileByKey.get(agent.mcp_agent_key);
        return redactGatewayKeys({
          id: agent.id,
          name: agent.name,
          mcp_agent_key: agent.mcp_agent_key,
          ...(profile ? this.profileDto(profile) : { capabilities: [], reason: 'UNKNOWN_AGENT' as const }),
        });
      }),
    });
  }

  async sources(user: AuthUser, workspaceId: string, refresh: boolean, requestId?: string) {
    this.assertEnabled();
    const { role } = await this.access.assertWorkspace(user.id, workspaceId);
    if (refresh && !hasRole(role, 'admin')) throw Errors.forbidden('Hanya Admin/Owner yang dapat memaksa refresh sumber');
    return this.cachedMcp('intel:sources', refresh, () =>
      this.mcp.call('intel_sources_status', { refresh }, sourcesStatusSchema, requestId),
    );
  }

  async stageDefaults(user: AuthUser, workspaceId: string) {
    this.assertEnabled();
    await this.access.assertWorkspace(user.id, workspaceId);
    const rows = await this.prisma.intel_stage_defaults.findMany({
      where: { workspace_id: workspaceId, stage: { in: ['collect', 'analyze'] } },
      include: { agent: { select: { id: true, name: true, mcp_agent_key: true } } },
    });
    return {
      data: Object.fromEntries(rows.map(({ stage, agent }) => [stage, agent])),
    };
  }

  async updateStageDefaults(user: AuthUser, workspaceId: string, raw: unknown, requestId?: string) {
    this.assertEnabled();
    await this.access.assertWorkspace(user.id, workspaceId, 'admin');
    const input = stageDefaultsInputSchema.parse(raw);
    const profiles =
      input.collect || input.analyze
        ? await this.cachedMcp('intel:agents', false, () => this.mcp.call('intel_agents_list', {}, agentsListSchema, requestId))
        : null;
    const selections = Object.entries(input).filter((entry): entry is ['collect' | 'analyze', string] => typeof entry[1] === 'string');
    const selectedAgents = await Promise.all(
      selections.map(async ([stage, agentId]) => {
        const agent = await this.prisma.agents.findFirst({
          where: { id: agentId, workspace_id: workspaceId, is_active: true, deleted_at: null },
        });
        return { stage, agent };
      }),
    );
    const validatedAgents = selectedAgents.map(({ stage, agent }) => {
      if (!agent) throw Errors.validation(`Agent ${stage} tidak aktif di workspace ini`);
      if (profiles) this.assertCapability(agent.mcp_agent_key, stage, profiles.agents);
      return { stage, agent };
    });
    await this.prisma.tx(async (tx) => {
      await Promise.all(
        validatedAgents.map(({ stage, agent }) =>
          tx.intel_stage_defaults.upsert({
            where: { workspace_id_stage: { workspace_id: workspaceId, stage } },
            create: { workspace_id: workspaceId, stage, agent_id: agent.id, updated_by: user.id },
            update: { agent_id: agent.id, updated_by: user.id, updated_at: new Date() },
          }),
        ),
      );
    });
    return this.stageDefaults(user, workspaceId);
  }

  async estimate(user: AuthUser, workspaceId: string, raw: unknown, requestId?: string) {
    this.assertEnabled();
    await this.access.assertWorkspace(user.id, workspaceId, 'member');
    const input = intelJobInputSchema.parse(raw);
    const spec = await this.toMcpSpec(workspaceId, input, requestId);
    return this.mcp.call('intel_job_estimate', { workspace_id: workspaceId, spec }, estimateSchema, requestId);
  }

  async create(user: AuthUser, workspaceId: string, raw: unknown, requestId?: string) {
    this.assertEnabled();
    await this.access.assertWorkspace(user.id, workspaceId, 'member');
    const input = createIntelJobSchema.parse(raw);
    const spec = await this.toMcpSpec(workspaceId, input, requestId);
    if (input.retry_of_job_id) {
      const parent = await this.prisma.intel_jobs.findFirst({
        where: { id: input.retry_of_job_id, workspace_id: workspaceId, deleted_at: null },
      });
      if (!parent) throw Errors.notFound('Job asal tidak ditemukan');
    }
    const jobId = randomUUID();
    const collect = await this.localAgent(workspaceId, input.agents.collect);
    const analyze = await this.localAgent(workspaceId, input.agents.analyze);
    const rows = await this.prisma.intel_jobs.create({
      data: {
        id: jobId,
        workspace_id: workspaceId,
        title: spec.title,
        spec: spec as Prisma.InputJsonValue,
        sources: spec.sources.map((source) => source.type),
        confirm_cost: input.confirm_cost,
        requested_by_name: user.display_name.slice(0, 100),
        created_by: user.id,
        retry_of_job_id: input.retry_of_job_id,
        stages: {
          create: [
            { stage: 'collect', agent_id: collect.id, agent_key: collect.mcp_agent_key },
            { stage: 'analyze', agent_id: analyze.id, agent_key: analyze.mcp_agent_key },
          ],
        },
      },
    });
    const requestedBy = { user_id: user.id, name: user.display_name.slice(0, 100) };
    const mcpInput = jobCreateInputSchema.parse({
      contract_version: '1.2',
      dashboard_job_id: rows.id,
      workspace_id: workspaceId,
      requested_by: requestedBy,
      spec,
      confirm_cost: input.confirm_cost,
    });
    try {
      const accepted = await this.mcp.call('intel_job_create', mcpInput, jobAcceptedSchema, requestId);
      await this.prisma.intel_jobs.update({
        where: { id: rows.id },
        data: { mcp_job_id: accepted.mcp_job_id, estimate: accepted.estimate as Prisma.InputJsonValue },
      });
      return this.get(user, rows.id);
    } catch (error) {
      if (error instanceof AppException) {
        throw new AppException(error.code, error.message, error.getStatus(), { job_id: rows.id, retry_create: true });
      }
      throw error;
    }
  }

  async retryCreate(user: AuthUser, jobId: string, requestId?: string) {
    this.assertEnabled();
    const job = await this.findJob(jobId);
    await this.assertCanModify(user, job.workspace_id, job.created_by);
    if (job.mcp_job_id) return this.get(user, job.id);
    if (!job.created_by) throw Errors.conflict(ErrorCode.BUSINESS_RULE_VIOLATION, 'Job tidak memiliki pembuat untuk retry MCP');
    const spec = jobSpecSchema.parse(job.spec);
    const agents = await this.prisma.intel_job_stages.findMany({ where: { job_id: job.id } });
    const collect = agents.find((stage) => stage.stage === 'collect');
    const analyze = agents.find((stage) => stage.stage === 'analyze');
    if (!collect || !analyze) throw Errors.conflict(ErrorCode.BUSINESS_RULE_VIOLATION, 'Konfigurasi stage job tidak lengkap');
    const accepted = await this.mcp.call(
      'intel_job_create',
      jobCreateInputSchema.parse({
        contract_version: '1.2',
        dashboard_job_id: job.id,
        workspace_id: job.workspace_id,
        requested_by: { user_id: job.created_by, name: job.requested_by_name },
        spec,
        confirm_cost: job.confirm_cost,
      }),
      jobAcceptedSchema,
      requestId,
    );
    await this.prisma.intel_jobs.update({
      where: { id: job.id },
      data: { mcp_job_id: accepted.mcp_job_id, estimate: accepted.estimate as Prisma.InputJsonValue },
    });
    return this.get(user, job.id);
  }

  async list(user: AuthUser, workspaceId: string, rawQuery: unknown) {
    this.assertEnabled();
    await this.access.assertWorkspace(user.id, workspaceId);
    const query = intelJobsQuerySchema.parse(rawQuery);
    const offset = decodeCursor(query.cursor);
    const where: Prisma.intel_jobsWhereInput = { workspace_id: workspaceId, deleted_at: null };
    if (query.status) where.status = query.status;
    if (query.source) where.sources = { has: query.source };
    const rows = await this.prisma.intel_jobs.findMany({
      where,
      include: { stages: true, insight: true },
      orderBy: { created_at: 'desc' },
      skip: offset,
      take: query.limit + 1,
    });
    return redactGatewayKeys(
      toPage(
        rows.map((row) => this.toDto(row)),
        offset,
        query.limit,
      ),
    );
  }

  async get(user: AuthUser, id: string, requestId?: string) {
    this.assertEnabled();
    const job = await this.findJob(id);
    await this.access.assertWorkspace(user.id, job.workspace_id);
    await this.refreshFromMcp(job.id, requestId);
    return this.toDto(await this.findJob(id));
  }

  async refreshFromMcp(jobId: string, requestId?: string): Promise<void> {
    const job = await this.findJob(jobId);
    if (!job.mcp_job_id) return;
    const view = await this.mcp.call(
      'intel_job_get',
      { workspace_id: job.workspace_id, mcp_job_id: job.mcp_job_id },
      jobViewSchema,
      requestId,
    );
    if (view.dashboard_job_id !== job.id) {
      throw new AppException(ErrorCode.MCP_ERROR, 'Respons job MCP tidak cocok dengan job Dashboard', 502);
    }
    await this.syncView(job.id, view, job.started_at, job.finished_at);
    if (view.status === 'completed' || view.status === 'failed') {
      await this.notifyTerminal(job, view.status);
    }
  }

  private async notifyTerminal(job: Awaited<ReturnType<IntelService['findJob']>>, status: 'completed' | 'failed') {
    const effects = new AfterCommit();
    await this.prisma.tx(async (tx) => {
      const claimed = await tx.intel_jobs.updateMany({
        where: { id: job.id, terminal_notified_at: null },
        data: { terminal_notified_at: new Date() },
      });
      if (!claimed.count) return;
      await this.notifications.notify(
        tx,
        {
          recipients: [job.created_by],
          workspaceId: job.workspace_id,
          type: status === 'completed' ? 'intel_job_completed' : 'intel_job_failed',
          title: status === 'completed' ? 'Riset intel selesai' : 'Riset intel gagal',
          body: job.title,
          entityId: job.id,
          actor: { type: 'system', id: null },
        },
        effects,
      );
    });
    await effects.run();
  }

  async cancel(user: AuthUser, jobId: string, requestId?: string) {
    this.assertEnabled();
    const job = await this.findJob(jobId);
    await this.assertCanModify(user, job.workspace_id, job.created_by);
    if (!job.mcp_job_id) throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Job belum terhubung ke MCP');
    await this.prisma.intel_jobs.update({ where: { id: job.id }, data: { status: 'cancelling' } });
    const result = await this.mcp.call(
      'intel_job_cancel',
      { workspace_id: job.workspace_id, mcp_job_id: job.mcp_job_id },
      cancelOutputSchema,
      requestId,
    );
    if (!result.cancelled) {
      await this.prisma.intel_jobs.update({
        where: { id: job.id },
        data: {
          status: result.status,
          finished_at: ['completed', 'failed', 'cancelled'].includes(result.status) ? new Date() : null,
        },
      });
      if (result.status === 'completed') await this.refreshFromMcp(job.id, requestId);
    }
    return { cancelled: result.cancelled, status: result.status };
  }

  async remove(user: AuthUser, jobId: string, requestId?: string) {
    this.assertEnabled();
    const job = await this.findJob(jobId);
    await this.assertCanModify(user, job.workspace_id, job.created_by);
    if (ACTIVE_STATUSES.includes(job.status)) {
      if (job.mcp_job_id) {
        const result = await this.mcp.call(
          'intel_job_cancel',
          { workspace_id: job.workspace_id, mcp_job_id: job.mcp_job_id },
          cancelOutputSchema,
          requestId,
        );
        if (!result.cancelled) {
          await this.prisma.intel_jobs.update({
            where: { id: job.id },
            data: {
              status: result.status,
              finished_at: ['completed', 'failed', 'cancelled'].includes(result.status) ? new Date() : null,
            },
          });
        }
      }
    }
    await this.prisma.intel_jobs.update({ where: { id: job.id }, data: { deleted_at: new Date() } });
  }

  /** Log event webhook job (tab Log, M3_TASK_004); hanya metadata, tanpa payload. */
  async events(user: AuthUser, jobId: string) {
    this.assertEnabled();
    const job = await this.findJob(jobId);
    await this.access.assertWorkspace(user.id, job.workspace_id);
    const rows = await this.prisma.mcp_webhook_events.findMany({
      where: { job_id: jobId },
      orderBy: { received_at: 'asc' },
      take: EVENTS_LIMIT,
      select: { event_id: true, event_type: true, status: true, received_at: true, processed_at: true },
    });
    return { data: rows };
  }

  async items(user: AuthUser, jobId: string, rawQuery: unknown, requestId?: string) {
    this.assertEnabled();
    const { job, query } = await this.getItemsInput(user, jobId, rawQuery);
    return this.fetchItems(job, query, requestId);
  }

  async *exportCsv(user: AuthUser, jobId: string, rawQuery: unknown, requestId?: string): AsyncGenerator<string> {
    const { job, query } = await this.getItemsInput(user, jobId, rawQuery);
    let cursor: string | undefined = query.cursor;
    let exported = 0;
    let columns: string[] | undefined;
    do {
      const page = await this.fetchItems(job, { ...query, limit: 100, cursor }, requestId);
      columns ??= page.cols;
      if (exported === 0) yield `${columns.map(csvCell).join(',')}\r\n`;
      for (const row of page.rows) {
        if (exported >= 20_000) return;
        yield `${columns.map((_, index) => csvCell(row[index])).join(',')}\r\n`;
        exported++;
      }
      cursor = page.next_cursor ?? undefined;
    } while (cursor && exported < 20_000);
  }

  async llmStatus(user: AuthUser, workspaceId: string, rawQuery: unknown, requestId?: string) {
    this.assertEnabled();
    await this.access.assertWorkspace(user.id, workspaceId, 'admin');
    const query = llmStatusQuerySchema.parse(rawQuery);
    const status = await this.mcp.call('intel_llm_status', { range_days: query.range_days }, llmStatusSchema, requestId);
    return redactGatewayKeys({
      ...status,
      agents: status.agents.map((agent) => ({
        ...agent,
        last_error: agent.last_error?.replace(/\blgw_[A-Za-z0-9_-]+\b/g, 'lgw_[REDACTED]') ?? null,
      })),
    });
  }

  private assertEnabled() {
    if (!this.config.isIntelEnabled) throw new AppException(ErrorCode.FEATURE_DISABLED, 'Modul Intel belum diaktifkan', 503);
  }

  private async toMcpSpec(workspaceId: string, input: JobInput, requestId?: string) {
    const [collect, analyze] = await Promise.all([
      this.localAgent(workspaceId, input.agents.collect),
      this.localAgent(workspaceId, input.agents.analyze),
    ]);
    const profiles = await this.cachedMcp('intel:agents', false, () => this.mcp.call('intel_agents_list', {}, agentsListSchema, requestId));
    this.assertCapability(collect.mcp_agent_key, 'collect', profiles.agents);
    this.assertCapability(analyze.mcp_agent_key, 'analyze', profiles.agents);
    assertSourcesSupported(collect.mcp_agent_key, input.spec.sources, profiles.agents);
    return jobSpecSchema.parse({
      ...input.spec,
      stages: {
        collect: { agent_key: collect.mcp_agent_key },
        analyze: { agent_key: analyze.mcp_agent_key, aspects: input.spec.aspects, method: 'auto' },
      },
    });
  }

  private assertCapability(agentKey: string, capability: 'collect' | 'analyze', profiles: AgentInfo[]) {
    const profile = profiles.find((item) => item.agent_key === agentKey);
    if (!profile) throw Errors.business(ErrorCode.UNKNOWN_AGENT, 'Agent tidak dikenal oleh layanan MCP');
    if (!profile.is_active) throw Errors.business(ErrorCode.AGENT_INACTIVE, 'Agent tidak aktif');
    if (!profile.capabilities.includes(stageCapability[capability])) {
      throw Errors.business(ErrorCode.AGENT_NOT_CAPABLE, `Agent tidak memiliki kapabilitas ${capability}`);
    }
  }

  private async localAgent(workspaceId: string, id: string) {
    const agent = await this.prisma.agents.findFirst({
      where: { id, workspace_id: workspaceId, is_active: true, deleted_at: null },
    });
    if (!agent) throw Errors.validation('Agent harus aktif di workspace yang dipilih');
    return agent;
  }

  private async findJob(id: string) {
    const job = await this.prisma.intel_jobs.findFirst({
      where: { id, deleted_at: null },
      include: { stages: true, insight: true },
    });
    if (!job) throw Errors.notFound('Job intel tidak ditemukan');
    return job;
  }

  private async assertCanModify(user: AuthUser, workspaceId: string, createdBy: string | null) {
    const { role } = await this.access.assertWorkspace(user.id, workspaceId, 'member');
    if (!hasRole(role, 'admin') && createdBy !== user.id)
      throw Errors.forbidden('Hanya pembuat job atau Admin/Owner yang dapat melakukan aksi ini');
  }

  private async getItemsInput(user: AuthUser, jobId: string, rawQuery: unknown) {
    this.assertEnabled();
    const job = await this.findJob(jobId);
    await this.access.assertWorkspace(user.id, job.workspace_id);
    if (!job.mcp_job_id) throw Errors.conflict(ErrorCode.JOB_NOT_ACTIVE, 'Job belum tersedia di MCP');
    const query = intelItemsQuerySchema.parse(rawQuery);
    return { job, query };
  }

  private async fetchItems(
    job: { workspace_id: string; mcp_job_id: string | null },
    query: ReturnType<typeof intelItemsQuerySchema.parse>,
    requestId?: string,
  ) {
    const input = {
      workspace_id: job.workspace_id,
      mcp_job_id: job.mcp_job_id,
      filter: { source: query.source, sentiment: query.sentiment, q: query.q },
      order_by: query.order_by,
      limit: query.limit,
      cursor: query.cursor,
    };
    return this.mcp.call('intel_items', input, itemsPageSchema, requestId);
  }

  private async syncView(
    jobId: string,
    view: ReturnType<typeof jobViewSchema.parse>,
    existingStartedAt: Date | null,
    existingFinishedAt: Date | null,
  ) {
    const stageUpdates = view.stages.map((stage) =>
      this.prisma.intel_job_stages.updateMany({
        where: { job_id: jobId, stage: stage.stage },
        data: {
          status: stage.status,
          progress_done: stage.progress.done,
          progress_total: stage.progress.total ?? null,
          started_at: stage.started_at ? new Date(stage.started_at) : undefined,
          finished_at: stage.finished_at ? new Date(stage.finished_at) : undefined,
          error: jsonValue(stage.error),
        },
      }),
    );
    await Promise.all(stageUpdates);
    const result = view.result;
    const status = view.status;
    await this.prisma.intel_jobs.update({
      where: { id: jobId },
      data: {
        status,
        total_items: result?.totals.items,
        items_handle: result?.items_handle,
        items_expire_at: result?.items_expire_at ? new Date(result.items_expire_at) : null,
        cost: view.cost as Prisma.InputJsonValue,
        error: jsonValue(view.error),
        started_at: status === 'queued' ? undefined : (existingStartedAt ?? new Date()),
        finished_at: ['completed', 'failed', 'cancelled'].includes(status) ? (existingFinishedAt ?? new Date()) : null,
        insight_pending: status === 'completed' && !result,
        ...(result
          ? {
              insight: {
                upsert: {
                  create: {
                    summary_md: result.summary_md,
                    recommendations: result.recommendations,
                    sentiment: jsonValue(result.sentiment),
                    trends: result.trends as Prisma.InputJsonValue,
                    volume_by_day: result.volume_by_day as Prisma.InputJsonValue,
                    google_trends: jsonValue(result.google_trends),
                    partial: result.partial,
                    warnings: result.warnings as Prisma.InputJsonValue,
                  },
                  update: {
                    summary_md: result.summary_md,
                    recommendations: result.recommendations,
                    sentiment: jsonValue(result.sentiment),
                    trends: result.trends as Prisma.InputJsonValue,
                    volume_by_day: result.volume_by_day as Prisma.InputJsonValue,
                    google_trends: jsonValue(result.google_trends),
                    partial: result.partial,
                    warnings: result.warnings as Prisma.InputJsonValue,
                  },
                },
              },
            }
          : {}),
      },
    });
  }

  private toDto(job: Awaited<ReturnType<IntelService['findJob']>>) {
    return redactGatewayKeys({
      id: job.id,
      workspace_id: job.workspace_id,
      title: job.title,
      status: job.status,
      spec: job.spec,
      sources: job.sources,
      estimate: job.estimate,
      mcp_job_id: job.mcp_job_id,
      total_items: job.total_items,
      items_expire_at: job.items_expire_at,
      cost: job.cost,
      error: job.error,
      retry_of_job_id: job.retry_of_job_id,
      created_by: job.created_by,
      stages: job.stages,
      insight: job.insight,
      created_at: job.created_at,
      started_at: job.started_at,
      finished_at: job.finished_at,
      insight_pending: job.insight_pending,
    });
  }

  private profileDto(profile: AgentInfo) {
    return {
      is_active: profile.is_active,
      capabilities: profile.capabilities,
      toolsets: profile.toolsets,
      route: profile.route,
      run_token_budget: profile.run_token_budget,
      gateway_key: profile.gateway_key,
      ...(!profile.is_active ? { reason: 'AGENT_INACTIVE' as const } : {}),
    };
  }

  private async cachedMcp<T>(key: string, refresh: boolean, load: () => Promise<T>): Promise<T> {
    if (!refresh) {
      try {
        const cached = await this.redis.client.get(key);
        if (cached) return redactGatewayKeys(JSON.parse(cached) as T);
      } catch (error) {
        this.logger.debug({ key, error: (error as Error).message }, 'Cache Intel tidak dapat dibaca');
      }
    }
    const result = await load();
    try {
      await this.redis.client.set(key, JSON.stringify(result), 'EX', CACHE_SECONDS);
    } catch (error) {
      this.logger.debug({ key, error: (error as Error).message }, 'Cache Intel tidak dapat ditulis');
    }
    return redactGatewayKeys(result);
  }
}

/** Toolset MCP yang dibutuhkan tiap tipe sumber (M3_TASK_008 §A; sumber kebenaran: MCP capabilities.py). */
const SOURCE_TOOLSET: Record<IntelSource['type'], string> = { x: 'social', threads: 'social', web: 'web', trends: 'trends' };

/** Agent collect harus punya toolset untuk setiap tipe sumber; MCP memvalidasi ulang saat intel_job_create. */
export function assertSourcesSupported(agentKey: string, sources: Pick<IntelSource, 'type'>[], profiles: AgentInfo[]): void {
  const toolsets = new Set(profiles.find((item) => item.agent_key === agentKey)?.toolsets ?? []);
  const missing = sources.map((source) => source.type).filter((type) => !toolsets.has(SOURCE_TOOLSET[type]));
  if (missing.length > 0) {
    throw Errors.business(ErrorCode.AGENT_NOT_CAPABLE, `Agent pengumpul tidak mendukung sumber: ${missing.join(', ')}`, { sources: missing });
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}
