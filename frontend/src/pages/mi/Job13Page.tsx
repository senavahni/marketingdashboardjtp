import { ArrowLeft, Ban, CheckCircle2, Circle, CircleHelp, Loader2, PauseCircle, XCircle } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router';
import { toast } from 'sonner';
import { Job13StatusBadge } from '../../components/mi/badges';
import { CostPair } from '../../components/mi/CostKpi';
import { JobBanner } from '../../components/mi/JobBanner';
import { MiPage } from '../../components/mi/MiPage';
import { StateView, stateFromError } from '../../components/mi/StateView';
import { FullPageSpinner } from '../../components/ui/misc';
import { useJob13, useJob13Actions } from '../../hooks/mi-queries';
import { useAuth } from '../../lib/auth-store';
import { errorMessage } from '../../lib/api';
import { KIND_LABEL, isActive13, stageLabel } from '../../lib/mi-format';
import type { Job13, StageView } from '../../lib/mi-types';
import type { WorkspaceSummary } from '../../lib/types';
import { formatDateTime } from '../../lib/utils';

const IntelJobPage = lazy(() => import('../IntelJobPage').then((m) => ({ default: m.IntelJobPage })));

/** `/agents/jobs/:jobId`: job 1.3 (punya `kind`) → Job13Page; job sosial Modul 3 → halaman lama tanpa perubahan. */
export function JobRoute() {
  const { jobId } = useParams();
  const job = useJob13(jobId);
  if (job.isLoading) return <FullPageSpinner />;
  if (job.data && !job.data.kind) {
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <IntelJobPage />
      </Suspense>
    );
  }
  return <Job13Page job={job.data} error={job.error} />;
}

const STAGE_ICON: Record<StageView['status'], typeof Circle> = {
  pending: Circle,
  running: Loader2,
  awaiting_review: CircleHelp,
  paused: PauseCircle,
  completed: CheckCircle2,
  skipped: Ban,
  failed: XCircle,
  cancelled: Ban,
};

function Job13Page({ job, error }: { job: Job13 | undefined; error: unknown }) {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.user?.id);
  const actions = useJob13Actions(workspace.id, job?.id ?? '');
  const back = `/w/${workspace.id}/agents/jobs`;
  if (!job) {
    return (
      <MiPage eyebrow="Agent Workspace" title="Job tidak tersedia">
        <StateView kind={stateFromError(error)} error={error} action={<Link to={back} className="text-[#1D5FA8] underline">Kembali ke daftar job</Link>} />
      </MiPage>
    );
  }
  const canAct = workspace.role === 'owner' || workspace.role === 'admin' || job.created_by === userId;
  const run = (m: { mutateAsync: () => Promise<unknown> }, ok: string) => m.mutateAsync().then(() => toast.success(ok), (e: unknown) => toast.error(errorMessage(e)));
  const estimateUsd = job.estimate ? job.estimate.llm.usd_est + job.estimate.external.usd : null;
  return (
    <MiPage
      eyebrow={<><Link to={back} className="inline-flex items-center gap-1 hover:underline"><ArrowLeft size={13} /> Job agent</Link></>}
      title={job.title}
      description={`${KIND_LABEL[job.kind]} · dibuat ${formatDateTime(job.created_at)}${job.llm_assist ? ' · LLM assist aktif' : ''}`}
      actions={
        <>
          <Job13StatusBadge status={job.status} />
          {isActive13(job.status) && job.status !== 'cancelling' && (
            <button type="button" disabled={!canAct || actions.cancel.isPending} onClick={() => run(actions.cancel, 'Pembatalan dikirim')} className="h-9 rounded-lg border border-line-strong bg-white px-3 text-sm font-medium hover:bg-hover disabled:opacity-50">
              Batalkan
            </button>
          )}
        </>
      }
    >
      <JobBanner job={job} canAct={canAct} isBusy={actions.resume.isPending} onResume={() => run(actions.resume, 'Job dilanjutkan')} onOpenReview={() => navigate(`/w/${workspace.id}/agents/approvals`)} />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <section aria-labelledby="stages-title" className="rounded-2xl border border-[#E3E7ED] bg-white p-5">
          <h2 id="stages-title" className="mb-3 text-[13px] font-semibold tracking-wide text-[#0F2340]">
            Tahap
          </h2>
          <ol className="space-y-3">
            {job.stages.map((s) => {
              const Icon = STAGE_ICON[s.status];
              const pct = s.progress.total ? Math.round((s.progress.done / s.progress.total) * 100) : null;
              return (
                <li key={s.stage} className="flex gap-3" aria-current={s.status === 'running' ? 'step' : undefined}>
                  <Icon size={18} aria-hidden className={s.status === 'running' ? 'animate-spin text-[#1D5FA8] motion-reduce:animate-none' : s.status === 'completed' ? 'text-[#0E9384]' : s.status === 'paused' || s.status === 'awaiting_review' ? 'text-[#B45309]' : s.status === 'failed' ? 'text-[#C2410C]' : 'text-ink-faint'} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[#0F2340]">
                      {stageLabel(s.stage)} <span className="font-normal text-ink-soft">· {s.agent_key ? <span lang="en">{s.agent_key}</span> : 'agent default MCP'}</span>
                    </p>
                    <p className="text-[12px] text-ink-soft">
                      {s.progress.done}
                      {s.progress.total ? ` / ${s.progress.total}` : ''} {pct !== null && `(${pct}%)`}
                      {s.review && ` · menunggu review: ${s.review.summary}`}
                      {s.error && ` · ${s.error.code}: ${s.error.message}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <aside className="space-y-4">
          <section className="rounded-2xl border border-[#E3E7ED] bg-white p-4">
            <h2 className="mb-2 text-[13px] font-semibold text-[#0F2340]">Biaya</h2>
            <CostPair estimate={estimateUsd} actual={job.cost ? job.cost.usd_llm + job.cost.usd_external : 0} budget={job.budget_usd} />
          </section>
          {job.result && (
            <section className="rounded-2xl border border-[#E3E7ED] bg-white p-4 text-[13px]">
              <h2 className="mb-2 font-semibold text-[#0F2340]">Ringkasan hasil{job.result.partial ? ' (parsial)' : ''}</h2>
              {job.result.summary && <p className="text-ink">{job.result.summary}</p>}
              <dl className="mt-2 space-y-0.5">
                {Object.entries(job.result.counts ?? {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt className="text-ink-soft">{k.replace(/_/g, ' ')}</dt>
                    <dd className="font-medium tabular-nums">{new Intl.NumberFormat('id-ID').format(v)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </aside>
      </div>
    </MiPage>
  );
}
