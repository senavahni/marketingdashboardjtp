import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiZodBody, ApiZodQuery } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { AuthUser } from '../../common/types/request.types';
import { reviewJob13Schema } from '../intel/v13/jobs13.schemas';
import { ApprovalsService, approvalsQuerySchema } from './approvals.service';
import {
  bulkContentDecisionSchema,
  contentDecisionSchema,
  contentQuerySchema,
  publishContentSchema,
  scheduleContentSchema,
  strategiesQuerySchema,
  updateContentSchema,
} from './content.schemas';
import { ContentService } from './content.service';
import { createOpportunitySchema, opportunitiesQuerySchema, opportunityNoteSchema, updateOpportunitySchema } from './opportunities.schemas';
import { OpportunitiesService } from './opportunities.service';
import { createProductSchema, productsQuerySchema, updateProductSchema } from './products.schemas';
import { ProductsService } from './products.service';

/** Data kurasi manusia v1.0.0 (V1-K3): produk, opportunity, strategi & bank konten, antrean approval. Validasi Zod di service. */
@ApiTags('Market Intelligence — Katalog & Workflow')
@ApiBearerAuth()
@Controller('workspaces/:ws')
export class CatalogController {
  constructor(
    private readonly products: ProductsService,
    private readonly opportunities: OpportunitiesService,
    private readonly content: ContentService,
    private readonly approvals: ApprovalsService,
  ) {}

  // ---------------------------------------------------------------- produk
  @Get('products')
  @ApiZodQuery(productsQuerySchema)
  listProducts(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown) {
    return this.products.list(u, ws, q);
  }

  @Post('products')
  @ApiZodBody(createProductSchema)
  createProduct(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Body() body: unknown) {
    return this.products.create(u, ws, body);
  }

  @Get('products/:id')
  getProduct(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('id', UuidPipe) id: string) {
    return this.products.get(u, ws, id);
  }

  @Patch('products/:id')
  @ApiZodBody(updateProductSchema)
  updateProduct(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('id', UuidPipe) id: string, @Body() body: unknown) {
    return this.products.update(u, ws, id, body);
  }

  @Delete('products/:id')
  @HttpCode(204)
  removeProduct(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('id', UuidPipe) id: string) {
    return this.products.remove(u, ws, id);
  }

  // ---------------------------------------------------------------- opportunity
  @Get('opportunities')
  @ApiZodQuery(opportunitiesQuerySchema)
  listOpportunities(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown) {
    return this.opportunities.list(u, ws, q);
  }

  @Post('opportunities')
  @ApiZodBody(createOpportunitySchema)
  createOpportunity(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Body() body: unknown) {
    return this.opportunities.create(u, ws, body);
  }

  @Patch('opportunities/:id')
  @ApiZodBody(updateOpportunitySchema)
  updateOpportunity(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('id', UuidPipe) id: string, @Body() body: unknown) {
    return this.opportunities.update(u, ws, id, body);
  }

  @Post('opportunities/:id/notes')
  @ApiZodBody(opportunityNoteSchema)
  noteOpportunity(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('id', UuidPipe) id: string, @Body() body: unknown) {
    return this.opportunities.addNote(u, ws, id, body);
  }

  @Get('opportunities/:id/events')
  opportunityEvents(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('id', UuidPipe) id: string) {
    return this.opportunities.events(u, ws, id);
  }

  // ---------------------------------------------------------------- strategi & bank konten
  @Get('strategies')
  @ApiZodQuery(strategiesQuerySchema)
  listStrategies(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown) {
    return this.content.strategies(u, ws, q);
  }

  @Get('content-items')
  @ApiZodQuery(contentQuerySchema)
  listContent(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown) {
    return this.content.list(u, ws, q);
  }

  @Post('content-items/decisions')
  @HttpCode(200)
  @ApiZodBody(bulkContentDecisionSchema)
  decideContentBulk(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Body() body: unknown) {
    return this.content.decideMany(u, ws, body);
  }

  @Patch('content-items/:id')
  @ApiZodBody(updateContentSchema)
  updateContent(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('id', UuidPipe) id: string, @Body() body: unknown) {
    return this.content.update(u, ws, id, body);
  }

  @Post('content-items/:id/decision')
  @HttpCode(200)
  @ApiZodBody(contentDecisionSchema)
  decideContent(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('id', UuidPipe) id: string, @Body() body: unknown) {
    return this.content.decide(u, ws, id, body);
  }

  @Post('content-items/:id/schedule')
  @HttpCode(200)
  @ApiZodBody(scheduleContentSchema)
  scheduleContent(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('id', UuidPipe) id: string, @Body() body: unknown) {
    return this.content.schedule(u, ws, id, body);
  }

  @Post('content-items/:id/publish')
  @HttpCode(200)
  @ApiZodBody(publishContentSchema)
  publishContent(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('id', UuidPipe) id: string, @Body() body: unknown) {
    return this.content.publish(u, ws, id, body);
  }

  // ---------------------------------------------------------------- antrean approval
  @Get('approvals')
  @ApiZodQuery(approvalsQuerySchema)
  listApprovals(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown) {
    return this.approvals.list(u, ws, q);
  }

  @Post('approvals/:id/decision')
  @HttpCode(200)
  @ApiZodBody(reviewJob13Schema)
  decideApproval(
    @CurrentUser() u: AuthUser,
    @Param('ws', UuidPipe) ws: string,
    @Param('id', UuidPipe) id: string,
    @Body() body: unknown,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.approvals.decide(u, ws, id, body, requestId);
  }
}
