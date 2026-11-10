import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { KG_TYPE_META } from '../../../lib/mi-format';
import type { KgGraph, KgNodeType } from '../../../lib/mi-types';

type GNode = { id: string; label: string; type: KgNodeType; x?: number; y?: number };
type GLink = { id: string; source: string | GNode; target: string | GNode; relation: string };

type Props = {
  graph: KgGraph;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (edgeId: string) => void;
};

/** Gambar bentuk per tipe node (bukan hanya warna — WCAG 1.4.1). */
function drawShape(ctx: CanvasRenderingContext2D, type: KgNodeType, x: number, y: number, r: number): void {
  const shape = KG_TYPE_META[type].shape;
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(x, y, r, 0, 2 * Math.PI);
  else if (shape === 'square') ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else if (shape === 'diamond') {
    ctx.moveTo(x, y - r * 1.3);
    ctx.lineTo(x + r * 1.3, y);
    ctx.lineTo(x, y + r * 1.3);
    ctx.lineTo(x - r * 1.3, y);
    ctx.closePath();
  } else {
    ctx.moveTo(x, y - r * 1.3);
    ctx.lineTo(x + r * 1.2, y + r);
    ctx.lineTo(x - r * 1.2, y + r);
    ctx.closePath();
  }
}

/**
 * KG Explorer 2D (react-force-graph, V1-K20). Dimuat lazy (§G). Batas render 500 node ditegakkan kontrak.
 * Simulasi dibekukan cepat (cooldownTicks) agar tidak terus bergerak; alternatif daftar ada di GraphTab.
 */
export default function KgCanvas({ graph, selectedId, onSelectNode, onSelectEdge }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const data = {
    nodes: graph.nodes.map((n): GNode => ({ id: n.node_id, label: n.label, type: n.type })),
    links: graph.edges.map((e): GLink => ({ id: e.edge_id, source: e.source, target: e.target, relation: e.relation })),
  };
  return (
    <div ref={box} className="overflow-hidden rounded-xl border border-[#E3E7ED] bg-[#FBFCFD]">
      <ForceGraph2D
        graphData={data}
        width={width}
        height={460}
        cooldownTicks={80}
        nodeLabel={(n: GNode) => `${KG_TYPE_META[n.type].label}: ${n.label}`}
        linkLabel={(l: GLink) => l.relation}
        linkColor={() => '#B8C2CF'}
        linkDirectionalArrowLength={3}
        onNodeClick={(n: GNode) => onSelectNode(n.id)}
        onLinkClick={(l: GLink) => onSelectEdge(l.id)}
        nodeCanvasObject={(n: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
          const x = n.x ?? 0;
          const y = n.y ?? 0;
          drawShape(ctx, n.type, x, y, 5);
          ctx.fillStyle = KG_TYPE_META[n.type].color;
          ctx.fill();
          if (n.id === selectedId) {
            ctx.lineWidth = 2 / scale;
            ctx.strokeStyle = '#0F2340';
            ctx.stroke();
          }
          ctx.font = `${11 / scale}px sans-serif`;
          ctx.fillStyle = '#0F2340';
          ctx.textAlign = 'center';
          ctx.fillText(n.label, x, y + 12);
        }}
        nodePointerAreaPaint={(n: GNode, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, 8, 0, 2 * Math.PI);
          ctx.fill();
        }}
      />
    </div>
  );
}
