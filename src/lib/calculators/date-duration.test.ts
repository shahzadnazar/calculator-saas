import { describe, it, expect } from 'vitest';
import { diffDates, addDays, toISODateUTC } from './date-duration';

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe('date duration', () => {
  it('counts days between two dates', () => {
    const r = diffDates(utc(2024, 1, 1), utc(2024, 1, 31));
    expect(r.totalDays).toBe(30);
    expect(r.weeks).toBe(4);
    expect(r.direction).toBe('after');
  });

  it('is order-independent for the breakdown', () => {
    const a = diffDates(utc(2000, 1, 1), utc(2020, 1, 1));
    const b = diffDates(utc(2020, 1, 1), utc(2000, 1, 1));
    expect(a.breakdown.years).toBe(20);
    expect(b.breakdown.years).toBe(20);
    expect(b.direction).toBe('before');
  });

  it('adds and subtracts days', () => {
    expect(toISODateUTC(addDays(utc(2024, 2, 28), 1))).toBe('2024-02-29'); // leap year
    expect(toISODateUTC(addDays(utc(2024, 1, 1), -1))).toBe('2023-12-31');
  });
});
