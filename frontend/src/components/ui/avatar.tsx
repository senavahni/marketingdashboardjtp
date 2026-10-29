import { Bot } from 'lucide-react';
import { cn, initials } from '../../lib/utils';

const COLORS = ['bg-rose-200 text-rose-800', 'bg-sky-200 text-sky-800', 'bg-amber-200 text-amber-800', 'bg-emerald-200 text-emerald-800', 'bg-indigo-200 text-indigo-800'];
const colorFor = (s: string) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

/**
 * Avatar aktor. Human = lingkaran (inisial), Agent = kotak membulat + ikon robot (warna violet),
 * sehingga perbedaan tidak hanya mengandalkan warna (NFR-11).
 */
export function ActorAvatar({ type, name, size = 20, className }: { type: 'user' | 'agent' | 'system'; name: string | null | undefined; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(9, size * 0.45) };
  if (type === 'agent') {
    return (
      <span style={style} title={`${name ?? 'Agent'} (AI)`} className={cn('inline-flex shrink-0 items-center justify-center rounded-[5px] bg-agent text-white', className)}>
        <Bot style={{ width: size * 0.65, height: size * 0.65 }} />
      </span>
    );
  }
  if (type === 'system') {
    return <span style={style} className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-500', className)}>S</span>;
  }
  return (
    <span style={style} title={name ?? ''} className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', colorFor(name ?? '?'), className)}>
      {initials(name)}
    </span>
  );
}

export function ActorName({ type, name }: { type: 'user' | 'agent' | 'system'; name: string | null | undefined }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <ActorAvatar type={type} name={name} />
      <span className="truncate">{name ?? 'Sistem'}</span>
      {type === 'agent' && <span className="rounded bg-agent-soft px-1 text-[10px] font-semibold text-agent">AI</span>}
    </span>
  );
}
