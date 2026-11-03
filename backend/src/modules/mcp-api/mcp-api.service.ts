import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { Actor } from '../../common/types/request.types';
import { PrismaService } from '../../database/prisma.service';
import { document_blocks, tasks } from '../../generated/prisma/client';
import { McpTaskInput } from '../../shared/schemas/mcp-api.schema';
import { validateBlockContent } from '../../shared/schemas/block.schema';
import { AfterCommit } from '../../utils/helpers/after-commit';
import { decodeCursor, toPage } from '../../utils/helpers/pagination.util';
import { BlocksService, BlockOperation } from '../blocks/blocks.service';
import { EntityContext, CommentsService } from '../comments/comments.service';
import { ActivityService } from '../activity/activity.service';
import { ProjectsService } from '../projects/projects.service';
import { RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { TasksService } from '../tasks/tasks.service';
import { TaskReaderService } from '../tasks/task-reader.service';
import { TimelineService } from '../timeline/timeline.service';
import {
  mcpBlockOpsSchema,
  mcpCommentSchema,
  mcpCreateProjectSchema,
  mcpMoveTaskSchema,
  mcpProjectQuerySchema,
  mcpRescheduleSchema,
  mcpTaskQuerySchema,
  mcpUpdateTaskSchema,
} from '../../shared/schemas/mcp-api.schema';
import { z } from 'zod';

export interface McpAgent {
  id: string;
  workspace_id: string;
  name: string;
  handle: string;
}

@Injectable()
export class McpApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
    private readonly projects: ProjectsService,
    private readonly tasks: TasksService,
    private readonly reader: TaskReaderService,
    private readonly timeline: TimelineService,
    private readonly blocks: BlocksService,
    private readonly comments: CommentsService,
  ) {}

  private actor(agent: McpAgent): Actor {
    return { type: 'agent', id: agent.id, name: agent.name };
  }

  private async project(agent: McpAgent, projectId: string) {
    const project = await this.prisma.projects.findFirst({
      where: { id: projectId, workspace_id: agent.workspace_id, deleted_at: null },
    });
    if (!project) throw Errors.notFound('Project tidak ditemukan');
    return project;
  }

  private async task(agent: McpAgent, taskId: string): Promise<tasks> {
    const task = await this.prisma.tasks.findFirst({
      where: {
        id: taskId,
        deleted_at: null,
        project: { workspace_id: agent.workspace_id, deleted_at: null },
      },
    });
    if (!task) throw Errors.notFound('Task tidak ditemukan');
    return task;
  }

  async listProjects(
    agent: McpAgent,
    workspaceId: string,
    query: z.infer<typeof mcpProjectQuerySchema>,
  ) {
    if (workspaceId !== agent.workspace_id) throw Errors.notFound('Workspace tidak ditemukan');
    const offset = decodeCursor(query.cursor);
    const rows = await this.prisma.projects.findMany({
      where: {
        workspace_id: agent.workspace_id,
        deleted_at: null,
        ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
      },
      select: { id: true, title: true, icon: true, updated_at: true },
      orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
      skip: offset,
      take: query.limit + 1,
    });
    const page = toPage(rows, offset, query.limit);
    return { data: page.data, next_cursor: page.next_cursor };
  }

  async createProject(agent: McpAgent, input: z.infer<typeof mcpCreateProjectSchema>) {
    if (input.workspace_id !== agent.workspace_id) throw Errors.notFound('Workspace tidak ditemukan');
    return this.projects.createAs(this.actor(agent) as { type: 'agent'; id: string; name: string }, input);
  }

  async listTasks(agent: McpAgent, projectId: string, query: z.infer<typeof mcpTaskQuerySchema>) {
    const project = await this.project(agent, projectId);
    const offset = decodeCursor(query.cursor);
    const fields = query.fields?.split(',').map((field) => field.trim()).filter(Boolean);
    const allowed = new Set([
      'id', 'title', 'status', 'priority', 'start_date', 'end_date', 'depth', 'assignee',
      'parent_task_id', 'tags', 'is_milestone',
    ]);
    if (fields?.some((field) => !allowed.has(field))) {
      throw Errors.validation('fields memuat kolom yang tidak didukung');
    }
    const statuses = query.status?.split(',').filter(Boolean);
    const rows = await this.prisma.tasks.findMany({
      where: {
        project_id: project.id,
        deleted_at: null,
        ...(statuses?.length ? { status: { in: statuses as tasks['status'][] } } : {}),
        ...(query.parent_task_id !== undefined ? { parent_task_id: query.parent_task_id } : {}),
        ...(query.assignee === 'none'
          ? { assignee_type: null }
          : query.assignee
            ? { OR: [{ assignee_user_id: query.assignee }, { assignee_agent_id: query.assignee }] }
            : {}),
        ...(query.due_before ? { end_date: { lte: new Date(`${query.due_before}T00:00:00.000Z`) } } : {}),
        ...(query.tag ? { tags: { has: query.tag } } : {}),
      },
      select: { id: true },
      orderBy: [{ order_index: 'asc' }, { created_at: 'asc' }],
      skip: offset,
      take: query.limit + 1,
    });
    const page = toPage(rows, offset, query.limit);
    const dtos = await this.reader.getDtos(page.data.map((row) => row.id));
    const data = fields
      ? dtos.map((task) => Object.fromEntries(Object.entries(task).filter(([key]) => fields.includes(key))))
      : dtos;
    return { data, next_cursor: page.next_cursor };
  }

  async createTasks(agent: McpAgent, projectId: string, inputs: McpTaskInput[]) {
    const project = await this.project(agent, projectId);
    return this.createBatch(agent, project.id, inputs, null);
  }

  async createSubtasks(agent: McpAgent, taskId: string, inputs: McpTaskInput[]) {
    const parent = await this.task(agent, taskId);
    return this.createBatch(agent, parent.project_id, inputs, parent);
  }

  private async createBatch(
    agent: McpAgent,
    projectId: string,
    inputs: McpTaskInput[],
    defaultParent: tasks | null,
  ) {
    const actor = this.actor(agent);
    const effects = new AfterCommit();
    const created = await this.prisma.tx(async (tx) => {
      const results: { input: McpTaskInput; task: tasks }[] = [];
      for (const input of inputs) {
        const parentId = defaultParent?.id ?? input.parent_task_id ?? null;
        const parent = parentId
          ? await tx.tasks.findFirst({
              where: {
                id: parentId,
                project_id: projectId,
                deleted_at: null,
                project: { workspace_id: agent.workspace_id, deleted_at: null },
              },
            })
          : null;
        if (parentId && !parent) throw Errors.notFound('Parent task tidak ditemukan');
        for (const [index, block] of (input.initial_blocks ?? []).entries()) {
          const validation = validateBlockContent(block.block_type, block.content_json);
          if (!validation.ok) {
            throw Errors.validation('Blok awal tidak valid', {
              operation_index: index,
              issues: validation.issues,
            });
          }
        }
        const task = await this.tasks.createInTx(
          tx,
          {
            workspaceId: agent.workspace_id,
            projectId,
            parent,
            title: input.title,
            priority: input.priority,
            assignee: null,
            startDate: input.start_date,
            endDate: input.end_date,
            isMilestone: input.is_milestone,
            tags: input.tags,
            actor,
          },
          effects,
        );
        results.push({ input, task });
      }
      return results;
    });

    for (const item of created) {
      const dto = await this.reader.getDto(item.task.id);
      effects.add(() => this.realtime.toProject(item.task.project_id, RealtimeEvent.TASK_CREATED, { task: dto }, { actor }));
      if (item.input.initial_blocks?.length) {
        const scope = {
          workspaceId: agent.workspace_id,
          projectId,
          taskId: item.task.id,
          title: item.task.title,
        };
        const ops: BlockOperation[] = item.input.initial_blocks.map((block, index) => ({
          op: 'upsert',
          mode: 'insert',
          block: {
            id: randomUUID(),
            block_type: block.block_type,
            content_json: block.content_json,
            order_index: index,
          },
        }));
        await this.blocks.applyAs(actor, scope, ops, null);
      }
    }
    await effects.run();
    return {
      created: created.map(({ input, task }) => ({
        client_ref: input.client_ref ?? null,
        id: task.id,
      })),
    };
  }

  async updateTask(agent: McpAgent, taskId: string, input: z.infer<typeof mcpUpdateTaskSchema>) {
    const task = await this.task(agent, taskId);
    return this.tasks.updateAs(this.actor(agent), task, agent.workspace_id, input, null);
  }

  rejectAssigneeUpdate(): never {
    throw Errors.business(ErrorCode.BUSINESS_RULE_VIOLATION, 'assignee hanya bisa diubah manusia');
  }

  async moveTask(agent: McpAgent, taskId: string, input: z.infer<typeof mcpMoveTaskSchema>) {
    const task = await this.task(agent, taskId);
    if (input.new_parent_task_id) await this.task(agent, input.new_parent_task_id);
    return this.tasks.moveAs(this.actor(agent), task, agent.workspace_id, input.new_parent_task_id ?? null, null, input.before_task_id);
  }

  async reschedule(
    agent: McpAgent,
    taskId: string,
    input: z.infer<typeof mcpRescheduleSchema>,
  ) {
    const task = await this.task(agent, taskId);
    return this.timeline.rescheduleAs(
      this.actor(agent),
      task,
      agent.workspace_id,
      {
        start_date: input.start_date,
        end_date: input.end_date,
        cascade: input.cascade ? 'shift' : 'none',
      },
      null,
    );
  }

  async applyBlockOperations(agent: McpAgent, input: z.infer<typeof mcpBlockOpsSchema>) {
    const project = await this.project(agent, input.target.project_id);
    const taskId = input.target.task_id ?? null;
    let title = project.title;
    if (taskId) {
      const task = await this.task(agent, taskId);
      if (task.project_id !== project.id) throw Errors.notFound('Task tidak ditemukan');
      title = task.title;
    }
    const scope = { workspaceId: agent.workspace_id, projectId: project.id, taskId, title };
    const ops: BlockOperation[] = input.operations.map((operation) => ({
      op: 'upsert',
      mode: 'insert',
      block: {
        id: operation.block.id ?? randomUUID(),
        block_type: operation.block.block_type,
        content_json: operation.block.content_json,
      },
      after_block_id: operation.after_block_id,
    }));
    return this.blocks.applyAs(this.actor(agent), scope, ops, null);
  }

  async createComment(agent: McpAgent, input: z.infer<typeof mcpCommentSchema>) {
    const project = await this.project(agent, input.project_id);
    const ctx: EntityContext = {
      workspaceId: agent.workspace_id,
      projectId: project.id,
      taskId: null,
      title: project.title,
      role: 'member',
    };
    if (input.entity_type === 'task') {
      const task = await this.task(agent, input.entity_id);
      if (task.project_id !== project.id) throw Errors.notFound('Task tidak ditemukan');
      ctx.taskId = task.id;
      ctx.title = task.title;
    } else if (input.entity_type === 'block') {
      const block = await this.prisma.document_blocks.findFirst({
        where: { id: input.entity_id, project_id: project.id, deleted_at: null },
      });
      if (!block) throw Errors.notFound('Blok tidak ditemukan');
      if (block.task_id) {
        const task = await this.task(agent, block.task_id);
        ctx.taskId = task.id;
        ctx.title = task.title;
      }
    } else if (input.entity_id !== project.id) {
      throw Errors.notFound('Project tidak ditemukan');
    }
    return this.comments.createAs(this.actor(agent), ctx, input, null);
  }
}
