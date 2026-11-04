/** Ekspor laporan Intel. Library (jspdf/exceljs) dimuat dinamis agar tidak masuk bundle awal. */
import type { IntelJob } from '../intel-types';
import { slugify } from '../web-report-export/file-name';
import { buildIntelReportModel } from './report-model';

export type IntelExportFormat = 'pdf' | 'xlsx';

export async function exportIntelReport(
  job: IntelJob,
  format: IntelExportFormat,
  workspaceName: string,
  agentName: (id: string) => string | undefined,
): Promise<void> {
  const model = buildIntelReportModel(job, workspaceName, agentName);
  const fileName = `riset_${slugify(job.title)}_${job.spec.period.since}_${job.spec.period.until}.${format}`;
  if (format === 'pdf') return (await import('./export-pdf')).exportIntelPdf(model, fileName);
  return (await import('./export-xlsx')).exportIntelXlsx(model, fileName);
}
