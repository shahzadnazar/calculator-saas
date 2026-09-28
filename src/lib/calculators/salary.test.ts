import { describe, it, expect } from 'vitest';
import { convertSalary, type SalaryInput, type SalaryResult } from './salary';

/**
 * R19A1 Commit 1 — dedicated, expanded characterization of the Salary calculator's source
 * (salary.ts), FROZEN before the task-first migration. Test-only: salary.ts is UNCHANGED.
 * Consolidated out of batch-b.test.ts (which held salary-only coverage — interest-rate / home-equity /
 * income-tax already left for their dedicated suites — so it is now removed).
 *
 * convertSalary normalises any one pay figure to an ANNUAL total (hourly = amt·hpw·wpy; daily =
 * amt·dpw·wpy; weekly = amt·wpy; biweekly = amt·26 [FIXED]; monthly = amt·12 [FIXED]; annual = amt),
 * then derives the six period equivalents (weekly = annual/wpy; monthly = annual/12; biweekly =
 * annual/26; daily = weekly/dpw; hourly = weekly/hpw), guarding division by zero (hpw/dpw/wpy) to 0.
 * Inputs are coerced with `|| 0` (NaN/undefined → 0; Infinity stays Infinity). This is the source of
 * truth the salary-form binding + task-first island must never contradict.
 *
 * The final block ALSO protects the values referenceTables.ts's `salary-conversion-table` relies on
 * (convertSalary with unit:'annual', 40/5/52 over a fixed salary set), so the reference page stays
 * behaviourally unchanged after the migration.
 */

const STD = { hoursPerWeek: 40, daysPerWeek: 5, weeksPerYear: 52 } as const;
const input = (amount: number, unit: SalaryInput['unit'], over: Partial<SalaryInput> = {}): SalaryInput => ({
  amount,
  unit,
  ...STD,
  ...over,
});
/** The canonical "$52,000/yr on a standard schedule" equivalents set — every unit normalises to this. */
const FIFTY_TWO_K: SalaryResult = { annual: 52000, monthly: 4333.333333333333, biweekly: 2000, weekly: 1000, daily: 200, hourly: 25 };
const expectClose = (r: SalaryResult, e: SalaryResult) => {
  (Object.keys(e) as (keyof SalaryResult)[]).forEach((k) => expect(r[k]).toBeCloseTo(e[k], 6));
};

describe('salary: per-unit input normalises to the full equivalents set', () => {
  it('hourly 25 (× hpw × wpy)', () => expectClose(convertSalary(input(25, 'hourly')), FIFTY_TWO_K));
  it('daily 200 (× dpw × wpy)', () => expectClose(convertSalary(input(200, 'daily')), FIFTY_TWO_K));
  it('weekly 1000 (× wpy)', () => expectClose(convertSalary(input(1000, 'weekly')), FIFTY_TWO_K));
  it('biweekly 2000 (× 26, fixed)', () => expectClose(convertSalary(input(2000, 'biweekly')), FIFTY_TWO_K));
  it('annual 52000 (identity)', () => expectClose(convertSalary(input(52000, 'annual')), FIFTY_TWO_K));

  it('monthly 5000 (× 12, fixed) → annual 60000', () => {
    expectClose(convertSalary(input(5000, 'monthly')), {
      annual: 60000, monthly: 5000, biweekly: 2307.6923076923076, weekly: 1153.8461538461538, daily: 230.76923076923077, hourly: 28.846153846153847,
    });
  });
});

describe('salary: hourly ↔ annual round-trips', () => {
  it('hourly → annual', () => {
    expect(convertSalary(input(25, 'hourly')).annual).toBeCloseTo(52000, 6);
  });
  it('annual → hourly', () => {
    expect(convertSalary(input(52000, 'annual')).hourly).toBeCloseTo(25, 6);
  });
  it('biweekly normalises on the FIXED 26 (both ways)', () => {
    expect(convertSalary(input(2000, 'biweekly')).annual).toBeCloseTo(52000, 6); // 2000 × 26
    expect(convertSalary(input(52000, 'annual')).biweekly).toBeCloseTo(2000, 6); // 52000 / 26
  });
  it('monthly normalises on the FIXED 12 (both ways)', () => {
    expect(convertSalary(input(5000, 'monthly')).annual).toBeCloseTo(60000, 6); // 5000 × 12
    expect(convertSalary(input(60000, 'annual')).monthly).toBeCloseTo(5000, 6); // 60000 / 12
  });
});

