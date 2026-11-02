import PptxGenJS from 'pptxgenjs';
import { hex, REPORT_COLORS } from '../web-report-theme';
import type { WebReportSession } from '../web-report-types';
import { exportFileName } from './file-name';
import type { ReportModel } from './report-model';

/** Deck 16:9 mengikuti struktur "Laporan Tahunan Performa Website" (cover navy, kartu KPI, tabel funnel, analisis). */
const C = {
  navy: hex(REPORT_COLORS.navy),
  teal: hex(REPORT_COLORS.teal),
  paper: hex(REPORT_COLORS.paper),
  ink: hex(REPORT_COLORS.ink),
  inkSoft: hex(REPORT_COLORS.inkSoft),
  line: hex(REPORT_COLORS.line),
};
const FONT = 'Calibri';
const W = 13.33;

function titleBar(slide: PptxGenJS.Slide, title: string, model: ReportModel): void {
  slide.background = { color: C.paper };
  slide.addText(title, { x: 0.6, y: 0.4, w: 10, h: 0.7, fontFace: FONT, fontSize: 28, bold: true, color: C.navy });
  slide.addText(`${model.title} · ${model.periodLabel}`, { x: 0.6, y: 1.05, w: 12, h: 0.35, fontFace: FONT, fontSize: 12, color: C.inkSoft });
  slide.addText(model.footer, { x: 0.6, y: 7.0, w: W - 1.2, h: 0.3, fontFace: FONT, fontSize: 9, color: C.inkSoft });
}

function coverSlide(pptx: PptxGenJS, model: ReportModel): void {
  const slide = pptx.addSlide();
  slide.background = { color: C.navy };
  const heading = model.isYearly ? 'LAPORAN TAHUNAN PERFORMA WEBSITE' : 'LAPORAN PERFORMA WEBSITE';
  slide.addText(heading, { x: 0.8, y: 2.6, w: W - 1.6, h: 1.0, fontFace: FONT, fontSize: 40, bold: true, color: 'FFFFFF', fit: 'shrink' });
  slide.addText('Analisis Konversi Finansial & Optimasi Prospek Internal', { x: 0.8, y: 3.6, w: W - 1.6, h: 0.5, fontFace: FONT, fontSize: 20, color: C.teal });
  slide.addText(`${model.title} · ${model.periodTypeLabel} ${model.periodLabel} (${model.dateRange})`, {
    x: 0.8,
    y: 4.4,
    w: W - 1.6,
    h: 0.4,
    fontFace: FONT,
    fontSize: 14,
    color: 'D5DEEA',
  });
  slide.addText(`Dibuat oleh: ${model.workspaceName}`, { x: 0.8, y: 5.0, w: W - 1.6, h: 0.4, fontFace: FONT, fontSize: 13, color: 'FFFFFF' });
}

function executiveSlide(pptx: PptxGenJS, model: ReportModel): void {
  const slide = pptx.addSlide();
  titleBar(slide, 'Ringkasan Eksekutif Finansial', model);
  const cards = model.kpis.slice(0, 3);
  const cardW = 3.85;
  cards.forEach((k, i) => {
    const x = 0.6 + i * (cardW + 0.3);
    slide.addShape(pptx.ShapeType.roundRect, { x, y: 1.8, w: cardW, h: 4.6, fill: { color: 'FFFFFF' }, line: { color: C.line }, rectRadius: 0.25, shadow: { type: 'outer', blur: 6, offset: 2, angle: 90, color: '000000', opacity: 0.12 } });
    slide.addText(k.label.toUpperCase(), { x: x + 0.35, y: 2.6, w: cardW - 0.7, h: 0.4, fontFace: FONT, fontSize: 12, bold: true, color: C.inkSoft, align: 'center' });
    slide.addText(k.value, { x: x + 0.35, y: 3.2, w: cardW - 0.7, h: 1.0, fontFace: FONT, fontSize: 34, bold: true, color: C.navy, fit: 'shrink' });
    slide.addText(k.sub, { x: x + 0.35, y: 4.4, w: cardW - 0.7, h: 1.2, fontFace: FONT, fontSize: 13, color: C.ink, valign: 'top' });
  });
}

