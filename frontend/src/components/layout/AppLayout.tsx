import { PanelLeft } from 'lucide-react';
import { Navigate, Outlet, useParams } from 'react-router';
import { useWorkspaces } from '../../hooks/queries';
import { useUi } from '../../lib/ui-store';
import { RealtimeBridge } from '../collab/RealtimeBridge';
import { IconButton } from '../ui/button';
import { FullPageSpinner } from '../ui/misc';
import { Sidebar } from './Sidebar';

/** Kerangka aplikasi: sidebar workspace + konten. */
export function AppLayout() {
  const { workspaceId } = useParams();
  const { data: workspaces, isLoading } = useWorkspaces();
  const { sidebarOpen, toggleSidebar } = useUi();
  if (isLoading) return <FullPageSpinner />;
  const ws = workspaces?.find((w) => w.id === workspaceId);
  if (!ws) return workspaces?.length ? <Navigate to={`/w/${workspaces[0].id}`} replace /> : <FullPageSpinner />;

  return (
    <div className="flex h-full">
      <RealtimeBridge />
      {sidebarOpen && <Sidebar workspaceId={ws.id} role={ws.role} />}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {!sidebarOpen && (
          <IconButton label="Buka sidebar" onClick={toggleSidebar} className="absolute top-2.5 left-2 z-20">
            <PanelLeft size={16} />
          </IconButton>
        )}
        <Outlet context={{ workspace: ws }} />
      </main>
    </div>
  );
}
