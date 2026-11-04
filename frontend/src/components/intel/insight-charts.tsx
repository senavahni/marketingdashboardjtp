import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { INTEL_COLORS, SENTIMENT_META, formatCount, formatPct, type InsightView } from '../../lib/intel-format';

const TREND_COLORS = ['#0F2340', '#0E9384', '#D97706', '#7C3AED', '#1D5FA8'];
const axisTick = { fontSize: 11, fill: '#5B6474' };
const shortDay = (d: string) => (d.length >= 10 ? `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}` : d);

/** Donut kecil distribusi sentimen. */
export function SentimentDonut({ view, size = 88 }: { view: InsightView; size?: number }) {
  const data = view.distribution.filter((d) => d.share > 0);
  const label = view.distribution.map((d) => `${d.label} ${formatPct(d.share)}`).join(', ');
  return (
    <figure role="img" aria-label={`Distribusi sentimen: ${label}`} style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="share"
            innerRadius="62%"
            outerRadius="100%"
            stroke="none"
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Volume per hari — stacked per sentimen (atau per sumber bila tanpa sentimen). */
export function VolumeChart({ view }: { view: InsightView }) {
  const { rows, series } = view.volume;
  if (!rows.length) return <p className="text-[12px] text-ink-faint">Belum ada data volume.</p>;
  return (
    <figure className="h-60" role="img" aria-label={`Volume per hari, ${rows.length} hari`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={INTEL_COLORS.line} />
          <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} axisLine={false} tick={axisTick} minTickGap={16} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} allowDecimals={false} />
          <Tooltip cursor={{ fill: 'rgba(15,35,64,0.04)' }} formatter={(v, name) => [formatCount(Number(v)), String(name)]} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="v"
              fill={s.color}
              radius={i === series.length - 1 ? [3, 3, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Garis minat Google Trends per keyword. */
export function TrendsChart({ trends }: { trends: NonNullable<InsightView['trends']> }) {
  return (
    <figure className="h-60" role="img" aria-label={`Minat pencarian Google untuk ${trends.keywords.join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={trends.rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={INTEL_COLORS.line} />
          <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} axisLine={false} tick={axisTick} minTickGap={16} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={axisTick} />
          <Tooltip />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          {trends.keywords.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={TREND_COLORS[i % TREND_COLORS.length]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Bar 3 warna per aspek (proporsi positif / netral / negatif). */
export function AspectBars({ aspects }: { aspects: InsightView['aspects'] }) {
  return (
    <ul className="space-y-2.5">
      {aspects.map((a) => {
        const total = a.positive + a.neutral + a.negative || 1;
        return (
          <li key={a.aspect}>
            <div className="mb-1 flex items-baseline justify-between text-[12px]">
              <span className="font-medium text-ink capitalize">{a.aspect}</span>
              <span className="text-ink-faint tabular-nums">
                {formatCount(a.mentions)} sebutan · net{' '}
                <b className={a.net >= 0 ? 'text-[#0B7A6E]' : 'text-[#C2410C]'}>{a.net.toFixed(2)}</b>
              </span>
            </div>
            <div
              className="flex h-2.5 overflow-hidden rounded-full bg-[#EDF0F4]"
              role="img"
              aria-label={`${a.aspect}: positif ${a.positive}, netral ${a.neutral}, negatif ${a.negative}`}
            >
              {(['positive', 'neutral', 'negative'] as const).map((k) => (
                <span key={k} style={{ width: `${(a[k] / total) * 100}%`, background: SENTIMENT_META[k].color }} />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
