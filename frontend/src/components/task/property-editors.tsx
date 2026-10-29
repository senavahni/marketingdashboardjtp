import { Bot, Check, Search, User, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAssignees } from '../../hooks/queries';
import { PRIORITIES, STATUSES } from '../../lib/constants';
import type { Assignee, TaskPriority, TaskStatus } from '../../lib/types';
import { cn } from '../../lib/utils';
import { ActorAvatar } from '../ui/avatar';
import { PriorityChip, StatusChip, TagChip } from '../ui/misc';
import { MenuItem, MenuLabel, Popover } from '../ui/popover';

/** Sel properti yang bisa diklik (gaya Notion): menampilkan nilai, membuka editor di popover. */
function Cell({ children, readOnly, className, ...rest }: { children: ReactNode; readOnly?: boolean; className?: string }) {
  return (
    <button
      type="button"
      disabled={readOnly}
      {...rest}
      className={cn('flex min-h-7 w-full min-w-0 items-center gap-1 rounded px-1.5 text-left text-[13px] enabled:hover:bg-hover disabled:cursor-default', className)}
    >
      {children}
    </button>
  );
}

const Empty = () => <span className="text-ink-faint">Kosong</span>;

export function StatusEditor({ value, onChange, readOnly, className }: { value: TaskStatus; onChange: (v: TaskStatus) => void; readOnly?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Cell readOnly={readOnly} className={className}>
          <StatusChip status={value} />
        </Cell>
      }
    >
      {STATUSES.map((s) => (
        <MenuItem key={s.value} active={s.value === value} onSelect={() => (onChange(s.value), setOpen(false))}>
          <StatusChip status={s.value} />
          {s.value === value && <Check size={14} className="ml-auto text-ink-faint" />}
        </MenuItem>
      ))}
    </Popover>
  );
}

export function PriorityEditor({ value, onChange, readOnly, className }: { value: TaskPriority; onChange: (v: TaskPriority) => void; readOnly?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Cell readOnly={readOnly} className={className}>
          {value === 'none' ? <Empty /> : <PriorityChip priority={value} />}
        </Cell>
      }
    >
      {PRIORITIES.map((p) => (
        <MenuItem key={p.value} active={p.value === value} onSelect={() => (onChange(p.value), setOpen(false))}>
          {p.value === 'none' ? <span className="text-ink-faint">Tanpa prioritas</span> : <PriorityChip priority={p.value} />}
        </MenuItem>
      ))}
    </Popover>
  );
}

/** Assignee picker dengan section "Humans" dan "AI Agents" (TASK_007). */
export function AssigneeEditor({
  workspaceId,
  value,
  onChange,
  readOnly,
  className,
  compact,
}: {
  workspaceId: string;
  value: Assignee | null;
  onChange: (v: { type: 'user' | 'agent'; id: string } | null) => void;
  readOnly?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data } = useAssignees(open ? workspaceId : undefined, q);
  const pick = (v: { type: 'user' | 'agent'; id: string } | null) => {
    onChange(v);
    setOpen(false);
    setQ('');
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="w-72"
      trigger={
        <Cell readOnly={readOnly} className={className}>
          {value ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <ActorAvatar type={value.type} name={value.name} size={18} />
              {!compact && <span className="truncate">{value.name}</span>}
            </span>
          ) : compact ? (
            <User size={14} className="text-ink-faint" />
          ) : (
            <Empty />
          )}
        </Cell>
      }
    >
      <div className="flex items-center gap-1.5 border-b border-line px-2 pb-1.5">
        <Search size={13} className="text-ink-faint" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari orang atau agent…" className="w-full py-1 text-[13px] outline-none" />
      </div>
      <div className="max-h-72 overflow-auto">
        <MenuLabel>Humans</MenuLabel>
        {data?.humans.map((h) => (
          <MenuItem key={h.id} active={value?.id === h.id} onSelect={() => pick({ type: 'user', id: h.id })}>
            <ActorAvatar type="user" name={h.name} />
            <span className="truncate">{h.name}</span>
            <span className="ml-auto text-[11px] text-ink-faint">@{h.username}</span>
          </MenuItem>
        ))}
        <MenuLabel>
          <span className="inline-flex items-center gap-1">
            <Bot size={12} /> AI Agents
          </span>
        </MenuLabel>
        {data?.agents.map((a) => (
          <MenuItem key={a.id} active={value?.id === a.id} onSelect={() => pick({ type: 'agent', id: a.id })}>
            <ActorAvatar type="agent" name={a.name} />
            <span className="min-w-0">
              <span className="block truncate">{a.name}</span>
              {a.description && <span className="block truncate text-[11px] text-ink-faint">{a.description}</span>}
            </span>
          </MenuItem>
        ))}
        {data && !data.humans.length && !data.agents.length && <div className="px-2 py-2 text-[12px] text-ink-faint">Tidak ditemukan</div>}
        {value && (
          <div className="mt-1 border-t border-line pt-1">
            <MenuItem onSelect={() => pick(null)}>
              <X size={14} className="text-ink-faint" /> Tanpa assignee
            </MenuItem>
          </div>
        )}
      </div>
    </Popover>
  );
}

