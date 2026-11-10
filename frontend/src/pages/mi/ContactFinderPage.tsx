import { Contact, PauseCircle, Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ConfidenceBadge, StatusPill } from '../../components/mi/badges';
import { Drawer } from '../../components/mi/Drawer';
import { JobLimitsFields } from '../../components/mi/JobLimitsFields';
import { MiPage } from '../../components/mi/MiPage';
import { StateView, stateFromError } from '../../components/mi/StateView';
import { Dialog } from '../../components/ui/dialog';
import { useCfTargets, useCreateJob13, useEstimate13, useImportBatches, useUpdateTarget } from '../../hooks/mi-queries';
import { errorMessage } from '../../lib/api';
import { CAPTCHA_STEPS, CF_STATUS_META, PAUSE_META, formatEta } from '../../lib/mi-format';
import type { CfHint, CfStatus, CfTarget, JobLimits } from '../../lib/mi-types';
import type { WorkspaceSummary } from '../../lib/types';
import { cn, timeAgo } from '../../lib/utils';

const STATUSES = Object.keys(CF_STATUS_META) as CfStatus[];

/** Contact Finder (DSH-V1-06, F1b): status per target, hint, pilih kandidat, jalankan ulang, estimasi waktu & pause CAPTCHA. */
export function ContactFinderPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const [params] = useSearchParams();
  const batchId = params.get('batch') ?? undefined;
  const [statuses, setStatuses] = useState<CfStatus[]>([]);
  const [hintFor, setHintFor] = useState<CfTarget | null>(null);
  const [pickFor, setPickFor] = useState<CfTarget | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const targets = useCfTargets(workspace.id, { statuses, import_batch_id: batchId });
  const update = useUpdateTarget(workspace.id);
  const canEdit = workspace.role !== 'viewer';
  const summary = targets.data?.summary;
  const items = targets.data?.items ?? [];

  const patch = (t: CfTarget, body: Parameters<typeof update.mutate>[0], ok: string) =>
    update.mutate({ ...body, targetId: t.target_id }, { onSuccess: () => toast.success(ok), onError: (e) => toast.error(errorMessage(e)) });
  const toggleStatus = (s: CfStatus) => setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <MiPage
      wide
      eyebrow={<><Contact size={14} /> Company Intelligence</>}
      title="Contact Finder"
      description="Cari website & kontak resmi tiap target lewat Google Maps/Search di Chrome (volume rendah). Hanya kontak yang dipublikasikan sendiri oleh organisasi; kontak personal wajib review."
      actions={canEdit && <button type="button" onClick={() => setRunOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0F2340] px-4 text-sm font-medium text-white hover:bg-[#1a3560]"><Play size={15} /> Jalankan Contact Finder</button>}
    >
      {summary?.paused && (
        <div role="status" className="mb-4 flex gap-3 rounded-2xl border border-[#F3D19C] bg-[#FFF8EC] px-4 py-3 text-[#7A3E06]">
          <PauseCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <div className="text-[13px]">
            <p className="text-[14px] font-semibold">{PAUSE_META[summary.paused.reason].title}</p>
            <p>Dijeda sejak {timeAgo(summary.paused.since)} — antrean berhenti sampai dilanjutkan.</p>
            {summary.paused.reason === 'captcha' && (
              <ol className="mt-1 list-decimal pl-5 text-[12px]">
                {CAPTCHA_STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
            <Link to={`/w/${workspace.id}/agents/jobs`} className="mt-1 inline-block font-medium underline">
              Buka job Contact Finder untuk Lanjutkan
            </Link>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter status">
        {STATUSES.map((s) => {
          const meta = CF_STATUS_META[s];
          const active = statuses.includes(s);
          return (
            <button key={s} type="button" aria-pressed={active} onClick={() => toggleStatus(s)} className={cn('rounded-full border px-3 py-1 text-[12px] font-medium', active ? 'border-[#0F2340] bg-[#0F2340] text-white' : 'border-line-strong bg-white text-ink')}>
              <span aria-hidden>{meta.glyph}</span> {meta.label} <span className="tabular-nums opacity-70">{new Intl.NumberFormat('id-ID').format(summary?.counts[s] ?? 0)}</span>
            </button>
          );
        })}
        {summary?.eta_seconds != null && <span className="ml-auto text-[13px] text-ink-soft">Estimasi sisa waktu: <strong className="text-[#0F2340]">{formatEta(summary.eta_seconds)}</strong></span>}
      </div>
      {batchId && <p className="mb-3 text-[12px] text-ink-soft">Menampilkan target dari batch import <code>{batchId}</code> · <Link to={`/w/${workspace.id}/companies/contact-finder`} className="text-[#1D5FA8] underline">semua target</Link></p>}

      {targets.isLoading ? (
        <StateView kind="loading" />
      ) : targets.error ? (
        <StateView kind={stateFromError(targets.error)} error={targets.error} />
      ) : items.length === 0 ? (
        <StateView kind={statuses.length ? 'filtered-empty' : 'empty'} title={statuses.length ? undefined : 'Belum ada target pencarian kontak'} action={statuses.length ? <button type="button" onClick={() => setStatuses([])} className="text-[#1D5FA8] underline">Reset filter</button> : <Link to={`/w/${workspace.id}/companies/import`} className="text-[#1D5FA8] underline">Import daftar instansi</Link>} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E3E7ED] bg-white">
          <table className="w-full text-[13px]">
            <thead className="bg-[#F5F7FA] text-left text-[11px] tracking-[0.06em] text-ink-soft uppercase">
              <tr>
                <th scope="col" className="px-4 py-2">Nama</th>
                <th scope="col" className="px-2 py-2">Sektor</th>
                <th scope="col" className="px-2 py-2">Wilayah</th>
                <th scope="col" className="px-2 py-2">Petunjuk</th>
                <th scope="col" className="px-2 py-2">Prio</th>
                <th scope="col" className="px-2 py-2">Status</th>
                <th scope="col" className="px-2 py-2">Hasil / kandidat</th>
                <th scope="col" className="px-4 py-2"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const meta = CF_STATUS_META[t.status];
                const hint = [t.hint.city, t.hint.address, t.hint.website, ...(t.hint.keywords ?? [])].filter(Boolean).join(' · ');
                return (
                  <tr key={t.target_id} className="border-t border-[#EEF1F5] align-top">
                    <td className="px-4 py-2.5 font-medium text-[#0F2340]">
                      {t.name}
                      <span className="block text-[11px] font-normal text-ink-faint">{t.attempts}× dicoba{t.last_attempt_at ? ` · ${timeAgo(t.last_attempt_at)}` : ''}</span>
                    </td>
                    <td className="px-2 py-2.5 text-ink-soft">{t.kbli_code ?? '—'}</td>
                    <td className="px-2 py-2.5 text-ink-soft">{t.region_name ?? '—'}</td>
                    <td className="px-2 py-2.5">
                      {canEdit ? (
                        <button type="button" onClick={() => setHintFor(t)} className="text-left text-[#1D5FA8] hover:underline">
                          {hint || '+ petunjuk'}
                        </button>
                      ) : (
                        hint || '—'
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <select aria-label={`Prioritas ${t.name}`} disabled={!canEdit} value={t.priority} onChange={(e) => patch(t, { targetId: t.target_id, priority: Number(e.target.value) }, 'Prioritas diubah')} className="h-7 rounded-md border border-line-strong bg-white px-1 text-[12px]">
                        {[1, 2, 3, 4, 5].map((p) => (
                          <option key={p} value={p}>
                            ▲ {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2.5">
                      <StatusPill tone={meta.tone} label={meta.label} glyph={meta.glyph} />
                    </td>
                    <td className="px-2 py-2.5 text-[12px]">
                      {t.found ? (
                        <span className="text-ink">
                          {t.found.website ?? 'tanpa website'}
                          {t.found.phone && ` · ${t.found.phone}`}
                          {t.found.email_generic && ` · ${t.found.email_generic}`}
                        </span>
                      ) : t.status === 'ambiguous' && t.candidates.length ? (
                        <button type="button" onClick={() => setPickFor(t)} className="font-medium text-[#B45309] hover:underline">
                          {t.candidates.length} kandidat — pilih
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {canEdit && ['not_found', 'ambiguous', 'needs_hint'].includes(t.status) && (
                        <button type="button" aria-label={`Jalankan ulang ${t.name}`} title="Jalankan ulang" onClick={() => patch(t, { targetId: t.target_id, rerun: true }, 'Masuk antrean ulang')} className="rounded p-1 text-ink-faint hover:bg-hover hover:text-ink">
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hintFor && <HintDialog target={hintFor} onClose={() => setHintFor(null)} onSave={(hint) => (patch(hintFor, { targetId: hintFor.target_id, hint }, 'Petunjuk disimpan — target masuk antrean ulang'), setHintFor(null))} />}
      <Drawer open={!!pickFor} onOpenChange={(o) => !o && setPickFor(null)} title={`Pilih kandidat: ${pickFor?.name ?? ''}`} description="Bandingkan nama, alamat, domain, dan jarak. Pilihan Anda menjadi sumber kebenaran (tercatat sebagai keputusan manusia).">
        <ul className="space-y-3">
          {pickFor?.candidates.map((c) => (
            <li key={c.candidate_id} className="rounded-xl border border-[#E3E7ED] p-3 text-[13px]">
              <p className="font-semibold text-[#0F2340]">{c.name}</p>
              <p className="text-ink-soft">{c.address ?? 'alamat tidak diketahui'}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
                <span>{c.domain ?? 'tanpa domain'}</span>
                {c.distance_km !== null && <span>· {c.distance_km.toFixed(1).replace('.', ',')} km</span>}
                <ConfidenceBadge value={c.confidence} />
              </p>
              <p className="mt-1 text-[12px] text-ink-soft">Alasan cocok: {c.reason}</p>
              <button type="button" disabled={update.isPending} onClick={() => pickFor && (patch(pickFor, { targetId: pickFor.target_id, select_candidate_id: c.candidate_id }, 'Kandidat dipilih'), setPickFor(null))} className="mt-2 h-8 rounded-lg bg-[#0E9384] px-3 text-[13px] font-medium text-white">
                Pilih kandidat ini
              </button>
            </li>
          ))}
        </ul>
      </Drawer>
      {runOpen && <RunDialog ws={workspace.id} defaultBatch={batchId} onClose={() => setRunOpen(false)} />}
    </MiPage>
  );
}

function HintDialog({ target, onClose, onSave }: { target: CfTarget; onClose: () => void; onSave: (hint: CfHint) => void }) {
  const [hint, setHint] = useState({ city: target.hint.city ?? '', address: target.hint.address ?? '', website: target.hint.website ?? '', keywords: (target.hint.keywords ?? []).join(', ') });
  const field = (key: 'city' | 'address' | 'website' | 'keywords', label: string, placeholder: string) => (
    <label className="block text-[13px]">
      <span className="font-medium text-[#0F2340]">{label}</span>
      <input value={hint[key]} placeholder={placeholder} onChange={(e) => setHint({ ...hint, [key]: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-line-strong px-3 outline-none focus:border-[#0E9384]" />
    </label>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Petunjuk untuk ${target.name}`} description="Petunjuk mempersempit pencarian; target akan dicari ulang.">
      <div className="space-y-3">
        {field('city', 'Kota', 'mis. Cimahi')}
        {field('address', 'Alamat', 'mis. Jl. Amir Machmud 12')}
        {field('website', 'Website', 'mis. smaharapan.sch.id')}
        {field('keywords', 'Kata kunci (pisahkan koma)', 'mis. yayasan, SMA swasta')}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-ink-soft hover:bg-hover">
            Batal
          </button>
          <button
            type="button"
            onClick={() =>
              onSave({
                ...(hint.city.trim() ? { city: hint.city.trim() } : {}),
                ...(hint.address.trim() ? { address: hint.address.trim() } : {}),
                ...(hint.website.trim() ? { website: hint.website.trim() } : {}),
                keywords: hint.keywords.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 10),
              })
            }
            className="h-9 rounded-lg bg-[#0F2340] px-4 font-medium text-white"
          >
            Simpan & cari ulang
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function RunDialog({ ws, defaultBatch, onClose }: { ws: string; defaultBatch?: string; onClose: () => void }) {
  const batches = useImportBatches(ws);
  const [batch, setBatch] = useState(defaultBatch ?? '');
  const [rerun, setRerun] = useState<('not_found' | 'ambiguous' | 'needs_hint')[]>([]);
  const [limits, setLimits] = useState<JobLimits>({ llm_assist: false, budget_usd: null });
  const estimate = useEstimate13(ws);
  const create = useCreateJob13(ws);
  const spec = () => ({ kind: 'contact_finder' as const, title: 'Contact Finder', ...limits, params: { import_batch_id: batch, rerun_statuses: rerun } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Jalankan Contact Finder" description="Pencarian berjalan dalam hitungan jam/hari karena volume Chrome dibatasi; job dijeda bila Google meminta CAPTCHA." className="max-w-lg">
      <div className="space-y-3 text-[13px]">
        <label className="block">
          <span className="font-medium text-[#0F2340]">Batch import</span>
          <select value={batch} onChange={(e) => (setBatch(e.target.value), estimate.reset())} className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-white px-2">
            <option value="">Pilih batch…</option>
            {batches.data?.items.filter((b) => !b.rolled_back_at).map((b) => (
              <option key={b.batch_id} value={b.batch_id}>
                {b.filename} ({new Intl.NumberFormat('id-ID').format(b.rows_total)} baris)
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="font-medium text-[#0F2340]">Ulangi juga target berstatus</legend>
          {(['not_found', 'ambiguous', 'needs_hint'] as const).map((s) => (
            <label key={s} className="mr-3 inline-flex items-center gap-1">
              <input type="checkbox" className="accent-[#0E9384]" checked={rerun.includes(s)} onChange={(e) => setRerun((r) => (e.target.checked ? [...r, s] : r.filter((x) => x !== s)))} />
              {CF_STATUS_META[s].label}
            </label>
          ))}
        </fieldset>
        <JobLimitsFields value={limits} onChange={(v) => (setLimits(v), estimate.reset())} estimate={estimate.data} />
        <div className="flex justify-end gap-2">
          <button type="button" disabled={!batch || estimate.isPending} onClick={() => estimate.mutate(spec(), { onError: (e) => toast.error(errorMessage(e)) })} className="h-9 rounded-lg border border-line-strong px-3 font-medium disabled:opacity-50">
            Hitung estimasi
          </button>
          <button
            type="button"
            disabled={!estimate.data || create.isPending}
            onClick={() => create.mutate({ spec: spec(), confirm_cost: true }, { onSuccess: () => (toast.success('Contact Finder dijalankan'), onClose()), onError: (e) => toast.error(errorMessage(e)) })}
            className="h-9 rounded-lg bg-[#0E9384] px-4 font-medium text-white disabled:opacity-50"
          >
            Jalankan
          </button>
        </div>
      </div>
    </Dialog>
  );
}
