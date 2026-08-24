import { describe, it, expect } from 'vitest';
import { pregnancyInfo } from './pregnancy';
import { dueDateFromLMP, conceptionFromLMP, gestationalAge } from './due-date';
import { toISODateUTC, addDays } from './date-duration';

/**
 * Dedicated Pregnancy characterization (R14B2 Commit 1 — Gestational follow-on).
 *
 * FREEZES the current behaviour of `pregnancyInfo` ahead of the task-first
 * migration; it does NOT change any module. The Pregnancy binding
 * (pregnancy-form.ts) layers required + strict-calendar + future-LMP validation,
 * a local-today seed, a past-due presentation policy and a complete-result guard
 * ON TOP of these unchanged functions — this file pins exactly what that binding
 * wraps:
 *
 *   • the LMP+14 conception estimate and the Naegele LMP+280 due date (shared with
 *     the due-date engine — pregnancyInfo is a pass-through);
 *   • the two trimester milestones as the FROZEN offsets LMP+13·7 (=+91) and
 *     LMP+27·7 (=+189) — which are exactly the first days of the 2nd and 3rd
 *     trimesters (weeks ≥ 13 → T2 at 91d, weeks ≥ 27 → T3 at 189d), so the island's
 *     "Second/Third trimester begins" labels are pinned to real boundaries;
 *   • `gestationalAge(lmp, at)` with an INJECTED `at` (the island's only
 *     clock-dependent read is fully testable without touching `todayUTC`), incl.
 *     the trimester boundaries, the due-date clamp and the past-due source
 *     behaviour (weeks unbounded, progress clamped at 100, daysRemaining at 0);
 *   • the fact that the ENGINE does NOT sanitize an Invalid-Date LMP — it yields
 *     Invalid dates and NaN age, which is precisely why the guard must live in the
 *     binding, not here.
 *
 * Pregnancy cases were consolidated here out of batch-c.test.ts (which held no
 * other coverage and is removed with this commit — every former batch member now
 * has a dedicated characterization suite).
 */

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const daysAfter = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const iso = (d: Date) => toISODateUTC(d);

describe('pregnancy — key dates (pregnancyInfo)', () => {
  it('reports conception (LMP+14), due date (LMP+280) and both trimester milestones', () => {
    // LMP 2024-01-01, observed at 2024-04-01 (= LMP+91, the 13-week mark).
    const p = pregnancyInfo(utc(2024, 1, 1), utc(2024, 4, 1));
    expect(iso(p.conceptionDate)).toBe('2024-01-15');
    expect(iso(p.dueDate)).toBe('2024-10-07');
    expect(iso(p.firstTrimesterEnd)).toBe('2024-04-01'); // LMP+91 = first day of T2
    expect(iso(p.secondTrimesterEnd)).toBe('2024-07-08'); // LMP+189 = first day of T3
  });

  it('the observed gestational age at LMP+91 is 13w 0d, trimester 2', () => {
    const p = pregnancyInfo(utc(2024, 1, 1), utc(2024, 4, 1));
    expect(p.age).toMatchObject({ totalDays: 91, weeks: 13, days: 0, trimester: 2 });
  });
});

describe('pregnancy — trimester milestones are the frozen offsets LMP+91 / LMP+189', () => {
  it('firstTrimesterEnd = LMP + 13·7 and secondTrimesterEnd = LMP + 27·7, independent of `at`', () => {
    const lmp = utc(2023, 6, 15);
    // `at` deliberately varied — the milestones are a function of the LMP only.
    for (const at of [utc(2023, 6, 15), utc(2023, 8, 1), utc(2024, 3, 1)]) {
      const p = pregnancyInfo(lmp, at);
      expect(p.firstTrimesterEnd.getTime()).toBe(addDays(lmp, 13 * 7).getTime());
      expect(p.secondTrimesterEnd.getTime()).toBe(addDays(lmp, 27 * 7).getTime());
    }
  });

  it('the milestone dates coincide with the trimester-2 / trimester-3 boundaries', () => {
    const lmp = utc(2024, 1, 1);
    // 91d → trimester 2 begins; 189d → trimester 3 begins (see the boundary suite below).
    expect(iso(pregnancyInfo(lmp, utc(2024, 1, 1)).firstTrimesterEnd)).toBe(iso(daysAfter(lmp, 91)));
    expect(iso(pregnancyInfo(lmp, utc(2024, 1, 1)).secondTrimesterEnd)).toBe(iso(daysAfter(lmp, 189)));
    expect(gestationalAge(lmp, daysAfter(lmp, 91)).trimester).toBe(2);
    expect(gestationalAge(lmp, daysAfter(lmp, 189)).trimester).toBe(3);
  });
});

