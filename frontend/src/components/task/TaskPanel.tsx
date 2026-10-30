import { Bot, Calendar, ChevronRight, CircleDot, Copy, Flag, Link as LinkIcon, Maximize2, MoreHorizontal, Plus, RotateCcw, Square, Tag, Trash2, User, UserPen, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAgentRunAction, useCreateTask, useDeleteTask, useTask, useUpdateTask } from '../../hooks/queries';
import { formatRange } from '../../lib/dates';
import { useRealtimeRoom } from '../../lib/realtime';
import type { Role, TaskDetail } from '../../lib/types';
import { cn } from '../../lib/utils';
import { ActivityFeed } from '../collab/ActivityFeed';
import { Comments } from '../collab/Comments';
import { BlockEditor } from '../editor/BlockEditor';
import { ActorName } from '../ui/avatar';
import { IconButton } from '../ui/button';
import { AgentStatusBadge, EmptyState, FullPageSpinner, StatusChip } from '../ui/misc';
import { MenuItem, Popover } from '../ui/popover';
import { DuplicateTaskDialog } from './DuplicateTaskDialog';
import { AssigneeEditor, DateEditor, PriorityEditor, StatusEditor, TagsEditor } from './property-editors';

interface Props {
  workspaceId: string;
  taskId: string;
  role: Role;
  mode: 'peek' | 'page';
  onClose?: () => void;
  onOpenTask: (id: string) => void;
}

/** Halaman task ala Notion: judul, properti, subtask, dokumen (block editor), komentar & aktivitas. */
export function TaskPanel({ workspaceId, taskId, role, mode, onClose, onOpenTask }: Props) {
  const { data: task, isLoading, error } = useTask(taskId);
  useRealtimeRoom('task', taskId);
  if (isLoading) return <FullPageSpinner />;
  if (error || !task) return <EmptyState icon="🔍" title="Task tidak ditemukan">Mungkin sudah dihapus atau Anda tidak memiliki akses.</EmptyState>;
  return <TaskBody task={task} workspaceId={workspaceId} role={role} mode={mode} onClose={onClose} onOpenTask={onOpenTask} />;
}

