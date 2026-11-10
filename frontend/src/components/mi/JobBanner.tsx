import { AlertTriangle, CircleHelp, Eye, PauseCircle, Play, RotateCcw, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { CAPTCHA_STEPS, PAUSE_META, SUBJECT_LABEL, type BannerTone } from '../../lib/mi-format';
import type { Job13 } from '../../lib/mi-types';
import { cn, timeAgo } from '../../lib/utils';

const TONE: Record<BannerTone, string> = {
  amber: 'border-[#F3D19C] bg-[#FFF8EC] text-[#7A3E06]',
  blue: 'border-[#C9DBF2] bg-[#F2F7FD] text-[#0F2340]',
  red: 'border-[#F5C2B3] bg-[#FDF1EC] text-[#9A3412]',
  yellow: 'border-[#F1E3A1] bg-[#FFFBEA] text-[#6B5200]',
};
const btn = 'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50';

type Props = {
  job: Pick<Job13, 'status' | 'pause' | 'error' | 'mcp_job_id' | 'stages'>;
  /** Peran boleh melanjutkan/mengulang (pembuat job atau admin); false → tombol nonaktif + alasan. */
  canAct: boolean;
  onResume?: () => void;
  onOpenReview?: () => void;
  onRetry?: () => void;
  isBusy?: boolean;
};

/** Banner status job 1.3 (§C.7): pause CAPTCHA/budget/model lokal, menunggu review, gagal, belum terkirim ke MCP. */
export function JobBanner({ job, canAct, onResume, onOpenReview, onRetry, isBusy }: Props) {
  const denied = canAct ? undefined : 'Hanya pembuat job atau Admin/Owner';
  if (!job.mcp_job_id && job.status === 'queued') {
    return (
      <Banner tone="yellow" icon={<Send size={16} />} title="Job tersimpan tetapi belum diterima MCP">
        {onRetry && <Action onClick={onRetry} disabled={!canAct || isBusy} title={denied} label="Kirim ulang ke MCP" icon={<RotateCcw size={14} />} />}
      </Banner>
    );
  }
  if (job.status === 'paused' && job.pause) {
    const meta = PAUSE_META[job.pause.reason];
    return (
      <Banner tone={meta.tone} icon={<PauseCircle size={16} />} title={meta.title} sub={`Dijeda sejak ${timeAgo(job.pause.since)} · progres dibekukan, tidak diulang dari nol`}>
        <p className="text-[13px]">{job.pause.message || meta.body}</p>
        {job.pause.resume_hint && <p className="mt-1 text-[12px] opacity-80">{job.pause.resume_hint}</p>}
        {job.pause.reason === 'captcha' && (
          <details className="mt-2 text-[12px]">
            <summary className="cursor-pointer font-medium">Panduan 3 langkah</summary>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              {CAPTCHA_STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </details>
        )}
        {meta.canResume && onResume && <Action onClick={onResume} disabled={!canAct || isBusy} title={denied} label={job.pause.reason === 'local_model_unavailable' ? 'Coba lagi' : 'Lanjutkan'} icon={<Play size={14} />} primary />}
      </Banner>
    );
  }
  if (job.status === 'awaiting_review') {
    const review = job.stages.find((s) => s.review)?.review;
    return (
      <Banner tone="blue" icon={<CircleHelp size={16} />} title={`Menunggu review: ${review ? SUBJECT_LABEL[review.subject_type] : 'tahap job'}`} sub={review?.summary}>
        {onOpenReview && <Action onClick={onOpenReview} label="Buka review" icon={<Eye size={14} />} primary />}
      </Banner>
    );
  }
  if (job.status === 'failed' && job.error) {
    return (
      <Banner tone="red" icon={<AlertTriangle size={16} />} title={`Gagal${job.error.stage ? ` di tahap ${job.error.stage}` : ''}`} alert>
        <p className="text-[13px]">
          <code className="mr-1 rounded bg-white/70 px-1">{job.error.code}</code>
          {job.error.message}
        </p>
        {!job.error.retryable && <p className="mt-1 text-[12px] opacity-80">Kesalahan ini tidak dapat diulang otomatis — periksa input lalu buat job baru.</p>}
        {job.error.retryable && onRetry && <Action onClick={onRetry} disabled={!canAct || isBusy} title={denied} label="Ulangi" icon={<RotateCcw size={14} />} />}
      </Banner>
    );
  }
  return null;
}

function Banner({ tone, icon, title, sub, children, alert }: { tone: BannerTone; icon: ReactNode; title: string; sub?: string | null; children?: ReactNode; alert?: boolean }) {
  return (
    <div role={alert ? 'alert' : 'status'} className={cn('mb-4 flex gap-3 rounded-2xl border px-4 py-3', TONE[tone])}>
      <span className="mt-0.5 shrink-0" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{title}</p>
        {sub && <p className="text-[12px] opacity-80">{sub}</p>}
        <div className="mt-1 flex flex-col items-start gap-2">{children}</div>
      </div>
    </div>
  );
}

function Action({ onClick, label, icon, disabled, title, primary }: { onClick: () => void; label: string; icon: ReactNode; disabled?: boolean; title?: string; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={disabled ? title : undefined} className={cn(btn, primary ? 'bg-[#0F2340] text-white hover:bg-[#1a3560]' : 'border border-current/30 bg-white/70 hover:bg-white')}>
      {icon} {label}
    </button>
  );
}