describe('pregnancy — current gestational age with injected `at`', () => {
  const lmp = utc(2024, 1, 1);

  it('same-day LMP → zero progress, 280 days remaining, trimester 1', () => {
    expect(pregnancyInfo(lmp, lmp).age).toEqual({
      totalDays: 0,
      weeks: 0,
      days: 0,
      trimester: 1,
      progressPct: 0,
      daysRemaining: 280,
    });
  });

  it('ordinary 70 days → 10w 0d, trimester 1, 25% progress, 210 remaining', () => {
    const g = pregnancyInfo(lmp, daysAfter(lmp, 70)).age;
    expect(g.totalDays).toBe(70);
    expect(g.weeks).toBe(10);
    expect(g.days).toBe(0);
    expect(g.trimester).toBe(1);
    expect(g.progressPct).toBeCloseTo(25, 6);
    expect(g.daysRemaining).toBe(210);
  });

  it('non-zero day remainder → 10w 3d', () => {
    const g = pregnancyInfo(lmp, daysAfter(lmp, 73)).age;
    expect(g.weeks).toBe(10);
    expect(g.days).toBe(3);
  });

  it('future `at` (at < lmp) clamps to zero — frozen pure behaviour', () => {
    const g = pregnancyInfo(utc(2024, 6, 1), utc(2024, 1, 1)).age;
    expect(g).toEqual({ totalDays: 0, weeks: 0, days: 0, trimester: 1, progressPct: 0, daysRemaining: 280 });
  });
});

describe('pregnancy — trimester boundaries via pregnancyInfo', () => {
  const lmp = utc(2024, 1, 1);

  it('12w6d (90d) is trimester 1; 13w0d (91d) is trimester 2', () => {
    expect(pregnancyInfo(lmp, daysAfter(lmp, 90)).age).toMatchObject({ totalDays: 90, weeks: 12, days: 6, trimester: 1 });
    expect(pregnancyInfo(lmp, daysAfter(lmp, 91)).age).toMatchObject({ totalDays: 91, weeks: 13, days: 0, trimester: 2 });
  });

  it('26w6d (188d) is trimester 2; 27w0d (189d) is trimester 3', () => {
    expect(pregnancyInfo(lmp, daysAfter(lmp, 188)).age).toMatchObject({ weeks: 26, days: 6, trimester: 2 });
    expect(pregnancyInfo(lmp, daysAfter(lmp, 189)).age).toMatchObject({ weeks: 27, days: 0, trimester: 3 });
  });
});

describe('pregnancy — due-date and past-due source behaviour', () => {
  const lmp = utc(2024, 1, 1);

  it('exactly on the due date (280d): progress 100, daysRemaining 0, 40 weeks', () => {
    const g = pregnancyInfo(lmp, daysAfter(lmp, 280)).age;
    expect(g.progressPct).toBe(100);
    expect(g.daysRemaining).toBe(0);
    expect(g.weeks).toBe(40);
  });

  it('past the due date (300d): weeks unbounded (42w6d), progress clamps 100, daysRemaining 0', () => {
    const g = pregnancyInfo(lmp, daysAfter(lmp, 300)).age;
    expect(g.totalDays).toBe(300);
    expect(g.weeks).toBe(42);
    expect(g.days).toBe(6);
    expect(g.trimester).toBe(3);
    expect(g.progressPct).toBe(100); // clamped
    expect(g.daysRemaining).toBe(0); // clamped
  });
});

