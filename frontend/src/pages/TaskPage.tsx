import { useNavigate, useOutletContext, useParams } from 'react-router';
import { TaskPanel } from '../components/task/TaskPanel';
import type { WorkspaceSummary } from '../lib/types';

/** Task sebagai halaman penuh (/w/:ws/t/:taskId). */
export function TaskPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  return <TaskPanel key={taskId} workspaceId={workspace.id} taskId={taskId} role={workspace.role} mode="page" onOpenTask={(id) => navigate(`/w/${workspace.id}/t/${id}`)} />;
}
