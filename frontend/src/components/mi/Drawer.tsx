import * as RD from '@radix-ui/react-dialog';
import { ExternalLink, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDateTime } from '../../lib/utils';
import { ConfidenceBadge } from './badges';

type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
};

/** Drawer kanan 480 px (§B.3): fokus terperangkap, Esc menutup, fokus kembali ke pemicu (Radix Dialog). */
export function Drawer({ open, onOpenChange, title, description, children }: DrawerProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-[#0F2340]/20" />
        <RD.Content className="fixed top-0 right-0 z-50 flex h-full w-[480px] max-w-[96vw] flex-col bg-white shadow-[-12px_0_40px_rgba(15,35,64,0.18)] outline-none">
          <header className="flex items-start justify-between gap-3 border-b border-[#E3E7ED] px-5 py-4">
            <div className="min-w-0">
              <RD.Title className="text-[15px] font-semibold text-[#0F2340]">{title}</RD.Title>
              {description ? <RD.Description className="mt-0.5 text-[12px] text-ink-soft">{description}</RD.Description> : <RD.Description className="sr-only">{title}</RD.Description>}
            </div>
            <RD.Close className="rounded p-1 text-ink-faint hover:bg-hover" aria-label="Tutup">
              <X size={16} />
            </RD.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export interface Evidence {
  quote: string;
  source_url: string | null;
  source_kind: string;
  collected_at: string | null;
  method?: string;
}

const safeHref = (url: string | null): string | undefined => {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
};

/** Panel "Bukti & Sumber" (§C.2): kutipan + URL + waktu ambil + metode + confidence. URL hanya http/https. */
export function EvidencePanel({ open, onOpenChange, value, evidence, confidence }: { open: boolean; onOpenChange: (o: boolean) => void; value: string; evidence: Evidence[]; confidence?: number | null }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Bukti & Sumber" description={value}>
      {evidence.length === 0 && <p className="text-[13px] text-ink-soft">Belum ada bukti tercatat untuk nilai ini.</p>}
      <ul className="space-y-3">
        {evidence.map((e, i) => {
          const href = safeHref(e.source_url);
          return (
            <li key={i} className="rounded-xl border border-[#E3E7ED] p-3">
              <blockquote className="border-l-2 border-[#0E9384] pl-2 text-[13px] text-ink">“{e.quote}”</blockquote>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
                <span>{e.method ?? e.source_kind}</span>
                {e.collected_at && <span>· diambil {formatDateTime(e.collected_at)}</span>}
                {href && (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-[#1D5FA8] hover:underline">
                    Buka sumber <ExternalLink size={11} aria-hidden />
                  </a>
                )}
              </p>
            </li>
          );
        })}
      </ul>
      {confidence != null && (
        <p className="mt-4 flex items-center gap-2 text-[12px] text-ink-soft">
          Confidence <ConfidenceBadge value={confidence} />
        </p>
      )}
    </Drawer>
  );
}
