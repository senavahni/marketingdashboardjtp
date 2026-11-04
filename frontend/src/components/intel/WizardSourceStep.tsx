import { Check, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useIntelSources } from '../../hooks/intel-queries';
import { SOURCE_META, SOURCE_TYPES } from '../../lib/intel-format';
import { INTEL_LIMITS as L, type SourceMode, type SourceType } from '../../lib/intel-types';
import type { DraftErrors, WizardDraft } from '../../lib/intel-wizard';
import { cn } from '../../lib/utils';
import { ChipInput, FieldError, inputClass } from './IntelUi';

const MODE_LABEL: Record<SourceMode, string> = {
  api: 'API resmi',
  browser: 'Mode browser',
  unofficial: 'Tidak resmi',
  none: 'Tidak tersedia',
};
const SOURCE_HINT: Record<SourceType, string> = {
  x: 'Post & percakapan publik',
  threads: 'Thread publik dari Meta',
  web: 'Artikel, blog, halaman produk',
  trends: 'Minat pencarian Google',
};

type Props = { draft: WizardDraft; errors: DraftErrors; workspaceId: string; onChange: (fn: (d: WizardDraft) => WizardDraft) => void };

export function WizardSourceStep({ draft, errors, workspaceId, onChange }: Props) {
  const { data: status } = useIntelSources(workspaceId);
  const statusOf = (t: SourceType) => status?.sources.find((s) => s.source === t);
  const toggle = (t: SourceType) => onChange((d) => ({ ...d, enabled: { ...d.enabled, [t]: !d.enabled[t] } }));

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="intel-title" className="mb-1 block text-[12px] font-medium text-ink-soft">
          Judul riset
        </label>
        <input
          id="intel-title"
          autoFocus
          value={draft.title}
          maxLength={L.titleMaxChars}
          onChange={(e) => onChange((d) => ({ ...d, title: e.target.value }))}
          placeholder="mis. Persepsi kopi susu literan · Q4"
          className={cn(inputClass, 'h-11 text-[15px]', errors.title && 'border-[#C2410C]')}
        />
        <FieldError message={errors.title} />
      </div>

      <fieldset>
        <legend className="mb-2 text-[12px] font-medium text-ink-soft">Ambil data dari</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SOURCE_TYPES.map((t) => {
            const meta = SOURCE_META[t];
            const s = statusOf(t);
            const on = draft.enabled[t];
            return (
              <button
                key={t}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(t)}
                className={cn(
                  'group relative flex flex-col items-start gap-1 overflow-hidden rounded-xl border p-3 text-left transition-all focus-visible:outline-2 focus-visible:outline-[#0E9384]',
                  on
                    ? 'border-transparent bg-white shadow-[0_0_0_2px_var(--src),0_6px_16px_rgba(15,35,64,0.08)]'
                    : 'border-line-strong bg-white hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0',
                )}
                style={{ ['--src' as string]: meta.color }}
              >
                <span className="flex w-full items-center justify-between">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[14px] font-bold text-white"
                    style={{ background: meta.color }}
                    aria-hidden
                  >
                    {meta.glyph}
                  </span>
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded border',
                      on ? 'border-transparent text-white' : 'border-line-strong',
                    )}
                    style={on ? { background: meta.color } : undefined}
                  >
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                </span>
                <span className="text-[13px] font-semibold text-ink">{meta.label}</span>
                <span className="text-[11px] leading-snug text-ink-faint">{SOURCE_HINT[t]}</span>
                {s && (
                  <span className={cn('mt-0.5 text-[10px] font-medium', s.available ? 'text-[#0B7A6E]' : 'text-[#C2410C]')}>
                    ● {s.available ? MODE_LABEL[s.mode] : 'Tidak tersedia'}
                  </span>
                )}
              </button>
            );
          })}
          <div
            className="flex cursor-not-allowed flex-col items-start gap-1 rounded-xl border border-dashed border-line-strong p-3 opacity-60"
            aria-disabled
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-200 text-stone-500" aria-hidden>
              <Lock size={13} />
            </span>
            <span className="text-[13px] font-semibold text-ink">Meta</span>
            <span className="text-[11px] text-ink-faint">Facebook & Instagram</span>
            <span className="mt-0.5 rounded bg-stone-100 px-1.5 text-[10px] font-medium text-stone-600">Segera</span>
          </div>
        </div>
        <FieldError message={errors.sources} />
      </fieldset>

      <div className="space-y-3">
        {draft.enabled.x && (
          <SourcePanel type="x">
            <Field label="Keyword" error={errors['x.keywords']} hint={`Enter untuk menambah · maks ${L.keywordsMax}`}>
              <ChipInput
                value={draft.x.keywords}
                max={L.keywordsMax}
                invalid={!!errors['x.keywords']}
                placeholder="AI marketing tools"
                onChange={(v) => onChange((d) => ({ ...d, x: { ...d.x, keywords: v } }))}
              />
            </Field>
            <div className="flex flex-wrap gap-4 text-[12px] text-ink-soft">
              <Segmented
                value={draft.x.match}
                options={[
                  ['any', 'Salah satu keyword'],
                  ['all', 'Semua keyword'],
                ]}
                onChange={(v) => onChange((d) => ({ ...d, x: { ...d.x, match: v } }))}
              />
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="accent-[#0E9384]"
                  checked={draft.x.exclude_retweets}
                  onChange={(e) => onChange((d) => ({ ...d, x: { ...d.x, exclude_retweets: e.target.checked } }))}
                />
                Abaikan retweet
              </label>
            </div>
          </SourcePanel>
        )}
        {draft.enabled.threads && (
          <SourcePanel type="threads">
            <Field label="Keyword" error={errors['threads.keywords']} hint={`maks ${L.keywordsMax}`}>
              <ChipInput
                value={draft.threads.keywords}
                max={L.keywordsMax}
                invalid={!!errors['threads.keywords']}
                placeholder="AI marketing"
                onChange={(v) => onChange((d) => ({ ...d, threads: { ...d.threads, keywords: v } }))}
              />
            </Field>
            <Segmented
              value={draft.threads.search_type}
              options={[
                ['RECENT', 'Terbaru'],
                ['TOP', 'Terpopuler'],
              ]}
              onChange={(v) => onChange((d) => ({ ...d, threads: { ...d.threads, search_type: v } }))}
            />
          </SourcePanel>
        )}
        {draft.enabled.web && (
          <SourcePanel type="web">
            <Segmented
              value={draft.web.mode}
              options={[
                ['scrape', 'Ambil halaman tertentu'],
                ['crawl', 'Telusuri situs (crawl)'],
              ]}
              onChange={(v) => onChange((d) => ({ ...d, web: { ...d.web, mode: v } }))}
            />
            {draft.web.mode === 'scrape' ? (
              <Field label="URL halaman" error={errors['web.urls']} hint={`http/https · maks ${L.urlsMax}`}>
                <ChipInput
                  value={draft.web.urls}
                  max={L.urlsMax}
                  invalid={!!errors['web.urls']}
                  placeholder="https://contoh.id/artikel"
                  onChange={(v) => onChange((d) => ({ ...d, web: { ...d.web, urls: v } }))}
                />
              </Field>
            ) : (
              <Field label="URL awal" error={errors['web.start_url']}>
                <input
                  value={draft.web.start_url}
                  onChange={(e) => onChange((d) => ({ ...d, web: { ...d.web, start_url: e.target.value.trim() } }))}
                  placeholder="https://contoh.id/blog"
                  className={inputClass}
                />
              </Field>
            )}
          </SourcePanel>
        )}
        {draft.enabled.trends && (
          <SourcePanel type="trends">
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <Field label="Keyword dibandingkan" error={errors['trends.keywords']} hint={`maks ${L.trendsKeywordsMax}`}>
                <ChipInput
                  value={draft.trends.keywords}
                  max={L.trendsKeywordsMax}
                  invalid={!!errors['trends.keywords']}
                  placeholder="kopi susu"
                  onChange={(v) => onChange((d) => ({ ...d, trends: { ...d.trends, keywords: v } }))}
                />
              </Field>
              <Field label="Wilayah" error={errors['trends.geo']}>
                <input
                  value={draft.trends.geo}
                  onChange={(e) => onChange((d) => ({ ...d, trends: { ...d.trends, geo: e.target.value.toUpperCase() } }))}
                  className={inputClass}
                  maxLength={6}
                />
              </Field>
            </div>
          </SourcePanel>
        )}
      </div>
    </div>
  );
}

function SourcePanel({ type, children }: { type: SourceType; children: ReactNode }) {
  const meta = SOURCE_META[type];
  return (
    <div className="space-y-3 rounded-xl border border-line bg-[#FAFBFC] p-4" style={{ borderLeft: `3px solid ${meta.color}` }}>
      <div className="text-[12px] font-semibold text-ink">{meta.label}</div>
      {children}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-soft">{label}</span>
        {hint && <span className="text-[11px] text-ink-faint">{hint}</span>}
      </div>
      {children}
      <FieldError message={error} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-lg bg-[#EEF2F7] p-0.5 text-[12px]">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-md px-2.5 py-1 transition-colors',
            value === v ? 'bg-white font-medium text-[#0F2340] shadow-sm' : 'text-ink-soft hover:text-ink',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
