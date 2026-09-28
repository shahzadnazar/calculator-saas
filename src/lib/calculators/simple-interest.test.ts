import { describe, it, expect } from 'vitest';
import {
  MAX_TERM_YEARS,
  UNITS_PER_YEAR,
  calculateSimpleInterest,
  isTimeUnit,
  solveSimpleInterest,
  type SimpleInterestInput,
} from './simple-interest';

/**
 * Simple interest, frozen against the published reference case: $20,000 at 3% a year
 * for 10 years earns $6,000 and ends at $26,000.
 *
 * The four modes are one formula rearranged, so the strongest check is that they agree
 * with each other: solving for any variable and feeding the answer back must return
 * the case you started from.
 */

const REF: SimpleInterestInput = {
  solveFor: 'balance',
  principal: 20000,
  endBalance: 0,
  ratePerUnitPct: 3,
  rateUnit: 'year',
  term: 10,
  termUnit: 'year',
};
const at = (over: Partial<SimpleInterestInput> = {}): SimpleInterestInput => ({ ...REF, ...over });
const money = (n: number) => Math.round(n * 100) / 100;

describe('the reference case', () => {
  const r = solveSimpleInterest(REF);

  it('earns the interest and reaches the balance the reference reports', () => {
    expect(money(r.interest)).toBe(6000);
    expect(money(r.endBalance)).toBe(26000);
    expect(r.unsolvable).toBe(false);
  });

  it('normalises the rate and term to years', () => {
    expect(r.annualRatePct).toBe(3);
    expect(r.termYears).toBe(10);
  });

  it('builds the published schedule — a flat $600 a year', () => {
    expect(r.schedule).toHaveLength(10);
    for (const row of r.schedule) expect(money(row.interest)).toBe(600);
    expect(r.schedule.map((y) => money(y.balance))).toEqual([
      20600, 21200, 21800, 22400, 23000, 23600, 24200, 24800, 25400, 26000,
    ]);
  });

  it('the schedule closes on the end balance', () => {
    expect(money(r.schedule[9].balance)).toBe(money(r.endBalance));
  });
});

describe('the four modes are one formula rearranged', () => {
  const balance = solveSimpleInterest(REF);

  it('solving for the principal returns the principal', () => {
    const r = solveSimpleInterest(at({ solveFor: 'principal', endBalance: balance.endBalance }));
    expect(money(r.principal)).toBe(20000);
    expect(money(r.solved)).toBe(20000);
  });

  it('solving for the term returns the term', () => {
    const r = solveSimpleInterest(at({ solveFor: 'term', endBalance: balance.endBalance }));
    expect(r.termYears).toBeCloseTo(10, 9);
    expect(r.solved).toBeCloseTo(10, 9);
  });

  it('solving for the rate returns the rate', () => {
    const r = solveSimpleInterest(at({ solveFor: 'rate', endBalance: balance.endBalance }));
    expect(r.annualRatePct).toBeCloseTo(3, 9);
    expect(r.solved).toBeCloseTo(3, 9);
  });

  it('every mode reports the same interest and balance for the same case', () => {
    const modes = (['principal', 'term', 'rate'] as const).map((solveFor) =>
      solveSimpleInterest(at({ solveFor, endBalance: 26000 })),
    );
    for (const r of modes) {
      expect(money(r.interest)).toBe(6000);
      expect(money(r.endBalance)).toBe(26000);
      expect(money(r.principal)).toBe(20000);
    }
  });

  it('solves the published inverse cases from a $30,000 balance', () => {
    const p = solveSimpleInterest(at({ solveFor: 'principal', endBalance: 30000 }));
    expect(money(p.solved)).toBe(23076.92);
    const t = solveSimpleInterest(at({ solveFor: 'term', endBalance: 30000 }));
    expect(t.solved).toBeCloseTo(16.6667, 4);
    const rate = solveSimpleInterest(at({ solveFor: 'rate', endBalance: 30000 }));
    expect(rate.solved).toBeCloseTo(5, 9);
  });
});

