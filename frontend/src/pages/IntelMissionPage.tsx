import { ArrowLeft, Bot } from 'lucide-react';
import { Link, useOutletContext, useParams } from 'react-router';
import { Card } from '../components/intel/IntelUi';
import { MissionBody, ScheduleLink } from '../components/intel/MissionCard';
import { EmptyState, FullPageSpinner } from '../components/ui/misc';
import { useMission } from '../hooks/intel-queries';
import { errorMessage } from '../lib/api';
import type { WorkspaceSummary } from '../lib/types';

/** Detail misi agent (M3_TASK_014 Fase A): perintah, status, dan panel tinjauan rencana. */
export function IntelMissionPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const { missionId = '' } = useParams();
  const { data: mission, isLoading, error } = useMission(missionId);
  const back = `/w/${workspace.id}/agents/missions`;

  if (isLoading) return <FullPageSpinner />;
  if (!mission)
    return (
      <EmptyState icon="🧭" title="Misi tidak ditemukan">
        <p className="text-[13px]">{error ? errorMessage(error) : null}</p>
        <Link to={back} className="text-[13px] text-[#1D5FA8] hover:underline">
          Kembali ke daftar misi
        </Link>
      </EmptyState>
    );

  return (
    <div className="h-full overflow-y-auto bg-[linear-gradient(180deg,#F5F7FA_0,#fff_320px)]">
      <div className="mx-auto max-w-4xl px-8 pt-8 pb-16">
        <Link to={back} className="mb-4 inline-flex items-center gap-1 text-[13px] text-ink-soft hover:text-ink">
          <ArrowLeft size={14} /> Misi Agent
        </Link>
        <h1 className="mb-1 text-[26px] leading-tight font-semibold tracking-tight text-[#0F2340]">{mission.title}</h1>
        <p className="mb-6 flex items-center gap-1.5 text-[13px] text-ink-soft">
          <Bot size={14} /> Perintah ke {mission.agent.name}
        </p>
        <Card className="mb-4" title="Perintah">
          <p className="text-[13px] whitespace-pre-line text-ink">{mission.instruction}</p>
        </Card>
        <Card title="Rencana" action={<ScheduleLink mission={mission} />}>
          <MissionBody mission={mission} canEdit={workspace.role !== 'viewer'} />
        </Card>
      </div>
    </div>
  );
}
