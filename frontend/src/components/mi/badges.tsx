import { BookOpen, Loader2, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { CONFIDENCE_LABEL, JOB13_STATUS_META, MI_TONE_CLASS, confidenceLevel, type MiTone } from '../../lib/mi-format';
import type { Citation, Job13Status } from '../../lib/mi-types';
import { cn } from '../../lib/utils';
import { Popover } from '../ui/popover';

/** Status selalu ikon/glyph + teks (§A.4) — tidak pernah hanya warna. */
export function StatusPill({ tone, label, glyph, spinning, className }: { tone: MiTone; label: string; glyph?: ReactNode; spinning?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap', MI_TONE_CLASS[tone], className)}>
      {spinning ? <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden /> : glyph && <span aria-hidden>{glyph}</span>}
      {label}
    </span>
  );
}

export function Job13StatusBadge({ status }: { status: Job13Status }) {
  const meta = JOB13_STATUS_META[status];
  const glyph = { completed: '✔', failed: '✖', paused: '⏸', awaiting_review: '◔', cancelled: '–', queued: '◷' }[status as string];
  return <StatusPill tone={meta.tone} label={meta.label} glyph={glyph} spinning={meta.spinning} />;
}

/** Confidence: bar 4 segmen + teks Tinggi/Sedang/Rendah (§C.3). */
export function ConfidenceBadge({ value, showValue = true }: { value: number; showValue?: boolean }) {
  const level = confidenceLevel(value);
  const filled = Math.max(1, Math.round(value * 4));
  const color = level === 'high' ? '#0E9384' : level === 'medium' ? '#B45309' : '#C2410C';
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft" title={`Confidence ${value.toFixed(2)}`}>
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-2.5 w-1.5 rounded-sm" style={{ background: i < filled ? color : '#E3E7ED' }} />
        ))}
      </span>
      <span>
        {CONFIDENCE_LABEL[level]}
        {showValue && <span className="ml-1 tabular-nums text-ink-faint">{value.toFixed(2).replace('.', ',')}</span>}
      </span>
    </span>
  );
}

export function CompletenessBadge({ filled, total }: { filled: number; total: number }) {
  const pct = total ? filled / total : 0;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-ink-soft" aria-label={`Kelengkapan ${filled} dari ${total} field`}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="#E3E7ED" strokeWidth="2" />
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="#0E9384" strokeWidth="2" strokeDasharray={`${pct * 34.6} 34.6`} transform="rotate(-90 7 7)" />
      </svg>
      {filled}/{total}
    </span>
  );
}

const PRECISION_LABEL: Record<string, string> = { rooftop: 'Persis', exact: 'Persis', street: 'Jalan', district: 'Kecamatan', city: 'Kota', province: 'Provinsi', region: 'Wilayah', unknown: 'Tidak diketahui' };
export function PrecisionBadge({ precision }: { precision: string }) {
  const coarse = ['city', 'province', 'region', 'unknown'].includes(precision);
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]', coarse ? 'border-dashed border-[#B45309] text-[#B45309]' : 'border-line text-ink-soft')}>
      <MapPin size={11} aria-hidden /> Presisi: {PRECISION_LABEL[precision] ?? precision}
    </span>
  );
}

export function OriginChip({ origin }: { origin: 'discovery' | 'import' | 'manual' }) {
  const label = { discovery: 'Discovery', import: 'Import', manual: 'Manual' }[origin];
  return <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-700">{label}</span>;
}

/** Badge sitasi buku (§C.4): chip + popover kutipan; tanpa sitasi → chip kuning "Tanpa sitasi". */
export function BookCitation({ citation, quote, onOpenCard }: { citation: Citation | null; quote?: string; onOpenCard?: () => void }) {
  if (!citation) return <span className="rounded-md bg-[#FEF3E2] px-1.5 py-0.5 text-[11px] font-medium text-[#B45309]">⚠ Tanpa sitasi</span>;
  const title = citation.book_title.length > 34 ? `${citation.book_title.slice(0, 18)}…${citation.book_title.slice(-12)}` : citation.book_title;
  return (
    <Popover
      className="w-80 p-3"
      trigger={
        <button type="button" className="inline-flex items-center gap-1 rounded-md border border-[#CFE3E0] bg-[#F1F8F7] px-1.5 py-0.5 text-[11px] font-medium text-[#0B7A6E] hover:bg-[#E6F4F2]">
          <BookOpen size={11} aria-hidden /> {title} — hlm. {citation.page}
        </button>
      }
    >
      <p className="text-[13px] font-semibold text-[#0F2340]">{citation.book_title}</p>
      <p className="text-[12px] text-ink-soft">
        {citation.chapter ? `${citation.chapter} · ` : ''}halaman {citation.page}
      </p>
      {quote && <blockquote className="mt-2 border-l-2 border-[#0E9384] pl-2 text-[12px] text-ink">“{quote.slice(0, 240)}”</blockquote>}
      {onOpenCard && (
        <button type="button" onClick={onOpenCard} className="mt-2 text-[12px] font-medium text-[#1D5FA8] hover:underline">
          Buka kartu pengetahuan →
        </button>
      )}
    </Popover>
  );
}