describe('salary: custom schedule assumptions', () => {
  it('custom hoursPerWeek (30) scales the annual', () => {
    expect(convertSalary(input(25, 'hourly', { hoursPerWeek: 30 })).annual).toBeCloseTo(39000, 6);
  });
  it('custom daysPerWeek (4) scales a daily rate', () => {
    const r = convertSalary(input(200, 'daily', { daysPerWeek: 4 }));
    expect(r.annual).toBeCloseTo(41600, 6);
    expect(r.hourly).toBeCloseTo(20, 6);
  });
  it('custom weeksPerYear (50) scales the annual', () => {
    expect(convertSalary(input(25, 'hourly', { weeksPerYear: 50 })).annual).toBeCloseTo(50000, 6);
  });
});

describe('salary: zero / negative / decimal (as the formula computes them)', () => {
  it('a zero amount yields an all-zero result (a valid $0, not absent)', () => {
    expect(convertSalary(input(0, 'hourly'))).toEqual({ annual: 0, monthly: 0, biweekly: 0, weekly: 0, daily: 0, hourly: 0 });
  });
  it('a negative amount scales every equivalent negatively (source is not guarded)', () => {
    expectClose(convertSalary(input(-25, 'hourly')), { annual: -52000, monthly: -4333.333333333333, biweekly: -2000, weekly: -1000, daily: -200, hourly: -25 });
  });
  it('a decimal amount converts proportionally', () => {
    expect(convertSalary(input(25.5, 'hourly')).annual).toBeCloseTo(53040, 6);
  });
  it('a decimal assumption (hpw 37.5) converts proportionally', () => {
    expect(convertSalary(input(25, 'hourly', { hoursPerWeek: 37.5 })).annual).toBeCloseTo(48750, 6);
  });
});

describe('salary: division-by-zero guards', () => {
  it('hoursPerWeek = 0 guards hourly to 0 (others still derived from the annual)', () => {
    const r = convertSalary(input(52000, 'annual', { hoursPerWeek: 0 }));
    expect(r.hourly).toBe(0);
    expect(r.weekly).toBeCloseTo(1000, 6);
    expect(r.annual).toBe(52000);
  });
  it('daysPerWeek = 0 guards daily to 0', () => {
    const r = convertSalary(input(52000, 'annual', { daysPerWeek: 0 }));
    expect(r.daily).toBe(0);
    expect(r.hourly).toBeCloseTo(25, 6);
  });
  it('weeksPerYear = 0 guards weekly/daily/hourly to 0 (monthly/biweekly/annual still derived)', () => {
    const r = convertSalary(input(52000, 'annual', { weeksPerYear: 0 }));
    expect(r.weekly).toBe(0);
    expect(r.daily).toBe(0);
    expect(r.hourly).toBe(0);
    expect(r.monthly).toBeCloseTo(4333.333333333333, 6);
    expect(r.biweekly).toBe(2000);
    expect(r.annual).toBe(52000);
  });
  it('an hourly input with weeksPerYear = 0 collapses the annual (amt·hpw·0) to 0', () => {
    expect(convertSalary(input(25, 'hourly', { weeksPerYear: 0 }))).toEqual({ annual: 0, monthly: 0, biweekly: 0, weekly: 0, daily: 0, hourly: 0 });
  });
});

