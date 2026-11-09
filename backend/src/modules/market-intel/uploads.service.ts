import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Readable } from 'node:stream';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppException, Errors } from '../../common/exceptions/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../database/prisma.service';
import { upload_refs } from '../../generated/prisma/client';
import { uploadAcceptedSchema } from '../../shared/schemas/intel-1.3-tools.schema';
import { McpCallError } from '../agent-runs/mcp-client.service';
import { AccessService } from '../core/access.service';
import { mapIntelMcpError } from '../intel/intel-mcp.errors';
import { UPLOAD_LIMIT_BYTES, UploadGuard, UploadPurpose, tooLarge, uploadKindFor } from './upload-guard';

const UPLOAD_TIMEOUT_MS = 15 * 60_000;
const FILENAME_MAX = 255;

export interface UploadMeta {
  purpose: UploadPurpose;
  filename: string;
  /** Header Content-Length (bila ada) untuk menolak lebih awal. */
  contentLength?: number;
}

/**
 * Upload streaming (DSH-V1-02, V1-K9): klien → Dashboard → MCP `POST /uploads` tanpa buffer penuh.
 * Dashboard menyimpan metadata (`upload_refs`); file disimpan MCP.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async upload(user: AuthUser, workspaceId: string, meta: UploadMeta, body: Readable) {
    await this.access.assertPermission(user.id, workspaceId, meta.purpose === 'import' ? 'data:import' : 'knowledge:upload');
    const apiKey = this.config.env.MCP_INTEL_API_KEY;
    if (!apiKey) throw new AppException(ErrorCode.FEATURE_DISABLED, 'Modul Intel belum diaktifkan', 503);
    const filename = sanitizeFilename(meta.filename);
    const kind = uploadKindFor(filename, meta.purpose);
    if (meta.contentLength !== undefined && meta.contentLength > UPLOAD_LIMIT_BYTES[kind]) throw tooLarge(kind);

    const guard = new UploadGuard(kind);
    body.on('error', (error) => guard.destroy(error));
    body.pipe(guard);
    let response: Response;
    try {
      response = await fetch(new URL('/uploads', this.config.env.MCP_SERVER_URL), {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/octet-stream', 'X-Upload-Kind': kind, 'X-Filename': encodeURIComponent(filename), 'X-Workspace-Id': workspaceId },
        body: Readable.toWeb(guard) as ReadableStream,
        duplex: 'half',
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      } as RequestInit);
    } catch (error) {
      if (guard.failure) throw guard.failure;
      this.logger.warn({ err: (error as Error).message }, 'Upload ke MCP gagal');
      throw mapIntelMcpError(new McpCallError('MCP_UNAVAILABLE', 'Layanan MCP tidak tersedia', true));
    } finally {
      body.unpipe(guard);
    }
    if (guard.failure) throw guard.failure;
    const accepted = await this.parseResponse(response);
    if (accepted.size !== guard.bytes || accepted.kind !== kind) throw new AppException(ErrorCode.MCP_ERROR, 'Respons upload MCP tidak cocok dengan file yang dikirim', HttpStatus.BAD_GATEWAY);
    const row = await this.prisma.upload_refs.create({
      data: { workspace_id: workspaceId, kind, mcp_upload_id: accepted.upload_id, filename, size: BigInt(accepted.size), sha256: accepted.sha256, uploaded_by: user.id, purpose: meta.purpose },
    });
    return toDto(row);
  }

  async list(user: AuthUser, workspaceId: string, purpose?: UploadPurpose) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const rows = await this.prisma.upload_refs.findMany({ where: { workspace_id: workspaceId, ...(purpose ? { purpose } : {}) }, orderBy: { created_at: 'desc' }, take: 200 });
    return { data: rows.map(toDto) };
  }

  private async parseResponse(response: Response) {
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const err = body as { code?: unknown; message?: unknown } | null;
      throw mapIntelMcpError(new McpCallError(typeof err?.code === 'string' ? err.code : 'MCP_ERROR', typeof err?.message === 'string' ? err.message : 'Upload ditolak MCP', false));
    }
    const parsed = uploadAcceptedSchema.safeParse(body);
    if (!parsed.success) throw new AppException(ErrorCode.MCP_ERROR, 'Respons MCP tidak sesuai kontrak', HttpStatus.BAD_GATEWAY);
    return parsed.data;
  }
}

/** Nama file aman untuk disimpan & ditampilkan: tanpa path, karakter kontrol, atau pemisah direktori. */
export function sanitizeFilename(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* pakai apa adanya bila bukan percent-encoding valid */
  }
  // eslint-disable-next-line no-control-regex
  const name = (decoded.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name || name === '.' || name === '..') throw Errors.validation('Nama file tidak valid', { field: 'filename' });
  return name.slice(-FILENAME_MAX);
}

function toDto(r: upload_refs) {
  return { id: r.id, upload_id: r.mcp_upload_id, kind: r.kind, purpose: r.purpose, filename: r.filename, size: Number(r.size), sha256: r.sha256, status: r.status_cache, uploaded_by: r.uploaded_by, created_at: r.created_at };
}
