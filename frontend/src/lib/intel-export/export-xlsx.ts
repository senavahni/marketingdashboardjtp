import ExcelJS from 'exceljs';
import { downloadBlob } from '../web-report-export/file-name';
import { INTEL_COLORS } from '../intel-format';
import type { IntelReportModel } from './report-model';

const argb = (color: string) => `FF${color.replace('#', '')}`;
const fill = (color: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(color) } });

function addTable(wb: ExcelJS.Workbook, name: string, head: string[], rows: (string | number)[][], widths: number[]): void {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = widths.map((width) => ({ width }));
  const headRow = ws.addRow(head);
  headRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headRow.eachCell((c) => (c.fill = fill(INTEL_COLORS.ink)));
  rows.forEach((r) => ws.addRow(r));
}

export async function exportIntelXlsx(m: IntelReportModel, fileName: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Marketing Dashboard';

  const ws = wb.addWorksheet('Ringkasan');
  ws.columns = [{ width: 28 }, { width: 26 }, { width: 70 }];
  ws.getCell('A1').value = m.title;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: argb(INTEL_COLORS.ink) } };
  ws.getCell('A2').value = m.subtitle;
  ws.getCell('A3').value = m.footer;
  ws.getCell('A3').font = { italic: true, color: { argb: 'FF6B7280' } };
  if (m.partial) ws.getCell('A4').value = 'Hasil parsial: sebagian sumber atau tahap tidak selesai.';
  let row = 6;
  for (const k of m.kpis) {
    ws.getCell(`A${row}`).value = k.label;
    ws.getCell(`A${row}`).font = { bold: true };
    ws.getCell(`B${row}`).value = k.value;
    ws.getCell(`C${row}`).value = k.sub;
    row++;
  }
  row++;
  ws.getCell(`A${row}`).value = 'Ringkasan eksekutif';
  ws.getCell(`A${row++}`).font = { bold: true, color: { argb: argb(INTEL_COLORS.accent) } };
  for (const line of m.summary) {
    ws.getCell(`A${row}`).value = line.kind === 'bullet' ? `• ${line.text}` : line.text;
    ws.getCell(`A${row}`).font = { bold: line.kind === 'heading' };
    ws.mergeCells(`A${row}:C${row}`);
    ws.getCell(`A${row++}`).alignment = { wrapText: true };
  }
  if (m.recommendations.length) {
    row++;
    ws.getCell(`A${row}`).value = 'Rekomendasi';
    ws.getCell(`A${row++}`).font = { bold: true, color: { argb: argb(INTEL_COLORS.accent) } };
    m.recommendations.forEach((r, i) => {
      ws.getCell(`A${row}`).value = `${i + 1}. ${r}`;
      ws.mergeCells(`A${row}:C${row}`);
      ws.getCell(`A${row++}`).alignment = { wrapText: true };
    });
  }

  addTable(
    wb,
    'Sentimen',
    ['Sentimen', 'Porsi'],
    m.distribution.map((d) => [d.label, d.share]),
    [16, 12],
  );
  wb.getWorksheet('Sentimen')
    ?.getColumn(2)
    .eachCell((c, n) => n > 1 && (c.numFmt = '0%'));
  addTable(
    wb,
    'Topik',
    ['#', 'Topik', 'Jumlah', 'Porsi'],
    m.topics.map((t) => [t.rank, t.label, t.count, t.share]),
    [5, 40, 12, 10],
  );
  if (m.aspects.length)
    addTable(
      wb,
      'Aspek',
      ['Aspek', 'Sebutan', 'Positif', 'Netral', 'Negatif', 'Net'],
      m.aspects.map((a) => [a.aspect, a.mentions, a.positive, a.neutral, a.negative, a.net]),
      [24, 10, 10, 10, 10, 8],
    );
  addTable(
    wb,
    'Hashtag & Akun',
    ['Hashtag', 'Jumlah', '', 'Akun', 'Jumlah'],
    Array.from({ length: Math.max(m.hashtags.length, m.authors.length) }, (_, i) => [
      m.hashtags[i]?.[0] ?? '',
      m.hashtags[i]?.[1] ?? '',
      '',
      m.authors[i]?.[0] ?? '',
      m.authors[i]?.[1] ?? '',
    ]),
    [24, 10, 3, 24, 10],
  );
  addTable(
    wb,
    'Volume harian',
    m.volume.cols,
    m.volume.rows,
    m.volume.cols.map((_, i) => (i === 0 ? 14 : 12)),
  );
  addTable(
    wb,
    'Agent & biaya',
    ['Tahap', 'Agent', 'Token', 'Biaya (USD)'],
    m.stages.map((s) => [s.stage, s.agent, s.tokens, s.usd]),
    [16, 26, 12, 14],
  );

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}
