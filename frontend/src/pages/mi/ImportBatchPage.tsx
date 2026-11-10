import { ArrowLeft, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router';
import { toast } from 'sonner';
import { ProgressBar } from '../../components/intel/IntelUi';
import { ColumnMappingSummary } from '../../components/mi/ColumnMappingSummary';
import { StatusPill } from '../../components/mi/badges';
import { MiPage, TabBar, useUrlTab } from '../../components/mi/MiPage';
import { StateView, stateFromError } from '../../components/mi/StateView';
import { Dialog } from '../../components/ui/dialog';
import { useCreateJob13, useImportBatch, useImportMutations, useImportRows } from '../../hooks/mi-queries';
import { errorMessage } from '../../lib/api';
import type { ImportBatchDetail, ImportRow, MappingEntry, RollbackImpact } from '../../lib/mi-types';
import type { WorkspaceSummary } from '../../lib/types';
import { formatDateTime } from '../../lib/utils';
import { IMPORT_STATUS_PILL } from './ImportPage';

const TABS = ['mapping', 'review', 'failed'] as const;
const fmt = (n: number) => new Intl.NumberFormat('id-ID').format(n);

/** Detail batch import (DSH-V1-06): progres, ringkasan mapping, antrean review baris, rollback. */
export function ImportBatchPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const { batchId } = useParams();
  const [tab, setTab] = useUrlTab(TABS, 'mapping');
  const batch = useImportBatch(workspace.id, batchId);
  const canEdit = workspace.role !== 'viewer';
  const back = `/w/${workspace.id}/companies/import?tab=history`;
  if (batch.isLoading) return <MiPage eyebrow="Import" title="Memuat batch…"><StateView kind="loading" /></MiPage>;
  if (!batch.data) return <MiPage eyebrow="Import" title="Batch tidak tersedia"><StateView kind={stateFromError(batch.error)} error={batch.error} /></MiPage>;
  const b = batch.data;
  const processed = b.rows_inserted + b.rows_merged + b.rows_review + b.rows_failed;
  return (
    <MiPage
      eyebrow={<Link to={back} className="inline-flex items-center gap-1 hover:underline"><ArrowLeft size={13} /> Riwayat import</Link>}
      title={b.filename}
      description={`${b.sheet ?? '—'} · ${b.mode === 'contact_targets' ? 'jadikan target pencarian kontak' : 'isi database'} · dibuat ${formatDateTime(b.created_at)}`}
      actions={
        <>
          <StatusPill {...IMPORT_STATUS_PILL[b.status]} />
          {b.mode === 'contact_targets' && (
            <Link to={`/w/${workspace.id}/companies/contact-finder?batch=${b.batch_id}`} className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-white px-3 text-sm font-medium hover:bg-hover">
              Contact Finder batch ini
            </Link>
          )}
          {canEdit && !b.rolled_back_at && <RollbackButton ws={workspace.id} batch={b} />}
        </>
      }
    >
      <section aria-label="Progres impor" className="mb-5 rounded-2xl border border-[#E3E7ED] bg-white p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
          <span className="font-semibold text-[#0F2340] tabular-nums">
            {fmt(processed)} / {fmt(b.rows_total)} baris
          </span>
          <span className="text-ink-soft tabular-nums">
            Masuk {fmt(b.rows_inserted)} · Di-merge {fmt(b.rows_merged)} · <span className="font-semibold text-[#B45309]">Perlu review {fmt(b.rows_review)}</span> · <span className="text-[#C2410C]">Gagal {fmt(b.rows_failed)}</span>
          </span>
        </div>
        <ProgressBar done={processed} total={b.rows_total} live={['profiling', 'mapping', 'inserting'].includes(b.status)} />
        {b.rolled_back_at && <p className="mt-2 text-[12px] text-ink-soft">Di-rollback {formatDateTime(b.rolled_back_at)}</p>}
      </section>
      <TabBar label="Detail batch" value={tab} onChange={setTab} tabs={[{ id: 'mapping', label: 'Mapping kolom' }, { id: 'review', label: 'Antrean review', count: b.rows_review }, { id: 'failed', label: 'Baris gagal', count: b.rows_failed }]} />
      {tab === 'mapping' ? <MappingTab ws={workspace.id} batch={b} canEdit={canEdit} /> : <RowsTab ws={workspace.id} batchId={b.batch_id} status={tab === 'review' ? 'review' : 'failed'} canEdit={canEdit} />}
    </MiPage>
  );
}

function MappingTab({ ws, batch, canEdit }: { ws: string; batch: ImportBatchDetail; canEdit: boolean }) {
  const create = useCreateJob13(ws);
  const rerun = (mapping: MappingEntry[]) =>
    create.mutate(
      {
        spec: {
          kind: 'company_import',
          title: `Import ulang ${batch.filename}`.slice(0, 150),
          llm_assist: false,
          budget_usd: null,
          params: { upload_id: batch.upload_id, sheet: batch.sheet, mode: batch.mode, column_mapping: mapping.filter((m) => m.field).map((m) => ({ source_col: m.source_col, field: m.field, transform: m.transform })) },
        },
        confirm_cost: true,
      },
      { onSuccess: () => toast.success('Import ulang dijalankan dengan mapping baru'), onError: (e) => toast.error(errorMessage(e)) },
    );
  return <ColumnMappingSummary mapping={batch.column_mapping} fields={batch.fields} canEdit={canEdit && !batch.rolled_back_at} isRerunning={create.isPending} onRerun={rerun} />;
}

