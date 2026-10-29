import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <RD.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl bg-white p-5 shadow-2xl outline-none',
            className,
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <RD.Title className="text-base font-semibold">{title}</RD.Title>
              {description && <RD.Description className="mt-1 text-[13px] text-ink-soft">{description}</RD.Description>}
            </div>
            <RD.Close className="rounded p-1 text-ink-faint hover:bg-hover" aria-label="Tutup">
              <X size={16} />
            </RD.Close>
          </div>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
