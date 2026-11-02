import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { web_report_period_type } from '../../generated/prisma/client';
import { addDays } from '../../utils/helpers/date.util';

/** Aturan bisnis input sesi laporan (M2_PRD §5, README D5). */
export interface FunnelCounts {
  visitors: number;
  leads: number;
  sales_count: number;
}

export function assertFunnel({ visitors, leads, sales_count }: FunnelCounts): void {
  if (leads > visitors) {
    throw Errors.business(ErrorCode.FUNNEL_INCONSISTENT, 'Leads tidak boleh melebihi jumlah pengunjung', { field: 'leads' });
  }
  if (sales_count > leads) {
    throw Errors.business(ErrorCode.FUNNEL_INCONSISTENT, 'Sales tidak boleh melebihi jumlah leads', { field: 'sales_count' });
  }
}

const QUARTER_START_MONTHS = [1, 4, 7, 10];

/** Hari terakhir dari periode yang dimulai pada `start` (YYYY-MM-DD) untuk jenis periode non-custom. */
export function expectedPeriodEnd(type: Exclude<web_report_period_type, 'custom'>, start: string): string {
  const [year, month] = start.split('-').map(Number);
  const months = type === 'monthly' ? 1 : type === 'quarterly' ? 3 : 12;
  const nextStart = new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
  return addDays(nextStart, -1);
}

function isValidPeriodStart(type: Exclude<web_report_period_type, 'custom'>, start: string): boolean {
  const [, month, day] = start.split('-').map(Number);
  if (day !== 1) return false;
  if (type === 'quarterly') return QUARTER_START_MONTHS.includes(month);
  if (type === 'yearly') return month === 1;
  return true;
}

export function assertPeriod(type: web_report_period_type, start: string, end: string): void {
  if (end < start) {
    throw Errors.business(ErrorCode.INVALID_DATE_RANGE, 'Tanggal akhir periode tidak boleh sebelum tanggal awal', { field: 'period_end' });
  }
  if (type === 'custom') return;
  if (!isValidPeriodStart(type, start) || expectedPeriodEnd(type, start) !== end) {
    throw Errors.business(ErrorCode.INVALID_PERIOD, 'Rentang tanggal tidak sesuai jenis periode', { field: 'period_start' });
  }
}
