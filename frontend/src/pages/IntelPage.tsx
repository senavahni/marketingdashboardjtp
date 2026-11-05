import { Bot, Database, PlugZap, Plus, Radar, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { AgentChain, Card, IntelHeader, JobStatusBadge, ProgressBar, SourceChips, primaryBtn } from '../components/intel/IntelUi';
import { JobWizard } from '../components/intel/JobWizard';
import { Button } from '../components/ui/button';
import { EmptyState, Spinner } from '../components/ui/misc';
import { isIntelDisabled, useIntelJobs, useIntelRealtime, type JobFilters } from '../hooks/intel-queries';
import { useAgents } from '../hooks/queries';
import { errorMessage } from '../lib/api';
import {
  JOB_STATUS_META,
  SOURCE_META,
  SOURCE_TYPES,
  activeStage,
  actualUsd,
  estimateUsd,
  formatCount,
  formatPeriod,
  formatUsd,
  isActiveStatus,
  sortStages,
} from '../lib/intel-format';
import type { IntelJob, JobStatus } from '../lib/intel-types';
import type { WorkspaceSummary } from '../lib/types';
import { cn, timeAgo } from '../lib/utils';

const selectClass = 'h-8 rounded-lg border border-line-strong bg-white px-2 text-[13px] outline-none focus:border-[#0E9384]';

export function IntelPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<JobFilters>({});
  const [wizardKey, setWizardKey] = useState<number | null>(null);
  const jobs = useIntelJobs(workspace.id, filters);
  const { data: agents } = useAgents(workspace.id, true);
  useIntelRealtime(workspace.id);

  const list = jobs.data?.pages.flatMap((p) => p.data) ?? [];
  const agentName = (id: string) => agents?.find((a) => a.id === id)?.name;
  const canCreate = workspace.role !== 'viewer';
  const openWizard = () => setWizardKey(Date.now());
  const base = `/w/${workspace.id}/intel`;

  if (isIntelDisabled(jobs.error)) {
    return (
      <EmptyState icon="🛰️" title="Modul Riset & Insight belum diaktifkan">
        <p className="max-w-sm text-[13px]">
          Admin perlu mengisi <code>MCP_INTEL_API_KEY</code> di konfigurasi backend agar Dashboard dapat menjalankan riset lewat MCP.
        </p>
      </EmptyState>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[linear-gradient(180deg,#F5F7FA_0,#fff_280px)]">
      <div className="mx-auto max-w-6xl px-8 pt-10 pb-16">
        <IntelHeader
          eyebrow={
            <>
              <Radar size={14} /> Modul 3
            </>
          }
          title="Riset & Insight"
          description="Kumpulkan percakapan dari X, Threads, web, dan Google Trends, lalu biarkan AI Agent merangkum sentimen, tren, dan rekomendasinya."
          actions={
            <>
              <Link
                to={`${base}/sources`}
                data-tour="intel-sources"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:bg-hover"
              >
                <PlugZap size={15} /> Sumber & Koneksi
              </Link>
              <Link
                to={`${base}/missions`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:bg-hover"
              >
                <Bot size={15} /> Misi Agent
              </Link>
              {canCreate && (
                <button type="button" data-tour="intel-new" onClick={openWizard} className={primaryBtn}>
                  <Plus size={16} /> Job Baru
                </button>
              )}
            </>
          }
        />

        <SummaryStrip jobs={list} />

        <div className="mb-3 flex flex-wrap items-center gap-2" data-tour="intel-filters">
          <select
            aria-label="Filter status"
            className={selectClass}
            value={filters.status ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: (e.target.value || undefined) as JobStatus | undefined }))}
          >
            <option value="">Semua status</option>
            {(Object.keys(JOB_STATUS_META) as JobStatus[]).map((s) => (
              <option key={s} value={s}>
                {JOB_STATUS_META[s].label}
              </option>
            ))}
          </select>
          <div className="flex gap-1" role="group" aria-label="Filter sumber">
            {SOURCE_TYPES.map((t) => {
              const on = filters.source === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilters((f) => ({ ...f, source: on ? undefined : t }))}
                  className={cn(
                    'h-8 rounded-lg border px-2.5 text-[12px] transition-colors',
                    on ? 'border-transparent text-white' : 'border-line-strong bg-white text-ink-soft hover:text-ink',
                  )}
                  style={on ? { background: SOURCE_META[t].color } : undefined}
                >
                  {SOURCE_META[t].label}
                </button>
              );
            })}
          </div>
        </div>

        {jobs.isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : jobs.isError ? (
          <EmptyState icon="⚠️" title="Gagal memuat job riset">
            <p className="text-[13px]">{errorMessage(jobs.error)}</p>
            <Button variant="outline" onClick={() => void jobs.refetch()}>
              Coba lagi
            </Button>
          </EmptyState>
        ) : list.length === 0 ? (
          filters.status || filters.source ? (
            <EmptyState icon="🔎" title="Tidak ada job yang cocok dengan filter" />
          ) : (
            <Onboarding canCreate={canCreate} onCreate={openWizard} />
          )
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#E3E7ED] bg-white" data-tour="intel-list">
            <table className="w-full text-[13px]">
              <thead className="bg-[#F5F7FA] text-[11px] tracking-wide text-ink-soft uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold">
                    Judul
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                    Sumber
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                    Agent
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                    Data
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                    Biaya
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((job) => (
                  <JobRow key={job.id} job={job} agentName={agentName} onOpen={() => navigate(`${base}/${job.id}`)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {jobs.hasNextPage && (
          <div className="mt-3 flex justify-center">
            <Button variant="outline" onClick={() => void jobs.fetchNextPage()} disabled={jobs.isFetchingNextPage}>
              {jobs.isFetchingNextPage && <Spinner />} Muat lebih banyak
            </Button>
          </div>
        )}
      </div>

      {wizardKey !== null && (
        <JobWizard
          key={wizardKey}
          workspaceId={workspace.id}
          open
          onOpenChange={(o) => !o && setWizardKey(null)}
          onCreated={(id) => navigate(`${base}/${id}`)}
        />
      )}
    </div>
  );
}

function JobRow({ job, agentName, onOpen }: { job: IntelJob; agentName: (id: string) => string | undefined; onOpen: () => void }) {
  const stage = activeStage(job);
  const actual = actualUsd(job);
  const estimate = estimateUsd(job);
  return (
    <tr onClick={onOpen} className="group cursor-pointer border-t border-line transition-colors hover:bg-[#F8FAFB]">
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={onOpen}
          className="block max-w-[22rem] truncate text-left font-medium text-ink outline-none group-hover:text-[#0F2340] focus-visible:underline"
        >
          {job.title}
        </button>
        <div className="text-[11px] text-ink-faint">
          {formatPeriod(job.spec.period)} · dibuat {timeAgo(job.created_at)}
        </div>
      </td>
      <td className="px-3 py-3">
        <SourceChips sources={job.sources} compact />
      </td>
      <td className="px-3 py-3">
        <AgentChain names={sortStages(job.stages).map((s) => agentName(s.agent_id) ?? s.agent_key)} />
      </td>
      <td className="px-3 py-3">
        <JobStatusBadge status={job.status} />
        {stage && (
          <ProgressBar
            className="mt-1.5 w-32"
            done={stage.progress_done}
            total={stage.progress_total}
            live
            color={stage.stage === 'collect' ? '#1D5FA8' : '#6D28D9'}
          />
        )}
        {stage?.progress_total ? (
          <div className="mt-0.5 text-[10px] text-ink-faint tabular-nums">
            {formatCount(stage.progress_done)}/{formatCount(stage.progress_total)}
          </div>
        ) : null}
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{formatCount(job.total_items)}</td>
      <td className="px-4 py-3 text-right tabular-nums">
        <div className="font-medium text-ink">{actual !== null ? formatUsd(actual) : '—'}</div>
        {estimate !== null && <div className="text-[10px] text-ink-faint">est. {formatUsd(estimate)}</div>}
      </td>
    </tr>
  );
}

function SummaryStrip({ jobs }: { jobs: IntelJob[] }) {
  if (jobs.length === 0) return null;
  const active = jobs.filter((j) => isActiveStatus(j.status)).length;
  const done = jobs.filter((j) => j.status === 'completed').length;
  const items = jobs.reduce((s, j) => s + (j.total_items ?? 0), 0);
  const cost = jobs.reduce((s, j) => s + (actualUsd(j) ?? 0), 0);
  const tiles = [
    { label: 'Sedang berjalan', value: formatCount(active), color: '#1D5FA8', live: active > 0 },
    { label: 'Selesai', value: formatCount(done), color: '#0E9384' },
    { label: 'Data terkumpul', value: formatCount(items), color: '#7C3AED' },
    { label: 'Biaya aktual', value: formatUsd(cost), color: '#D97706' },
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="flex items-center gap-3 rounded-2xl border border-[#E3E7ED] bg-white px-4 py-3">
          <span className={cn('h-2.5 w-2.5 rounded-full', t.live && 'intel-ring')} style={{ background: t.color }} aria-hidden />
          <div>
            <div className="text-[11px] text-ink-soft">{t.label}</div>
            <div className="text-[20px] font-semibold tracking-tight text-[#0F2340] tabular-nums">{t.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Onboarding({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  const steps = [
    { icon: Database, title: 'Pilih sumber', body: 'X, Threads, halaman web, atau Google Trends — beserta keyword dan rentang waktunya.' },
    { icon: Bot, title: 'Tunjuk agent', body: 'Agent Researcher mengumpulkan data, Agent Analyst menilai sentimen & tren.' },
    { icon: Sparkles, title: 'Baca insight', body: 'Ringkasan eksekutif, rekomendasi, grafik, dan data mentah siap diekspor.' },
  ];
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid md:grid-cols-[1.1fr_1fr]">
        <div className="bg-[#0F2340] p-8 text-white">
          <p className="text-[12px] font-semibold tracking-[0.12em] text-[#5FD3C6] uppercase">Mulai di sini</p>
          <h2 className="mt-2 text-[24px] leading-tight font-semibold">Apa kata pasar tentang brand Anda minggu ini?</h2>
          <p className="mt-2 text-[13px] text-white/70">Buat job riset pertama — estimasi biaya ditampilkan sebelum apa pun dijalankan.</p>
          {canCreate && (
            <button
              type="button"
              onClick={onCreate}
              className="mt-6 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0E9384] px-4 text-sm font-medium text-white hover:bg-[#0B7A6E]"
            >
              <Plus size={16} /> Buat job pertama
            </button>
          )}
        </div>
        <ol className="space-y-4 p-8">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E6F4F2] text-[#0B7A6E]">
                <s.icon size={17} />
              </span>
              <div>
                <div className="text-[13px] font-semibold text-ink">
                  {i + 1}. {s.title}
                </div>
                <div className="text-[12px] leading-relaxed text-ink-soft">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
