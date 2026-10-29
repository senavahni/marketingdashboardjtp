import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { AuthUser, userActor } from '../../common/types/request.types';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { diffDays, fromDateString, toDateString, todayInTimezone } from '../../utils/helpers/date.util';
import { ActivityService } from '../activity/activity.service';
import { AccessService } from '../core/access.service';
import { RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { TaskHierarchy } from '../tasks/task-hierarchy.repository';
import { TaskReaderService } from '../tasks/task-reader.service';
import { assigneeDto, taskInclude } from '../tasks/task.mapper';
import { normalizeSchedule } from '../tasks/task.rules';
import { buildTimeline } from './timeline.builder';
import { RescheduleInput } from './timeline.schemas';

@Injectable()
export class TimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
    private readonly reader: TaskReaderService,
  ) {}

  async timeline(user: AuthUser, projectId: string, from?: string, to?: string) {
    const { workspace } = await this.access.assertProject(user.id, projectId);
    const rows = await this.prisma.tasks.findMany({ where: { project_id: projectId, deleted_at: null }, include: taskInclude });
    const result = buildTimeline(
      rows.map((t) => ({
        id: t.id,
        parent_task_id: t.parent_task_id,
        depth: t.depth,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assignee: assigneeDto(t),
        agent_status: t.agent_status,
        start_date: toDateString(t.start_date),
        end_date: toDateString(t.end_date),
        is_milestone: t.is_milestone,
        order_index: t.order_index,
      })),
      { from, to },
    );
    return { project_id: projectId, today: todayInTimezone(workspace.timezone), ...result };
  }

  /** PATCH /tasks/:id/reschedule — cascade "shift" menggeser semua turunan bertanggal sebesar delta hari. */
  async reschedule(user: AuthUser, taskId: string, input: RescheduleInput, clientId: string | null) {
    const { task, workspace } = await this.access.assertTask(user.id, taskId, 'member');
    const actor = userActor(user);
    const schedule = normalizeSchedule({ start_date: input.start_date, end_date: input.end_date, is_milestone: task.is_milestone });
    const oldStart = toDateString(task.start_date);
    const delta = oldStart && schedule.start_date ? diffDays(oldStart, schedule.start_date) : 0;

    const descendants = (await TaskHierarchy.descendants(this.prisma, taskId)).filter((n) => n.id !== taskId);
    const scheduledDescendants = descendants.length
      ? await this.prisma.tasks.findMany({
          where: { id: { in: descendants.map((d) => d.id) }, deleted_at: null, OR: [{ start_date: { not: null } }, { end_date: { not: null } }] },
          select: { id: true },
        })
      : [];

    if (delta !== 0 && scheduledDescendants.length > 0 && !input.cascade) {
      throw Errors.conflict(ErrorCode.CASCADE_DECISION_REQUIRED, 'Task memiliki subtask terjadwal. Pilih cascade "shift" atau "none".', {
        descendant_count: scheduledDescendants.length,
      });
    }
    const shiftIds = input.cascade === 'shift' && delta !== 0 ? scheduledDescendants.map((d) => d.id) : [];

    const effects = new AfterCommit();
    await this.prisma.tx(async (tx) => {
      await tx.tasks.update({
        where: { id: taskId },
        data: { start_date: fromDateString(schedule.start_date), end_date: fromDateString(schedule.end_date) },
      });
      if (shiftIds.length) {
        await tx.$executeRaw`
          UPDATE tasks SET start_date = start_date + ${delta}::int, end_date = end_date + ${delta}::int, updated_at = now()
          WHERE id IN (${Prisma.join(shiftIds.map((id) => Prisma.sql`${id}::uuid`))}) AND deleted_at IS NULL`;
      }
      await this.activity.log(
        tx,
        {
          workspaceId: workspace.id,
          projectId: task.project_id,
          entityType: 'task',
          entityId: taskId,
          action: 'task.rescheduled',
          actor,
          metadata: {
            from: { start_date: oldStart, end_date: toDateString(task.end_date) },
            to: { start_date: schedule.start_date, end_date: schedule.end_date },
            cascade: input.cascade ?? 'none',
            shifted_count: shiftIds.length,
          },
        },
        effects,
      );
    });

    const updated = await this.reader.getDtos([taskId, ...shiftIds]);
    effects.add(() => this.realtime.toProject(task.project_id, RealtimeEvent.TASKS_RESCHEDULED, { tasks: updated }, { actor, originClientId: clientId }));
    await effects.run();
    return { updated, shifted_count: shiftIds.length };
  }
}
