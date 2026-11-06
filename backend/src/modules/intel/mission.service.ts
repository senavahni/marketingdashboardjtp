import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Errors } from '../../common/exceptions/app.exception';
import { Actor, AuthUser, userActor } from '../../common/types/request.types';
import { PrismaService, Tx } from '../../database/prisma.service';
import { Prisma, agent_missions, mission_status, tasks } from '../../generated/prisma/client';
import {
  CreateMissionInput,
  IntelScheduleInput,
  MISSION_LIMITS,
  MissionPlan,
  missionPlanOutputSchema,
  missionPlanSchema,
  planViolation,
} from '../../shared/schemas/mission.schema';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { toDateString, todayInTimezone } from '../../utils/helpers/date.util';
import { ActivityService } from '../activity/activity.service';
import { BlockOperation, BlocksService } from '../blocks/blocks.service';
import { CommentsService } from '../comments/comments.service';
import { AccessService } from '../core/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { TaskReaderService } from '../tasks/task-reader.service';
import { TasksService } from '../tasks/tasks.service';
import { IntelMcpClient } from './intel-mcp-client.service';
import { MissionExecutorService } from './mission-executor.service';
import {
  IntelStage,
  MISSION_TAG,
  STAGE_TITLE,
  StageEvent,
  executorTag,
  planItemDescription,
  stageTag,
  stageTaskStatus,
  titleIndex,
} from './mission.rules';

// sedikit di atas batas tool MCP (360 s; planner bisa meminta ulang LLM sekali)
const PLAN_TIMEOUT_MS = 380_000;
const AI_PROJECT_ICON = '🤖';
const PLANNING_STALE_MS = 10 * 60_000;
const EXISTING_TASKS_CONTEXT = 100;
const MISSION_INCLUDE = { agent: { select: { id: true, name: true, mcp_agent_key: true } } } as const;

type StageAgent = { stage: IntelStage; agent: { id: string; name: string } };

export interface IntelMissionParams {
  workspaceId: string;
  job: { id: string; title: string };
  schedule: IntelScheduleInput;
  plannerAgentId: string;
  stages: StageAgent[];
  user: AuthUser;
  timezone: string;
}

/** Misi agent (M3_TASK_013): job riset → task induk di Penjadwalan → rencana tindak lanjut oleh agent. */
@Injectable()
export class MissionService {
  private readonly logger = new Logger(MissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly tasks: TasksService,
    private readonly reader: TaskReaderService,
    private readonly blocks: BlocksService,
    private readonly comments: CommentsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly mcp: IntelMcpClient,
    private readonly activity: ActivityService,
    private readonly executor: MissionExecutorService,
  ) {}

  // ================= Pembuatan (bagian dari transaksi job riset) =================

  async createForIntelJobInTx(tx: Tx, p: IntelMissionParams, effects: AfterCommit): Promise<void> {
    const project = p.schedule.project_id
      ? await tx.projects.findFirst({ where: { id: p.schedule.project_id, workspace_id: p.workspaceId, deleted_at: null } })
      : await this.createAiProject(
          tx,
          {
            workspaceId: p.workspaceId,
            plannerAgentId: p.plannerAgentId,
            title: `Riset: ${p.job.title}`,
            description: `Project otomatis dari job riset "${p.job.title}".`,
            metadata: { intel_job_id: p.job.id },
          },
          effects,
        );
    if (!project) throw Errors.validation('Project penjadwalan tidak ditemukan di workspace ini', { field: 'schedule.project_id' });
    const actor = userActor(p.user);
    const today = todayInTimezone(p.timezone);
    const { start_date: start, end_date: end } = p.schedule.period;
    const root = await this.tasks.createInTx(
      tx,
      {
        workspaceId: p.workspaceId,
        projectId: project.id,
        parent: null,
        title: `Riset: ${p.job.title}`,
        priority: 'medium',
        assignee: null,
        startDate: today < start ? today : start,
        endDate: end,
        tags: [MISSION_TAG, 'riset'],
        actor,
      },
      effects,
    );
    const created: tasks[] = [root];
    for (const { stage, agent } of p.stages) {
      created.push(
        await this.tasks.createInTx(
          tx,
          {
            workspaceId: p.workspaceId,
            projectId: project.id,
            parent: root,
            title: STAGE_TITLE[stage],
            priority: 'medium',
            assignee: { type: 'agent', id: agent.id, name: agent.name },
            triggerAssignmentEffects: false,
            startDate: today,
            endDate: today,
            tags: [MISSION_TAG, stageTag(stage)],
            actor,
          },
          effects,
        ),
      );
    }
    await tx.agent_missions.create({
      data: {
        workspace_id: p.workspaceId,
        project_id: project.id,
        agent_id: p.plannerAgentId,
        source: 'intel_job',
        intel_job_id: p.job.id,
        title: p.job.title,
        instruction: `Susun task tindak lanjut dari hasil riset "${p.job.title}".`,
        start_date: new Date(`${start}T00:00:00.000Z`),
        end_date: new Date(`${end}T00:00:00.000Z`),
        approval_mode: p.schedule.approval_mode,
        execution_enabled: p.schedule.execution_enabled,
        max_runs: p.schedule.max_runs,
        budget_usd: p.schedule.budget_usd,
        status: 'waiting_research',
        root_task_id: root.id,
        created_by: p.user.id,
      },
    });
    this.emitCreated(created, actor, effects);
  }

