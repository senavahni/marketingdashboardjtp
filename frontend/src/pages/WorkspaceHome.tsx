import { Plus } from 'lucide-react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { Button } from '../components/ui/button';
import { EmptyState, FullPageSpinner } from '../components/ui/misc';
import { useCreateProject, useProjects } from '../hooks/queries';
import { useAuth } from '../lib/auth-store';
import type { WorkspaceSummary } from '../lib/types';
import { timeAgo } from '../lib/utils';

export function WorkspaceHome() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const { data, isLoading } = useProjects(workspace.id);
  const create = useCreateProject(workspace.id);
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: workspace.timezone }).format(new Date()));
  const greet = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';
  const canEdit = workspace.role !== 'viewer';

  if (isLoading) return <FullPageSpinner />;
  return (
    <div className="overflow-y-auto">
      <div className="mx-auto max-w-4xl px-12 py-14">
        <h1 className="mb-8 text-center text-3xl font-bold">
          {greet}, {user?.display_name?.split(' ')[0]}
        </h1>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-ink-soft">Proyek di {workspace.name}</h2>
          {canEdit && (
            <Button variant="primary" size="sm" onClick={() => create.mutate({ title: 'Tanpa judul', icon: '📄' }, { onSuccess: (p) => navigate(`/w/${workspace.id}/p/${p.id}?view=table`) })}>
              <Plus size={14} /> Proyek baru
            </Button>
          )}
        </div>
        {!data?.length ? (
          <EmptyState icon="🗂️" title="Belum ada proyek">
            {canEdit ? 'Buat proyek pertama untuk mulai mengelola task bersama tim & AI Agent.' : 'Minta admin menambahkan proyek.'}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {data.map((p) => (
              <Link key={p.id} to={`/w/${workspace.id}/p/${p.id}`} className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,15,15,0.05)] transition hover:bg-stone-50">
                <div className="mb-3 text-3xl">{p.icon || '📄'}</div>
                <div className="truncate font-semibold">{p.title}</div>
                <div className="mt-1 text-[12px] text-ink-faint">
                  {p.task_count} task · diubah {timeAgo(p.updated_at)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