describe('pregnancy — pass-through to the shared due-date engine', () => {
  it('dueDate / conceptionDate / age are exactly the shared-engine outputs', () => {
    const lmp = utc(2024, 3, 10);
    const at = utc(2024, 5, 1);
    const p = pregnancyInfo(lmp, at);
    expect(p.dueDate.getTime()).toBe(dueDateFromLMP(lmp).getTime());
    expect(p.conceptionDate.getTime()).toBe(conceptionFromLMP(lmp).getTime());
    expect(p.age).toEqual(gestationalAge(lmp, at));
  });
});

describe('pregnancy — leap-year & UTC stability', () => {
  it('a leap-crossing span differs from a non-leap span (LMP+280)', () => {
    // 2024 span includes Feb 29 → Oct 7; 2023 span (no Feb 29) → Oct 8.
    expect(iso(pregnancyInfo(utc(2024, 1, 1), utc(2024, 1, 1)).dueDate)).toBe('2024-10-07');
    expect(iso(pregnancyInfo(utc(2023, 1, 1), utc(2023, 1, 1)).dueDate)).toBe('2023-10-08');
  });

  it('dates are pinned to UTC midnight (no timezone drift); leap-day LMP conception rolls into March', () => {
    const p = pregnancyInfo(utc(2024, 2, 29), utc(2024, 2, 29));
    expect(p.dueDate.getUTCHours()).toBe(0);
    expect(p.conceptionDate.getUTCHours()).toBe(0);
    expect(iso(p.conceptionDate)).toBe('2024-03-14'); // Feb 29 + 14
  });
});

describe('pregnancy — month/year rollover & DST-independence', () => {
  it('the due date and conception roll over month/year boundaries', () => {
    const p = pregnancyInfo(utc(2024, 6, 15), utc(2024, 6, 15));
    expect(iso(p.dueDate)).toBe('2025-03-22'); // 2024-06-15 + 280 → next year
    expect(iso(p.conceptionDate)).toBe('2024-06-29'); // +14 within month
    expect(iso(pregnancyInfo(utc(2024, 1, 20), utc(2024, 1, 20)).conceptionDate)).toBe('2024-02-03'); // +14 across a month boundary
  });
  it('dates are DST-independent (UTC arithmetic) across both US DST transitions', () => {
    // Spring-forward (US DST begins 2024-03-10) and fall-back (2024-11-03) weeks:
    // UTC-midnight arithmetic is unaffected by any local DST shift.
    const spring = pregnancyInfo(utc(2024, 3, 10), utc(2024, 3, 24));
    expect(spring.dueDate.getUTCHours()).toBe(0);
    expect(spring.age.totalDays).toBe(14); // exactly 14 days, no DST drift
    expect(iso(spring.conceptionDate)).toBe('2024-03-24');
    const fall = pregnancyInfo(utc(2024, 11, 3), utc(2024, 11, 17));
    expect(fall.age.totalDays).toBe(14);
    expect(iso(fall.conceptionDate)).toBe('2024-11-17');
  });
});

describe('pregnancy — malformed source Date is NOT sanitized by the engine (guard lives in the binding)', () => {
  it('an Invalid-Date LMP yields Invalid dates and NaN age', () => {
    const bad = pregnancyInfo(new Date(Number.NaN), utc(2024, 1, 1));
    expect(Number.isNaN(bad.dueDate.getTime())).toBe(true);
    expect(Number.isNaN(bad.conceptionDate.getTime())).toBe(true);
    expect(Number.isNaN(bad.firstTrimesterEnd.getTime())).toBe(true);
    expect(Number.isNaN(bad.secondTrimesterEnd.getTime())).toBe(true);
    expect(Number.isNaN(bad.age.totalDays)).toBe(true);
  });
});
