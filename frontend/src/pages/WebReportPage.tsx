import { BarChart3, GitCompareArrows, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { WebReportCompareModal } from '../components/web-report/WebReportCompareModal';
import { WebReportFormDialog } from '../components/web-report/WebReportFormDialog';
import { WebReportResultModal } from '../components/web-report/WebReportResultModal';
import { Button, IconButton } from '../components/ui/button';
import { EmptyState, Spinner } from '../components/ui/misc';
import { MenuItem, Popover } from '../components/ui/popover';
import { useDeleteWebReport, useWebReports, type WebReportFilters } from '../hooks/web-report-queries';
import { useAuth } from '../lib/auth-store';
import type { WorkspaceSummary } from '../lib/types';
import { cn, timeAgo } from '../lib/utils';
import { formatCount, formatPeriod, formatRoas, formatRupiahShort, PERIOD_LABEL } from '../lib/web-report-format';
import type { PeriodType, WebReportSession } from '../lib/web-report-types';

const MAX_COMPARE = 12;
const selectClass = 'h-8 rounded-md border border-line-strong bg-white px-2 text-[13px] outline-none focus:border-[#0E9384]';

type FormState = { key: number; session?: WebReportSession } | null;

export function WebReportPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const userId = useAuth((s) => s.user?.id);
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<WebReportFilters>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useWebReports(workspace.id, filters);
  const remove = useDeleteWebReport(workspace.id);

  const sessions = data?.pages.flatMap((p) => p.data) ?? [];
  const canCreate = workspace.role !== 'viewer';
  const canModify = useCallback(
    (s: WebReportSession) => workspace.role === 'owner' || workspace.role === 'admin' || (workspace.role === 'member' && s.created_by?.id === userId),
    [workspace.role, userId],
  );
  const openSessionId = params.get('session');

  const openResult = (id: string) => setParams((p) => ({ ...Object.fromEntries(p), session: id }));
  const closeResult = useCallback(
    () =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.delete('session');
        return next;
      }),
    [setParams],
  );

  const toggleSelected = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_COMPARE ? cur : [...cur, id]));

  const handleDelete = (s: WebReportSession) => {
    if (!confirm(`Hapus laporan "${s.title}"? Tindakan ini tidak bisa dibatalkan dari UI.`)) return;
    remove.mutate(s.id, {
      onSuccess: () => {
        toast.success('Laporan dihapus');
        setSelected((cur) => cur.filter((x) => x !== s.id));
      },
    });
  };

  const years = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + 1 - i);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 pt-10 pb-16">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.12em] text-[#0E9384] uppercase">
              <BarChart3 size={14} /> Modul 2
            </p>
            <h1 className="text-[28px] font-semibold tracking-tight text-[#0F2340]">Laporan Performa Website</h1>
            <p className="mt-1 text-ink-soft">Masukkan data satu periode — pengunjung, leads, sales, omset & biaya — lalu dapatkan laporan konversi dan finansial yang siap dipresentasikan.</p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setForm({ key: Date.now() })}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0F2340] px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#1a3560] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E9384]"
            >
              <Plus size={16} /> Laporan Baru
            </button>
          )}
        </header>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter jenis periode"
            className={selectClass}
            value={filters.period_type ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, period_type: (e.target.value || undefined) as PeriodType | undefined }))}
          >
            <option value="">Semua periode</option>
            {(Object.keys(PERIOD_LABEL) as PeriodType[]).map((t) => (
              <option key={t} value={t}>
                {PERIOD_LABEL[t]}
              </option>
            ))}
          </select>
          <select aria-label="Filter tahun" className={selectClass} value={filters.year ?? ''} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value ? Number(e.target.value) : undefined }))}>
            <option value="">Semua tahun</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2">
            {selected.length > 0 && <span className="text-[12px] text-ink-faint">{selected.length >= MAX_COMPARE ? `Maksimal ${MAX_COMPARE} laporan` : `${selected.length} dipilih`}</span>}
            <Button variant="outline" disabled={selected.length < 2} onClick={() => setCompareIds(selected)}>
              <GitCompareArrows size={15} /> Bandingkan ({selected.length})
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : isError ? (
          <EmptyState icon="⚠️" title="Gagal memuat laporan">
            <Button variant="outline" onClick={() => void refetch()}>
              Coba lagi
            </Button>
          </EmptyState>
        ) : sessions.length === 0 ? (
          <EmptyState icon="📊" title="Belum ada laporan">
            <p className="max-w-sm text-[13px]">Buat laporan pertama dari data website periode ini.</p>
            {canCreate && (
              <Button variant="primary" onClick={() => setForm({ key: Date.now() })}>
                <Plus size={15} /> Laporan Baru
              </Button>
            )}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-[#F5F7FA] text-[11px] tracking-wide text-ink-soft uppercase">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <span className="sr-only">Pilih untuk dibandingkan</span>
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">Judul</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">Periode</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Pengunjung</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Sales</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Omset</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">ROAS</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">Diperbarui</th>
                  <th scope="col" className="w-10 px-2 py-2.5">
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const isChecked = selected.includes(s.id);
                  const roasTone = s.results.roas === null ? 'text-ink-faint' : s.results.roas >= 1 ? 'text-[#0B7A6E]' : 'text-[#C2410C]';
                  return (
                    <tr key={s.id} onClick={() => openResult(s.id)} className={cn('group cursor-pointer border-t border-line transition-colors hover:bg-[#F5F7FA]', isChecked && 'bg-[#E6F4F2]/60')}>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${s.title} untuk dibandingkan`}
                          checked={isChecked}
                          disabled={!isChecked && selected.length >= MAX_COMPARE}
                          onChange={() => toggleSelected(s.id)}
                          className="h-4 w-4 accent-[#0E9384]"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openResult(s.id);
                          }}
                          className="text-left font-medium text-ink outline-none hover:text-[#0F2340] focus-visible:underline">
                          {s.title}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-ink">{formatPeriod(s.period_type, s.period_start, s.period_end)}</span>
                        <span className="ml-1.5 text-[11px] text-ink-faint">{PERIOD_LABEL[s.period_type]}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCount(s.input.visitors)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCount(s.input.sales_count)}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatRupiahShort(s.input.revenue)}</td>
                      <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', roasTone)}>{formatRoas(s.results.roas)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-ink-soft">
                        {timeAgo(s.updated_at)} · {s.updated_by?.name ?? '—'}
                      </td>
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                        {canModify(s) && (
                          <Popover align="end" trigger={<IconButton label={`Opsi ${s.title}`} className="opacity-60 group-hover:opacity-100"><MoreHorizontal size={15} /></IconButton>}>
                            <MenuItem onSelect={() => setForm({ key: Date.now(), session: s })}>
                              <Pencil size={14} /> Ubah
                            </MenuItem>
                            <MenuItem danger onSelect={() => handleDelete(s)}>
                              <Trash2 size={14} /> Hapus
                            </MenuItem>
                          </Popover>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {hasNextPage && (
          <div className="mt-3 flex justify-center">
            <Button variant="outline" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? <Spinner /> : null} Muat lebih banyak
            </Button>
          </div>
        )}
      </div>

      {form && (
        <WebReportFormDialog
          key={form.key}
          workspaceId={workspace.id}
          open
          session={form.session}
          onOpenChange={(open) => !open && setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            toast.success(form.session ? 'Laporan diperbarui' : 'Laporan disimpan');
            openResult(saved.id);
          }}
        />
      )}
      <WebReportResultModal
        sessionId={openSessionId}
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        canModify={canModify}
        onClose={closeResult}
        onEdit={(s) => setForm({ key: Date.now(), session: s })}
      />
      {compareIds.length > 0 && <WebReportCompareModal workspaceId={workspace.id} ids={compareIds} onClose={() => setCompareIds([])} />}
    </div>
  );
}
