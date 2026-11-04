import { Check, Database, Library, Sparkles, X } from 'lucide-react';
import { CAPABILITY_LABEL, type CostView, type JobStage } from '../../lib/intel-types';
import {
  STAGE_STATUS_LABEL,
  formatCount,
  formatDuration,
  formatTokens,
  formatUsd,
  sortStages,
  stageDurationSeconds,
} from '../../lib/intel-format';
import { cn } from '../../lib/utils';
import { ActorAvatar } from '../ui/avatar';
import { ProgressBar } from './IntelUi';

const ICON = { collect: Database, analyze: Sparkles, index: Library } as const;
const COLOR = { collect: '#1D5FA8', analyze: '#6D28D9', index: '#0E9384' } as const;

/** Timeline tahap horizontal: Kumpulkan → Analisis (→ Indeks), dengan agent, progres, durasi, biaya. */
export function StageTimeline({
  stages,
  cost,
  agentName,
}: {
  stages: JobStage[];
  cost: CostView | null;
  agentName: (id: string) => string | undefined;
}) {
  const ordered = sortStages(stages);
  return (
    <ol className="grid gap-3" style={{ gridTemplateColumns: `repeat(${ordered.length}, minmax(0, 1fr))` }} aria-label="Tahap job">
      {ordered.map((s, i) => {
        const Icon = ICON[s.stage];
        const color = COLOR[s.stage];
        const running = s.status === 'running';
        const done = s.status === 'completed' || s.status === 'skipped';
        const failed = s.status === 'failed';
        const stageCost = cost?.by_stage.find((c) => c.stage === s.stage);
        const seconds = stageDurationSeconds(s.started_at, s.finished_at);
        const name = agentName(s.agent_id) ?? s.agent_key;
        return (
          <li key={s.stage} className="relative">
            {i < ordered.length - 1 && (
              <span
                className={cn(
                  'absolute top-5 left-[calc(50%+1.25rem)] h-0.5 w-[calc(100%-1.75rem)]',
                  done ? 'bg-[#0E9384]' : 'bg-[#E3E7ED]',
                )}
                aria-hidden
              />
            )}
            <div className="flex flex-col items-center text-center">
              <span
                className={cn(
                  'relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white transition-colors',
                  running && 'intel-ring',
                )}
                style={{
                  borderColor: failed ? '#C2410C' : done || running ? color : '#E3E7ED',
                  color: failed ? '#C2410C' : done || running ? color : '#9AA5B5',
                }}
              >
                {done ? <Check size={18} strokeWidth={3} /> : failed ? <X size={18} strokeWidth={3} /> : <Icon size={17} />}
              </span>
              <div className="mt-2 text-[13px] font-semibold text-ink">{CAPABILITY_LABEL[s.stage]}</div>
              <div className="text-[11px] text-ink-faint">{STAGE_STATUS_LABEL[s.status]}</div>
            </div>
            <div className="mt-3 rounded-xl border border-line bg-white p-3">
              <div className="flex items-center gap-2">
                <ActorAvatar type="agent" name={name} size={22} />
                <span className="truncate text-[12px] font-medium text-ink">{name}</span>
              </div>
              <ProgressBar className="mt-2.5" done={s.progress_done} total={s.progress_total} live={running} color={color} />
              <dl className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
                <div>
                  <dt className="text-ink-faint">Progres</dt>
                  <dd className="font-medium text-ink tabular-nums">
                    {formatCount(s.progress_done)}
                    {s.progress_total ? `/${formatCount(s.progress_total)}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Durasi</dt>
                  <dd className="font-medium text-ink tabular-nums">{seconds === null ? '—' : formatDuration(seconds)}</dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Biaya</dt>
                  <dd
                    className="font-medium text-ink tabular-nums"
                    title={stageCost ? `${formatTokens(stageCost.llm_tokens)} token` : undefined}
                  >
                    {stageCost ? formatUsd(stageCost.usd_llm) : '—'}
                  </dd>
                </div>
              </dl>
              {s.error && <p className="mt-2 rounded-md bg-[#FDECE7] px-2 py-1 text-[11px] text-[#9A3412]">{s.error.message}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
