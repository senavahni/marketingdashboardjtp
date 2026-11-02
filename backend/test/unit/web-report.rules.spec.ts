import { AppException } from '../../src/common/exceptions/app.exception';
import { assertFunnel, assertPeriod, expectedPeriodEnd } from '../../src/modules/web-reports/web-report.rules';
import { createWebReportSchema, updateWebReportSchema } from '../../src/modules/web-reports/web-reports.schemas';

const errorOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    const err = e as AppException;
    return { code: err.code, details: err.details };
  }
  return null;
};

describe('web-report.rules', () => {
  describe('assertFunnel', () => {
    it('menerima funnel konsisten (termasuk semua nol)', () => {
      expect(errorOf(() => assertFunnel({ visitors: 100, leads: 10, sales_count: 10 }))).toBeNull();
      expect(errorOf(() => assertFunnel({ visitors: 0, leads: 0, sales_count: 0 }))).toBeNull();
    });
    it('leads > visitors → FUNNEL_INCONSISTENT field leads', () => {
      expect(errorOf(() => assertFunnel({ visitors: 10, leads: 11, sales_count: 0 }))).toEqual({ code: 'FUNNEL_INCONSISTENT', details: { field: 'leads' } });
    });
    it('sales > leads → FUNNEL_INCONSISTENT field sales_count', () => {
      expect(errorOf(() => assertFunnel({ visitors: 100, leads: 5, sales_count: 6 }))).toEqual({ code: 'FUNNEL_INCONSISTENT', details: { field: 'sales_count' } });
    });
  });

  describe('assertPeriod', () => {
    it('periode valid per jenis', () => {
      expect(errorOf(() => assertPeriod('monthly', '2026-10-01', '2026-10-31'))).toBeNull();
      expect(errorOf(() => assertPeriod('monthly', '2028-02-01', '2028-02-29'))).toBeNull();
      expect(errorOf(() => assertPeriod('quarterly', '2026-10-01', '2026-12-31'))).toBeNull();
      expect(errorOf(() => assertPeriod('yearly', '2026-01-01', '2026-12-31'))).toBeNull();
      expect(errorOf(() => assertPeriod('custom', '2026-10-05', '2026-11-15'))).toBeNull();
    });
    it('akhir < awal → INVALID_DATE_RANGE', () => {
      expect(errorOf(() => assertPeriod('custom', '2026-10-05', '2026-10-01'))?.code).toBe('INVALID_DATE_RANGE');
    });
    it('rentang tidak sesuai jenis → INVALID_PERIOD', () => {
      expect(errorOf(() => assertPeriod('monthly', '2026-10-02', '2026-10-31'))?.code).toBe('INVALID_PERIOD');
      expect(errorOf(() => assertPeriod('monthly', '2026-10-01', '2026-11-30'))?.code).toBe('INVALID_PERIOD');
      expect(errorOf(() => assertPeriod('quarterly', '2026-11-01', '2027-01-31'))?.code).toBe('INVALID_PERIOD');
      expect(errorOf(() => assertPeriod('yearly', '2026-02-01', '2027-01-31'))?.code).toBe('INVALID_PERIOD');
    });
    it('expectedPeriodEnd', () => {
      expect(expectedPeriodEnd('monthly', '2026-12-01')).toBe('2026-12-31');
      expect(expectedPeriodEnd('quarterly', '2026-01-01')).toBe('2026-03-31');
    });
  });

  describe('schema', () => {
    const valid = {
      title: '  Website — Oktober 2026 ',
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      visitors: 20000,
      leads: 800,
      sales_count: 200,
      revenue: 150000000,
    };
    it('default & normalisasi', () => {
      const parsed = createWebReportSchema.parse(valid);
      expect(parsed).toMatchObject({ title: 'Website — Oktober 2026', period_type: 'monthly', revenue: '150000000', cost_maintenance: '0', cost_ads: '0' });
    });
    it.each([
      ['angka negatif', { visitors: -1 }],
      ['desimal pada jumlah', { leads: 1.5 }],
      ['rupiah 3 desimal', { revenue: '1.005' }],
      ['rupiah negatif', { revenue: '-5' }],
      ['judul kosong', { title: '   ' }],
    ])('menolak %s', (_label, patch) => {
      expect(createWebReportSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    });
    it('update wajib version + minimal satu field', () => {
      expect(updateWebReportSchema.safeParse({ version: 1 }).success).toBe(false);
      expect(updateWebReportSchema.safeParse({ revenue: '1' }).success).toBe(false);
      expect(updateWebReportSchema.safeParse({ version: 1, revenue: '1' }).success).toBe(true);
    });
  });
});
