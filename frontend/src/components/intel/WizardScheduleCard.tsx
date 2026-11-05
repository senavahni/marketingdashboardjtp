import { CalendarClock } from 'lucide-react';
import { useProjects } from '../../hooks/queries';
import { NEW_AI_PROJECT, type DraftErrors, type WizardDraft } from '../../lib/intel-wizard';
import { cn } from '../../lib/utils';
import { FieldError } from './IntelUi';

type Props = { draft: WizardDraft; errors: DraftErrors; workspaceId: string; onChange: (fn: (d: WizardDraft) => WizardDraft) => void };

const MODES = [
  { value: 'auto', label: 'Langsung jalan', hint: 'Rencana agent langsung ditulis ke Penjadwalan' },
  { value: 'review', label: 'Tinjau dulu', hint: 'Rencana ditampilkan untuk disetujui atau direvisi' },
] as const;

const inputCls = 'w-full rounded-lg border border-line-strong bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#0E9384]';

/** "Masukkan ke Penjadwalan" (M3_TASK_013): job riset → task induk + rencana tindak lanjut oleh agent. */
export function WizardScheduleCard({ draft, errors, workspaceId, onChange }: Props) {
  const { data: projects } = useProjects(workspaceId);
  const s = draft.schedule;
  const set = (patch: Partial<WizardDraft['schedule']>) => onChange((d) => ({ ...d, schedule: { ...d.schedule, ...patch } }));

  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#0E9384]" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        <span>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <CalendarClock size={14} /> Masukkan ke Penjadwalan
          </span>
          <span className="block text-[12px] text-ink-faint">
            Agent membuat project (atau memakai project pilihanmu) berisi task job ini, status ikut tiap tahap. Setelah selesai, agent menyusun
            task & subtask tindak lanjut di dalam timeline.
          </span>
        </span>
      </label>
      {s.enabled && (
        <div className="mt-3 grid gap-3 pl-7 md:grid-cols-2">
          <label className="block text-[12px] text-ink-soft">
            Project
            <select className={cn(inputCls, 'mt-1')} value={s.projectId} onChange={(e) => set({ projectId: e.target.value })}>
              <option value={NEW_AI_PROJECT}>🤖 Project baru (dibuat AI)</option>
              {projects?.length ? (
                <optgroup label="Project yang sudah ada">
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon ? `${p.icon} ` : ''}
                      {p.title}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <FieldError message={errors['schedule.project']} />
          </label>
          <fieldset className="text-[12px] text-ink-soft">
            <legend>Timeline tindak lanjut</legend>
            <div className="mt-1 flex items-center gap-2">
              <input type="date" aria-label="Mulai" className={inputCls} value={s.start} onChange={(e) => set({ start: e.target.value })} />
              <span>–</span>
              <input type="date" aria-label="Selesai" className={inputCls} value={s.end} onChange={(e) => set({ end: e.target.value })} />
            </div>
            <FieldError message={errors['schedule.period']} />
          </fieldset>
          <label className="flex cursor-pointer items-start gap-2 md:col-span-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#0E9384]" checked={s.execute} onChange={(e) => set({ execute: e.target.checked })} />
            <span>
              <span className="block text-[13px] font-medium text-ink">Agent mengerjakan task bagiannya</span>
              <span className="block text-[11px] text-ink-faint">Task bertanda agent dikerjakan otomatis saat tanggalnya tiba (kuota 10 run, bisa ditambah).</span>
            </span>
          </label>
          <div role="radiogroup" aria-label="Mode rencana" className="grid gap-2 md:col-span-2 md:grid-cols-2">
            {MODES.map((m) => (
              <label
                key={m.value}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2',
                  s.mode === m.value ? 'border-[#0E9384] shadow-[0_0_0_3px_rgba(14,147,132,0.12)]' : 'border-line hover:border-[#0E9384]',
                )}
              >
                <input type="radio" name="schedule-mode" className="mt-0.5 accent-[#0E9384]" checked={s.mode === m.value} onChange={() => set({ mode: m.value })} />
                <span>
                  <span className="block text-[13px] font-medium text-ink">{m.label}</span>
                  <span className="block text-[11px] text-ink-faint">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
