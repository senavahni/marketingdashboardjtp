import { useEffect } from 'react';
import { Database, Library, Sparkles } from 'lucide-react';
import { useIntelAgents, useStageDefaults } from '../../hooks/intel-queries';
import { errorMessage } from '../../lib/api';
import { formatTokens } from '../../lib/intel-format';
import { STAGE_LABEL, type SelectableStage } from '../../lib/intel-types';
import { agentOption, defaultAgentId, enabledSources, type DraftErrors, type WizardDraft } from '../../lib/intel-wizard';
import { cn } from '../../lib/utils';
import { ActorAvatar } from '../ui/avatar';
import { Spinner } from '../ui/misc';
import { FieldError } from './IntelUi';

const STAGES: { stage: SelectableStage; icon: typeof Database; hint: string }[] = [
  { stage: 'collect', icon: Database, hint: 'Mengambil data dari sumber yang dipilih' },
  { stage: 'analyze', icon: Sparkles, hint: 'Menilai sentimen, tren, dan menyusun ringkasan' },
  { stage: 'index', icon: Library, hint: 'Menyimpan post & ringkasan agar bisa dicari agent lain (kb_search)' },
];

type Props = { draft: WizardDraft; errors: DraftErrors; workspaceId: string; onChange: (fn: (d: WizardDraft) => WizardDraft) => void };

export function WizardAgentStep({ draft, errors, workspaceId, onChange }: Props) {
  const agents = useIntelAgents(workspaceId);
  const { data: defaults, isLoading: defaultsLoading } = useStageDefaults(workspaceId);
  const sources = enabledSources(draft);

  // Isi default sekali data agent & stage-defaults tersedia (pilihan user tidak ditimpa)
  useEffect(() => {
    if (!agents.data || defaultsLoading) return;
    const collect = draft.agents.collect || defaultAgentId(agents.data, 'collect', sources, defaults);
    const analyze = draft.agents.analyze || defaultAgentId(agents.data, 'analyze', sources, defaults);
    const index = draft.saveToKb ? draft.agents.index || defaultAgentId(agents.data, 'index', sources, defaults) : draft.agents.index;
    if (collect !== draft.agents.collect || analyze !== draft.agents.analyze || index !== draft.agents.index)
      onChange((d) => ({ ...d, agents: { collect, analyze, ...(index ? { index } : {}) } }));
  }, [agents.data, defaults, defaultsLoading, draft.agents, draft.saveToKb, sources, onChange]);

  if (agents.isLoading) return <Spinner />;
  if (agents.error) return <p className="text-[13px] text-[#C2410C]">{errorMessage(agents.error)}</p>;
  const list = [...(agents.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const stages = STAGES.filter(({ stage }) => stage !== 'index' || draft.saveToKb);

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-white p-4 hover:border-[#0E9384]">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[#0E9384]"
          checked={draft.saveToKb}
          onChange={(e) => onChange((d) => ({ ...d, saveToKb: e.target.checked }))}
        />
        <span>
          <span className="block text-[13px] font-semibold text-ink">Simpan ke Knowledge Base</span>
          <span className="block text-[12px] text-ink-faint">
            Post & ringkasan disimpan ke KB workspace agar bisa dipakai agent lain (mis. @Agent_Strategist menyusun kalender konten).
            Menambah biaya embedding kecil.
          </span>
        </span>
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        {stages.map(({ stage, icon: Icon, hint }) => {
          const anySelectable = list.some((a) => !agentOption(a, stage, sources).disabled);
          return (
            <fieldset key={stage} className="rounded-2xl border border-line bg-[#FAFBFC] p-4">
              <legend className="sr-only">{STAGE_LABEL[stage]}</legend>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F2340] text-white">
                  <Icon size={15} />
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-ink">{STAGE_LABEL[stage]}</div>
                  <div className="text-[11px] text-ink-faint">{hint}</div>
                </div>
              </div>
              {!anySelectable && (
                <p className="mb-2 rounded-lg bg-[#FDECE7] px-3 py-2 text-[12px] text-[#9A3412]">
                  Belum ada agent yang mampu untuk tahap ini. Tambahkan atau aktifkan agent di <b>Pengaturan → AI Agents</b>.
                </p>
              )}
              <div role="radiogroup" aria-label={STAGE_LABEL[stage]} className="space-y-1.5">
                {list.map((a) => {
                  const { disabled, reason } = agentOption(a, stage, sources);
                  const checked = draft.agents[stage] === a.id;
                  return (
                    <label
                      key={a.id}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border bg-white px-3 py-2 transition-all',
                        disabled ? 'cursor-not-allowed border-line opacity-55' : 'cursor-pointer hover:border-[#0E9384]',
                        checked && 'border-[#0E9384] shadow-[0_0_0_3px_rgba(14,147,132,0.12)]',
                      )}
                    >
                      <input
                        type="radio"
                        name={`agent-${stage}`}
                        className="sr-only"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => onChange((d) => ({ ...d, agents: { ...d.agents, [stage]: a.id } }))}
                      />
                      <ActorAvatar type="agent" name={a.name} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">{a.name}</span>
                        <span className="block truncate text-[11px] text-ink-faint">
                          {disabled
                            ? reason
                            : [a.route && `route ${a.route}`, a.run_token_budget && `budget ${formatTokens(a.run_token_budget)} token`]
                                .filter(Boolean)
                                .join(' · ')}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'h-4 w-4 shrink-0 rounded-full border-2',
                          checked ? 'border-[#0E9384] bg-[radial-gradient(circle,#0E9384_45%,transparent_50%)]' : 'border-line-strong',
                        )}
                        aria-hidden
                      />
                    </label>
                  );
                })}
              </div>
              <FieldError message={errors[`agents.${stage}`]} />
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
