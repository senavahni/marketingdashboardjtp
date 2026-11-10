import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { toast } from 'sonner';
import { ApprovalCard } from '../../components/mi/ApprovalCard';
import { MiPage } from '../../components/mi/MiPage';
import { StateView, stateFromError } from '../../components/mi/StateView';
import { useApprovals, useDecideApproval } from '../../hooks/mi-queries';
import { errorMessage } from '../../lib/api';
import { SUBJECT_LABEL, canBulkDecide } from '../../lib/mi-format';
import type { Approval, ReviewSubject } from '../../lib/mi-types';
import type { WorkspaceSummary } from '../../lib/types';

/**
 * Antrean approval terpadu (§D.9): 9 jenis subjek dalam satu daftar. Keputusan massal hanya untuk
 * knowledge card (keputusan PO #4); jenis lain diputuskan satu per satu.
 */
export function ApprovalsPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const [status, setStatus] = useState<Approval['status']>('pending');
  const [subject, setSubject] = useState<ReviewSubject | ''>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const approvals = useApprovals(workspace.id, status, subject || undefined);
  const decide = useDecideApproval(workspace.id);
  const list = approvals.data?.data ?? [];
  const bulkable = list.filter((a) => a.status === 'pending' && a.can_decide && canBulkDecide(a.subject_type));

  const decideOne = (a: Approval, decision: 'approve' | 'reject' | 'revise', comment?: string) =>
    decide.mutateAsync({ id: a.id, decision, comment }).then(
      () => toast.success(`${SUBJECT_LABEL[a.subject_type]}: keputusan terkirim`),
      (e: unknown) => toast.error(errorMessage(e)),
    );
  const decideSelected = async (decision: 'approve' | 'reject') => {
    const targets = bulkable.filter((a) => selected.has(a.id));
    const results = await Promise.allSettled(targets.map((a) => decide.mutateAsync({ id: a.id, decision })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) toast.error(`${failed} dari ${targets.length} keputusan gagal`);
    else toast.success(`${targets.length} kartu ${decision === 'approve' ? 'disetujui' : 'ditolak'}`);
    setSelected(new Set());
  };
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? new Set(s).add(id) : new Set([...s].filter((x) => x !== id))));

  return (
    <MiPage eyebrow={<><ShieldCheck size={14} /> Agent Workspace</>} title="Antrean approval" description="Mesin menyarankan, manusia memutuskan. Semua review agent — analisis produk, kata kunci, strategi, kartu pengetahuan, doktrin, kontak personal, review import, rencana misi — ada di sini.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Approval['status'])} className="h-8 rounded-lg border border-line-strong bg-white px-2 text-[13px]">
          <option value="pending">Menunggu</option>
          <option value="approved">Disetujui</option>
          <option value="rejected">Ditolak</option>
          <option value="revise">Minta revisi</option>
        </select>
        <select aria-label="Jenis" value={subject} onChange={(e) => setSubject(e.target.value as ReviewSubject | '')} className="h-8 rounded-lg border border-line-strong bg-white px-2 text-[13px]">
          <option value="">Semua jenis</option>
          {Object.entries(SUBJECT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {bulkable.length > 0 && (
          <div className="ml-auto flex items-center gap-2 text-[13px]" role="group" aria-label="Keputusan massal knowledge card">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="h-4 w-4 accent-[#0E9384]" checked={selected.size === bulkable.length} onChange={(e) => setSelected(e.target.checked ? new Set(bulkable.map((a) => a.id)) : new Set())} />
              Pilih semua kartu ({bulkable.length})
            </label>
            <button type="button" disabled={!selected.size || decide.isPending} onClick={() => void decideSelected('approve')} className="h-8 rounded-lg bg-[#0E9384] px-3 font-medium text-white disabled:opacity-40">
              Setujui terpilih
            </button>
            <button type="button" disabled={!selected.size || decide.isPending} onClick={() => void decideSelected('reject')} className="h-8 rounded-lg border border-[#F5C2B3] px-3 font-medium text-[#C2410C] disabled:opacity-40">
              Tolak terpilih
            </button>
          </div>
        )}
      </div>
      {approvals.isLoading ? (
        <StateView kind="loading" />
      ) : approvals.error ? (
        <StateView kind={stateFromError(approvals.error)} error={approvals.error} />
      ) : list.length === 0 ? (
        <StateView kind={subject ? 'filtered-empty' : 'empty'} title={status === 'pending' && !subject ? 'Tidak ada yang menunggu keputusan' : undefined} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((a) => (
            <ApprovalCard
              key={a.id}
              approval={a}
              jobHref={a.intel_job_id ? `/w/${workspace.id}/agents/jobs/${a.intel_job_id}` : undefined}
              isBusy={decide.isPending}
              selectable={a.status === 'pending' && canBulkDecide(a.subject_type)}
              selected={selected.has(a.id)}
              onSelect={(on) => toggle(a.id, on)}
              onDecide={(d, c) => void decideOne(a, d, c)}
            />
          ))}
        </div>
      )}
    </MiPage>
  );
}
