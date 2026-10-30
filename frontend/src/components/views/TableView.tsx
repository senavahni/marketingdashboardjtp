import { useVirtualizer } from '@tanstack/react-virtual';
import { Calendar, ChevronRight, CircleDot, Copy, Flag, Hash, Maximize2, Plus, Tag, Trash2, Type, User } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useCreateTask, useDeleteTask, useUpdateTask } from '../../hooks/queries';
import { formatRange } from '../../lib/dates';
import { STATUSES } from '../../lib/constants';
import { visibleRows } from '../../lib/task-tree';
import type { Task, TaskStatus } from '../../lib/types';
import { useUi } from '../../lib/ui-store';
import { cn } from '../../lib/utils';
import { DuplicateTaskDialog } from '../task/DuplicateTaskDialog';
import { AgentStatusBadge, EmptyState } from '../ui/misc';
import { Popover, MenuItem } from '../ui/popover';
import { AssigneeEditor, DateEditor, PriorityEditor, StatusEditor, TagsEditor } from '../task/property-editors';
import { useView } from './view-context';

const COLUMNS: { key: string; label: string; icon: ReactNode; width: number }[] = [
  { key: 'title', label: 'Nama', icon: <Type size={13} />, width: 340 },
  { key: 'status', label: 'Status', icon: <CircleDot size={13} />, width: 140 },
  { key: 'assignee', label: 'Assignee', icon: <User size={13} />, width: 190 },
  { key: 'dates', label: 'Tanggal', icon: <Calendar size={13} />, width: 170 },
  { key: 'priority', label: 'Prioritas', icon: <Flag size={13} />, width: 110 },
  { key: 'tags', label: 'Tag', icon: <Tag size={13} />, width: 180 },
];
const ROW_H = 34;

