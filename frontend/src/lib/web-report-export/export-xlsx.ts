import ExcelJS from 'exceljs';
import type { MetricDef } from '../web-report-metrics';
import { hex, REPORT_COLORS } from '../web-report-theme';
import type { WebReportSession } from '../web-report-types';
import { downloadBlob, exportFileName } from './file-name';
import type { ReportModel } from './report-model';

/** Baris sel input di sheet "Ringkasan" (kolom B) — dirujuk oleh rumus hasil. */
const INPUT_ROW = { visitors: 6, leads: 7, sales_count: 8, revenue: 9, cost_maintenance: 10, cost_ads: 11 } as const;
const R = (key: keyof typeof INPUT_ROW) => `B${INPUT_ROW[key]}`;
const COST = `(${R('cost_maintenance')}+${R('cost_ads')})`;

/** Rumus Excel per metrik; pembagian nol → sel kosong (bukan #DIV/0!). */
const FORMULAS: Record<MetricDef['key'], string> = {
  lead_cr: `IF(${R('visitors')}=0,"",${R('leads')}/${R('visitors')})`,
  sales_cr: `IF(${R('visitors')}=0,"",${R('sales_count')}/${R('visitors')})`,
  lead_to_sales_cr: `IF(${R('leads')}=0,"",${R('sales_count')}/${R('leads')})`,
  roas: `IF(${COST}=0,"",${R('revenue')}/${COST})`,
  roi: `IF(${COST}=0,"",(${R('revenue')}-${COST})/${COST})`,
  aov: `IF(${R('sales_count')}=0,"",${R('revenue')}/${R('sales_count')})`,
  rpv: `IF(${R('visitors')}=0,"",${R('revenue')}/${R('visitors')})`,
  cost_per_visitor: `IF(${R('visitors')}=0,"",${COST}/${R('visitors')})`,
  cost_total: COST.slice(1, -1),
  revenue_minus_cost: `${R('revenue')}-${COST}`,
};

/** Persen: 4 desimal hanya untuk nilai sangat kecil (sama dengan tampilan modal). */
const FMT = {
  percent: '[=0]0.00%;[<0.0001]0.0000%;0.00%',
  rupiah: '"Rp"#,##0',
  ratio: '0.00"x"',
  count: '#,##0',
} as const;

const fill = (color: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex(color)}` } });
const headerStyle = (row: ExcelJS.Row) => {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.eachCell((c) => (c.fill = fill(REPORT_COLORS.navy)));
};

function buildSummarySheet(wb: ExcelJS.Workbook, model: ReportModel): void {
  const ws = wb.addWorksheet('Ringkasan', { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.columns = [{ width: 34 }, { width: 20 }, { width: 34 }, { width: 70 }];

  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = model.title;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: `FF${hex(REPORT_COLORS.navy)}` } };
  ws.getCell('A2').value = `Periode: ${model.periodLabel} (${model.periodTypeLabel}) · ${model.dateRange}`;
  ws.getCell('A3').value = model.footer;
  ws.getCell('A3').font = { italic: true, color: { argb: 'FF6B7280' } };

  ws.getRow(5).values = ['INPUT', 'Nilai'];
  headerStyle(ws.getRow(5));
  for (const r of model.inputs) {
    const row = ws.getRow(INPUT_ROW[r.key as keyof typeof INPUT_ROW]);
    row.values = [r.label, r.raw ?? 0];
    row.getCell(2).numFmt = FMT[r.unit];
  }

  const resultHeader = ws.getRow(13);
  resultHeader.values = ['HASIL', 'Nilai', 'Rumus', 'Arti'];
  headerStyle(resultHeader);
  model.metrics.forEach((m, i) => {
    const row = ws.getRow(14 + i);
    // Persen disimpan sebagai pecahan agar format % Excel benar
    const cached = m.raw === null ? '' : m.unit === 'percent' ? m.raw / 100 : m.raw;
    row.values = [m.label, { formula: FORMULAS[m.key as MetricDef['key']], result: cached }, m.formula, m.meaning];
    row.getCell(2).numFmt = FMT[m.unit];
    row.getCell(2).font = { bold: true };
    row.getCell(4).alignment = { wrapText: true, vertical: 'top' };
  });

  let rowNo = 15 + model.metrics.length;
  const insightHeader = ws.getRow(rowNo++);
  insightHeader.values = ['INSIGHT & RENCANA AKSI', 'Status'];
  headerStyle(insightHeader);
  for (const ins of model.insights) {
    const row = ws.getRow(rowNo++);
    row.values = [ins.message, ins.label];
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(2).font = { bold: true, color: { argb: `FF${hex(REPORT_COLORS[ins.level])}` } };
  }
  if (model.notes) {
    rowNo++;
    ws.getRow(rowNo++).values = ['Catatan'];
    ws.getRow(rowNo - 1).font = { bold: true };
    ws.mergeCells(`A${rowNo}:D${rowNo}`);
    ws.getCell(`A${rowNo}`).value = model.notes;
    ws.getCell(`A${rowNo}`).alignment = { wrapText: true, vertical: 'top' };
  }
}

function buildFunnelSheet(wb: ExcelJS.Workbook, model: ReportModel): void {
  const ws = wb.addWorksheet('Funnel', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [{ width: 18 }, { width: 16 }, { width: 22 }, { width: 28 }];
  const header = ws.getRow(1);
  header.values = ['Tahap', 'Jumlah', '% dari pengunjung', '% dari tahap sebelumnya'];
  headerStyle(header);
  model.funnel.forEach((f, i) => {
    const r = i + 2;
    const row = ws.getRow(r);
    const ofVisitors = { formula: `IF($B$2=0,"",B${r}/$B$2)`, result: f.pctOfVisitors === null ? '' : f.pctOfVisitors / 100 };
    const ofPrev = i === 0 ? '' : { formula: `IF(B${r - 1}=0,"",B${r}/B${r - 1})`, result: f.pctOfPrevious === null ? '' : f.pctOfPrevious / 100 };
    row.values = [f.label, f.value, ofVisitors, ofPrev];
    row.getCell(2).numFmt = FMT.count;
    row.getCell(3).numFmt = FMT.percent;
    row.getCell(4).numFmt = FMT.percent;
  });
}

export function buildWorkbook(model: ReportModel): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = model.workspaceName;
  wb.title = model.title;
  wb.created = new Date();
  buildSummarySheet(wb, model);
  buildFunnelSheet(wb, model);
  return wb;
}

export async function exportXlsx(model: ReportModel, session: WebReportSession): Promise<void> {
  const buffer = await buildWorkbook(model).xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), exportFileName(session, 'xlsx'));
}
