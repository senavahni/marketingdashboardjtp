import { ChartGantt, Columns3, FileText, Plus, Search, Table2, UserCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useParams, useSearchParams } from 'react-router';
import { ActivityFeed } from '../components/collab/ActivityFeed';
import { Comments } from '../components/collab/Comments';
import { BlockEditor } from '../components/editor/BlockEditor';
import { TaskPanel } from '../components/task/TaskPanel';
import { Button } from '../components/ui/button';
import { EmptyState, FullPageSpinner } from '../components/ui/misc';
import { Popover } from '../components/ui/popover';
import { BoardView } from '../components/views/BoardView';
import { TableView } from '../components/views/TableView';
import { TimelineView } from '../components/views/TimelineView';
import { ViewContext } from '../components/views/view-context';
import { useCreateTask, useProject, useTasks, useUpdateProject } from '../hooks/queries';
import { useAuth } from '../lib/auth-store';
import { useRealtimeRoom } from '../lib/realtime';
import type { WorkspaceSummary } from '../lib/types';
import { cn } from '../lib/utils';

const VIEWS = [
  { key: 'brief', label: 'Brief', icon: FileText },
  { key: 'table', label: 'Tabel', icon: Table2 },
  { key: 'board', label: 'Board', icon: Columns3 },
  { key: 'timeline', label: 'Timeline', icon: ChartGantt },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

const EMOJIS = ['📄', '🚀', '📈', '🎯', '📣', '🗓️', '💡', '🧪', '🛍️', '🎨', '📊', '🤖', '📝', '🔥', '⭐', '🌱', '🏆', '📦', '🧭', '💬'];

/** Halaman project ala database Notion: ikon + judul, tab view (Brief/Tabel/Board/Timeline), side peek task. */
export function ProjectPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as ViewKey) || 'table';
  const peekId = params.get('p');
  const me = useAuth((s) => s.user);
  const { data: project, isLoading, error } = useProject(projectId);
  const { data: tasks } = useTasks(projectId);
  const updateProject = useUpdateProject(workspace.id);
  const createTask = useCreateTask(projectId);
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [title, setTitle] = useState('');
  useRealtimeRoom('project', projectId);
  useEffect(() => setTitle(project?.title ?? ''), [project?.title]);

  const role = project?.my_role ?? workspace.role;
  const canEdit = role !== 'viewer';
  const setParam = (k: string, v: string | null) =>
    setParams(
      (p) => {
        if (v === null) p.delete(k);
        else p.set(k, v);
        return p;
      },
      { replace: k === 'p' ? false : true },
    );
  const openTask = (id: string) => setParam('p', id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && peekId && !document.querySelector('[role="dialog"]') && setParam('p', null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekId]);

  const filtered = useMemo(() => {
    let list = tasks ?? [];
    if (q.trim()) list = list.filter((t) => t.title.toLowerCase().includes(q.trim().toLowerCase()));
    if (mine) list = list.filter((t) => t.assignee?.id === me?.id);
    return list;
  }, [tasks, q, mine, me?.id]);

  if (isLoading) return <FullPageSpinner />;
  if (error || !project) return <EmptyState icon="🔍" title="Proyek tidak ditemukan">Mungkin sudah dihapus atau Anda tidak memiliki akses.</EmptyState>;

  const ctx = { workspaceId: workspace.id, projectId, role, canEdit, openTask };

  return (
    <ViewContext.Provider value={ctx}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-11 shrink-0 items-center px-12 text-[13px] text-ink-soft">
          <span className="truncate">
            {workspace.name} / {project.icon} {project.title}
          </span>
        </div>
        <div className={cn('flex min-h-0 flex-1 flex-col px-12', view === 'brief' && 'overflow-y-auto')}>
          {/* Header halaman */}
          <div className="pt-6">
            <Popover
              trigger={
                <button disabled={!canEdit} className="mb-2 rounded-lg p-1 text-5xl leading-none enabled:hover:bg-hover" aria-label="Ubah ikon">
                  {project.icon || '📄'}
                </button>
              }
            >
              <div className="grid grid-cols-5 gap-1 p-1">
                {EMOJIS.map((e) => (
                  <button key={e} className="rounded p-1 text-2xl hover:bg-hover" onClick={() => updateProject.mutate({ id: projectId, icon: e })}>
                    {e}
                  </button>
                ))}
              </div>
            </Popover>
            <input
              value={title}
              readOnly={!canEdit}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== project.title && updateProject.mutate({ id: projectId, title: title.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              placeholder="Tanpa judul"
              className="mb-3 w-full bg-transparent text-[40px] leading-tight font-bold outline-none placeholder:text-stone-300"
            />
          </div>

          {/* Tab view + aksi */}
          <div className="flex items-center gap-1 border-b border-line">
            {VIEWS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setParam('view', key)}
                className={cn('-mb-px inline-flex items-center gap-1.5 border-b-2 px-2 py-2 text-[14px]', view === key ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink')}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
            {view !== 'brief' && (
              <div className="ml-auto flex items-center gap-1 pb-1">
                <div className="flex items-center gap-1 rounded px-1.5 text-ink-faint focus-within:bg-hover">
                  <Search size={14} />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" className="w-28 bg-transparent py-1 text-[13px] text-ink outline-none focus:w-40" />
                </div>
                <button onClick={() => setMine(!mine)} className={cn('inline-flex items-center gap-1 rounded px-2 py-1 text-[13px] text-ink-soft hover:bg-hover', mine && 'bg-sky-50 text-accent')}>
                  <UserCheck size={14} /> Milik saya
                </button>
                {canEdit && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => createTask.mutate({ body: { title: 'Tanpa judul', status: 'todo' } }, { onSuccess: (t) => openTask(t.id) })}
                  >
                    <Plus size={14} /> Baru
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Konten view */}
          <div className={cn('flex min-h-0 flex-1 flex-col pt-3', view !== 'brief' && 'pb-4')}>
            {view === 'brief' && (
              <div className="max-w-[900px] pb-24">
                <p className="mb-6 text-[13px] text-ink-faint">Dokumen brief project — konteks utama yang dibaca AI Agent. Ketik “/” untuk memilih blok, “@” untuk mention.</p>
                <BlockEditor workspaceId={workspace.id} projectId={projectId} taskId={null} readOnly={!canEdit} />
                <div className="mt-12 grid gap-8 border-t border-line pt-4 md:grid-cols-2">
                  <div>
                    <div className="mb-3 text-[13px] font-medium">Diskusi</div>
                    <Comments workspaceId={workspace.id} entityType="project" entityId={projectId} canComment={canEdit} canModerate={role === 'owner' || role === 'admin'} />
                  </div>
                  <div>
                    <div className="mb-3 text-[13px] font-medium">Aktivitas proyek</div>
                    <ActivityFeed type="project" id={projectId} />
                  </div>
                </div>
              </div>
            )}
            {view !== 'brief' && !tasks && <FullPageSpinner />}
            {view === 'table' && tasks && <TableView tasks={filtered} />}
            {view === 'board' && tasks && <BoardView tasks={filtered} />}
            {view === 'timeline' && tasks && <TimelineView tasks={filtered} />}
          </div>
        </div>
      </div>

      {/* Side peek (gaya Notion): klik di luar / Esc untuk menutup */}
      {peekId && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setParam('p', null)} />
          <div className="fixed top-0 right-0 bottom-0 z-40 w-[min(760px,58vw)] border-l border-line bg-white shadow-[-8px_0_30px_rgba(15,15,15,0.12)]">
            <TaskPanel
              key={peekId}
              workspaceId={workspace.id}
              taskId={peekId}
              role={role}
              mode="peek"
              onClose={() => setParam('p', null)}
              onOpenTask={(id) => openTask(id)}
            />
          </div>
        </>
      )}
    </ViewContext.Provider>
  );
}
