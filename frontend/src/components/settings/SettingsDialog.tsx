import { useQueryClient } from '@tanstack/react-query';
import { Bot, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAgents, useMembers } from '../../hooks/queries';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { qk } from '../../lib/query-client';
import type { Agent, Role } from '../../lib/types';
import { cn } from '../../lib/utils';
import { ActorAvatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' };

/** Pengaturan workspace: anggota (RBAC) & registry AI Agent (UC7). */
export function SettingsDialog({ open, onOpenChange, workspaceId, role }: { open: boolean; onOpenChange: (o: boolean) => void; workspaceId: string; role: Role }) {
  const [tab, setTab] = useState<'members' | 'agents'>('members');
  const isAdmin = role === 'owner' || role === 'admin';
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Pengaturan workspace" className="max-w-2xl">
      <div className="mb-4 flex gap-4 border-b border-line text-[13px]">
        {(['members', 'agents'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('-mb-px pb-2', tab === t ? 'border-b-2 border-ink font-medium' : 'text-ink-soft')}>
            {t === 'members' ? 'Anggota' : 'AI Agents'}
          </button>
        ))}
      </div>
      {tab === 'members' ? <Members workspaceId={workspaceId} isAdmin={isAdmin} /> : <Agents workspaceId={workspaceId} isAdmin={isAdmin} />}
    </Dialog>
  );
}

function Members({ workspaceId, isAdmin }: { workspaceId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const { data } = useMembers(workspaceId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const refresh = () => qc.invalidateQueries({ queryKey: qk.members(workspaceId) });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div>
      {isAdmin && (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api(`/workspaces/${workspaceId}/members`, { method: 'POST', body: { email, role } }), 'Anggota ditambahkan').then(() => setEmail(''));
          }}
        >
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="Email user terdaftar" className="flex-1 rounded-md border border-line-strong px-2.5 py-1.5 text-[13px] outline-none focus:border-accent" />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-md border border-line-strong px-2 text-[13px]">
            {(['admin', 'member', 'viewer'] as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <Button type="submit" variant="primary">
            Undang
          </Button>
        </form>
      )}
      <div className="divide-y divide-line">
        {data?.map((m) => (
          <div key={m.user.id} className="flex items-center gap-3 py-2 text-[13px]">
            <ActorAvatar type="user" name={m.user.display_name} size={28} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {m.user.display_name} {m.user.id === me?.id && <span className="text-ink-faint">(Anda)</span>}
              </div>
              <div className="text-[12px] text-ink-faint">{m.user.email}</div>
            </div>
            {isAdmin && m.role !== 'owner' ? (
              <>
                <select
                  value={m.role}
                  onChange={(e) => void run(() => api(`/workspaces/${workspaceId}/members/${m.user.id}`, { method: 'PATCH', body: { role: e.target.value } }), 'Role diperbarui')}
                  className="rounded border border-line px-1.5 py-1"
                >
                  {(['admin', 'member', 'viewer'] as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button
                  aria-label="Keluarkan"
                  className="rounded p-1 text-ink-faint hover:bg-hover hover:text-red-600"
                  onClick={() => confirm(`Keluarkan ${m.user.display_name}?`) && void run(() => api(`/workspaces/${workspaceId}/members/${m.user.id}`, { method: 'DELETE' }), 'Anggota dikeluarkan')}
                >
                  <Trash2 size={14} />
                </button>
              </>
            ) : (
              <span className="text-ink-soft">{ROLE_LABEL[m.role]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Agents({ workspaceId, isAdmin }: { workspaceId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data } = useAgents(workspaceId, true);
  const [form, setForm] = useState<Partial<Agent> | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: qk.agents(workspaceId) });
  const save = async () => {
    if (!form) return;
    const body = { name: form.name, handle: form.handle, mcp_agent_key: form.mcp_agent_key, description: form.description || null };
    try {
      if (form.id) await api(`/agents/${form.id}`, { method: 'PATCH', body });
      else await api(`/workspaces/${workspaceId}/agents`, { method: 'POST', body });
      toast.success('Agent disimpan');
      setForm(null);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const toggle = async (a: Agent) => {
    try {
      await api(`/agents/${a.id}`, { method: 'PATCH', body: { is_active: !a.is_active } });
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div>
      <div className="divide-y divide-line">
        {data?.map((a) => (
          <div key={a.id} className={cn('flex items-center gap-3 py-2 text-[13px]', !a.is_active && 'opacity-50')}>
            <ActorAvatar type="agent" name={a.name} size={28} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {a.name} <span className="text-ink-faint">@{a.handle}</span>
              </div>
              <div className="truncate text-[12px] text-ink-faint">
                MCP key: <code>{a.mcp_agent_key}</code>
                {a.description && ` · ${a.description}`}
              </div>
            </div>
            {isAdmin && (
              <>
                <Button size="sm" onClick={() => setForm(a)}>
                  Ubah
                </Button>
                <label className="flex items-center gap-1 text-[12px]">
                  <input type="checkbox" checked={a.is_active} onChange={() => void toggle(a)} /> Aktif
                </label>
              </>
            )}
          </div>
        ))}
        {!data?.length && <div className="py-4 text-[13px] text-ink-faint">Belum ada agent.</div>}
      </div>
      {isAdmin &&
        (form ? (
          <div className="mt-4 space-y-2 rounded-lg border border-line p-3">
            <div className="flex items-center gap-1.5 text-[13px] font-medium">
              <Bot size={14} /> {form.id ? 'Ubah agent' : 'Agent baru'}
            </div>
            {(
              [
                ['name', 'Nama (mis. Agent_Strategist)'],
                ['handle', 'Handle untuk @mention'],
                ['mcp_agent_key', 'MCP agent key (nama agent di MCP Server)'],
                ['description', 'Deskripsi singkat'],
              ] as const
            ).map(([k, ph]) => (
              <input
                key={k}
                value={(form[k] as string) ?? ''}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                placeholder={ph}
                className="w-full rounded-md border border-line-strong px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
              />
            ))}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setForm(null)}>Batal</Button>
              <Button variant="primary" onClick={() => void save()}>
                Simpan
              </Button>
            </div>
          </div>
        ) : (
          <Button className="mt-3" onClick={() => setForm({})}>
            <Plus size={14} /> Tambah agent
          </Button>
        ))}
    </div>
  );
}
