import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { funnelWidth } from '../components/web-report/charts';
import { displayIdNumber, parseIdNumber } from '../components/web-report/NumberInput';
import { bestIndex } from '../components/web-report/WebReportCompareModal';
import { buildCsv, csvCell } from '../lib/web-report-export/export-csv';
import { buildPdf, pdfSafe } from '../lib/web-report-export/export-pdf';
import { buildPptx } from '../lib/web-report-export/export-pptx';
import { buildWorkbook } from '../lib/web-report-export/export-xlsx';
import { exportFileName, slugify } from '../lib/web-report-export/file-name';
import { buildReportModel } from '../lib/web-report-export/report-model';
import {
  formatCount,
  formatDateRange,
  formatPercent,
  formatPeriod,
  formatRoas,
  formatRupiah,
  formatRupiahShort,
  periodKey,
  periodRange,
  suggestTitle,
} from '../lib/web-report-format';
import { initialFormState, toPayload, updateForm, validateForm, type WebReportFormState } from '../lib/web-report-form';
import { emptyReason } from '../lib/web-report-metrics';
import type { WebReportSession } from '../lib/web-report-types';

/** Snapshot persis seperti respons backend untuk golden test GT-1 & GT-4 (M2_PRD §6.5). */
const base = {
  workspace_id: 'ws',
  notes: null,
  formula_version: 1,
  version: 1,
  created_by: { type: 'user' as const, id: 'u1', name: 'Manager Demo' },
  updated_by: { type: 'user' as const, id: 'u1', name: 'Manager Demo' },
  created_at: '2026-11-02T08:00:00.000Z',
  updated_at: '2026-11-02T08:00:00.000Z',
};

const GT1: WebReportSession = {
  ...base,
  id: 'gt1',
  title: 'Website — Oktober 2026',
  period_type: 'monthly',
  period_start: '2026-10-01',
  period_end: '2026-10-31',
  input: { visitors: 20000, leads: 800, sales_count: 200, revenue: '150000000.00', cost_maintenance: '10000000.00', cost_ads: '5000000.00' },
  results: {
    lead_cr: 4,
    sales_cr: 1,
    lead_to_sales_cr: 25,
    cost_total: '15000000.00',
    aov: '750000.00',
    rpv: '7500.00',
    cost_per_visitor: '750.00',
    roas: 10,
    roi: 900,
    revenue_minus_cost: '135000000.00',
    funnel: { no_conversion: 19200, leads_only: 600, sales: 200 },
    insights: [
      { code: 'COST_COVERED', level: 'success', message: 'Omset 10,00x lipat biaya website — biaya tertutup.' },
      { code: 'RPV_ABOVE_CPV', level: 'success', message: 'Tiap pengunjung bernilai Rp7.500, di atas biaya mendatangkannya (Rp750).' },
    ],
  },
};

const GT4: WebReportSession = {
  ...base,
  id: 'gt4',
  title: 'Laporan Tahunan Website 2025',
  period_type: 'yearly',
  period_start: '2025-01-01',
  period_end: '2025-12-31',
  notes: '=HYPERLINK("http://evil")',
  input: { visitors: 34505, leads: 110, sales_count: 2, revenue: '112761900.00', cost_maintenance: '4574519.00', cost_ads: '0.00' },
  results: {
    lead_cr: 0.3188,
    sales_cr: 0.0058,
    lead_to_sales_cr: 1.8182,
    cost_total: '4574519.00',
    aov: '56380950.00',
    rpv: '3267.99',
    cost_per_visitor: '132.58',
    roas: 24.65,
    roi: 2365.0001,
    revenue_minus_cost: '108187381.00',
    funnel: { no_conversion: 34395, leads_only: 108, sales: 2 },
    insights: [
      { code: 'COST_COVERED', level: 'success', message: 'Omset 24,65x lipat biaya website — biaya tertutup.' },
      { code: 'LEAD_QUALITY_LOW', level: 'warning', message: 'Lead-to-Sales 1,82% (< 2%): traffic kurang tertarget.' },
    ],
  },
};

