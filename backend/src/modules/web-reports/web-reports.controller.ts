import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiZodBody, ApiZodQuery } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/request.types';
import { compareWebReportsQuery, createWebReportSchema, listWebReportsQuery, updateWebReportSchema } from './web-reports.schemas';
import { WebReportsService } from './web-reports.service';

@ApiTags('Web Reports (Modul 2)')
@ApiBearerAuth()
@Controller()
export class WebReportsController {
  constructor(private readonly reports: WebReportsService) {}

  @Get('workspaces/:workspaceId/web-reports')
  @ApiZodQuery(listWebReportsQuery)
  list(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', UuidPipe) workspaceId: string,
    @Query(new ZodPipe(listWebReportsQuery)) q: z.infer<typeof listWebReportsQuery>,
  ) {
    return this.reports.list(user, workspaceId, q);
  }

  // Harus dideklarasikan terpisah dari ':id' agar "compare" tidak dianggap id
  @Get('workspaces/:workspaceId/web-reports/compare')
  @ApiZodQuery(compareWebReportsQuery)
  compare(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', UuidPipe) workspaceId: string,
    @Query(new ZodPipe(compareWebReportsQuery)) q: z.infer<typeof compareWebReportsQuery>,
  ) {
    return this.reports.compare(user, workspaceId, q.ids);
  }

  @Post('workspaces/:workspaceId/web-reports')
  @ApiZodBody(createWebReportSchema)
  create(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', UuidPipe) workspaceId: string,
    @Body(new ZodPipe(createWebReportSchema)) body: z.infer<typeof createWebReportSchema>,
  ) {
    return this.reports.create(user, workspaceId, body);
  }

  @Get('web-reports/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.reports.get(user, id);
  }

  @Patch('web-reports/:id')
  @ApiZodBody(updateWebReportSchema)
  update(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string, @Body(new ZodPipe(updateWebReportSchema)) body: z.infer<typeof updateWebReportSchema>) {
    return this.reports.update(user, id, body);
  }

  @Delete('web-reports/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string) {
    return this.reports.remove(user, id);
  }
}
