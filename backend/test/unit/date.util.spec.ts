import { addDays, diffDays, durationInclusive, fromDateString, isValidDateString, toDateString, todayInTimezone } from '../../src/utils/helpers/date.util';

describe('date.util (plain date)', () => {
  it('memvalidasi format & tanggal kalender', () => {
    expect(isValidDateString('2026-11-01')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026-1-01')).toBe(false);
  });

  it('round-trip string ↔ Date (UTC)', () => {
    expect(toDateString(fromDateString('2026-11-05'))).toBe('2026-11-05');
    expect(toDateString(null)).toBeNull();
  });

  it('aritmatika hari melewati batas bulan & tahun', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-11-01', '2026-11-05')).toBe(4);
    expect(durationInclusive('2026-11-01', '2026-11-05')).toBe(5);
  });

  it('tanggal hari ini mengikuti zona waktu workspace', () => {
    const utcLate = new Date('2026-10-29T20:00:00Z'); // 03:00 WIB tanggal 30
    expect(todayInTimezone('Asia/Jakarta', utcLate)).toBe('2026-10-30');
    expect(todayInTimezone('UTC', utcLate)).toBe('2026-10-29');
  });
});
