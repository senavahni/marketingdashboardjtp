import { HttpStatus, Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppException, Errors } from '../../common/exceptions/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { AppConfigService } from '../../config/app-config.service';
import { EXPORT_DATASETS, dataExportSchema } from '../../shared/schemas/intel-1.3-tools.schema';
import { McpCallError } from '../agent-runs/mcp-client.service';
import { AccessService } from '../core/access.service';
import { IntelMcpClient } from '../intel/intel-mcp-client.service';
import { mapIntelMcpError } from '../intel/intel-mcp.errors';
import { toCompanyFilter } from './intel-proxy.schemas';

export const createExportSchema = z.strictObject({
  dataset: z.enum(EXPORT_DATASETS),
  format: z.enum(['csv', 'xlsx']),
  filter: z
    .strictObject({
      q: z.string().trim().max(100).optional(),
      kbli_codes: z.array(z.string().regex(/^\d{1,5}$/)).max(50).optional(),
      region_codes: z.array(z.string().regex(/^\d{2}(\.\d{2})?$/)).max(38).optional(),
      org_types: z.array(z.enum(['company', 'government', 'education', 'health', 'ngo', 'other'])).optional(),
      origins: z.array(z.enum(['discovery', 'import', 'manual'])).optional(),
      product_id: z.uuid().optional(),
    })
    .default({}),
  include_personal_contacts: z.boolean().default(false),
});

export const EXPORT_ID = /^[a-z]{1,4}_[0-9a-z]{10}$/;
const CONTENT_TYPES = { csv: 'text/csv; charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as const;

/** Ekspor via MCP `data_export` (DSH-V1-02): MCP menyaring kontak personal/suppressed & meng-escape formula. */
@Injectable()
export class ExportsService {
  constructor(
    private readonly config: AppConfigService,
    private readonly access: AccessService,
    private readonly mcp: IntelMcpClient,
  ) {}

  async create(user: AuthUser, workspaceId: string, raw: unknown, requestId?: string) {
    const input = createExportSchema.parse(raw);
    if (input.include_personal_contacts) await this.access.assertPermission(user.id, workspaceId, 'contacts:view_personal');
    else await this.access.assertWorkspace(user.id, workspaceId, 'member');
    const out = await this.mcp.call(
      'data_export',
      { workspace_id: workspaceId, dataset: input.dataset, format: input.format, filter: toCompanyFilter(input.filter), include_personal_contacts: input.include_personal_contacts },
      dataExportSchema,
      requestId,
    );
    return { export_id: out.export_id, rows: out.rows, expires_at: out.expires_at, format: input.format, download_url: `/api/v1/workspaces/${workspaceId}/exports/${out.export_id}?format=${input.format}` };
  }

  /** Stream file ekspor dari MCP ke klien (tanpa buffer penuh). */
  async download(user: AuthUser, workspaceId: string, exportId: string, format: 'csv' | 'xlsx'): Promise<{ stream: Readable; contentType: string }> {
    await this.access.assertWorkspace(user.id, workspaceId, 'member');
    if (!EXPORT_ID.test(exportId)) throw Errors.validation('export_id tidak valid');
    const apiKey = this.config.env.MCP_INTEL_API_KEY;
    if (!apiKey) throw new AppException(ErrorCode.FEATURE_DISABLED, 'Modul Intel belum diaktifkan', 503);
    let response: Response;
    try {
      response = await fetch(new URL(`/exports/${exportId}`, this.config.env.MCP_SERVER_URL), { headers: { Authorization: `Bearer ${apiKey}`, 'X-Workspace-Id': workspaceId } });
    } catch {
      throw mapIntelMcpError(new McpCallError('MCP_UNAVAILABLE', 'Layanan MCP tidak tersedia', true));
    }
    if (response.status === 404 || response.status === 410) throw new AppException(ErrorCode.RESULT_EXPIRED, 'File ekspor tidak ada atau sudah kedaluwarsa', HttpStatus.GONE);
    if (!response.ok || !response.body) throw mapIntelMcpError(new McpCallError('MCP_ERROR', 'Ekspor gagal', false));
    return { stream: Readable.fromWeb(response.body as never), contentType: CONTENT_TYPES[format] };
  }
}
