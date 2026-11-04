import { CalendarRange } from 'lucide-react';
import { INTEL_LIMITS as L } from '../../lib/intel-types';
import { presetPeriod, type DraftErrors, type WizardDraft } from '../../lib/intel-wizard';
import { cn } from '../../lib/utils';
import { ChipInput, FieldError, inputClass } from './IntelUi';
import { Field, Segmented } from './WizardSourceStep';

const PRESETS = [7, 30, 90] as const;

type Props = { draft: WizardDraft; errors: DraftErrors; onChange: (fn: (d: WizardDraft) => WizardDraft) => void };

export function WizardLimitsStep({ draft, errors, onChange }: Props) {
  const activePreset = PRESETS.find((n) => {
    const p = presetPeriod(n);
    return p.since === draft.since && p.until === draft.until;
  });
  const num = (v: string) => (v === '' ? 0 : Math.trunc(Number(v)));

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-ink-soft">
          <CalendarRange size={14} /> Rentang waktu data
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange((d) => ({ ...d, ...presetPeriod(n) }))}
              className={cn(
                'rounded-full border px-3 py-1 text-[12px] transition-colors',
                activePreset === n
                  ? 'border-[#0F2340] bg-[#0F2340] text-white'
                  : 'border-line-strong text-ink-soft hover:border-[#0F2340] hover:text-ink',
              )}
            >
              {n} hari terakhir
            </button>
          ))}
          <span className="mx-1 text-ink-faint">atau</span>
          <input
            type="date"
            aria-label="Tanggal mulai"
            value={draft.since}
            onChange={(e) => onChange((d) => ({ ...d, since: e.target.value }))}
            className={cn(inputClass, 'w-auto')}
          />
          <span className="text-ink-faint">–</span>
          <input
            type="date"
            aria-label="Tanggal akhir"
            value={draft.until}
            onChange={(e) => onChange((d) => ({ ...d, until: e.target.value }))}
            className={cn(inputClass, 'w-auto')}
          />
        </div>
        <FieldError message={errors.period} />
      </section>

      {(draft.enabled.x || draft.enabled.threads || (draft.enabled.web && draft.web.mode === 'crawl')) && (
        <section className="grid gap-3 sm:grid-cols-3">
          {draft.enabled.x && (
            <Field label="Maks. post X" hint={`≤ ${L.xMaxItems.toLocaleString('id-ID')}`} error={errors['x.max_items']}>
              <input
                type="number"
                min={1}
                max={L.xMaxItems}
                value={draft.x.max_items}
                onChange={(e) => onChange((d) => ({ ...d, x: { ...d.x, max_items: num(e.target.value) } }))}
                className={inputClass}
              />
            </Field>
          )}
          {draft.enabled.threads && (
            <Field label="Maks. thread" hint={`≤ ${L.threadsMaxItems.toLocaleString('id-ID')}`} error={errors['threads.max_items']}>
              <input
                type="number"
                min={1}
                max={L.threadsMaxItems}
                value={draft.threads.max_items}
                onChange={(e) => onChange((d) => ({ ...d, threads: { ...d.threads, max_items: num(e.target.value) } }))}
                className={inputClass}
              />
            </Field>
          )}
          {draft.enabled.web && draft.web.mode === 'crawl' && (
            <>
              <Field label="Maks. halaman" hint={`≤ ${L.crawlMaxPages}`} error={errors['web.max_pages']}>
                <input
                  type="number"
                  min={1}
                  max={L.crawlMaxPages}
                  value={draft.web.max_pages}
                  onChange={(e) => onChange((d) => ({ ...d, web: { ...d.web, max_pages: num(e.target.value) } }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Kedalaman tautan" hint={`0–${L.crawlMaxDepth}`} error={errors['web.max_depth']}>
                <input
                  type="number"
                  min={0}
                  max={L.crawlMaxDepth}
                  value={draft.web.max_depth}
                  onChange={(e) => onChange((d) => ({ ...d, web: { ...d.web, max_depth: num(e.target.value) } }))}
                  className={inputClass}
                />
              </Field>
            </>
          )}
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div>
          <div className="mb-1 text-[12px] font-medium text-ink-soft">Bahasa laporan</div>
          <Segmented
            value={draft.language}
            options={[
              ['id', 'Indonesia'],
              ['en', 'English'],
            ]}
            onChange={(v) => onChange((d) => ({ ...d, language: v }))}
          />
        </div>
        <Field label="Aspek sentimen (opsional)" hint="mis. harga, rasa, pengiriman" error={errors.aspects}>
          <ChipInput
            value={draft.aspects}
            max={L.aspectsMax}
            invalid={!!errors.aspects}
            placeholder="Tambah aspek yang ingin dinilai"
            onChange={(v) => onChange((d) => ({ ...d, aspects: v }))}
          />
        </Field>
      </section>
    </div>
  );
}
