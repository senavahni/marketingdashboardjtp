import { useQueryClient } from '@tanstack/react-query';
import { Bot, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { toast } from 'sonner';
import { MiPage } from '../../components/mi/MiPage';
import { StateView, stateFromError } from '../../components/mi/StateView';
import { ActorAvatar } from '../../components/ui/avatar';
import { intelKeys, useIntelAgents } from '../../hooks/intel-queries';
import { api, errorMessage } from '../../lib/api';
import { CAPABILITY_LABEL, KEY_SOURCE_LABEL } from '../../lib/intel-types';
import { qk } from '../../lib/query-client';
import type { WorkspaceSummary } from '../../lib/types';

/** 6 agent default v1.0.0 (V1-K17) — urutan & tugas sama dengan hub `mcp/documentation/v1.0.0/README.md` §4. */
export const DEFAULT_AGENT_ROLES = [
  { key: 'researcher', role: 'Social listening, kata kunci, X/Threads/Trends' },
  { key: 'analyst', role: 'Analisis produk → industri/segmen, insight, product-fit' },
  { key: 'strategist', role: 'Strategi digital marketing & content brief' },
  { key: 'creative', role: 'Bank konten: ide, hook, caption, CTA, brief visual' },
  { key: 'curator', role: 'Knowledge card, knowledge graph, doktrin — setia teks buku' },
  { key: 'prospector', role: 'Import, discovery, Contact Finder, enrichment perusahaan' },
] as const;

/** Agent Workspace → Agent (DSH-V1-04): status 6 agent default + "Tambah agent default" (idempoten). */
export function AgentTeamPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const qc = useQueryClient();
  const agents = useIntelAgents(workspace.id);
  const [busy, setBusy] = useState(false);
  const isAdmin = workspace.role === 'owner' || workspace.role === 'admin';
  const byKey = new Map(agents.data?.map((a) => [a.mcp_agent_key, a]));
  const missing = DEFAULT_AGENT_ROLES.filter((d) => !byKey.has(d.key));

  const bootstrap = async () => {
    setBusy(true);
    try {
      const res = await api<{ created: string[]; defaults: string[] }>(`/workspaces/${workspace.id}/intel/agents/bootstrap`, { method: 'POST' });
      toast.success(res.created.length ? `Ditambahkan: ${res.created.join(', ')}` : 'Semua agent default sudah ada');
      await Promise.all([qc.invalidateQueries({ queryKey: intelKeys.agents(workspace.id) }), qc.invalidateQueries({ queryKey: qk.agents(workspace.id) }), qc.invalidateQueries({ queryKey: intelKeys.stageDefaults(workspace.id) })]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MiPage
      eyebrow={<><Bot size={14} /> Agent Workspace</>}
      title="Agent"
      description="Enam agent default menjalankan semua kind job tanpa konfigurasi manual. Key Gateway per agent & biaya diatur di Pengaturan → AI & Gateway."
      actions={
        isAdmin && (
          <button type="button" disabled={busy} onClick={() => void bootstrap()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0F2340] px-4 text-sm font-medium text-white hover:bg-[#1a3560] disabled:opacity-50">
            <Bot size={15} /> {busy ? 'Menambahkan…' : `Tambah agent default${missing.length ? ` (${missing.length})` : ''}`}
          </button>
        )
      }
    >
      {agents.isLoading ? (
        <StateView kind="loading" />
      ) : agents.error ? (
        <StateView kind={stateFromError(agents.error)} error={agents.error} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {DEFAULT_AGENT_ROLES.map((d) => {
            const a = byKey.get(d.key);
            return (
              <li key={d.key} className={`rounded-2xl border bg-white p-4 ${a ? 'border-[#E3E7ED]' : 'border-dashed border-[#D5DBE3]'}`}>
                <div className="flex items-center gap-2">
                  <ActorAvatar type="agent" name={a?.name ?? d.key} size={28} />
                  <div className="min-w-0">
                    <p className="font-semibold text-[#0F2340]" lang="en">
                      {d.key}
                    </p>
                    <p className="text-[12px] text-ink-soft">{a ? a.name : 'Belum ditambahkan'}</p>
                  </div>
                  {a?.route && <span className="ml-auto rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-700">route {a.route}</span>}
                </div>
                <p className="mt-2 text-[13px] text-ink">{d.role}</p>
                {a && (
                  <>
                    {a.reason && <p className="mt-2 text-[12px] font-medium text-[#B45309]">⚠ {a.reason === 'UNKNOWN_AGENT' ? 'Profil tidak dikenal MCP' : 'Profil nonaktif di MCP'}</p>}
                    <p className="mt-2 flex flex-wrap gap-1">
                      {a.capabilities.map((c) => (
                        <span key={c} className="rounded-md bg-[#E6F4F2] px-1.5 py-0.5 text-[11px] text-[#0B7A6E]">
                          {CAPABILITY_LABEL[c] ?? c}
                        </span>
                      ))}
                    </p>
                    {a.gateway_key && (
                      <p className="mt-2 flex items-center gap-1 text-[12px] text-ink-soft">
                        <KeyRound size={12} aria-hidden /> {KEY_SOURCE_LABEL[a.gateway_key.source]} {a.gateway_key.prefix && <code className="text-[11px]">{a.gateway_key.prefix}…</code>}
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </MiPage>
  );
}
