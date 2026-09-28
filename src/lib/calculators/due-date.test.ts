import { describe, it, expect } from 'vitest';
import {
  dueDateFromLMP,
  conceptionFromLMP,
  gestationalAge,
  milestones,
  lmpFromCycle,
  lmpFromConception,
  lmpFromUltrasound,
  lmpFromIvfTransfer,
  GESTATION_DAYS,
  CONCEPTION_TO_BIRTH_DAYS,
  REFERENCE_CYCLE_DAYS,
  CYCLE_MIN,
  CYCLE_MAX,
  DATING_METHODS,
  EMBRYO_AGES,
} from './due-date';

/**
 * UTC midnight throughout, because that is how the calculators hold dates: `addDays` is
 * epoch arithmetic, and only in UTC is every day exactly 86,400,000 ms. Testing in local
 * time would pass here and drift across a daylight-saving boundary elsewhere.
 */
const d = (iso: string) => {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
};
const iso = (x: Date) =>
  `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;

describe('the four dating methods all land on the same rule', () => {
  it('offers the reference’s four, in its order', () => {
    expect(DATING_METHODS.map((m) => m.label)).toEqual([
      'Last Period',
      'Conception Date',
      'Ultrasound',
      'IVF Transfer Date',
    ]);
  });

  it('Last Period: 280 days after the LMP', () => {
    expect(iso(dueDateFromLMP(d('2026-01-01')))).toBe('2026-10-08');
    expect(GESTATION_DAYS).toBe(280);
  });

  it('Conception Date: 266 days after conception, which is the same due date', () => {
    const lmp = d('2026-01-01');
    const conception = conceptionFromLMP(lmp);
    expect(iso(conception)).toBe('2026-01-15');
    expect(iso(dueDateFromLMP(lmpFromConception(conception)))).toBe(iso(dueDateFromLMP(lmp)));
    expect(GESTATION_DAYS - 14).toBe(CONCEPTION_TO_BIRTH_DAYS);
  });

  it('Ultrasound: the LMP is worked backwards from the age the scan reports', () => {
    // A scan on 1 March saying 12 weeks 3 days puts the LMP 87 days earlier.
    const lmp = lmpFromUltrasound(d('2026-03-01'), 12, 3);
    expect(iso(lmp)).toBe('2025-12-04');
    expect(gestationalAge(lmp, d('2026-03-01'))).toMatchObject({ weeks: 12, days: 3 });
  });

  it('IVF: a 3-day transfer is 263 days out, a 5-day transfer 261', () => {
    const transfer = d('2026-01-01');
    const day3 = dueDateFromLMP(lmpFromIvfTransfer(transfer, 3));
    const day5 = dueDateFromLMP(lmpFromIvfTransfer(transfer, 5));
    expect(Math.round((day3.getTime() - transfer.getTime()) / 86_400_000)).toBe(263);
    expect(Math.round((day5.getTime() - transfer.getTime()) / 86_400_000)).toBe(261);
    // The older embryo is further along, so it is due sooner.
    expect(day5.getTime()).toBeLessThan(day3.getTime());
    expect(EMBRYO_AGES.map((e) => e.value)).toEqual([3, 5]);
  });
});

describe('cycle length', () => {
  it('leaves a textbook cycle exactly where it was', () => {
    expect(iso(lmpFromCycle(d('2026-01-01'), REFERENCE_CYCLE_DAYS))).toBe('2026-01-01');
  });

  it('pushes a long cycle later and pulls a short one earlier, day for day', () => {
    // A 35-day cycle ovulates a week late, so the pregnancy is a week younger.
    expect(iso(lmpFromCycle(d('2026-01-01'), 35))).toBe('2026-01-08');
    expect(iso(lmpFromCycle(d('2026-01-01'), 21))).toBe('2025-12-25');
  });

  it('moves the due date by exactly the same number of days', () => {
    const base = dueDateFromLMP(d('2026-01-01'));
    const long = dueDateFromLMP(lmpFromCycle(d('2026-01-01'), 35));
    expect(Math.round((long.getTime() - base.getTime()) / 86_400_000)).toBe(7);
  });

  it('falls back to the reference cycle rather than shifting by a nonsense one', () => {
    expect(iso(lmpFromCycle(d('2026-01-01'), Number.NaN))).toBe('2026-01-01');
    expect(iso(lmpFromCycle(d('2026-01-01'), 0))).toBe('2026-01-01');
  });

  it('publishes the span it accepts', () => {
    expect([CYCLE_MIN, CYCLE_MAX]).toEqual([20, 45]);
  });
});

describe('gestational age', () => {
  const lmp = d('2026-01-01');

  it('counts whole weeks and days from the LMP', () => {
    expect(gestationalAge(lmp, d('2026-01-01'))).toMatchObject({ weeks: 0, days: 0, trimester: 1 });
    expect(gestationalAge(lmp, d('2026-02-05'))).toMatchObject({ weeks: 5, days: 0 });
    expect(gestationalAge(lmp, d('2026-02-08'))).toMatchObject({ weeks: 5, days: 3 });
  });

  it('places the trimester boundaries at 13 and 27 weeks', () => {
    expect(gestationalAge(lmp, milestones(lmp)[2].date).trimester).toBe(2);
    expect(gestationalAge(lmp, milestones(lmp)[3].date).trimester).toBe(3);
    expect(gestationalAge(lmp, addDays(lmp, 12 * 7 + 6)).trimester).toBe(1);
  });

  it('never runs backwards or past the end', () => {
    expect(gestationalAge(lmp, d('2025-06-01')).totalDays).toBe(0);
    const past = gestationalAge(lmp, d('2027-06-01'));
    expect(past.progressPct).toBe(100);
    expect(past.daysRemaining).toBe(0);
  });
});

describe('milestones', () => {
  const lmp = d('2026-01-01');
  const m = milestones(lmp);

  it('lists the pregnancy in order, from the LMP to the due date', () => {
    expect(m.map((x) => x.label)).toEqual([
      'Last menstrual period',
      'Estimated conception',
      'Second trimester begins',
      'Third trimester begins',
      'Full term begins',
      'Estimated due date',
    ]);
    for (let i = 1; i < m.length; i++) {
      expect(m[i].date.getTime()).toBeGreaterThan(m[i - 1].date.getTime());
    }
  });

  it('quotes each one at its conventional week', () => {
    expect(m.map((x) => x.weeks)).toEqual([0, 2, 13, 27, 39, 40]);
  });

  it('the due-date milestone is the due date', () => {
    expect(iso(m[5].date)).toBe(iso(dueDateFromLMP(lmp)));
  });
});

// Epoch arithmetic, matching the shared primitive exactly.
function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}
