import './index.css';
import { MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { AppLayout } from './components/layout/AppLayout';
import { EmptyState, FullPageSpinner } from './components/ui/misc';
import { refreshSession } from './lib/api';
import { useAuth } from './lib/auth-store';
import { queryClient } from './lib/query-client';
import { LoginPage, loadMe, RegisterPage } from './pages/AuthPages';
import { ProjectPage } from './pages/ProjectPage';
import { TaskPage } from './pages/TaskPage';
import { WorkspaceHome } from './pages/WorkspaceHome';

/** Saat app dimuat: access token didapat dari refresh cookie (token tidak disimpan di storage). */
function useBootstrapAuth() {
  useEffect(() => {
    (async () => {
      if (await refreshSession()) {
        try {
          await loadMe();
          return;
        } catch {
          /* jatuh ke anonymous */
        }
      }
      useAuth.getState().setAnonymous();
    })();
  }, []);
}

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return children;
}

function HomeRedirect() {
  const workspaces = useAuth((s) => s.workspaces);
  return workspaces[0] ? <Navigate to={`/w/${workspaces[0].id}`} replace /> : <EmptyState icon="🗂️" title="Anda belum tergabung di workspace mana pun" />;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  return status === 'loading' ? <FullPageSpinner /> : children;
}

const router = createBrowserRouter([
  { path: '/login', element: <PublicOnly><LoginPage /></PublicOnly> },
  { path: '/register', element: <PublicOnly><RegisterPage /></PublicOnly> },
  { path: '/', element: <RequireAuth><HomeRedirect /></RequireAuth> },
  {
    path: '/w/:workspaceId',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <WorkspaceHome /> },
      { path: 'p/:projectId', element: <ProjectPage /> },
      { path: 't/:taskId', element: <TaskPage /> },
    ],
  },
  { path: '*', element: <EmptyState icon="🧭" title="Halaman tidak ditemukan" /> },
]);

function App() {
  useBootstrapAuth();
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster position="bottom-right" richColors closeButton visibleToasts={3} />
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
