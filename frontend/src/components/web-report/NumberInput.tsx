import { useId } from 'react';
import { cn } from '../../lib/utils';

/** Pisahkan input user (format Indonesia: titik ribuan, koma desimal) menjadi nilai mentah "1234.5". */
export function parseIdNumber(text: string, allowDecimal: boolean): string {
  const cleaned = text.replace(/[^\d,]/g, '');
  const [intPart, ...rest] = cleaned.split(',');
  const int = intPart.replace(/^0+(?=\d)/, '');
  if (!allowDecimal || rest.length === 0) return int;
  return `${int || '0'}.${rest.join('').slice(0, 2)}`;
}

/** Nilai mentah "1234.5" → tampilan "1.234,5". */
export function displayIdNumber(raw: string): string {
  if (!raw) return '';
  const [int, dec] = raw.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec === undefined ? grouped : `${grouped},${dec}`;
}

type Props = {
  label: string;
  value: string;
  onChange: (raw: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  isCurrency?: boolean;
  disabled?: boolean;
};

export function NumberInput({ label, value, onChange, onBlur, error, hint, isCurrency = false, disabled }: Props) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      <div
        className={cn(
          'flex h-9 items-center rounded-md border bg-white px-2.5 transition-colors focus-within:border-[#0E9384] focus-within:ring-2 focus-within:ring-[#0E9384]/15',
          error ? 'border-red-400' : 'border-line-strong',
        )}
      >
        {isCurrency && <span className="mr-1.5 text-[13px] text-ink-faint">Rp</span>}
        <input
          id={id}
          inputMode={isCurrency ? 'decimal' : 'numeric'}
          autoComplete="off"
          disabled={disabled}
          value={displayIdNumber(value)}
          onChange={(e) => onChange(parseIdNumber(e.target.value, isCurrency))}
          onBlur={onBlur}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="min-w-0 flex-1 bg-transparent text-right text-sm tabular-nums outline-none"
        />
      </div>
      {error ? (
        <span id={`${id}-error`} className="text-[12px] text-red-600">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className="text-[12px] text-ink-faint">
            {hint}
          </span>
        )
      )}
    </div>
  );
}
