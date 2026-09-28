import { describe, it, expect } from 'vitest';
import {
  COMPOUND_FREQUENCIES,
  MAX_INTEREST_MONTHS,
  isContributionTiming,
  projectInterest,
  type InterestPlanInput,
} from './interest';

/**
 * Interest accumulation engine.
 *
 * The reference case below is the published worked example the calculator was built
 * to reproduce, and it is pinned to the cent — all seven result figures AND all five
 * schedule rows. It exercises the whole model: beginning-of-period contributions, the
 * initial investment's place in the first period's deposit column, the split of
 * interest between the initial sum and the contributions, and the inflation
 * adjustment. A change to any of them breaks a named figure rather than drifting.
 */

const BASE: InterestPlanInput = {
  initialInvestment: 20000,
  annualContribution: 5000,
  monthlyContribution: 0,
  contributeAt: 'beginning',
  annualRatePct: 5,
  compound: 'annually',
  years: 5,
  months: 0,
  taxRatePct: 0,
  inflationRatePct: 3,
};

const cents = (n: number) => Math.round(n * 100) / 100;

describe('projectInterest — the reference case, to the cent', () => {
  const r = projectInterest(BASE);

  it('reports all seven result figures', () => {
    expect(cents(r.endingBalance)).toBe(54535.2);
    expect(cents(r.totalPrincipal)).toBe(45000);
    expect(cents(r.totalContributions)).toBe(25000);
    expect(cents(r.totalInterest)).toBe(9535.2);
    expect(cents(r.interestOfInitial)).toBe(5525.63);
    expect(cents(r.interestOfContributions)).toBe(4009.56);
    expect(cents(r.buyingPower)).toBe(47042.54);
  });

  it('reconciles exactly: principal + interest === ending balance', () => {
    expect(r.totalPrincipal + r.totalInterest).toBeCloseTo(r.endingBalance, 6);
    expect(r.initialInvestment + r.totalContributions).toBeCloseTo(r.totalPrincipal, 6);
  });

  it('splits the interest exactly — the two parts re-sum to the total', () => {
    expect(r.interestOfInitial + r.interestOfContributions).toBeCloseTo(r.totalInterest, 6);
  });

  it('reproduces every row of the annual schedule', () => {
    // year, deposit, interest, ending balance
    const expected: readonly [number, number, number, number][] = [
      [1, 25000.0, 1250.0, 26250.0],
      [2, 5000.0, 1562.5, 32812.5],
      [3, 5000.0, 1890.63, 39703.13],
      [4, 5000.0, 2235.16, 46938.28],
      [5, 5000.0, 2596.91, 54535.2],
    ];
    expect(r.annual).toHaveLength(5);
    for (const [year, deposit, interest, balance] of expected) {
      const row = r.annual[year - 1];
      expect(row.year).toBe(year);
      expect(row.monthCount).toBe(12);
      expect(cents(row.deposit)).toBe(deposit);
      expect(cents(row.interest)).toBe(interest);
      expect(cents(row.balance)).toBe(balance);
    }
  });

  it('puts the initial investment in the first period, never in contributions', () => {
    expect(cents(r.annual[0].deposit)).toBe(25000);
    expect(cents(r.months[0].deposit)).toBe(25000); // month 1: initial + the annual contribution
    expect(r.totalContributions).toBeCloseTo(25000, 6);
  });

  it('carries a monthly schedule whose year-end balances match the annual one', () => {
    expect(r.months).toHaveLength(60);
    expect(r.termMonths).toBe(60);
    for (const y of r.annual) {
      expect(r.months[y.year * 12 - 1].balance).toBeCloseTo(y.balance, 6);
    }
  });

  it('sums each annual row from its own months', () => {
    for (const y of r.annual) {
      const own = r.months.filter((m) => m.year === y.year);
      expect(own).toHaveLength(y.monthCount);
      expect(own.reduce((s, m) => s + m.deposit, 0)).toBeCloseTo(y.deposit, 6);
      expect(own.reduce((s, m) => s + m.interest, 0)).toBeCloseTo(y.interest, 6);
    }
  });
});

