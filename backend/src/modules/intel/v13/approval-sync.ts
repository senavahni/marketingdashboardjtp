import { Tx } from '../../../database/prisma.service';
import { approval_status, strategy_status } from '../../../generated/prisma/client';
import { StageView13 } from '../../../shared/schemas/intel-1.3.schema';

type Review = NonNullable<StageView13['review']>;
type Decision = 'approve' | 'reject' | 'revise';

const APPROVAL_STATUS: Record<Decision, approval_status> = { approve: 'approved', reject: 'rejected', revise: 'revise' };
const STRATEGY_STATUS: Record<Decision, strategy_status> = { approve: 'approved', reject: 'rejected', revise: 'in_review' };

/**
 * Review yang diminta MCP → baris `approvals` (idempoten per review_id) untuk antrean approval terpadu.
 * Review strategi juga menautkan `strategy_docs.mcp_report_id` dan menandai dokumen `in_review`.
 * @returns true bila approval baru dibuat (untuk notifikasi).
 */
export async function recordReviewRequest(tx: Tx, job: { id: string; workspace_id: string }, review: Review, agentKey: string | null): Promise<boolean> {
  const existing = await tx.approvals.findUnique({ where: { mcp_review_id: review.review_id }, select: { id: true } });
  if (!existing) {
    await tx.approvals.create({
      data: {
        workspace_id: job.workspace_id,
        intel_job_id: job.id,
        mcp_review_id: review.review_id,
        subject_type: review.subject_type,
        subject_ref: review.subject_ref,
        summary: review.summary,
        non_blocking: review.non_blocking,
        requested_by_agent: agentKey,
      },
    });
  }
  if (review.subject_type === 'strategy') {
    await tx.strategy_docs.updateMany({
      where: { intel_job_id: job.id, deleted_at: null, status: { in: ['draft', 'in_review'] } },
      data: { status: 'in_review', mcp_report_id: review.subject_ref },
    });
  }
  return !existing;
}

/** Keputusan manusia atas review → status approval & (untuk strategi) status dokumen strategi. */
export async function recordReviewDecision(
  tx: Tx,
  approval: { id: string; intel_job_id: string | null; subject_type: string; subject_ref: string },
  decision: Decision,
  userId: string,
  comment: string | undefined,
): Promise<void> {
  await tx.approvals.update({
    where: { id: approval.id },
    data: { status: APPROVAL_STATUS[decision], decided_by: userId, decided_at: new Date(), comment: comment ?? null },
  });
  if (approval.subject_type === 'strategy' && approval.intel_job_id) {
    await tx.strategy_docs.updateMany({
      where: { intel_job_id: approval.intel_job_id, deleted_at: null },
      data: { status: STRATEGY_STATUS[decision], mcp_report_id: approval.subject_ref },
    });
  }
}
