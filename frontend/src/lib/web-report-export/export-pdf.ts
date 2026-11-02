import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { formatCount, formatPercent, formatRupiahShort } from '../web-report-format';
import { REPORT_COLORS } from '../web-report-theme';
import type { WebReportSession } from '../web-report-types';
import { downloadBlob, exportFileName } from './file-name';
import type { ReportModel } from './report-model';

const PAGE_W = 210;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FUNNEL_MIN_PCT = 2;

type Rgb = [number, number, number];
const rgb = (color: string): Rgb => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as Rgb;

/** Font standar PDF (WinAnsi) tidak punya beberapa simbol Unicode → ganti dengan padanan ASCII. */
export function pdfSafe(text: string): string {
  return text
    .replace(/−/g, '-')
    .replace(/→/g, '->')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[✔✖⚠ℹ]/g, '');
}

function header(doc: jsPDF, model: ReportModel): number {
  doc.setFillColor(...rgb(REPORT_COLORS.navy));
  doc.rect(0, 0, PAGE_W, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold').setFontSize(16);
  doc.text(doc.splitTextToSize(pdfSafe(model.title), CONTENT_W)[0] as string, MARGIN, 15);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.setTextColor(...rgb('#7FD4CA'));
  doc.text(pdfSafe(`${model.periodTypeLabel} · ${model.periodLabel} · ${model.dateRange}`), MARGIN, 23);
  doc.setTextColor(200, 208, 220);
  doc.text(pdfSafe(`Laporan Performa Website — ${model.workspaceName}`), MARGIN, 29);
  return 42;
}

function kpiCards(doc: jsPDF, model: ReportModel, top: number): number {
  const gap = 4;
  const w = (CONTENT_W - gap * 3) / 4;
  const h = 30;
  model.kpis.forEach((k, i) => {
    const x = MARGIN + i * (w + gap);
    const isHero = i === 0;
    doc.setFillColor(...rgb(isHero ? REPORT_COLORS.navy : REPORT_COLORS.paper));
    doc.roundedRect(x, top, w, h, 2, 2, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(6.5);
    doc.setTextColor(...rgb(isHero ? '#AFC0D6' : REPORT_COLORS.inkSoft));
    doc.text(pdfSafe(k.label.toUpperCase()), x + 3, top + 6, { maxWidth: w - 6 });
    doc.setFontSize(k.value.length > 12 ? 11 : 14);
    doc.setTextColor(...rgb(isHero ? '#FFFFFF' : REPORT_COLORS.navy));
    doc.text(pdfSafe(k.value), x + 3, top + 17);
    doc.setFont('helvetica', 'normal').setFontSize(6.5);
    doc.setTextColor(...rgb(isHero ? '#D5DEEA' : REPORT_COLORS.inkSoft));
    doc.text(doc.splitTextToSize(pdfSafe(k.sub), w - 6) as string[], x + 3, top + 23);
  });
  return top + h + 8;
}

function sectionTitle(doc: jsPDF, text: string, x: number, y: number): void {
  doc.setFont('helvetica', 'bold').setFontSize(9);
  doc.setTextColor(...rgb(REPORT_COLORS.navy));
  doc.text(text.toUpperCase(), x, y);
}

/** Grafik vektor (bukan gambar) agar tetap tajam saat di-zoom. */
function funnelChart(doc: jsPDF, model: ReportModel, x: number, top: number, w: number): void {
  sectionTitle(doc, 'Funnel konversi', x, top);
  const visitors = model.funnel[0].value;
  const colors = [REPORT_COLORS.visitors, REPORT_COLORS.leads, REPORT_COLORS.sales];
  const barX = x + 22;
  const barMaxW = w - 22 - 18;
  model.funnel.forEach((f, i) => {
    const y = top + 6 + i * 15;
    const pct = visitors > 0 ? Math.max(FUNNEL_MIN_PCT, (f.value / visitors) * 100) : FUNNEL_MIN_PCT;
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...rgb(REPORT_COLORS.inkSoft));
    doc.text(f.label, x, y + 4.5);
    doc.setFillColor(...rgb(REPORT_COLORS.paper));
    doc.rect(barX, y, barMaxW, 6.5, 'F');
    doc.setFillColor(...rgb(colors[i]));
    doc.rect(barX, y, (barMaxW * pct) / 100, 6.5, 'F');
    doc.setFont('helvetica', 'bold').setTextColor(...rgb(REPORT_COLORS.ink));
    doc.text(formatCount(f.value), x + w, y + 4.5, { align: 'right' });
    if (i > 0) {
      doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...rgb(REPORT_COLORS.inkSoft));
      const label = i === 1 ? 'Lead CR' : 'Lead -> Sales';
      doc.text(`${label} ${formatPercent(f.pctOfPrevious)}`, barX, y - 1.2);
    }
  });
  doc.setFontSize(7.5).setTextColor(...rgb(REPORT_COLORS.inkSoft));
  doc.text(`Sales CR (pengunjung -> sales): ${formatPercent(model.funnel[2].pctOfVisitors)}`, x, top + 52);
}

