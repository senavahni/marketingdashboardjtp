import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodBody } from '../../common/decorators/api-zod.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { McpServiceTokenGuard } from '../../common/guards/mcp-service-token.guard';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { contextQuerySchema } from '../../shared/schemas/mcp.schema';
import { AgentApiService } from './agent-api.service';

/** Endpoint untuk MCP Server (Bearer MCP_SERVICE_TOKEN), bukan untuk browser. */
@ApiTags('Agent API (MCP Server)')
@ApiBearerAuth()
@Public()
@RateLimit('agentApi')
@UseGuards(McpServiceTokenGuard)
@Controller('agent-api/runs/:runId')
export class AgentApiController {
  constructor(private readonly api: AgentApiService) {}

  @Get()
  run(@Param('runId', UuidPipe) runId: string) {
    return this.api.run(runId);
  }

  @Get('tasks/:taskId')
  task(@Param('runId', UuidPipe) runId: string, @Param('taskId', UuidPipe) taskId: string) {
    return this.api.task(runId, taskId);
  }

  @Get('project-brief')
  brief(@Param('runId', UuidPipe) runId: string) {
    return this.api.projectBrief(runId);
  }

  @Post('context/query')
  @HttpCode(200)
  @ApiZodBody(contextQuerySchema)
  query(@Param('runId', UuidPipe) runId: string, @Body(new ZodPipe(contextQuerySchema)) body: z.infer<typeof contextQuerySchema>) {
    return this.api.contextQuery(runId, body);
  }
}
