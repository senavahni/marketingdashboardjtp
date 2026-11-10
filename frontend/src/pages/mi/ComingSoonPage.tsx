import type { ReactNode } from 'react';
import { Link, useOutletContext } from 'react-router';
import { MiPage } from '../../components/mi/MiPage';
import { StateView } from '../../components/mi/StateView';
import type { WorkspaceSummary } from '../../lib/types';

type Props = {
  title: string;
  taskId: string;
  description: string;
  /** Tautan ke bagian yang sudah tersedia (mis. Import dari Company Intelligence). */
  links?: { to: string; label: string }[];
  children?: ReactNode;
};

/** Menu sidebar v1.0.0 yang layarnya belum dibangun: jujur menyebut task-nya, menawarkan bagian yang sudah ada. */
export function ComingSoonPage({ title, taskId, description, links = [], children }: Props) {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  return (
    <MiPage eyebrow="Market Intelligence" title={title} description={description}>
      {children}
      <StateView
        kind="coming-soon"
        title={`Layar ini dikerjakan di ${taskId}`}
        action={links.map((l) => (
          <Link key={l.to} to={`/w/${workspace.id}${l.to}`} className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-white px-3 text-sm font-medium hover:bg-hover">
            {l.label}
          </Link>
        ))}
      >
        Rancangan lengkapnya ada di <code>Documentation/v1.0.0/V1_TASK_003_UIUX.md</code>.
      </StateView>
    </MiPage>
  );
}
