import { useVirtualizer } from '@tanstack/react-virtual';
import { Download, ExternalLink, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useIntelItems, type ItemFilters } from '../../hooks/intel-queries';
import { useDebounce } from '../../hooks/use-debounce';
import { ApiError, apiBlob, errorMessage } from '../../lib/api';
import { SENTIMENTS, SENTIMENT_META, SOURCE_META, formatCount } from '../../lib/intel-format';
import { INTEL_LIMITS, type IntelJob, type Sentiment, type SourceType } from '../../lib/intel-types';
import { slugify, downloadBlob } from '../../lib/web-report-export/file-name';
import { safeHref } from '../../lib/safe-markdown';
import { cn, formatDateTime } from '../../lib/utils';
import { Button } from '../ui/button';
import { Spinner } from '../ui/misc';
import { SourceChip, inputClass } from './IntelUi';

const SEARCH_DEBOUNCE_MS = 400;
const ROW_ESTIMATE = 72;
const selectClass = 'h-9 rounded-lg border border-line-strong bg-white px-2 text-[13px] outline-none focus:border-[#0E9384]';

type Row = {
  id: string;
  source: SourceType;
  posted_at: string | null;
  author: string | null;
  text: string;
  url: string | null;
  engagement: number | null;
  sentiment: Sentiment | null;
};

function toRows(cols: string[], rows: unknown[][]): Row[] {
  const at = (name: string) => cols.indexOf(name);
  const idx = {
    id: at('id'),
    source: at('source'),
    posted_at: at('posted_at'),
    author: at('author'),
    text: at('text'),
    url: at('url'),
    engagement: at('engagement'),
    sentiment: at('sentiment'),
  };
  return rows.map((r) => ({
    id: String(r[idx.id]),
    source: r[idx.source] as SourceType,
    posted_at: (r[idx.posted_at] as string | null) ?? null,
    author: (r[idx.author] as string | null) ?? null,
    text: String(r[idx.text] ?? ''),
    url: (r[idx.url] as string | null) ?? null,
    engagement: typeof r[idx.engagement] === 'number' ? (r[idx.engagement] as number) : null,
    sentiment: (r[idx.sentiment] as Sentiment | null) ?? null,
  }));
}

