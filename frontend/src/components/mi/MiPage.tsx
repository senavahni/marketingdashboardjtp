import type { KeyboardEvent, ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { cn } from '../../lib/utils';
import { IntelHeader } from '../intel/IntelUi';

type PageProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
};

/** Kerangka layar MI (§B.3): header editorial → konten; latar #F5F7FA → putih (gaya Modul 2/3). */
export function MiPage({ eyebrow, title, description, actions, children, wide }: PageProps) {
  return (
    <div className="h-full overflow-y-auto bg-[linear-gradient(180deg,#F5F7FA_0,#fff_280px)]">
      <div className={cn('mx-auto px-8 pt-10 pb-16', wide ? 'max-w-7xl' : 'max-w-6xl')}>
        <IntelHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
        {children}
      </div>
    </div>
  );
}

/** Tab di dalam halaman memakai `?tab=` agar dapat dibagikan & tombol Back berfungsi (§B.3). */
export function useUrlTab<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as T | null;
  const tab = raw && tabs.includes(raw) ? raw : fallback;
  const setTab = (t: T) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('tab', t);
        return next;
      },
      { replace: false },
    );
  return [tab, setTab];
}

export function TabBar<T extends string>({ tabs, value, onChange, label }: { tabs: readonly { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void; label: string }) {
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="mb-5 flex flex-wrap gap-1 border-b border-[#E3E7ED]">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          role="tab"
          type="button"
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          onKeyDown={(e) => onKey(e, i)}
          onClick={() => onChange(t.id)}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#0E9384]',
            t.id === value ? 'border-[#0E9384] text-[#0F2340]' : 'border-transparent text-ink-soft hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="ml-1.5 rounded-full bg-[#FEF3E2] px-1.5 text-[11px] text-[#B45309]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