describe('contribution timing', () => {
  it('beginning earns more than end, on identical money in', () => {
    const begin = projectInterest(BASE);
    const end = projectInterest({ ...BASE, contributeAt: 'end' });
    expect(cents(begin.endingBalance)).toBe(54535.2);
    expect(cents(end.endingBalance)).toBe(53153.79);
    // Exactly the same amount was paid in either way — only the timing differs.
    expect(end.totalPrincipal).toBeCloseTo(begin.totalPrincipal, 6);
    expect(cents(begin.totalInterest - end.totalInterest)).toBe(1381.41);
  });

  it('at the beginning, the contribution earns in the period it is paid', () => {
    const r = projectInterest({ ...BASE, years: 1 });
    // 20,000 + 5,000 both earn the full year: 25,000 x 5% = 1,250.
    expect(cents(r.annual[0].interest)).toBe(1250);
    expect(cents(r.endingBalance)).toBe(26250);
  });

  it('at the end, only the opening balance earns in the first period', () => {
    const r = projectInterest({ ...BASE, years: 1, contributeAt: 'end' });
    expect(cents(r.annual[0].interest)).toBe(1000); // 20,000 x 5%
    expect(cents(r.endingBalance)).toBe(26000);
  });

  it('timing makes no difference when there is nothing to contribute', () => {
    const begin = projectInterest({ ...BASE, annualContribution: 0, monthlyContribution: 0 });
    const end = projectInterest({
      ...BASE,
      annualContribution: 0,
      monthlyContribution: 0,
      contributeAt: 'end',
    });
    expect(end.endingBalance).toBeCloseTo(begin.endingBalance, 8);
  });

  it('names exactly the two timings', () => {
    expect(isContributionTiming('beginning')).toBe(true);
    expect(isContributionTiming('end')).toBe(true);
    expect(isContributionTiming('middle')).toBe(false);
    expect(isContributionTiming('')).toBe(false);
  });
});

describe('the interest split is exact, not apportioned', () => {
  it('holds across frequencies, timings and tax rates', () => {
    for (const compound of COMPOUND_FREQUENCIES) {
      for (const contributeAt of ['beginning', 'end'] as const) {
        for (const taxRatePct of [0, 15, 40]) {
          const r = projectInterest({ ...BASE, compound, contributeAt, taxRatePct });
          expect(r.interestOfInitial + r.interestOfContributions).toBeCloseTo(r.totalInterest, 6);
          expect(r.totalPrincipal + r.totalInterest).toBeCloseTo(r.endingBalance, 6);
        }
      }
    }
  });

  it('with no contributions, all the interest belongs to the initial investment', () => {
    const r = projectInterest({ ...BASE, annualContribution: 0, monthlyContribution: 0 });
    expect(r.interestOfContributions).toBeCloseTo(0, 6);
    expect(r.interestOfInitial).toBeCloseTo(r.totalInterest, 6);
  });

  it('with no initial investment, all the interest belongs to the contributions', () => {
    const r = projectInterest({ ...BASE, initialInvestment: 0 });
    expect(r.interestOfInitial).toBeCloseTo(0, 6);
    expect(r.interestOfContributions).toBeCloseTo(r.totalInterest, 6);
  });

  it('matches the initial investment projected entirely on its own', () => {
    const both = projectInterest(BASE);
    const alone = projectInterest({ ...BASE, annualContribution: 0, monthlyContribution: 0 });
    expect(both.interestOfInitial).toBeCloseTo(alone.totalInterest, 6);
  });
});

