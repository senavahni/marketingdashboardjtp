import { AlertTriangle, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { isIntelDisabled, useIntelAgents, useLlmStatus, useStageDefaults, useUpdateStageDefaults } from '../../hooks/intel-queries';
import { useRotateLlmKey } from '../../hooks/llm-key-queries';
import { errorMessage } from '../../lib/api';
import {
  CAPABILITY_LABEL,
  KEY_SOURCE_LABEL,
  STAGE_LABEL,
  capableFor,
  type IntelAgent,
  type LlmAgentStatus,
  type LlmStatus,
  type SelectableStage,
} from '../../lib/intel-types';
import { canRotateKey, rotationOutcome } from '../../lib/llm-keys';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Spinner } from '../ui/misc';

const STAGES: SelectableStage[] = ['collect', 'analyze', 'index'];
const KEY_STATUS_CLASS: Record<LlmAgentStatus['key_status'], string> = {
  active: 'bg-emerald-50 text-emerald-700',
  revoked: 'bg-stone-100 text-stone-600',
  invalid: 'bg-red-50 text-red-700',
  unknown: 'bg-amber-50 text-amber-700',
};

const usd = (v: number) => `$${v.toFixed(v < 1 ? 4 : 2)}`;
const num = (v: number) => v.toLocaleString('id-ID');

/** Badge kapabilitas & route LLM per agent untuk tab AI Agents (M3_TASK_008 §C). */
export function AgentIntelBadges({ agent }: { agent: IntelAgent | undefined }) {
  if (!agent) return null;
  if (agent.reason === 'UNKNOWN_AGENT') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
        <AlertTriangle size={12} /> MCP agent key tidak dikenal MCP
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {agent.reason === 'AGENT_INACTIVE' && (
        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">Nonaktif di MCP</span>
      )}
      {agent.capabilities.map((c) => (
        <span key={c} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700">
          {CAPABILITY_LABEL[c]}
        </span>
      ))}
      {agent.route && <span className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-soft">route {agent.route}</span>}
    </span>
  );
}

/** Settings → AI & Gateway (admin): default agent per tahap + key & pemakaian LLM Gateway (M3_TASK_009 §D). */
export function AiGatewaySettings({ workspaceId }: { workspaceId: string }) {
  const agents = useIntelAgents(workspaceId);
  if (agents.isLoading) return <Spinner />;
  if (isIntelDisabled(agents.error)) {
    return (
      <p className="text-[13px] text-ink-soft">
        Modul Intel belum diaktifkan. Isi <code>MCP_INTEL_API_KEY</code> di .env backend lalu restart.
      </p>
    );
  }
  if (agents.error) return <p className="text-[13px] text-red-600">{errorMessage(agents.error)}</p>;
  return (
    <div className="space-y-6">
      <StageDefaultsSection workspaceId={workspaceId} agents={agents.data ?? []} />
      <GatewaySection workspaceId={workspaceId} agents={agents.data ?? []} />
    </div>
  );
}

