import { useVirtualizer } from '@tanstack/react-virtual';
import { Bot, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useReschedule } from '../../hooks/queries';
import { ApiError, errorMessage } from '../../lib/api';
import { addDays, diffDays, formatRange } from '../../lib/dates';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '../../lib/query-client';
import type { Task } from '../../lib/types';
import { cn } from '../../lib/utils';
import { DateEditor } from '../task/property-editors';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { StatusChip } from '../ui/misc';
import { barGeometry, buildRows, timelineRange } from './timeline-model';
import { DAY_W, DEFAULT_ZOOM, ZOOMS, ZOOM_LABEL, anchorScrollLeft, buildHeader, gridBackground, jakartaNow, nowX, parseZoom, visibleDayWindow, withMinSpan, type TimelineZoom } from './timeline-scale';
import { useView } from './view-context';

const LEFT_W = 300;
const ROW_H = 36;
const BAR_COLORS: Record<string, string> = {
  todo: 'bg-stone-300 text-stone-800',
  in_progress: 'bg-blue-400 text-white',
  in_review: 'bg-amber-400 text-amber-950',
  done: 'bg-emerald-400 text-emerald-950',
};

type DragMode = 'move' | 'start' | 'end';
interface DragState {
  id: string;
  mode: DragMode;
  x0: number;
  delta: number;
  moved: boolean;
}
interface Pending {
  task: Task;
  start: string;
  end: string;
  descendants: number;
}