describe('units', () => {
  it('a rate per month is twelve times the rate per year', () => {
    const perMonth = solveSimpleInterest(at({ ratePerUnitPct: 0.25, rateUnit: 'month' }));
    expect(perMonth.annualRatePct).toBeCloseTo(3, 9);
    expect(money(perMonth.endBalance)).toBe(26000);
  });

  it('a term in months is the same term', () => {
    const inMonths = solveSimpleInterest(at({ term: 120, termUnit: 'month' }));
    expect(inMonths.termYears).toBeCloseTo(10, 9);
    expect(money(inMonths.endBalance)).toBe(26000);
  });

  it('a monthly rate against a term in years is not multiplied as it stands', () => {
    // The mistake this guards: 0.25 × 10 = 2.5% instead of the true 30%.
    const mixed = solveSimpleInterest(at({ ratePerUnitPct: 0.25, rateUnit: 'month', term: 10, termUnit: 'year' }));
    expect(money(mixed.interest)).toBe(6000);
    expect(money(mixed.interest)).not.toBe(500);
  });

  it('a solved term comes back in the unit it was asked for', () => {
    const r = solveSimpleInterest(at({ solveFor: 'term', endBalance: 26000, termUnit: 'month' }));
    expect(r.termYears).toBeCloseTo(10, 9);
    expect(r.solved).toBeCloseTo(120, 6);
  });

  it('a solved rate comes back in the unit it was quoted in', () => {
    const r = solveSimpleInterest(at({ solveFor: 'rate', endBalance: 26000, rateUnit: 'month' }));
    expect(r.annualRatePct).toBeCloseTo(3, 9);
    expect(r.solved).toBeCloseTo(0.25, 9);
  });

  it('weeks and days use the conventional counts', () => {
    expect(UNITS_PER_YEAR).toEqual({ year: 1, month: 12, week: 52, day: 365 });
    expect(isTimeUnit('week')).toBe(true);
    expect(isTimeUnit('fortnight')).toBe(false);
  });
});

describe('when there is no answer', () => {
  it('no rate leaves the term undetermined', () => {
    const r = solveSimpleInterest(at({ solveFor: 'term', endBalance: 26000, ratePerUnitPct: 0 }));
    expect(r.unsolvable).toBe(true);
  });

  it('no term leaves the rate undetermined', () => {
    const r = solveSimpleInterest(at({ solveFor: 'rate', endBalance: 26000, term: 0 }));
    expect(r.unsolvable).toBe(true);
  });

  it('a balance below the principal cannot come from a positive rate', () => {
    expect(solveSimpleInterest(at({ solveFor: 'term', endBalance: 15000 })).unsolvable).toBe(true);
    expect(solveSimpleInterest(at({ solveFor: 'rate', endBalance: 15000 })).unsolvable).toBe(true);
  });

  it('solving for a term or rate needs a principal to measure against', () => {
    expect(solveSimpleInterest(at({ solveFor: 'term', principal: 0, endBalance: 26000 })).unsolvable).toBe(true);
    expect(solveSimpleInterest(at({ solveFor: 'rate', principal: 0, endBalance: 26000 })).unsolvable).toBe(true);
  });

  it('a term beyond the cap is not an answer', () => {
    const r = solveSimpleInterest(at({ solveFor: 'term', endBalance: 1000000, ratePerUnitPct: 0.01 }));
    expect(r.unsolvable).toBe(true);
  });

  it('a non-finite input never produces a number', () => {
    expect(solveSimpleInterest(at({ principal: Number.NaN })).unsolvable).toBe(true);
    expect(solveSimpleInterest(at({ term: Number.POSITIVE_INFINITY })).unsolvable).toBe(true);
  });

  it('an unsolvable result carries no figures to print by mistake', () => {
    const r = solveSimpleInterest(at({ solveFor: 'rate', term: 0, endBalance: 26000 }));
    for (const v of [r.principal, r.endBalance, r.interest, r.solved]) expect(Number.isNaN(v)).toBe(true);
    expect(r.schedule).toEqual([]);
  });
});

describe('the shapes at the edges', () => {
  it('a zero rate earns nothing and ends where it started', () => {
    const r = solveSimpleInterest(at({ ratePerUnitPct: 0 }));
    expect(money(r.interest)).toBe(0);
    expect(money(r.endBalance)).toBe(20000);
    expect(r.schedule).toHaveLength(10);
  });

  it('a zero term earns nothing and has no schedule', () => {
    const r = solveSimpleInterest(at({ term: 0 }));
    expect(money(r.endBalance)).toBe(20000);
    expect(r.schedule).toEqual([]);
  });

  it('a part-year term gets a short final row', () => {
    const r = solveSimpleInterest(at({ term: 2.5 }));
    expect(r.schedule).toHaveLength(3);
    expect(money(r.schedule[2].interest)).toBe(300); // half of $600
    expect(money(r.schedule[2].balance)).toBe(money(r.endBalance));
  });

  it('a term right on the cap is still an answer', () => {
    const r = solveSimpleInterest(at({ term: MAX_TERM_YEARS }));
    expect(r.unsolvable).toBe(false);
    expect(r.schedule).toHaveLength(MAX_TERM_YEARS);
  });

  it('the classic forward form still works for callers that only want it', () => {
    expect(calculateSimpleInterest(20000, 3, 10)).toEqual({ interest: 6000, total: 26000 });
    expect(calculateSimpleInterest(-100, 5, 1).interest).toBe(0);
  });
});
