import { AlertTriangle, Clock3, Coins, Cpu } from 'lucide-react';
import type { ReactNode } from 'react';
import { useIntelAgents } from '../../hooks/intel-queries';
import { errorMessage } from '../../lib/api';
import { CAPABILITY_LABEL, type Capability, type Estimate } from '../../lib/intel-types';
import { formatCount, formatDuration, formatTokens, formatUsd, SOURCE_META } from '../../lib/intel-format';
import { Spinner } from '../ui/misc';
import { AgentChain, SourceChip } from './IntelUi';

const MODE_LABEL = { api: 'API', browser: 'Browser', unofficial: 'Tidak resmi', none: 'Tidak tersedia' } as const;

type Props = {
  workspaceId: string;
  estimate: Estimate | undefined;
  isFetching: boolean;
  error: unknown;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
};

export function WizardEstimateStep({ workspaceId, estimate, isFetching, error, confirmed, onConfirm }: Props) {
  const { data: agents } = useIntelAgents(workspaceId);
  const nameOf = (key: string) => agents?.find((a) => a.mcp_agent_key === key)?.name ?? key;

  if (error) return <p className="rounded-xl bg-[#FDECE7] px-4 py-3 text-[13px] text-[#9A3412]">{errorMessage(error)}</p>;
  if (!estimate)
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-[13px] text-ink-soft">
        <Spinner className="h-6 w-6" /> Menghitung estimasi…
      </div>
    );

  const external = estimate.sources.reduce((s, x) => s + x.usd_external, 0);
  const total = external + estimate.llm.usd_est;

  return (
    <div className={isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={isFetching}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<Clock3 size={15} />} label="Perkiraan durasi" value={formatDuration(estimate.seconds)} />
        <Stat
          icon={<Cpu size={15} />}
          label="Token LLM"
          value={formatTokens(estimate.llm.tokens_est)}
          sub={formatUsd(estimate.llm.usd_est)}
        />
        <Stat
          icon={<Coins size={15} />}
          label="Total biaya perkiraan"
          value={formatUsd(total)}
          sub={`eksternal ${formatUsd(external)}`}
          highlight
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line p-4">
          <div className="mb-2 text-[12px] font-semibold text-ink">Per sumber</div>
          <ul className="space-y-2 text-[13px]">
            {estimate.sources.map((s) => (
              <li key={s.type} className="flex items-center gap-2">
                <SourceChip type={s.type} />
                <span className="text-[11px] text-ink-faint">{MODE_LABEL[s.mode]}</span>
                <span className="ml-auto tabular-nums">{formatCount(s.external_units)} unit</span>
                <span className="w-16 text-right text-ink-soft tabular-nums">{formatUsd(s.usd_external)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-line p-4">
          <div className="mb-2 text-[12px] font-semibold text-ink">Per tahap & agent</div>
          <ul className="space-y-2 text-[13px]">
            {estimate.llm.by_stage.map((s) => (
              <li key={s.stage} className="flex items-center gap-2">
                <span className="w-16 text-[12px] text-ink-soft">{CAPABILITY_LABEL[s.stage as Capability] ?? s.stage}</span>
                <AgentChain names={[nameOf(s.agent_key)]} />
                <span className="rounded border border-line px-1 text-[10px] text-ink-faint">{s.route}</span>
                <span className="ml-auto tabular-nums">{formatTokens(s.tokens_est)} tok</span>
              </li>
            ))}
            {estimate.llm.by_stage.length === 0 && <li className="text-ink-faint">Tidak ada pemakaian LLM.</li>}
          </ul>
        </div>
      </div>

      {estimate.warnings.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {estimate.warnings.map((w) => (
            <li key={w.code} className="flex gap-2 rounded-lg bg-[#FEF6E7] px-3 py-2 text-[12px] text-[#92400E]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w.message}
            </li>
          ))}
        </ul>
      )}

      {estimate.requires_confirmation && (
        <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-[#F0B67F] bg-[#FFFAF3] px-4 py-3 text-[13px] text-ink">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[#C2410C]"
            checked={confirmed}
            onChange={(e) => onConfirm(e.target.checked)}
          />
          <span>
            Saya memahami job ini menimbulkan biaya sekitar <b>{formatUsd(total)}</b> dan menyetujui untuk menjalankannya.
          </span>
        </label>
      )}
      <p className="mt-3 text-[11px] text-ink-faint">
        Estimasi dihitung ulang otomatis setiap kali sumber, batas, atau agent berubah. Sumber:{' '}
        {estimate.sources.map((s) => SOURCE_META[s.type].label).join(', ')}.
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? 'rounded-xl bg-[#0F2340] p-4 text-white' : 'rounded-xl bg-[#F5F7FA] p-4'}>
      <div
        className={
          highlight ? 'flex items-center gap-1.5 text-[11px] text-white/70' : 'flex items-center gap-1.5 text-[11px] text-ink-soft'
        }
      >
        {icon} {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className={highlight ? 'text-[11px] text-white/70' : 'text-[11px] text-ink-faint'}>{sub}</div>}
    </div>
  );
}
