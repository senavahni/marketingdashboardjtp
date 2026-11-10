import { lazy, Suspense, useState } from 'react';
import { useDebounce } from '../../../hooks/use-debounce';
import { useKgGraph, useKgNeighbors } from '../../../hooks/mi-queries';
import { KG_TYPE_META } from '../../../lib/mi-format';
import type { KgEdge, KgGraph, KgNodeType } from '../../../lib/mi-types';
import { cn } from '../../../lib/utils';
import { BookCitation } from '../badges';
import { StateView, stateFromError } from '../StateView';

const KgCanvas = lazy(() => import('./KgCanvas'));
const TYPES = Object.keys(KG_TYPE_META) as KgNodeType[];
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** KG Explorer (§D.7): cari node, filter tipe, graf 2D ⇄ daftar; detail node + provenance setiap edge. */
export function GraphTab({ ws }: { ws: string }) {
  const [q, setQ] = useState('');
  const [types, setTypes] = useState<KgNodeType[]>(['concept', 'framework']);
  const [view, setView] = useState<'list' | 'graph'>(() => (prefersReducedMotion() ? 'list' : 'graph'));
  const [selected, setSelected] = useState<string | null>(null);
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const graph = useKgGraph(ws, useDebounce(q, 300), types);
  const toggleType = (t: KgNodeType) => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const edge = graph.data?.edges.find((e) => e.edge_id === edgeId) ?? null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input type="search" aria-label="Cari node" placeholder="Cari node…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-56 rounded-lg border border-line-strong bg-white px-3 text-[13px] outline-none focus:border-[#0E9384]" />
        <div role="group" aria-label="Filter tipe node" className="flex flex-wrap gap-1">
          {TYPES.map((t) => (
            <label key={t} className={cn('flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]', types.includes(t) ? 'border-[#0F2340] bg-[#0F2340] text-white' : 'border-line-strong bg-white')}>
              <input type="checkbox" className="sr-only" checked={types.includes(t)} onChange={() => toggleType(t)} />
              <Shape type={t} /> {KG_TYPE_META[t].label}
            </label>
          ))}
        </div>
        <div role="radiogroup" aria-label="Tampilan" className="ml-auto flex rounded-lg border border-line-strong p-0.5 text-[12px]">
          {(['graph', 'list'] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={cn('rounded-md px-2.5 py-1', view === v ? 'bg-[#0F2340] text-white' : 'text-ink-soft')}>
              {v === 'graph' ? 'Graf' : 'Daftar'}
            </button>
          ))}
        </div>
      </div>
      {graph.isLoading ? (
        <StateView kind="loading" />
      ) : graph.error ? (
        <StateView kind={stateFromError(graph.error)} error={graph.error} />
      ) : !graph.data?.nodes.length ? (
        <StateView kind={q || types.length ? 'filtered-empty' : 'empty'} title={q || types.length ? undefined : 'Knowledge graph masih kosong — ingest buku dulu'} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            {graph.data.truncated && <p className="mb-2 text-[12px] text-[#B45309]">⚠ Menampilkan 500 node pertama — persempit dengan pencarian atau filter tipe.</p>}
            {view === 'graph' ? (
              <Suspense fallback={<StateView kind="loading" />}>
                <KgCanvas graph={graph.data} selectedId={selected} onSelectNode={(id) => (setSelected(id), setEdgeId(null))} onSelectEdge={setEdgeId} />
              </Suspense>
            ) : (
              <NodeList graph={graph.data} selected={selected} onSelect={(id) => (setSelected(id), setEdgeId(null))} />
            )}
          </div>
          <aside aria-live="polite" className="rounded-2xl border border-[#E3E7ED] bg-white p-4 text-[13px]">
            {edge ? <EdgeDetail edge={edge} graph={graph.data} /> : selected ? <NodeDetail ws={ws} nodeId={selected} onSelectEdge={setEdgeId} /> : <p className="text-ink-soft">Pilih node atau edge untuk melihat definisi, sumber, dan provenance.</p>}
          </aside>
        </div>
      )}
    </div>
  );
}

