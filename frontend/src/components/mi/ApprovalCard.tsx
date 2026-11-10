import { Check, MessageSquareText, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { KIND_LABEL, SUBJECT_LABEL } from '../../lib/mi-format';
import type { Approval } from '../../lib/mi-types';
import { cn, timeAgo } from '../../lib/utils';
import { ActorAvatar } from '../ui/avatar';

type Decision = 'approve' | 'reject' | 'revise';
type Props = {
  approval: Approval;
  jobHref?: string;
  isBusy?: boolean;
  /** Kotak centang massal — hanya untuk subjek yang diizinkan (keputusan PO #4). */
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
  onDecide: (decision: Decision, comment?: string) => void;
};

const DENIED = 'Butuh izin untuk subjek ini (mis. strategy:approve, knowledge:approve, content:approve, contacts:review) atau peran viewer';

/** Kartu approval (§C.8): subjek, agent, ringkasan, Setujui / Revisi / Tolak + komentar; nonaktif bila `can_decide=false`. */
export function ApprovalCard({ approval, jobHref, isBusy, selectable, selected, onSelect, onDecide }: Props) {
  const [comment, setComment] = useState('');
  const [mode, setMode] = useState<'idle' | 'revise' | 'reject'>('idle');
  const disabled = !approval.can_decide || isBusy;
  const submit = (decision: Decision) => {
    onDecide(decision, comment.trim() || undefined);
    setMode('idle');
    setComment('');
  };
  return (
    <article className={cn('rounded-2xl border bg-white p-4', selected ? 'border-[#0E9384] ring-2 ring-[#0E9384]/15' : 'border-[#E3E7ED]')} aria-labelledby={`appr-${approval.id}`}>
      <header className="flex items-start gap-3">
        {selectable && (
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[#0E9384]" checked={selected} disabled={!approval.can_decide} onChange={(e) => onSelect?.(e.target.checked)} aria-label={`Pilih ${SUBJECT_LABEL[approval.subject_type]}`} />
        )}
        <ActorAvatar type="agent" name={approval.requested_by_agent ?? 'agent'} size={28} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-[#0E9384] uppercase">{SUBJECT_LABEL[approval.subject_type]}</p>
          <h3 id={`appr-${approval.id}`} className="text-[14px] font-semibold text-[#0F2340]">
            {approval.summary ?? approval.subject_ref}
          </h3>
          <p className="text-[12px] text-ink-soft">
            <span lang="en">{approval.requested_by_agent ?? 'agent'}</span> · {timeAgo(approval.created_at)}
            {approval.intel_job && (
              <>
                {' · '}
                {jobHref ? (
                  <Link to={jobHref} className="text-[#1D5FA8] hover:underline">
                    {approval.intel_job.kind ? KIND_LABEL[approval.intel_job.kind] : 'Job'}: {approval.intel_job.title}
                  </Link>
                ) : (
                  approval.intel_job.title
                )}
              </>
            )}
            {approval.non_blocking && ' · tidak memblokir job'}
          </p>
        </div>
      </header>
      {approval.status !== 'pending' ? (
        <p className="mt-3 text-[12px] text-ink-soft">
          Diputuskan: <strong>{{ approved: 'disetujui', rejected: 'ditolak', revise: 'minta revisi', pending: '' }[approval.status]}</strong>
          {approval.decided_at && ` · ${timeAgo(approval.decided_at)}`}
          {approval.comment && ` — “${approval.comment}”`}
        </p>
      ) : (
        <>
          {mode !== 'idle' && (
            <div className="mt-3">
              <label htmlFor={`c-${approval.id}`} className="text-[12px] font-medium text-[#0F2340]">
                {mode === 'revise' ? 'Apa yang perlu direvisi? (wajib)' : 'Alasan penolakan (opsional)'}
              </label>
              <textarea id={`c-${approval.id}`} value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={2000} className="mt-1 w-full rounded-lg border border-line-strong px-2 py-1.5 text-[13px] outline-none focus:border-[#0E9384]" />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2" title={approval.can_decide ? undefined : DENIED}>
            {mode === 'idle' ? (
              <>
                <button type="button" disabled={disabled} onClick={() => submit('approve')} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#0E9384] px-3 text-[13px] font-medium text-white hover:bg-[#0B7A6E] disabled:opacity-40">
                  <Check size={14} aria-hidden /> Setujui
                </button>
                <button type="button" disabled={disabled} onClick={() => setMode('revise')} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-hover disabled:opacity-40">
                  <MessageSquareText size={14} aria-hidden /> Revisi
                </button>
                <button type="button" disabled={disabled} onClick={() => setMode('reject')} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#F5C2B3] px-3 text-[13px] font-medium text-[#C2410C] hover:bg-[#FDF1EC] disabled:opacity-40">
                  <X size={14} aria-hidden /> Tolak
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={disabled || (mode === 'revise' && !comment.trim())} onClick={() => submit(mode)} className="inline-flex h-8 items-center rounded-lg bg-[#0F2340] px-3 text-[13px] font-medium text-white disabled:opacity-40">
                  Kirim {mode === 'revise' ? 'revisi' : 'penolakan'}
                </button>
                <button type="button" onClick={() => setMode('idle')} className="h-8 rounded-lg px-3 text-[13px] text-ink-soft hover:bg-hover">
                  Batal
                </button>
              </>
            )}
          </div>
          {!approval.can_decide && <p className="mt-1 text-[11px] text-ink-faint">{DENIED}</p>}
        </>
      )}
    </article>
  );
}
