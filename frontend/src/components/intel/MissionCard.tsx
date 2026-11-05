import { AlertTriangle, Bot, CalendarClock, Check, ExternalLink, PencilLine, RotateCcw, User, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useJobMission, useMissionAction } from '../../hooks/intel-queries';
import { errorMessage } from '../../lib/api';
import { formatUsd, missionTaskHref, planCounts } from '../../lib/intel-format';
import { MISSION_STATUS_LABEL, type Mission, type MissionPlan, type MissionStatus } from '../../lib/intel-types';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Spinner } from '../ui/misc';
import { Card } from './IntelUi';

const STATUS_TONE: Partial<Record<MissionStatus, string>> = {
  awaiting_review: 'bg-[#FFF4E5] text-[#9A5B00]',
  scheduled: 'bg-[#E7F6F3] text-[#0B7A6E]',
  failed: 'bg-[#FDECE7] text-[#9A3412]',
  cancelled: 'bg-[#EEF1F5] text-ink-soft',
};

type Props = { jobId: string; canEdit: boolean };

/** Kartu "Jadwal" detail job (M3_TASK_013): status misi, tautan Penjadwalan, dan panel tinjauan rencana. */
export function MissionCard({ jobId, canEdit }: Props) {
  const { data: mission } = useJobMission(jobId);
  if (!mission) return null;
  const counts = planCounts(mission.plan);
  const busy = mission.status === 'waiting_research' || mission.status === 'planning';
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <CalendarClock size={15} /> Jadwal
        </span>
      }
      action={
        <Link to={missionTaskHref(mission.workspace_id, mission.project_id, mission.root_task_id)} className="inline-flex items-center gap-1 text-[12px] font-medium text-[#0E9384] hover:underline">
          Buka di Penjadwalan <ExternalLink size={12} />
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-soft">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium', STATUS_TONE[mission.status] ?? 'bg-[#EEF4FF] text-[#1D4ED8]')}>
          {busy && <Spinner className="h-3 w-3" />}
          {MISSION_STATUS_LABEL[mission.status]}
        </span>
        <span>Planner: {mission.agent.name}</span>
        <span>· Mode: {mission.approval_mode === 'auto' ? 'Langsung jalan' : 'Tinjau dulu'}</span>
        <span>
          · Timeline {mission.start_date} – {mission.end_date}
        </span>
        {mission.cost_usd > 0 && <span>· Biaya planning {formatUsd(mission.cost_usd)}</span>}
      </div>
      {mission.status === 'waiting_research' && <p className="mt-3 text-[13px] text-ink-soft">Task tindak lanjut disusun agent setelah riset selesai.</p>}
      {mission.status === 'failed' && mission.error && (
        <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[#FDECE7] px-3 py-2 text-[12px] text-[#9A3412]">
          <span>{mission.error.message}</span>
          {canEdit && <RetryButton jobId={jobId} missionId={mission.id} />}
        </div>
      )}
      {mission.status === 'scheduled' && (
        <p className="mt-3 text-[13px] text-ink">
          <b>{counts.tasks}</b> task + <b>{counts.subtasks}</b> subtask tindak lanjut sudah ditulis ke Penjadwalan ({counts.byAgent} ditandai untuk agent).
        </p>
      )}
      {mission.status === 'awaiting_review' && mission.plan && <ReviewPanel jobId={jobId} mission={mission} plan={mission.plan} canEdit={canEdit} />}
    </Card>
  );
}

function RetryButton({ jobId, missionId }: { jobId: string; missionId: string }) {
  const action = useMissionAction(jobId);
  return (
    <Button
      size="sm"
      disabled={action.isPending}
      onClick={() =>
        action.mutate({ id: missionId, action: 'retry' }, { onSuccess: () => toast.success('Agent menyusun ulang rencana'), onError: (e) => toast.error(errorMessage(e)) })
      }
    >
      <RotateCcw size={13} /> Coba lagi
    </Button>
  );
}

function ReviewPanel({ jobId, mission, plan, canEdit }: { jobId: string; mission: Mission; plan: MissionPlan; canEdit: boolean }) {
  const action = useMissionAction(jobId);
  const [feedback, setFeedback] = useState<string | null>(null);
  const run = (kind: 'approve' | 'revise' | 'cancel', ok: string) =>
    action.mutate(
      { id: mission.id, action: kind, feedback: feedback ?? undefined },
      { onSuccess: () => (toast.success(ok), setFeedback(null)), onError: (e) => toast.error(errorMessage(e)) },
    );
  return (
    <div className="mt-4 space-y-3">
      {plan.summary && <p className="text-[13px] text-ink">{plan.summary}</p>}
      {plan.risks.length > 0 && (
        <ul className="space-y-1">
          {plan.risks.map((r) => (
            <li key={r.message} className="flex gap-1.5 rounded-lg bg-[#FFF4E5] px-3 py-1.5 text-[12px] text-[#9A5B00]">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {r.message}
            </li>
          ))}
        </ul>
      )}
      <ol className="divide-y divide-line rounded-xl border border-line" aria-label="Rencana task">
        {plan.tasks.map((t) => (
          <li key={t.ref} className="px-3 py-2">
            <PlanRow title={t.title} start={t.start_date} end={t.end_date} executor={t.executor} strong />
            {t.subtasks.length > 0 && (
              <ul className="mt-1 space-y-0.5 border-l border-line pl-3">
                {t.subtasks.map((s) => (
                  <li key={s.ref}>
                    <PlanRow title={s.title} start={s.start_date} end={s.end_date} executor={s.executor} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {canEdit && feedback !== null && (
        <textarea
          aria-label="Masukan revisi"
          className="w-full rounded-lg border border-line-strong p-2 text-[13px] outline-none focus:border-[#0E9384]"
          rows={3}
          maxLength={1000}
          placeholder="Mis. kurangi jadi 5 task, fokus ke konten Instagram"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      )}
      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => run('cancel', 'Rencana dibatalkan')} disabled={action.isPending}>
            <X size={14} /> Batalkan
          </Button>
          {feedback === null ? (
            <Button onClick={() => setFeedback('')} disabled={action.isPending || mission.revisions_left === 0} title={`Sisa revisi: ${mission.revisions_left}`}>
              <PencilLine size={14} /> Revisi
            </Button>
          ) : (
            <Button onClick={() => run('revise', 'Agent menyusun ulang rencana')} disabled={action.isPending || !feedback.trim()}>
              <PencilLine size={14} /> Kirim revisi
            </Button>
          )}
          <Button variant="primary" onClick={() => run('approve', 'Rencana ditulis ke Penjadwalan')} disabled={action.isPending}>
            <Check size={14} /> Setujui
          </Button>
        </div>
      )}
    </div>
  );
}

function PlanRow({ title, start, end, executor, strong }: { title: string; start: string; end: string; executor: 'agent' | 'human'; strong?: boolean }) {
  const Icon = executor === 'agent' ? Bot : User;
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <Icon size={13} className="shrink-0 text-ink-faint" aria-label={executor === 'agent' ? 'Dikerjakan agent' : 'Dikerjakan manusia'} />
      <span className={cn('min-w-0 flex-1 truncate', strong ? 'font-medium text-ink' : 'text-ink-soft')}>{title}</span>
      <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
        {start === end ? start : `${start} – ${end}`}
      </span>
    </div>
  );
}
