import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiZodBody, ApiZodQuery } from '../../common/decorators/api-zod.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { UuidPipe } from '../../common/pipes/uuid-param.pipe';
import { ZodPipe } from '../../common/pipes/zod-validation.pipe';
import { AppRequest, AuthUser } from '../../common/types/request.types';
import { ExportsService, createExportSchema } from './exports.service';
import { companiesQuerySchema, geoClustersQuerySchema, knAssetsQuerySchema, kpisQuerySchema, oppExplainQuerySchema, oppScoresQuerySchema } from './intel-proxy.schemas';
import { IntelProxyService } from './intel-proxy.service';
import { UploadsService } from './uploads.service';

const purposeSchema = z.enum(['book', 'brand', 'import']);

/** Data mesin dari MCP (proxy tipis + cache), upload streaming, dan ekspor (DSH-V1-02). */
@ApiTags('Market Intelligence — Data MCP')
@ApiBearerAuth()
@Controller('workspaces/:ws')
export class IntelDataController {
  constructor(
    private readonly proxy: IntelProxyService,
    private readonly uploads: UploadsService,
    private readonly exportsSvc: ExportsService,
  ) {}

  @Get('mi/kpis')
  @ApiZodQuery(kpisQuerySchema)
  kpis(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown, @Headers('x-request-id') rid?: string) {
    return this.proxy.kpis(u, ws, q, rid);
  }

  @Get('ci/companies')
  @ApiZodQuery(companiesQuerySchema)
  companies(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown, @Headers('x-request-id') rid?: string) {
    return this.proxy.companies(u, ws, q, rid);
  }

  @Get('ci/companies/:companyId')
  company(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Param('companyId', UuidPipe) id: string, @Headers('x-request-id') rid?: string) {
    return this.proxy.company(u, ws, id, rid);
  }

  @Get('ci/geo-clusters')
  @ApiZodQuery(geoClustersQuerySchema)
  geoClusters(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown, @Headers('x-request-id') rid?: string) {
    return this.proxy.geoClusters(u, ws, q, rid);
  }

  @Get('opp/scores')
  @ApiZodQuery(oppScoresQuerySchema)
  oppScores(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown, @Headers('x-request-id') rid?: string) {
    return this.proxy.oppScores(u, ws, q, rid);
  }

  @Get('opp/explain')
  @ApiZodQuery(oppExplainQuerySchema)
  oppExplain(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown, @Headers('x-request-id') rid?: string) {
    return this.proxy.oppExplain(u, ws, q, rid);
  }

  @Get('kn/assets')
  @ApiZodQuery(knAssetsQuerySchema)
  knAssets(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query() q: unknown, @Headers('x-request-id') rid?: string) {
    return this.proxy.knAssets(u, ws, q, rid);
  }

  /**
   * Upload streaming: body = isi file mentah (`Content-Type: application/octet-stream`), nama file di header
   * `X-Filename` (percent-encoded). PDF ≤ 100 MB (purpose book/brand), XLSX/CSV ≤ 20 MB (purpose import).
   */
  @Post('uploads')
  @RateLimit('upload')
  @ApiQuery({ name: 'purpose', enum: ['book', 'brand', 'import'] })
  @ApiHeader({ name: 'X-Filename', required: true })
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  upload(
    @CurrentUser() u: AuthUser,
    @Param('ws', UuidPipe) ws: string,
    @Query('purpose', new ZodPipe(purposeSchema)) purpose: z.infer<typeof purposeSchema>,
    @Headers('x-filename') filename: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() req: AppRequest,
  ) {
    const length = contentLength && /^\d+$/.test(contentLength) ? Number(contentLength) : undefined;
    // Penolakan dini (403/413/415): Node membuang sisa body setelah respons error dikirim
    return this.uploads.upload(u, ws, { purpose, filename: filename ?? '', contentLength: length }, req);
  }

  @Get('uploads')
  @ApiQuery({ name: 'purpose', enum: ['book', 'brand', 'import'], required: false })
  listUploads(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Query('purpose', new ZodPipe(purposeSchema.optional())) purpose?: z.infer<typeof purposeSchema>) {
    return this.uploads.list(u, ws, purpose);
  }

  @Post('exports')
  @ApiZodBody(createExportSchema)
  createExport(@CurrentUser() u: AuthUser, @Param('ws', UuidPipe) ws: string, @Body() body: unknown, @Headers('x-request-id') rid?: string) {
    return this.exportsSvc.create(u, ws, body, rid);
  }

  @Get('exports/:exportId')
  @ApiQuery({ name: 'format', enum: ['csv', 'xlsx'] })
  async download(
    @CurrentUser() u: AuthUser,
    @Param('ws', UuidPipe) ws: string,
    @Param('exportId') exportId: string,
    @Query('format', new ZodPipe(z.enum(['csv', 'xlsx']).default('csv'))) format: 'csv' | 'xlsx',
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.exportsSvc.download(u, ws, exportId, format);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="export-${exportId}.${format}"`);
    return new StreamableFile(file.stream);
  }
}
