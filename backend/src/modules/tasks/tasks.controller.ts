import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodBody, ApiZodQuery } from '../../common/decorators/api-zod.decorator';
import { ClientId, CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import { createTaskSchema, duplicateTaskSchema, listTasksQuery, moveTaskSchema, reorderTasksSchema, updateTaskSchema } from './tasks.schemas';
import { TasksService } from './tasks.service';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post('projects/:id/tasks')
  @ApiZodBody(createTaskSchema)
  create(
    @CurrentUser() user: AuthUser,
    @ClientId() clientId: string | null,
    @Param('id', UuidPipe) projectId: string,
    @Body(new ZodPipe(createTaskSchema)) body: z.infer<typeof createTaskSchema>,
  ) {
    return this.tasks.create(user, projectId, null, body, clientId);
  }

  @Get('projects/:id/tasks')
  @ApiZodQuery(listTasksQuery)
  list(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) projectId: string, @Query(new ZodPipe(listTasksQuery)) q: z.infer<typeof listTasksQuery>) {
    return this.tasks.list(user, projectId, q);
  }

  // Harus dideklarasikan sebelum 'tasks/:id' agar tidak tertangkap sebagai id
  @Patch('tasks/reorder')
  @ApiZodBody(reorderTasksSchema)
  reorder(@CurrentUser() user: AuthUser, @ClientId() clientId: string | null, @Body(new ZodPipe(reorderTasksSchema)) body: z.infer<typeof reorderTasksSchema>) {
    return this.tasks.reorder(user, body.project_id, body.status, body.ordered_task_ids, clientId);
  }

  @Get('tasks/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.tasks.detail(user, id);
  }

  @Patch('tasks/:id')
  @ApiZodBody(updateTaskSchema)
  update(
    @CurrentUser() user: AuthUser,
    @ClientId() clientId: string | null,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(updateTaskSchema)) body: z.infer<typeof updateTaskSchema>,
  ) {
    return this.tasks.update(user, id, body, clientId);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @ClientId() clientId: string | null, @Param('id', UuidPipe) id: string) {
    await this.tasks.remove(user, id, clientId);
  }

  @Post('tasks/:id/subtasks')
  @ApiZodBody(createTaskSchema)
  createSubtask(
    @CurrentUser() user: AuthUser,
    @ClientId() clientId: string | null,
    @Param('id', UuidPipe) parentId: string,
    @Body(new ZodPipe(createTaskSchema)) body: z.infer<typeof createTaskSchema>,
  ) {
    return this.tasks.create(user, '', parentId, body, clientId);
  }

  @Post('tasks/:id/duplicate')
  @ApiZodBody(duplicateTaskSchema)
  duplicate(
    @CurrentUser() user: AuthUser,
    @ClientId() clientId: string | null,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(duplicateTaskSchema)) body: z.infer<typeof duplicateTaskSchema>,
  ) {
    return this.tasks.duplicate(user, id, body, clientId);
  }

  @Patch('tasks/:id/move')
  @ApiZodBody(moveTaskSchema)
  move(
    @CurrentUser() user: AuthUser,
    @ClientId() clientId: string | null,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(moveTaskSchema)) body: z.infer<typeof moveTaskSchema>,
  ) {
    return this.tasks.move(user, id, body.parent_task_id, clientId);
  }

  @Post('tasks/:id/agent-run/retry')
  retry(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.tasks.retryAgentRun(user, id);
  }

  @Post('tasks/:id/agent-run/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.tasks.cancelAgentRun(user, id);
  }
}
