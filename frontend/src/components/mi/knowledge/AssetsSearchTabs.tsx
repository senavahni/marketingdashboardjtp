import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useDebounce } from '../../../hooks/use-debounce';
import { useCreateJob13, useKnAssets, useKnSearch, useUploads } from '../../../hooks/mi-queries';
import { errorMessage } from '../../../lib/api';
import { ASSET_PIPELINE, ASSET_STATUS_META } from '../../../lib/mi-format';
import type { JobLimits, KnAsset, UploadRef } from '../../../lib/mi-types';
import { cn } from '../../../lib/utils';
import { BookCitation, StatusPill } from '../badges';
import { FileDropZone } from '../FileDropZone';
import { JobLimitsFields } from '../JobLimitsFields';
import { StateView, stateFromError } from '../StateView';

type Meta = { kind: 'book' | 'brand'; title: string; author: string; rights: boolean };

/** Aset (§D.7): upload PDF ≤ 100 MB → book_ingest; progres dua fase (unggah lalu proses, real-time tanpa reload). */
export function AssetsTab({ ws, canUpload }: { ws: string; canUpload: boolean }) {
  const assets = useKnAssets(ws);
  const uploads = useUploads(ws, 'book');
  const create = useCreateJob13(ws);
  const [meta, setMeta] = useState<Meta>({ kind: 'book', title: '', author: '', rights: false });
  const [limits, setLimits] = useState<JobLimits>({ llm_assist: false, budget_usd: null });
  const ready = meta.title.trim().length > 0 && meta.rights;

  const ingest = (upload: Pick<UploadRef, 'upload_id' | 'filename'>, m: Meta = meta) =>
    create.mutate(
      {
        spec: { kind: 'book_ingest', title: `Ingest ${m.title || upload.filename}`.slice(0, 150), ...limits, params: { upload_id: upload.upload_id, asset_kind: m.kind, title: m.title || upload.filename, author: m.author || null, usage_rights_confirmed: true } },
        confirm_cost: true,
      },
      { onSuccess: () => toast.success('Diunggah — pemrosesan berjalan, status diperbarui otomatis'), onError: (e) => toast.error(errorMessage(e)) },
    );
  const onUploaded = (u: UploadRef) => {
    ingest(u);
    setMeta({ kind: meta.kind, title: '', author: '', rights: false });
  };
  const items = assets.data?.items ?? [];
  const pendingUploads = (uploads.data ?? []).filter((u) => !items.some((a) => a.upload_id === u.upload_id));

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      {canUpload ? (
        <section aria-labelledby="up-title" className="space-y-3">
          <h3 id="up-title" className="text-[14px] font-semibold text-[#0F2340]">
            Upload PDF
          </h3>
          <fieldset className="space-y-2 rounded-2xl border border-[#E3E7ED] bg-white p-4 text-[13px]">
            <legend className="sr-only">Metadata aset</legend>
            <div className="flex gap-3">
              {(['book', 'brand'] as const).map((k) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="radio" name="asset-kind" className="accent-[#0E9384]" checked={meta.kind === k} onChange={() => setMeta({ ...meta, kind: k })} />
                  {k === 'book' ? 'Buku' : 'Brand guideline'}
                </label>
              ))}
            </div>
            <label className="block">
              <span className="font-medium text-[#0F2340]">Judul *</span>
              <input value={meta.title} maxLength={200} onChange={(e) => setMeta({ ...meta, title: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-line-strong px-3 outline-none focus:border-[#0E9384]" />
            </label>
            <label className="block">
              <span className="font-medium text-[#0F2340]">Penulis</span>
              <input value={meta.author} maxLength={200} onChange={(e) => setMeta({ ...meta, author: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-line-strong px-3 outline-none focus:border-[#0E9384]" />
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 accent-[#0E9384]" checked={meta.rights} onChange={(e) => setMeta({ ...meta, rights: e.target.checked })} />
              <span>Saya mengonfirmasi file ini boleh dipakai untuk keperluan internal (hak pakai). Potongan yang ditampilkan dibatasi ≤ 600 karakter + sitasi.</span>
            </label>
          </fieldset>
          <JobLimitsFields value={limits} onChange={setLimits} assistHint="(tidak dipakai ingest buku; kartu dibuat oleh curator)" />
          <FileDropZone workspaceId={ws} purpose={meta.kind} disabled={!ready || create.isPending} disabledReason={!ready ? 'Isi judul dan centang hak pakai dulu' : undefined} onUploaded={onUploaded} />
        </section>
      ) : (
        <StateView kind="forbidden">Upload butuh izin <code>knowledge:upload</code> (Member ke atas).</StateView>
      )}
      <section aria-labelledby="asset-title">
        <h3 id="asset-title" className="mb-3 text-[14px] font-semibold text-[#0F2340]">
          Aset
        </h3>
        {assets.isLoading ? (
          <StateView kind="loading" />
        ) : assets.error ? (
          <StateView kind={stateFromError(assets.error)} error={assets.error} />
        ) : items.length === 0 && pendingUploads.length === 0 ? (
          <StateView kind="empty" title="Belum ada buku atau brand guideline" />
        ) : (
          <ul className="space-y-3">
            {pendingUploads.map((u) => (
              <li key={u.upload_id} className="rounded-2xl border border-dashed border-[#D5DBE3] bg-white p-4 text-[13px]">
                <p className="font-medium text-[#0F2340]">{u.filename}</p>
                <p className="text-ink-soft">Terunggah · menunggu pemrosesan ({u.status})</p>
              </li>
            ))}
            {items.map((a) => (
              <AssetRow key={a.asset_id} asset={a} canRetry={canUpload} onRetry={() => ingest({ upload_id: a.upload_id, filename: a.title }, { kind: a.kind, title: a.title, author: '', rights: true })} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AssetRow({ asset, canRetry, onRetry }: { asset: KnAsset; canRetry: boolean; onRetry: () => void }) {
  const meta = ASSET_STATUS_META[asset.status];
  const step = ASSET_PIPELINE.indexOf(asset.status);
  return (
    <li className="rounded-2xl border border-[#E3E7ED] bg-white p-4 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-[#0F2340]">{asset.title}</p>
          <p className="text-ink-soft">
            {asset.kind === 'book' ? 'Buku' : 'Brand guideline'}
            {asset.pages != null && ` · ${asset.pages} halaman`}
            {asset.chunks != null && ` · ${new Intl.NumberFormat('id-ID').format(asset.chunks)} chunk`}
          </p>
        </div>
        <StatusPill tone={meta.tone} label={meta.label} spinning={meta.processing && asset.status !== 'uploaded'} />
      </div>
      {step >= 0 && asset.status !== 'ready' && (
        <ol className="mt-3 flex gap-1" aria-label="Tahap pemrosesan">
          {ASSET_PIPELINE.slice(1).map((s, i) => (
            <li key={s} aria-current={i + 1 === step ? 'step' : undefined} title={ASSET_STATUS_META[s].label} className={cn('h-1.5 flex-1 rounded-full', i + 1 < step ? 'bg-[#0E9384]' : i + 1 === step ? 'intel-live bg-[#1D5FA8]' : 'bg-[#EDF0F4]')} />
          ))}
        </ol>
      )}
      {asset.needs_ocr && (
        <p className="mt-2 flex items-center gap-1 text-[12px] text-[#B45309]">
          <AlertTriangle size={12} aria-hidden /> Ada halaman scan yang tidak terbaca; OCR belum tersedia (P2). Halaman lain tetap diproses.
        </p>
      )}
      {asset.status === 'failed' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[#C2410C]" role="alert">
          {asset.error && (
            <span>
              <code>{asset.error.code}</code> {asset.error.message}
            </span>
          )}
          {canRetry && (
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-lg border border-[#F5C2B3] px-2 py-1 font-medium hover:bg-[#FDF1EC]">
              <RotateCcw size={12} /> Coba lagi
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** Pencarian buku (§D.7): potongan ≤ 600 karakter + sitasi halaman. */
export function SearchTab({ ws }: { ws: string }) {
  const [q, setQ] = useState('');
  const query = useDebounce(q, 350);
  const search = useKnSearch(ws, query);
  return (
    <div>
      <label htmlFor="kn-q" className="sr-only">
        Cari di buku
      </label>
      <input id="kn-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari di buku, mis. “hook konten edukasi”" className="mb-4 h-10 w-full max-w-xl rounded-xl border border-line-strong bg-white px-4 text-[14px] outline-none focus:border-[#0E9384]" />
      {query.trim().length < 2 ? (
        <p className="text-[13px] text-ink-soft">Ketik minimal 2 karakter.</p>
      ) : search.isLoading ? (
        <StateView kind="loading" />
      ) : search.error ? (
        <StateView kind={stateFromError(search.error)} error={search.error} />
      ) : !search.data?.results.length ? (
        <StateView kind="filtered-empty" title="Tidak ada potongan yang cocok" />
      ) : (
        <ul className="space-y-3" aria-live="polite">
          {search.data.results.map((r) => (
            <li key={r.chunk_id} className="rounded-2xl border border-[#E3E7ED] bg-white p-4">
              <p className="text-[13px] text-ink">{r.text}</p>
              <p className="mt-2 flex items-center gap-2 text-[12px] text-ink-faint">
                <BookCitation citation={r.citation} quote={r.text} /> relevansi {Math.round(r.score * 100)}%
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
