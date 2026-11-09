import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
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
import { Jobs13Service } from './v13/jobs13.service';
import { createJob13Schema, estimateJob13Schema, isJob13Body, jobs13QuerySchema, reviewJob13Schema } from './v13/jobs13.schemas';

const refreshQuerySchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

@ApiTags('Intel')
@ApiBearerAuth()
@Controller()
export class IntelController {
  constructor(
    private readonly intel: IntelService,
    private readonly jobs13: Jobs13Service,
  ) {}

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

  // Kontrak 1.3: body ber-`spec.kind` → Jobs13Service; tanpa kind → job sosial Modul 3 (perilaku lama)
  @Post('workspaces/:ws/intel/jobs/estimate')
  @ApiZodBody(z.union([intelJobInputSchema, estimateJob13Schema]))
  estimate(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) workspaceId: string,
    @Body() body: unknown,
    @Headers('x-request-id') requestId?: string,
  ) {
    if (isJob13Body(body)) return this.jobs13.estimate(user, workspaceId, new ZodPipe(estimateJob13Schema).transform(body), requestId);
    return this.intel.estimate(user, workspaceId, new ZodPipe(intelJobInputSchema).transform(body), requestId);
  }

  @Post('workspaces/:ws/intel/jobs')
  @ApiZodBody(z.union([createIntelJobSchema, createJob13Schema]))
  create(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) workspaceId: string,
    @Body() body: unknown,
    @Headers('x-request-id') requestId?: string,
  ) {
    if (isJob13Body(body)) return this.jobs13.create(user, workspaceId, new ZodPipe(createJob13Schema).transform(body), requestId);
    return this.intel.create(user, workspaceId, new ZodPipe(createIntelJobSchema).transform(body), requestId);
  }

  @Get('workspaces/:ws/intel/jobs')
  @ApiZodQuery(intelJobsQuerySchema)
  @ApiQuery({ name: 'kind', required: false, description: 'Kontrak 1.3: daftar job kind baru (company_discovery, …)' })
  list(@CurrentUser() user: AuthUser, @Param('ws', UuidPipe) workspaceId: string, @Query() query: Record<string, unknown>) {
    if (query.kind !== undefined) return this.jobs13.list(user, workspaceId, new ZodPipe(jobs13QuerySchema).transform(query));
    return this.intel.list(user, workspaceId, new ZodPipe(intelJobsQuerySchema).transform(query));
  }

  @Post('workspaces/:ws/intel/jobs/:id/review')
  @HttpCode(200)
  @ApiZodBody(reviewJob13Schema)
  review(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) workspaceId: string,
    @Param('id', UuidPipe) jobId: string,
    @Body(new ZodPipe(reviewJob13Schema)) body: z.infer<typeof reviewJob13Schema>,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.jobs13.review(user, workspaceId, jobId, body, requestId);
  }

  @Post('workspaces/:ws/intel/jobs/:id/resume')
  @HttpCode(200)
  resume(
    @CurrentUser() user: AuthUser,
    @Param('ws', UuidPipe) workspaceId: string,
    @Param('id', UuidPipe) jobId: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.jobs13.resume(user, workspaceId, jobId, requestId);
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
  async get(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) jobId: string, @Headers('x-request-id') requestId?: string) {
    if (await this.jobs13.kindOf(jobId)) return this.jobs13.get(user, jobId, requestId);
    return this.intel.get(user, jobId, requestId);
  }

  @Post('intel/jobs/:id/cancel')
  @HttpCode(200)
  async cancel(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) jobId: string, @Headers('x-request-id') requestId?: string) {
    if (await this.jobs13.kindOf(jobId)) return this.jobs13.cancel(user, jobId, requestId);
    return this.intel.cancel(user, jobId, requestId);
  }

  @Delete('intel/jobs/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) jobId: string, @Headers('x-request-id') requestId?: string) {
    if (await this.jobs13.kindOf(jobId)) return this.jobs13.remove(user, jobId, requestId);
    return this.intel.remove(user, jobId, requestId);
  }
}
