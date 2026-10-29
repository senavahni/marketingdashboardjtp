import { z } from 'zod';
import { uuid } from '../../shared/schemas/common.schema';

export const createProjectSchema = z.object({
  workspace_id: uuid,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
});
export const updateProjectSchema = createProjectSchema
  .omit({ workspace_id: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Minimal satu field diisi');

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
