import { periodKey } from '../web-report-format';
import type { WebReportSession } from '../web-report-types';

export type ExportFormat = 'pdf' | 'csv' | 'xlsx' | 'pptx';

const MAX_SLUG = 60;

/** Slug aman untuk nama file: huruf kecil a-z0-9 dan "-", diakritik dihapus. */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  return slug || 'laporan';
}

/** laporan-website_<slug-judul>_<periode>.<ext> */
export function exportFileName(session: Pick<WebReportSession, 'title' | 'period_type' | 'period_start' | 'period_end'>, ext: ExportFormat): string {
  return `laporan-website_${slugify(session.title)}_${periodKey(session.period_type, session.period_start, session.period_end)}.${ext}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