function StageDefaultsSection({ workspaceId, agents }: { workspaceId: string; agents: IntelAgent[] }) {
  const { data: defaults } = useStageDefaults(workspaceId);
  const update = useUpdateStageDefaults(workspaceId);
  const handleChange = (stage: SelectableStage, agentId: string) =>
    update.mutate(
      { [stage]: agentId },
      { onSuccess: () => toast.success(`Default ${STAGE_LABEL[stage]} disimpan`), onError: (e) => toast.error(errorMessage(e)) },
    );
  return (
    <section>
      <h3 className="mb-2 text-[13px] font-semibold">Default agent per tahap</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {STAGES.map((stage) => {
          const options = capableFor(agents, stage);
          return (
            <label key={stage} className="flex flex-col gap-1 text-[12px] text-ink-soft">
              {STAGE_LABEL[stage]}
              <select
                value={defaults?.[stage]?.id ?? ''}
                disabled={update.isPending || options.length === 0}
                onChange={(e) => handleChange(stage, e.target.value)}
                className="rounded-md border border-line-strong px-2 py-1.5 text-[13px] text-ink"
              >
                <option value="" disabled>
                  {options.length ? 'Pilih agent…' : 'Tidak ada agent yang mampu'}
                </option>
                {options.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">Hanya agent dengan kapabilitas tahap tersebut yang bisa dipilih.</p>
    </section>
  );
}

function GatewaySection({ workspaceId, agents }: { workspaceId: string; agents: IntelAgent[] }) {
  const [days, setDays] = useState<7 | 30>(7);
  const { data, isLoading, error } = useLlmStatus(workspaceId, days);
  const nameByKey = new Map(agents.map((a) => [a.mcp_agent_key, a.name]));
  const routeByKey = new Map(agents.map((a) => [a.mcp_agent_key, a.route]));
  const sharedKeys = data?.agents.filter((a) => a.key_source !== 'agent') ?? [];
  const [rotating, setRotating] = useState<{ agentKey: string; name: string } | null>(null);
  const rotate = useRotateLlmKey(workspaceId);
  const runRotate = () => {
    if (!rotating) return;
    const { agentKey, name } = rotating;
    rotate.mutate(agentKey, {
      onSuccess: (result) => {
        const { level, message } = rotationOutcome(name, result);
        if (level === 'success') toast.success(message);
        else toast.warning(message);
      },
      onError: (e) => toast.error(errorMessage(e)),
      onSettled: () => setRotating(null),
    });
  };
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <KeyRound size={14} /> LLM Gateway
        </h3>
        <div className="flex gap-1 text-[12px]">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn('rounded px-2 py-0.5', days === d ? 'bg-ink text-white' : 'text-ink-soft hover:bg-hover')}
            >
              {d} hari
            </button>
          ))}
        </div>
      </div>
      {isLoading && <Spinner />}
      {error && <p className="text-[13px] text-red-600">{errorMessage(error)}</p>}
      {data && (
        <>
          {sharedKeys.length > 0 && (
            <div className="mb-2 flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                {sharedKeys.map((a) => nameByKey.get(a.agent_key) ?? a.agent_key).join(', ')} belum punya key Gateway sendiri (memakai key
                system/env), sehingga biaya & rate limit tidak terpisah per agent. Jalankan <code>manage.py gateway-keys provision</code> di
                MCP.
              </span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-left text-ink-faint">
                <tr>
                  <th className="py-1 font-normal">Agent</th>
                  <th className="font-normal">Route</th>
                  <th className="font-normal">Key</th>
                  <th className="font-normal">Status</th>
                  <th className="text-right font-normal">Panggilan</th>
                  <th className="text-right font-normal">Token</th>
                  <th className="text-right font-normal">Biaya</th>
                  <th className="font-normal">
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.agents.map((a) => (
                  <tr key={a.agent_key} className="align-top">
                    <td className="py-1.5">
                      <div className="font-medium">{nameByKey.get(a.agent_key) ?? a.agent_key}</div>
                      {a.last_error && (
                        <div className="max-w-56 truncate text-[11px] text-red-600" title={a.last_error}>
                          {a.last_error}
                        </div>
                      )}
                    </td>
                    <td>{routeByKey.get(a.agent_key) ?? '—'}</td>
                    <td>
                      <div>{KEY_SOURCE_LABEL[a.key_source]}</div>
                      {a.key_prefix && <code className="text-[11px] text-ink-faint">{a.key_prefix}…</code>}
                    </td>
                    <td>
                      <span className={cn('rounded px-1.5 py-0.5 text-[11px]', KEY_STATUS_CLASS[a.key_status])}>{a.key_status}</span>
                    </td>
                    <td className="text-right tabular-nums">{num(a.usage.calls)}</td>
                    <td className="text-right tabular-nums">{num(a.usage.prompt_tokens + a.usage.completion_tokens)}</td>
                    <td className="text-right tabular-nums">{usd(a.usage.usd)}</td>
                    <td className="pl-2 text-right">
                      {canRotateKey(a) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={rotate.isPending}
                          aria-label={`Rotasi key ${nameByKey.get(a.agent_key) ?? a.agent_key}`}
                          onClick={() => setRotating({ agentKey: a.agent_key, name: nameByKey.get(a.agent_key) ?? a.agent_key })}
                        >
                          Rotasi key
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ProjectUsage project={data.project} />
        </>
      )}
      <ConfirmDialog
        open={rotating !== null}
        onOpenChange={(o) => !o && !rotate.isPending && setRotating(null)}
        title="Rotasi key Gateway?"
        confirmLabel="Rotasi key"
        danger
        pending={rotate.isPending}
        onConfirm={runRotate}
      >
        Key Gateway <b className="text-ink">{rotating?.name}</b> akan diganti dengan key baru. Key lama langsung tidak berlaku: job yang sedang
        berjalan dengan agent ini bisa gagal sesaat dan perlu dijalankan ulang.
      </ConfirmDialog>
    </section>
  );
}

function ProjectUsage({ project }: { project: LlmStatus['project'] }) {
  if (!project)
    return (
      <p className="mt-3 text-[12px] text-ink-faint">
        Pemakaian project Gateway tidak tersedia (Gateway tak terjangkau atau key system belum punya scope usage:read).
      </p>
    );
  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      <div className="mb-1 text-[12px] text-ink-soft">
        Project <code>{project.slug ?? '—'}</code> · {project.start} s/d {project.end}
      </div>
      {project.data.length === 0 ? (
        <div className="text-[12px] text-ink-faint">Belum ada pemakaian.</div>
      ) : (
        <table className="w-full text-[12px]">
          <tbody className="divide-y divide-line">
            {project.data.map((row, i) => (
              <tr key={String(row.model ?? i)}>
                <td className="py-1">{String(row.model ?? row.key ?? '—')}</td>
                <td className="text-right tabular-nums">{num(Number(row.requests ?? 0))} req</td>
                <td className="text-right tabular-nums">{usd(Number(row.cost_usd ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