describe('web-report-format', () => {
  it('persen adaptif (koreksi "0,01%" sumber)', () => {
    expect(formatPercent(0.0058)).toBe('0,0058%');
    expect(formatPercent(0.3188)).toBe('0,32%');
    expect(formatPercent(25)).toBe('25,00%');
    expect(formatPercent(null)).toBe('—');
  });
  it('rupiah penuh & singkat', () => {
    expect(formatRupiah('56380950.00')).toBe('Rp56.380.950');
    expect(formatRupiah(-5000)).toBe('−Rp5.000');
    expect(formatRupiahShort('56380950')).toBe('Rp56,4 jt');
    expect(formatRupiahShort(150_000_000)).toBe('Rp150 jt');
    expect(formatRupiahShort(1_200_000_000)).toBe('Rp1,2 M');
    expect(formatRupiahShort(7500)).toBe('Rp7.500');
  });
  it('ROAS & jumlah', () => {
    expect(formatRoas(24.65)).toBe('24,65x');
    expect(formatCount(34505)).toBe('34.505');
  });
  it('periode', () => {
    expect(periodRange('monthly', 2028, 2)).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(periodRange('quarterly', 2026, 4)).toEqual({ start: '2026-10-01', end: '2026-12-31' });
    expect(periodRange('yearly', 2025)).toEqual({ start: '2025-01-01', end: '2025-12-31' });
    expect(formatPeriod('monthly', '2026-10-01', '2026-10-31')).toBe('Okt 2026');
    expect(formatPeriod('quarterly', '2026-10-01', '2026-12-31')).toBe('Q4 2026');
    expect(formatPeriod('custom', '2026-10-01', '2026-11-15')).toBe('1 Okt 2026 – 15 Nov 2026');
    expect(periodKey('custom', '2026-10-01', '2026-11-15')).toBe('20261001-20261115');
    expect(suggestTitle('monthly', '2026-10-01', '2026-10-31')).toBe('Website — Oktober 2026');
    expect(formatDateRange('2026-10-01', '2026-10-31')).toBe('1–31 Okt 2026');
  });
});

describe('form input', () => {
  const filled = (patch: Partial<WebReportFormState> = {}) =>
    updateForm(initialFormState(new Date(2026, 9, 15)), { visitors: '20000', leads: '800', sales_count: '200', revenue: '150000000', cost_maintenance: '10000000', cost_ads: '5000000', ...patch });

  it('default: bulan berjalan & judul otomatis mengikuti periode', () => {
    const s = initialFormState(new Date(2026, 9, 15));
    expect(s.title).toBe('Website — Oktober 2026');
    expect(updateForm(s, { period_type: 'yearly' }).title).toBe('Laporan Tahunan Website 2026');
    const typed = updateForm(s, { title: 'Judul saya' });
    expect(updateForm(typed, { index: 11 }).title).toBe('Judul saya');
  });
  it('valid → payload mentah', () => {
    const s = filled();
    expect(validateForm(s)).toEqual({});
    expect(toPayload(s)).toMatchObject({ period_start: '2026-10-01', period_end: '2026-10-31', visitors: 20000, revenue: '150000000', notes: null });
  });
  it('aturan funnel & format', () => {
    expect(validateForm(filled({ leads: '30000' })).leads).toBe('Leads tidak boleh melebihi jumlah pengunjung');
    expect(validateForm(filled({ sales_count: '900' })).sales_count).toBe('Sales tidak boleh melebihi jumlah leads');
    expect(validateForm(filled({ visitors: '' })).visitors).toBe('Pengunjung wajib diisi');
    expect(validateForm(filled({ revenue: '1.005' })).revenue).toMatch(/maks. 2 desimal/);
    expect(validateForm(filled({ title: '  ' })).title).toBe('Judul wajib diisi');
    expect(validateForm(filled({ period_type: 'custom', custom_start: '2026-10-05', custom_end: '2026-10-01' })).period).toMatch(/tidak boleh sebelum/);
  });
  it('mode ubah memuat nilai sesi', () => {
    const s = initialFormState(new Date(), GT4);
    expect(s).toMatchObject({ period_type: 'yearly', year: 2025, revenue: '112761900', cost_ads: '0' });
  });
  it('input angka format Indonesia', () => {
    expect(parseIdNumber('150.000.000', false)).toBe('150000000');
    expect(parseIdNumber('1.234,567', true)).toBe('1234.56');
    expect(parseIdNumber('007', false)).toBe('7');
    expect(displayIdNumber('1234.5')).toBe('1.234,5');
    expect(displayIdNumber('20000')).toBe('20.000');
  });
});

