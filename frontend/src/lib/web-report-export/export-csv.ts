import type { MetricDef } from '../web-report-metrics';
import type { WebReportInputValues, WebReportSession } from '../web-report-types';
import { downloadBlob, exportFileName } from './file-name';
import type { ReportModel } from './report-model';

type Cell = string | number | null;

const UNIT_LABEL = { percent: '%', rupiah: 'IDR', ratio: 'x', count: 'jumlah' } as const;
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
/** Angka desimal mentah (mis. "-5000.00") bukan formula → tidak di-guard. */
const NUMERIC = /^-?\d+(\.\d+)?$/;

/** RFC 4180 + anti CSV/formula injection untuk teks (angka mentah tidak diubah). */
export function csvCell(value: Cell): string {
  if (value === null) return '';
  if (typeof value === 'number' || NUMERIC.test(value)) return String(value);
  const guarded = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function buildCsv(model: ReportModel, session: WebReportSession): string {
  const rows: Cell[][] = [
    ['bagian', 'metrik', 'kunci', 'nilai', 'satuan'],
    ['info', 'Judul', 'title', model.title, ''],
    ['info', 'Jenis periode', 'period_type', session.period_type, ''],
    ['info', 'Awal periode', 'period_start', session.period_start, 'tanggal'],
    ['info', 'Akhir periode', 'period_end', session.period_end, 'tanggal'],
    ['info', 'Catatan', 'notes', model.notes, ''],
    ['info', 'Versi rumus', 'formula_version', model.formulaVersion, ''],
    // Input & hasil: angka mentah dari snapshot (persen dalam satuan %, rupiah string dua desimal)
    ...model.inputs.map((r): Cell[] => ['input', r.label, r.key, session.input[r.key as keyof WebReportInputValues], UNIT_LABEL[r.unit]]),
    ...model.metrics.map((r): Cell[] => ['hasil', r.label, r.key, session.results[r.key as MetricDef['key']], UNIT_LABEL[r.unit]]),
    ...model.insights.map((i): Cell[] => ['insight', i.label, i.level, i.message, '']),
  ];
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function exportCsv(model: ReportModel, session: WebReportSession): void {
  // BOM agar Excel membaca UTF-8 ("—", "→") dengan benar
  const blob = new Blob(['﻿', buildCsv(model, session)], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, exportFileName(session, 'csv'));
}
