import { z } from 'zod';
import { uuid } from '../../shared/schemas/common.schema';

const blockType = z.string().min(1).max(32);

const scope = {
  project_id: uuid,
  task_id: uuid.nullable().optional(),
};

export const createBlockSchema = z.object({
  id: uuid.optional(),
  ...scope,
  parent_block_id: uuid.nullable().optional(),
  block_type: blockType,
  content_json: z.unknown().default({}),
  after_block_id: uuid.nullable().optional(),
});

export const updateBlockSchema = z.object({
  block_type: blockType.optional(),
  content_json: z.unknown(),
  expected_version: z.number().int().positive(),
});

export const reorderBlocksSchema = z.object({
  ...scope,
  parent_block_id: uuid.nullable().default(null),
  ordered_ids: z.array(uuid).min(1).max(1000),
});

export const batchBlocksSchema = z.object({
  ...scope,
  operations: z
    .array(
      z.discriminatedUnion('op', [
        z.object({
          op: z.literal('upsert'),
          block: z.object({
            id: uuid,
            parent_block_id: uuid.nullable().default(null),
            block_type: blockType,
            content_json: z.unknown().default({}),
            order_index: z.number().int().min(0).max(1_000_000),
          }),
          expected_version: z.number().int().positive().optional(),
        }),
        z.object({ op: z.literal('delete'), id: uuid, expected_version: z.number().int().positive().optional() }),
      ]),
    )
    .min(1)
    .max(200),
});

export type CreateBlockInput = z.infer<typeof createBlockSchema>;
export type UpdateBlockInput = z.infer<typeof updateBlockSchema>;
export type ReorderBlocksInput = z.infer<typeof reorderBlocksSchema>;
export type BatchBlocksInput = z.infer<typeof batchBlocksSchema>;
