/**
 * Titik masuk ekspor Modul 2. Setiap format memuat library-nya sendiri secara dinamis
 * sehingga exceljs/jspdf/pptxgenjs tidak masuk bundle awal (M2_PRD NFR-02).
 */
import type { WebReportSession } from '../web-report-types';
import type { ExportFormat } from './file-name';
import { buildReportModel } from './report-model';

export type { ExportFormat } from './file-name';

export async function exportWebReport(session: WebReportSession, format: ExportFormat, workspaceName: string): Promise<void> {
  const model = buildReportModel(session, workspaceName);
  if (format === 'csv') return (await import('./export-csv')).exportCsv(model, session);
  if (format === 'xlsx') return (await import('./export-xlsx')).exportXlsx(model, session);
  if (format === 'pdf') return (await import('./export-pdf')).exportPdf(model, session);
  return (await import('./export-pptx')).exportPptx(model, session);
}
