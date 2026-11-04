import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { pdfSafe } from '../web-report-export/export-pdf';
import { downloadBlob } from '../web-report-export/file-name';
import { INTEL_COLORS } from '../intel-format';
import type { IntelReportModel } from './report-model';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

type Rgb = [number, number, number];
const rgb = (color: string): Rgb => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as Rgb;

function header(doc: jsPDF, m: IntelReportModel): number {
  doc.setFillColor(...rgb(INTEL_COLORS.ink));
  doc.rect(0, 0, PAGE_W, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold').setFontSize(16);
  doc.text(doc.splitTextToSize(pdfSafe(m.title), CONTENT_W)[0] as string, MARGIN, 15);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.setTextColor(...rgb('#7FD4CA'));
  doc.text(pdfSafe(m.subtitle), MARGIN, 23);
  doc.setTextColor(200, 208, 220);
  doc.text(pdfSafe(`Riset & Insight - ${m.workspaceName}`), MARGIN, 29);
  return 42;
}

function kpis(doc: jsPDF, m: IntelReportModel, top: number): number {
  const gap = 4;
  const w = (CONTENT_W - gap * 3) / 4;
  m.kpis.forEach((k, i) => {
    const x = MARGIN + i * (w + gap);
    const hero = i === 0;
    doc.setFillColor(...rgb(hero ? INTEL_COLORS.ink : INTEL_COLORS.paper));
    doc.roundedRect(x, top, w, 28, 2, 2, 'F');
    doc
      .setFont('helvetica', 'bold')
      .setFontSize(6.5)
      .setTextColor(...rgb(hero ? '#AFC0D6' : '#5B6474'));
    doc.text(pdfSafe(k.label.toUpperCase()), x + 3, top + 6);
    doc.setFontSize(k.value.length > 12 ? 10 : 13).setTextColor(...rgb(hero ? '#FFFFFF' : INTEL_COLORS.ink));
    doc.text(pdfSafe(k.value), x + 3, top + 15);
    doc
      .setFont('helvetica', 'normal')
      .setFontSize(6.5)
      .setTextColor(...rgb(hero ? '#D5DEEA' : '#5B6474'));
    doc.text(doc.splitTextToSize(pdfSafe(k.sub), w - 6) as string[], x + 3, top + 21);
  });
  return top + 36;
}

function title(doc: jsPDF, text: string, y: number): number {
  doc
    .setFont('helvetica', 'bold')
    .setFontSize(9)
    .setTextColor(...rgb(INTEL_COLORS.ink));
  doc.text(text.toUpperCase(), MARGIN, y);
  return y + 5;
}

function ensure(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= PAGE_H - MARGIN) return y;
  doc.addPage();
  return MARGIN + 5;
}

function sentimentBar(doc: jsPDF, m: IntelReportModel, y: number): number {
  if (!m.distribution.length) return y;
  y = title(doc, 'Distribusi sentimen', y);
  let x = MARGIN;
  for (const d of m.distribution) {
    const w = CONTENT_W * d.share;
    if (w > 0) {
      doc.setFillColor(...rgb(d.color));
      doc.rect(x, y, w, 5, 'F');
      x += w;
    }
  }
  doc
    .setFont('helvetica', 'normal')
    .setFontSize(8)
    .setTextColor(...rgb('#5B6474'));
  doc.text(m.distribution.map((d) => `${d.label} ${d.display}`).join('    '), MARGIN, y + 10);
  return y + 17;
}

function textBlock(doc: jsPDF, m: IntelReportModel, y: number): number {
  y = title(doc, 'Ringkasan eksekutif', y);
  for (const line of m.summary) {
    const bold = line.kind === 'heading';
    doc
      .setFont('helvetica', bold ? 'bold' : 'normal')
      .setFontSize(bold ? 9.5 : 9)
      .setTextColor(...rgb(bold ? INTEL_COLORS.ink : '#374151'));
    const wrapped = doc.splitTextToSize(
      pdfSafe(line.kind === 'bullet' ? `- ${line.text}` : line.text),
      CONTENT_W - (line.kind === 'bullet' ? 3 : 0),
    ) as string[];
    y = ensure(doc, y, wrapped.length * 4.4);
    doc.text(wrapped, MARGIN + (line.kind === 'bullet' ? 3 : 0), y);
    y += wrapped.length * 4.4 + 1.5;
  }
  if (m.recommendations.length) {
    y = ensure(doc, y + 2, 12);
    y = title(doc, 'Rekomendasi', y);
    m.recommendations.forEach((r, i) => {
      const wrapped = doc.splitTextToSize(pdfSafe(`${i + 1}. ${r}`), CONTENT_W) as string[];
      y = ensure(doc, y, wrapped.length * 4.4);
      doc
        .setFont('helvetica', 'normal')
        .setFontSize(9)
        .setTextColor(...rgb('#374151'));
      doc.text(wrapped, MARGIN, y);
      y += wrapped.length * 4.4 + 1;
    });
  }
  return y + 4;
}

function table(doc: jsPDF, y: number, heading: string, head: string[], body: (string | number)[][]): number {
  if (!body.length) return y;
  y = ensure(doc, y, 20);
  y = title(doc, heading, y);
  autoTable(doc, {
    startY: y,
    head: [head],
    body: body.map((r) => r.map((c) => pdfSafe(String(c)))),
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: rgb(INTEL_COLORS.ink) },
    alternateRowStyles: { fillColor: rgb(INTEL_COLORS.paper) },
  });
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
}

export async function exportIntelPdf(m: IntelReportModel, fileName: string): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = header(doc, m);
  if (m.partial) {
    doc
      .setFont('helvetica', 'bold')
      .setFontSize(8.5)
      .setTextColor(...rgb('#92400E'));
    doc.text('Hasil parsial: sebagian sumber atau tahap tidak selesai.', MARGIN, y);
    y += 6;
  }
  y = kpis(doc, m, y);
  y = sentimentBar(doc, m, y);
  y = textBlock(doc, m, y);
  y = table(
    doc,
    y,
    'Tren & topik teratas',
    ['#', 'Topik', 'Jumlah', 'Porsi'],
    m.topics.map((t) => [t.rank, t.label, t.count, t.share]),
  );
  y = table(
    doc,
    y,
    'Sentimen per aspek',
    ['Aspek', 'Sebutan', 'Positif', 'Netral', 'Negatif', 'Net'],
    m.aspects.map((a) => [a.aspect, a.mentions, a.positive, a.neutral, a.negative, a.net.toFixed(2)]),
  );
  y = table(
    doc,
    y,
    'Hashtag teratas',
    ['Hashtag', 'Jumlah'],
    m.hashtags.map(([k, v]) => [`#${k.replace(/^#/, '')}`, v]),
  );
  y = table(doc, y, 'Volume per hari', m.volume.cols, m.volume.rows);
  table(
    doc,
    y,
    'Dikerjakan oleh',
    ['Tahap', 'Agent', 'Token', 'Biaya'],
    m.stages.map((s) => [s.stage, s.agent, s.tokens, s.display]),
  );

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(150, 150, 150);
    doc.text(pdfSafe(`${m.footer} · Hal. ${p}/${pages}`), MARGIN, PAGE_H - 8);
  }
  downloadBlob(doc.output('blob'), fileName);
}
