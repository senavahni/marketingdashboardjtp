import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useDuplicateTask, useTasks, type DuplicateTaskBody } from '../../hooks/queries';
import { errorMessage } from '../../lib/api';
import { diffDays, formatRange, today } from '../../lib/dates';
import { childrenMap } from '../../lib/task-tree';
import type { Task } from '../../lib/types';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';

interface Props {
  task: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dipanggil setelah berhasil, dengan task utama hasil salinan. */
  onDone?: (copy: Task) => void;
}

interface Node {
  task: Task;
  level: number; // 1 = anak langsung task yang disalin
  ancestors: string[]; // leluhur di dalam subtree (tanpa task yang disalin)
}

const fieldCls = 'w-full rounded-md border border-line-strong bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const labelCls = 'mb-1 block text-[12px] font-medium text-ink-soft';

/** Dialog "Salin task": pilih subtask (semua / sebagian / tidak ada), timeline, assignee & isi dokumen. */
export function DuplicateTaskDialog({ task, open, onOpenChange, onDone }: Props) {
  const { data: allTasks } = useTasks(task.project_id);
  const duplicate = useDuplicateTask(task.project_id);

  // Turunan dalam urutan tampilan (DFS), lengkap dengan leluhurnya
  const nodes = useMemo<Node[]>(() => {
    const map = childrenMap(allTasks ?? []);
    const out: Node[] = [];
    const walk = (pid: string, level: number, ancestors: string[]) => {
      for (const c of map.get(pid) ?? []) {
        out.push({ task: c, level, ancestors });
        walk(c.id, level + 1, [...ancestors, c.id]);
      }
    };
    walk(task.id, 1, []);
    return out;
  }, [allTasks, task.id]);

  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<DuplicateTaskBody['subtasks']>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [timeline, setTimeline] = useState<DuplicateTaskBody['timeline']>('same');
  const [startDate, setStartDate] = useState('');
  const [copyAssignee, setCopyAssignee] = useState(true);
  const [copyContent, setCopyContent] = useState(true);

  useEffect(() => {
    if (!open) return;
    setTitle(`${task.title} (salinan)`);
    setMode('all');
    setSelected(new Set());
    setQuery('');
    setTimeline('same');
    setStartDate(task.start_date ?? today());
    setCopyAssignee(true);
    setCopyContent(true);
  }, [open, task.id, task.title, task.start_date]);

  // Tanggal acuan pergeseran: tanggal mulai task, atau tanggal paling awal di subtask
  const anchor = task.start_date ?? nodes.map((n) => n.task.start_date).filter((d): d is string => !!d).sort()[0] ?? null;
  const hasDates = !!anchor || !!task.end_date;
  const shiftDays = timeline === 'shift' && anchor && startDate ? diffDays(anchor, startDate) : 0;
  const hasMilestone = task.is_milestone || nodes.some((n) => n.task.is_milestone);

  const descendantsOf = (id: string) => nodes.filter((n) => n.ancestors.includes(id)).map((n) => n.task.id);
  const toggle = (n: Node) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const ids = [n.task.id, ...descendantsOf(n.task.id)];
      if (prev.has(n.task.id)) ids.forEach((id) => next.delete(id));
      else [...ids, ...n.ancestors].forEach((id) => next.add(id)); // centang parent = ikut semua anaknya; centang anak = parent ikut
      return next;
    });

  const q = query.trim().toLowerCase();
  const visible = q ? nodes.filter((n) => n.task.title.toLowerCase().includes(q)) : nodes;
  const subtaskCount = mode === 'all' ? nodes.length : mode === 'selected' ? selected.size : 0;

  const submit = () => {
    const body: DuplicateTaskBody = {
      title: title.trim() || undefined,
      subtasks: mode,
      subtask_ids: mode === 'selected' ? [...selected] : undefined,
      timeline,
      start_date: timeline === 'shift' ? startDate : undefined,
      copy_assignee: copyAssignee,
      copy_content: copyContent,
    };
    duplicate.mutate(
      { id: task.id, body },
      {
        onSuccess: ({ task: copy, created_count }) => {
          toast.success(created_count > 1 ? `${created_count} task berhasil disalin` : 'Task berhasil disalin');
          onOpenChange(false);
          onDone?.(copy);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={task.parent_task_id ? 'Salin subtask' : 'Salin task'}
      description={`Membuat salinan "${task.title}" tepat di bawahnya, pada level yang sama.`}
      className="max-w-lg"
    >
      <div className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="dup-title">
            Nama salinan
          </label>
          <input id="dup-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} className={fieldCls} />
          <p className="mt-1 text-[11px] text-ink-faint">Subtask tetap memakai nama aslinya.</p>
        </div>

        <div>
          <label className={labelCls} htmlFor="dup-subtasks">
            Subtask yang ikut disalin
          </label>
          <select id="dup-subtasks" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} disabled={!nodes.length} className={fieldCls}>
            <option value="all">Sertakan semua subtask ({nodes.length})</option>
            <option value="selected">Pilih subtask tertentu…</option>
            <option value="none">Tanpa subtask</option>
          </select>
          {!nodes.length && <p className="mt-1 text-[11px] text-ink-faint">Task ini tidak punya subtask.</p>}

          {mode === 'selected' && nodes.length > 0 && (
            <div className="mt-2 rounded-md border border-line">
              <div className="flex items-center gap-2 border-b border-line px-2 py-1.5 text-[12px]">
                <Search size={13} className="text-ink-faint" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari subtask…" className="min-w-0 flex-1 bg-transparent outline-none" />
                <button type="button" className="text-accent hover:underline" onClick={() => setSelected(new Set(nodes.map((n) => n.task.id)))}>
                  Pilih semua
                </button>
                <button type="button" className="text-ink-soft hover:underline" onClick={() => setSelected(new Set())}>
                  Kosongkan
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {visible.map((n) => (
                  <label key={n.task.id} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[13px] hover:bg-hover" style={{ paddingLeft: 8 + (q ? 0 : (n.level - 1) * 18) }}>
                    <input type="checkbox" checked={selected.has(n.task.id)} onChange={() => toggle(n)} />
                    <span className="min-w-0 flex-1 truncate">{n.task.title}</span>
                    {n.task.subtask_count > 0 && <span className="shrink-0 text-[11px] text-ink-faint">{n.task.subtask_count} sub</span>}
                    <span className="shrink-0 text-[11px] text-ink-faint">{formatRange(n.task.start_date, n.task.end_date)}</span>
                  </label>
                ))}
                {!visible.length && <div className="px-2 py-3 text-center text-[12px] text-ink-faint">Tidak ada subtask yang cocok</div>}
              </div>
              <div className="border-t border-line px-2 py-1 text-[11px] text-ink-faint">
                {selected.size} dari {nodes.length} dipilih · mencentang parent ikut memilih semua anaknya
              </div>
            </div>
          )}
        </div>

        <div>
          <label className={labelCls} htmlFor="dup-timeline">
            Timeline
          </label>
          <select id="dup-timeline" value={timeline} onChange={(e) => setTimeline(e.target.value as typeof timeline)} className={fieldCls}>
            <option value="same">Salin tanggal yang sama persis</option>
            <option value="shift" disabled={!anchor}>
              Geser ke tanggal mulai baru{!anchor ? ' (task belum bertanggal)' : ''}
            </option>
            <option value="none">Tanpa tanggal</option>
          </select>
          {timeline === 'shift' && (
            <div className="mt-2 flex items-center gap-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={cn(fieldCls, 'w-44')} aria-label="Tanggal mulai baru" />
              <span className="text-[12px] text-ink-soft">
                {shiftDays === 0 ? 'Tanggal tidak berubah' : `Semua tanggal digeser ${Math.abs(shiftDays)} hari ${shiftDays > 0 ? 'ke depan' : 'ke belakang'}`}
              </span>
            </div>
          )}
          {timeline === 'same' && !hasDates && <p className="mt-1 text-[11px] text-ink-faint">Task ini belum punya tanggal.</p>}
          {timeline === 'none' && hasMilestone && <p className="mt-1 text-[11px] text-amber-700">Milestone akan menjadi task biasa karena tidak bertanggal.</p>}
        </div>

        <div className="space-y-1.5 text-[13px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={copyAssignee} onChange={(e) => setCopyAssignee(e.target.checked)} />
            Salin assignee <span className="text-[11px] text-ink-faint">(AI Agent tidak disalin agar tidak langsung bekerja)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={copyContent} onChange={(e) => setCopyContent(e.target.checked)} />
            Salin isi dokumen task
          </label>
        </div>

        <p className="rounded-md bg-sidebar px-3 py-2 text-[12px] text-ink-soft">
          Salinan berstatus <b>To Do</b>. Prioritas & tag ikut disalin; komentar dan riwayat aktivitas tidak.
        </p>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit} disabled={duplicate.isPending || (timeline === 'shift' && !startDate) || !title.trim()}>
            {duplicate.isPending ? 'Menyalin…' : `Salin ${1 + subtaskCount} task`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
