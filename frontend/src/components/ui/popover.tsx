import * as RP from '@radix-ui/react-popover';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = 'start',
  className,
}: {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <RP.Root open={open} onOpenChange={onOpenChange}>
      <RP.Trigger asChild>{trigger}</RP.Trigger>
      <RP.Portal>
        <RP.Content
          align={align}
          sideOffset={4}
          collisionPadding={8}
          className={cn('z-50 min-w-[220px] rounded-lg border border-line bg-white p-1 text-sm shadow-[0_8px_30px_rgba(15,15,15,0.15)] outline-none', className)}
        >
          {children}
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  );
}

export function MenuItem({ children, onSelect, active, danger, className }: { children: ReactNode; onSelect?: () => void; active?: boolean; danger?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-hover',
        active && 'bg-hover',
        danger ? 'text-red-600' : 'text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-ink-faint">{children}</div>;
}
