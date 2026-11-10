import { ArrowLeft, Bot, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { Card, IntelHeader, primaryBtn } from '../components/intel/IntelUi';
import { MissionStatusBadge } from '../components/intel/MissionCard';
import { MissionFormDialog } from '../components/intel/MissionFormDialog';
import { EmptyState, Spinner } from '../components/ui/misc';
import { isIntelDisabled, useMissions } from '../hooks/intel-queries';
import { errorMessage } from '../lib/api';
import { planCounts } from '../lib/intel-format';
import type { WorkspaceSummary } from '../lib/types';

/** Misi Agent (M3_TASK_014 Fase A): daftar misi workspace + form "Perintah ke Agent". */
export function IntelMissionsPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const navigate = useNavigate();
  const [formKey, setFormKey] = useState<number | null>(null);
  const missions = useMissions(workspace.id);
  const canCreate = workspace.role !== 'viewer';
  const base = `/w/${workspace.id}/agents`;

  if (isIntelDisabled(missions.error)) return <EmptyState icon="🛰️" title="Modul Riset & Insight belum diaktifkan" />;

  return (
    <div className="h-full overflow-y-auto bg-[linear-gradient(180deg,#F5F7FA_0,#fff_280px)]">
      <div className="mx-auto max-w-5xl px-8 pt-8 pb-16">
        <Link to={base} className="mb-4 inline-flex items-center gap-1 text-[13px] text-ink-soft hover:text-ink">
          <ArrowLeft size={14} /> Riset & Insight
        </Link>
        <IntelHeader
          eyebrow={
            <>
              <Bot size={14} /> Agent
            </>
          }
          title="Misi Agent"
          description="Beri perintah, tujuan, dan timeline. Agent menyusun task & subtask di Penjadwalan dan menandai bagian yang bisa ia kerjakan."
          actions={
            canCreate && (
              <button type="button" data-tour="mission-new" className={primaryBtn} onClick={() => setFormKey(Date.now())}>
                <Send size={15} /> Perintah ke Agent
              </button>
            )
          }
        />

        {missions.isLoading ? (
          <Spinner className="h-6 w-6" />
        ) : missions.error ? (
          <p className="rounded-xl bg-[#FDECE7] px-4 py-3 text-[13px] text-[#9A3412]">{errorMessage(missions.error)}</p>
        ) : !missions.data?.length ? (
          <EmptyState icon="🤖" title="Belum ada misi">
            <p className="max-w-sm text-[13px]">Mulai dengan perintah seperti "Siapkan kampanye Harbolnas di Instagram & X dalam 2 minggu".</p>
          </EmptyState>
        ) : (
          <div className="space-y-3" data-tour="mission-list">
            {missions.data.map((m) => {
              const counts = planCounts(m.plan);
              const href = m.source === 'intel_job' && m.intel_job_id ? `${base}/jobs/${m.intel_job_id}` : `${base}/missions/${m.id}`;
              return (
                <Link key={m.id} to={href} className="block">
                  <Card className="transition-shadow hover:shadow-[0_4px_16px_rgba(15,35,64,0.08)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <MissionStatusBadge status={m.status} />
                          <span className="rounded-full bg-[#EEF1F5] px-2 py-0.5 text-[11px] text-ink-soft">{m.source === 'manual' ? 'Perintah' : 'Dari riset'}</span>
                        </div>
                        <h3 className="truncate text-[15px] font-semibold text-[#0F2340]">{m.title}</h3>
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-soft">{m.instruction}</p>
                      </div>
                      <div className="shrink-0 text-right text-[12px] text-ink-soft">
                        <div>
                          {m.start_date} – {m.end_date}
                        </div>
                        {m.plan && (
                          <div>
                            {counts.tasks} task · {counts.subtasks} subtask
                          </div>
                        )}
                        <div className="text-ink-faint">{m.agent.name}</div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      {formKey !== null && (
        <MissionFormDialog
          key={formKey}
          workspaceId={workspace.id}
          open
          onOpenChange={(o) => !o && setFormKey(null)}
          onCreated={(id) => navigate(`${base}/missions/${id}`)}
        />
      )}
    </div>
  );
}
