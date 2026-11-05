import { Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useCreateMission } from '../../hooks/intel-queries';
import { useProjects } from '../../hooks/queries';
import { errorMessage } from '../../lib/api';
import {
  MISSION_INSTRUCTION_MAX,
  MISSION_MAX_RUNS,
  emptyMissionForm,
  missionFormToBody,
  validateMissionForm,
  type MissionForm,
  type MissionFormErrors,
} from '../../lib/intel-mission';
import { NEW_AI_PROJECT } from '../../lib/intel-wizard';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { FieldError, inputClass, primaryBtn } from './IntelUi';

type Props = { workspaceId: string; open: boolean; onOpenChange: (open: boolean) => void; onCreated: (missionId: string) => void };

const MODES = [
  { value: 'auto', label: 'Langsung jalan', hint: 'Rencana agent langsung ditulis ke Penjadwalan' },
  { value: 'review', label: 'Tinjau dulu', hint: 'Rencana ditampilkan untuk disetujui atau direvisi' },
] as const;

/** Form "Perintah ke Agent" (M3_TASK_014 Fase A): agent menyusun task & subtask di dalam timeline. */
export function MissionFormDialog({ workspaceId, open, onOpenChange, onCreated }: Props) {
  const [form, setForm] = useState<MissionForm>(() => emptyMissionForm());
  const [errors, setErrors] = useState<MissionFormErrors>({});
  const { data: projects } = useProjects(workspaceId);
  const create = useCreateMission(workspaceId);
  const set = (patch: Partial<MissionForm>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    const e = validateMissionForm(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    create.mutate(missionFormToBody(form), {
      onSuccess: (mission) => {
        toast.success('Perintah dikirim', { description: 'Agent sedang menyusun rencana.' });
        onCreated(mission.id);
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Perintah ke Agent" description="Tulis tujuanmu; agent menyusun task & subtask bertanggal di Penjadwalan." className="max-w-2xl pb-0">
      <div className="space-y-4 pb-5">
        <label className="block text-[12px] font-medium text-ink-soft">
          Judul misi
          <input className={cn(inputClass, 'mt-1')} value={form.title} maxLength={150} onChange={(e) => set({ title: e.target.value })} placeholder="mis. Kampanye Harbolnas 12.12" />
          <FieldError message={errors.title} />
        </label>
        <label className="block text-[12px] font-medium text-ink-soft">
          Perintah
          <textarea
            className={cn(inputClass, 'mt-1 h-auto min-h-[96px] py-2')}
            rows={4}
            maxLength={MISSION_INSTRUCTION_MAX}
            value={form.instruction}
            onChange={(e) => set({ instruction: e.target.value })}
            placeholder="mis. Siapkan kampanye Harbolnas untuk produk kopi susu di Instagram & X: riset kompetitor, kalender konten, dan draf caption."
          />
          <span className="mt-0.5 block text-right text-[11px] font-normal text-ink-faint">
            {form.instruction.length}/{MISSION_INSTRUCTION_MAX}
          </span>
          <FieldError message={errors.instruction} />
        </label>
        <label className="block text-[12px] font-medium text-ink-soft">
          Hasil yang diharapkan <span className="font-normal text-ink-faint">(opsional)</span>
          <input
            className={cn(inputClass, 'mt-1')}
            value={form.expectedOutcome}
            maxLength={1000}
            onChange={(e) => set({ expectedOutcome: e.target.value })}
            placeholder="mis. Kalender konten 2 minggu + 10 draf caption siap tinjau"
          />
          <FieldError message={errors.expectedOutcome} />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-[12px] font-medium text-ink-soft">
            Project
            <select className={cn(inputClass, 'mt-1')} value={form.projectId} onChange={(e) => set({ projectId: e.target.value })}>
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
          </label>
          <fieldset className="text-[12px] font-medium text-ink-soft">
            <legend>Timeline</legend>
            <div className="mt-1 flex items-center gap-2">
              <input type="date" aria-label="Mulai" className={inputClass} value={form.start} onChange={(e) => set({ start: e.target.value })} />
              <span>–</span>
              <input type="date" aria-label="Selesai" className={inputClass} value={form.end} onChange={(e) => set({ end: e.target.value })} />
            </div>
            <FieldError message={errors.period} />
          </fieldset>
        </div>
        <div role="radiogroup" aria-label="Mode rencana" className="grid gap-2 md:grid-cols-2">
          {MODES.map((m) => (
            <label
              key={m.value}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2',
                form.mode === m.value ? 'border-[#0E9384] shadow-[0_0_0_3px_rgba(14,147,132,0.12)]' : 'border-line hover:border-[#0E9384]',
              )}
            >
              <input type="radio" name="mission-mode" className="mt-0.5 accent-[#0E9384]" checked={form.mode === m.value} onChange={() => set({ mode: m.value })} />
              <span>
                <span className="block text-[13px] font-medium text-ink">{m.label}</span>
                <span className="block text-[11px] text-ink-faint">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="rounded-xl border border-line p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#0E9384]" checked={form.execute} onChange={(e) => set({ execute: e.target.checked })} />
            <span>
              <span className="block text-[13px] font-medium text-ink">Agent mengerjakan task bagiannya</span>
              <span className="block text-[11px] text-ink-faint">
                Task bertanda agent dikerjakan otomatis saat tanggal mulainya tiba (maks. 2 bersamaan), hasilnya ditulis di dokumen task.
              </span>
            </span>
          </label>
          {form.execute && (
            <label className="mt-2 flex items-center gap-2 pl-6 text-[12px] text-ink-soft">
              Kuota run agent
              <input
                type="number"
                min={1}
                max={MISSION_MAX_RUNS}
                className={cn(inputClass, 'h-8 w-20')}
                value={form.maxRuns}
                onChange={(e) => set({ maxRuns: Number(e.target.value) })}
              />
              <span className="text-ink-faint">run (1 task = 1 run; bisa ditambah nanti)</span>
            </label>
          )}
          <FieldError message={errors.maxRuns} />
        </div>
        <p className="text-[11px] text-ink-faint">
          Planner: agent dengan toolset task (default Agent_Strategist). Biaya planning ±$0,03–0,05; tiap run agent memakai budget token profil agent.
        </p>
      </div>
      <footer className="sticky bottom-0 -mx-5 flex items-center justify-between gap-2 border-t border-line bg-white/95 px-5 py-3 backdrop-blur">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Batal
        </Button>
        <button type="button" className={primaryBtn} disabled={create.isPending} onClick={submit}>
          <Send size={15} /> {create.isPending ? 'Mengirim…' : 'Kirim perintah'}
        </button>
      </footer>
    </Dialog>
  );
}
