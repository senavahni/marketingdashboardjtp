import { Prisma } from '../../generated/prisma/client';

/**
 * Perhitungan Laporan Performa Website (M2_PRD §6). Pure function — satu-satunya sumber rumus.
 * Nominal rupiah memakai aritmetika desimal; rasio dibulatkan half-up 4 desimal, rupiah 2 desimal.
 */
export const FORMULA_VERSION = 1;
export const LEAD_TO_SALES_LOW_THRESHOLD = 2;
export const LEAD_CR_LOW_THRESHOLD = 1;
export const ROAS_BREAK_EVEN = 1;

const Decimal = Prisma.Decimal;
type Dec = Prisma.Decimal;
const RATIO_DP = 4;
const MONEY_DP = 2;

export interface WebReportInput {
  visitors: number;
  leads: number;
  sales_count: number;
  /** String desimal, mis. "150000000.00" */
  revenue: string;
  cost_maintenance: string;
  cost_ads: string;
}

export type InsightLevel = 'success' | 'warning' | 'danger' | 'info';

export interface Insight {
  code: string;
  level: InsightLevel;
  message: string;
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
  insights: Insight[];
}

/** a ÷ b, atau null jika b = 0. */
function safeDiv(a: Dec, b: Dec): Dec | null {
  return b.isZero() ? null : a.div(b);
}

function ratio(value: Dec | null): number | null {
  return value === null ? null : value.toDecimalPlaces(RATIO_DP, Decimal.ROUND_HALF_UP).toNumber();
}

function money(value: Dec | null): string | null {
  return value === null ? null : value.toFixed(MONEY_DP, Decimal.ROUND_HALF_UP);
}

const percentOf = (part: Dec, whole: Dec): number | null => ratio(safeDiv(part, whole)?.mul(100) ?? null);

export function calculateWebReport(input: WebReportInput): WebReportResults {
  const visitors = new Decimal(input.visitors);
  const leads = new Decimal(input.leads);
  const sales = new Decimal(input.sales_count);
  const revenue = new Decimal(input.revenue);
  const costTotal = new Decimal(input.cost_maintenance).add(input.cost_ads);
  const roas = safeDiv(revenue, costTotal);

  const base = {
    lead_cr: percentOf(leads, visitors),
    sales_cr: percentOf(sales, visitors),
    lead_to_sales_cr: percentOf(sales, leads),
    cost_total: money(costTotal) as string,
    aov: money(safeDiv(revenue, sales)),
    rpv: money(safeDiv(revenue, visitors)),
    cost_per_visitor: money(safeDiv(costTotal, visitors)),
    roas: ratio(roas),
    roi: ratio(roas === null ? null : revenue.sub(costTotal).div(costTotal).mul(100)),
    revenue_minus_cost: money(revenue.sub(costTotal)) as string,
    funnel: {
      no_conversion: input.visitors - input.leads,
      leads_only: input.leads - input.sales_count,
      sales: input.sales_count,
    },
  };
  return { ...base, insights: buildInsights(input, base) };
}

// ---------- Insight (M2_PRD §6.6) ----------

const fmtDecimal = (value: number, digits: number) =>
  new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

/** Persen dengan presisi adaptif (M2_PRD §6.4). */
export function formatPercentId(value: number): string {
  const digits = value > 0 && value < 0.01 ? 4 : 2;
  return `${fmtDecimal(value, digits)}%`;
}

export function formatRupiahId(value: string): string {
  return `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(value))}`;
}

const formatRoasId = (value: number) => `${fmtDecimal(value, 2)}x`;

export function buildInsights(input: WebReportInput, r: Omit<WebReportResults, 'insights'>): Insight[] {
  const insights: Insight[] = [];
  const hasCost = !new Decimal(r.cost_total).isZero();

  if (r.roas !== null && r.roas >= ROAS_BREAK_EVEN) {
    insights.push({ code: 'COST_COVERED', level: 'success', message: `Omset ${formatRoasId(r.roas)} lipat biaya website — biaya tertutup.` });
  }
  if (r.roas !== null && r.roas < ROAS_BREAK_EVEN) {
    insights.push({ code: 'COST_NOT_COVERED', level: 'danger', message: `Omset belum menutup biaya website (ROAS ${formatRoasId(r.roas)}).` });
  }
  if (input.visitors > 0 && hasCost && r.rpv !== null && r.cost_per_visitor !== null) {
    const above = new Decimal(r.rpv).gt(r.cost_per_visitor);
    insights.push(
      above
        ? {
            code: 'RPV_ABOVE_CPV',
            level: 'success',
            message: `Tiap pengunjung bernilai ${formatRupiahId(r.rpv)}, di atas biaya mendatangkannya (${formatRupiahId(r.cost_per_visitor)}).`,
          }
        : {
            code: 'RPV_BELOW_CPV',
            level: 'warning',
            message: `Nilai per pengunjung (${formatRupiahId(r.rpv)}) belum melebihi biaya per pengunjung (${formatRupiahId(r.cost_per_visitor)}).`,
          },
    );
  }
  if (input.leads > 0 && r.lead_to_sales_cr !== null && r.lead_to_sales_cr < LEAD_TO_SALES_LOW_THRESHOLD) {
    insights.push({
      code: 'LEAD_QUALITY_LOW',
      level: 'warning',
      message: `Lead-to-Sales ${formatPercentId(r.lead_to_sales_cr)} (< ${LEAD_TO_SALES_LOW_THRESHOLD}%): traffic kurang tertarget atau follow-up lambat. Rencana aksi: percepat respons follow-up sales.`,
    });
  }
  if (input.visitors > 0 && r.lead_cr !== null && r.lead_cr < LEAD_CR_LOW_THRESHOLD) {
    insights.push({
      code: 'LEAD_CR_LOW',
      level: 'info',
      message: `Lead CR ${formatPercentId(r.lead_cr)} masih punya ruang tumbuh. Rencana aksi: sederhanakan form order/landing page (UI/UX).`,
    });
  }
  if (input.sales_count === 0) {
    insights.push({ code: 'NO_SALES', level: 'warning', message: 'Belum ada sales pada periode ini.' });
  }
  if (!hasCost) {
    insights.push({ code: 'NO_COST', level: 'info', message: 'Biaya belum diisi — ROAS & ROI tidak dihitung.' });
  }
  return insights;
}