describe('salary: non-finite / coercion (the || 0 formula contract)', () => {
  it('a NaN amount coerces to 0 → all zero', () => {
    expect(convertSalary(input(Number.NaN, 'hourly'))).toEqual({ annual: 0, monthly: 0, biweekly: 0, weekly: 0, daily: 0, hourly: 0 });
  });
  it('an Infinity amount stays Infinity (truthy, not coerced) → non-finite outputs', () => {
    const r = convertSalary(input(Number.POSITIVE_INFINITY, 'hourly'));
    expect(Number.isFinite(r.annual)).toBe(false);
    expect(r.annual).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('salary: reference-table compatibility (referenceTables.ts salary-conversion-table)', () => {
  // referenceTables.ts computes convertSalary({ amount: annual, unit: 'annual', 40/5/52 }) over this
  // exact set and displays Annual / Hourly / Weekly / Biweekly / Monthly. Freeze those values so the
  // reference page stays behaviourally unchanged while salary.ts is frozen.
  const REF: Array<[number, Pick<SalaryResult, 'hourly' | 'weekly' | 'biweekly' | 'monthly'>]> = [
    [20000, { hourly: 9.615384615384617, weekly: 384.61538461538464, biweekly: 769.2307692307693, monthly: 1666.6666666666667 }],
    [30000, { hourly: 14.423076923076923, weekly: 576.9230769230769, biweekly: 1153.8461538461538, monthly: 2500 }],
    [40000, { hourly: 19.230769230769234, weekly: 769.2307692307693, biweekly: 1538.4615384615386, monthly: 3333.3333333333335 }],
    [50000, { hourly: 24.03846153846154, weekly: 961.5384615384615, biweekly: 1923.076923076923, monthly: 4166.666666666667 }],
    [60000, { hourly: 28.846153846153847, weekly: 1153.8461538461538, biweekly: 2307.6923076923076, monthly: 5000 }],
    [75000, { hourly: 36.05769230769231, weekly: 1442.3076923076924, biweekly: 2884.6153846153848, monthly: 6250 }],
    [100000, { hourly: 48.07692307692308, weekly: 1923.076923076923, biweekly: 3846.153846153846, monthly: 8333.333333333334 }],
    [150000, { hourly: 72.11538461538461, weekly: 2884.6153846153848, biweekly: 5769.2307692307695, monthly: 12500 }],
    [200000, { hourly: 96.15384615384616, weekly: 3846.153846153846, biweekly: 7692.307692307692, monthly: 16666.666666666668 }],
  ];
  it('every reference row matches the frozen convertSalary output', () => {
    for (const [annual, e] of REF) {
      const r = convertSalary({ amount: annual, unit: 'annual', ...STD });
      expect(r.annual).toBe(annual); // annual is an identity (drives the reference row label)
      expect(r.hourly).toBeCloseTo(e.hourly, 9);
      expect(r.weekly).toBeCloseTo(e.weekly, 9);
      expect(r.biweekly).toBeCloseTo(e.biweekly, 9);
      expect(r.monthly).toBeCloseTo(e.monthly, 9);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The pay-schedule table                                              */
/* ------------------------------------------------------------------ */

import {
  PERIODS_PER_YEAR,
  WEEKS_PER_YEAR,
  computePaySchedule,
  isUnadjustedFrequency,
  type PayFrequency,
  type PayScheduleInput,
} from './salary';

/**
 * Frozen against the published reference case: $50 an hour, 40 hours over 5 days, with
 * 10 holidays and 15 vacation days, gives $104,000 unadjusted and $94,000 adjusted.
 */
const REF: PayScheduleInput = {
  amount: 50,
  frequency: 'hourly',
  hoursPerWeek: 40,
  daysPerWeek: 5,
  holidaysPerYear: 10,
  vacationDaysPerYear: 15,
};
const sched = (over: Partial<PayScheduleInput> = {}) => computePaySchedule({ ...REF, ...over });
const money = (n: number) => Math.round(n * 100) / 100;

describe('the published reference table', () => {
  const r = sched();

  it('counts the year the way the reference counts it', () => {
    expect(WEEKS_PER_YEAR).toBe(52);
    expect(r.workDaysPerYear).toBe(260);
    expect(r.paidDaysPerYear).toBe(235);
    expect(r.hoursPerDay).toBe(8);
    expect(r.unsolvable).toBe(false);
  });

  it('prints every unadjusted figure the reference prints', () => {
    expect(money(r.unadjusted.hourly)).toBe(50);
    expect(money(r.unadjusted.daily)).toBe(400);
    expect(money(r.unadjusted.weekly)).toBe(2000);
    expect(money(r.unadjusted.biweekly)).toBe(4000);
    expect(Math.round(r.unadjusted.semimonthly)).toBe(4333);
    expect(Math.round(r.unadjusted.monthly)).toBe(8667);
    expect(money(r.unadjusted.quarterly)).toBe(26000);
    expect(money(r.unadjusted.annual)).toBe(104000);
  });

  it('prints every adjusted figure the reference prints', () => {
    expect(money(r.adjusted.hourly)).toBe(45.19);
    expect(money(r.adjusted.daily)).toBe(361.54);
    expect(Math.round(r.adjusted.weekly)).toBe(1808);
    expect(Math.round(r.adjusted.biweekly)).toBe(3615);
    expect(Math.round(r.adjusted.semimonthly)).toBe(3917);
    expect(Math.round(r.adjusted.monthly)).toBe(7833);
    expect(money(r.adjusted.quarterly)).toBe(23500);
    expect(money(r.adjusted.annual)).toBe(94000);
  });

  it('every row of a column is that column annual divided down', () => {
    for (const col of [r.unadjusted, r.adjusted]) {
      expect(money(col.quarterly * 4)).toBe(money(col.annual));
      expect(money(col.monthly * 12)).toBe(money(col.annual));
      expect(money(col.semimonthly * 24)).toBe(money(col.annual));
      expect(money(col.biweekly * 26)).toBe(money(col.annual));
      expect(money(col.weekly * 52)).toBe(money(col.annual));
      expect(money(col.daily * 260)).toBe(money(col.annual));
      expect(money(col.hourly * 2080)).toBe(money(col.annual));
    }
  });

  it('time off is the only difference between the columns', () => {
    expect(money(r.adjusted.annual)).toBe(money(r.unadjusted.daily * r.paidDaysPerYear));
    // No time off at all, and the two columns are the same table.
    const none = sched({ holidaysPerYear: 0, vacationDaysPerYear: 0 });
    expect(money(none.adjusted.annual)).toBe(money(none.unadjusted.annual));
  });
});

describe('which column the entered figure lands in', () => {
  it('an hourly or daily figure is pay for time worked', () => {
    expect(isUnadjustedFrequency('hourly')).toBe(true);
    expect(isUnadjustedFrequency('daily')).toBe(true);
    for (const f of ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annual'] as PayFrequency[]) {
      expect(isUnadjustedFrequency(f)).toBe(false);
    }
  });

  it('a daily entry gives the same table as the hourly one it equals', () => {
    const byDay = sched({ frequency: 'daily', amount: 400 });
    expect(money(byDay.unadjusted.annual)).toBe(104000);
    expect(money(byDay.adjusted.annual)).toBe(94000);
  });

  it('a salary entry is taken as already covering the time off', () => {
    // $94,000 a year IS the adjusted figure, so it must reproduce the reference case.
    const byYear = sched({ frequency: 'annual', amount: 94000 });
    expect(money(byYear.adjusted.annual)).toBe(94000);
    expect(money(byYear.unadjusted.annual)).toBe(104000);
    expect(money(byYear.unadjusted.hourly)).toBe(50);
  });

  it('round-trips through every salary frequency', () => {
    const periods = PERIODS_PER_YEAR;
    for (const [f, n] of Object.entries(periods) as [keyof typeof periods, number][]) {
      const r = sched({ frequency: f as PayFrequency, amount: 94000 / n });
      expect(money(r.adjusted.annual)).toBe(94000);
      expect(money(r.unadjusted.annual)).toBe(104000);
    }
  });
});

describe('schedules that do not describe a year', () => {
  it('refuses a week with no hours or no days', () => {
    expect(sched({ hoursPerWeek: 0 }).unsolvable).toBe(true);
    expect(sched({ daysPerWeek: 0 }).unsolvable).toBe(true);
  });

  it('refuses more time off than there are days to take', () => {
    expect(sched({ holidaysPerYear: 200, vacationDaysPerYear: 100 }).unsolvable).toBe(true);
    expect(sched({ holidaysPerYear: 260, vacationDaysPerYear: 0 }).unsolvable).toBe(true);
  });

  it('refuses a non-finite entry', () => {
    expect(sched({ amount: Number.NaN }).unsolvable).toBe(true);
    expect(sched({ hoursPerWeek: Number.POSITIVE_INFINITY }).unsolvable).toBe(true);
  });

  it('carries no figures to print by mistake when unsolvable', () => {
    const r = sched({ daysPerWeek: 0 });
    for (const col of [r.unadjusted, r.adjusted]) {
      for (const v of Object.values(col)) expect(Number.isNaN(v)).toBe(true);
    }
  });

  it('a zero amount is a real answer, not a failure', () => {
    const r = sched({ amount: 0 });
    expect(r.unsolvable).toBe(false);
    expect(r.unadjusted.annual).toBe(0);
    expect(r.adjusted.annual).toBe(0);
  });

  it('an odd but workable schedule still computes', () => {
    const r = sched({ hoursPerWeek: 37.5, daysPerWeek: 5 });
    expect(r.unsolvable).toBe(false);
    expect(r.hoursPerDay).toBe(7.5);
    expect(money(r.unadjusted.annual)).toBe(money(50 * 7.5 * 260));
  });
});
