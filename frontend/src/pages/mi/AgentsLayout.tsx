import { NavLink, Outlet, useOutletContext } from 'react-router';
import { usePendingApprovalCount } from '../../hooks/mi-queries';
import type { WorkspaceSummary } from '../../lib/types';
import { cn } from '../../lib/utils';

type Ctx = { workspace: WorkspaceSummary };

/**
 * Agent Workspace (§D.9, keputusan PO #3): rumah baru halaman Intel Modul 3 di `/agents/*`.
 * Tab: Job v1 · Approval · Riset sosial (Modul 3) · Misi · Agent. Konteks outlet diteruskan apa adanya.
 */
export function AgentsLayout() {
  const ctx = useOutletContext<Ctx>();
  const ws = ctx.workspace.id;
  const pending = usePendingApprovalCount(ws, true);
  const base = `/w/${ws}/agents`;
  const tabs = [
    { to: `${base}/jobs`, label: 'Job', end: false },
    { to: `${base}/approvals`, label: 'Approval', end: false, count: pending },
    { to: base, label: 'Riset sosial', end: true },
    { to: `${base}/missions`, label: 'Misi', end: false },
    { to: `${base}/team`, label: 'Agent', end: false },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav aria-label="Agent Workspace" className="flex shrink-0 items-center gap-1 border-b border-[#E3E7ED] bg-white px-8 pt-3">
        <span className="mr-3 pb-2 text-[12px] font-semibold tracking-[0.12em] text-[#0E9384] uppercase">Agent Workspace</span>
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => cn('-mb-px border-b-2 px-3 pb-2 text-[13px] font-medium', isActive ? 'border-[#0E9384] text-[#0F2340]' : 'border-transparent text-ink-soft hover:text-ink')}
          >
            {t.label}
            {t.count ? (
              <span className="ml-1.5 rounded-full bg-[#FEF3E2] px-1.5 text-[11px] text-[#B45309]" aria-label={`${t.count} approval menunggu`}>
                {t.count}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>
      <div className="min-h-0 flex-1">
        <Outlet context={ctx} />
      </div>
    </div>
  );
}
