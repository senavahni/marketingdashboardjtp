/** Tipe Modul 2 — Laporan Performa Website (kontrak M2_TASK_001 §C). */
import type { Actor } from './types';

export type PeriodType = 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type InsightLevel = 'success' | 'warning' | 'danger' | 'info';

export interface Insight {
  code: string;
  level: InsightLevel;
  message: string;
}

export interface WebReportInputValues {
  visitors: number;
  leads: number;
  sales_count: number;
  /** String desimal rupiah, mis. "150000000.00" */
  revenue: string;
  cost_maintenance: string;
  cost_ads: string;
}

export interface WebReportResults {
  lead_cr: number | null;
  sales_cr: number | null;
  lead_to_sales_cr: number | null;
  cost_total: string;
  aov: string | null;
  rpv: string | null;
  cost_per_visitor: string | null;
  roas: number | null;
  roi: number | null;
  revenue_minus_cost: string;
  funnel: { no_conversion: number; leads_only: number; sales: number };
  /** Tidak ada di item list (ringkas) */
  insights?: Insight[];
}

export interface WebReportSession {
  id: string;
  workspace_id: string;
  title: string;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  input: WebReportInputValues;
  notes: string | null;
  results: WebReportResults;
  formula_version: number;
  version: number;
  created_by: Actor | null;
  updated_by: Actor | null;
  created_at: string;
  updated_at: string;
}

/** Body POST/PATCH (tanpa version). */
export interface WebReportPayload extends WebReportInputValues {
  title: string;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  notes: string | null;
}

/** Versi rumus terbaru yang diketahui frontend (sinkron dengan backend FORMULA_VERSION). */
export const LATEST_FORMULA_VERSION = 1;
