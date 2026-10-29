import { z } from 'zod';
import { dateString, taskPriority, uuid } from './common.schema';

/** Kontrak MCP v1 (M1_MCP_INTEGRATION). */

export const MCP_EVENT_TYPES = [
  'agent.task.started',
  'agent.status.changed',
  'agent.block.appended',
  'agent.subtask.created',
  'agent.comment.added',
  'agent.task.completed',
  'agent.task.failed',
] as const;
export type McpEventType = (typeof MCP_EVENT_TYPES)[number];

export const webhookEnvelopeSchema = z.object({
  contract_version: z.string().regex(/^1\.\d+$/, 'contract_version tidak didukung (harus 1.x)'),
  event_id: uuid,
  event_type: z.enum(MCP_EVENT_TYPES),
  occurred_at: z.iso.datetime({ offset: true }),
  run_id: uuid,
  agent_id: uuid,
  task_id: uuid.nullable().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>;

const blockInput = z.object({
  id: uuid.optional(),
  parent_block_id: uuid.nullable().optional(),
  block_type: z.string().max(32),
  content_json: z.unknown(),
});

export const eventDataSchemas = {
  'agent.task.started': z.object({}),
  'agent.status.changed': z.object({ status: z.enum(['thinking', 'working']), message: z.string().max(500).optional() }),
  'agent.block.appended': z.object({
    operations: z
      .array(
        z.discriminatedUnion('op', [
          z.object({ op: z.literal('append'), block: blockInput, after_block_id: uuid.nullable().optional() }),
          z.object({
            op: z.literal('update'),
            block: blockInput.extend({ id: uuid, block_type: z.string().max(32).optional() }),
            expected_version: z.number().int().positive().optional(),
          }),
        ]),
      )
      .min(1)
      .max(50),
  }),
  'agent.subtask.created': z.object({
    parent_task_id: uuid.optional(),
    subtasks: z
      .array(
        z.object({
          client_ref: z.string().max(100).optional(),
          title: z.string().trim().min(1).max(500),
          priority: taskPriority.optional(),
          start_date: dateString.nullable().optional(),
          end_date: dateString.nullable().optional(),
          tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
          assign_to_self: z.boolean().default(false),
          initial_blocks: z.array(z.object({ block_type: z.string().max(32), content_json: z.unknown() })).max(50).optional(),
        }),
      )
      .min(1)
      .max(20),
  }),
  'agent.comment.added': z.object({
    content: z.string().trim().min(1).max(10_000),
    parent_comment_id: uuid.nullable().optional(),
    mentions: z.array(z.object({ type: z.enum(['user', 'agent']), id: uuid })).max(50).optional(),
  }),
  'agent.task.completed': z.object({ summary: z.string().max(10_000).nullable().optional() }),
  'agent.task.failed': z.object({
    error_code: z.string().max(100),
    message: z.string().max(2000),
    retryable: z.boolean().optional(),
  }),
} satisfies Record<McpEventType, z.ZodType>;

export type EventData<T extends McpEventType> = z.infer<(typeof eventDataSchemas)[T]>;

// ---- Output tools (Dashboard → MCP) ----
export const dispatchOutputSchema = z.object({ accepted: z.boolean(), mcp_run_id: z.string().max(200).optional() });
export const estimationOutputSchema = z.object({
  start_date: dateString,
  end_date: dateString,
  estimated_days: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  message: z.string().max(2000).optional(),
});
export const cancelOutputSchema = z.object({ cancelled: z.boolean() });
export const toolErrorSchema = z.object({ code: z.string(), message: z.string().optional(), retryable: z.boolean().optional() });

// ---- Agent API ----
export const contextQuerySchema = z.object({
  query: z.string().max(500).default(''),
  scope: z.enum(['project', 'task']).default('project'),
  task_id: uuid.nullable().optional(),
  top_k: z.coerce.number().int().min(1).max(20).default(8),
});
