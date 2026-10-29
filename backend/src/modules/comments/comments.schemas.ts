import { z } from 'zod';
import { uuid } from '../../shared/schemas/common.schema';
import { paginationQuery } from '../../utils/helpers/pagination.util';
import { stripControlChars } from '../../utils/helpers/text.util';

export const commentEntityType = z.enum(['project', 'task', 'block']);
const mentions = z.array(z.object({ type: z.enum(['user', 'agent']), id: uuid })).max(50).default([]);
const content = z.string().transform(stripControlChars).pipe(z.string().trim().min(1, 'Komentar tidak boleh kosong').max(10_000));

export const createCommentSchema = z.object({
  entity_type: commentEntityType,
  entity_id: uuid,
  parent_comment_id: uuid.nullable().optional(),
  content,
  mentions,
});
export const updateCommentSchema = z.object({ content, mentions });
export const listCommentsQuery = paginationQuery(50, 100).extend({ entity_type: commentEntityType, entity_id: uuid });

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type MentionRef = { type: 'user' | 'agent'; id: string };
