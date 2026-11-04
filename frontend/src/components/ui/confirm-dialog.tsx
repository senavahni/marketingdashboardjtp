import type { ReactNode } from 'react';
import { Button } from './button';
import { Dialog } from './dialog';

/** Dialog konfirmasi (pengganti `confirm()` native) — fokus kembali ke pemicu saat ditutup (Radix). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  danger,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="text-[13px] leading-relaxed text-ink-soft">{children}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Batal
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} disabled={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
