import { describe, it, expect } from 'vitest';
import { federalHolidays, observed, observedHolidayDays, JUNETEENTH_FROM } from './us-holidays';
import { toISODateUTC } from './date-duration';

/**
 * The federal holiday set a business-day count skips. What is pinned here is the OBSERVED day —
 * the one people actually take off — because that is the day the count has to skip, and it is
 * the part that moves.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const on = (year: number, key: string) =>
  toISODateUTC(federalHolidays(year).find((h) => h.key === key)!.observed);
const statutory = (year: number, key: string) =>
  toISODateUTC(federalHolidays(year).find((h) => h.key === key)!.date);

describe('federalHolidays — the n-th weekday rules', () => {
  it('places the floating holidays where the statute puts them (2026)', () => {
    expect(on(2026, 'mlk-day')).toBe('2026-01-19'); // 3rd Monday of January
    expect(on(2026, 'washingtons-birthday')).toBe('2026-02-16'); // 3rd Monday of February
    expect(on(2026, 'memorial-day')).toBe('2026-05-25'); // last Monday of May
    expect(on(2026, 'labor-day')).toBe('2026-09-07'); // 1st Monday of September
    expect(on(2026, 'columbus-day')).toBe('2026-10-12'); // 2nd Monday of October
    expect(on(2026, 'thanksgiving')).toBe('2026-11-26'); // 4th Thursday of November
  });

  it('gets the last-Monday rule right when the month ends on a Monday', () => {
    expect(on(2027, 'memorial-day')).toBe('2027-05-31'); // May 31, 2027 is a Monday
  });

  it('lands every floating holiday on the weekday it is named for', () => {
    for (let y = 2000; y <= 2040; y += 1) {
      for (const h of federalHolidays(y)) {
        if (h.date.getTime() !== h.observed.getTime()) continue; // fixed-date, tested below
        const day = h.observed.getUTCDay();
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe('observed — a fixed-date holiday moves off the weekend', () => {
  it('moves a Saturday back to the Friday and a Sunday on to the Monday', () => {
    expect(toISODateUTC(observed(d('2027-07-04')))).toBe('2027-07-05'); // Sunday → Monday
    expect(toISODateUTC(observed(d('2026-07-04')))).toBe('2026-07-03'); // Saturday → Friday
  });
  it('leaves a weekday where it is', () => {
    expect(toISODateUTC(observed(d('2025-07-04')))).toBe('2025-07-04'); // a Friday
  });
  it('observes New Year’s Day falling on a Saturday in the PREVIOUS December', () => {
    expect(statutory(2028, 'new-years-day')).toBe('2028-01-01'); // a Saturday
    expect(on(2028, 'new-years-day')).toBe('2027-12-31');
  });
  it('observes Christmas on a Sunday on the Monday after', () => {
    expect(statutory(2033, 'christmas-day')).toBe('2033-12-25'); // a Sunday
    expect(on(2033, 'christmas-day')).toBe('2033-12-26');
  });
  it('never leaves an observed holiday on a weekend', () => {
    for (let y = 1990; y <= 2060; y += 1) {
      for (const h of federalHolidays(y)) {
        const day = h.observed.getUTCDay();
        expect([1, 2, 3, 4, 5]).toContain(day);
      }
    }
  });
});

describe('federalHolidays — the set itself', () => {
  it('counts eleven from 2021 and ten before, because Juneteenth was added then', () => {
    expect(federalHolidays(JUNETEENTH_FROM).length).toBe(11);
    expect(federalHolidays(JUNETEENTH_FROM - 1).length).toBe(10);
    expect(federalHolidays(2020).some((h) => h.key === 'juneteenth')).toBe(false);
    expect(federalHolidays(2021).some((h) => h.key === 'juneteenth')).toBe(true);
  });
  it('returns them in calendar order', () => {
    for (const y of [2019, 2024, 2026]) {
      const times = federalHolidays(y).map((h) => h.date.getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });
  it('has no duplicate keys', () => {
    const keys = federalHolidays(2026).map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('observedHolidayDays', () => {
  it('reaches a year either side, so a holiday observed across a year boundary is included', () => {
    // New Year's Day 2028 is observed on 2027-12-31; a 2028-only range must still know it.
    const days = observedHolidayDays(2028, 2028);
    expect(days.has(Math.round(d('2027-12-31').getTime() / 86_400_000))).toBe(true);
  });
  it('accepts the years in either order', () => {
    expect(observedHolidayDays(2020, 2026).size).toBe(observedHolidayDays(2026, 2020).size);
  });
});
