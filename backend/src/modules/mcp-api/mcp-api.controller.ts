import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodBody } from '../../common/decorators/api-zod.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { McpAgentGuard } from '../../common/guards/mcp-agent.guard';
import { McpServiceTokenGuard } from '../../common/guards/mcp-service-token.guard';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AppRequest } from '../../common/types/request.types';
import {
  mcpBlockOpsSchema,
  mcpCommentSchema,
  mcpCreateProjectSchema,
  mcpCreateSubtasksSchema,
  mcpCreateTasksSchema,
  mcpMoveTaskSchema,
  mcpProjectQuerySchema,
  mcpRescheduleSchema,
  mcpTaskQuerySchema,
  mcpUpdateTaskSchema,
} from '../../shared/schemas/mcp-api.schema';
import { McpApiService } from './mcp-api.service';

@ApiTags('MCP Service API (contract 1.1)')
@ApiBearerAuth()
@Public()
@RateLimit('mcpApi')
@UseGuards(McpServiceTokenGuard, McpAgentGuard)
@Controller('mcp-api')
export class McpApiController {
  constructor(private readonly api: McpApiService) {}

  @Get('workspaces/:workspaceId/projects')
  projects(
    @Param('workspaceId', UuidPipe) workspaceId: string,
    @Query(new ZodPipe(mcpProjectQuerySchema)) query: z.infer<typeof mcpProjectQuerySchema>,
    @Req() req: AppRequest,
  ) {
    return this.api.listProjects(req.mcpAgent!, workspaceId, query);
  }

  @Post('projects')
  @HttpCode(201)
  @ApiZodBody(mcpCreateProjectSchema)
  createProject(@Body(new ZodPipe(mcpCreateProjectSchema)) body: z.infer<typeof mcpCreateProjectSchema>, @Req() req: AppRequest) {
    return this.api.createProject(req.mcpAgent!, body);
  }

  @Get('projects/:projectId/tasks')
  tasks(
    @Param('projectId', UuidPipe) projectId: string,
    @Query(new ZodPipe(mcpTaskQuerySchema)) query: z.infer<typeof mcpTaskQuerySchema>,
    @Req() req: AppRequest,
  ) {
    return this.api.listTasks(req.mcpAgent!, projectId, query);
  }

  @Post('projects/:projectId/tasks')
  @HttpCode(201)
  @ApiZodBody(mcpCreateTasksSchema)
  createTasks(@Param('projectId', UuidPipe) projectId: string, @Body(new ZodPipe(mcpCreateTasksSchema)) body: z.infer<typeof mcpCreateTasksSchema>, @Req() req: AppRequest) {
    return this.api.createTasks(req.mcpAgent!, projectId, body.tasks);
  }

  @Post('tasks/:taskId/subtasks')
  @HttpCode(201)
  @ApiZodBody(mcpCreateSubtasksSchema)
  createSubtasks(@Param('taskId', UuidPipe) taskId: string, @Body(new ZodPipe(mcpCreateSubtasksSchema)) body: z.infer<typeof mcpCreateSubtasksSchema>, @Req() req: AppRequest) {
    return this.api.createSubtasks(req.mcpAgent!, taskId, body.tasks);
  }

  @Patch('tasks/:taskId')
  @ApiZodBody(mcpUpdateTaskSchema)
  updateTask(@Param('taskId', UuidPipe) taskId: string, @Body() rawBody: unknown, @Req() req: AppRequest) {
    if (typeof rawBody === 'object' && rawBody !== null && 'assignee' in rawBody) {
      return this.api.rejectAssigneeUpdate();
    }
    return this.api.updateTask(req.mcpAgent!, taskId, mcpUpdateTaskSchema.parse(rawBody));
  }

  @Patch('tasks/:taskId/move')
  @ApiZodBody(mcpMoveTaskSchema)
  moveTask(@Param('taskId', UuidPipe) taskId: string, @Body(new ZodPipe(mcpMoveTaskSchema)) body: z.infer<typeof mcpMoveTaskSchema>, @Req() req: AppRequest) {
    return this.api.moveTask(req.mcpAgent!, taskId, body);
  }

  @Patch('tasks/:taskId/reschedule')
  @ApiZodBody(mcpRescheduleSchema)
  reschedule(@Param('taskId', UuidPipe) taskId: string, @Body(new ZodPipe(mcpRescheduleSchema)) body: z.infer<typeof mcpRescheduleSchema>, @Req() req: AppRequest) {
    return this.api.reschedule(req.mcpAgent!, taskId, body);
  }

  @Post('blocks/ops')
  @HttpCode(200)
  @ApiZodBody(mcpBlockOpsSchema)
  blockOps(@Body(new ZodPipe(mcpBlockOpsSchema)) body: z.infer<typeof mcpBlockOpsSchema>, @Req() req: AppRequest) {
    return this.api.applyBlockOperations(req.mcpAgent!, body);
  }

  @Post('comments')
  @HttpCode(201)
  @ApiZodBody(mcpCommentSchema)
  comment(@Body(new ZodPipe(mcpCommentSchema)) body: z.infer<typeof mcpCommentSchema>, @Req() req: AppRequest) {
    return this.api.createComment(req.mcpAgent!, body);
  }
}
