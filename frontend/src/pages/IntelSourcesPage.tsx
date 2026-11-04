import { ArrowLeft, Cpu, PlugZap, RefreshCw, ShieldAlert } from 'lucide-react';
import { Link, useOutletContext } from 'react-router';
import { toast } from 'sonner';
import { Card, IntelHeader } from '../components/intel/IntelUi';
import { Button } from '../components/ui/button';
import { EmptyState, Spinner } from '../components/ui/misc';
import { isIntelDisabled, useIntelSources, useRefreshSources } from '../hooks/intel-queries';
import { errorMessage } from '../lib/api';
import { SOURCE_META, SOURCE_TYPES } from '../lib/intel-format';
import type { SourceMode } from '../lib/intel-types';
import type { WorkspaceSummary } from '../lib/types';
import { cn, timeAgo } from '../lib/utils';

const MODE: Record<SourceMode, { label: string; className: string }> = {
  api: { label: 'API resmi', className: 'bg-[#E7F6EC] text-[#15803D]' },
  browser: { label: 'Mode browser', className: 'bg-[#E8F0FA] text-[#1D5FA8]' },
  unofficial: { label: 'Tidak resmi', className: 'bg-[#FEF6E7] text-[#92400E]' },
  none: { label: 'Tidak tersedia', className: 'bg-[#FDECE7] text-[#C2410C]' },
};

const ROUTE_HINT: Record<string, string> = {
  fast: 'Model cepat untuk ekstraksi & klasifikasi ringan',
  smart: 'Model penalaran untuk ringkasan & rekomendasi',
  'embed-default': 'Embedding untuk indeks pengetahuan',
};

export function IntelSourcesPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceSummary }>();
  const { data, isLoading, error } = useIntelSources(workspace.id);
  const refresh = useRefreshSources(workspace.id);
  const isAdmin = workspace.role === 'owner' || workspace.role === 'admin';

  const recheck = () =>
    refresh.mutate(undefined, { onSuccess: () => toast.success('Status sumber diperbarui'), onError: (e) => toast.error(errorMessage(e)) });

  if (isIntelDisabled(error)) return <EmptyState icon="🛰️" title="Modul Riset & Insight belum diaktifkan" />;

  return (
    <div className="h-full overflow-y-auto bg-[linear-gradient(180deg,#F5F7FA_0,#fff_280px)]">
      <div className="mx-auto max-w-5xl px-8 pt-8 pb-16">
        <Link to={`/w/${workspace.id}/intel`} className="mb-4 inline-flex items-center gap-1 text-[13px] text-ink-soft hover:text-ink">
          <ArrowLeft size={14} /> Riset & Insight
        </Link>
        <IntelHeader
          eyebrow={
            <>
              <PlugZap size={14} /> Koneksi
            </>
          }
          title="Sumber & Koneksi"
          description="Status setiap sumber data dan route LLM yang dipakai agent, langsung dari MCP Server."
          actions={
            isAdmin && (
              <Button variant="outline" className="h-9" disabled={refresh.isPending} onClick={recheck}>
                <RefreshCw size={14} className={cn(refresh.isPending && 'animate-spin motion-reduce:animate-none')} /> Cek ulang
              </Button>
            )
          }
        />

        {isLoading ? (
          <Spinner className="h-6 w-6" />
        ) : error || !data ? (
          <p className="rounded-xl bg-[#FDECE7] px-4 py-3 text-[13px] text-[#9A3412]">{errorMessage(error)}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {SOURCE_TYPES.map((t) => {
                const s = data.sources.find((x) => x.source === t);
                const meta = SOURCE_META[t];
                const mode = MODE[s?.available ? s.mode : 'none'];
                return (
                  <Card key={t} className="relative overflow-hidden">
                    <span className="absolute inset-y-0 left-0 w-1" style={{ background: meta.color }} aria-hidden />
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[17px] font-bold text-white"
                        style={{ background: meta.color }}
                        aria-hidden
                      >
                        {meta.glyph}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-[14px] font-semibold text-ink">{meta.label}</h3>
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', mode.className)}>{mode.label}</span>
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">{s?.detail || 'Belum ada informasi dari MCP.'}</p>
                        {s && <p className="mt-2 text-[11px] text-ink-faint">Dicek {timeAgo(s.checked_at)}</p>}
                        {s?.mode === 'browser' && (
                          <p className="mt-2 flex gap-1.5 rounded-lg bg-[#FEF6E7] px-2.5 py-1.5 text-[11px] text-[#92400E]">
                            <ShieldAlert size={13} className="mt-px shrink-0" /> Mode browser membaca halaman publik. Patuhi ketentuan
                            layanan platform & batasi volume.
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
              <Card className="relative overflow-hidden opacity-70">
                <span className="absolute inset-y-0 left-0 w-1 bg-stone-300" aria-hidden />
                <h3 className="text-[14px] font-semibold text-ink">Meta (Facebook & Instagram)</h3>
                <p className="mt-1 text-[12px] text-ink-soft">Kolektor Meta dijadwalkan pada rilis berikutnya.</p>
                <span className="mt-2 inline-block rounded bg-stone-100 px-1.5 text-[11px] text-stone-600">Segera</span>
              </Card>
            </div>

            <h2 className="mt-8 mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-[#0F2340]">
              <Cpu size={15} /> Route LLM Gateway
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {data.llm.routes.map((r) => (
                <div key={r.route} className="rounded-2xl border border-[#E3E7ED] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <code className="text-[13px] font-semibold text-ink">{r.route}</code>
                    <span
                      className={cn('flex items-center gap-1 text-[11px] font-medium', r.available ? 'text-[#15803D]' : 'text-[#C2410C]')}
                    >
                      <span className={cn('h-2 w-2 rounded-full', r.available ? 'bg-[#15803D]' : 'bg-[#C2410C]')} aria-hidden />
                      {r.available ? 'Tersedia' : 'Tidak tersedia'}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-ink-soft">{ROUTE_HINT[r.route] ?? 'Route model kustom'}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] text-ink-faint">
              Terakhir diperiksa {timeAgo(data.checked_at)}. Key LLM per agent dikelola di <b>Pengaturan → AI & Gateway</b>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
