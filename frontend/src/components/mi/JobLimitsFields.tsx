import { Sparkles } from 'lucide-react';
import { formatUsd } from '../../lib/intel-format';
import { budgetWarning, formatDurationRange } from '../../lib/mi-format';
import type { Estimate13, JobLimits } from '../../lib/mi-types';
import { inputClass } from '../intel/IntelUi';

type Props = {
  value: JobLimits;
  onChange: (v: JobLimits) => void;
  estimate?: Estimate13 | null;
  /** Teks tambahan biaya LLM assist per kind (mis. "+$3–6 / 1.000 baris"). */
  assistHint?: string;
};

/**
 * Langkah "Batas & biaya" semua wizard job 1.3 (DSH-V1-04, §D.9): toggle LLM assist (default mati) + Budget USD
 * (kosong = tanpa batas; < estimasi → peringatan) + estimasi biaya **dan durasi**.
 */
export function JobLimitsFields({ value, onChange, estimate, assistHint = '+$3–6 / 1.000 baris' }: Props) {
  const warning = budgetWarning(value.budget_usd, estimate, value.llm_assist);
  const total = estimate ? estimate.llm.usd_est + estimate.external.usd + (value.llm_assist ? estimate.llm.llm_assist_usd_est : 0) : null;
  return (
    <fieldset className="space-y-3 rounded-2xl border border-[#E3E7ED] bg-white p-4">
      <legend className="px-1 text-[12px] font-semibold tracking-[0.08em] text-ink-soft uppercase">Batas & biaya</legend>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" role="switch" aria-checked={value.llm_assist} className="peer sr-only" checked={value.llm_assist} onChange={(e) => onChange({ ...value, llm_assist: e.target.checked })} />
        <span aria-hidden className="mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full bg-[#D5DBE3] px-0.5 transition-colors peer-checked:bg-[#0E9384] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#0E9384]">
          <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${value.llm_assist ? 'translate-x-4' : ''}`} />
        </span>
        <span className="text-[13px]">
          <span className="flex items-center gap-1 font-medium text-[#0F2340]">
            <Sparkles size={13} aria-hidden /> LLM assist {value.llm_assist ? 'aktif' : 'mati'}
          </span>
          <span className="block text-ink-soft">
            Hanya untuk baris ber-confidence rendah; sisanya diproses model lokal ($0). Tambahan biaya {assistHint}
            {estimate && value.llm_assist ? ` — estimasi +${formatUsd(estimate.llm.llm_assist_usd_est)}` : ''}.
          </span>
        </span>
      </label>
      <div>
        <label htmlFor="job-budget" className="block text-[13px] font-medium text-[#0F2340]">
          Budget USD <span className="font-normal text-ink-soft">(kosong = tanpa batas)</span>
        </label>
        <input
          id="job-budget"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={0.5}
          className={`${inputClass} mt-1 max-w-[10rem]`}
          value={value.budget_usd ?? ''}
          aria-describedby={warning ? 'job-budget-warning' : undefined}
          onChange={(e) => onChange({ ...value, budget_usd: e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value))) })}
        />
        {warning && (
          <p id="job-budget-warning" className="mt-1 text-[12px] text-[#B45309]">
            ⚠ {warning}
          </p>
        )}
      </div>
      {estimate && (
        <dl className="grid grid-cols-2 gap-2 rounded-xl bg-[#F5F7FA] p-3 text-[13px]">
          <div>
            <dt className="text-[11px] text-ink-soft uppercase">Estimasi biaya</dt>
            <dd className="font-semibold text-[#0F2340] tabular-nums">{formatUsd(total ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-soft uppercase">Estimasi durasi</dt>
            <dd className="font-semibold text-[#0F2340]">{formatDurationRange(estimate.duration_seconds)}</dd>
          </div>
          {estimate.warnings.map((w) => (
            <dd key={w.code} className="col-span-2 text-[12px] text-[#B45309]">
              ⚠ {w.message}
            </dd>
          ))}
        </dl>
      )}
    </fieldset>
  );
}
