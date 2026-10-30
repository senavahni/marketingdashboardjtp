import { Bot, ChevronsUpDown, GraduationCap, House, LogOut, MoreHorizontal, PanelLeftClose, Plus, Settings, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router';
import { useAgents, useCreateProject, useDeleteProject, useProjects, useWorkspaces } from '../../hooks/queries';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { queryClient } from '../../lib/query-client';
import { disconnectSocket } from '../../lib/realtime';
import { useTour } from '../../lib/tour-store';
import type { Role } from '../../lib/types';
import { useUi } from '../../lib/ui-store';
import { cn } from '../../lib/utils';
import { Inbox } from '../collab/Inbox';
import { SettingsDialog } from '../settings/SettingsDialog';
import { ActorAvatar } from '../ui/avatar';
import { IconButton } from '../ui/button';
import { MenuItem, MenuLabel, Popover } from '../ui/popover';

export function Sidebar({ workspaceId, role }: { workspaceId: string; role: Role }) {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const user = useAuth((s) => s.user);
  const { data: workspaces } = useWorkspaces();
  const { data: projects } = useProjects(workspaceId);
  const { data: agents } = useAgents(workspaceId, true);
  const createProject = useCreateProject(workspaceId);
  const deleteProject = useDeleteProject(workspaceId);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const startTour = useTour((s) => s.start);
  const [settings, setSettings] = useState(false);
  const current = workspaces?.find((w) => w.id === workspaceId);
  const canEdit = role !== 'viewer';

  const newProject = () =>
    createProject.mutate({ title: 'Tanpa judul', icon: '📄' }, { onSuccess: (p) => navigate(`/w/${workspaceId}/p/${p.id}?view=table`) });

  const newWorkspace = async () => {
    const name = prompt('Nama workspace baru');
    if (!name?.trim()) return;
    const ws = await api<{ id: string }>('/workspaces', { method: 'POST', body: { name: name.trim() } });
    await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    navigate(`/w/${ws.id}`);
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    disconnectSocket();
    queryClient.clear();
    useAuth.getState().setAnonymous();
    navigate('/login');
  };

  return (
    <aside className="group/sidebar flex h-full w-60 shrink-0 flex-col bg-sidebar text-[14px]">
      <div className="flex items-center gap-1 p-2">
        <Popover
          className="w-64"
          trigger={
            <button data-tour="workspace" className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 hover:bg-hover">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-stone-700 text-[11px] font-semibold text-white">{current?.name?.[0]?.toUpperCase() ?? 'W'}</span>
              <span className="truncate font-medium">{current?.name ?? 'Workspace'}</span>
              <ChevronsUpDown size={13} className="ml-auto shrink-0 text-ink-faint" />
            </button>
          }
        >
          <MenuLabel>{user?.email}</MenuLabel>
          {workspaces?.map((w) => (
            <MenuItem key={w.id} active={w.id === workspaceId} onSelect={() => navigate(`/w/${w.id}`)}>
              <span className="flex h-5 w-5 items-center justify-center rounded bg-stone-700 text-[11px] text-white">{w.name[0]?.toUpperCase()}</span>
              <span className="truncate">{w.name}</span>
              <span className="ml-auto text-[11px] text-ink-faint">{w.role}</span>
            </MenuItem>
          ))}
          <div className="my-1 border-t border-line" />
          <MenuItem onSelect={() => void newWorkspace()}>
            <Plus size={14} /> Buat workspace
          </MenuItem>
          <MenuItem onSelect={() => void logout()}>
            <LogOut size={14} /> Keluar
          </MenuItem>
        </Popover>
        <IconButton label="Tutup sidebar" onClick={toggleSidebar} className="opacity-0 group-hover/sidebar:opacity-100">
          <PanelLeftClose size={15} />
        </IconButton>
      </div>

      <nav className="space-y-0.5 px-2">
        <NavLink
          to={`/w/${workspaceId}`}
          end
          data-tour="nav-home"
          className={({ isActive }) => cn('flex items-center gap-2 rounded px-2 py-1 text-ink-soft hover:bg-hover', isActive && 'bg-hover text-ink')}
        >
          <House size={16} /> Beranda
        </NavLink>
        <div data-tour="inbox">
          <Inbox />
        </div>
        <button data-tour="settings" onClick={() => setSettings(true)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-ink-soft hover:bg-hover">
          <Settings size={16} /> Pengaturan
        </button>
        <button data-tour="tutorial" onClick={startTour} className="flex w-full items-center gap-2 rounded px-2 py-1 text-ink-soft hover:bg-hover">
          <GraduationCap size={16} /> Tutorial
        </button>
      </nav>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2">
        <div data-tour="projects">
          <div className="group/section flex items-center justify-between px-2 py-1 text-[12px] font-medium text-ink-faint">
            Proyek
            {canEdit && (
              <IconButton label="Proyek baru" onClick={newProject} className="opacity-0 group-hover/section:opacity-100">
                <Plus size={14} />
              </IconButton>
            )}
          </div>
          {projects?.map((p) => (
            <div key={p.id} className={cn('group/item flex items-center rounded hover:bg-hover', p.id === projectId && 'bg-hover')}>
              <NavLink to={`/w/${workspaceId}/p/${p.id}`} className={cn('flex min-w-0 flex-1 items-center gap-2 px-2 py-1', p.id === projectId ? 'font-medium text-ink' : 'text-ink-soft')}>
                <span className="w-5 shrink-0 text-center">{p.icon || '📄'}</span>
                <span className="truncate">{p.title}</span>
              </NavLink>
              {canEdit && (
                <Popover align="start" trigger={<IconButton label="Opsi" className="mr-1 opacity-0 group-hover/item:opacity-100"><MoreHorizontal size={14} /></IconButton>}>
                  <MenuItem
                    danger
                    onSelect={() =>
                      confirm(`Hapus proyek "${p.title}" beserta seluruh isinya?`) &&
                      deleteProject.mutate(p.id, { onSuccess: () => p.id === projectId && navigate(`/w/${workspaceId}`) })
                    }
                  >
                    <Trash2 size={14} /> Hapus proyek
                  </MenuItem>
                </Popover>
              )}
            </div>
          ))}
          {canEdit && (
            <button onClick={newProject} className="flex w-full items-center gap-2 rounded px-2 py-1 text-ink-faint hover:bg-hover">
              <Plus size={16} /> Proyek baru
            </button>
          )}
        </div>

        <div data-tour="agents" className="mt-4">
          <div className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-ink-faint">
            <Bot size={12} /> AI Agents
          </div>
          {agents?.map((a) => (
            <div key={a.id} title={a.description ?? ''} className={cn('flex items-center gap-2 rounded px-2 py-1 text-ink-soft', !a.is_active && 'opacity-50')}>
              <ActorAvatar type="agent" name={a.name} size={18} />
              <span className="truncate">{a.name}</span>
              {!a.is_active && <span className="ml-auto text-[10px]">nonaktif</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line p-3 text-[13px]">
        <ActorAvatar type="user" name={user?.display_name} size={22} />
        <span className="truncate">{user?.display_name}</span>
      </div>
      <SettingsDialog open={settings} onOpenChange={setSettings} workspaceId={workspaceId} role={role} />
    </aside>
  );
}