describe('monthly contributions', () => {
  it('are paid every month and counted in full', () => {
    const r = projectInterest({
      ...BASE,
      initialInvestment: 0,
      annualContribution: 0,
      monthlyContribution: 100,
      compound: 'monthly',
      years: 2,
    });
    expect(r.totalContributions).toBeCloseTo(2400, 6);
    expect(r.months).toHaveLength(24);
    expect(r.months[5].deposit).toBeCloseTo(100, 6);
  });

  it('at end-timing with monthly compounding, match the closed-form ordinary annuity', () => {
    const r = projectInterest({
      ...BASE,
      initialInvestment: 10000,
      annualContribution: 0,
      monthlyContribution: 300,
      contributeAt: 'end',
      annualRatePct: 5,
      compound: 'monthly',
      years: 10,
      months: 0,
      taxRatePct: 0,
    });
    const i = 0.05 / 12;
    const n = 120;
    const closed = 10000 * Math.pow(1 + i, n) + 300 * ((Math.pow(1 + i, n) - 1) / i);
    expect(r.endingBalance).toBeCloseTo(closed, 6);
  });

  it('at beginning-timing, the annuity is due — one period of extra growth', () => {
    const end = projectInterest({
      ...BASE,
      initialInvestment: 0,
      annualContribution: 0,
      monthlyContribution: 300,
      contributeAt: 'end',
      compound: 'monthly',
      years: 10,
    });
    const begin = projectInterest({
      ...BASE,
      initialInvestment: 0,
      annualContribution: 0,
      monthlyContribution: 300,
      contributeAt: 'beginning',
      compound: 'monthly',
      years: 10,
    });
    expect(begin.endingBalance).toBeCloseTo(end.endingBalance * (1 + 0.05 / 12), 6);
  });
});

describe('a term in years and months', () => {
  it('runs the exact number of months', () => {
    expect(projectInterest({ ...BASE, years: 5, months: 6 }).termMonths).toBe(66);
    expect(projectInterest({ ...BASE, years: 0, months: 7 }).termMonths).toBe(7);
    expect(projectInterest({ ...BASE, years: 2, months: 12 }).termMonths).toBe(36);
  });

  it('closes a short final year as its own row, flagged by its month count', () => {
    const r = projectInterest({ ...BASE, years: 5, months: 6 });
    expect(r.annual).toHaveLength(6);
    expect(r.annual[4].monthCount).toBe(12);
    expect(r.annual[5].monthCount).toBe(6);
    expect(r.annual[5].balance).toBeCloseTo(r.endingBalance, 6);
    expect(r.months).toHaveLength(66);
  });

  it('collects the final annual contribution only when it falls inside the term', () => {
    // Beginning-timing pays year 6's contribution in month 61, which the term reaches.
    const begin = projectInterest({ ...BASE, years: 5, months: 6 });
    expect(begin.totalContributions).toBeCloseTo(30000, 6);
    // End-timing would pay it in month 72, which the term never reaches.
    const end = projectInterest({ ...BASE, years: 5, months: 6, contributeAt: 'end' });
    expect(end.totalContributions).toBeCloseTo(25000, 6);
  });

  it('produces nothing at all for a term below one month', () => {
    for (const [years, months] of [
      [0, 0],
      [-3, 0],
      [0, -5],
    ]) {
      const r = projectInterest({ ...BASE, years, months });
      expect(r.termMonths).toBe(0);
      expect(r.months).toHaveLength(0);
      expect(r.annual).toHaveLength(0);
      expect(r.endingBalance).toBe(20000);
      expect(r.totalInterest).toBe(0);
      expect(r.interestOfInitial).toBe(0);
    }
  });

  it('caps the projection at 100 years', () => {
    const r = projectInterest({ ...BASE, years: 500, months: 0 });
    expect(r.termMonths).toBe(MAX_INTEREST_MONTHS);
    expect(r.months).toHaveLength(MAX_INTEREST_MONTHS);
    expect(Number.isFinite(r.endingBalance)).toBe(true);
  });
});

