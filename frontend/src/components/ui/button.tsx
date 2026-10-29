import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger';

export function Button({ variant = 'ghost', size = 'md', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors select-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent',
        size === 'sm' ? 'h-7 px-2 text-[13px]' : 'h-8 px-3 text-sm',
        variant === 'primary' && 'bg-accent text-white hover:bg-[#0077d4]',
        variant === 'ghost' && 'text-ink-soft hover:bg-hover',
        variant === 'outline' && 'border border-line-strong text-ink hover:bg-hover',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
    />
  );
}

export function IconButton({ className, label, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cn('inline-flex h-6 w-6 items-center justify-center rounded text-ink-faint hover:bg-hover-strong hover:text-ink disabled:opacity-40', className)}
    />
  );
}
