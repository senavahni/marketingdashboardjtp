import { ArrowLeft, Ban, Box, Download, FileSpreadsheet, FileText, Library, RotateCcw, Send, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router';
import { toast } from 'sonner';
import { InsightSummary } from '../components/intel/InsightSummary';
import { Card, JobStatusBadge, SourceChips } from '../components/intel/IntelUi';
import { JobWizard } from '../components/intel/JobWizard';
import { RawDataTab } from '../components/intel/RawDataTab';
import { StageTimeline } from '../components/intel/StageTimeline';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { EmptyState, FullPageSpinner, Spinner } from '../components/ui/misc';
import { MenuItem, Popover } from '../components/ui/popover';
import { IntelFlow3DPanel } from '../components/intel/viz3d/IntelFlow3DPanel';
import { useFlowTokens, useIntelJob, useIntelProjection, useIntelRealtime, useJobAction, useJobEvents } from '../hooks/intel-queries';
import { useAgents } from '../hooks/queries';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { canCancel, canRetry, flowEventFromJob, formatCount, formatPeriod, isActiveStatus, kbChunks } from '../lib/intel-format';
import type { IntelJob } from '../lib/intel-types';
import type { WorkspaceSummary } from '../lib/types';
import { cn, formatDateTime, timeAgo } from '../lib/utils';

type Tab = 'summary' | 'raw' | 'log';
const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Ringkasan' },
  { key: 'raw', label: 'Data mentah' },
  { key: 'log', label: 'Log' },
];

