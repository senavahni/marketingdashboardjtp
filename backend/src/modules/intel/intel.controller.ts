import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiZodBody, ApiZodQuery } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import {
  createIntelJobSchema,
  intelItemsQuerySchema,
  intelJobsQuerySchema,
  intelJobInputSchema,
  llmStatusQuerySchema,
  stageDefaultsInputSchema,
} from './intel.schemas';
import { IntelService } from './intel.service';

const refreshQuerySchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

@ApiTags('Intel')
@ApiBearerAuth()
@Controller()
export class IntelController {
  constructor(private readonly intel: IntelService) {}

  @Get('workspaces/:ws/intel/agents')
  agents(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) workspaceId: string,
    @Query('refresh', new ZodPipe(refreshQuerySchema)) refresh: boolean,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.intel.agents(user, workspaceId, refresh, requestId);
  }

  @Get('workspaces/:ws/intel/mcp-profiles')
  mcpProfiles(@CurrentUser() user: AuthUser, @Param('ws', UuidPipe) workspaceId: string, @Headers('x-request-id') requestId?: string) {
    return this.intel.mcpProfiles(user, workspaceId, requestId);
  }

  @Post('workspaces/:ws/intel/agents/bootstrap')
  @HttpCode(200)
  bootstrapAgents(@CurrentUser() user: AuthUser, @Param('ws', UuidPipe) workspaceId: string, @Headers('x-request-id') requestId?: string) {
    return this.intel.bootstrapAgents(user, workspaceId, requestId);
  }

  @Get('workspaces/:ws/intel/stage-defaults')
  stageDefaults(@CurrentUser() user: AuthUser, @Param('ws', UuidPipe) workspaceId: string) {
    return this.intel.stageDefaults(user, workspaceId);
  }

  @Put('workspaces/:ws/intel/stage-defaults')
  @ApiZodBody(stageDefaultsInputSchema)
  updateStageDefaults(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) workspaceId: string,
    @Body(new ZodPipe(stageDefaultsInputSchema)) body: z.infer<typeof stageDefaultsInputSchema>,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.intel.updateStageDefaults(user, workspaceId, body, requestId);
  }

  @Get('workspaces/:ws/intel/sources')
  sources(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) workspaceId: string,
    @Query('refresh', new ZodPipe(refreshQuerySchema)) refresh: boolean,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.intel.sources(user, workspaceId, refresh, requestId);
  }

  @Post('workspaces/:ws/intel/jobs/estimate')
  @ApiZodBody(intelJobInputSchema)
  estimate(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) workspaceId: string,
    @Body(new ZodPipe(intelJobInputSchema)) body: z.infer<typeof intelJobInputSchema>,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.intel.estimate(user, workspaceId, body, requestId);
  }

  @Post('workspaces/:ws/intel/jobs')
  @ApiZodBody(createIntelJobSchema)
  create(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) workspaceId: string,
    @Body(new ZodPipe(createIntelJobSchema)) body: z.infer<typeof createIntelJobSchema>,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.intel.create(user, workspaceId, body, requestId);
  }

  @Get('workspaces/:ws/intel/jobs')
  @ApiZodQuery(intelJobsQuerySchema)
  list(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) workspaceId: string,
    @Query(new ZodPipe(intelJobsQuerySchema)) query: z.infer<typeof intelJobsQuerySchema>,
  ) {
    return this.intel.list(user, workspaceId, query);
  }

  @Get('workspaces/:ws/intel/llm-status')
  @ApiZodQuery(llmStatusQuerySchema)
  llmStatus(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) workspaceId: string,
    @Query(new ZodPipe(llmStatusQuerySchema)) query: z.infer<typeof llmStatusQuerySchema>,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.intel.llmStatus(user, workspaceId, query, requestId);
  }

  @Post('intel/jobs/:id/retry-create')
  retryCreate(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) jobId: string, @Headers('x-request-id') requestId?: string) {
    return this.intel.retryCreate(user, jobId, requestId);
  }

  @Get('intel/jobs/:id/items/export.csv')
  async exportCsv(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidPipe) jobId: string,
    @Query(new ZodPipe(intelItemsQuerySchema)) query: z.infer<typeof intelItemsQuerySchema>,
    @Headers('x-request-id') requestId: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="intel-${jobId}.csv"`);
    return new StreamableFile(Readable.from(this.intel.exportCsv(user, jobId, query, requestId)));
  }

  @Get('intel/jobs/:id/items')
  @ApiZodQuery(intelItemsQuerySchema)
  items(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidPipe) jobId: string,
    @Query(new ZodPipe(intelItemsQuerySchema)) query: z.infer<typeof intelItemsQuerySchema>,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.intel.items(user, jobId, query, requestId);
  }

  @Get('intel/jobs/:id/events')
  events(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) jobId: string) {
    return this.intel.events(user, jobId);
  }

  @Get('intel/jobs/:id/projection')
  projection(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) jobId: string, @Headers('x-request-id') requestId?: string) {
    return this.intel.projection(user, jobId, requestId);
  }

  @Get('intel/jobs/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) jobId: string, @Headers('x-request-id') requestId?: string) {
    return this.intel.get(user, jobId, requestId);
  }

  @Post('intel/jobs/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) jobId: string, @Headers('x-request-id') requestId?: string) {
    return this.intel.cancel(user, jobId, requestId);
  }

  @Delete('intel/jobs/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) jobId: string, @Headers('x-request-id') requestId?: string) {
    return this.intel.remove(user, jobId, requestId);
  }
}
