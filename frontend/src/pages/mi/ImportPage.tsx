import { FileSpreadsheet, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { toast } from 'sonner';
import { StatusPill } from '../../components/mi/badges';
import { FileDropZone } from '../../components/mi/FileDropZone';
import { JobLimitsFields } from '../../components/mi/JobLimitsFields';
import { MiPage, TabBar, useUrlTab } from '../../components/mi/MiPage';
import { StateView, stateFromError } from '../../components/mi/StateView';
import { useCreateJob13, useEstimate13, useImportBatches, useUploadProfile, type JobSpecInput } from '../../hooks/mi-queries';
import { errorMessage } from '../../lib/api';
import { formatBytes } from '../../lib/mi-format';
import type { ImportBatch, JobLimits, UploadRef } from '../../lib/mi-types';
import type { WorkspaceSummary } from '../../lib/types';
import { cn, timeAgo } from '../../lib/utils';

const TABS = ['new', 'history'] as const;
const STEPS = ['File', 'Sheet & pratinjau', 'Mode', 'Batas & biaya'] as const;
type Mode = 'fill_db' | 'contact_targets';
const canImport = (role: string) => role !== 'viewer';

export const IMPORT_STATUS_PILL: Record<ImportBatch['status'], { tone: 'idle' | 'info' | 'success' | 'danger' | 'muted'; label: string }> = {
  profiling: { tone: 'info', label: 'Profil file' },
  mapping: { tone: 'info', label: 'Mapping kolom' },
  inserting: { tone: 'info', label: 'Memasukkan' },
  completed: { tone: 'success', label: 'Selesai' },
  failed: { tone: 'danger', label: 'Gagal' },
  rolled_back: { tone: 'muted', label: 'Di-rollback' },
};

/** Import XLSX/CSV (DSH-V1-06, F1b): file → sheet → mode → batas & biaya → jalankan; mapping otomatis oleh prospector. */
export function ImportPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const [tab, setTab] = useUrlTab(TABS, 'new');
  const batches = useImportBatches(workspace.id);
  return (
    <MiPage
      eyebrow={<><FileSpreadsheet size={14} /> Company Intelligence</>}
      title="Import data perusahaan & instansi"
      description="Unggah XLSX/CSV apa adanya (mis. nama + alamat instansi). Agent prospector menormalkan kolom secara otomatis; baris yang ragu masuk antrean review tanpa menghentikan impor."
      actions={<Link to={`/w/${workspace.id}/companies/contact-finder`} className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-white px-3 text-sm font-medium hover:bg-hover">Contact Finder</Link>}
    >
      <TabBar label="Import" value={tab} onChange={setTab} tabs={[{ id: 'new', label: 'Import baru' }, { id: 'history', label: 'Riwayat batch', count: batches.data?.items.filter((b) => b.rows_review > 0 && !b.rolled_back_at).length }]} />
      {tab === 'new' ? <ImportWizard workspace={workspace} onDone={() => setTab('history')} /> : <BatchHistory ws={workspace.id} query={batches} />}
    </MiPage>
  );
}

function ImportWizard({ workspace, onDone }: { workspace: WorkspaceSummary; onDone: () => void }) {
  const [upload, setUpload] = useState<UploadRef | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('fill_db');
  const [limits, setLimits] = useState<JobLimits>({ llm_assist: false, budget_usd: null });
  const profile = useUploadProfile(workspace.id, upload?.upload_id ?? null);
  const estimate = useEstimate13(workspace.id);
  const create = useCreateJob13(workspace.id);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = !upload ? 0 : !sheet ? 1 : 3;
  const sheets = profile.data?.sheets ?? [];
  const chosen = sheets.find((s) => s.name === sheet);

  useEffect(() => {
    if (sheets.length === 1 && !sheet) setSheet(sheets[0].name);
  }, [sheets, sheet]);
  useEffect(() => heading.current?.focus(), [step]);

  const spec = (): JobSpecInput => ({ kind: 'company_import', title: `Import ${upload?.filename ?? ''}`.slice(0, 150), ...limits, params: { upload_id: upload?.upload_id, sheet, mode } });
  const runEstimate = () => estimate.mutate(spec(), { onError: (e) => toast.error(errorMessage(e)) });
  const run = () =>
    create.mutate(
      { spec: spec(), confirm_cost: true },
      {
        onSuccess: () => {
          toast.success('Import dijalankan — progres tampil di Riwayat batch');
          onDone();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  if (!canImport(workspace.role)) return <StateView kind="forbidden">Import butuh izin <code>data:import</code> (Member ke atas).</StateView>;
  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2" aria-label="Langkah import">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === Math.min(step, 3) ? 'step' : undefined} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium', i < step ? 'bg-[#E6F4F2] text-[#0B7A6E]' : i === Math.min(step, 3) ? 'bg-[#0F2340] text-white' : 'bg-stone-100 text-stone-500')}>
            <span aria-hidden>{i < step ? '✔' : i + 1}</span> {s}
          </li>
        ))}
      </ol>
      <h2 ref={heading} tabIndex={-1} className="text-[16px] font-semibold text-[#0F2340] outline-none">
        {STEPS[Math.min(step, 3)]}
      </h2>

      {!upload ? (
        <FileDropZone workspaceId={workspace.id} purpose="import" onUploaded={setUpload} />
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-[#E3E7ED] bg-white px-4 py-2 text-[13px]">
          <span>
            <strong>{upload.filename}</strong> · {formatBytes(upload.size)}
          </span>
          <button type="button" onClick={() => (setUpload(null), setSheet(null), estimate.reset())} className="text-[#1D5FA8] hover:underline">
            Ganti file
          </button>
        </div>
      )}

      {upload && profile.isLoading && <StateView kind="loading" />}
      {upload && profile.error && <StateView kind={stateFromError(profile.error)} error={profile.error} />}
      {sheets.length > 0 && (
        <fieldset className="rounded-2xl border border-[#E3E7ED] bg-white p-4">
          <legend className="px-1 text-[12px] font-semibold tracking-[0.08em] text-ink-soft uppercase">Sheet</legend>
          <div className="flex flex-wrap gap-2">
            {sheets.map((s) => (
              <label key={s.name} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px]', sheet === s.name ? 'border-[#0E9384] bg-[#F1F8F7]' : 'border-line-strong')}>
                <input type="radio" name="sheet" className="accent-[#0E9384]" checked={sheet === s.name} onChange={() => setSheet(s.name)} />
                {s.name} <span className="text-ink-faint">±{new Intl.NumberFormat('id-ID').format(s.rows_estimate)} baris</span>
              </label>
            ))}
          </div>
          {chosen && <PreviewTable headers={chosen.headers} rows={chosen.preview} />}
        </fieldset>
      )}

      {sheet && (
        <>
          <fieldset className="rounded-2xl border border-[#E3E7ED] bg-white p-4">
            <legend className="px-1 text-[12px] font-semibold tracking-[0.08em] text-ink-soft uppercase">Mode</legend>
            {(
              [
                ['fill_db', 'Isi database', 'Baris menjadi perusahaan/instansi di Company Intelligence (duplikat di-merge, ragu → antrean review).'],
                ['contact_targets', 'Jadikan target pencarian kontak', 'Seperti di atas, lalu setiap baris masuk Contact Finder untuk dicari website & kontaknya (Google Maps/Search, volume rendah).'],
              ] as const
            ).map(([value, label, help]) => (
              <label key={value} className="flex cursor-pointer items-start gap-2 py-1.5 text-[13px]">
                <input type="radio" name="mode" className="mt-0.5 accent-[#0E9384]" checked={mode === value} onChange={() => setMode(value)} />
                <span>
                  <span className="font-medium text-[#0F2340]">{label}</span>
                  <span className="block text-ink-soft">{help}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <JobLimitsFields value={limits} onChange={(v) => (setLimits(v), estimate.reset())} estimate={estimate.data} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={runEstimate} disabled={estimate.isPending} className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-white px-4 text-sm font-medium hover:bg-hover disabled:opacity-50">
              {estimate.isPending ? 'Menghitung…' : 'Hitung estimasi'}
            </button>
            <button type="button" onClick={run} disabled={!estimate.data || create.isPending} title={estimate.data ? undefined : 'Hitung estimasi dulu'} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0E9384] px-4 text-sm font-medium text-white hover:bg-[#0B7A6E] disabled:opacity-50">
              <Play size={15} /> {create.isPending ? 'Menjalankan…' : 'Jalankan import'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PreviewTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-[#EEF1F5]">
      <table className="w-full text-[12px]">
        <caption className="sr-only">Pratinjau {rows.length} baris pertama</caption>
        <thead className="sticky top-0 bg-[#F5F7FA] text-left">
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="px-2 py-1.5 font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[#EEF1F5]">
              {headers.map((h, j) => (
                <td key={h} className="max-w-[16rem] truncate px-2 py-1">
                  {r[j] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatchHistory({ ws, query }: { ws: string; query: ReturnType<typeof useImportBatches> }) {
  const navigate = useNavigate();
  if (query.isLoading) return <StateView kind="loading" />;
  if (query.error) return <StateView kind={stateFromError(query.error)} error={query.error} />;
  const items = query.data?.items ?? [];
  if (!items.length) return <StateView kind="empty" title="Belum ada batch import" />;
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E3E7ED] bg-white">
      <table className="w-full text-[13px]">
        <thead className="bg-[#F5F7FA] text-left text-[11px] tracking-[0.06em] text-ink-soft uppercase">
          <tr>
            <th scope="col" className="px-4 py-2">File</th>
            <th scope="col" className="px-2 py-2">Status</th>
            <th scope="col" className="px-2 py-2">Masuk · Merge · Review · Gagal</th>
            <th scope="col" className="px-4 py-2">Dibuat</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b) => (
            <tr key={b.batch_id} onClick={() => navigate(`/w/${ws}/companies/import/${b.batch_id}`)} className="cursor-pointer border-t border-[#EEF1F5] hover:bg-[#FAFBFC]">
              <td className="px-4 py-2.5">
                <Link to={`/w/${ws}/companies/import/${b.batch_id}`} className="font-medium text-[#0F2340] hover:underline" onClick={(e) => e.stopPropagation()}>
                  {b.filename}
                </Link>
                <span className="block text-[11px] text-ink-faint">
                  {b.sheet ?? '—'} · {b.mode === 'contact_targets' ? 'target kontak' : 'isi database'} · {new Intl.NumberFormat('id-ID').format(b.rows_total)} baris
                </span>
              </td>
              <td className="px-2 py-2.5">
                <StatusPill {...IMPORT_STATUS_PILL[b.status]} />
              </td>
              <td className="px-2 py-2.5 tabular-nums text-ink-soft">
                {b.rows_inserted} · {b.rows_merged} · <span className={b.rows_review ? 'font-semibold text-[#B45309]' : ''}>{b.rows_review}</span> · <span className={b.rows_failed ? 'text-[#C2410C]' : ''}>{b.rows_failed}</span>
              </td>
              <td className="px-4 py-2.5 text-ink-soft">{timeAgo(b.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
