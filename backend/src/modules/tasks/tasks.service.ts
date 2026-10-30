import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '../../common/constants/error-codes';
import { TASK_STATUSES } from '../../common/constants/domain';
import { Errors } from '../../common/exceptions/app.exception';
import { Actor, AuthUser, userActor } from '../../common/types/request.types';
import { PrismaService, Tx } from '../../database/prisma.service';
import { Prisma, task_priority, task_status, tasks } from '../../generated/prisma/client';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { addDays, diffDays, fromDateString, toDateString } from '../../utils/helpers/date.util';
import { decodeCursor, toPage } from '../../utils/helpers/pagination.util';
import { ActivityService } from '../activity/activity.service';
import { AgentRunsService } from '../agent-runs/agent-runs.service';
import { AccessService } from '../core/access.service';
import { RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { ResolvedAssignee, TaskAssignmentService } from './task-assignment.service';
import { subtreeHeight, TaskHierarchy } from './task-hierarchy.repository';
import { TaskReaderService } from './task-reader.service';
import { taskInclude } from './task.mapper';
import { assertMoveDepth, childDepth, normalizeSchedule, uniqueTags } from './task.rules';
import { CreateTaskInput, DuplicateTaskInput, ListTasksQuery, UpdateTaskInput } from './tasks.schemas';

export interface CreateTaskParams {
  workspaceId: string;
  projectId: string;
  parent: Pick<tasks, 'id' | 'depth' | 'project_id'> | null;
  title: string;
  status?: task_status;
  priority?: task_priority;
  assignee: ResolvedAssignee | null;
  startDate?: string | null;
  endDate?: string | null;
  isMilestone?: boolean;
  tags?: string[];
  afterTaskId?: string;
  actor: Actor;
  /** false untuk subtask agent "assign_to_self" agar tidak memicu dispatch baru */
  triggerAssignmentEffects?: boolean;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
    private readonly reader: TaskReaderService,
    private readonly assignment: TaskAssignmentService,
    private readonly runs: AgentRunsService,
  ) {}

  // ================= Create =================

  async create(user: AuthUser, projectId: string, parentTaskId: string | null, input: CreateTaskInput, clientId: string | null) {
    let workspaceId: string;
    let parent: tasks | null = null;
    if (parentTaskId) {
      const acc = await this.access.assertTask(user.id, parentTaskId, 'member');
      workspaceId = acc.workspace.id;
      parent = acc.task;
      projectId = acc.task.project_id;
    } else {
      workspaceId = (await this.access.assertProject(user.id, projectId, 'member')).workspace.id;
    }
    const assignee = (await this.assignment.resolve(workspaceId, input.assignee)) ?? null;
    const actor = userActor(user);
    const effects = new AfterCommit();

    const task = await this.prisma.tx((tx) =>
      this.createInTx(
        tx,
        {
          workspaceId,
          projectId,
          parent,
          title: input.title,
          status: input.status,
          priority: input.priority,
          assignee,
          startDate: input.start_date,
          endDate: input.end_date,
          isMilestone: input.is_milestone,
          tags: input.tags,
          afterTaskId: input.after_task_id,
          actor,
        },
        effects,
      ),
    );
    const dto = await this.reader.getDto(task.id);
    effects.add(() => this.realtime.toProject(projectId, RealtimeEvent.TASK_CREATED, { task: dto }, { actor, originClientId: clientId }));
    await effects.run();
    return dto;
  }

  /** Inti pembuatan task (dipakai API & webhook agent.subtask.created). */
  async createInTx(tx: Tx, p: CreateTaskParams, effects: AfterCommit): Promise<tasks> {
    if (p.parent && p.parent.project_id !== p.projectId) {
      throw Errors.business(ErrorCode.CROSS_PROJECT_PARENT, 'Parent task harus berada di project yang sama');
    }
    const depth = childDepth(p.parent?.depth ?? null);
    const schedule = normalizeSchedule({ start_date: p.startDate ?? null, end_date: p.endDate ?? null, is_milestone: p.isMilestone ?? false });
    const status = p.status ?? 'todo';
    const orderIndex = await this.nextOrderIndex(tx, p.projectId, status, p.afterTaskId);

    const task = await tx.tasks.create({
      data: {
        project_id: p.projectId,
        parent_task_id: p.parent?.id ?? null,
        depth,
        title: p.title,
        status,
        priority: p.priority ?? 'none',
        ...this.assignment.columns(p.assignee),
        start_date: fromDateString(schedule.start_date),
        end_date: fromDateString(schedule.end_date),
        is_milestone: schedule.is_milestone,
        tags: uniqueTags(p.tags) ?? [],
        order_index: orderIndex,
        created_by_type: p.actor.type,
        created_by_id: p.actor.id,
        completed_at: status === 'done' ? new Date() : null,
      },
    });
    await this.activity.log(
      tx,
      {
        workspaceId: p.workspaceId,
        projectId: p.projectId,
        entityType: 'task',
        entityId: task.id,
        action: 'task.created',
        actor: p.actor,
        metadata: { title: task.title, parent_task_id: task.parent_task_id },
      },
      effects,
    );
    if (p.assignee && p.triggerAssignmentEffects !== false) {
      await this.assignment.afterChange(tx, { workspaceId: p.workspaceId, actor: p.actor }, null, task, p.assignee, effects);
    }
    return task;
  }

  private async nextOrderIndex(tx: Tx, projectId: string, status: task_status, afterTaskId?: string): Promise<number> {
    if (afterTaskId) {
      const after = await tx.tasks.findFirst({ where: { id: afterTaskId, project_id: projectId, deleted_at: null } });
      if (!after) throw Errors.validation('after_task_id tidak ditemukan di project ini', { field: 'after_task_id' });
      if (after.status === status) {
        await tx.tasks.updateMany({
          where: { project_id: projectId, status, deleted_at: null, order_index: { gt: after.order_index } },
          data: { order_index: { increment: 1 } },
        });
        return after.order_index + 1;
      }
    }
    const max = await tx.tasks.aggregate({ where: { project_id: projectId, status, deleted_at: null }, _max: { order_index: true } });
    return (max._max.order_index ?? -1) + 1;
  }

  // ================= Read =================

  async list(user: AuthUser, projectId: string, q: ListTasksQuery) {
    await this.access.assertProject(user.id, projectId);
    const where: Prisma.tasksWhereInput = { project_id: projectId, deleted_at: null };
    if (q.status?.length) where.status = { in: q.status };
    if (q.priority?.length) where.priority = { in: q.priority };
    if (q.tag?.length) where.tags = { hasSome: q.tag };
    if (q.q) where.title = { contains: q.q, mode: 'insensitive' };
    if (q.assignee_type === 'none') where.assignee_type = null;
    else if (q.assignee_type) where.assignee_type = q.assignee_type;
    if (q.assignee_id) {
      const id = q.assignee_id === 'me' ? user.id : q.assignee_id;
      where.OR = [{ assignee_user_id: id }, { assignee_agent_id: id }];
    }

    const desc = q.sort.startsWith('-');
    const field = q.sort.replace(/^-/, '') as 'order_index' | 'start_date' | 'end_date' | 'priority' | 'created_at';
    const dir: Prisma.SortOrder = desc ? 'desc' : 'asc';
    const orderBy: Prisma.tasksOrderByWithRelationInput[] =
      field === 'start_date' || field === 'end_date'
        ? [{ [field]: { sort: dir, nulls: 'last' } }, { order_index: 'asc' }]
        : [{ [field]: dir }, { created_at: 'asc' }];

    if (q.view === 'board') {
      if (!q.include_subtasks) where.parent_task_id = null;
      const rows = await this.prisma.tasks.findMany({ where, include: taskInclude, orderBy: [{ order_index: 'asc' }, { created_at: 'asc' }] });
      const dtos = await this.reader.toDtos(rows);
      return { columns: TASK_STATUSES.map((status) => ({ status, tasks: dtos.filter((t) => t.status === status) })) };
    }

    const offset = decodeCursor(q.cursor);
    const rows = await this.prisma.tasks.findMany({ where, include: taskInclude, orderBy, skip: offset, take: q.limit + 1 });
    const page = toPage(rows, offset, q.limit);
    return { data: await this.reader.toDtos(page.data), next_cursor: page.next_cursor };
  }

  async detail(user: AuthUser, taskId: string) {
    await this.access.assertTask(user.id, taskId);
    const [task, breadcrumbs, children] = await Promise.all([
      this.reader.getDto(taskId),
      TaskHierarchy.ancestors(this.prisma, taskId),
      this.prisma.tasks.findMany({ where: { parent_task_id: taskId, deleted_at: null }, include: taskInclude, orderBy: [{ order_index: 'asc' }, { created_at: 'asc' }] }),
    ]);
    if (!task) throw Errors.notFound('Task tidak ditemukan');
    return { ...task, breadcrumbs: breadcrumbs.map((b) => ({ id: b.id, title: b.title })), subtasks: await this.reader.toDtos(children) };
  }

  // ================= Update =================

  async update(user: AuthUser, taskId: string, input: UpdateTaskInput, clientId: string | null) {
    const { task, workspace } = await this.access.assertTask(user.id, taskId, 'member');
    const actor = userActor(user);
    const nextAssignee = await this.assignment.resolve(workspace.id, input.assignee);
    const assigneeChanged = nextAssignee !== undefined && !TaskAssignmentService.same(task, nextAssignee);

    const schedule = normalizeSchedule({
      start_date: input.start_date !== undefined ? input.start_date : toDateString(task.start_date),
      end_date: input.end_date !== undefined ? input.end_date : toDateString(task.end_date),
      is_milestone: input.is_milestone ?? task.is_milestone,
    });

    const data: Prisma.tasksUncheckedUpdateInput = {};
    const changed: string[] = [];
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const track = (field: string, from: unknown, to: unknown) => {
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changed.push(field);
        changes[field] = { from, to };
      }
    };

    if (input.title !== undefined) track('title', task.title, input.title);
    if (input.priority !== undefined) track('priority', task.priority, input.priority);
    if (input.tags !== undefined) track('tags', task.tags, uniqueTags(input.tags));
    track('is_milestone', task.is_milestone, schedule.is_milestone);
    track('start_date', toDateString(task.start_date), schedule.start_date);
    track('end_date', toDateString(task.end_date), schedule.end_date);
    if (input.status !== undefined) track('status', task.status, input.status);

    for (const f of changed) {
      if (f === 'start_date' || f === 'end_date') data[f] = fromDateString(changes[f].to as string | null);
      else data[f as 'title'] = changes[f].to as never;
    }
    if (changed.includes('status')) {
      const status = input.status as task_status;
      data.completed_at = status === 'done' ? new Date() : null;
      const max = await this.prisma.tasks.aggregate({ where: { project_id: task.project_id, status, deleted_at: null }, _max: { order_index: true } });
      data.order_index = (max._max.order_index ?? -1) + 1;
    }
    if (assigneeChanged) {
      Object.assign(data, this.assignment.columns(nextAssignee ?? null));
      changed.push('assignee');
    }

    if (changed.length === 0) return this.reader.getDto(taskId);

    const effects = new AfterCommit();
    await this.prisma.tx(async (tx) => {
      const updated = await tx.tasks.update({ where: { id: taskId }, data });
      const base = { workspaceId: workspace.id, projectId: task.project_id, entityType: 'task' as const, entityId: taskId, actor };

      if (changes.status) await this.activity.log(tx, { ...base, action: 'task.status_changed', metadata: changes.status }, effects);
      if (changes.start_date || changes.end_date || changes.is_milestone) {
        await this.activity.log(
          tx,
          {
            ...base,
            action: 'task.rescheduled',
            metadata: {
              from: { start_date: toDateString(task.start_date), end_date: toDateString(task.end_date) },
              to: { start_date: schedule.start_date, end_date: schedule.end_date },
              cascade: 'none',
              shifted_count: 0,
            },
          },
          effects,
        );
      }
      const generic = Object.fromEntries(Object.entries(changes).filter(([k]) => ['title', 'priority', 'tags', 'is_milestone'].includes(k)));
      if (Object.keys(generic).length) await this.activity.log(tx, { ...base, action: 'task.updated', metadata: { changes: generic } }, effects);
      if (assigneeChanged) await this.assignment.afterChange(tx, { workspaceId: workspace.id, actor }, task, updated, nextAssignee ?? null, effects);
    });

    const dto = await this.reader.getDto(taskId);
    effects.add(() =>
      this.realtime.toProjectAndTask(task.project_id, taskId, RealtimeEvent.TASK_UPDATED, { task: dto, changed_fields: changed }, { actor, originClientId: clientId }),
    );
    await effects.run();
    return dto;
  }

  // ================= Delete =================

  async remove(user: AuthUser, taskId: string, clientId: string | null): Promise<void> {
    const { task, workspace } = await this.access.assertTask(user.id, taskId, 'member');
    const actor = userActor(user);
    const effects = new AfterCommit();
    const deletedIds = await this.prisma.tx(async (tx) => {
      const nodes = await TaskHierarchy.descendants(tx, taskId);
      const ids = nodes.map((n) => n.id);
      const now = new Date();
      await this.runs.cancelActive(tx, { task_id: { in: ids } }, 'task_deleted', actor, effects);
      await tx.tasks.updateMany({ where: { id: { in: ids } }, data: { deleted_at: now } });
      const blocks = await tx.document_blocks.findMany({ where: { task_id: { in: ids }, deleted_at: null }, select: { id: true } });
      await tx.document_blocks.updateMany({ where: { task_id: { in: ids }, deleted_at: null }, data: { deleted_at: now } });
      await tx.comments.updateMany({
        where: { deleted_at: null, OR: [{ entity_type: 'task', entity_id: { in: ids } }, { entity_type: 'block', entity_id: { in: blocks.map((b) => b.id) } }] },
        data: { deleted_at: now },
      });
      await this.activity.log(
        tx,
        {
          workspaceId: workspace.id,
          projectId: task.project_id,
          entityType: 'task',
          entityId: taskId,
          action: 'task.deleted',
          actor,
          metadata: { title: task.title, deleted_count: ids.length },
        },
        effects,
      );
      return ids;
    });
    effects.add(() =>
      this.realtime.toProjectAndTask(task.project_id, taskId, RealtimeEvent.TASK_DELETED, { task_id: taskId, deleted_ids: deletedIds }, { actor, originClientId: clientId }),
    );
    await effects.run();
  }

  // ================= Duplicate =================

  /**
   * Salin task beserta turunan terpilih ke parent yang sama (tepat setelah aslinya).
   * Salinan selalu berstatus To Do. Assignee AI Agent tidak disalin agar agent tidak otomatis bekerja.
   * Subtask yang parent-nya tidak dipilih ditempel ke leluhur terdekat yang ikut disalin.
   */
  async duplicate(user: AuthUser, taskId: string, input: DuplicateTaskInput, clientId: string | null) {
    const { task, workspace } = await this.access.assertTask(user.id, taskId, 'member');
    const actor = userActor(user);
    const effects = new AfterCommit();
    const rootTitle = (input.title ?? `${task.title} (salinan)`).slice(0, 500);

    const newIds = await this.prisma.tx(async (tx) => {
      // 1. Turunan yang ikut disalin, diurutkan preorder (parent selalu sebelum anaknya)
      const tree = input.subtasks === 'none' ? [] : await TaskHierarchy.descendants(tx, taskId);
      const descIds = tree.map((n) => n.id).filter((id) => id !== taskId);
      if (input.subtasks === 'selected') {
        const known = new Set(descIds);
        if (input.subtask_ids.some((id) => !known.has(id))) throw Errors.validation('Sebagian subtask_ids bukan turunan task ini', { field: 'subtask_ids' });
      }
      const all = descIds.length ? await tx.tasks.findMany({ where: { id: { in: descIds } } }) : [];
      const keep = new Set(input.subtasks === 'all' ? descIds : input.subtasks === 'selected' ? input.subtask_ids : []);
      const byId = new Map(all.map((t) => [t.id, t]));
      const parentOf = (t: tasks): string => {
        let p = t.parent_task_id;
        while (p && p !== taskId && !keep.has(p)) p = byId.get(p)?.parent_task_id ?? null;
        return p ?? taskId;
      };
      const children = new Map<string, tasks[]>();
      for (const t of all) {
        if (!keep.has(t.id)) continue;
        const p = parentOf(t);
        children.set(p, [...(children.get(p) ?? []), t]);
      }
      const byOrder = (a: tasks, b: tasks) => a.order_index - b.order_index || a.created_at.getTime() - b.created_at.getTime();
      const ordered: tasks[] = [];
      const walk = (pid: string) => {
        for (const c of (children.get(pid) ?? []).sort(byOrder)) {
          ordered.push(c);
          walk(c.id);
        }
      };
      walk(taskId);

      // 2. Timeline: sama / digeser agar task utama mulai di start_date / dikosongkan
      let delta = 0;
      if (input.timeline === 'shift' && input.start_date) {
        const anchor = toDateString(task.start_date) ?? ordered.map((t) => toDateString(t.start_date)).filter((d): d is string => !!d).sort()[0];
        if (anchor) delta = diffDays(anchor, input.start_date);
      }
      const move = (d: Date | null) => (d && delta ? fromDateString(addDays(toDateString(d) as string, delta)) : d);
      const schedule = (t: tasks) =>
        input.timeline === 'none'
          ? { start_date: null, end_date: null, is_milestone: false }
          : { start_date: move(t.start_date), end_date: move(t.end_date), is_milestone: t.is_milestone };

      // 3. Assignee: hanya user yang masih anggota aktif non-viewer
      const eligible = new Set<string>();
      if (input.copy_assignee) {
        const userIds = [...new Set([task, ...ordered].map((t) => t.assignee_user_id).filter((id): id is string => !!id))];
        if (userIds.length) {
          const members = await tx.workspace_members.findMany({
            where: { workspace_id: workspace.id, user_id: { in: userIds }, role: { not: 'viewer' }, user: { is_active: true } },
            select: { user_id: true },
          });
          for (const m of members) eligible.add(m.user_id);
        }
      }
      const assignee = (t: tasks) =>
        t.assignee_type === 'user' && t.assignee_user_id && eligible.has(t.assignee_user_id)
          ? { assignee_type: 'user' as const, assignee_user_id: t.assignee_user_id, assignee_agent_id: null }
          : { assignee_type: null, assignee_user_id: null, assignee_agent_id: null };
      const fields = (t: tasks) => ({
        project_id: task.project_id,
        status: 'todo' as const,
        priority: t.priority,
        tags: t.tags,
        created_by_type: actor.type,
        created_by_id: actor.id,
        ...schedule(t),
        ...assignee(t),
      });

      // 4. Simpan: task utama tepat setelah aslinya, turunan di akhir kolom To Do
      const idMap = new Map<string, string>([[taskId, randomUUID()]]);
      const depthOf = new Map<string, number>([[taskId, task.depth]]);
      const rootId = idMap.get(taskId) as string;
      const rootOrder = await this.nextOrderIndex(tx, task.project_id, 'todo', taskId);
      await tx.tasks.create({
        data: { ...fields(task), id: rootId, parent_task_id: task.parent_task_id, depth: task.depth, title: rootTitle, order_index: rootOrder },
      });
      if (ordered.length) {
        const max = await tx.tasks.aggregate({ where: { project_id: task.project_id, status: 'todo', deleted_at: null }, _max: { order_index: true } });
        let next = (max._max.order_index ?? -1) + 1;
        const rows: Prisma.tasksCreateManyInput[] = ordered.map((t) => {
          const parent = parentOf(t);
          const depth = (depthOf.get(parent) as number) + 1;
          const id = randomUUID();
          idMap.set(t.id, id);
          depthOf.set(t.id, depth);
          return { ...fields(t), id, parent_task_id: idMap.get(parent) as string, depth, title: t.title, order_index: next++ };
        });
        await tx.tasks.createMany({ data: rows });
      }

      // 5. Isi dokumen task (block editor), parent blok selalu disimpan lebih dulu
      if (input.copy_content) {
        const blocks = await tx.document_blocks.findMany({ where: { task_id: { in: [...idMap.keys()] }, deleted_at: null } });
        const blockIds = new Map(blocks.map((b) => [b.id, randomUUID()]));
        const sorted: typeof blocks = [];
        const placed = new Set<string>();
        let pending = blocks;
        while (pending.length) {
          const ready = pending.filter((b) => !b.parent_block_id || !blockIds.has(b.parent_block_id) || placed.has(b.parent_block_id));
          if (!ready.length) break;
          for (const b of ready) {
            sorted.push(b);
            placed.add(b.id);
          }
          pending = pending.filter((b) => !placed.has(b.id));
        }
        if (sorted.length) {
          await tx.document_blocks.createMany({
            data: sorted.map((b) => ({
              id: blockIds.get(b.id) as string,
              project_id: task.project_id,
              task_id: idMap.get(b.task_id as string) as string,
              parent_block_id: b.parent_block_id ? (blockIds.get(b.parent_block_id) ?? null) : null,
              block_type: b.block_type,
              content_json: b.content_json as Prisma.InputJsonValue,
              plain_text: b.plain_text,
              order_index: b.order_index,
              last_edited_by_type: actor.type,
              last_edited_by_id: actor.id,
            })),
          });
        }
      }

      await this.activity.log(
        tx,
        {
          workspaceId: workspace.id,
          projectId: task.project_id,
          entityType: 'task',
          entityId: rootId,
          action: 'task.duplicated',
          actor,
          metadata: { title: rootTitle, source_task_id: taskId, source_title: task.title, subtask_count: ordered.length, parent_task_id: task.parent_task_id },
        },
        effects,
      );
      return [...idMap.values()];
    });

    const dtos = await this.reader.getDtos(newIds);
    effects.add(() => {
      for (const dto of dtos) this.realtime.toProject(task.project_id, RealtimeEvent.TASK_CREATED, { task: dto }, { actor, originClientId: clientId });
    });
    await effects.run();
    return { task: dtos.find((d) => d.id === newIds[0]) ?? null, created_count: newIds.length };
  }

  // ================= Move & reorder =================

  async move(user: AuthUser, taskId: string, parentTaskId: string | null, clientId: string | null) {
    const { task, workspace } = await this.access.assertTask(user.id, taskId, 'member');
    const actor = userActor(user);
    if (parentTaskId === task.parent_task_id) return this.reader.getDto(taskId);

    const effects = new AfterCommit();
    const movedIds = await this.prisma.tx(async (tx) => {
      const subtree = await TaskHierarchy.descendants(tx, taskId);
      let newDepth = 1;
      if (parentTaskId) {
        if (subtree.some((n) => n.id === parentTaskId)) {
          throw Errors.business(ErrorCode.CIRCULAR_HIERARCHY, 'Task tidak dapat dipindahkan ke dalam turunannya sendiri');
        }
        const parent = await tx.tasks.findFirst({ where: { id: parentTaskId, deleted_at: null } });
        if (!parent) throw Errors.validation('parent_task_id tidak ditemukan', { field: 'parent_task_id' });
        if (parent.project_id !== task.project_id) {
          throw Errors.business(ErrorCode.CROSS_PROJECT_PARENT, 'Parent task harus berada di project yang sama');
        }
        newDepth = parent.depth + 1;
      }
      assertMoveDepth(newDepth, subtreeHeight(subtree, task.depth));
      const delta = newDepth - task.depth;

      await tx.tasks.update({ where: { id: taskId }, data: { parent_task_id: parentTaskId } });
      if (delta !== 0) {
        await tx.tasks.updateMany({ where: { id: { in: subtree.map((n) => n.id) } }, data: { depth: { increment: delta } } });
      }
      await this.activity.log(
        tx,
        {
          workspaceId: workspace.id,
          projectId: task.project_id,
          entityType: 'task',
          entityId: taskId,
          action: 'task.moved',
          actor,
          metadata: { from_parent_id: task.parent_task_id, to_parent_id: parentTaskId },
        },
        effects,
      );
      return subtree.map((n) => n.id);
    });
    const dtos = await this.reader.getDtos(movedIds);
    effects.add(() => {
      for (const dto of dtos) {
        this.realtime.toProjectAndTask(task.project_id, dto.id, RealtimeEvent.TASK_UPDATED, { task: dto, changed_fields: ['parent_task_id', 'depth'] }, { actor, originClientId: clientId });
      }
    });
    await effects.run();
    return dtos.find((d) => d.id === taskId) ?? null;
  }

  async reorder(user: AuthUser, projectId: string, status: task_status, orderedIds: string[], clientId: string | null) {
    await this.access.assertProject(user.id, projectId, 'member');
    const ids = [...new Set(orderedIds)];
    const found = await this.prisma.tasks.findMany({ where: { id: { in: ids }, project_id: projectId, deleted_at: null }, select: { id: true, status: true } });
    if (found.length !== ids.length) throw Errors.validation('Sebagian task tidak ditemukan di project ini', { field: 'ordered_task_ids' });
    if (found.some((t) => t.status !== status)) throw Errors.validation('Semua task harus berstatus sama dengan kolom', { field: 'status' });

    const values = Prisma.join(ids.map((id, i) => Prisma.sql`(${id}::uuid, ${i}::int)`));
    await this.prisma.$executeRaw`
      UPDATE tasks AS t SET order_index = v.idx, updated_at = now()
      FROM (VALUES ${values}) AS v(id, idx)
      WHERE t.id = v.id AND t.project_id = ${projectId}::uuid`;

    this.realtime.toProject(projectId, RealtimeEvent.TASKS_REORDERED, { status, ordered_task_ids: ids }, { actor: userActor(user), originClientId: clientId });
    return { status, ordered_task_ids: ids };
  }

  // ================= Agent run control =================

  async retryAgentRun(user: AuthUser, taskId: string) {
    const { task, workspace } = await this.access.assertTask(user.id, taskId, 'member');
    if (task.assignee_type !== 'agent' || !task.assignee_agent_id) {
      throw Errors.business(ErrorCode.INVALID_ASSIGNEE, 'Task tidak di-assign ke agent');
    }
    const agent = await this.prisma.agents.findFirst({ where: { id: task.assignee_agent_id, deleted_at: null } });
    if (!agent?.is_active) throw Errors.business(ErrorCode.AGENT_INACTIVE, 'Agent tidak aktif');
    const active = await this.prisma.agent_runs.findFirst({
      where: { task_id: taskId, trigger: 'assignment', status: { in: ['queued', 'dispatched', 'running'] } },
    });
    if (active) throw Errors.conflict(ErrorCode.ALREADY_EXISTS, 'Agent masih mengerjakan task ini');

    const effects = new AfterCommit();
    const run = await this.prisma.tx((tx) =>
      this.runs.createRun(
        tx,
        { workspaceId: workspace.id, projectId: task.project_id, taskId, agentId: agent.id, trigger: 'assignment', dispatchedBy: user.id },
        effects,
      ),
    );
    await effects.run();
    return { run_id: run.id, status: run.status };
  }

  async cancelAgentRun(user: AuthUser, taskId: string) {
    const { task } = await this.access.assertTask(user.id, taskId, 'member');
    const effects = new AfterCommit();
    const count = await this.prisma.tx((tx) => this.runs.cancelActive(tx, { task_id: taskId }, 'user_cancelled', userActor(user), effects));
    await effects.run();
    if (count === 0) throw Errors.conflict(ErrorCode.RUN_NOT_ACTIVE, 'Tidak ada agent yang sedang mengerjakan task ini');
    return { cancelled: count, task_id: task.id };
  }
}
