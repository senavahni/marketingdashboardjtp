import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Actor } from '../../common/types/request.types';
import { PrismaService } from '../../database/prisma.service';
import { agent_missions, mission_status } from '../../generated/prisma/client';
import { missionPlanSchema } from '../../shared/schemas/mission.schema';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { toDateString, todayInTimezone } from '../../utils/helpers/date.util';
import { BlockOperation, BlocksService } from '../blocks/blocks.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { ACTIVE_RUN_STATUS_LIST } from '../tasks/task.mapper';
import { TasksService } from '../tasks/tasks.service';
import { ExecTask, MAX_ACTIVE_RUNS_PER_MISSION, dependencyIds, pickRunnable, planComplete } from './mission.rules';

const EXECUTING: mission_status[] = ['scheduled', 'running'];
const CONTEXT_INSTRUCTION_CHARS = 800;
const MAX_MISSIONS_PER_TICK = 50;

export interface MissionProgress {
  total: number;
  done: number;
  agent_total: number;
  agent_done: number;
  agent_running: number;
  agent_failed: number;
}

/**
 * Eksekusi misi (M3_TASK_014 Fase B): task rencana bertanda `eksekutor:agent` yang sudah waktunya
 * di-assign ke agent → run Modul 2 (assignment) mengerjakannya & menandai task `done` saat selesai.
 * Batas: ≤ 2 run aktif per misi, ≤ `max_runs` run per misi, wewenang tulis run = subtree task-nya.
 */
