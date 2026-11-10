import { Library } from 'lucide-react';
import { useOutletContext } from 'react-router';
import { AssetsTab, SearchTab } from '../../components/mi/knowledge/AssetsSearchTabs';
import { CardsTab, DoctrineTab, PlaybooksTab } from '../../components/mi/knowledge/CuratedTabs';
import { GraphTab } from '../../components/mi/knowledge/GraphTab';
import { MiPage, TabBar, useUrlTab } from '../../components/mi/MiPage';
import type { WorkspaceSummary } from '../../lib/types';

const TABS = ['assets', 'search', 'cards', 'doctrine', 'playbooks', 'graph'] as const;
const LABEL: Record<(typeof TABS)[number], string> = { assets: 'Aset', search: 'Pencarian', cards: 'Kartu', doctrine: 'Doktrin', playbooks: 'Playbook', graph: 'Graf' };

/**
 * Knowledge Library (DSH-V1-09, F4): buku & brand guideline → knowledge card → doktrin per peran → playbook → KG.
 * Izin UI mengikuti RBAC backend: upload = member (knowledge:upload), approve/edit = admin (knowledge:approve).
 */
export function KnowledgePage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const [tab, setTab] = useUrlTab(TABS, 'assets');
  const ws = workspace.id;
  const isMember = workspace.role !== 'viewer';
  const isAdmin = workspace.role === 'owner' || workspace.role === 'admin';
  return (
    <MiPage wide eyebrow={<><Library size={14} /> Market Intelligence</>} title="Knowledge Library" description="Buku marketing dan brand guideline menjadi pengetahuan yang melekat di sistem: kartu yang disetujui manusia → doktrin tiap agent → playbook → knowledge graph lintas koleksi.">
      <TabBar label="Knowledge Library" value={tab} onChange={setTab} tabs={TABS.map((id) => ({ id, label: LABEL[id] }))} />
      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'assets' && <AssetsTab ws={ws} canUpload={isMember} />}
        {tab === 'search' && <SearchTab ws={ws} />}
        {tab === 'cards' && <CardsTab ws={ws} canApprove={isAdmin} />}
        {tab === 'doctrine' && <DoctrineTab ws={ws} canApprove={isAdmin} />}
        {tab === 'playbooks' && <PlaybooksTab ws={ws} canEdit={isAdmin} canRun={isMember} />}
        {tab === 'graph' && <GraphTab ws={ws} />}
      </div>
    </MiPage>
  );
}