function TaskBody({ task, workspaceId, role, mode, onClose, onOpenTask }: Omit<Props, 'taskId'> & { task: TaskDetail }) {
  const canEdit = role !== 'viewer';
  const navigate = useNavigate();
  const update = useUpdateTask(task.project_id);
  const del = useDeleteTask(task.project_id);
  const runAction = useAgentRunAction(task.project_id);
  const [tab, setTab] = useState<'comments' | 'activity'>('comments');
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: task.id, patch: p });

  const fullUrl = `/w/${workspaceId}/t/${task.id}`;
  const agentBusy = task.assignee?.type === 'agent' && ['queued', 'thinking', 'working'].includes(task.agent_status);
  const agentName = task.assignee?.type === 'agent' ? task.assignee.name : 'Agent';

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-1 px-3 text-[13px] text-ink-soft">
        {mode === 'peek' && (
          <>
            <IconButton label="Tutup (Esc)" onClick={onClose}>
              <X size={16} />
            </IconButton>
            <IconButton label="Buka sebagai halaman penuh" onClick={() => navigate(fullUrl)}>
              <Maximize2 size={14} />
            </IconButton>
          </>
        )}
        <nav className="flex min-w-0 items-center gap-1 truncate">
          {mode === 'page' && (
            <Link to={`/w/${workspaceId}/p/${task.project_id}`} className="hover:underline">
              Project
            </Link>
          )}
          {task.breadcrumbs.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-1">
              <ChevronRight size={12} />
              <button className="truncate hover:underline" onClick={() => onOpenTask(b.id)}>
                {b.title}
              </button>
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label="Salin link"
            onClick={() => {
              const link = `${location.origin}${fullUrl}`;
              // navigator.clipboard tidak tersedia di http://IP-LAN (bukan secure context)
              if (navigator.clipboard) void navigator.clipboard.writeText(link).then(() => toast.success('Link disalin'));
              else prompt('Salin link berikut:', link);
            }}
          >
            <LinkIcon size={14} />
          </IconButton>
          {canEdit && (
            <Popover align="end" trigger={<IconButton label="Lainnya"><MoreHorizontal size={16} /></IconButton>}>
              <MenuItem onSelect={() => setDuplicateOpen(true)}>
                <Copy size={14} /> {task.parent_task_id ? 'Salin subtask' : 'Salin task'}
              </MenuItem>
              <MenuItem
                danger
                onSelect={() => {
                  if (!confirm(`Hapus "${task.title}" beserta seluruh subtask?`)) return;
                  del.mutate(task.id, { onSuccess: () => (mode === 'peek' ? onClose?.() : navigate(`/w/${workspaceId}/p/${task.project_id}`)) });
                }}
              >
                <Trash2 size={14} /> Hapus task
              </MenuItem>
            </Popover>
          )}
          {canEdit && <DuplicateTaskDialog task={task} open={duplicateOpen} onOpenChange={setDuplicateOpen} onDone={(copy) => onOpenTask(copy.id)} />}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn('mx-auto pb-24', mode === 'page' ? 'max-w-[900px] px-16 pt-10' : 'px-12 pt-4')}>
          <TitleInput value={task.title} readOnly={!canEdit} onSave={(title) => patch({ title })} />

          {/* Banner agent */}
          {task.assignee?.type === 'agent' && task.agent_status !== 'idle' && (
            <div
              className={cn(
                'mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-[13px]',
                task.agent_status === 'failed' ? 'bg-red-50 text-red-800' : task.agent_status === 'completed' ? 'bg-emerald-50 text-emerald-800' : 'bg-agent-soft text-agent',
              )}
            >
              <Bot size={16} />
              {task.agent_status === 'failed' && <span>{agentName} gagal mengerjakan task ini.</span>}
              {task.agent_status === 'completed' && <span>{agentName} telah menyelesaikan task ini.</span>}
              {agentBusy && (
                <span className="inline-flex items-center gap-1">
                  {agentName} {task.agent_status === 'queued' ? 'akan segera mengerjakan' : 'sedang menulis'}
                  <span className="dot-pulse">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </span>
              )}
              {canEdit && task.agent_status === 'failed' && (
                <button className="ml-auto inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[12px] shadow-sm" onClick={() => runAction.mutate({ id: task.id, action: 'retry' })}>
                  <RotateCcw size={12} /> Coba lagi
                </button>
              )}
              {canEdit && agentBusy && (
                <button className="ml-auto inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[12px] shadow-sm" onClick={() => runAction.mutate({ id: task.id, action: 'cancel' })}>
                  <Square size={11} /> Hentikan
                </button>
              )}
            </div>
          )}

          {/* Properti */}
          <div className="mb-4 space-y-0.5">
            <Prop icon={<CircleDot size={14} />} label="Status">
              <StatusEditor value={task.status} readOnly={!canEdit} onChange={(status) => patch({ status })} />
            </Prop>
            <Prop icon={<User size={14} />} label="Assignee">
              <div className="flex min-w-0 items-center gap-1">
                <AssigneeEditor workspaceId={workspaceId} value={task.assignee} readOnly={!canEdit} onChange={(assignee) => patch({ assignee })} />
                <AgentStatusBadge status={task.agent_status} />
              </div>
            </Prop>
            <Prop icon={<Calendar size={14} />} label="Tanggal">
              <DateEditor start={task.start_date} end={task.end_date} milestone={task.is_milestone} readOnly={!canEdit} onChange={(p) => patch(p)}>
                {task.start_date || task.end_date ? (
                  <span>
                    {formatRange(task.start_date, task.end_date)}
                    {task.is_milestone && <span className="ml-1.5 text-amber-600">◆ Milestone</span>}
                  </span>
                ) : (
                  <span className="text-ink-faint">Kosong</span>
                )}
              </DateEditor>
            </Prop>
            <Prop icon={<Flag size={14} />} label="Prioritas">
              <PriorityEditor value={task.priority} readOnly={!canEdit} onChange={(priority) => patch({ priority })} />
            </Prop>
            <Prop icon={<Tag size={14} />} label="Tag">
              <TagsEditor value={task.tags} readOnly={!canEdit} onChange={(tags) => patch({ tags })} />
            </Prop>
            <Prop icon={<UserPen size={14} />} label="Dibuat oleh">
              <div className="px-1.5 text-[13px]">{task.created_by ? <ActorName type={task.created_by.type} name={task.created_by.name} /> : '—'}</div>
            </Prop>
          </div>

          <Subtasks task={task} canEdit={canEdit} onOpenTask={onOpenTask} />

          <div className="my-5 border-t border-line" />
          <BlockEditor workspaceId={workspaceId} projectId={task.project_id} taskId={task.id} readOnly={!canEdit} />

          <div className="mt-10 border-t border-line pt-4">
            <div className="mb-3 flex gap-4 text-[13px]">
              {(['comments', 'activity'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={cn('pb-1', tab === t ? 'border-b-2 border-ink font-medium' : 'text-ink-soft')}>
                  {t === 'comments' ? 'Komentar' : 'Aktivitas'}
                </button>
              ))}
            </div>
            {tab === 'comments' ? (
              <Comments
                workspaceId={workspaceId}
                entityType="task"
                entityId={task.id}
                canComment={canEdit}
                canModerate={role === 'owner' || role === 'admin'}
                agentTyping={task.active_run?.trigger === 'mention' && ['thinking', 'working'].includes(task.agent_status) ? 'Agent' : null}
              />
            ) : (
              <ActivityFeed type="task" id={task.id} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Prop({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center">
      <div className="flex w-36 shrink-0 items-center gap-1.5 text-[13px] text-ink-soft">
        {icon} {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function TitleInput({ value, readOnly, onSave }: { value: string; readOnly: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    const t = v.trim();
    if (t && t !== value) onSave(t);
    else setV(value);
  };
  return (
    <textarea
      value={v}
      readOnly={readOnly}
      rows={1}
      maxLength={500}
      onChange={(e) => setV(e.target.value.replace(/\n/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
      placeholder="Tanpa judul"
      className="mb-4 w-full resize-none overflow-hidden bg-transparent text-[32px] leading-tight font-bold outline-none [field-sizing:content] placeholder:text-stone-300"
    />
  );
}

function Subtasks({ task, canEdit, onOpenTask }: { task: TaskDetail; canEdit: boolean; onOpenTask: (id: string) => void }) {
  const create = useCreateTask(task.project_id);
  const [adding, setAdding] = useState<string | null>(null);
  const canAdd = canEdit && task.depth < 3;
  if (!task.subtasks.length && !canAdd) return null;
  const submit = () => {
    if (adding?.trim()) create.mutate({ parentId: task.id, body: { title: adding.trim() } });
    setAdding(null);
  };
  return (
    <div className="mb-2">
      <div className="mb-1 text-[13px] font-medium text-ink-soft">Subtask {task.subtasks.length > 0 && `(${task.subtasks.length})`}</div>
      {task.subtasks.map((s) => (
        <button key={s.id} onClick={() => onOpenTask(s.id)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[14px] hover:bg-hover">
          <StatusChip status={s.status} />
          <span className="truncate">{s.title}</span>
          {s.assignee && <span className="ml-auto text-[12px] text-ink-faint">{s.assignee.name}</span>}
        </button>
      ))}
      {canAdd &&
        (adding !== null ? (
          <input
            autoFocus
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') setAdding(null);
            }}
            placeholder="Nama subtask…"
            className="w-full rounded px-1.5 py-1 text-[14px] outline-none"
          />
        ) : (
          <button onClick={() => setAdding('')} className="flex items-center gap-1 rounded px-1.5 py-1 text-[13px] text-ink-faint hover:bg-hover">
            <Plus size={14} /> Tambah subtask
          </button>
        ))}
    </div>
  );
}