export function RawDataTab({ job }: { job: IntelJob }) {
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Omit<ItemFilters, 'q'>>({ order_by: '-created_at' });
  const [exporting, setExporting] = useState(false);
  const debouncedQ = useDebounce(q.trim(), SEARCH_DEBOUNCE_MS);
  const query: ItemFilters = { ...filters, q: debouncedQ || undefined };
  const items = useIntelItems(job.id, query, !!job.mcp_job_id);
  const rows = useMemo(() => items.data?.pages.flatMap((p) => toRows(p.cols, p.rows)) ?? [], [items.data]);
  const total = items.data?.pages[0]?.total ?? 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 8,
  });
  const virtualItems = virt.getVirtualItems();
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = items;

  // Muat halaman berikutnya saat baris terakhir hampir terlihat
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= rows.length - 10) void fetchNextPage();
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await apiBlob(`/intel/jobs/${job.id}/items/export.csv`, { query: { ...filters, q: debouncedQ || undefined } });
      downloadBlob(blob, `riset_${slugify(job.title)}.csv`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const expired = items.error instanceof ApiError && (items.error.status === 410 || items.error.code === 'RESULT_EXPIRED');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" data-tour="intel-raw-toolbar">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            maxLength={INTEL_LIMITS.queryMaxChars}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari teks atau akun…"
            aria-label="Cari data"
            className={cn(inputClass, 'pl-8')}
          />
        </div>
        <select
          aria-label="Filter sumber"
          className={selectClass}
          value={filters.source ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, source: (e.target.value || undefined) as SourceType | undefined }))}
        >
          <option value="">Semua sumber</option>
          {job.sources.map((s) => (
            <option key={s} value={s}>
              {SOURCE_META[s].label}
            </option>
          ))}
        </select>
        <div className="flex gap-1" role="group" aria-label="Filter sentimen">
          {SENTIMENTS.map((s) => {
            const on = filters.sentiment === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setFilters((f) => ({ ...f, sentiment: on ? undefined : s }))}
                className={cn(
                  'h-9 rounded-lg border px-2.5 text-[12px] transition-colors',
                  on ? 'border-transparent text-white' : 'border-line-strong bg-white text-ink-soft hover:text-ink',
                )}
                style={on ? { background: SENTIMENT_META[s].color } : undefined}
              >
                {SENTIMENT_META[s].label}
              </button>
            );
          })}
        </div>
        <select
          aria-label="Urutkan"
          className={selectClass}
          value={filters.order_by}
          onChange={(e) => setFilters((f) => ({ ...f, order_by: e.target.value as ItemFilters['order_by'] }))}
        >
          <option value="-created_at">Terbaru</option>
          <option value="created_at">Terlama</option>
          <option value="-engagement">Engagement tertinggi</option>
        </select>
        <Button variant="outline" className="h-9" disabled={exporting || expired || !rows.length} onClick={() => void exportCsv()}>
          {exporting ? <Spinner /> : <Download size={14} />} {exporting ? 'Menyiapkan…' : 'Ekspor CSV'}
        </Button>
      </div>

      {expired ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-white px-6 py-12 text-center text-[13px] text-ink-soft">
          Data mentah job ini sudah melewati masa retensi MCP{job.items_expire_at ? ` (${formatDateTime(job.items_expire_at)})` : ''}.
          Ringkasan & laporan tetap tersedia; jalankan <b>Ulangi</b> untuk mengumpulkan data baru.
        </div>
      ) : items.error ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-white px-6 py-12 text-center text-[13px] text-ink-soft">
          {errorMessage(items.error)}
          <Button variant="outline" onClick={() => void items.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E3E7ED] bg-white">
          <div
            className="grid grid-cols-[7.5rem_6rem_9rem_1fr_5.5rem_5.5rem] gap-3 bg-[#F5F7FA] px-4 py-2 text-[11px] font-semibold tracking-wide text-ink-soft uppercase"
            role="row"
          >
            <span>Waktu</span>
            <span>Sumber</span>
            <span>Akun</span>
            <span>Teks</span>
            <span className="text-right">Engagement</span>
            <span>Sentimen</span>
          </div>
          <div ref={scrollRef} className="h-[60vh] overflow-y-auto" role="table" aria-rowcount={total}>
            {items.isLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Spinner className="h-6 w-6" />
              </div>
            ) : rows.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-ink-faint">Tidak ada data yang cocok.</p>
            ) : (
              <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
                {virtualItems.map((v) => (
                  <ItemRow key={rows[v.index].id} row={rows[v.index]} index={v.index} measure={virt.measureElement} start={v.start} />
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-ink-faint">
            <span>
              {formatCount(rows.length)} dari {formatCount(total)} baris dimuat
            </span>
            {isFetchingNextPage && <Spinner />}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemRow({ row, index, measure, start }: { row: Row; index: number; measure: (el: Element | null) => void; start: number }) {
  const [expanded, setExpanded] = useState(false);
  const href = row.url ? safeHref(row.url) : null;
  const long = row.text.length > 160;
  return (
    <div
      ref={measure}
      data-index={index}
      role="row"
      className="absolute inset-x-0 grid grid-cols-[7.5rem_6rem_9rem_1fr_5.5rem_5.5rem] gap-3 border-b border-line px-4 py-2.5 text-[12.5px] hover:bg-[#FAFBFC]"
      style={{ transform: `translateY(${start}px)` }}
    >
      <span className="text-ink-soft tabular-nums">{row.posted_at ? formatDateTime(row.posted_at) : '—'}</span>
      <span>
        <SourceChip type={row.source} />
      </span>
      <span className="truncate text-ink">{row.author ? `@${row.author.replace(/^@/, '')}` : '—'}</span>
      <span className="min-w-0">
        <span className={cn('block text-ink', !expanded && 'line-clamp-2')}>{row.text}</span>
        <span className="mt-0.5 flex gap-3 text-[11px]">
          {long && (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="text-[#1D5FA8] hover:underline">
              {expanded ? 'Ringkas' : 'Selengkapnya'}
            </button>
          )}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-ink-faint hover:text-[#1D5FA8]"
            >
              Tautan <ExternalLink size={10} />
            </a>
          )}
        </span>
      </span>
      <span className="text-right text-ink-soft tabular-nums">{formatCount(row.engagement)}</span>
      <span>
        {row.sentiment ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
            style={{ background: SENTIMENT_META[row.sentiment].color }}
          >
            {SENTIMENT_META[row.sentiment].label}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </span>
    </div>
  );
}
