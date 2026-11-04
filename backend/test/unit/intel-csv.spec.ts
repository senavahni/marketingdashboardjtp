import { csvCell } from '../../src/modules/intel/intel-csv';

describe('Intel CSV escaping', () => {
  it('quotes values, doubles embedded quotes, and neutralizes spreadsheet formulas', () => {
    expect(csvCell('hello, "world"')).toBe('"hello, ""world"""');
    expect(csvCell(' =HYPERLINK("https://example.com")')).toBe('"\' =HYPERLINK(""https://example.com"")"');
  });

  it('serializes non-string values and null as cells', () => {
    expect(csvCell(42)).toBe('"42"');
    expect(csvCell(null)).toBe('""');
  });
});