/** Tampilan tabel ala database Notion: tree subtask, resize kolom, inline edit, aksi massal. */
export function TableView({ tasks }: { tasks: Task[] }) {
  const { projectId, workspaceId, canEdit, openTask } = useView();
  const { colWidths, setColWidth, expanded, toggleExpanded } = useUi();
  const expandedSet = useMemo(() => new Set(expanded[projectId] ?? []), [expanded, projectId]);
  const rows = useMemo(() => visibleRows(tasks, expandedSet), [tasks, expandedSet]);
  const update = useUpdateTask(projectId);
  const create = useCreateTask(projectId);
  const del = useDeleteTask(projectId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newTitle, setNewTitle] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<Task | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12 });

  const widths = COLUMNS.map((c) => colWidths[c.key] ?? c.width);
  const template = `36px ${widths.map((w) => `${w}px`).join(' ')} 1fr`;

  const startResize = (key: string, startW: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const move = (ev: PointerEvent) => setColWidth(key, Math.max(80, startW + ev.clientX - x0));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulkStatus = (status: TaskStatus) => {
    selected.forEach((id) => update.mutate({ id, patch: { status } }));
    setSelected(new Set());
  };
  const bulkDelete = () => {
    if (!confirm(`Hapus ${selected.size} task beserta subtask-nya?`)) return;
    selected.forEach((id) => del.mutate(id));
    setSelected(new Set());
  };

  const submitNew = () => {
    const title = newTitle?.trim();
    if (title) create.mutate({ body: { title } });
    setNewTitle(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selected.size > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-sky-50 px-3 py-1.5 text-[13px] text-sky-900">
          <span className="font-medium">{selected.size} dipilih</span>
          <Popover trigger={<button className="rounded px-2 py-0.5 hover:bg-sky-100">Ubah status</button>}>
            {STATUSES.map((s) => (
              <MenuItem key={s.value} onSelect={() => bulkStatus(s.value)}>
                {s.label}
              </MenuItem>
            ))}
          </Popover>
          <button className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-red-700 hover:bg-red-50" onClick={bulkDelete}>
            <Trash2 size={13} /> Hapus
          </button>
          <button className="ml-auto text-sky-700 hover:underline" onClick={() => setSelected(new Set())}>
            Batal
          </button>
        </div>
      )}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-max">
          {/* Header */}
          <div className="sticky top-0 z-10 grid border-y border-line bg-white text-[13px] text-ink-soft" style={{ gridTemplateColumns: template }}>
            <div />
            {COLUMNS.map((c, i) => (
              <div key={c.key} className="relative flex h-8 items-center gap-1.5 border-r border-line px-2">
                {c.icon} {c.label}
                <span onPointerDown={startResize(c.key, widths[i])} className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize hover:bg-accent/30" />
              </div>
            ))}
            <div />
          </div>
          {/* Rows (virtualized) */}
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {virt.getVirtualItems().map((vi) => {
              const t = rows[vi.index];
              const isOpen = expandedSet.has(t.id);
              return (
                <div
                  key={t.id}
                  className={cn('group absolute left-0 grid w-full border-b border-line text-[13px] hover:bg-stone-50', selected.has(t.id) && 'bg-sky-50/60')}
                  style={{ top: vi.start, height: ROW_H, gridTemplateColumns: template }}
                >
                  <div className="flex items-center justify-center">
                    {canEdit && (
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${t.title}`}
                        checked={selected.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        className={cn('opacity-0 group-hover:opacity-100', selected.size > 0 && 'opacity-100')}
                      />
                    )}
                  </div>
                  {/* Title */}
                  <div className="flex min-w-0 items-center border-r border-line pr-1" style={{ paddingLeft: (t.depth - 1) * 20 + 4 }}>
                    <button
                      aria-label={isOpen ? 'Tutup subtask' : 'Buka subtask'}
                      onClick={() => toggleExpanded(projectId, t.id)}
                      className={cn('mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-hover-strong', !t.subtask_count && 'invisible')}
                    >
                      <ChevronRight size={14} className={cn('transition-transform', isOpen && 'rotate-90')} />
                    </button>
                    <InlineTitle task={t} readOnly={!canEdit} onSave={(title) => update.mutate({ id: t.id, patch: { title } })} onOpen={() => openTask(t.id)} />
                    {t.is_milestone && <span title="Milestone" className="ml-1 text-amber-500">◆</span>}
                    <AgentStatusBadge status={t.agent_status} className="ml-1 shrink-0" />
                    {t.subtask_count > 0 && (
                      <span className="ml-1 inline-flex shrink-0 items-center text-[11px] text-ink-faint">
                        <Hash size={10} />
                        {t.subtask_count}
                      </span>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => setDuplicating(t)}
                        title={t.parent_task_id ? 'Salin subtask' : 'Salin task'}
                        className="ml-auto hidden shrink-0 items-center gap-1 rounded border border-line bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink-soft shadow-sm group-hover:inline-flex"
                      >
                        <Copy size={11} /> SALIN
                      </button>
                    )}
                    <button
                      onClick={() => openTask(t.id)}
                      className={cn(
                        'hidden shrink-0 items-center gap-1 rounded border border-line bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink-soft shadow-sm group-hover:inline-flex',
                        canEdit ? 'ml-1' : 'ml-auto',
                      )}
                    >
                      <Maximize2 size={11} /> BUKA
                    </button>
                  </div>
                  <div className="flex items-center border-r border-line px-0.5">
                    <StatusEditor value={t.status} readOnly={!canEdit} onChange={(status) => update.mutate({ id: t.id, patch: { status } })} />
                  </div>
                  <div className="flex items-center border-r border-line px-0.5">
                    <AssigneeEditor workspaceId={workspaceId} value={t.assignee} readOnly={!canEdit} onChange={(assignee) => update.mutate({ id: t.id, patch: { assignee } })} />
                  </div>
                  <div className="flex items-center border-r border-line px-0.5">
                    <DateEditor start={t.start_date} end={t.end_date} milestone={t.is_milestone} readOnly={!canEdit} onChange={(patch) => update.mutate({ id: t.id, patch })}>
                      {t.start_date || t.end_date ? formatRange(t.start_date, t.end_date) : <span className="text-ink-faint">Kosong</span>}
                    </DateEditor>
                  </div>
                  <div className="flex items-center border-r border-line px-0.5">
                    <PriorityEditor value={t.priority} readOnly={!canEdit} onChange={(priority) => update.mutate({ id: t.id, patch: { priority } })} />
                  </div>
                  <div className="flex items-center overflow-hidden border-r border-line px-0.5">
                    <TagsEditor value={t.tags} readOnly={!canEdit} onChange={(tags) => update.mutate({ id: t.id, patch: { tags } })} className="flex-nowrap" />
                  </div>
                  <div />
                </div>
              );
            })}
          </div>
          {canEdit &&
            (newTitle !== null ? (
              <div className="flex h-[34px] items-center border-b border-line pl-[42px]">
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onBlur={submitNew}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNew();
                    if (e.key === 'Escape') setNewTitle(null);
                  }}
                  placeholder="Ketik nama task lalu Enter"
                  className="w-80 bg-transparent text-[13px] outline-none"
                />
              </div>
            ) : (
              <button onClick={() => setNewTitle('')} className="flex h-[34px] w-full items-center gap-1.5 border-b border-line pl-[42px] text-[13px] text-ink-faint hover:bg-stone-50">
                <Plus size={14} /> Baru
              </button>
            ))}
          {!rows.length && !canEdit && <EmptyState icon="📭" title="Belum ada task" />}
          <div className="h-2 text-[12px] text-ink-faint" />
        </div>
      </div>
      {duplicating && (
        <DuplicateTaskDialog
          task={duplicating}
          open
          onOpenChange={(o) => !o && setDuplicating(null)}
          onDone={() => duplicating.parent_task_id && !expandedSet.has(duplicating.parent_task_id) && toggleExpanded(projectId, duplicating.parent_task_id)}
        />
      )}
    </div>
  );
}

function InlineTitle({ task, readOnly, onSave, onOpen }: { task: Task; readOnly: boolean; onSave: (title: string) => void; onOpen: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.title);
  if (editing) {
    const commit = () => {
      setEditing(false);
      const v = value.trim();
      if (v && v !== task.title) onSave(v);
    };
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="min-w-0 flex-1 rounded bg-white px-1 py-0.5 text-[13px] font-medium shadow-[0_0_0_2px_rgba(35,131,226,0.4)] outline-none"
      />
    );
  }
  return (
    <span
      className="min-w-0 cursor-pointer truncate px-1 font-medium underline-offset-2 hover:underline"
      onClick={onOpen}
      onDoubleClick={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        setValue(task.title);
        setEditing(true);
      }}
      title="Klik untuk membuka, klik ganda untuk mengubah nama"
    >
      {task.title || 'Tanpa judul'}
    </span>
  );
}