function Shape({ type }: { type: KgNodeType }) {
  const { color, shape } = KG_TYPE_META[type];
  const path = { circle: <circle cx="5" cy="5" r="4" />, square: <rect x="1" y="1" width="8" height="8" />, diamond: <path d="M5 0 10 5 5 10 0 5Z" />, triangle: <path d="M5 0 10 9H0Z" /> }[shape];
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill={color} aria-hidden>
      {path}
    </svg>
  );
}

/** Alternatif graf yang dapat dinavigasi keyboard (§F). */
function NodeList({ graph, selected, onSelect }: { graph: KgGraph; selected: string | null; onSelect: (id: string) => void }) {
  const degree = (id: string) => graph.edges.filter((e) => e.source === id || e.target === id).length;
  return (
    <ul className="max-h-[460px] divide-y divide-[#EEF1F5] overflow-y-auto rounded-xl border border-[#E3E7ED] bg-white">
      {graph.nodes.map((n) => (
        <li key={n.node_id}>
          <button type="button" aria-pressed={selected === n.node_id} onClick={() => onSelect(n.node_id)} className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[#FAFBFC]', selected === n.node_id && 'bg-[#F1F8F7]')}>
            <Shape type={n.type} />
            <span className="font-medium text-[#0F2340]">{n.label}</span>
            <span className="text-[11px] text-ink-faint">{KG_TYPE_META[n.type].label}</span>
            <span className="ml-auto text-[11px] text-ink-soft">{degree(n.node_id)} tetangga</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function NodeDetail({ ws, nodeId, onSelectEdge }: { ws: string; nodeId: string; onSelectEdge: (id: string) => void }) {
  const nb = useKgNeighbors(ws, nodeId);
  if (nb.isLoading) return <StateView kind="loading" />;
  if (!nb.data) return <StateView kind={stateFromError(nb.error)} error={nb.error} />;
  const label = (id: string) => nb.data.nodes.find((n) => n.node_id === id)?.label ?? id;
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] text-[#0E9384] uppercase">{KG_TYPE_META[nb.data.node.type].label}</p>
        <h3 className="text-[15px] font-semibold text-[#0F2340]">{nb.data.node.label}</h3>
        {nb.data.node.definition && <p className="mt-1 text-ink">{nb.data.node.definition}</p>}
      </div>
      {nb.data.sources.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {nb.data.sources.map((s) => (
            <BookCitation key={`${s.asset_id}-${s.page}`} citation={s} />
          ))}
        </div>
      )}
      <div>
        <p className="mb-1 font-medium text-[#0F2340]">Relasi ({nb.data.edges.length})</p>
        <ul className="space-y-1">
          {nb.data.edges.map((e) => (
            <li key={e.edge_id}>
              <button type="button" onClick={() => onSelectEdge(e.edge_id)} className="text-left hover:underline">
                {label(e.source)} <span className="text-ink-faint">— {e.relation.replace(/_/g, ' ')} →</span> {label(e.target)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EdgeDetail({ edge, graph }: { edge: KgEdge; graph: KgGraph }) {
  const label = (id: string) => graph.nodes.find((n) => n.node_id === id)?.label ?? id;
  const p = edge.provenance;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-[#0E9384] uppercase">Edge</p>
      <p className="font-semibold text-[#0F2340]">
        {label(edge.source)} — {edge.relation.replace(/_/g, ' ')} → {label(edge.target)}
      </p>
      <p className="font-medium">Provenance</p>
      {p.book_title ? <BookCitation citation={{ asset_id: '', book_title: p.book_title, page: p.page ?? 1, chapter: null }} /> : null}
      {p.card_id && <p className="text-[12px] text-ink-soft">Knowledge card <code>{p.card_id}</code></p>}
      {p.source_url && <p className="break-all text-[12px] text-ink-soft">{p.source_url}</p>}
      {!p.book_title && !p.card_id && !p.source_url && <p className="text-[12px] text-[#B45309]">⚠ Edge ini tidak membawa provenance</p>}
    </div>
  );
}
