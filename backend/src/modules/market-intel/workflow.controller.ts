import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiZodBody, ApiZodQuery } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import { ImportService } from './import.service';
import { KnowledgeService } from './knowledge.service';
import {
  cardDecisionSchema,
  cardUpdateSchema,
  cfTargetsQuerySchema,
  cfUpdateSchema,
  doctrineDecisionSchema,
  importBatchesQuerySchema,
  importRowsQuerySchema,
  kgNeighborsQuerySchema,
  kgSearchQuerySchema,
  knCardsQuerySchema,
  knSearchQuerySchema,
  playbookSaveSchema,
  refParam,
  roleParam,
  rollbackSchema,
  rowDecisionSchema,
  uploadIdParam,
} from './workflow.schemas';

const ref = new ZodPipe(refParam);

/** Import & Contact Finder (DSH-V1-06) + Knowledge Library (DSH-V1-09) — data milik MCP, keputusan manusia. */
@ApiTags('Market Intelligence — Import, Contact Finder & Knowledge')
@ApiBearerAuth()
@Controller('workspaces/:ws')
export class WorkflowController {
  constructor(
    private readonly imports: ImportService,
    private readonly knowledge: KnowledgeService,
  ) {}

  // ---------------------------------------------------------------- import
  @Get('uploads/:uploadId/profile')
  uploadProfile(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('uploadId', new ZodPipe(uploadIdParam)) id: string, @Headers('x-request-id') rid?: string) {
    return this.imports.profile(u, ws, id, rid);
  }

  @Get('ci/imports')
  @ApiZodQuery(importBatchesQuerySchema)
  batches(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown, @Headers('x-request-id') rid?: string) {
    return this.imports.batches(u, ws, q, rid);
  }

  @Get('ci/imports/:batchId')
  batch(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('batchId', ref) id: string, @Headers('x-request-id') rid?: string) {
    return this.imports.batch(u, ws, id, rid);
  }

  @Get('ci/imports/:batchId/rows')
  @ApiZodQuery(importRowsQuerySchema)
  rows(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('batchId', ref) id: string, @Query() q: unknown, @Headers('x-request-id') rid?: string) {
    return this.imports.rows(u, ws, id, q, rid);
  }

  @Post('ci/imports/:batchId/rows/:rowId/decision')
  @HttpCode(200)
  @ApiZodBody(rowDecisionSchema)
  decideRow(
    @CurrentUser() u: AuthUser,
    @Param('ws', UuidPipe) ws: string,
    @Param('batchId', ref) batchId: string,
    @Param('rowId', ref) rowId: string,
    @Body() body: unknown,
    @Headers('x-request-id') rid?: string,
  ) {
    return this.imports.decideRow(u, ws, batchId, rowId, body, rid);
  }

  @Post('ci/imports/:batchId/rollback')
  @HttpCode(200)
  @ApiZodBody(rollbackSchema)
  rollback(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('batchId', ref) id: string, @Body() body: unknown, @Headers('x-request-id') rid?: string) {
    return this.imports.rollback(u, ws, id, body, rid);
  }

  @Get('ci/contact-targets')
  @ApiZodQuery(cfTargetsQuerySchema)
  targets(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown, @Headers('x-request-id') rid?: string) {
    return this.imports.targets(u, ws, q, rid);
  }

  @Patch('ci/contact-targets/:targetId')
  @ApiZodBody(cfUpdateSchema)
  updateTarget(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('targetId', ref) id: string, @Body() body: unknown, @Headers('x-request-id') rid?: string) {
    return this.imports.updateTarget(u, ws, id, body, rid);
  }

  // ---------------------------------------------------------------- knowledge
  @Get('kn/search')
  @ApiZodQuery(knSearchQuerySchema)
  search(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown, @Headers('x-request-id') rid?: string) {
    return this.knowledge.search(u, ws, q, rid);
  }

  @Get('kn/cards')
  @ApiZodQuery(knCardsQuerySchema)
  cards(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown, @Headers('x-request-id') rid?: string) {
    return this.knowledge.cards(u, ws, q, rid);
  }

  @Post('kn/cards/decisions')
  @HttpCode(200)
  @ApiZodBody(cardDecisionSchema)
  decideCards(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Body() body: unknown, @Headers('x-request-id') rid?: string) {
    return this.knowledge.decideCards(u, ws, body, rid);
  }

  @Patch('kn/cards/:cardId')
  @ApiZodBody(cardUpdateSchema)
  updateCard(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('cardId', ref) id: string, @Body() body: unknown, @Headers('x-request-id') rid?: string) {
    return this.knowledge.updateCard(u, ws, id, body, rid);
  }

  @Get('kn/doctrines/:role')
  doctrine(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('role', new ZodPipe(roleParam)) role: 'analyst' | 'strategist' | 'creative', @Headers('x-request-id') rid?: string) {
    return this.knowledge.doctrine(u, ws, role, rid);
  }

  @Post('kn/doctrines/:role/decision')
  @HttpCode(200)
  @ApiZodBody(doctrineDecisionSchema)
  decideDoctrine(
    @CurrentUser() u: AuthUser,
    @Param('ws', UuidPipe) ws: string,
    @Param('role', new ZodPipe(roleParam)) role: 'analyst' | 'strategist' | 'creative',
    @Body() body: unknown,
    @Headers('x-request-id') rid?: string,
  ) {
    return this.knowledge.decideDoctrine(u, ws, role, body, rid);
  }

  @Get('kn/playbooks')
  playbooks(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Headers('x-request-id') rid?: string) {
    return this.knowledge.playbooks(u, ws, rid);
  }

  @Get('kn/playbooks/:id')
  playbook(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('id', ref) id: string, @Headers('x-request-id') rid?: string) {
    return this.knowledge.playbook(u, ws, id, rid);
  }

  @Post('kn/playbooks/:id/versions')
  @ApiZodBody(playbookSaveSchema)
  savePlaybook(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('id', ref) id: string, @Body() body: unknown, @Headers('x-request-id') rid?: string) {
    return this.knowledge.savePlaybook(u, ws, id, body, rid);
  }

  @Post('kn/playbooks/:id/runs')
  runPlaybook(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('id', ref) id: string, @Headers('x-request-id') rid?: string) {
    return this.knowledge.runPlaybook(u, ws, id, rid);
  }

  @Get('kg/graph')
  @ApiZodQuery(kgSearchQuerySchema)
  graph(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown, @Headers('x-request-id') rid?: string) {
    return this.knowledge.graph(u, ws, q, rid);
  }

  @Get('kg/nodes/:nodeId/neighbors')
  @ApiZodQuery(kgNeighborsQuerySchema)
  neighbors(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('nodeId', ref) id: string, @Query() q: unknown, @Headers('x-request-id') rid?: string) {
    return this.knowledge.neighbors(u, ws, id, q, rid);
  }
}
