import { z } from 'zod';
import { dateString, tag, taskPriority, taskStatus, uuid } from './common.schema';

const taskInput = z.object({
  client_ref: z.string().max(100).optional(),
  title: z.string().trim().min(1).max(500),
  parent_task_id: uuid.optional(),
  priority: taskPriority.optional(),
  start_date: dateString.nullable().optional(),
  end_date: dateString.nullable().optional(),
  tags: z.array(tag).max(20).optional(),
  is_milestone: z.boolean().optional(),
  initial_blocks: z.array(z.object({ block_type: z.string().min(1).max(32), content_json: z.unknown() })).max(50).optional(),
}).strict();

export const mcpProjectQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});
export const mcpCreateProjectSchema = z.object({
  workspace_id: uuid,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
}).strict();
export const mcpTaskQuerySchema = z.object({
  status: z.string().optional(),
  parent_task_id: uuid.nullable().optional(),
  assignee: z.string().optional(),
  due_before: dateString.optional(),
  tag: z.string().optional(),
  fields: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});
export const mcpCreateTasksSchema = z.object({ tasks: z.array(taskInput).min(1).max(20) }).strict();
export const mcpCreateSubtasksSchema = z.object({ tasks: z.array(taskInput).min(1).max(20) }).strict();
export const mcpUpdateTaskSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  start_date: dateString.nullable().optional(),
  end_date: dateString.nullable().optional(),
  tags: z.array(tag).max(20).optional(),
  is_milestone: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Minimal satu field diisi');
export const mcpMoveTaskSchema = z.object({
  new_parent_task_id: uuid.nullable().optional(),
  before_task_id: uuid.optional(),
}).strict();
export const mcpRescheduleSchema = z.object({
  start_date: dateString.nullable(),
  end_date: dateString.nullable(),
  cascade: z.boolean().default(false),
}).strict();
export const mcpBlockOpsSchema = z.object({
  target: z.object({ project_id: uuid, task_id: uuid.nullable().optional() }).strict(),
  operations: z.array(z.object({
    op: z.literal('append'),
    after_block_id: uuid.nullable().optional(),
    block: z.object({
      id: uuid.optional(),
      block_type: z.string().min(1).max(32),
      content_json: z.unknown(),
    }).strict(),
  }).strict()).min(1).max(50),
}).strict();
export const mcpCommentSchema = z.object({
  project_id: uuid,
  entity_type: z.enum(['project', 'task', 'block']),
  entity_id: uuid,
  content: z.string().trim().min(1).max(10_000),
  parent_comment_id: uuid.optional(),
  mentions: z.array(z.object({ type: z.enum(['user', 'agent']), id: uuid }).strict()).max(50).default([]),
}).strict();

export type McpTaskInput = z.infer<typeof taskInput>;
