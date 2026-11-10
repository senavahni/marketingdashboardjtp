import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, useLocation, useParams, type RouteObject } from 'react-router';
import { FullPageSpinner } from '../../components/ui/misc';
import { ComingSoonPage as ComingSoon } from './ComingSoonPage';

const page = (load: () => Promise<{ default: ComponentType }>) => {
  const C = lazy(load);
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <C />
    </Suspense>
  );
};
const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, key: K) => page(() => load().then((m) => ({ default: m[key] })));

const IntelPage = () => named(() => import('../IntelPage'), 'IntelPage');
const IntelSourcesPage = () => named(() => import('../IntelSourcesPage'), 'IntelSourcesPage');
const IntelMissionsPage = () => named(() => import('../IntelMissionsPage'), 'IntelMissionsPage');
const IntelMissionPage = () => named(() => import('../IntelMissionPage'), 'IntelMissionPage');

/** Redirect URL lama Modul 3 → `/agents/*` tanpa kehilangan parameter & query (keputusan PO #3, §B.2). */
function LegacyRedirect({ to }: { to: (p: Record<string, string | undefined>) => string }) {
  const params = useParams();
  const { search } = useLocation();
  return <Navigate to={`/w/${params.workspaceId}${to(params)}${search}`} replace />;
}

/** Rute v1.0.0 di bawah `/w/:workspaceId` (V1_TASK_003_UIUX §B.2). */
export const miRoutes: RouteObject[] = [
  {
    path: 'agents',
    element: named(() => import('./AgentsLayout'), 'AgentsLayout'),
    children: [
      { index: true, element: <IntelPage /> },
      { path: 'jobs', element: named(() => import('./Jobs13Page'), 'Jobs13Page') },
      { path: 'jobs/:jobId', element: named(() => import('./Job13Page'), 'JobRoute') },
      { path: 'approvals', element: named(() => import('./ApprovalsPage'), 'ApprovalsPage') },
      { path: 'missions', element: <IntelMissionsPage /> },
      { path: 'missions/:missionId', element: <IntelMissionPage /> },
      { path: 'team', element: named(() => import('./AgentTeamPage'), 'AgentTeamPage') },
    ],
  },
  { path: 'companies/import', element: named(() => import('./ImportPage'), 'ImportPage') },
  { path: 'companies/import/:batchId', element: named(() => import('./ImportBatchPage'), 'ImportBatchPage') },
  { path: 'companies/contact-finder', element: named(() => import('./ContactFinderPage'), 'ContactFinderPage') },
  { path: 'knowledge', element: named(() => import('./KnowledgePage'), 'KnowledgePage') },
  { path: 'data/sources', element: <IntelSourcesPage /> },
  { path: 'data', element: <LegacyRedirect to={() => '/data/sources'} /> },
  {
    path: 'companies',
    element: <ComingSoon title="Company Intelligence" taskId="DSH-V1-07" description="Daftar, peta (MapLibre), profil, dan kontak perusahaan/instansi." links={[{ to: '/companies/import', label: 'Import data' }, { to: '/companies/contact-finder', label: 'Contact Finder' }]} />,
  },
  { path: 'overview', element: <ComingSoon title="Executive Overview" taskId="DSH-V1-12" description="KPI, distribusi industri & provinsi, top opportunity, job aktif, konten terjadwal." /> },
  { path: 'market', element: <ComingSoon title="Market Intelligence" taskId="DSH-V1-07/08" description="Peta industri KBLI/ISIC, segmen, dan Social Listening." /> },
  { path: 'opportunities', element: <ComingSoon title="Opportunity Center" taskId="DSH-V1-10" description="Skor yang dapat diaudit, kanban workflow, dan Opportunity Map." /> },
  { path: 'strategy', element: <ComingSoon title="AI Strategy Studio" taskId="DSH-V1-11" description="Strategi digital marketing bersitasi data & buku, review, lalu aksi." /> },
  { path: 'content', element: <ComingSoon title="Bank Konten" taskId="DSH-V1-11" description="Ide & draf post per platform, kalender, review, sitasi buku." /> },
  // URL lama Modul 3 (§B.2)
  { path: 'intel', element: <LegacyRedirect to={() => '/agents'} /> },
  { path: 'intel/sources', element: <LegacyRedirect to={() => '/data/sources'} /> },
  { path: 'intel/missions', element: <LegacyRedirect to={() => '/agents/missions'} /> },
  { path: 'intel/missions/:missionId', element: <LegacyRedirect to={(p) => `/agents/missions/${p.missionId}`} /> },
  { path: 'intel/:jobId', element: <LegacyRedirect to={(p) => `/agents/jobs/${p.jobId}`} /> },
];
