import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar, ListTree, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useCreateTask, useReorderTasks, useUpdateTask } from '../../hooks/queries';
import { STATUSES } from '../../lib/constants';
import { formatRange } from '../../lib/dates';
import { qk } from '../../lib/query-client';
import type { Task, TaskStatus } from '../../lib/types';
import { useUi } from '../../lib/ui-store';
import { cn } from '../../lib/utils';
import { ActorAvatar } from '../ui/avatar';
import { AgentStatusBadge, PriorityChip, StatusChip } from '../ui/misc';
import { useView } from './view-context';

type Columns = Record<TaskStatus, string[]>;
const byOrder = (a: Task, b: Task) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at);

function toColumns(tasks: Task[]): Columns {
  const cols = { todo: [], in_progress: [], in_review: [], done: [] } as Columns;
  [...tasks].sort(byOrder).forEach((t) => cols[t.status].push(t.id));
  return cols;
}

/** Board (Kanban) per status. Drag antar kolom mengubah status; dalam kolom mengubah urutan. */
export function BoardView({ tasks }: { tasks: Task[] }) {
  const { projectId, canEdit } = useView();
  const qc = useQueryClient();
  const { boardSubtasks, setBoardSubtasks } = useUi();
  const shown = useMemo(() => (boardSubtasks ? tasks : tasks.filter((t) => !t.parent_task_id)), [tasks, boardSubtasks]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const [cols, setCols] = useState<Columns>(() => toColumns(shown));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<TaskStatus | null>(null);
  const update = useUpdateTask(projectId);
  const reorder = useReorderTasks(projectId);

  useEffect(() => {
    if (!activeId) setCols(toColumns(shown));
  }, [shown, activeId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const containerOf = (id: string): TaskStatus | null => {
    if (id.startsWith('col:')) return id.slice(4) as TaskStatus;
    return (Object.keys(cols) as TaskStatus[]).find((s) => cols[s].includes(id)) ?? null;
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setOrigin(containerOf(String(e.active.id)));
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = containerOf(String(active.id));
    const to = containerOf(String(over.id));
    if (!from || !to || from === to) return;
    setCols((prev) => {
      const target = [...prev[to]];
      const overIndex = target.indexOf(String(over.id));
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, String(active.id));
      return { ...prev, [from]: prev[from].filter((id) => id !== active.id), [to]: target };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const to = containerOf(id);
    setActiveId(null);
    if (!over || !to || !origin) return setCols(toColumns(shown));
    let ordered = cols[to];
    const oldIndex = ordered.indexOf(id);
    const newIndex = ordered.indexOf(String(over.id));
    if (newIndex >= 0 && oldIndex !== newIndex) ordered = arrayMove(ordered, oldIndex, newIndex);
    setCols((prev) => ({ ...prev, [to]: ordered }));

    // Optimistic: status & urutan di cache bersama
    const pos = new Map(ordered.map((tid, i) => [tid, i]));
    qc.setQueryData<Task[]>(qk.tasks(projectId), (old) =>
      old?.map((t) => (pos.has(t.id) ? { ...t, order_index: pos.get(t.id)!, status: t.id === id ? to : t.status } : t)),
    );
    const commitOrder = () => reorder.mutate({ status: to, ordered_task_ids: ordered });
    if (origin !== to) update.mutate({ id, patch: { status: to } }, { onSuccess: commitOrder });
    else if (oldIndex !== newIndex) commitOrder();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex justify-end">
        <button
          onClick={() => setBoardSubtasks(!boardSubtasks)}
          className={cn('inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] text-ink-soft hover:bg-hover', boardSubtasks && 'bg-hover text-ink')}
        >
          <ListTree size={13} /> {boardSubtasks ? 'Sembunyikan subtask' : 'Tampilkan subtask'}
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-4">
          {STATUSES.map((s) => (
            <Column key={s.value} status={s.value} ids={cols[s.value]} byId={byId} canEdit={canEdit} />
          ))}
        </div>
        <DragOverlay>{activeId && byId.get(activeId) ? <Card task={byId.get(activeId)!} overlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ status, ids, byId, canEdit }: { status: TaskStatus; ids: string[]; byId: Map<string, Task>; canEdit: boolean }) {
  const { projectId } = useView();
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}`, disabled: !canEdit });
  const create = useCreateTask(projectId);
  const [adding, setAdding] = useState<string | null>(null);
  const submit = () => {
    if (adding?.trim()) create.mutate({ body: { title: adding.trim(), status } });
    setAdding(null);
  };
  return (
    <div className="flex w-[272px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1 text-[13px]">
        <StatusChip status={status} />
        <span className="text-ink-faint">{ids.length}</span>
      </div>
      <div ref={setNodeRef} className={cn('flex min-h-24 flex-col gap-1.5 rounded-lg p-1 transition-colors', isOver && 'bg-hover')}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => byId.get(id) && <SortableCard key={id} task={byId.get(id)!} disabled={!canEdit} />)}
        </SortableContext>
        {canEdit &&
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
              placeholder="Nama task…"
              className="rounded-md border border-line-strong bg-white px-2 py-2 text-[13px] shadow-sm outline-none"
            />
          ) : (
            <button onClick={() => setAdding('')} className="flex items-center gap-1 rounded px-2 py-1.5 text-[13px] text-ink-faint hover:bg-hover">
              <Plus size={14} /> Baru
            </button>
          ))}
      </div>
    </div>
  );
}

function SortableCard({ task, disabled }: { task: Task; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} className={cn(isDragging && 'opacity-40')}>
      <Card task={task} />
    </div>
  );
}

function Card({ task, overlay }: { task: Task; overlay?: boolean }) {
  const { openTask } = useView();
  return (
    <div
      onClick={() => openTask(task.id)}
      className={cn(
        'cursor-pointer rounded-md border border-line bg-white p-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,15,15,0.08)] hover:bg-stone-50',
        overlay && 'rotate-1 shadow-lg',
      )}
    >
      <div className="mb-1.5 font-medium break-words">
        {task.is_milestone && <span className="mr-1 text-amber-500">◆</span>}
        {task.title || 'Tanpa judul'}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-soft">
        {task.assignee && (
          <span className="inline-flex items-center gap-1">
            <ActorAvatar type={task.assignee.type} name={task.assignee.name} size={16} />
            <span className="max-w-[110px] truncate">{task.assignee.name}</span>
          </span>
        )}
        <AgentStatusBadge status={task.agent_status} />
        <PriorityChip priority={task.priority} />
        {(task.start_date || task.end_date) && (
          <span className="inline-flex items-center gap-1">
            <Calendar size={11} />
            {formatRange(task.start_date, task.end_date)}
          </span>
        )}
        {task.subtask_count > 0 && <span>☰ {task.subtask_count}</span>}
      </div>
    </div>
  );
}
