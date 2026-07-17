import { describe, it, expect } from 'vitest';
import { calculateAge, parseISODateUTC } from './age';

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe('age calculator', () => {
  it('computes whole years', () => {
    const r = calculateAge(utc(2000, 1, 1), utc(2020, 1, 1));
    expect(r.valid).toBe(true);
    expect(r.years).toBe(20);
    expect(r.months).toBe(0);
    expect(r.days).toBe(0);
    expect(r.totalDays).toBe(7305); // includes 5 leap days
  });

  it('handles day/month borrowing', () => {
    const r = calculateAge(utc(2000, 3, 15), utc(2001, 3, 14));
    expect(r.years).toBe(0);
    expect(r.months).toBe(11);
    expect(r.days).toBe(27);
  });

  it('counts days to the next birthday', () => {
    const r = calculateAge(utc(2000, 6, 1), utc(2020, 5, 30));
    expect(r.nextBirthdayInDays).toBe(2);
  });

  it('rejects a future birth date', () => {
    const r = calculateAge(utc(2030, 1, 1), utc(2020, 1, 1));
    expect(r.valid).toBe(false);
  });

  it('parses ISO dates without timezone drift', () => {
    const d = parseISODateUTC('1995-07-04');
    expect(d?.getUTCFullYear()).toBe(1995);
    expect(d?.getUTCMonth()).toBe(6);
    expect(d?.getUTCDate()).toBe(4);
    expect(parseISODateUTC('not-a-date')).toBeNull();
  });
});