export function DateEditor({
  start,
  end,
  milestone,
  onChange,
  readOnly,
  className,
  children,
}: {
  start: string | null;
  end: string | null;
  milestone: boolean;
  onChange: (v: { start_date: string | null; end_date: string | null; is_milestone?: boolean }) => void;
  readOnly?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(start ?? '');
  const [e, setE] = useState(end ?? '');
  const [m, setM] = useState(milestone);
  const invalid = !!s && !!e && !m && e < s;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setS(start ?? '');
          setE(end ?? '');
          setM(milestone);
        }
      }}
      className="w-64 p-3"
      trigger={
        <Cell readOnly={readOnly} className={className}>
          {children}
        </Cell>
      }
    >
      <div className="space-y-2 text-[13px]">
        <label className="block">
          <span className="text-ink-soft">{m ? 'Tanggal milestone' : 'Mulai'}</span>
          <input type="date" value={s} onChange={(ev) => setS(ev.target.value)} className="mt-0.5 w-full rounded border border-line-strong px-2 py-1" />
        </label>
        {!m && (
          <label className="block">
            <span className="text-ink-soft">Selesai</span>
            <input type="date" value={e} min={s || undefined} onChange={(ev) => setE(ev.target.value)} className="mt-0.5 w-full rounded border border-line-strong px-2 py-1" />
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={m} onChange={(ev) => setM(ev.target.checked)} /> Milestone (0 hari)
        </label>
        {invalid && <div className="text-[12px] text-red-600">Tanggal selesai tidak boleh sebelum tanggal mulai</div>}
        <div className="flex justify-between pt-1">
          <button
            type="button"
            className="text-[12px] text-ink-soft hover:underline"
            onClick={() => {
              onChange({ start_date: null, end_date: null, is_milestone: false });
              setOpen(false);
            }}
          >
            Hapus tanggal
          </button>
          <button
            type="button"
            disabled={invalid || (m && !s)}
            className="rounded bg-accent px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-40"
            onClick={() => {
              onChange({ start_date: s || null, end_date: m ? s || null : e || null, is_milestone: m });
              setOpen(false);
            }}
          >
            Simpan
          </button>
        </div>
      </div>
    </Popover>
  );
}

export function TagsEditor({ value, onChange, readOnly, className }: { value: string[]; onChange: (v: string[]) => void; readOnly?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const add = () => {
    const t = input.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput('');
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="w-64 p-2"
      trigger={
        <Cell readOnly={readOnly} className={cn('flex-wrap py-1', className)}>
          {value.length ? value.map((t) => <TagChip key={t} tag={t} />) : <Empty />}
        </Cell>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-0.5 rounded bg-stone-100 px-1.5 py-0.5 text-[12px]">
            {t}
            <button type="button" aria-label={`Hapus ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <input
        autoFocus
        value={input}
        maxLength={50}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        placeholder="Ketik tag lalu Enter"
        className="w-full rounded border border-line-strong px-2 py-1 text-[13px] outline-none"
      />
    </Popover>
  );
}
