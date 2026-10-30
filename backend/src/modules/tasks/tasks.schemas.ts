import { z } from 'zod';
import { booleanQuery, dateString, multiValue, tag, taskPriority, taskStatus, uuid } from '../../shared/schemas/common.schema';

export const assigneeInput = z.object({ type: z.enum(['user', 'agent']), id: uuid }).nullable();
export type AssigneeInput = z.infer<typeof assigneeInput>;

const taskFields = {
  title: z.string().trim().min(1).max(500),
  status: taskStatus,
  priority: taskPriority,
  assignee: assigneeInput,
  start_date: dateString.nullable(),
  end_date: dateString.nullable(),
  is_milestone: z.boolean(),
  tags: z.array(tag).max(20),
};

export const createTaskSchema = z.object({
  title: taskFields.title,
  status: taskFields.status.optional(),
  priority: taskFields.priority.optional(),
  assignee: taskFields.assignee.optional(),
  start_date: taskFields.start_date.optional(),
  end_date: taskFields.end_date.optional(),
  is_milestone: taskFields.is_milestone.optional(),
  tags: taskFields.tags.optional(),
  after_task_id: uuid.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: taskFields.title.optional(),
    status: taskFields.status.optional(),
    priority: taskFields.priority.optional(),
    assignee: taskFields.assignee.optional(),
    start_date: taskFields.start_date.optional(),
    end_date: taskFields.end_date.optional(),
    is_milestone: taskFields.is_milestone.optional(),
    tags: taskFields.tags.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Minimal satu field diisi');
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const moveTaskSchema = z.object({ parent_task_id: uuid.nullable() });

/** Salin task/subtask beserta (sebagian) turunannya — salinan diletakkan di parent yang sama. */
export const duplicateTaskSchema = z
  .object({
    /** Judul task utama hasil salinan (default: "<judul asli> (salinan)"). Subtask memakai judul aslinya. */
    title: taskFields.title.optional(),
    /** all = semua turunan, selected = hanya subtask_ids, none = task itu saja. */
    subtasks: z.enum(['all', 'selected', 'none']).default('all'),
    subtask_ids: z.array(uuid).max(5000).default([]),
    /** same = tanggal sama, shift = geser agar task utama mulai di start_date, none = tanpa tanggal. */
    timeline: z.enum(['same', 'shift', 'none']).default('same'),
    start_date: dateString.optional(),
    copy_assignee: z.boolean().default(true),
    copy_content: z.boolean().default(true),
  })
  .refine((v) => v.timeline !== 'shift' || !!v.start_date, { message: 'start_date wajib diisi jika timeline = shift', path: ['start_date'] });
export type DuplicateTaskInput = z.infer<typeof duplicateTaskSchema>;

export const reorderTasksSchema = z.object({
  project_id: uuid,
  status: taskStatus,
  ordered_task_ids: z.array(uuid).min(1).max(500),
});

export const TASK_SORTS = ['order_index', 'start_date', 'end_date', 'priority', 'created_at'] as const;

export const listTasksQuery = z.object({
  view: z.enum(['list', 'board']).default('list'),
  include_subtasks: booleanQuery,
  status: multiValue(taskStatus),
  priority: multiValue(taskPriority),
  assignee_type: z.enum(['user', 'agent', 'none']).optional(),
  assignee_id: z.union([z.literal('me'), uuid]).optional(),
  tag: multiValue(tag),
  q: z.string().trim().min(2).max(200).optional(),
  sort: z
    .string()
    .regex(new RegExp(`^-?(${TASK_SORTS.join('|')})$`), `sort harus salah satu: ${TASK_SORTS.join(', ')} (prefix - untuk desc)`)
    .default('order_index'),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
  cursor: z.string().max(200).optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuery>;
