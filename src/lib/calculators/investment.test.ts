import { describe, it, expect } from 'vitest';
import { calculateInvestment, type InvestmentInput } from './investment';

/**
 * Investment growth, frozen against the published reference case: $20,000 growing at
 * 6% compounded annually for ten years, with $1,000 added at the end of every month,
 * ends at $198,290.40 — and every year of the schedule matches to the cent.
 *
 * The schedule is the strong check. Any projection can be tuned to land on one end
 * balance; reproducing ten years of interest figures pins the compounding convention,
 * the contribution timing and the order the two are applied in.
 */

const REF: InvestmentInput = {
  startingAmount: 20000,
  years: 10,
  annualReturnPct: 6,
  compound: 'annually',
  contribution: 1000,
  contributeAt: 'end',
  contributeEvery: 'month',
};
const at = (over: Partial<InvestmentInput> = {}): InvestmentInput => ({ ...REF, ...over });
const money = (n: number) => Math.round(n * 100) / 100;

describe('the reference case', () => {
  const r = calculateInvestment(REF);

  it('ends where the reference says it does', () => {
    expect(money(r.endBalance)).toBe(198290.4);
  });

  it('splits the end balance into the three things that made it', () => {
    expect(money(r.startingAmount)).toBe(20000);
    expect(money(r.totalContributions)).toBe(120000);
    expect(money(r.totalInterest)).toBe(58290.4);
  });

  it('the three parts add back to the end balance exactly', () => {
    expect(r.startingAmount + r.totalContributions + r.totalInterest).toBeCloseTo(r.endBalance, 9);
  });

  it('reproduces the published annual schedule to the cent', () => {
    const rows = r.annual.slice(0, 6).map((y) => [money(y.deposit), money(y.interest), money(y.balance)]);
    expect(rows).toEqual([
      [32000, 1526.53, 33526.53],
      [12000, 2338.12, 47864.65],
      [12000, 3198.41, 63063.06],
      [12000, 4110.31, 79173.37],
      [12000, 5076.93, 96250.3],
      [12000, 6101.55, 114351.84],
    ]);
  });

  it('folds the starting amount into the first year’s deposit, and only the first', () => {
    expect(money(r.annual[0].deposit)).toBe(32000); // 20,000 + 12 × 1,000
    for (const y of r.annual.slice(1)) expect(money(y.deposit)).toBe(12000);
  });

  it('carries both views of one projection', () => {
    expect(r.annual).toHaveLength(10);
    expect(r.monthly).toHaveLength(120);
    // The last month and the last year close on the same balance.
    expect(r.monthly[119].balance).toBeCloseTo(r.annual[9].balance, 9);
    expect(r.annual[9].balance).toBeCloseTo(r.endBalance, 9);
  });

  it('every year sums the twelve months inside it', () => {
    for (const [i, year] of r.annual.entries()) {
      const slice = r.monthly.slice(i * 12, i * 12 + 12);
      expect(year.interest).toBeCloseTo(slice.reduce((s, m) => s + m.interest, 0), 9);
      expect(year.deposit).toBeCloseTo(slice.reduce((s, m) => s + m.deposit, 0), 9);
    }
  });

  it('the balance never falls with a positive return', () => {
    let previous = 0;
    for (const m of r.monthly) {
      expect(m.balance).toBeGreaterThan(previous);
      previous = m.balance;
    }
  });
});