describe('tax', () => {
  it('reduces credited interest and still reconciles', () => {
    const taxed = projectInterest({ ...BASE, taxRatePct: 25 });
    const gross = projectInterest({ ...BASE, taxRatePct: 0 });
    expect(taxed.totalInterest).toBeLessThan(gross.totalInterest);
    expect(taxed.totalTax).toBeGreaterThan(0);
    expect(taxed.totalPrincipal + taxed.totalInterest).toBeCloseTo(taxed.endingBalance, 6);
  });

  it('compounds, so the loss exceeds a flat cut of the untaxed interest', () => {
    const gross = projectInterest({ ...BASE, taxRatePct: 0 });
    const taxed = projectInterest({ ...BASE, taxRatePct: 25 });
    expect(taxed.totalInterest).toBeLessThan(gross.totalInterest * 0.75);
  });

  it('a 100% rate leaves the principal alone', () => {
    const r = projectInterest({ ...BASE, taxRatePct: 100 });
    expect(r.totalInterest).toBeCloseTo(0, 8);
    expect(r.endingBalance).toBeCloseTo(r.totalPrincipal, 6);
  });

  it('is clamped to 0–100 rather than inverting the result', () => {
    expect(projectInterest({ ...BASE, taxRatePct: -50 }).totalInterest).toBeCloseTo(
      projectInterest({ ...BASE, taxRatePct: 0 }).totalInterest,
      6,
    );
    expect(projectInterest({ ...BASE, taxRatePct: 250 }).totalInterest).toBeCloseTo(0, 8);
  });
});

describe('inflation only answers the buying-power question', () => {
  it('never changes the balance itself', () => {
    const a = projectInterest({ ...BASE, inflationRatePct: 0 });
    const b = projectInterest({ ...BASE, inflationRatePct: 9 });
    expect(b.endingBalance).toBeCloseTo(a.endingBalance, 8);
    expect(b.totalInterest).toBeCloseTo(a.totalInterest, 8);
  });

  it('at zero inflation, buying power is the balance', () => {
    const r = projectInterest({ ...BASE, inflationRatePct: 0 });
    expect(r.buyingPower).toBeCloseTo(r.endingBalance, 8);
  });

  it('discounts by the full term, odd months included', () => {
    const r = projectInterest({ ...BASE, years: 5, months: 6 });
    expect(r.buyingPower).toBeCloseTo(r.endingBalance / Math.pow(1.03, 66 / 12), 6);
  });

  it('a higher rate buys less', () => {
    const low = projectInterest({ ...BASE, inflationRatePct: 2 });
    const high = projectInterest({ ...BASE, inflationRatePct: 6 });
    expect(high.buyingPower).toBeLessThan(low.buyingPower);
  });
});

describe('compounding frequency', () => {
  it('more frequent compounding never earns less', () => {
    let previous = 0;
    for (const compound of COMPOUND_FREQUENCIES) {
      const end = projectInterest({ ...BASE, compound }).endingBalance;
      expect(end).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = end;
    }
  });

  it('every figure stays finite across all nine frequencies at the cap', () => {
    for (const compound of COMPOUND_FREQUENCIES) {
      const r = projectInterest({ ...BASE, compound, years: 100, months: 0 });
      for (const v of [
        r.endingBalance,
        r.totalPrincipal,
        r.totalInterest,
        r.interestOfInitial,
        r.interestOfContributions,
        r.buyingPower,
        r.totalTax,
      ]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('zero and edge inputs', () => {
  it('an all-zero plan projects zero, with a full schedule of zeroes', () => {
    const r = projectInterest({
      ...BASE,
      initialInvestment: 0,
      annualContribution: 0,
      monthlyContribution: 0,
      annualRatePct: 0,
      inflationRatePct: 0,
    });
    expect(r.endingBalance).toBe(0);
    expect(r.buyingPower).toBe(0);
    expect(r.annual).toHaveLength(5);
    expect(r.months).toHaveLength(60);
  });

  it('a zero rate returns exactly what was paid in', () => {
    const r = projectInterest({ ...BASE, annualRatePct: 0 });
    expect(r.totalInterest).toBeCloseTo(0, 10);
    expect(r.endingBalance).toBeCloseTo(45000, 6);
  });

  it('clamps a negative initial investment to zero rather than projecting a debt', () => {
    const r = projectInterest({ ...BASE, initialInvestment: -5000 });
    expect(r.initialInvestment).toBe(0);
    expect(r.interestOfInitial).toBe(0);
  });
});