function revenueCostChart(doc: jsPDF, model: ReportModel, x: number, top: number, w: number): void {
  sectionTitle(doc, 'Omset vs biaya website', x, top);
  const bars = [
    { label: 'Omset', value: model.costs.revenue, color: REPORT_COLORS.revenue },
    { label: 'Maintenance', value: model.costs.maintenance, color: REPORT_COLORS.costMaintenance },
    { label: 'Iklan', value: model.costs.ads, color: REPORT_COLORS.costAds },
  ];
  const max = Math.max(...bars.map((b) => b.value), 1);
  const chartH = 34;
  const baseY = top + 8 + chartH;
  const slot = w / bars.length;
  doc.setDrawColor(...rgb(REPORT_COLORS.line)).line(x, baseY, x + w, baseY);
  bars.forEach((b, i) => {
    const bw = Math.min(18, slot - 8);
    const bx = x + i * slot + (slot - bw) / 2;
    const bh = (chartH * b.value) / max;
    doc.setFillColor(...rgb(b.color)).rect(bx, baseY - bh, bw, bh, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...rgb(REPORT_COLORS.ink));
    doc.text(pdfSafe(formatRupiahShort(b.value)), bx + bw / 2, baseY - bh - 1.5, { align: 'center' });
    doc.setFont('helvetica', 'normal').setTextColor(...rgb(REPORT_COLORS.inkSoft));
    doc.text(b.label, bx + bw / 2, baseY + 4.5, { align: 'center' });
  });
}

const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 0;
const TABLE_HEAD = { fillColor: rgb(REPORT_COLORS.navy), textColor: [255, 255, 255] as Rgb, fontStyle: 'bold' as const };

function tables(doc: jsPDF, model: ReportModel, top: number): void {
  autoTable(doc, {
    startY: top,
    margin: { left: MARGIN, right: MARGIN, bottom: 18 },
    head: [['Metrik', 'Nilai', 'Rumus', 'Arti']],
    body: model.metrics.map((m) => [m.label, m.display, m.formula, m.meaning].map(pdfSafe)),
    styles: { fontSize: 7.5, cellPadding: 1.8, textColor: rgb(REPORT_COLORS.ink) },
    headStyles: TABLE_HEAD,
    columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' }, 1: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 42 } },
    alternateRowStyles: { fillColor: rgb(REPORT_COLORS.paper) },
  });
  autoTable(doc, {
    startY: lastY(doc) + 7,
    margin: { left: MARGIN, right: MARGIN, bottom: 18 },
    head: [['Status', 'Insight & rencana aksi']],
    body: model.insights.length ? model.insights.map((i) => [i.label, pdfSafe(i.message)]) : [['-', 'Tidak ada catatan khusus.']],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: TABLE_HEAD,
    columnStyles: { 0: { cellWidth: 28, fontStyle: 'bold' } },
    didParseCell: (data) => {
      const level = model.insights[data.row.index]?.level;
      if (data.section === 'body' && data.column.index === 0 && level) data.cell.styles.textColor = rgb(REPORT_COLORS[level]);
    },
  });
  if (model.notes) {
    autoTable(doc, {
      startY: lastY(doc) + 7,
      margin: { left: MARGIN, right: MARGIN, bottom: 18 },
      head: [['Catatan']],
      body: [[pdfSafe(model.notes)]],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: TABLE_HEAD,
    });
  }
}

function footers(doc: jsPDF, model: ReportModel): void {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...rgb(REPORT_COLORS.inkSoft));
    doc.text(pdfSafe(model.footer), MARGIN, 289);
    doc.text(`Hal. ${p} / ${pages}`, PAGE_W - MARGIN, 289, { align: 'right' });
  }
}

export function buildPdf(model: ReportModel): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: model.title, author: model.workspaceName, creator: 'Marketing Dashboard' });
  let y = header(doc, model);
  y = kpiCards(doc, model, y);
  const half = (CONTENT_W - 10) / 2;
  funnelChart(doc, model, MARGIN, y, half);
  revenueCostChart(doc, model, MARGIN + half + 10, y, half);
  tables(doc, model, y + 60);
  footers(doc, model);
  return doc;
}

export function exportPdf(model: ReportModel, session: WebReportSession): void {
  downloadBlob(buildPdf(model).output('blob'), exportFileName(session, 'pdf'));
}