  /** Project khusus misi, dibuat oleh agent planner (bukan user); anggota tetap bisa mengedit. */
  private async createAiProject(
    tx: Tx,
    p: { workspaceId: string; plannerAgentId: string; title: string; description: string; metadata: Record<string, string> },
    effects: AfterCommit,
  ) {
    const planner = await tx.agents.findUniqueOrThrow({ where: { id: p.plannerAgentId }, select: { id: true, name: true } });
    const actor: Actor = { type: 'agent', id: planner.id, name: planner.name };
    const project = await tx.projects.create({
      data: {
        workspace_id: p.workspaceId,
        title: p.title.slice(0, 200),
        description: `${p.description} Task & jadwal disusun ${planner.name}.`,
        icon: AI_PROJECT_ICON,
        created_by: null,
      },
    });
    await this.activity.log(
      tx,
      { workspaceId: p.workspaceId, projectId: project.id, entityType: 'project', entityId: project.id, action: 'project.created', actor, metadata: { title: project.title, ...p.metadata } },
      effects,
    );
    return project;
  }

  // ================= Misi manual: "Perintah ke Agent" (M3_TASK_014 Fase A) =================

  /** Buat misi manual + task induk (dan project AI bila tidak memilih project). Planning dimulai pemanggil. */
  async createManualInTx(
    tx: Tx,
    p: { workspaceId: string; user: AuthUser; plannerAgentId: string; input: CreateMissionInput },
    effects: AfterCommit,
  ): Promise<string> {
    const { input } = p;
    const project = input.project_id
      ? await tx.projects.findFirst({ where: { id: input.project_id, workspace_id: p.workspaceId, deleted_at: null } })
      : await this.createAiProject(
          tx,
          { workspaceId: p.workspaceId, plannerAgentId: p.plannerAgentId, title: `Misi: ${input.title}`, description: `Project misi agent "${input.title}".`, metadata: {} },
          effects,
        );
    if (!project) throw Errors.validation('Project tidak ditemukan di workspace ini', { field: 'project_id' });
    const actor = userActor(p.user);
    const root = await this.tasks.createInTx(
      tx,
      {
        workspaceId: p.workspaceId,
        projectId: project.id,
        parent: null,
        title: `Misi: ${input.title}`,
        priority: 'medium',
        assignee: null,
        startDate: input.period.start_date,
        endDate: input.period.end_date,
        tags: [MISSION_TAG],
        actor,
      },
      effects,
    );
    const instruction = input.expected_outcome ? `${input.instruction}\n\nHasil yang diharapkan: ${input.expected_outcome}` : input.instruction;
    const mission = await tx.agent_missions.create({
      data: {
        workspace_id: p.workspaceId,
        project_id: project.id,
        agent_id: p.plannerAgentId,
        source: 'manual',
        title: input.title,
        instruction,
        start_date: new Date(`${input.period.start_date}T00:00:00.000Z`),
        end_date: new Date(`${input.period.end_date}T00:00:00.000Z`),
        approval_mode: input.approval_mode,
        status: 'planning',
        root_task_id: root.id,
        execution_enabled: input.execution_enabled,
        max_runs: input.max_runs,
        budget_usd: input.budget_usd,
        created_by: p.user.id,
      },
    });
    this.emitCreated([root], actor, effects);
    return mission.id;
  }

