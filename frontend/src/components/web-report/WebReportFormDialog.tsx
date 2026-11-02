import { AlertTriangle, Calculator } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useSaveWebReport } from '../../hooks/web-report-queries';
import { ApiError, errorMessage } from '../../lib/api';
import { formatRupiah, MONTHS_LONG, PERIOD_LABEL } from '../../lib/web-report-format';
import {
  apiFieldToFormField,
  costTotalPreview,
  initialFormState,
  toPayload,
  updateForm,
  validateForm,
  type FormErrors,
  type FormField,
  type WebReportFormState,
} from '../../lib/web-report-form';
import type { PeriodType, WebReportSession } from '../../lib/web-report-types';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Spinner } from '../ui/misc';
import { NumberInput } from './NumberInput';

type Props = {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ada = mode ubah */
  session?: WebReportSession;
  onSaved: (session: WebReportSession) => void;
};

const PERIOD_TYPES: PeriodType[] = ['monthly', 'quarterly', 'yearly', 'custom'];
const inputClass = 'h-9 rounded-md border border-line-strong bg-white px-2.5 text-sm outline-none focus:border-[#0E9384] focus:ring-2 focus:ring-[#0E9384]/15';

function Section({ title, step, children }: { title: string; step: number; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-line p-4">
      <legend className="flex items-center gap-2 px-1 text-[12px] font-semibold tracking-wide text-ink-soft uppercase">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0F2340] text-[11px] text-white">{step}</span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/** Form buat/ubah sesi laporan. Dirender ulang (key) setiap dibuka agar state awal segar. */
export function WebReportFormDialog({ workspaceId, open, onOpenChange, session, onSaved }: Props) {
  const save = useSaveWebReport(workspaceId);
  const [form, setForm] = useState<WebReportFormState>(() => initialFormState(new Date(), session));
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const set = (patch: Partial<WebReportFormState>) => {
    const next = updateForm(form, patch);
    setForm(next);
    if (isSubmitted) setErrors(validateForm(next));
  };
  const blurValidate = (field: FormField) => {
    const fieldError = validateForm(form)[field];
    setErrors((prev) => ({ ...prev, [field]: fieldError }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    const found = validateForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setServerError(null);
    save.mutate(
      { id: session?.id, version: session?.version, payload: toPayload(form) },
      {
        onSuccess: (saved) => onSaved(saved),
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') return setConflict(true);
          const field = err instanceof ApiError ? apiFieldToFormField(err.details?.field) : null;
          if (field) setErrors((prev) => ({ ...prev, [field]: err.message }));
          else setServerError(errorMessage(err));
        },
      },
    );
  };

  const costTotal = costTotalPreview(form);
  const yearOptions = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + 1 - i);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={session ? 'Ubah laporan' : 'Laporan website baru'}
      description="Masukkan angka satu periode. Hasil perhitungan & grafik muncul setelah disimpan."
      className="max-h-[92vh]! max-w-2xl!"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {conflict && (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <AlertTriangle size={15} /> Laporan sudah diubah orang lain. Tutup form lalu buka ulang untuk memuat data terbaru.
          </div>
        )}

        <Section step={1} title="Periode">
          <div className="flex flex-col gap-3">
            <div role="radiogroup" aria-label="Jenis periode" className="grid grid-cols-4 gap-1 rounded-lg bg-[#F5F7FA] p-1">
              {PERIOD_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={form.period_type === t}
                  onClick={() => set({ period_type: t, index: t === 'quarterly' ? Math.min(4, Math.ceil(form.index / 3) || 1) : form.index })}
                  className={cn(
                    'h-8 rounded-md text-[13px] font-medium transition-colors',
                    form.period_type === t ? 'bg-white text-[#0F2340] shadow-sm' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  {PERIOD_LABEL[t]}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              {form.period_type === 'monthly' && (
                <select aria-label="Bulan" className={cn(inputClass, 'w-40')} value={form.index} onChange={(e) => set({ index: Number(e.target.value) })}>
                  {MONTHS_LONG.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
              {form.period_type === 'quarterly' && (
                <select aria-label="Kuartal" className={cn(inputClass, 'w-40')} value={form.index} onChange={(e) => set({ index: Number(e.target.value) })}>
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>
                      Q{q} (kuartal {q})
                    </option>
                  ))}
                </select>
              )}
              {form.period_type !== 'custom' ? (
                <select aria-label="Tahun" className={cn(inputClass, 'w-28')} value={form.year} onChange={(e) => set({ year: Number(e.target.value) })}>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <label className="flex flex-col gap-1 text-[13px] font-medium">
                    Dari
                    <input type="date" className={inputClass} value={form.custom_start} onChange={(e) => set({ custom_start: e.target.value })} />
                  </label>
                  <label className="flex flex-col gap-1 text-[13px] font-medium">
                    Sampai
                    <input type="date" className={inputClass} value={form.custom_end} onChange={(e) => set({ custom_end: e.target.value })} />
                  </label>
                </>
              )}
            </div>
            {errors.period && <span className="text-[12px] text-red-600">{errors.period}</span>}

            <label className="flex flex-col gap-1 text-[13px] font-medium">
              Judul laporan
              <input
                className={cn(inputClass, errors.title && 'border-red-400')}
                value={form.title}
                maxLength={150}
                onChange={(e) => set({ title: e.target.value })}
                onBlur={() => blurValidate('title')}
                aria-invalid={!!errors.title}
              />
              {errors.title && <span className="text-[12px] font-normal text-red-600">{errors.title}</span>}
            </label>
          </div>
        </Section>

        <Section step={2} title="Funnel website">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NumberInput label="Total pengunjung" value={form.visitors} onChange={(v) => set({ visitors: v })} onBlur={() => blurValidate('visitors')} error={errors.visitors} hint="Traffic / user unik" />
            <NumberInput label="Order masuk (leads)" value={form.leads} onChange={(v) => set({ leads: v })} onBlur={() => blurValidate('leads')} error={errors.leads} hint="Form / order terkirim" />
            <NumberInput label="Sales (closing/lunas)" value={form.sales_count} onChange={(v) => set({ sales_count: v })} onBlur={() => blurValidate('sales_count')} error={errors.sales_count} hint="Transaksi terbayar" />
          </div>
        </Section>

        <Section step={3} title="Nominal">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NumberInput isCurrency label="Total omset" value={form.revenue} onChange={(v) => set({ revenue: v })} onBlur={() => blurValidate('revenue')} error={errors.revenue} />
            <NumberInput
              isCurrency
              label="Biaya maintenance"
              value={form.cost_maintenance}
              onChange={(v) => set({ cost_maintenance: v })}
              onBlur={() => blurValidate('cost_maintenance')}
              error={errors.cost_maintenance}
            />
            <NumberInput isCurrency label="Biaya iklan" value={form.cost_ads} onChange={(v) => set({ cost_ads: v })} onBlur={() => blurValidate('cost_ads')} error={errors.cost_ads} />
          </div>
          <p className="mt-2 text-right text-[12px] text-ink-soft">
            Total biaya: <span className="font-medium text-ink tabular-nums">{costTotal === null ? '—' : formatRupiah(costTotal)}</span>
          </p>
        </Section>

        <label className="flex flex-col gap-1 text-[13px] font-medium">
          Catatan <span className="font-normal text-ink-faint">(opsional, ikut tampil di ekspor)</span>
          <textarea
            rows={2}
            maxLength={2000}
            className="rounded-md border border-line-strong px-2.5 py-2 text-sm outline-none focus:border-[#0E9384] focus:ring-2 focus:ring-[#0E9384]/15"
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>

        {serverError && (
          <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {serverError}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <button
            type="submit"
            disabled={save.isPending || conflict}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#0F2340] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1a3560] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E9384] disabled:opacity-50"
          >
            {save.isPending ? <Spinner className="text-white" /> : <Calculator size={15} />}
            Hitung &amp; Simpan
          </button>
        </div>
      </form>
    </Dialog>
  );
}
