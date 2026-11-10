import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { PrismaService } from '../../database/prisma.service';
import {
  cfTargetListSchema,
  cfTargetSchema,
  importBatchDetailSchema,
  importBatchListSchema,
  importRollbackSchema,
  importRowDecisionSchema,
  importRowListSchema,
  uploadProfileSchema,
} from '../../shared/schemas/intel-1.3-import.schema';
import { AccessService } from '../core/access.service';
import { IntelMcpClient } from '../intel/intel-mcp-client.service';
import { cfTargetsQuerySchema, cfUpdateSchema, importBatchesQuerySchema, importRowsQuerySchema, rollbackSchema, rowDecisionSchema } from './workflow.schemas';

/**
 * Import XLSX/CSV & Contact Finder (DSH-V1-06, F1b): baca batch/baris/target dari MCP, kirim keputusan manusia.
 * Baca = semua anggota; keputusan/rollback/ubah target = `data:import`.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly mcp: IntelMcpClient,
  ) {}

  /** Sheet + header + pratinjau 20 baris file yang sudah di-upload (milik workspace ini). */
  async profile(user: AuthUser, ws: string, uploadId: string, requestId?: string) {
    await this.access.assertPermission(user.id, ws, 'data:import');
    const upload = await this.prisma.upload_refs.findFirst({ where: { workspace_id: ws, mcp_upload_id: uploadId, purpose: 'import' }, select: { id: true } });
    if (!upload) throw Errors.notFound('File import tidak ditemukan');
    return this.mcp.call('ci_upload_profile', { workspace_id: ws, upload_id: uploadId }, uploadProfileSchema, requestId);
  }

  async batches(user: AuthUser, ws: string, raw: unknown, requestId?: string) {
    await this.access.assertWorkspace(user.id, ws);
    const q = importBatchesQuerySchema.parse(raw);
    return this.mcp.call('ci_import_batches', { workspace_id: ws, limit: q.limit, cursor: q.cursor ?? null }, importBatchListSchema, requestId);
  }

  async batch(user: AuthUser, ws: string, batchId: string, requestId?: string) {
    await this.access.assertWorkspace(user.id, ws);
    return this.mcp.call('ci_import_batch_get', { workspace_id: ws, batch_id: batchId }, importBatchDetailSchema, requestId);
  }

  async rows(user: AuthUser, ws: string, batchId: string, raw: unknown, requestId?: string) {
    await this.access.assertWorkspace(user.id, ws);
    const q = importRowsQuerySchema.parse(raw);
    return this.mcp.call('ci_import_rows', { workspace_id: ws, batch_id: batchId, status: q.status, limit: q.limit, cursor: q.cursor ?? null }, importRowListSchema, requestId);
  }

  async decideRow(user: AuthUser, ws: string, batchId: string, rowId: string, raw: unknown, requestId?: string) {
    await this.access.assertPermission(user.id, ws, 'data:import');
    const input = rowDecisionSchema.parse(raw);
    return this.mcp.call(
      'ci_import_row_decide',
      { workspace_id: ws, batch_id: batchId, row_id: rowId, decision: input.decision, company_id: input.company_id ?? null, decided_by: user.id },
      importRowDecisionSchema,
      requestId,
    );
  }

  /** `dry_run` = ringkasan dampak; rollback nyata wajib `confirm_filename` sama dengan nama file batch. */
  async rollback(user: AuthUser, ws: string, batchId: string, raw: unknown, requestId?: string) {
    await this.access.assertPermission(user.id, ws, 'data:import');
    const input = rollbackSchema.parse(raw);
    if (!input.dry_run) {
      const batch = await this.mcp.call('ci_import_batch_get', { workspace_id: ws, batch_id: batchId }, importBatchDetailSchema, requestId);
      if (batch.rolled_back_at) throw Errors.conflict(ErrorCode.BUSINESS_RULE_VIOLATION, 'Batch sudah di-rollback');
      if (input.confirm_filename?.trim() !== batch.filename) {
        throw Errors.validation('Ketik nama file batch persis untuk konfirmasi rollback', { field: 'confirm_filename' });
      }
    }
    return this.mcp.call('ci_import_rollback', { workspace_id: ws, batch_id: batchId, dry_run: input.dry_run, requested_by: user.id }, importRollbackSchema, requestId);
  }

  async targets(user: AuthUser, ws: string, raw: unknown, requestId?: string) {
    await this.access.assertWorkspace(user.id, ws);
    const q = cfTargetsQuerySchema.parse(raw);
    const filter = { statuses: q.statuses ?? [], import_batch_id: q.import_batch_id ?? null, region_codes: q.region_codes ?? [], kbli_codes: q.kbli_codes ?? [] };
    return this.mcp.call('cf_targets', { workspace_id: ws, filter, limit: q.limit, cursor: q.cursor ?? null }, cfTargetListSchema, requestId);
  }

  async updateTarget(user: AuthUser, ws: string, targetId: string, raw: unknown, requestId?: string) {
    await this.access.assertPermission(user.id, ws, 'data:import');
    const input = cfUpdateSchema.parse(raw);
    return this.mcp.call('cf_target_update', { workspace_id: ws, target_id: targetId, ...input, updated_by: user.id }, cfTargetSchema, requestId);
  }
}
