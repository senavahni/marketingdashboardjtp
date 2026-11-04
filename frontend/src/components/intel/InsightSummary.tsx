import { AlertTriangle, ExternalLink, Hash, Hourglass, Lightbulb, Quote, UserRound } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { IntelJob, PostExample } from '../../lib/intel-types';
import { CAPABILITY_LABEL } from '../../lib/intel-types';
import {
  INTEL_COLORS,
  SENTIMENT_META,
  actualUsd,
  buildInsightView,
  estimateUsd,
  formatCount,
  formatNet,
  formatPct,
  formatTokens,
  formatUsd,
  sortStages,
  type InsightView,
} from '../../lib/intel-format';
import { safeHref } from '../../lib/safe-markdown';
import { formatDateTime } from '../../lib/utils';
import { ActorAvatar } from '../ui/avatar';
import { AspectBars, SentimentDonut, TrendsChart, VolumeChart } from './insight-charts';
import { Card, Kpi, SourceChips } from './IntelUi';
import { SafeMarkdown } from './SafeMarkdown';

type Props = { job: IntelJob; agentName: (id: string) => string | undefined };

export function InsightSummary({ job, agentName }: Props) {
  const view = useMemo(() => (job.insight ? buildInsightView(job.insight) : null), [job.insight]);

  if (!job.insight || !view) {
    const pending = job.status === 'completed' && job.insight_pending;
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-white py-16 text-center">
        <Hourglass size={28} className="text-ink-faint" />
        <div className="font-medium text-ink">
          {pending
            ? 'Laporan sedang disiapkan'
            : job.status === 'failed' || job.status === 'cancelled'
              ? 'Laporan tidak tersedia'
              : 'Laporan muncul setelah analisis selesai'}
        </div>
        <p className="max-w-sm text-[13px] text-ink-soft">
          {pending
            ? 'Data sudah lengkap; ringkasan sedang diambil dari MCP. Halaman ini diperbarui otomatis.'
            : job.error
              ? job.error.message
              : 'Pantau progres tiap tahap di timeline di atas — tidak perlu me-refresh halaman.'}
        </p>
      </div>
    );
  }

  const insight = job.insight;
  const actual = actualUsd(job);
  const est = estimateUsd(job);

  return (
    <div className="space-y-4">
      {insight.partial && (
        <Banner tone="warn">
          Hasil parsial — sebagian sumber atau tahap tidak selesai. Angka di bawah dihitung dari data yang berhasil dikumpulkan.
        </Banner>
      )}
      {insight.warnings.map((w) => (
        <Banner key={w.code} tone="info">
          {w.message}
        </Banner>
      ))}

      <div className="grid gap-3 md:grid-cols-4" data-tour="intel-kpis">
        <Kpi
          label="Sentimen dominan"
          accent={view.dominant ? SENTIMENT_META[view.dominant.key].color : INTEL_COLORS.neutral}
          value={view.dominant ? formatPct(view.dominant.share) : '—'}
          sub={view.dominant ? SENTIMENT_META[view.dominant.key].label : 'Tidak ada analisis sentimen'}
        >
          {view.distribution.length > 0 && <SentimentDonut view={view} size={64} />}
        </Kpi>
        <Kpi
          label="Net sentiment"
          accent={(view.net ?? 0) >= 0 ? INTEL_COLORS.positive : INTEL_COLORS.negative}
          value={view.net === null ? '—' : formatNet(view.net)}
          sub="skala −1 sampai +1"
        >
          {view.net !== null && <NetGauge value={view.net} />}
        </Kpi>
        <Kpi
          label="Data terkumpul"
          accent="#7C3AED"
          value={formatCount(job.total_items)}
          sub={<SourceChips sources={job.sources} compact />}
        />
        <Kpi
          label="Biaya aktual"
          accent="#D97706"
          value={formatUsd(actual)}
          sub={`${est !== null ? `estimasi ${formatUsd(est)} · ` : ''}${formatTokens(job.cost?.llm_tokens ?? 0)} token`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card title="Ringkasan eksekutif">
          {insight.summary_md ? (
            <SafeMarkdown source={insight.summary_md} />
          ) : (
            <p className="text-[13px] text-ink-faint">Ringkasan tidak tersedia untuk job ini.</p>
          )}
          {insight.recommendations.length > 0 && (
            <div className="mt-5 rounded-xl bg-[#E6F4F2] p-4">
              <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#0B7A6E]">
                <Lightbulb size={14} /> Rekomendasi
              </div>
              <ol className="space-y-1.5 text-[13px] text-ink">
                {insight.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0E9384] text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                    {r}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>
        <Card title="Tren & topik teratas">
          <RankedTopics topics={view.topics} />
          <div className="mt-5 grid grid-cols-2 gap-4">
            <RankedPairs title="Hashtag" icon={<Hash size={12} />} pairs={view.hashtags} prefix="#" />
            <RankedPairs title="Akun teratas" icon={<UserRound size={12} />} pairs={view.authors} prefix="@" />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card title={view.volume.series[0]?.key === 'positive' ? 'Volume per hari · per sentimen' : 'Volume per hari · per sumber'}>
          <VolumeChart view={view} />
        </Card>
        {view.aspects.length > 0 ? (
          <Card title="Sentimen per aspek">
            <AspectBars aspects={view.aspects} />
          </Card>
        ) : (
          <WorkedBy job={job} agentName={agentName} />
        )}
      </div>

      {insight.sentiment && (
        <div className="grid gap-4 md:grid-cols-2">
          <Examples title="Contoh post positif" tone="positive" items={insight.sentiment.examples.positive} />
          <Examples title="Contoh post negatif" tone="negative" items={insight.sentiment.examples.negative} />
        </div>
      )}

      {view.trends && (
        <Card title="Google Trends · minat pencarian">
          <TrendsChart trends={view.trends} />
          {Object.keys(view.trends.share).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
              {Object.entries(view.trends.share).map(([k, v]) => (
                <span key={k} className="rounded-full bg-[#F5F7FA] px-2.5 py-1 text-ink-soft">
                  {k} <b className="text-ink tabular-nums">{v}%</b> share of search
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      {view.aspects.length > 0 && <WorkedBy job={job} agentName={agentName} />}
    </div>
  );
}

function Banner({ tone, children }: { tone: 'warn' | 'info'; children: ReactNode }) {
  return (
    <div
      className={
        tone === 'warn'
          ? 'flex gap-2 rounded-xl bg-[#FEF6E7] px-4 py-2.5 text-[13px] text-[#92400E]'
          : 'flex gap-2 rounded-xl bg-[#E8F0FA] px-4 py-2.5 text-[13px] text-[#1D4E89]'
      }
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function NetGauge({ value }: { value: number }) {
  const pct = ((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100;
  return (
    <div className="mb-1 w-20" aria-hidden>
      <div className="relative h-2 rounded-full bg-[linear-gradient(90deg,#C2410C,#8FA3BF_50%,#0E9384)]">
        <span
          className="absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#0F2340] shadow"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function RankedTopics({ topics }: { topics: InsightView['topics'] }) {
  if (!topics.length) return <p className="text-[12px] text-ink-faint">Belum ada topik yang menonjol.</p>;
  const max = Math.max(...topics.map((t) => t.count), 1);
  return (
    <ol className="space-y-2">
      {topics.map((t, i) => (
        <li key={t.label} className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-2 text-[13px]">
          <span className="text-[11px] font-semibold text-ink-faint tabular-nums">{i + 1}</span>
          <div className="min-w-0">
            <div className="truncate text-ink">{t.label}</div>
            <div className="mt-1 h-1.5 rounded-full bg-[#EDF0F4]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#0F2340,#0E9384)]"
                style={{ width: `${(t.count / max) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-[12px] text-ink-soft tabular-nums">
            {formatCount(t.count)} <span className="text-ink-faint">· {formatPct(t.share)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function RankedPairs({ title, icon, pairs, prefix }: { title: string; icon: ReactNode; pairs: [string, number][]; prefix: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
        {icon} {title}
      </div>
      {pairs.length === 0 ? (
        <p className="text-[12px] text-ink-faint">—</p>
      ) : (
        <ul className="space-y-1 text-[12px]">
          {pairs.slice(0, 6).map(([label, count]) => (
            <li key={label} className="flex justify-between gap-2">
              <span className="truncate text-ink">
                {prefix}
                {label.replace(/^[#@]/, '')}
              </span>
              <span className="text-ink-faint tabular-nums">{formatCount(count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Examples({ title, tone, items }: { title: string; tone: 'positive' | 'negative'; items: PostExample[] }) {
  const color = SENTIMENT_META[tone].color;
  return (
    <Card title={title}>
      {items.length === 0 ? (
        <p className="text-[12px] text-ink-faint">Tidak ada contoh.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((p) => {
            const href = p.url ? safeHref(p.url) : null;
            return (
              <li key={p.id} className="rounded-xl bg-[#FAFBFC] p-3" style={{ borderLeft: `3px solid ${color}` }}>
                <Quote size={13} className="mb-1 text-ink-faint" aria-hidden />
                <p className="text-[13px] leading-relaxed text-ink">{p.text}</p>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-faint">
                  {p.author && <span>@{p.author.replace(/^@/, '')}</span>}
                  {p.created_at && <span>{formatDateTime(p.created_at)}</span>}
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto inline-flex items-center gap-0.5 text-[#1D5FA8] hover:underline"
                    >
                      Lihat asli <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function WorkedBy({ job, agentName }: Props) {
  return (
    <Card title="Dikerjakan oleh">
      <ul className="space-y-2.5">
        {sortStages(job.stages).map((s) => {
          const cost = job.cost?.by_stage.find((c) => c.stage === s.stage);
          const name = agentName(s.agent_id) ?? s.agent_key;
          return (
            <li key={s.stage} className="flex items-center gap-3">
              <ActorAvatar type="agent" name={name} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-ink">{name}</div>
                <div className="text-[11px] text-ink-faint">{CAPABILITY_LABEL[s.stage]}</div>
              </div>
              <div className="text-right text-[12px] tabular-nums">
                <div className="font-medium text-ink">{cost ? formatUsd(cost.usd_llm) : '—'}</div>
                <div className="text-ink-faint">{cost ? `${formatTokens(cost.llm_tokens)} token` : 'tanpa LLM'}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