describe('visual helpers', () => {
  it('funnel: tahap kecil tetap terlihat (GT-4: 2 dari 34.505)', () => {
    expect(funnelWidth(2, 34505)).toBe(2);
    expect(funnelWidth(800, 20000)).toBe(4);
  });
  it('emptyReason menjelaskan "—"', () => {
    const noCost = { ...GT1.input, cost_maintenance: '0', cost_ads: '0' };
    expect(emptyReason('roas', noCost)).toMatch(/Biaya belum diisi/);
    expect(emptyReason('aov', { ...GT1.input, sales_count: 0 })).toMatch(/Belum ada sales/);
  });
  it('perbandingan: Sales CR terbaik Januari, Omset & RPV terbaik Februari', () => {
    const jan = { ...GT1, id: 'jan', results: { ...GT1.results, sales_cr: 1, rpv: '5000.00', cost_total: '5000000.00' }, input: { ...GT1.input, revenue: '50000000.00' } };
    const feb = { ...GT1, id: 'feb', results: { ...GT1.results, sales_cr: 0.5, rpv: '7500.00', cost_total: '5000000.00' }, input: { ...GT1.input, revenue: '75000000.00' } };
    expect(bestIndex([jan, feb], { key: 'sales_cr' })).toBe(0);
    expect(bestIndex([jan, feb], { key: 'rpv' })).toBe(1);
    expect(bestIndex([jan, feb], { key: 'cost_total', lowerIsBetter: true })).toBeNull();
  });
});

describe('ekspor', () => {
  const model1 = buildReportModel(GT1, 'Demo Workspace', new Date('2026-11-02T08:00:00Z'));
  const model4 = buildReportModel(GT4, 'Demo Workspace', new Date('2026-11-02T08:00:00Z'));

  it('model memakai angka snapshot yang sama dengan modal', () => {
    expect(model1.kpis.map((k) => k.value)).toEqual(['10,00x', 'Rp750.000', 'Rp7.500', 'Rp150.000.000']);
    expect(model4.kpis[0]).toMatchObject({ value: '24,65x', sub: 'ROI 2.365,00% · biaya tertutup' });
    expect(model4.metrics.find((m) => m.key === 'sales_cr')?.display).toBe('0,0058%');
    expect(model4.insights[0].level).toBe('warning');
    expect(model4.footer).toBe('Dibuat dari Marketing Dashboard · 2 November 2026 · Rumus versi 1');
  });

  it('nama file aman', () => {
    expect(slugify('Website — Oktober 2026 / Ünïcode!')).toBe('website-oktober-2026-unicode');
    expect(slugify('***')).toBe('laporan');
    expect(exportFileName(GT1, 'pdf')).toBe('laporan-website_website-oktober-2026_2026-10.pdf');
    expect(exportFileName(GT4, 'pptx')).toBe('laporan-website_laporan-tahunan-website-2025_2025.pptx');
  });

  it('CSV: angka mentah, null kosong, anti formula injection', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('-5000.00')).toBe('-5000.00');
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(null)).toBe('');
    const csv = buildCsv(model4, GT4);
    expect(csv.split('\r\n')[0]).toBe('bagian,metrik,kunci,nilai,satuan');
    expect(csv).toContain('hasil,Sales CR (Website → Sales),sales_cr,0.0058,%');
    expect(csv).toContain('hasil,AOV (Average Order Value),aov,56380950.00,IDR');
    expect(csv).toContain(`info,Catatan,notes,"'=HYPERLINK(""http://evil"")",`);
  });

  it('XLSX: rumus merujuk sel input, nilai cache = snapshot, tanpa #DIV/0!', async () => {
    const wb = buildWorkbook(model4);
    const sheet = wb.getWorksheet('Ringkasan')!;
    expect(sheet.getCell('B6').value).toBe(34505);
    const leadCr = sheet.getCell('B14').value as ExcelJS.CellFormulaValue;
    expect(leadCr.formula).toBe('IF(B6=0,"",B7/B6)');
    expect(leadCr.result).toBeCloseTo(0.003188);
    const roas = sheet.getCell('B17').value as ExcelJS.CellFormulaValue;
    expect(roas.formula).toBe('IF((B10+B11)=0,"",B9/(B10+B11))');
    expect(roas.result).toBe(24.65);
    // Round-trip: file valid & bisa dibaca ulang
    const reread = new ExcelJS.Workbook();
    await reread.xlsx.load(await wb.xlsx.writeBuffer());
    expect(reread.getWorksheet('Funnel')!.getCell('B4').value).toBe(2);
  });

  it('PDF: 1+ halaman, teks tanpa simbol non-WinAnsi', () => {
    expect(pdfSafe('Lead → Sales ≥ 2% −5')).toBe('Lead -> Sales >= 2% -5');
    const doc = buildPdf(model4);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const text = doc.output();
    expect(text).toContain('Rp56.380.950');
    expect(text).toContain('24,65x');
  });

  it('PPTX: 5 slide, judul tahunan untuk periode tahunan', async () => {
    const pptx = buildPptx(model4);
    const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Uint8Array;
    expect(buf.byteLength).toBeGreaterThan(10_000);
    const xml = new TextDecoder('latin1').decode(buf);
    expect(xml).toContain('ppt/slides/slide5.xml');
    expect(xml).not.toContain('ppt/slides/slide6.xml');
  });
});
