import { describe, it, expect } from 'vitest';
import { calculateHours, parseTimeToMinutes } from './hours';

/**
 * Dedicated Hours characterization (R17B2 Commit 1 — bounded Everyday singleton). FREEZES the exact
 * current behaviour of `parseTimeToMinutes` and `calculateHours` ahead of the task-first migration; it
 * does NOT change the module. The Hours binding (hours-form.ts) layers stricter visitor validation and a
 * complete-result guard ON TOP of these unchanged functions — this file pins exactly what it wraps.
 *
 *   parseTimeToMinutes: /^(\d{1,2}):(\d{2})$/ on the trimmed string → h*60+min; null if no match,
 *                       h > 23, or min > 59. HH is 1–2 digits, MM is EXACTLY 2 digits; NO seconds.
 *   calculateHours(start, end, break=0): span = end − start; span < 0 → +1440 (overnight); the break is
 *                       in MINUTES, clamped to max(0, break); total = max(0, span − break) (never
 *                       negative); decimalHours rounded to 2 dp. Equal start/end → 0 (NOT 24h).
 */

describe('parseTimeToMinutes — "HH:MM" 24h, no seconds', () => {
  it('parses an ordinary morning and afternoon time', () => {
    expect(parseTimeToMinutes('09:30')).toBe(570);
    expect(parseTimeToMinutes('17:45')).toBe(1065);
  });

  it('parses midnight and noon', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('12:00')).toBe(720);
  });

  it('accepts a single-digit hour and leading zeros', () => {
    expect(parseTimeToMinutes('9:05')).toBe(545);
    expect(parseTimeToMinutes('09:05')).toBe(545);
  });

  it('accepts the boundary hour 23 and minute 59, and trims surrounding space', () => {
    expect(parseTimeToMinutes('23:59')).toBe(1439);
    expect(parseTimeToMinutes('  08:15 ')).toBe(495);
  });

  it('rejects an out-of-range hour and minute', () => {
    expect(parseTimeToMinutes('24:00')).toBeNull();
    expect(parseTimeToMinutes('12:60')).toBeNull();
    expect(parseTimeToMinutes('99:99')).toBeNull();
  });

  it('rejects seconds, single-digit minutes, missing colon, empty and malformed strings', () => {
    expect(parseTimeToMinutes('09:30:00')).toBeNull(); // no seconds support
    expect(parseTimeToMinutes('9:5')).toBeNull(); // MM must be two digits
    expect(parseTimeToMinutes('0930')).toBeNull();
    expect(parseTimeToMinutes('')).toBeNull();
    expect(parseTimeToMinutes('nonsense')).toBeNull();
  });

  it('is deterministic', () => {
    expect(parseTimeToMinutes('13:37')).toBe(parseTimeToMinutes('13:37'));
  });
});

describe('calculateHours — elapsed minus break, overnight-aware, clamped ≥ 0', () => {
  it('an ordinary same-day shift minus a break (09:00–17:30, 30m → 8h)', () => {
    const r = calculateHours(540, 1050, 30);
    expect(r).toEqual({ totalMinutes: 480, hours: 8, minutes: 0, decimalHours: 8 });
  });

  it('an overnight shift adds 24h (22:00–06:00 → 8h)', () => {
    const r = calculateHours(1320, 360, 0);
    expect(r.totalMinutes).toBe(480);
    expect(r.hours).toBe(8);
    expect(r.minutes).toBe(0);
  });

  it('a one-minute interval and a whole-hour interval', () => {
    expect(calculateHours(540, 541, 0).totalMinutes).toBe(1);
    expect(calculateHours(540, 600, 0)).toEqual({ totalMinutes: 60, hours: 1, minutes: 0, decimalHours: 1 });
  });

  it('a multi-hour interval reports hours + minutes + rounded decimal (09:00–17:15 → 8h 15m, 8.25)', () => {
    const r = calculateHours(540, 1035, 0);
    expect(r).toEqual({ totalMinutes: 495, hours: 8, minutes: 15, decimalHours: 8.25 });
  });

  it('reports fractional hours to 2 dp (45 minutes → 0.75)', () => {
    const r = calculateHours(540, 585, 0);
    expect(r.decimalHours).toBe(0.75);
    expect(r.hours).toBe(0);
    expect(r.minutes).toBe(45);
  });

  it('start equal to end is a ZERO duration (span 0, NOT 24h)', () => {
    expect(calculateHours(540, 540, 0)).toEqual({ totalMinutes: 0, hours: 0, minutes: 0, decimalHours: 0 });
  });

  it('a zero break leaves the elapsed time unchanged', () => {
    expect(calculateHours(540, 1020, 0).totalMinutes).toBe(480);
  });

  it('an ordinary break is subtracted from the elapsed time', () => {
    expect(calculateHours(540, 1020, 60).totalMinutes).toBe(420); // 8h − 60m = 7h
  });

  it('a negative break is clamped to zero (no break)', () => {
    expect(calculateHours(540, 1020, -30).totalMinutes).toBe(480);
  });

  it('a break EQUAL to the elapsed time yields zero', () => {
    expect(calculateHours(540, 1020, 480)).toEqual({ totalMinutes: 0, hours: 0, minutes: 0, decimalHours: 0 });
  });

  it('a break LONGER than the elapsed time clamps to zero (never negative)', () => {
    expect(calculateHours(540, 1020, 600)).toEqual({ totalMinutes: 0, hours: 0, minutes: 0, decimalHours: 0 });
  });

  it('a decimal break is honoured by the source (fractional minutes propagate — the binding honours this too)', () => {
    const r = calculateHours(540, 1020, 30.5);
    expect(r.totalMinutes).toBe(449.5);
    expect(r.minutes).toBe(29.5); // 449.5 % 60 — a non-integer minute the visitor layer now honours (R17B2.1)
  });

  it('hours/minutes reconcile with totalMinutes and decimalHours with totalMinutes/60', () => {
    const r = calculateHours(500, 1000, 25);
    expect(r.hours * 60 + r.minutes).toBe(r.totalMinutes);
    expect(r.decimalHours).toBe(Math.round((r.totalMinutes / 60) * 100) / 100);
  });

  it('is deterministic', () => {
    expect(calculateHours(480, 1010, 45)).toEqual(calculateHours(480, 1010, 45));
  });
});
