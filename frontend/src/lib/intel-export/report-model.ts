/**
 * Model laporan Intel netral (M3_TASK_005 §Ekspor) → dipakai PDF & XLSX, sehingga angka identik
 * dengan tab Ringkasan: semua nilai berasal dari `job.insight` / `job.cost` (snapshot backend).
 */
import {
  SENTIMENT_META,
  SOURCE_META,
  actualUsd,
  buildInsightView,
  estimateUsd,
  formatCount,
  formatNet,
  formatPct,
  formatPeriod,
  formatTokens,
  formatUsd,
  sortStages,
} from '../intel-format';
import { CAPABILITY_LABEL, type IntelJob } from '../intel-types';
import { inlineText, parseMarkdown } from '../safe-markdown';

export interface IntelReportModel {
  title: string;
  subtitle: string;
  workspaceName: string;
  generatedAt: string;
  footer: string;
  partial: boolean;
  kpis: { label: string; value: string; sub: string }[];
  summary: { kind: 'heading' | 'bullet' | 'text'; text: string }[];
  recommendations: string[];
  distribution: { label: string; color: string; share: number; display: string }[];
  topics: { rank: number; label: string; count: number; share: string }[];
  hashtags: [string, number][];
  authors: [string, number][];
  aspects: { aspect: string; mentions: number; positive: number; neutral: number; negative: number; net: number }[];
  volume: { cols: string[]; rows: (string | number)[][] };
  stages: { stage: string; agent: string; tokens: number; usd: number; display: string }[];
  warnings: string[];
}

export function buildIntelReportModel(
  job: IntelJob,
  workspaceName: string,
  agentName: (id: string) => string | undefined,
  now = new Date(),
): IntelReportModel {
  if (!job.insight) throw new Error('Laporan belum tersedia');
  const view = buildInsightView(job.insight);
  const generatedAt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(now);
  const sources = job.sources.map((s) => SOURCE_META[s].label).join(', ');
  const est = estimateUsd(job);

  const summary = parseMarkdown(job.insight.summary_md ?? '').flatMap((b): IntelReportModel['summary'] =>
    b.kind === 'list'
      ? b.items.map((i) => ({ kind: 'bullet', text: inlineText(i) }))
      : [{ kind: b.kind === 'heading' ? 'heading' : 'text', text: inlineText(b.inline) }],
  );

  return {
    title: job.title,
    subtitle: `${formatPeriod(job.spec.period)} · ${sources}`,
    workspaceName,
    generatedAt,
    footer: `Dibuat dari Marketing Dashboard · Riset & Insight · ${generatedAt}`,
    partial: job.insight.partial,
    kpis: [
      {
        label: 'Sentimen dominan',
        value: view.dominant ? `${formatPct(view.dominant.share)} ${SENTIMENT_META[view.dominant.key].label}` : '—',
        sub: view.distribution.map((d) => `${d.label} ${formatPct(d.share)}`).join(' · ') || 'Tidak ada analisis sentimen',
      },
      { label: 'Net sentiment', value: view.net === null ? '—' : formatNet(view.net), sub: 'skala -1 sampai +1' },
      { label: 'Data terkumpul', value: formatCount(job.total_items), sub: sources },
      {
        label: 'Biaya aktual',
        value: formatUsd(actualUsd(job)),
        sub: `${est !== null ? `estimasi ${formatUsd(est)} · ` : ''}${formatTokens(job.cost?.llm_tokens ?? 0)} token`,
      },
    ],
    summary,
    recommendations: job.insight.recommendations,
    distribution: view.distribution.map((d) => ({ label: d.label, color: d.color, share: d.share, display: formatPct(d.share) })),
    topics: view.topics.map((t, i) => ({ rank: i + 1, label: t.label, count: t.count, share: formatPct(t.share) })),
    hashtags: view.hashtags,
    authors: view.authors,
    aspects: view.aspects,
    volume: {
      cols: ['Hari', ...view.volume.series.map((s) => s.label)],
      rows: view.volume.rows.map((r) => [r.day, ...view.volume.series.map((s) => Number(r[s.key] ?? 0))]),
    },
    stages: sortStages(job.stages).map((s) => {
      const cost = job.cost?.by_stage.find((c) => c.stage === s.stage);
      return {
        stage: CAPABILITY_LABEL[s.stage],
        agent: agentName(s.agent_id) ?? s.agent_key,
        tokens: cost?.llm_tokens ?? 0,
        usd: cost?.usd_llm ?? 0,
        display: cost ? formatUsd(cost.usd_llm) : '—',
      };
    }),
    warnings: job.insight.warnings.map((w) => w.message),
  };
}
