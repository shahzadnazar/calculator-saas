import { describe, it, expect } from 'vitest';
import { calculateHours, parseTimeToMinutes } from './hours';

describe('work hours', () => {
  it('parses valid times and rejects invalid ones', () => {
    expect(parseTimeToMinutes('09:30')).toBe(570);
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('24:00')).toBeNull();
    expect(parseTimeToMinutes('12:60')).toBeNull();
    expect(parseTimeToMinutes('nonsense')).toBeNull();
  });

  it('computes a normal shift minus a break', () => {
    const r = calculateHours(540, 1050, 30); // 09:00–17:30, 30m break
    expect(r.totalMinutes).toBe(480);
    expect(r.hours).toBe(8);
    expect(r.minutes).toBe(0);
    expect(r.decimalHours).toBe(8);
  });

  it('handles overnight shifts', () => {
    const r = calculateHours(1320, 360, 0); // 22:00–06:00
    expect(r.hours).toBe(8);
  });

  it('reports fractional hours', () => {
    const r = calculateHours(540, 585, 0); // 45 minutes
    expect(r.decimalHours).toBe(0.75);
    expect(r.hours).toBe(0);
    expect(r.minutes).toBe(45);
  });
});