/** Jam sekarang (Asia/Jakarta), diperbarui tepat di pergantian menit agar garis "sekarang" bergerak. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

const scrollBehavior = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/** Timeline/Gantt custom (keputusan D2): geser bar, tarik tepi untuk durasi, milestone, cascade reschedule. */
export function TimelineView({ tasks }: { tasks: Task[] }) {
  const { projectId, canEdit, openTask } = useView();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const zoom = parseZoom(params.get('zoom'));
  const setZoom = (z: TimelineZoom) =>
    setParams(
      (p) => {
        if (z === DEFAULT_ZOOM) p.delete('zoom');
        else p.set('zoom', z);
        return p;
      },
      { replace: true },
    );
  const dayW = DAY_W[zoom];
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [win, setWin] = useState<{ from: number; to: number } | null>(null);
  const reschedule = useReschedule(projectId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = jakartaNow(useNow());

  const { rows, unscheduled } = useMemo(() => buildRows(tasks, collapsed), [tasks, collapsed]);
  const range = useMemo(() => withMinSpan(timelineRange(tasks), zoom), [tasks, zoom]);
  const totalW = range.days * dayW;
  const todayX = diffDays(range.start, now.date) * dayW;
  const nowLineX = nowX(zoom, range.start, now, dayW);
  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 10 });

  // Header zoom jam sangat lebar (24 sel/hari): render hanya hari yang terlihat
  const syncWindow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = zoom === 'hour' ? visibleDayWindow(el.scrollLeft, el.clientWidth - LEFT_W, dayW, range.days) : null;
    setWin((cur) => (cur?.from === next?.from && cur?.to === next?.to ? cur : next));
  }, [zoom, dayW, range.days]);

  const prevDayW = useRef(dayW);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && prevDayW.current !== dayW) {
      el.scrollTo({ left: anchorScrollLeft(el.scrollLeft, el.clientWidth - LEFT_W, prevDayW.current, dayW), behavior: 'instant' });
      prevDayW.current = dayW;
    }
    syncWindow();
  }, [dayW, syncWindow]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (zoom === 'hour' && el) el.scrollTo({ left: Math.max(0, nowLineX - (el.clientWidth - LEFT_W) / 3), behavior: 'instant' });
    // Hanya saat pertama tampil dengan ?zoom=hour; perubahan zoom selanjutnya memakai anchor di atas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.addEventListener('resize', syncWindow);
    return () => window.removeEventListener('resize', syncWindow);
  }, [syncWindow]);

  const scheduledDescendants = (id: string) => {
    const kids = new Map<string, Task[]>();
    tasks.forEach((t) => t.parent_task_id && (kids.get(t.parent_task_id) ?? kids.set(t.parent_task_id, []).get(t.parent_task_id)!).push(t));
    let n = 0;
    const walk = (pid: string) =>
      (kids.get(pid) ?? []).forEach((c) => {
        if (c.start_date || c.end_date) n++;
        walk(c.id);
      });
    walk(id);
    return n;
  };

  const commit = (task: Task, start: string, end: string, cascade?: 'shift' | 'none') => {
    // Optimistic: geser bar task ini
    qc.setQueryData<Task[]>(qk.tasks(projectId), (old) => old?.map((t) => (t.id === task.id ? { ...t, start_date: start, end_date: end } : t)));
    reschedule.mutate(
      { id: task.id, start_date: start, end_date: end, cascade },
      {
        onSuccess: ({ shifted_count }) => shifted_count && toast.success(`${shifted_count} subtask ikut digeser`),
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'CASCADE_DECISION_REQUIRED') {
            setPending({ task, start, end, descendants: err.details?.descendant_count ?? 0 });
          } else {
            toast.error(errorMessage(err));
            qc.invalidateQueries({ queryKey: qk.tasks(projectId) });
          }
        },
      },
    );
  };

  const requestChange = (task: Task, start: string, end: string) => {
    if (start === task.start_date && end === task.end_date) return;
    const startChanged = start !== task.start_date;
    const n = startChanged ? scheduledDescendants(task.id) : 0;
    if (n > 0) setPending({ task, start, end, descendants: n });
    else commit(task, start, end);
  };

  const onBarPointerDown = (e: RPointerEvent<HTMLDivElement>, task: Task) => {
    if (!canEdit || e.button !== 0) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const mode: DragMode = task.is_milestone ? 'move' : x < 8 ? 'start' : x > rect.width - 8 ? 'end' : 'move';
    const state: DragState = { id: task.id, mode, x0: e.clientX, delta: 0, moved: false };
    setDrag(state);
    const move = (ev: PointerEvent) => {
      state.delta = Math.round((ev.clientX - state.x0) / dayW);
      state.moved ||= Math.abs(ev.clientX - state.x0) > 3;
      setDrag({ ...state });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (!state.moved) return openTask(task.id);
      const [s, en] = preview(task, state);
      requestChange(task, s, en);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onBarKey = (e: KeyboardEvent, task: Task) => {
    if (e.key === 'Enter') return openTask(task.id);
    if (!canEdit || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const d = e.key === 'ArrowLeft' ? -1 : 1;
    const [s, en] = preview(task, { mode: e.shiftKey && !task.is_milestone ? 'end' : 'move', delta: d });
    requestChange(task, s, en);
  };

  const header = useMemo(() => buildHeader(zoom, range.start, range.days, dayW, now.date, win), [zoom, range, dayW, now.date, win]);
  const gridBg = useMemo(() => gridBackground(zoom, range.start, dayW), [zoom, range.start, dayW]);

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (!el) return;
    const target = zoom === 'hour' ? nowLineX - (el.clientWidth - LEFT_W) / 3 : todayX - 200;
    el.scrollTo({ left: Math.max(0, target), behavior: scrollBehavior() });
  };

  const nowLabel = `${String(Math.floor(now.minutes / 60)).padStart(2, '0')}:${String(now.minutes % 60).padStart(2, '0')}`;
  const nowVisible = nowLineX >= 0 && nowLineX <= totalW;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={scrollToToday}>
          {zoom === 'hour' ? 'Sekarang' : 'Hari ini'}
        </Button>
        {zoom === 'hour' && (
          <span className="text-[12px] text-ink-soft">
            <span className="font-medium text-red-600">{nowLabel}</span> · Task hanya punya tanggal, jadi bar digambar penuh 00:00–24:00 per hari.
          </span>
        )}
        <div role="group" aria-label="Level zoom timeline" className="ml-auto flex items-center gap-0.5 rounded-md border border-line-strong p-0.5">
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              aria-pressed={zoom === z}
              onClick={() => setZoom(z)}
              className={cn('rounded px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent', zoom === z ? 'bg-ink text-white' : 'text-ink-soft hover:bg-hover')}
            >
              {ZOOM_LABEL[z]}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={syncWindow}
        role="region"
        aria-label="Timeline project"
        tabIndex={0}
        className="relative min-h-0 flex-1 overflow-auto overscroll-x-contain rounded-md border border-line select-none focus-visible:outline-2 focus-visible:outline-accent motion-safe:scroll-smooth"
      >
        <div style={{ width: LEFT_W + totalW }} className="relative">
          {/* Header */}
          <div className="sticky top-0 z-20 flex bg-white" style={{ height: 48 }}>
            <div className="sticky left-0 z-30 flex items-end border-r border-b border-line bg-white px-3 pb-1.5 text-[12px] font-medium text-ink-soft" style={{ width: LEFT_W }}>
              Task ({rows.length})
            </div>
            <div className="relative border-b border-line" style={{ width: totalW }}>
              {header.top.map((c) => (
                <div key={c.key} className={cn('absolute top-0 h-6 overflow-clip border-l border-line px-2 pt-1 text-[12px] font-medium whitespace-nowrap', c.today && 'text-red-600')} style={{ left: c.left, width: c.width }}>
                  <span className="sticky inline-block" style={{ left: LEFT_W + 8 }}>
                    {c.label}
                  </span>
                </div>
              ))}
              {header.bottom.map((c) => (
                <div
                  key={c.key}
                  className={cn(
                    'absolute top-6 h-6 text-center text-[11px] leading-6',
                    zoom !== 'day' && 'border-l border-line',
                    c.weekend && 'bg-stone-100/80',
                    c.today ? 'bg-red-50 font-semibold text-red-600' : 'text-ink-faint',
                  )}
                  style={{ left: c.left, width: c.width }}
                >
                  {c.label}
                </div>
              ))}
              {zoom === 'hour' && nowVisible && <div title={`Sekarang ${nowLabel}`} className="absolute top-[42px] z-10 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-red-600" style={{ left: nowLineX }} />}
            </div>
          </div>


          {/* Rows */}
          <div style={{ height: Math.max(virt.getTotalSize(), 120), position: 'relative' }}>
            <div className="absolute top-0 bottom-0" style={{ left: LEFT_W, width: totalW, ...gridBg }} />
            {zoom !== 'month' && todayX >= 0 && todayX < totalW && <div className="absolute top-0 bottom-0 bg-sky-500/[0.07]" style={{ left: LEFT_W + todayX, width: dayW }} />}
            {nowVisible && <div className="absolute top-0 bottom-0 z-10 w-px bg-red-500" style={{ left: LEFT_W + nowLineX }} />}
            {rows.length === 0 && (
              <div className="absolute top-10 text-[13px] text-ink-faint" style={{ left: LEFT_W + 24 }}>
                Belum ada task bertanggal. Atur tanggal dari panel "Belum dijadwalkan" di bawah.
              </div>
            )}
            {virt.getVirtualItems().map((vi) => {
              const { task, hasChildren, outsideParent } = rows[vi.index];
              const isDragging = drag?.id === task.id;
              const [ps, pe] = isDragging ? preview(task, drag) : [task.start_date, task.end_date];
              const geo = barGeometry({ ...task, start_date: ps, end_date: pe }, range.start, dayW);
              const isAgent = task.assignee?.type === 'agent';
              return (
                <div key={task.id} className="group absolute left-0 flex w-full hover:bg-stone-50/70" style={{ top: vi.start, height: ROW_H }}>
                  <div className="sticky left-0 z-10 flex items-center border-r border-b border-line bg-white text-[13px] group-hover:bg-stone-50" style={{ width: LEFT_W, paddingLeft: (task.depth - 1) * 18 + 6 }}>
                    <button
                      aria-label="Tampilkan/sembunyikan subtask"
                      onClick={() =>
                        setCollapsed((s) => {
                          const n = new Set(s);
                          if (n.has(task.id)) n.delete(task.id);
                          else n.add(task.id);
                          return n;
                        })
                      }
                      className={cn('mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-hover-strong', !hasChildren && 'invisible')}
                    >
                      <ChevronRight size={14} className={cn('transition-transform', !collapsed.has(task.id) && 'rotate-90')} />
                    </button>
                    <button onClick={() => openTask(task.id)} className="min-w-0 truncate pr-2 text-left hover:underline">
                      {task.title}
                    </button>
                  </div>
                  <div className="relative border-b border-line" style={{ width: totalW }}>
                    {geo && (
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`${task.title}: ${formatRange(ps, pe)}`}
                        onPointerDown={(e) => onBarPointerDown(e, task)}
                        onKeyDown={(e) => onBarKey(e, task)}
                        title={`${task.title}\n${formatRange(ps, pe)}`}
                        className={cn(
                          'absolute top-[6px] flex h-6 items-center outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                          isDragging && 'z-20 shadow-lg',
                        )}
                        style={{ left: geo.left, width: geo.width }}
                      >
                        {task.is_milestone ? (
                          <div className="mx-auto h-4 w-4 rotate-45 rounded-[2px] bg-amber-500 shadow" />
                        ) : (
                          <div
                            className={cn(
                              'flex h-full w-full items-center gap-1 overflow-hidden rounded-[5px] px-2 text-[12px] font-medium whitespace-nowrap',
                              BAR_COLORS[task.status],
                              outsideParent && 'outline-2 outline-red-400 outline-dashed',
                            )}
                            style={isAgent ? { backgroundImage: 'repeating-linear-gradient(45deg, rgba(124,58,237,0.25) 0 6px, transparent 6px 12px)' } : undefined}
                          >
                            {canEdit && <span className="absolute top-0 left-0 h-full w-2 cursor-ew-resize" />}
                            {isAgent && <Bot size={12} className="shrink-0" />}
                            <span className="truncate">{task.title}</span>
                            {canEdit && <span className="absolute top-0 right-0 h-full w-2 cursor-ew-resize" />}
                          </div>
                        )}
                        {isDragging && drag.moved && (
                          <div className="absolute -top-6 left-0 rounded bg-ink px-1.5 py-0.5 text-[11px] whitespace-nowrap text-white">{formatRange(ps, pe)}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {unscheduled.length > 0 && (
        <details className="mt-3 rounded-md border border-line" open={unscheduled.length <= 8}>
          <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium">Belum dijadwalkan ({unscheduled.length})</summary>
          <div className="max-h-48 overflow-auto border-t border-line">
            {unscheduled.map((t) => (
              <UnscheduledRow key={t.id} task={t} />
            ))}
          </div>
        </details>
      )}

      <Dialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Geser juga ${pending?.descendants ?? 0} subtask?`}
        description="Task ini memiliki subtask terjadwal. Pilih apakah subtask ikut bergeser dengan selisih hari yang sama."
      >
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setPending(null)}>
            Batal
          </Button>
          <Button variant="outline" onClick={() => pending && (commit(pending.task, pending.start, pending.end, 'none'), setPending(null))}>
            Hanya task ini
          </Button>
          <Button variant="primary" onClick={() => pending && (commit(pending.task, pending.start, pending.end, 'shift'), setPending(null))}>
            Geser semua
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

/** Tanggal pratinjau saat drag/resize. */
function preview(task: Task, d: { mode: DragMode; delta: number }): [string, string] {
  const s = task.start_date!;
  const e = task.end_date!;
  if (d.mode === 'move') return [addDays(s, d.delta), addDays(e, d.delta)];
  if (d.mode === 'start') {
    const ns = addDays(s, d.delta);
    return [ns > e ? e : ns, e];
  }
  const ne = addDays(e, d.delta);
  return [s, ne < s ? s : ne];
}

function UnscheduledRow({ task }: { task: Task }) {
  const { projectId, canEdit, openTask } = useView();
  const reschedule = useReschedule(projectId);
  const qc = useQueryClient();
  return (
    <div className="flex items-center gap-2 border-b border-line px-3 py-1 text-[13px] last:border-0">
      <button className="min-w-0 truncate text-left hover:underline" style={{ paddingLeft: (task.depth - 1) * 14 }} onClick={() => openTask(task.id)}>
        {task.title}
      </button>
      <StatusChip status={task.status} />
      <div className="ml-auto w-44">
        <DateEditor
          start={task.start_date}
          end={task.end_date}
          milestone={task.is_milestone}
          readOnly={!canEdit}
          onChange={({ start_date, end_date }) =>
            reschedule.mutate(
              { id: task.id, start_date, end_date, cascade: 'none' },
              { onError: (e) => (toast.error(errorMessage(e)), qc.invalidateQueries({ queryKey: qk.tasks(projectId) })) },
            )
          }
        >
          <span className="text-accent">{task.start_date || task.end_date ? formatRange(task.start_date, task.end_date) : 'Atur tanggal'}</span>
        </DateEditor>
      </div>
    </div>
  );
}