export function IntelJobPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const userId = useAuth((s) => s.user?.id);
  const [tab, setTab] = useState<Tab>('summary');
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [retryKey, setRetryKey] = useState<number | null>(null);
  const [view3d, setView3d] = useState(false);
  const { data: job, isLoading, error } = useIntelJob(jobId);
  const hasIndex = !!job?.stages.some((s) => s.stage === 'index');
  const projection = useIntelProjection(jobId, job?.status ?? 'queued', view3d && hasIndex);
  const flowTokens = useFlowTokens(jobId);
  const { data: agents } = useAgents(workspace.id, true);
  const actions = useJobAction(workspace.id, jobId);
  useIntelRealtime(workspace.id);

  const base = `/w/${workspace.id}/intel`;
  const agentName = (id: string) => agents?.find((a) => a.id === id)?.name;

  if (isLoading) return <FullPageSpinner />;
  if (!job)
    return (
      <EmptyState icon="🧭" title="Job tidak ditemukan">
        <p className="text-[13px]">{error ? errorMessage(error) : null}</p>
        <Link to={base} className="text-[13px] text-[#1D5FA8] hover:underline">
          Kembali ke daftar job
        </Link>
      </EmptyState>
    );

  const isAdmin = workspace.role === 'owner' || workspace.role === 'admin';
  const canModify = workspace.role !== 'viewer' && (isAdmin || job.created_by === userId);
  const notConnected = !job.mcp_job_id && job.status === 'queued';
  const chunks = kbChunks(job);

  const runCancel = () =>
    actions.cancel.mutate(undefined, {
      onSuccess: (r) => {
        toast.success(r.cancelled ? 'Pembatalan dikirim' : 'Job sudah selesai sebelum dibatalkan');
        setConfirm(null);
      },
    });
  const runDelete = () =>
    actions.remove.mutate(undefined, {
      onSuccess: () => {
        toast.success('Job dihapus');
        navigate(base);
      },
    });

  return (
    <div className="h-full overflow-y-auto bg-[linear-gradient(180deg,#F5F7FA_0,#fff_320px)]">
      <div className="mx-auto max-w-6xl px-8 pt-8 pb-16">
        <Link to={base} className="mb-4 inline-flex items-center gap-1 text-[13px] text-ink-soft hover:text-ink">
          <ArrowLeft size={14} /> Riset & Insight
        </Link>

        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <JobStatusBadge status={job.status} />
              <SourceChips sources={job.sources} />
              {chunks !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F4F2] px-2.5 py-0.5 text-[12px] font-medium text-[#0B7A6E]">
                  <Library size={12} aria-hidden /> Tersimpan di KB ({formatCount(chunks)} chunk)
                </span>
              )}
            </div>
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-[#0F2340]">{job.title}</h1>
            <p className="mt-1 text-[13px] text-ink-soft">
              {formatPeriod(job.spec.period)} · dibuat {timeAgo(job.created_at)}
              {job.finished_at && ` · selesai ${formatDateTime(job.finished_at)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2" data-tour="intel-job-actions">
            {canModify && notConnected && (
              <Button variant="outline" disabled={actions.retryCreate.isPending} onClick={() => actions.retryCreate.mutate()}>
                <Send size={14} /> Kirim ulang ke MCP
              </Button>
            )}
            {canModify && canCancel(job.status) && !notConnected && (
              <Button variant="outline" onClick={() => setConfirm('cancel')}>
                <Ban size={14} /> Batalkan
              </Button>
            )}
            {workspace.role !== 'viewer' && canRetry(job.status) && (
              <Button variant="outline" onClick={() => setRetryKey(Date.now())}>
                <RotateCcw size={14} /> Ulangi
              </Button>
            )}
            <ExportMenu job={job} workspaceName={workspace.name} agentName={agentName} />
            {canModify && (
              <Button variant="ghost" aria-label="Hapus job" onClick={() => setConfirm('delete')}>
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        </header>

        {job.error && (
          <div className="mb-4 flex gap-2 rounded-xl bg-[#FDECE7] px-4 py-3 text-[13px] text-[#9A3412]">
            <XCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <b>{job.error.code}</b> — {job.error.message}
              {job.error.retryable && (
                <span className="ml-1">
                  Anda bisa menekan <b>Ulangi</b>.
                </span>
              )}
            </div>
          </div>
        )}
        {notConnected && (
          <div className="mb-4 rounded-xl bg-[#FEF6E7] px-4 py-3 text-[13px] text-[#92400E]">
            Job tersimpan di Dashboard tetapi belum diterima MCP. Tekan <b>Kirim ulang ke MCP</b> setelah layanan MCP aktif.
          </div>
        )}

        <Card
          className="mb-6"
          title="Alur kerja agent"
          action={
            hasIndex && (
              <Button variant="outline" aria-pressed={view3d} onClick={() => setView3d((v) => !v)}>
                <Box size={14} /> {view3d ? 'Tampilan 2D' : 'Tampilan 3D'}
              </Button>
            )
          }
        >
          <div data-tour="intel-timeline">
            {view3d && hasIndex ? (
              <IntelFlow3DPanel
                points={projection.data ?? []}
                event={flowEventFromJob(job, flowTokens)}
                running={isActiveStatus(job.status)}
              >
                <StageTimeline stages={job.stages} cost={job.cost} agentName={agentName} />
              </IntelFlow3DPanel>
            ) : (
              <StageTimeline stages={job.stages} cost={job.cost} agentName={agentName} />
            )}
          </div>
        </Card>

        <div role="tablist" aria-label="Bagian job" className="mb-4 flex gap-1 border-b border-line" data-tour="intel-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                '-mb-px border-b-2 px-3 pb-2 text-[13px] transition-colors',
                tab === t.key ? 'border-[#0F2340] font-semibold text-[#0F2340]' : 'border-transparent text-ink-soft hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {tab === 'summary' && <InsightSummary job={job} agentName={agentName} />}
          {tab === 'raw' &&
            (job.mcp_job_id ? (
              <RawDataTab job={job} />
            ) : (
              <p className="py-12 text-center text-[13px] text-ink-faint">Data mentah tersedia setelah job diterima MCP.</p>
            ))}
          {tab === 'log' && <JobLog job={job} />}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Batalkan job?"
        confirmLabel="Batalkan job"
        danger
        pending={actions.cancel.isPending}
        onConfirm={runCancel}
      >
        Job <b className="text-ink">“{job.title}”</b> akan dihentikan. Data yang sudah terkumpul tetap tersimpan sebagai hasil parsial bila
        tersedia.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Hapus job?"
        confirmLabel="Hapus"
        danger
        pending={actions.remove.isPending}
        onConfirm={runDelete}
      >
        Job <b className="text-ink">“{job.title}”</b> beserta laporannya akan dihapus dari Dashboard. Job yang masih berjalan akan
        dibatalkan terlebih dahulu.
      </ConfirmDialog>
      {retryKey !== null && (
        <JobWizard
          key={retryKey}
          workspaceId={workspace.id}
          open
          retryOf={job}
          onOpenChange={(o) => !o && setRetryKey(null)}
          onCreated={(id) => {
            setRetryKey(null);
            navigate(`${base}/${id}`);
          }}
        />
      )}
    </div>
  );
}

function ExportMenu({
  job,
  workspaceName,
  agentName,
}: {
  job: IntelJob;
  workspaceName: string;
  agentName: (id: string) => string | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (format: 'pdf' | 'xlsx') => {
    setBusy(true);
    try {
      const { exportIntelReport } = await import('../lib/intel-export');
      await exportIntelReport(job, format, workspaceName, agentName);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover
      align="end"
      trigger={
        <Button variant="outline" disabled={!job.insight || busy} data-tour="intel-export">
          {busy ? <Spinner /> : <Download size={14} />} Ekspor
        </Button>
      }
    >
      <MenuItem onSelect={() => void run('pdf')}>
        <FileText size={14} /> Laporan PDF
      </MenuItem>
      <MenuItem onSelect={() => void run('xlsx')}>
        <FileSpreadsheet size={14} /> Workbook Excel (XLSX)
      </MenuItem>
      <div className="px-2 py-1.5 text-[11px] text-ink-faint">CSV data mentah ada di tab Data mentah.</div>
    </Popover>
  );
}

const EVENT_LABEL: Record<string, string> = {
  'intel.job.started': 'Job dimulai',
  'intel.job.stage.started': 'Tahap dimulai',
  'intel.job.progress': 'Progres',
  'intel.job.stage.completed': 'Tahap selesai',
  'intel.job.completed': 'Job selesai',
  'intel.job.failed': 'Job gagal',
  'intel.job.cancelled': 'Job dibatalkan',
  'intel.job.warning': 'Peringatan',
};

function JobLog({ job }: { job: IntelJob }) {
  const { data, isLoading, error } = useJobEvents(job.id, true);
  if (isLoading) return <Spinner />;
  if (error) return <p className="text-[13px] text-[#C2410C]">{errorMessage(error)}</p>;
  const events = data ?? [];
  return (
    <Card>
      <ol className="relative space-y-3 border-l border-line pl-5">
        <LogItem time={job.created_at} title="Job dibuat di Dashboard" />
        {events.map((e) => (
          <LogItem
            key={e.event_id}
            time={e.received_at}
            title={EVENT_LABEL[e.event_type] ?? e.event_type}
            meta={e.event_type}
            rejected={e.status === 'rejected'}
          />
        ))}
        {events.length === 0 && <li className="text-[12px] text-ink-faint">Belum ada event dari MCP.</li>}
      </ol>
    </Card>
  );
}

function LogItem({ time, title, meta, rejected }: { time: string; title: string; meta?: string; rejected?: boolean }) {
  return (
    <li className="relative">
      <span
        className={cn(
          'absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full border-2 border-white',
          rejected ? 'bg-[#C2410C]' : 'bg-[#0E9384]',
        )}
        aria-hidden
      />
      <div className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
        <span className="w-36 shrink-0 text-[12px] text-ink-faint tabular-nums">{formatDateTime(time)}</span>
        <span className="font-medium text-ink">{title}</span>
        {meta && <code className="text-[11px] text-ink-faint">{meta}</code>}
        {rejected && <span className="text-[11px] text-[#C2410C]">ditolak</span>}
      </div>
    </li>
  );
}