@Injectable()
export class MissionExecutorService {
  private readonly logger = new Logger(MissionExecutorService.name);
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly blocks: BlocksService,
    private readonly runs: AgentRunsService,
  ) {}

  /** Satu putaran penjadwal untuk semua misi yang berjalan (dipanggil sweeper Intel). */
  async tick(): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    try {
      const missions = await this.prisma.agent_missions.findMany({
        where: { deleted_at: null, execution_enabled: true, status: { in: EXECUTING } },
        select: { id: true },
        orderBy: { updated_at: 'asc' },
        take: MAX_MISSIONS_PER_TICK,
      });
      let dispatched = 0;
      for (const { id } of missions) dispatched += await this.tickMission(id);
      return dispatched;
    } finally {
      this.ticking = false;
    }
  }

  /** Jalankan task yang siap untuk satu misi; kembalikan jumlah run baru. Tidak melempar. */
  async tickMission(missionId: string): Promise<number> {
    try {
      return await this.runMission(missionId);
    } catch (error) {
      this.logger.warn({ mission_id: missionId, error: (error as Error).message }, 'Eksekusi misi tertunda');
      return 0;
    }
  }

  async progress(rootTaskId: string | null): Promise<MissionProgress | null> {
    if (!rootTaskId) return null;
    const tasks = await this.missionTasks(rootTaskId);
    const plan = tasks.filter((t) => !t.tags.some((tag) => tag.startsWith('tahap:')));
    const agent = plan.filter((t) => t.tags.includes('eksekutor:agent'));
    return {
      total: plan.length,
      done: plan.filter((t) => t.status === 'done').length,
      agent_total: agent.length,
      agent_done: agent.filter((t) => t.status === 'done').length,
      agent_running: agent.filter((t) => ['queued', 'thinking', 'working'].includes(t.agent_status)).length,
      agent_failed: agent.filter((t) => t.agent_status === 'failed').length,
    };
  }

  private async runMission(missionId: string): Promise<number> {
    const mission = await this.prisma.agent_missions.findFirst({
      where: { id: missionId, deleted_at: null, execution_enabled: true, status: { in: EXECUTING } },
      include: { agent: true, workspace: { select: { timezone: true } } },
    });
    if (!mission?.root_task_id) return 0;
    const root = await this.prisma.tasks.findFirst({
      where: { id: mission.root_task_id, deleted_at: null, project: { deleted_at: null } },
      select: { id: true },
    });
    if (!root) {
      // task induk / project dihapus user → misi tidak bisa dilanjutkan
      await this.prisma.agent_missions.update({
        where: { id: mission.id },
        data: { status: 'cancelled', error: { code: 'ROOT_TASK_DELETED', message: 'Task induk atau project misi dihapus' } },
      });
      return 0;
    }
    const tasks = await this.missionTasks(mission.root_task_id);
    if (planComplete(tasks)) {
      await this.complete(mission);
      return 0;
    }
    const ids = tasks.map((t) => t.id);
    const active = ids.length
      ? await this.prisma.agent_runs.count({ where: { task_id: { in: ids }, status: { in: ACTIVE_RUN_STATUS_LIST } } })
      : 0;
    const slots = Math.min(MAX_ACTIVE_RUNS_PER_MISSION - active, mission.max_runs - mission.runs_dispatched);
    const parsed = missionPlanSchema.safeParse(mission.plan);
    const taskMap = (mission.task_map ?? {}) as Record<string, string>;
    const deps = parsed.success ? dependencyIds(parsed.data, taskMap) : new Map<string, string[]>();
    const picks = pickRunnable(tasks, deps, todayInTimezone(mission.workspace.timezone), slots);
    let dispatched = 0;
    for (const task of picks) {
      if (await this.dispatch(mission, task, tasks, deps, parsed.success ? parsed.data : null, taskMap)) dispatched += 1;
    }
    const next: mission_status = active + dispatched > 0 ? 'running' : 'scheduled';
    if (next !== mission.status) await this.prisma.agent_missions.update({ where: { id: mission.id }, data: { status: next } });
    return dispatched;
  }

  private async dispatch(
    mission: agent_missions & { agent: { id: string; name: string; mcp_agent_key: string } },
    task: ExecTask,
    all: ExecTask[],
    deps: Map<string, string[]>,
    plan: ReturnType<typeof missionPlanSchema.parse> | null,
    taskMap: Record<string, string>,
  ): Promise<boolean> {
    const ref = Object.entries(taskMap).find(([, id]) => id === task.id)?.[0];
    const item = ref && plan ? plan.tasks.flatMap((t) => [t, ...t.subtasks]).find((x) => x.ref === ref) : undefined;
    const agent =
      (item?.agent_key &&
        (await this.prisma.agents.findFirst({
          where: { workspace_id: mission.workspace_id, mcp_agent_key: item.agent_key, is_active: true, deleted_at: null },
          select: { id: true },
        }))) ||
      mission.agent;
    // klaim kuota run lebih dulu agar dua penjadwal paralel tidak melampaui max_runs
    const claim = await this.prisma.agent_missions.updateMany({
      where: { id: mission.id, runs_dispatched: { lt: mission.max_runs }, status: { in: EXECUTING } },
      data: { runs_dispatched: { increment: 1 } },
    });
    if (!claim.count) return false;
    const planner: Actor = { type: 'agent', id: mission.agent.id, name: mission.agent.name };
    const depTitles = (deps.get(task.id) ?? []).map((id) => all.find((t) => t.id === id)?.title).filter(Boolean);
    await this.writeContext(mission, task, planner, depTitles as string[]);
    const actor = await this.dispatcher(mission, planner);
    const fresh = await this.prisma.tasks.findUniqueOrThrow({ where: { id: task.id } });
    await this.tasks.updateAs(actor, fresh, mission.workspace_id, { assignee: { type: 'agent', id: agent.id } }, null);
    return true;
  }

  /** Run Modul 2 membaca blok task: sisipkan konteks misi sekali sebelum dispatch. */
  private async writeContext(mission: agent_missions, task: ExecTask, actor: Actor, depTitles: string[]) {
    const lines = [
      `Konteks misi "${mission.title}": ${mission.instruction.slice(0, CONTEXT_INSTRUCTION_CHARS)}`,
      `Timeline misi ${toDateString(mission.start_date)} s/d ${toDateString(mission.end_date)}. Kerjakan task ini saja dan tulis hasilnya di dokumen task.`,
      ...(depTitles.length ? [`Task sebelumnya yang sudah selesai: ${depTitles.join(', ')}.`] : []),
    ];
    const ops: BlockOperation[] = lines.map((text, index) => ({
      op: 'upsert',
      mode: 'insert',
      block: { id: randomUUID(), block_type: 'paragraph', content_json: { content: [{ type: 'text', text, styles: {} }] }, order_index: 1_000 + index },
    }));
    await this.blocks.applyAs(actor, { workspaceId: mission.workspace_id, projectId: mission.project_id, taskId: task.id, title: task.title }, ops, null);
  }

  /** Assignment atas nama pembuat misi (notifikasi run ke dia); fallback agent planner. */
  private async dispatcher(mission: agent_missions, planner: Actor): Promise<Actor> {
    if (!mission.created_by) return planner;
    const user = await this.prisma.users.findUnique({ where: { id: mission.created_by }, select: { id: true, display_name: true } });
    return user ? { type: 'user', id: user.id, name: user.display_name } : planner;
  }

  private async complete(mission: agent_missions & { agent: { id: string; name: string } }) {
    const updated = await this.prisma.agent_missions.updateMany({
      where: { id: mission.id, status: { in: EXECUTING } },
      data: { status: 'completed', completed_at: new Date() },
    });
    if (!updated.count || !mission.root_task_id) return;
    const root = await this.prisma.tasks.findFirst({ where: { id: mission.root_task_id, deleted_at: null } });
    if (root && root.status !== 'done') {
      const actor: Actor = { type: 'agent', id: mission.agent.id, name: mission.agent.name };
      await this.tasks.updateAs(actor, root, mission.workspace_id, { status: 'done' }, null);
    }
  }

  /** Turunan task induk misi (anak + cucu; MAX_TASK_DEPTH = 3). */
  private async missionTasks(rootId: string): Promise<ExecTask[]> {
    const select = { id: true, parent_task_id: true, title: true, status: true, assignee_type: true, agent_status: true, start_date: true, tags: true } as const;
    const children = await this.prisma.tasks.findMany({ where: { parent_task_id: rootId, deleted_at: null }, select });
    const grandchildren = children.length
      ? await this.prisma.tasks.findMany({ where: { parent_task_id: { in: children.map((c) => c.id) }, deleted_at: null }, select })
      : [];
    return [...children, ...grandchildren].map((t) => ({ ...t, start_date: toDateString(t.start_date) }));
  }

  /** Batalkan run aktif semua task misi (misi dibatalkan). */
  async cancelRuns(rootTaskId: string | null, actor: Actor): Promise<void> {
    if (!rootTaskId) return;
    const ids = (await this.missionTasks(rootTaskId)).map((t) => t.id);
    if (!ids.length) return;
    const effects = new AfterCommit();
    await this.prisma.tx((tx) => this.runs.cancelActive(tx, { task_id: { in: ids } }, 'mission_cancelled', actor, effects));
    await effects.run();
  }
}
