import { describe, it, expect } from 'vitest';
import { dueDateFromLMP, conceptionFromLMP, gestationalAge, GESTATION_DAYS } from './due-date';
import { toISODateUTC } from './date-duration';
import { parseISODateUTC } from './age';

/**
 * Dedicated Due Date characterization (R14B1 Commit 1 — Gestational pilot).
 *
 * FREEZES the current behaviour of the shared gestational engine ahead of the
 * task-first migration; it does NOT change any module. The Due Date binding
 * (due-date-form.ts) layers required + future-LMP validation, a local-today seed,
 * and a past-due presentation policy ON TOP of these unchanged functions — this
 * file pins exactly what that binding wraps: strict-format ISO parsing (with the
 * frozen roll-over of out-of-range components), Naegele's LMP+280 due date, the
 * LMP+14 conception estimate, and gestationalAge(lmp, at) with an INJECTED `at`
 * (so the island's only clock-dependent code is fully testable without touching
 * `todayUTC`). The pure formula's future-`at` clamp stays frozen even though the
 * new binding rejects a future visitor LMP.
 *
 * Due Date cases were consolidated here out of batch-c.test.ts; the Pregnancy
 * cases remain in batch-c.test.ts.
 */

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const daysAfter = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

describe('due date — ISO date parsing (parseISODateUTC, frozen)', () => {
  it('parses a valid YYYY-MM-DD as UTC midnight', () => {
    const d = parseISODateUTC('2024-01-01');
    expect(d).not.toBeNull();
    expect(toISODateUTC(d!)).toBe('2024-01-01');
    expect(d!.getUTCHours()).toBe(0);
  });
  it('parses a leap day', () => {
    expect(toISODateUTC(parseISODateUTC('2024-02-29')!)).toBe('2024-02-29');
  });
  it('ROLLS OVER out-of-range day components (frozen: not rejected)', () => {
    // Feb 30 2023 -> Date.UTC(2023,1,30) normalises to Mar 2 2023.
    expect(toISODateUTC(parseISODateUTC('2023-02-30')!)).toBe('2023-03-02');
  });
  it('ROLLS OVER out-of-range month components (frozen: not rejected)', () => {
    // month 13 -> Date.UTC(2023,12,1) normalises to Jan 1 2024.
    expect(toISODateUTC(parseISODateUTC('2023-13-01')!)).toBe('2024-01-01');
  });
  it('returns null for malformed / non-matching text', () => {
    expect(parseISODateUTC('')).toBeNull();
    expect(parseISODateUTC('not-a-date')).toBeNull();
    expect(parseISODateUTC('2024/01/01')).toBeNull();
    expect(parseISODateUTC('20240101')).toBeNull();
    expect(parseISODateUTC('2024-1-1')).toBeNull(); // requires zero-padding
  });
});

describe('due date — Naegele due date (LMP + 280)', () => {
  it('adds 280 days', () => {
    expect(GESTATION_DAYS).toBe(280);
    expect(toISODateUTC(dueDateFromLMP(utc(2024, 1, 1)))).toBe('2024-10-07');
  });
  it('crosses a leap day differently from a non-leap span', () => {
    // 2024 span includes Feb 29 -> Oct 7; 2023 span (no Feb 29) -> Oct 8.
    expect(toISODateUTC(dueDateFromLMP(utc(2024, 1, 1)))).toBe('2024-10-07');
    expect(toISODateUTC(dueDateFromLMP(utc(2023, 1, 1)))).toBe('2023-10-08');
  });
  it('rolls month/year over correctly', () => {
    expect(toISODateUTC(dueDateFromLMP(utc(2024, 6, 15)))).toBe('2025-03-22');
  });
});

describe('due date — conception estimate (LMP + 14)', () => {
  it('adds 14 days', () => {
    expect(toISODateUTC(conceptionFromLMP(utc(2024, 1, 1)))).toBe('2024-01-15');
  });
  it('rolls over the month boundary', () => {
    expect(toISODateUTC(conceptionFromLMP(utc(2024, 1, 20)))).toBe('2024-02-03');
  });
});

describe('due date — gestationalAge(lmp, at) with injected `at`', () => {
  const lmp = utc(2024, 1, 1);

  it('same-day LMP → zero progress, 280 days remaining', () => {
    const g = gestationalAge(lmp, lmp);
    expect(g).toEqual({ totalDays: 0, weeks: 0, days: 0, trimester: 1, progressPct: 0, daysRemaining: 280 });
  });

  it('ordinary 70 days → 10w 0d, trimester 1, 25% progress', () => {
    const g = gestationalAge(lmp, daysAfter(lmp, 70));
    expect(g.totalDays).toBe(70);
    expect(g.weeks).toBe(10);
    expect(g.days).toBe(0);
    expect(g.trimester).toBe(1);
    expect(g.progressPct).toBeCloseTo(25, 6);
    expect(g.daysRemaining).toBe(210);
  });

  it('non-zero days remainder → 10w 3d', () => {
    const g = gestationalAge(lmp, daysAfter(lmp, 73));
    expect(g.weeks).toBe(10);
    expect(g.days).toBe(3);
  });

  it('future LMP clamps to zero (frozen pure behaviour)', () => {
    const g = gestationalAge(utc(2024, 6, 1), utc(2024, 1, 1)); // at < lmp
    expect(g.totalDays).toBe(0);
    expect(g.weeks).toBe(0);
    expect(g.trimester).toBe(1);
    expect(g.progressPct).toBe(0);
    expect(g.daysRemaining).toBe(280);
  });

  it('trimester boundary: 12w6d (90d) is trimester 1, 13w0d (91d) is trimester 2', () => {
    const a = gestationalAge(lmp, daysAfter(lmp, 90));
    expect(a).toMatchObject({ totalDays: 90, weeks: 12, days: 6, trimester: 1 });
    const b = gestationalAge(lmp, daysAfter(lmp, 91));
    expect(b).toMatchObject({ totalDays: 91, weeks: 13, days: 0, trimester: 2 });
  });

  it('trimester boundary: 26w6d (188d) is trimester 2, 27w0d (189d) is trimester 3', () => {
    const a = gestationalAge(lmp, daysAfter(lmp, 188));
    expect(a).toMatchObject({ weeks: 26, days: 6, trimester: 2 });
    const b = gestationalAge(lmp, daysAfter(lmp, 189));
    expect(b).toMatchObject({ weeks: 27, days: 0, trimester: 3 });
  });

  it('third-trimester state', () => {
    expect(gestationalAge(lmp, daysAfter(lmp, 200)).trimester).toBe(3);
  });

  it('progress clamps at 100 and days-remaining at 0 exactly on the due date (280d)', () => {
    const g = gestationalAge(lmp, daysAfter(lmp, 280));
    expect(g.progressPct).toBe(100);
    expect(g.daysRemaining).toBe(0);
    expect(g.weeks).toBe(40);
  });

  it('past-due source behaviour (300d): progress clamps 100, daysRemaining 0, weeks unbounded', () => {
    const g = gestationalAge(lmp, daysAfter(lmp, 300));
    expect(g.totalDays).toBe(300);
    expect(g.weeks).toBe(42);
    expect(g.days).toBe(6);
    expect(g.trimester).toBe(3);
    expect(g.progressPct).toBe(100); // clamped
    expect(g.daysRemaining).toBe(0); // clamped
  });
});