function RowsTab({ ws, batchId, status, canEdit }: { ws: string; batchId: string; status: 'review' | 'failed'; canEdit: boolean }) {
  const rows = useImportRows(ws, batchId, status);
  const { decideRow } = useImportMutations(ws, batchId);
  const decide = (row: ImportRow, decision: 'merge' | 'new' | 'ignore', companyId?: string) =>
    decideRow.mutate({ rowId: row.row_id, decision, company_id: companyId }, { onSuccess: () => toast.success(`Baris ${row.row_no}: ${decision === 'merge' ? 'di-merge' : decision === 'new' ? 'dibuat baru' : 'diabaikan'}`), onError: (e) => toast.error(errorMessage(e)) });
  if (rows.isLoading) return <StateView kind="loading" />;
  if (rows.error) return <StateView kind={stateFromError(rows.error)} error={rows.error} />;
  const items = rows.data?.items ?? [];
  if (!items.length) return <StateView kind="empty" title={status === 'review' ? 'Tidak ada baris yang perlu direview' : 'Tidak ada baris gagal'} />;
  return (
    <>
    {status === 'review' && <p className="mb-3 text-[12px] text-ink-soft">Antrean ini tidak memblokir impor — baris lain tetap diproses.</p>}
    <ul className="space-y-3">
      {items.map((row) => (
        <li key={row.row_id} className="rounded-2xl border border-[#E3E7ED] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[12px] text-ink-faint">Baris {row.row_no}</p>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-[13px]">
                {Object.entries(row.raw).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink-soft">{k}</dt>
                    <dd className="text-ink">{v || '—'}</dd>
                  </div>
                ))}
              </dl>
              {row.issues.length > 0 && <p className="mt-1 text-[12px] text-[#B45309]">⚠ {row.issues.join(' · ')}</p>}
            </div>
            {canEdit && status === 'review' && (
              <div className="flex gap-2">
                <button type="button" disabled={decideRow.isPending} onClick={() => decide(row, 'new')} className="h-8 rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-hover">
                  Baru
                </button>
                <button type="button" disabled={decideRow.isPending} onClick={() => decide(row, 'ignore')} className="h-8 rounded-lg px-3 text-[13px] text-ink-soft hover:bg-hover">
                  Abaikan
                </button>
              </div>
            )}
          </div>
          {row.candidates.length > 0 && (
            <div className="mt-3 rounded-xl bg-[#F5F7FA] p-3">
              <p className="mb-1 text-[12px] font-semibold text-[#0F2340]">Mirip dengan yang sudah ada</p>
              {row.candidates.map((c) => (
                <div key={c.company_id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-[13px]">
                  <span>
                    <strong>{c.name}</strong> <span className="text-ink-soft">{c.address}</span> <span className="text-ink-faint tabular-nums">· kemiripan {Math.round(c.similarity * 100)}%</span>
                  </span>
                  {canEdit && status === 'review' && (
                    <button type="button" disabled={decideRow.isPending} onClick={() => decide(row, 'merge', c.company_id)} className="h-7 rounded-lg bg-[#0F2340] px-3 text-[12px] font-medium text-white">
                      Merge ke ini
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
    </>
  );
}

/** Rollback dengan ringkasan dampak (dry run) + ketik nama file untuk konfirmasi (§D.3). */
function RollbackButton({ ws, batch }: { ws: string; batch: ImportBatchDetail }) {
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<RollbackImpact | null>(null);
  const [confirm, setConfirm] = useState('');
  const { rollback } = useImportMutations(ws, batch.batch_id);
  const openDialog = () => {
    setOpen(true);
    setConfirm('');
    rollback.mutate({ dry_run: true }, { onSuccess: setImpact, onError: (e) => toast.error(errorMessage(e)) });
  };
  const doRollback = () =>
    rollback.mutate(
      { dry_run: false, confirm_filename: confirm },
      {
        onSuccess: () => {
          toast.success('Batch di-rollback');
          setOpen(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  return (
    <>
      <button type="button" onClick={openDialog} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#F5C2B3] bg-white px-3 text-sm font-medium text-[#C2410C] hover:bg-[#FDF1EC]">
        <Undo2 size={15} /> Rollback…
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Rollback batch import" description="Mengembalikan data seperti sebelum batch ini diimpor.">
        {!impact ? (
          <StateView kind="loading" />
        ) : (
          <div className="space-y-3 text-[13px]">
            <ul className="list-disc space-y-0.5 pl-5">
              <li>Menghapus {fmt(impact.companies_deleted)} perusahaan baru dari batch ini</li>
              <li>Mengembalikan {fmt(impact.merges_reverted)} hasil merge ke nilai sebelumnya</li>
              <li>
                {fmt(impact.kept_in_use)} perusahaan sudah dipakai (mis. opportunity) → <strong>tidak</strong> dihapus
              </li>
            </ul>
            <label htmlFor="rb-confirm" className="block font-medium text-[#0F2340]">
              Ketik <code className="rounded bg-stone-100 px-1">{batch.filename}</code> untuk konfirmasi
            </label>
            <input id="rb-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className="h-9 w-full rounded-lg border border-line-strong px-3 outline-none focus:border-[#C2410C]" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg px-3 text-ink-soft hover:bg-hover">
                Batal
              </button>
              <button type="button" disabled={confirm !== batch.filename || rollback.isPending} onClick={doRollback} className="h-9 rounded-lg bg-[#C2410C] px-4 font-medium text-white disabled:opacity-40">
                Rollback sekarang
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
