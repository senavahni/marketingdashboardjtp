import { ArrowRight, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { MAPPING_REVIEW_THRESHOLD, averageConfidence, mappingChanged, sortMapping } from '../../lib/mi-format';
import type { MappingEntry } from '../../lib/mi-types';
import { cn } from '../../lib/utils';
import { ConfidenceBadge } from './badges';

type Props = {
  mapping: MappingEntry[];
  fields: { field: string; label: string }[];
  agentName?: string;
  /** Tanpa izin `data:import` → hanya baca. */
  canEdit: boolean;
  isRerunning?: boolean;
  onRerun: (mapping: MappingEntry[]) => void;
};

/**
 * Ringkasan mapping kolom (§C.6): baris confidence < 0,7 di atas & berlatar amber; peninjauan opsional dan tidak
 * memblokir import. Mengubah mapping tidak langsung menjalankan — ada tombol eksplisit "Jalankan ulang".
 */
export function ColumnMappingSummary({ mapping, fields, agentName = 'prospector', canEdit, isRerunning, onRerun }: Props) {
  const [edited, setEdited] = useState<MappingEntry[]>(() => sortMapping(mapping));
  const changed = mappingChanged(mapping, edited);
  const avg = averageConfidence(mapping);
  const label = (f: string | null) => (f === null ? '(diabaikan)' : (fields.find((x) => x.field === f)?.label ?? f));
  const setField = (source: string, field: string | null) => setEdited((rows) => rows.map((r) => (r.source_col === source ? { ...r, field, method: 'manual', confidence: null } : r)));

  return (
    <section aria-labelledby="mapping-title" className="rounded-2xl border border-[#E3E7ED] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E3E7ED] px-4 py-3">
        <div>
          <h3 id="mapping-title" className="text-[14px] font-semibold text-[#0F2340]">
            Ringkasan mapping kolom
          </h3>
          <p className="text-[12px] text-ink-soft">
            Disusun otomatis oleh agent <span lang="en">{agentName}</span>
            {avg !== null && ` · confidence rata-rata ${avg.toFixed(2).replace('.', ',')}`} · peninjauan opsional, tidak memblokir impor
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            disabled={!changed || isRerunning}
            onClick={() => onRerun(edited)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0F2340] px-3 text-[13px] font-medium text-white hover:bg-[#1a3560] disabled:opacity-40"
          >
            <RefreshCw size={14} className={cn(isRerunning && 'animate-spin motion-reduce:animate-none')} aria-hidden /> Jalankan ulang dengan perubahan
          </button>
        )}
      </header>
      <table className="w-full text-[13px]">
        <thead className="text-left text-[11px] tracking-[0.06em] text-ink-soft uppercase">
          <tr>
            <th scope="col" className="px-4 py-2 font-semibold">Kolom file</th>
            <th scope="col" className="sr-only">menjadi</th>
            <th scope="col" className="px-2 py-2 font-semibold">Field kita</th>
            <th scope="col" className="px-2 py-2 font-semibold">Confidence</th>
            <th scope="col" className="px-4 py-2 font-semibold">Transformasi</th>
          </tr>
        </thead>
        <tbody>
          {edited.map((m) => {
            const low = m.field !== null && m.confidence !== null && m.confidence < MAPPING_REVIEW_THRESHOLD;
            return (
              <tr key={m.source_col} className={cn('border-t border-[#EEF1F5]', low && 'bg-[#FFF8EC]', m.field === null && 'text-ink-faint')}>
                <td className="px-4 py-2 font-medium">“{m.source_col}”</td>
                <td aria-hidden className="text-ink-faint">
                  <ArrowRight size={13} />
                </td>
                <td className="px-2 py-1.5">
                  {canEdit ? (
                    <select
                      aria-label={`Field tujuan untuk kolom ${m.source_col}`}
                      value={m.field ?? ''}
                      onChange={(e) => setField(m.source_col, e.target.value || null)}
                      className="h-8 max-w-[14rem] rounded-lg border border-line-strong bg-white px-2 text-[13px] outline-none focus:border-[#0E9384]"
                    >
                      <option value="">(diabaikan)</option>
                      {fields.map((f) => (
                        <option key={f.field} value={f.field}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    label(m.field)
                  )}
                </td>
                <td className="px-2 py-2">
                  {m.method === 'manual' ? <span className="text-[12px] text-ink-soft">diubah manual</span> : m.confidence !== null ? <ConfidenceBadge value={m.confidence} /> : '—'}
                  {m.method === 'llm' && <span className="ml-1 text-[11px] text-ink-faint">(LLM assist)</span>}
                </td>
                <td className="px-4 py-2 text-ink-soft">{m.transform ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
