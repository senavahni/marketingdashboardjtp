import { Bot } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { Job13StatusBadge } from '../../components/mi/badges';
import { CostPair } from '../../components/mi/CostKpi';
import { MiPage } from '../../components/mi/MiPage';
import { StateView, stateFromError } from '../../components/mi/StateView';
import { useJobs13 } from '../../hooks/mi-queries';
import { KIND_LABEL, stageLabel } from '../../lib/mi-format';
import { JOB_KINDS, type JobKind } from '../../lib/mi-types';
import type { WorkspaceSummary } from '../../lib/types';
import { timeAgo } from '../../lib/utils';

/** Daftar job kontrak 1.3 semua kind (Agent Workspace → Job). Filter agent & aksi massal: DSH-V1-13. */
export function Jobs13Page() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const [kind, setKind] = useState<JobKind | 'all'>('all');
  const jobs = useJobs13(workspace.id, kind);
  const list = jobs.data?.data ?? [];
  return (
    <MiPage eyebrow={<><Bot size={14} /> Agent Workspace</>} title="Job agent" description="Semua job Market Intelligence: discovery, import, Contact Finder, social listening, ingest buku, scoring, strategi, dan bank konten.">
      <div className="mb-3 flex items-center gap-2">
        <label htmlFor="kind-filter" className="text-[13px] text-ink-soft">
          Kind
        </label>
        <select id="kind-filter" value={kind} onChange={(e) => setKind(e.target.value as JobKind | 'all')} className="h-8 rounded-lg border border-line-strong bg-white px-2 text-[13px]">
          <option value="all">Semua</option>
          {JOB_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      {jobs.isLoading ? (
        <StateView kind="loading" />
      ) : jobs.error ? (
        <StateView kind={stateFromError(jobs.error)} error={jobs.error} />
      ) : list.length === 0 ? (
        <StateView kind={kind === 'all' ? 'empty' : 'filtered-empty'} title={kind === 'all' ? 'Belum ada job agent' : undefined}>
          Mulai dari <Link className="text-[#1D5FA8] underline" to={`/w/${workspace.id}/companies/import`}>Import data</Link> atau{' '}
          <Link className="text-[#1D5FA8] underline" to={`/w/${workspace.id}/knowledge`}>upload buku</Link>.
        </StateView>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E3E7ED] bg-white">
          <table className="w-full text-[13px]">
            <thead className="bg-[#F5F7FA] text-left text-[11px] tracking-[0.06em] text-ink-soft uppercase">
              <tr>
                <th scope="col" className="px-4 py-2">Judul</th>
                <th scope="col" className="px-2 py-2">Kind</th>
                <th scope="col" className="px-2 py-2">Tahap</th>
                <th scope="col" className="px-2 py-2">Status</th>
                <th scope="col" className="px-4 py-2">Biaya</th>
              </tr>
            </thead>
            <tbody>
              {list.map((j) => {
                const current = j.stages.find((s) => ['running', 'paused', 'awaiting_review'].includes(s.status));
                return (
                  <tr key={j.id} className="border-t border-[#EEF1F5] hover:bg-[#FAFBFC]">
                    <td className="px-4 py-2.5">
                      <Link to={`/w/${workspace.id}/agents/jobs/${j.id}`} className="font-medium text-[#0F2340] hover:underline">
                        {j.title}
                      </Link>
                      <span className="block text-[11px] text-ink-faint">{timeAgo(j.created_at)}</span>
                    </td>
                    <td className="px-2 py-2.5 text-ink-soft">{KIND_LABEL[j.kind]}</td>
                    <td className="px-2 py-2.5 text-ink-soft">{current ? stageLabel(current.stage) : '—'}</td>
                    <td className="px-2 py-2.5">
                      <Job13StatusBadge status={j.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <CostPair estimate={j.estimate ? j.estimate.llm.usd_est + j.estimate.external.usd : null} actual={j.cost ? j.cost.usd_llm + j.cost.usd_external : 0} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </MiPage>
  );
}
