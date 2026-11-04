import { ArrowRight, Ban, CheckCircle2, Clock3, Loader2, XCircle, type LucideIcon } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { JOB_STATUS_META, SOURCE_META, TONE_CLASS, progressPct, type StatusTone } from '../../lib/intel-format';
import type { JobStatus, SourceType } from '../../lib/intel-types';
import { cn } from '../../lib/utils';
import { ActorAvatar } from '../ui/avatar';

const TONE_ICON: Record<StatusTone, LucideIcon> = {
  idle: Clock3,
  collect: Loader2,
  analyze: Loader2,
  index: Loader2,
  success: CheckCircle2,
  danger: XCircle,
  muted: Ban,
};

/** Badge status job: ikon + teks (tidak hanya warna). */
export function JobStatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const meta = JOB_STATUS_META[status];
  const Icon = meta.spinning ? Loader2 : TONE_ICON[meta.tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap',
        TONE_CLASS[meta.tone],
        className,
      )}
    >
      <Icon size={12} className={cn(meta.spinning && 'animate-spin motion-reduce:animate-none')} aria-hidden />
      {meta.label}
    </span>
  );
}

export function SourceChip({ type, compact }: { type: SourceType; compact?: boolean }) {
  const meta = SOURCE_META[type];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink whitespace-nowrap"
      title={meta.label}
    >
      <span
        className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] text-[9px] font-bold text-white"
        style={{ background: meta.color }}
        aria-hidden
      >
        {meta.glyph}
      </span>
      {!compact && meta.label}
    </span>
  );
}

export function SourceChips({ sources, compact }: { sources: SourceType[]; compact?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      {sources.map((s) => (
        <SourceChip key={s} type={s} compact={compact} />
      ))}
    </span>
  );
}

/** Rantai agent per tahap, mis. Researcher → Analyst. */
export function AgentChain({ names }: { names: (string | undefined)[] }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-[12px] text-ink-soft">
      {names.map((n, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ArrowRight size={11} className="shrink-0 text-ink-faint" aria-hidden />}
          <ActorAvatar type="agent" name={n} size={16} />
          <span className="truncate">{(n ?? '—').replace(/^Agent_/, '')}</span>
        </span>
      ))}
    </span>
  );
}

export function ProgressBar({
  done,
  total,
  live,
  color = '#0E9384',
  className,
}: {
  done: number;
  total: number | null;
  live?: boolean;
  color?: string;
  className?: string;
}) {
  const pct = progressPct(done, total);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total ?? undefined}
      aria-valuenow={done}
      aria-label={total ? `${done} dari ${total}` : `${done} diproses`}
      className={cn('h-1.5 overflow-hidden rounded-full bg-[#EDF0F4]', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', live && 'intel-live')}
        style={{ width: `${pct ?? (live ? 35 : 0)}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-[#E3E7ED] bg-white p-5 shadow-[0_1px_2px_rgba(15,35,64,0.04)]', className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h3 className="text-[13px] font-semibold tracking-wide text-[#0F2340]">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  sub,
  accent,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#E3E7ED] bg-white p-4">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent ?? '#0F2340' }} aria-hidden />
      <div className="text-[11px] font-semibold tracking-[0.08em] text-ink-soft uppercase">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div>
          <div className="text-[26px] leading-tight font-semibold tracking-tight text-[#0F2340] tabular-nums">{value}</div>
          {sub && <div className="mt-0.5 text-[12px] text-ink-soft">{sub}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Header halaman Modul 3 (gaya editorial yang sama dengan Modul 2). */
export function IntelHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.12em] text-[#0E9384] uppercase">{eyebrow}</p>
        <h1 className="text-[28px] font-semibold tracking-tight text-[#0F2340]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export const primaryBtn =
  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0F2340] px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#1a3560] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E9384]';
export const inputClass =
  'h-9 w-full rounded-lg border border-line-strong bg-white px-3 text-[13px] outline-none transition-colors focus:border-[#0E9384] focus:ring-2 focus:ring-[#0E9384]/15';

/** Input chip: Enter / koma menambah, Backspace di input kosong menghapus chip terakhir. */
export function ChipInput({
  value,
  onChange,
  placeholder,
  max,
  invalid,
  id,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  max?: number;
  invalid?: boolean;
  id?: string;
}) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const items = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s && !value.includes(s));
    if (items.length) onChange([...value, ...items].slice(0, max ?? Infinity));
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
  };
  const full = max !== undefined && value.length >= max;
  return (
    <div
      className={cn(
        'flex min-h-9 flex-wrap items-center gap-1 rounded-lg border bg-white px-2 py-1 focus-within:ring-2',
        invalid
          ? 'border-[#C2410C] focus-within:ring-[#C2410C]/15'
          : 'border-line-strong focus-within:border-[#0E9384] focus-within:ring-[#0E9384]/15',
      )}
    >
      {value.map((v) => (
        <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-md bg-[#EEF2F7] px-2 py-0.5 text-[12px] text-[#0F2340]">
          <span className="truncate">{v}</span>
          <button
            type="button"
            aria-label={`Hapus ${v}`}
            className="text-ink-faint hover:text-[#C2410C]"
            onClick={() => onChange(value.filter((x) => x !== v))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        disabled={full}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => text && add(text)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          if (/[,\n]/.test(pasted)) {
            e.preventDefault();
            add(pasted);
          }
        }}
        placeholder={full ? `Maksimal ${max}` : value.length ? '' : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent py-1 text-[13px] outline-none"
      />
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-[12px] text-[#C2410C]">
      {message}
    </p>
  );
}
