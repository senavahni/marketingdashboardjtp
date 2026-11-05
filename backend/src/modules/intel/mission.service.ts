import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Errors } from '../../common/exceptions/app.exception';
import { Actor, AuthUser, userActor } from '../../common/types/request.types';
import { PrismaService, Tx } from '../../database/prisma.service';
import { Prisma, agent_missions, mission_status, tasks } from '../../generated/prisma/client';
import {
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

const PLAN_TIMEOUT_MS = 200_000;
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
  ) {}

  // ================= Pembuatan (bagian dari transaksi job riset) =================

  async createForIntelJobInTx(tx: Tx, p: IntelMissionParams, effects: AfterCommit): Promise<void> {
    const project = p.schedule.project_id
      ? await tx.projects.findFirst({ where: { id: p.schedule.project_id, workspace_id: p.workspaceId, deleted_at: null } })
      : await this.createAiProject(tx, p, effects);
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
        status: 'waiting_research',
        root_task_id: root.id,
        created_by: p.user.id,
      },
    });
    this.emitCreated(created, actor, effects);
  }

  /** Project khusus job riset ini, dibuat oleh agent planner (bukan user); anggota tetap bisa mengedit. */
  private async createAiProject(tx: Tx, p: IntelMissionParams, effects: AfterCommit) {
    const planner = await tx.agents.findUniqueOrThrow({ where: { id: p.plannerAgentId }, select: { id: true, name: true } });
    const actor: Actor = { type: 'agent', id: planner.id, name: planner.name };
    const project = await tx.projects.create({
      data: {
        workspace_id: p.workspaceId,
        title: `Riset: ${p.job.title}`.slice(0, 200),
        description: `Project otomatis dari job riset "${p.job.title}". Task & jadwal disusun ${planner.name}.`,
        icon: AI_PROJECT_ICON,
        created_by: null,
      },
    });
    await this.activity.log(
      tx,
      { workspaceId: p.workspaceId, projectId: project.id, entityType: 'project', entityId: project.id, action: 'project.created', actor, metadata: { title: project.title, intel_job_id: p.job.id } },
      effects,
    );
    return project;
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
      instruction: mission.instruction,
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
      return this.createPlanTasks(tx, mission, plan, root, actor, effects);
    });
    if (!created) return;
    await effects.run();
    await this.writeDescriptions(mission, plan, created, actor);
    this.emitCreated(created.map((c) => c.task), actor, null);
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
    return this.toDto(mission);
  }

  async forIntelJob(user: AuthUser, jobId: string) {
    const job = await this.prisma.intel_jobs.findFirst({ where: { id: jobId, deleted_at: null }, select: { workspace_id: true } });
    if (!job) throw Errors.notFound('Job intel tidak ditemukan');
    await this.access.assertWorkspace(user.id, job.workspace_id);
    const mission = await this.prisma.agent_missions.findFirst({ where: { intel_job_id: jobId, deleted_at: null }, include: MISSION_INCLUDE });
    return { data: mission ? this.toDto(mission) : null };
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

  /** Ulangi planning misi yang gagal (mis. kuota Gateway habis) tanpa membuat job riset baru. */
  async retry(user: AuthUser, missionId: string) {
    const mission = await this.findMission(missionId);
    await this.access.assertWorkspace(user.id, mission.workspace_id, 'member');
    this.assertStatus(mission, ['failed']);
    if (mission.intel_job_id) {
      const job = await this.prisma.intel_jobs.findFirst({ where: { id: mission.intel_job_id }, select: { status: true } });
      if (job?.status !== 'completed') throw Errors.validation('Job riset belum selesai; planning tidak dapat diulang');
    }
    await this.prisma.agent_missions.update({ where: { id: missionId }, data: { status: 'planning', planning_started_at: null, error: Prisma.DbNull } });
    void this.startPlanning(missionId);
    return this.get(user, missionId);
  }

  async cancel(user: AuthUser, missionId: string) {
    const mission = await this.findMission(missionId);
    await this.access.assertWorkspace(user.id, mission.workspace_id, 'member');
    this.assertStatus(mission, ['waiting_research', 'planning', 'awaiting_review', 'failed']);
    await this.prisma.agent_missions.update({ where: { id: missionId }, data: { status: 'cancelled', planning_started_at: null } });
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
      start_date: toDateString(m.start_date),
      end_date: toDateString(m.end_date),
      approval_mode: m.approval_mode,
      status: m.status,
      plan: m.plan,
      plan_revision: m.plan_revision,
      revisions_left: Math.max(0, MISSION_LIMITS.maxRevisions + 1 - m.plan_revision),
      root_task_id: m.root_task_id,
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