function funnelSlide(pptx: PptxGenJS, model: ReportModel): void {
  const slide = pptx.addSlide();
  titleBar(slide, 'Metrik Konversi Funnel Penjualan', model);
  const header = ['Metrik Konversi', 'Angka Aktual', 'Deskripsi & Analisis Funnel'].map((text) => ({
    text,
    options: { bold: true, color: 'FFFFFF', fill: { color: C.navy }, align: 'center' as const },
  }));
  const rows = model.metrics.slice(0, 3).map((m) => [
    { text: m.label },
    { text: m.display, options: { bold: true, align: 'center' as const } },
    { text: m.meaning },
  ]);
  slide.addTable([header, ...rows], { x: 0.6, y: 1.8, w: 7.2, colW: [2.3, 1.4, 3.5], fontFace: FONT, fontSize: 12, color: C.ink, border: { type: 'solid', color: C.line, pt: 1 }, fill: { color: 'FFFFFF' }, valign: 'middle' });
  // Bar horizontal menggambar kategori pertama di bawah → dibalik agar Pengunjung di atas
  const stages = [...model.funnel].reverse();
  slide.addChart(
    pptx.ChartType.bar,
    [{ name: 'Jumlah', labels: stages.map((f) => f.label), values: stages.map((f) => f.value) }],
    {
      x: 8.1,
      y: 1.8,
      w: 4.6,
      h: 4.6,
      barDir: 'bar',
      chartColors: [C.teal],
      showValue: true,
      dataLabelFormatCode: '#,##0',
      valAxisHidden: true,
      valGridLine: { style: 'none' },
      catAxisLabelFontSize: 12,
      dataLabelFontSize: 11,
      showTitle: true,
      title: 'Funnel: Pengunjung → Leads → Sales',
      titleFontSize: 12,
      titleColor: C.navy,
    },
  );
}

function revenueSlide(pptx: PptxGenJS, model: ReportModel): void {
  const slide = pptx.addSlide();
  titleBar(slide, 'Omset vs Biaya Website', model);
  const series = [
    { name: 'Omset', value: model.costs.revenue },
    { name: 'Biaya maintenance', value: model.costs.maintenance },
    { name: 'Biaya iklan', value: model.costs.ads },
  ].map((s) => ({ name: s.name, labels: [model.periodLabel], values: [s.value] }));
  slide.addChart(pptx.ChartType.bar, series, {
    x: 0.6,
    y: 1.7,
    w: 8.2,
    h: 5.0,
    barDir: 'col',
    barGrouping: 'clustered',
    chartColors: [hex(REPORT_COLORS.revenue), hex(REPORT_COLORS.costMaintenance), hex(REPORT_COLORS.costAds)],
    showValue: true,
    dataLabelFormatCode: '"Rp"#,##0',
    valAxisLabelFormatCode: '"Rp"#,##0',
    showLegend: true,
    legendPos: 'b',
    valGridLine: { color: C.line, style: 'solid', size: 0.5 },
  });
  const roas = model.kpis[0];
  slide.addShape(pptx.ShapeType.roundRect, { x: 9.2, y: 1.9, w: 3.5, h: 2.6, fill: { color: C.navy }, rectRadius: 0.2 });
  slide.addText([{ text: 'ROAS\n', options: { fontSize: 13, color: 'AFC0D6', bold: true } }, { text: `${roas.value}\n`, options: { fontSize: 36, bold: true, color: 'FFFFFF' } }, { text: roas.sub, options: { fontSize: 12, color: 'D5DEEA' } }], {
    x: 9.4,
    y: 2.0,
    w: 3.1,
    h: 2.4,
    fontFace: FONT,
    valign: 'middle',
  });
}

function analysisSlide(pptx: PptxGenJS, model: ReportModel): void {
  const slide = pptx.addSlide();
  titleBar(slide, 'Analisis Strategis & Rencana Aksi', model);
  const points = model.insights.length ? model.insights : [{ label: 'Info', message: 'Tidak ada catatan khusus untuk periode ini.', level: 'info' as const }];
  const runs = points.flatMap((p) => [
    { text: `• ${p.label}\n`, options: { bold: true, fontSize: 18, color: hex(REPORT_COLORS[p.level]) } },
    { text: `${p.message}\n\n`, options: { fontSize: 14, color: C.ink } },
  ]);
  if (model.notes) runs.push({ text: 'Catatan\n', options: { bold: true, fontSize: 16, color: C.navy } }, { text: model.notes, options: { fontSize: 13, color: C.inkSoft } });
  slide.addText(runs, { x: 0.6, y: 1.7, w: W - 1.2, h: 5.1, fontFace: FONT, valign: 'top', fit: 'shrink' });
}

export function buildPptx(model: ReportModel): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = model.title;
  pptx.company = model.workspaceName;
  pptx.author = model.workspaceName;
  coverSlide(pptx, model);
  executiveSlide(pptx, model);
  funnelSlide(pptx, model);
  revenueSlide(pptx, model);
  analysisSlide(pptx, model);
  return pptx;
}

export async function exportPptx(model: ReportModel, session: WebReportSession): Promise<void> {
  await buildPptx(model).writeFile({ fileName: exportFileName(session, 'pptx') });
}