describe('contribution timing', () => {
  it('contributing at the beginning beats contributing at the end', () => {
    const end = calculateInvestment(REF);
    const beginning = calculateInvestment(at({ contributeAt: 'beginning' }));
    expect(beginning.endBalance).toBeGreaterThan(end.endBalance);
    // Same money in, so the whole difference is growth.
    expect(beginning.totalContributions).toBe(end.totalContributions);
    expect(beginning.totalInterest).toBeGreaterThan(end.totalInterest);
  });

  it('a beginning-of-month deposit earns one extra month of growth', () => {
    // The gap is the growth on each deposit over a single month, compounded on.
    const end = calculateInvestment(REF);
    const beginning = calculateInvestment(at({ contributeAt: 'beginning' }));
    const gap = beginning.endBalance - end.endBalance;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(end.totalInterest * 0.1);
  });

  it('contributing yearly pays in the same total but earns less than monthly', () => {
    const monthly = calculateInvestment(at({ contribution: 1000, contributeEvery: 'month' }));
    const yearly = calculateInvestment(at({ contribution: 12000, contributeEvery: 'year' }));
    expect(money(yearly.totalContributions)).toBe(money(monthly.totalContributions));
    // Waiting until the year's end to deposit $12,000 loses growth against
    // dripping $1,000 in every month.
    expect(yearly.endBalance).toBeLessThan(monthly.endBalance);
  });

  it('a yearly contribution lands once a year, at the end it is the twelfth month', () => {
    const r = calculateInvestment(at({ contribution: 12000, contributeEvery: 'year' }));
    // Month 1 carries only the starting amount; month 12 carries the contribution.
    expect(money(r.monthly[0].deposit)).toBe(20000);
    expect(money(r.monthly[11].deposit)).toBe(12000);
    expect(money(r.monthly[1].deposit)).toBe(0);
    expect(money(r.annual[0].deposit)).toBe(32000);
  });

  it('a yearly contribution at the beginning lands in the first month', () => {
    const r = calculateInvestment(at({ contribution: 12000, contributeEvery: 'year', contributeAt: 'beginning' }));
    expect(money(r.monthly[0].deposit)).toBe(32000); // starting amount + the year's contribution
    expect(money(r.monthly[11].deposit)).toBe(0);
  });
});

describe('compounding frequency', () => {
  it('more frequent compounding ends higher, on the same contributions', () => {
    const annually = calculateInvestment(REF);
    const monthly = calculateInvestment(at({ compound: 'monthly' }));
    const daily = calculateInvestment(at({ compound: 'daily' }));
    expect(monthly.endBalance).toBeGreaterThan(annually.endBalance);
    expect(daily.endBalance).toBeGreaterThan(monthly.endBalance);
    expect(money(daily.totalContributions)).toBe(money(annually.totalContributions));
  });

  it('continuous compounding is the ceiling', () => {
    const daily = calculateInvestment(at({ compound: 'daily' }));
    const continuous = calculateInvestment(at({ compound: 'continuously' }));
    expect(continuous.endBalance).toBeGreaterThanOrEqual(daily.endBalance);
  });
});

describe('the shapes at the edges', () => {
  it('a zero return grows by contributions alone', () => {
    const r = calculateInvestment(at({ annualReturnPct: 0 }));
    expect(money(r.endBalance)).toBe(140000);
    expect(money(r.totalInterest)).toBe(0);
  });

  it('no contributions is a plain lump sum', () => {
    const r = calculateInvestment(at({ contribution: 0 }));
    expect(money(r.totalContributions)).toBe(0);
    // $20,000 at 6% compounded annually for ten years.
    expect(money(r.endBalance)).toBe(money(20000 * Math.pow(1.06, 10)));
  });

  it('no starting amount is contributions alone', () => {
    const r = calculateInvestment(at({ startingAmount: 0 }));
    expect(r.startingAmount).toBe(0);
    expect(money(r.annual[0].deposit)).toBe(12000);
    expect(r.endBalance).toBeGreaterThan(120000);
  });

  it('a negative return shrinks the balance without going non-finite', () => {
    const r = calculateInvestment(at({ annualReturnPct: -5, contribution: 0 }));
    expect(r.endBalance).toBeLessThan(20000);
    expect(r.endBalance).toBeGreaterThan(0);
    expect(r.totalInterest).toBeLessThan(0);
    expect(Number.isFinite(r.endBalance)).toBe(true);
  });

  it('a zero term is the starting amount and nothing else', () => {
    const r = calculateInvestment(at({ years: 0 }));
    expect(r.endBalance).toBe(20000);
    expect(r.monthly).toHaveLength(0);
    expect(r.annual).toHaveLength(0);
    expect(r.totalInterest).toBe(0);
  });

  it('a part-year term still closes its final year row', () => {
    const r = calculateInvestment(at({ years: 1.5 }));
    expect(r.monthly).toHaveLength(18);
    expect(r.annual).toHaveLength(2);
    expect(r.annual[1].balance).toBeCloseTo(r.endBalance, 9);
    // The short final year sums only the months it actually has.
    expect(money(r.annual[1].deposit)).toBe(6000);
  });

  it('negative inputs are floored rather than propagated', () => {
    const r = calculateInvestment(at({ startingAmount: -100, contribution: -50 }));
    expect(r.startingAmount).toBe(0);
    expect(r.totalContributions).toBe(0);
    expect(Number.isFinite(r.endBalance)).toBe(true);
  });
});