  async list(user: AuthUser, workspaceId: string, query: { status?: mission_status; limit: number }) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const rows = await this.prisma.agent_missions.findMany({
      where: { workspace_id: workspaceId, deleted_at: null, ...(query.status ? { status: query.status } : {}) },
      include: MISSION_INCLUDE,
      orderBy: { created_at: 'desc' },
      take: query.limit,
    });
    return { data: rows.map((m) => this.toDto(m)) };
  }

  // ================= Sinkron event job riset =================

  async onStageEvent(jobId: string, stage: IntelStage, event: StageEvent, reason?: string): Promise<void> {
    const mission = await this.prisma.agent_missions.findFirst({ where: { intel_job_id: jobId, deleted_at: null } });
    if (!mission?.root_task_id) return;
    const task = await this.prisma.tasks.findFirst({
      where: { parent_task_id: mission.root_task_id, tags: { has: stageTag(stage) }, deleted_at: null },
      include: { assignee_agent: { select: { id: true, name: true } } },
    });
    if (!task) return;
    const actor: Actor = task.assignee_agent ? { type: 'agent', id: task.assignee_agent.id, name: task.assignee_agent.name } : { type: 'system', id: null };
    const status = stageTaskStatus(event);
    if (status && status !== task.status) await this.tasks.updateAs(actor, task, mission.workspace_id, { status }, null);
    if (event === 'failed' || event === 'cancelled') {
      await this.comment(actor, mission, task, event === 'failed' ? `Tahap gagal: ${reason ?? 'lihat log job riset'}` : 'Job riset dibatalkan.');
    }
  }

  async onJobTerminal(jobId: string, status: 'completed' | 'failed' | 'cancelled'): Promise<void> {
    const mission = await this.prisma.agent_missions.findFirst({ where: { intel_job_id: jobId, deleted_at: null, status: 'waiting_research' } });
    if (!mission) return;
    if (status === 'completed') {
      await this.startPlanning(mission.id);
      return;
    }
    await this.prisma.agent_missions.update({
      where: { id: mission.id },
      data: { status: status === 'failed' ? 'failed' : 'cancelled', error: { code: 'RESEARCH_' + status.toUpperCase(), message: 'Job riset tidak selesai' } },
    });
  }

  // ================= Planning =================

  /** Klaim misi lalu minta rencana ke MCP. Tidak melempar: kegagalan dicatat di misi. */
  async startPlanning(missionId: string): Promise<void> {
    const staleBefore = new Date(Date.now() - PLANNING_STALE_MS);
    const claimed = await this.prisma.agent_missions.updateMany({
      where: {
        id: missionId,
        deleted_at: null,
        OR: [{ status: 'waiting_research' }, { status: 'planning', OR: [{ planning_started_at: null }, { planning_started_at: { lt: staleBefore } }] }],
      },
      data: { status: 'planning', planning_started_at: new Date(), error: Prisma.DbNull },
    });
    if (!claimed.count) return;
    const mission = await this.prisma.agent_missions.findUniqueOrThrow({ where: { id: missionId }, include: MISSION_INCLUDE });
    try {
      const out = await this.mcp.call('intel_mission_plan', await this.planArgs(mission), missionPlanOutputSchema, undefined, PLAN_TIMEOUT_MS);
      const revision = mission.plan_revision + 1;
      await this.prisma.agent_missions.update({
        where: { id: mission.id },
        data: {
          plan: out.plan as Prisma.InputJsonValue,
          plan_revision: revision,
          cost_usd: { increment: out.cost.usd },
          status: mission.approval_mode === 'auto' ? 'planning' : 'awaiting_review',
          planning_started_at: null,
        },
      });
      if (mission.approval_mode === 'auto') await this.materialize(mission.id, revision);
      else await this.notifyReview(mission);
    } catch (error) {
      const err = error as { code?: string; message?: string };
      this.logger.warn({ mission_id: missionId, code: err.code, error: err.message }, 'Planning misi gagal');
      await this.prisma.agent_missions.update({
        where: { id: missionId },
        data: { status: 'failed', planning_started_at: null, error: { code: err.code ?? 'PLAN_FAILED', message: (err.message ?? 'Planning gagal').slice(0, 300) } },
      });
    }
  }

  private async planArgs(mission: agent_missions & { agent: { mcp_agent_key: string } }) {
    const [insight, existing, agents] = await Promise.all([
      mission.intel_job_id ? this.prisma.intel_insights.findUnique({ where: { job_id: mission.intel_job_id } }) : null,
      this.prisma.tasks.findMany({
        where: { project_id: mission.project_id, deleted_at: null, NOT: { tags: { has: MISSION_TAG } } },
        select: { title: true, start_date: true, end_date: true },
        orderBy: { created_at: 'desc' },
        take: EXISTING_TASKS_CONTEXT,
      }),
      this.prisma.agents.findMany({ where: { workspace_id: mission.workspace_id, is_active: true, deleted_at: null }, select: { mcp_agent_key: true } }),
    ]);
    const recommendations = Array.isArray(insight?.recommendations) ? (insight.recommendations as unknown[]).filter((r): r is string => typeof r === 'string') : [];
    return {
      workspace_id: mission.workspace_id,
      mission_id: mission.id,
      agent_key: mission.agent.mcp_agent_key,
      title: mission.title,
      // batas kontrak MCP; perintah + "hasil yang diharapkan" bisa sedikit lebih panjang
      instruction: mission.instruction.slice(0, MISSION_LIMITS.instructionMaxChars),
      period: { start_date: toDateString(mission.start_date), end_date: toDateString(mission.end_date) },
      context: {
        ...(insight?.summary_md ? { insight_md: insight.summary_md.slice(0, 6_000) } : {}),
        recommendations: recommendations.slice(0, 10).map((r) => r.slice(0, 300)),
        existing_tasks: existing.map((t) => ({ title: t.title, start_date: toDateString(t.start_date), end_date: toDateString(t.end_date) })),
      },
      available_agents: [...new Set(agents.map((a) => a.mcp_agent_key))].slice(0, 20),
      ...(mission.feedback ? { feedback: mission.feedback } : {}),
      ...(mission.feedback && mission.plan ? { previous_plan: mission.plan } : {}),
    };
  }

  // ================= Materialisasi =================

  /** Tulis rencana revisi `revision` ke Penjadwalan tepat sekali (idempoten). */
  async materialize(missionId: string, revision: number): Promise<void> {
    const mission = await this.prisma.agent_missions.findUniqueOrThrow({ where: { id: missionId }, include: { agent: true } });
    const plan = missionPlanSchema.parse(mission.plan);
    const violation = planViolation(plan, toDateString(mission.start_date)!, toDateString(mission.end_date)!);
    if (violation) {
      await this.prisma.agent_missions.update({ where: { id: missionId }, data: { status: 'failed', error: { code: 'PLAN_INVALID', message: violation } } });
      return;
    }
    const actor: Actor = { type: 'agent', id: mission.agent.id, name: mission.agent.name };
    const effects = new AfterCommit();
    const created = await this.prisma.tx(async (tx) => {
      const claim = await tx.agent_missions.updateMany({
        where: { id: missionId, plan_revision: revision, OR: [{ materialized_revision: null }, { materialized_revision: { lt: revision } }] },
        data: { materialized_revision: revision, status: 'scheduled', feedback: null },
      });
      if (!claim.count) return null;
      const root = await this.rootTask(tx, mission, actor, effects);
      const rows = await this.createPlanTasks(tx, mission, plan, root, actor, effects);
      // ref rencana → id task: dependensi terstruktur untuk penjadwal eksekusi (Fase B)
      const taskMap = Object.fromEntries(rows.map((r) => [r.ref, r.task.id]));
      await tx.agent_missions.update({ where: { id: missionId }, data: { task_map: taskMap } });
      return rows;
    });
    if (!created) return;
    await effects.run();
    await this.writeDescriptions(mission, plan, created, actor);
    this.emitCreated(created.map((c) => c.task), actor, null);
    if (mission.execution_enabled) void this.executor.tickMission(missionId);
  }

  private async rootTask(tx: Tx, mission: agent_missions, actor: Actor, effects: AfterCommit): Promise<tasks> {
    const existing = mission.root_task_id ? await tx.tasks.findFirst({ where: { id: mission.root_task_id, deleted_at: null } }) : null;
    if (existing) return existing;
    const root = await this.tasks.createInTx(
      tx,
      {
        workspaceId: mission.workspace_id,
        projectId: mission.project_id,
        parent: null,
        title: `Misi: ${mission.title}`,
        priority: 'medium',
        assignee: null,
        startDate: toDateString(mission.start_date),
        endDate: toDateString(mission.end_date),
        tags: [MISSION_TAG],
        actor,
      },
      effects,
    );
    await tx.agent_missions.update({ where: { id: mission.id }, data: { root_task_id: root.id } });
    return root;
  }

  private async createPlanTasks(tx: Tx, mission: agent_missions, plan: MissionPlan, root: tasks, actor: Actor, effects: AfterCommit) {
    const created: { ref: string; task: tasks }[] = [];
    const base = { workspaceId: mission.workspace_id, projectId: mission.project_id, assignee: null, actor };
    for (const item of plan.tasks) {
      const parent = await this.tasks.createInTx(
        tx,
        { ...base, parent: root, title: item.title, priority: item.priority, startDate: item.start_date, endDate: item.end_date, tags: [MISSION_TAG, executorTag(item.executor), ...item.tags] },
        effects,
      );
      created.push({ ref: item.ref, task: parent });
      for (const sub of item.subtasks) {
        const child = await this.tasks.createInTx(
          tx,
          { ...base, parent, title: sub.title, priority: sub.priority, startDate: sub.start_date, endDate: sub.end_date, tags: [MISSION_TAG, executorTag(sub.executor), ...sub.tags] },
          effects,
        );
        created.push({ ref: sub.ref, task: child });
      }
    }
    return created;
  }

  private async writeDescriptions(mission: agent_missions, plan: MissionPlan, created: { ref: string; task: tasks }[], actor: Actor) {
    const titles = titleIndex(plan);
    const itemByRef = new Map(plan.tasks.flatMap((t) => [t, ...t.subtasks]).map((x) => [x.ref, x]));
    for (const { ref, task } of created) {
      const item = itemByRef.get(ref);
      const lines = item ? planItemDescription(item, titles) : [];
      if (!lines.length) continue;
      const ops: BlockOperation[] = lines.map((text, index) => ({
        op: 'upsert',
        mode: 'insert',
        block: { id: randomUUID(), block_type: 'paragraph', content_json: { content: [{ type: 'text', text: text.slice(0, 2_000), styles: {} }] }, order_index: index },
      }));
      try {
        await this.blocks.applyAs(actor, { workspaceId: mission.workspace_id, projectId: mission.project_id, taskId: task.id, title: task.title }, ops, null);
      } catch (error) {
        this.logger.warn({ mission_id: mission.id, task_id: task.id, error: (error as Error).message }, 'Deskripsi task misi gagal ditulis');
      }
    }
  }

  // ================= Aksi user =================

  async get(user: AuthUser, missionId: string) {
    const mission = await this.findMission(missionId);
    await this.access.assertWorkspace(user.id, mission.workspace_id);
    return { ...this.toDto(mission), progress: await this.executor.progress(mission.root_task_id) };
  }

  async forIntelJob(user: AuthUser, jobId: string) {
    const job = await this.prisma.intel_jobs.findFirst({ where: { id: jobId, deleted_at: null }, select: { workspace_id: true } });
    if (!job) throw Errors.notFound('Job intel tidak ditemukan');
    await this.access.assertWorkspace(user.id, job.workspace_id);
    const mission = await this.prisma.agent_missions.findFirst({ where: { intel_job_id: jobId, deleted_at: null }, include: MISSION_INCLUDE });
    return { data: mission ? { ...this.toDto(mission), progress: await this.executor.progress(mission.root_task_id) } : null };
  }

  async approve(user: AuthUser, missionId: string) {
    const mission = await this.findMission(missionId);
    await this.access.assertWorkspace(user.id, mission.workspace_id, 'member');
    this.assertStatus(mission, ['awaiting_review']);
    await this.materialize(mission.id, mission.plan_revision);
    return this.get(user, missionId);
  }

  async revise(user: AuthUser, missionId: string, feedback: string) {
    const mission = await this.findMission(missionId);
    await this.access.assertWorkspace(user.id, mission.workspace_id, 'member');
    this.assertStatus(mission, ['awaiting_review']);
    if (mission.plan_revision > MISSION_LIMITS.maxRevisions) throw Errors.validation(`Revisi maksimal ${MISSION_LIMITS.maxRevisions} kali`);
    await this.prisma.agent_missions.update({ where: { id: missionId }, data: { status: 'planning', feedback, planning_started_at: null } });
    void this.startPlanning(missionId);
    return this.get(user, missionId);
  }

  /**
   * Ulangi planning misi yang gagal (mis. kuota Gateway habis) tanpa membuat job riset baru.
   * Bila job misi gagal tetapi hasil "Ulangi"-nya sudah selesai, misi dipindah ke job ulangan itu.
   */
  async retry(user: AuthUser, missionId: string) {
    const mission = await this.findMission(missionId);
    await this.access.assertWorkspace(user.id, mission.workspace_id, 'member');
    this.assertStatus(mission, ['failed']);
    if (mission.intel_job_id) {
      const job = await this.prisma.intel_jobs.findFirst({ where: { id: mission.intel_job_id }, select: { status: true } });
      if (job?.status !== 'completed') await this.adoptCompletedRetry(mission.intel_job_id, missionId);
    }
    await this.prisma.agent_missions.update({ where: { id: missionId }, data: { status: 'planning', planning_started_at: null, error: Prisma.DbNull } });
    void this.startPlanning(missionId);
    return this.get(user, missionId);
  }

  /** Pindahkan misi ke job "Ulangi" yang sudah selesai dan tandai subtask tahapnya sesuai job tsb. */
  private async adoptCompletedRetry(jobId: string, missionId: string) {
    const retryJob = await this.prisma.intel_jobs.findFirst({
      where: { retry_of_job_id: jobId, status: 'completed', deleted_at: null, mission: null },
      orderBy: { created_at: 'desc' },
      select: { id: true, stages: { select: { stage: true, status: true } } },
    });
    if (!retryJob) throw Errors.validation('Job riset belum selesai; jalankan Ulangi pada job ini lalu coba lagi');
    await this.prisma.agent_missions.update({ where: { id: missionId }, data: { intel_job_id: retryJob.id } });
    for (const { stage, status } of retryJob.stages) {
      if (status === 'completed' || status === 'skipped') await this.onStageEvent(retryJob.id, stage, status);
    }
  }

  /**
   * "Ulangi" job riset: misi job lama yang belum menulis rencana ikut pindah ke job baru
   * (project & task induk dipakai ulang, subtask tahap direset). false bila tidak ada misi.
   */
  async reattachInTx(
    tx: Tx,
    p: { oldJobId: string; newJobId: string; workspaceId: string; user: AuthUser; timezone: string; stages: StageAgent[] },
    effects: AfterCommit,
  ): Promise<boolean> {
    const mission = await tx.agent_missions.findFirst({
      where: { intel_job_id: p.oldJobId, deleted_at: null, materialized_revision: null, status: { in: ['waiting_research', 'planning', 'failed', 'cancelled'] } },
    });
    if (!mission) return false;
    await tx.agent_missions.update({
      where: { id: mission.id },
      data: { intel_job_id: p.newJobId, status: 'waiting_research', error: Prisma.DbNull, planning_started_at: null },
    });
    const root = mission.root_task_id ? await tx.tasks.findFirst({ where: { id: mission.root_task_id, deleted_at: null } }) : null;
    if (!root) return true;
    const existing = await tx.tasks.findMany({
      where: { parent_task_id: root.id, deleted_at: null, tags: { hasSome: p.stages.map((s) => stageTag(s.stage)) } },
      select: { id: true, status: true, tags: true },
    });
    const reset = existing.filter((t) => t.status !== 'todo');
    for (const t of reset) await tx.tasks.update({ where: { id: t.id }, data: { status: 'todo', completed_at: null } });
    const today = todayInTimezone(p.timezone);
    const actor = userActor(p.user);
    const created: tasks[] = [];
    for (const { stage, agent } of p.stages.filter((s) => !existing.some((t) => t.tags.includes(stageTag(s.stage))))) {
      created.push(
        await this.tasks.createInTx(
          tx,
          {
            workspaceId: p.workspaceId,
            projectId: root.project_id,
            parent: root,
            title: STAGE_TITLE[stage],
            priority: 'medium',
            assignee: { type: 'agent', id: agent.id, name: agent.name },
            triggerAssignmentEffects: false,
            startDate: today,
            endDate: today,
            tags: [MISSION_TAG, stageTag(stage)],
            actor,
          },
          effects,
        ),
      );
    }
    this.emitCreated(created, actor, effects);
    effects.add(async () => {
      for (const t of reset) {
        const dto = await this.reader.getDto(t.id);
        this.realtime.toProjectAndTask(root.project_id, t.id, RealtimeEvent.TASK_UPDATED, { task: dto, changed_fields: ['status'] }, { actor });
      }
    });
    return true;
  }

  /** Batalkan misi; run agent yang sedang berjalan dihentikan, task yang sudah ada tetap. */
  async cancel(user: AuthUser, missionId: string) {
    const mission = await this.findMission(missionId);
    await this.access.assertWorkspace(user.id, mission.workspace_id, 'member');
    this.assertStatus(mission, ['waiting_research', 'planning', 'awaiting_review', 'failed', 'scheduled', 'running', 'paused']);
    await this.prisma.agent_missions.update({ where: { id: missionId }, data: { status: 'cancelled', planning_started_at: null } });
    await this.executor.cancelRuns(mission.root_task_id, userActor(user));
    return this.get(user, missionId);
  }

  /** Jeda eksekusi: tidak ada run baru (run yang sedang berjalan dibiarkan selesai). */
  async pause(user: AuthUser, missionId: string) {
    const mission = await this.findMission(missionId);
    await this.access.assertWorkspace(user.id, mission.workspace_id, 'member');
    this.assertStatus(mission, ['scheduled', 'running']);
    await this.prisma.agent_missions.update({ where: { id: missionId }, data: { status: 'paused' } });
    return this.get(user, missionId);
  }

  /** Lanjutkan eksekusi; opsional menambah kuota run (`extra_runs`) dan/atau budget USD (`extra_budget_usd`). */
  async resume(user: AuthUser, missionId: string, extraRuns = 0, extraBudgetUsd = 0) {
    const mission = await this.findMission(missionId);
    await this.access.assertWorkspace(user.id, mission.workspace_id, 'member');
    this.assertStatus(mission, ['paused', 'scheduled', 'running']);
    const maxRuns = Math.min(MISSION_LIMITS.maxRuns, mission.max_runs + extraRuns);
    const budget =
      mission.budget_usd === null ? null : Math.min(MISSION_LIMITS.maxBudgetUsd, Math.round((mission.budget_usd + extraBudgetUsd) * 100) / 100);
    if (budget !== null && budget <= mission.runs_cost_usd) {
      throw Errors.validation(`Budget $${budget} belum melebihi biaya terpakai $${mission.runs_cost_usd.toFixed(4)}; tambah budget dulu`);
    }
    await this.prisma.agent_missions.update({
      where: { id: missionId },
      data: { status: 'scheduled', execution_enabled: true, max_runs: maxRuns, budget_usd: budget, error: Prisma.DbNull },
    });
    void this.executor.tickMission(missionId);
    return this.get(user, missionId);
  }

  /** Pemulihan: misi planning yang macet / menunggu job yang sudah selesai (event terlewat). */
  async recoverStale(): Promise<number> {
    const staleBefore = new Date(Date.now() - PLANNING_STALE_MS);
    const rows = await this.prisma.agent_missions.findMany({
      where: {
        deleted_at: null,
        OR: [{ status: 'planning', planning_started_at: { lt: staleBefore } }, { status: 'waiting_research', intel_job: { status: 'completed' } }],
      },
      select: { id: true },
      take: 10,
    });
    for (const row of rows) await this.startPlanning(row.id);
    return rows.length;
  }

  // ================= Helper =================

  private async findMission(id: string) {
    const mission = await this.prisma.agent_missions.findFirst({ where: { id, deleted_at: null }, include: MISSION_INCLUDE });
    if (!mission) throw Errors.notFound('Misi tidak ditemukan');
    return mission;
  }

  private assertStatus(mission: agent_missions, allowed: mission_status[]) {
    if (!allowed.includes(mission.status)) throw Errors.validation(`Aksi tidak tersedia untuk misi berstatus ${mission.status}`);
  }

  private toDto(m: agent_missions & { agent: { id: string; name: string; mcp_agent_key: string } }) {
    return {
      id: m.id,
      workspace_id: m.workspace_id,
      project_id: m.project_id,
      source: m.source,
      intel_job_id: m.intel_job_id,
      title: m.title,
      instruction: m.instruction,
      start_date: toDateString(m.start_date),
      end_date: toDateString(m.end_date),
      approval_mode: m.approval_mode,
      status: m.status,
      plan: m.plan,
      plan_revision: m.plan_revision,
      revisions_left: Math.max(0, MISSION_LIMITS.maxRevisions + 1 - m.plan_revision),
      root_task_id: m.root_task_id,
      execution_enabled: m.execution_enabled,
      max_runs: m.max_runs,
      runs_dispatched: m.runs_dispatched,
      budget_usd: m.budget_usd,
      runs_cost_usd: m.runs_cost_usd,
      completed_at: m.completed_at,
      cost_usd: m.cost_usd,
      error: m.error,
      agent: m.agent,
      created_at: m.created_at,
      updated_at: m.updated_at,
    };
  }

  private async comment(actor: Actor, mission: agent_missions, task: tasks, content: string) {
    try {
      await this.comments.createAs(
        actor,
        { workspaceId: mission.workspace_id, projectId: task.project_id, taskId: task.id, title: task.title, role: 'member' },
        { entity_type: 'task', entity_id: task.id, content, mentions: [] },
        null,
      );
    } catch (error) {
      this.logger.warn({ mission_id: mission.id, error: (error as Error).message }, 'Komentar misi gagal ditulis');
    }
  }

  private async notifyReview(mission: agent_missions) {
    const effects = new AfterCommit();
    await this.prisma.tx((tx) =>
      this.notifications.notify(
        tx,
        {
          recipients: [mission.created_by],
          workspaceId: mission.workspace_id,
          type: 'mission_plan_ready',
          title: 'Rencana agent siap ditinjau',
          body: mission.title,
          projectId: mission.project_id,
          entityType: mission.root_task_id ? 'task' : null,
          entityId: mission.root_task_id,
          actor: { type: 'system', id: null },
        },
        effects,
      ),
    );
    await effects.run();
  }

  private emitCreated(created: tasks[], actor: Actor, effects: AfterCommit | null) {
    const emit = async () => {
      for (const task of created) {
        const dto = await this.reader.getDto(task.id);
        this.realtime.toProject(task.project_id, RealtimeEvent.TASK_CREATED, { task: dto }, { actor });
      }
    };
    if (effects) effects.add(emit);
    else void emit().catch((error: unknown) => this.logger.error({ error }, 'Gagal memancarkan task misi'));
  }
}
