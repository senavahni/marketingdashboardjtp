import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { permissionsFor } from '../../common/constants/permissions';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { PrismaService } from '../../database/prisma.service';
import { REVIEW_SUBJECTS } from '../../shared/schemas/intel-1.3.schema';
import { decodeCursor, toPage } from '../../utils/helpers/pagination.util';
import { AccessService } from '../core/access.service';
import { Jobs13Service } from '../intel/v13/jobs13.service';
import { REVIEW_PERMISSION } from '../intel/v13/jobs13.schemas';

export const approvalsQuerySchema = z.strictObject({
  status: z.enum(['pending', 'approved', 'rejected', 'revise']).default('pending'),
  subject_type: z.enum(REVIEW_SUBJECTS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});

/** Antrean approval terpadu (DSH-V1-02/13): semua review agent dalam satu daftar; keputusan diteruskan ke job MCP. */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly jobs13: Jobs13Service,
  ) {}

  async list(user: AuthUser, workspaceId: string, raw: unknown) {
    const { role } = await this.access.assertWorkspace(user.id, workspaceId);
    const q = approvalsQuerySchema.parse(raw);
    const offset = decodeCursor(q.cursor);
    const rows = await this.prisma.approvals.findMany({
      where: { workspace_id: workspaceId, status: q.status, ...(q.subject_type ? { subject_type: q.subject_type } : {}) },
      include: { intel_job: { select: { id: true, kind: true, title: true } } },
      orderBy: { created_at: q.status === 'pending' ? 'asc' : 'desc' },
      skip: offset,
      take: q.limit + 1,
    });
    const granted = new Set<string>(permissionsFor(role));
    const page = toPage(
      rows.map((a) => {
        const needed = REVIEW_PERMISSION[a.subject_type];
        return { ...a, can_decide: a.status === 'pending' && role !== 'viewer' && (!needed || granted.has(needed)) };
      }),
      offset,
      q.limit,
    );
    return page;
  }

  async decide(user: AuthUser, workspaceId: string, approvalId: string, raw: unknown, requestId?: string) {
    const approval = await this.prisma.approvals.findFirst({ where: { id: approvalId, workspace_id: workspaceId } });
    if (!approval) throw Errors.notFound('Approval tidak ditemukan');
    if (approval.status !== 'pending') throw Errors.conflict(ErrorCode.BUSINESS_RULE_VIOLATION, 'Approval sudah diputuskan');
    if (!approval.intel_job_id) throw Errors.conflict(ErrorCode.BUSINESS_RULE_VIOLATION, 'Approval tidak terkait job');
    return this.jobs13.review(user, workspaceId, approval.intel_job_id, raw, requestId);
  }
}
