import { calculateWebReport, formatPercentId, WebReportInput } from '../../src/modules/web-reports/web-report.calculator';

/** Golden test M2_PRD §6.5 */
const GT: Record<string, WebReportInput> = {
  'GT-1': { visitors: 20_000, leads: 800, sales_count: 200, revenue: '150000000', cost_maintenance: '10000000', cost_ads: '5000000' },
  'GT-2': { visitors: 10_000, leads: 500, sales_count: 50, revenue: '0', cost_maintenance: '0', cost_ads: '0' },
  'GT-3a': { visitors: 10_000, leads: 300, sales_count: 100, revenue: '50000000', cost_maintenance: '5000000', cost_ads: '0' },
  'GT-3b': { visitors: 10_000, leads: 300, sales_count: 50, revenue: '75000000', cost_maintenance: '5000000', cost_ads: '0' },
  'GT-4': { visitors: 34_505, leads: 110, sales_count: 2, revenue: '112761900', cost_maintenance: '4574519', cost_ads: '0' },
  'GT-5': { visitors: 0, leads: 0, sales_count: 0, revenue: '0', cost_maintenance: '1000000', cost_ads: '0' },
};

const codes = (input: WebReportInput) => calculateWebReport(input).insights.map((i) => i.code);

describe('calculateWebReport — golden test', () => {
  it('GT-1 contoh perhitungan sumber', () => {
    const r = calculateWebReport(GT['GT-1']);
    expect(r).toMatchObject({
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
      funnel: { no_conversion: 19_200, leads_only: 600, sales: 200 },
    });
  });

  it('GT-2 tanpa nominal: ROAS & ROI null', () => {
    const r = calculateWebReport(GT['GT-2']);
    expect(r).toMatchObject({ lead_cr: 5, sales_cr: 0.5, lead_to_sales_cr: 10, aov: '0.00', rpv: '0.00', roas: null, roi: null });
  });

  it('GT-3a / GT-3b Januari vs Februari', () => {
    expect(calculateWebReport(GT['GT-3a'])).toMatchObject({ lead_cr: 3, sales_cr: 1, lead_to_sales_cr: 33.3333, aov: '500000.00', rpv: '5000.00', roas: 10, roi: 900 });
    expect(calculateWebReport(GT['GT-3b'])).toMatchObject({ lead_cr: 3, sales_cr: 0.5, lead_to_sales_cr: 16.6667, aov: '1500000.00', rpv: '7500.00', roas: 15, roi: 1400 });
  });

  it('GT-4 rekonstruksi laporan aktual', () => {
    const r = calculateWebReport(GT['GT-4']);
    expect(r).toMatchObject({
      lead_cr: 0.3188,
      sales_cr: 0.0058,
      lead_to_sales_cr: 1.8182,
      aov: '56380950.00',
      rpv: '3267.99',
      cost_per_visitor: '132.58',
      roas: 24.65,
      roi: 2365.0001,
    });
  });

  it('GT-5 tanpa pengunjung: rasio null, tidak pernah NaN/Infinity', () => {
    const r = calculateWebReport(GT['GT-5']);
    expect(r).toMatchObject({ lead_cr: null, sales_cr: null, lead_to_sales_cr: null, aov: null, rpv: null, cost_per_visitor: null, roas: 0, roi: -100 });
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
  });
});

describe('insight', () => {
  it.each([
    ['GT-1', ['COST_COVERED', 'RPV_ABOVE_CPV']],
    ['GT-2', ['NO_COST']],
    ['GT-4', ['COST_COVERED', 'RPV_ABOVE_CPV', 'LEAD_QUALITY_LOW', 'LEAD_CR_LOW']],
    ['GT-5', ['COST_NOT_COVERED', 'NO_SALES']],
  ])('%s → %j', (key, expected) => {
    expect(codes(GT[key])).toEqual(expected);
  });

  it('ambang batas: L→S tepat 2% bukan LEAD_QUALITY_LOW, ROAS tepat 1 = COST_COVERED', () => {
    const input: WebReportInput = { visitors: 1_000, leads: 100, sales_count: 2, revenue: '1000000', cost_maintenance: '1000000', cost_ads: '0' };
    expect(codes(input)).toContain('COST_COVERED');
    expect(codes(input)).not.toContain('LEAD_QUALITY_LOW');
  });

  it('RPV di bawah biaya per pengunjung → RPV_BELOW_CPV', () => {
    const input: WebReportInput = { visitors: 1_000, leads: 100, sales_count: 10, revenue: '500000', cost_maintenance: '1000000', cost_ads: '0' };
    expect(codes(input)).toEqual(['COST_NOT_COVERED', 'RPV_BELOW_CPV']);
  });

  it('pesan memakai format Indonesia', () => {
    const [covered] = calculateWebReport(GT['GT-4']).insights;
    expect(covered.message).toBe('Omset 24,65x lipat biaya website — biaya tertutup.');
  });
});

describe('presisi', () => {
  it('pembulatan half-up 4 desimal', () => {
    const r = calculateWebReport({ visitors: 3, leads: 2, sales_count: 0, revenue: '0', cost_maintenance: '0', cost_ads: '0' });
    expect(r.lead_cr).toBe(66.6667);
  });

  it('nominal maksimum tidak kehilangan presisi', () => {
    const r = calculateWebReport({ visitors: 1, leads: 1, sales_count: 1, revenue: '999999999999999.99', cost_maintenance: '0.01', cost_ads: '0' });
    expect(r.aov).toBe('999999999999999.99');
    expect(r.revenue_minus_cost).toBe('999999999999999.98');
  });

  it('formatPercentId adaptif', () => {
    expect(formatPercentId(0.0058)).toBe('0,0058%');
    expect(formatPercentId(0.3188)).toBe('0,32%');
    expect(formatPercentId(0)).toBe('0,00%');
  });
});
