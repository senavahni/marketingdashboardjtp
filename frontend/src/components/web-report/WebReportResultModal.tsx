import * as RD from '@radix-ui/react-dialog';
import { ChevronRight, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useDeleteWebReport, useWebReport } from '../../hooks/web-report-queries';
import { ApiError } from '../../lib/api';
import { formatDateRange, PERIOD_LABEL } from '../../lib/web-report-format';
import { LATEST_FORMULA_VERSION, type WebReportSession } from '../../lib/web-report-types';
import { formatDateTime } from '../../lib/utils';
import { Button } from '../ui/button';
import { Spinner } from '../ui/misc';
import { FunnelChart, RevenueCostChart } from './charts';
import { ExportMenu } from './ExportMenu';
import { InsightList, KpiRow, MetricTable } from './ResultParts';

type Props = {
  sessionId: string | null;
  workspaceId: string;
  workspaceName: string;
  canModify: (session: WebReportSession) => boolean;
  onClose: () => void;
  onEdit: (session: WebReportSession) => void;
};

function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-ink-faint uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function WebReportResultModal({ sessionId, workspaceId, workspaceName, canModify, onClose, onEdit }: Props) {
  const { data: session, isLoading, error } = useWebReport(sessionId);
  const remove = useDeleteWebReport(workspaceId);
  const [isTableOpen, setIsTableOpen] = useState(() => window.innerWidth >= 1280);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 404) {
      toast.error('Laporan tidak ditemukan');
      onClose();
    }
  }, [error, onClose]);

  const handleDelete = (s: WebReportSession) => {
    if (!confirm(`Hapus laporan "${s.title}"? Tindakan ini tidak bisa dibatalkan dari UI.`)) return;
    remove.mutate(s.id, {
      onSuccess: () => {
        toast.success('Laporan dihapus');
        onClose();
      },
    });
  };

  return (
    <RD.Root open={!!sessionId} onOpenChange={(open) => !open && onClose()}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-[#0F2340]/35 backdrop-blur-[2px]" />
        <RD.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[94vw] max-w-[1100px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_rgba(15,35,64,0.35)] outline-none"
        >
          {!session ? (
            <div className="flex h-72 items-center justify-center">
              <RD.Title className="sr-only">Memuat laporan</RD.Title>
              {isLoading ? <Spinner className="h-6 w-6" /> : <span className="text-ink-soft">Gagal memuat laporan.</span>}
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 pt-5 pb-4">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="rounded-full bg-[#E6F4F2] px-2 py-0.5 font-medium text-[#0B5F56]">{PERIOD_LABEL[session.period_type]}</span>
                    <span className="text-ink-soft">{formatDateRange(session.period_start, session.period_end)}</span>
                    {session.formula_version < LATEST_FORMULA_VERSION && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Dihitung dengan rumus versi {session.formula_version}</span>
                    )}
                  </div>
                  <RD.Title tabIndex={-1} className="text-xl font-semibold tracking-tight text-[#0F2340] outline-none">
                    {session.title}
                  </RD.Title>
                  <p className="mt-0.5 text-[12px] text-ink-faint">
                    Diperbarui {formatDateTime(session.updated_at)} oleh {session.updated_by?.name ?? '—'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {canModify(session) && (
                    <>
                      <Button variant="outline" onClick={() => onEdit(session)}>
                        <Pencil size={14} /> Ubah
                      </Button>
                      <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => handleDelete(session)} disabled={remove.isPending}>
                        <Trash2 size={14} /> Hapus
                      </Button>
                    </>
                  )}
                  <ExportMenu session={session} workspaceName={workspaceName} />
                  <RD.Close className="ml-1 rounded-md p-1.5 text-ink-faint hover:bg-hover" aria-label="Tutup">
                    <X size={18} />
                  </RD.Close>
                </div>
              </header>

              <div className="flex flex-col gap-7 overflow-y-auto px-6 py-5">
                <Panel title="Ringkasan eksekutif finansial">
                  <KpiRow input={session.input} results={session.results} />
                </Panel>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Panel title="Funnel konversi" className="rounded-xl border border-line p-4">
                    <FunnelChart input={session.input} results={session.results} />
                  </Panel>
                  <Panel title="Omset vs biaya website" className="rounded-xl border border-line p-4">
                    <RevenueCostChart input={session.input} />
                  </Panel>
                </div>

                <Panel title="Insight & rencana aksi">
                  <InsightList insights={session.results.insights ?? []} />
                </Panel>

                <section>
                  <button
                    type="button"
                    aria-expanded={isTableOpen}
                    onClick={() => setIsTableOpen((o) => !o)}
                    className="mb-3 flex items-center gap-1 text-[11px] font-semibold tracking-[0.1em] text-ink-faint uppercase hover:text-ink"
                  >
                    <ChevronRight size={14} className={isTableOpen ? 'rotate-90 transition-transform' : 'transition-transform'} /> Tabel metrik lengkap
                  </button>
                  {isTableOpen && <MetricTable input={session.input} results={session.results} />}
                </section>

                {session.notes && (
                  <Panel title="Catatan">
                    <p className="rounded-lg bg-[#F5F7FA] px-4 py-3 text-[13px] whitespace-pre-line text-ink">{session.notes}</p>
                  </Panel>
                )}
              </div>
            </>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
