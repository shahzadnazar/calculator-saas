import { describe, it, expect } from 'vitest';
import {
  COMPOUND_FREQUENCIES,
  COMPOUND_PERIODS,
  MAX_SAVINGS_YEARS,
  isCompoundFrequency,
  monthlyGrowthFactor,
  projectSavingsPlan,
  requiredMonthlyForGoal,
  type CompoundFrequency,
  type SavingsPlanInput,
} from './savings';

/**
 * Savings accumulation engine.
 *
 * The reference case below is the published worked example the calculator was built
 * to reproduce, and it is pinned to the cent — all four summary figures AND all ten
 * schedule rows. It is the regression sentinel for the whole model: the end-of-period
 * contribution rule, the once-a-year increase step and the opening deposit's place in
 * the first period's deposit column are all observable in it, so a change to any of
 * them breaks a named row rather than drifting quietly.
 */

const BASE: SavingsPlanInput = {
  initialDeposit: 20000,
  annualContribution: 5000,
  annualIncreasePct: 3,
  monthlyContribution: 0,
  monthlyIncreasePct: 0,
  annualRatePct: 3,
  compound: 'annually',
  years: 10,
  taxRatePct: 0,
};

describe('projectSavingsPlan — the reference case, to the cent', () => {
  const r = projectSavingsPlan(BASE);

  it('reports the four summary figures', () => {
    expect(r.endBalance).toBeCloseTo(92116.99, 2);
    expect(r.initialDeposit).toBe(20000);
    expect(r.totalContributions).toBeCloseTo(57319.4, 2);
    expect(r.totalInterest).toBeCloseTo(14797.59, 2);
  });

  it('reconciles exactly: initial + contributions + interest === end balance', () => {
    expect(r.initialDeposit + r.totalContributions + r.totalInterest).toBeCloseTo(r.endBalance, 6);
  });

  it('reproduces every row of the annual schedule', () => {
    // year, deposit, interest, ending balance
    const expected: readonly [number, number, number, number][] = [
      [1, 25000.0, 600.0, 25600.0],
      [2, 5150.0, 768.0, 31518.0],
      [3, 5304.5, 945.54, 37768.04],
      [4, 5463.64, 1133.04, 44364.72],
      [5, 5627.54, 1330.94, 51323.2],
      [6, 5796.37, 1539.7, 58659.27],
      [7, 5970.26, 1759.78, 66389.31],
      [8, 6149.37, 1991.68, 74530.36],
      [9, 6333.85, 2235.91, 83100.12],
      [10, 6523.87, 2493.0, 92116.99],
    ];
    // Compared at the cent the table actually prints: year 4's deposit is
    // 5,000 x 1.03^3 = 5463.635 exactly, which the published row shows as 5463.64.
    const cents = (n: number) => Math.round(n * 100) / 100;
    expect(r.annual).toHaveLength(10);
    for (const [year, deposit, interest, balance] of expected) {
      const row = r.annual[year - 1];
      expect(row.year).toBe(year);
      expect(cents(row.deposit)).toBe(deposit);
      expect(cents(row.interest)).toBe(interest);
      expect(cents(row.balance)).toBe(balance);
    }
  });

  it('puts the opening deposit in the first period, and never in total contributions', () => {
    // Year 1 deposit is the $20,000 opening balance plus the $5,000 annual contribution.
    expect(r.annual[0].deposit).toBeCloseTo(25000, 2);
    // ...but only the contribution is counted as contributed.
    expect(r.totalContributions).toBeCloseTo(57319.4, 2);
    expect(r.months[0].deposit).toBeCloseTo(20000, 2); // month 1: the opening deposit alone
  });

  it('carries a monthly schedule whose year-end balances match the annual one', () => {
    expect(r.months).toHaveLength(120);
    for (const y of r.annual) {
      expect(r.months[y.year * 12 - 1].balance).toBeCloseTo(y.balance, 6);
    }
  });

  it('sums each annual row from its own twelve months', () => {
    for (const y of r.annual) {
      const own = r.months.filter((m) => m.year === y.year);
      expect(own).toHaveLength(12);
      expect(own.reduce((s, m) => s + m.deposit, 0)).toBeCloseTo(y.deposit, 6);
      expect(own.reduce((s, m) => s + m.interest, 0)).toBeCloseTo(y.interest, 6);
    }
  });
});

describe('the end-of-period contribution rule', () => {
  it('the annual contribution earns nothing in the year it is paid', () => {
    // One year, one annual contribution: it lands as the year closes, so the only
    // interest is the opening deposit's.
    const r = projectSavingsPlan({ ...BASE, years: 1, annualIncreasePct: 0 });
    expect(r.annual[0].interest).toBeCloseTo(600, 6); // 20,000 × 3%, not 25,000 × 3%
    expect(r.endBalance).toBeCloseTo(25600, 6);
  });

  it('a monthly contribution earns nothing in the month it is paid', () => {
    const r = projectSavingsPlan({
      ...BASE,
      initialDeposit: 0,
      annualContribution: 0,
      monthlyContribution: 100,
      compound: 'monthly',
      years: 1,
    });
    // First month: no opening balance, so no interest at all.
    expect(r.months[0].interest).toBeCloseTo(0, 10);
    expect(r.months[0].balance).toBeCloseTo(100, 10);
    // Second month: interest on the first deposit only.
    expect(r.months[1].interest).toBeCloseTo(100 * (0.03 / 12), 10);
  });

  it('matches the closed-form ordinary annuity when compounding is monthly', () => {
    const r = projectSavingsPlan({
      initialDeposit: 10000,
      annualContribution: 0,
      annualIncreasePct: 0,
      monthlyContribution: 300,
      monthlyIncreasePct: 0,
      annualRatePct: 5,
      compound: 'monthly',
      years: 10,
      taxRatePct: 0,
    });
    const i = 0.05 / 12;
    const n = 120;
    const closed = 10000 * Math.pow(1 + i, n) + 300 * ((Math.pow(1 + i, n) - 1) / i);
    expect(r.endBalance).toBeCloseTo(closed, 6);
  });
});

describe('the increase rates step once a year', () => {
  it('the annual contribution rises by its increase each year', () => {
    const r = projectSavingsPlan({ ...BASE, years: 3 });
    // 5,000 → 5,150 → 5,304.50, each landing in month 12 of its own year.
    expect(r.months[11].deposit).toBeCloseTo(5000, 6);
    expect(r.months[23].deposit).toBeCloseTo(5150, 6);
    expect(r.months[35].deposit).toBeCloseTo(5304.5, 6);
    // The opening deposit sits in month 1, which is why year 1's row reads 25,000.
    expect(r.months[0].deposit).toBeCloseTo(20000, 6);
    expect(r.annual[0].deposit).toBeCloseTo(25000, 6);
  });

  it('the monthly contribution holds flat within a year and steps at the year boundary', () => {
    const r = projectSavingsPlan({
      ...BASE,
      initialDeposit: 0,
      annualContribution: 0,
      monthlyContribution: 200,
      monthlyIncreasePct: 10,
      years: 2,
    });
    for (let m = 0; m < 12; m++) expect(r.months[m].deposit).toBeCloseTo(200, 6);
    for (let m = 12; m < 24; m++) expect(r.months[m].deposit).toBeCloseTo(220, 6);
    expect(r.totalContributions).toBeCloseTo(12 * 200 + 12 * 220, 6);
  });

  it('a zero increase leaves every year identical', () => {
    const r = projectSavingsPlan({ ...BASE, annualIncreasePct: 0, years: 5 });
    expect(r.totalContributions).toBeCloseTo(5 * 5000, 6);
  });
});

describe('tax is charged on interest as it is earned', () => {
  it('reduces credited interest by the tax rate and still reconciles', () => {
    const gross = projectSavingsPlan({ ...BASE, taxRatePct: 0 });
    const taxed = projectSavingsPlan({ ...BASE, taxRatePct: 25 });
    expect(taxed.totalInterest).toBeLessThan(gross.totalInterest);
    expect(taxed.totalTax).toBeGreaterThan(0);
    // The identity that lets the result panel show four lines that add up.
    expect(taxed.initialDeposit + taxed.totalContributions + taxed.totalInterest).toBeCloseTo(
      taxed.endBalance,
      6,
    );
  });

  it('taxes each period, so the loss compounds — it is more than a flat cut of the gross', () => {
    const gross = projectSavingsPlan({ ...BASE, taxRatePct: 0 });
    const taxed = projectSavingsPlan({ ...BASE, taxRatePct: 25 });
    // A flat 25% off the untaxed interest would leave this much...
    const naive = gross.totalInterest * 0.75;
    // ...but taxing as you go also removes the growth that tax would have earned.
    expect(taxed.totalInterest).toBeLessThan(naive);
  });

  it('a 100% tax rate leaves contributions only', () => {
    const r = projectSavingsPlan({ ...BASE, taxRatePct: 100 });
    expect(r.totalInterest).toBeCloseTo(0, 8);
    expect(r.endBalance).toBeCloseTo(20000 + r.totalContributions, 6);
  });

  it('clamps a tax rate outside 0–100 rather than inverting the result', () => {
    expect(projectSavingsPlan({ ...BASE, taxRatePct: -50 }).totalInterest).toBeCloseTo(
      projectSavingsPlan({ ...BASE, taxRatePct: 0 }).totalInterest,
      6,
    );
    expect(projectSavingsPlan({ ...BASE, taxRatePct: 250 }).totalInterest).toBeCloseTo(0, 8);
  });
});

describe('monthlyGrowthFactor — one factor per frequency', () => {
  it('is 1 when the rate is zero, whatever the frequency', () => {
    for (const f of COMPOUND_FREQUENCIES) expect(monthlyGrowthFactor(0, f)).toBeCloseTo(1, 12);
  });

  it('compounds to the stated annual factor over twelve months', () => {
    for (const f of COMPOUND_FREQUENCIES) {
      if (f === 'continuously') continue;
      const n = COMPOUND_PERIODS[f];
      expect(Math.pow(monthlyGrowthFactor(6, f), 12)).toBeCloseTo(Math.pow(1 + 0.06 / n, n), 10);
    }
  });

  it('continuous compounding is the limit, just above daily', () => {
    expect(Math.pow(monthlyGrowthFactor(6, 'continuously'), 12)).toBeCloseTo(Math.exp(0.06), 10);
    expect(monthlyGrowthFactor(6, 'continuously')).toBeGreaterThan(monthlyGrowthFactor(6, 'daily'));
  });

  it('more frequent compounding never earns less', () => {
    let previous = 0;
    for (const f of COMPOUND_FREQUENCIES) {
      const end = projectSavingsPlan({ ...BASE, compound: f }).endBalance;
      expect(end).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = end;
    }
  });

  it('names exactly the nine options the selector offers', () => {
    expect(COMPOUND_FREQUENCIES).toHaveLength(9);
    for (const f of COMPOUND_FREQUENCIES) expect(isCompoundFrequency(f)).toBe(true);
    expect(isCompoundFrequency('fortnightly')).toBe(false);
    expect(isCompoundFrequency('')).toBe(false);
  });
});

describe('negative deposits and withdrawals', () => {
  it('accepts a negative opening balance and reports it as a debt that grows', () => {
    const r = projectSavingsPlan({
      ...BASE,
      initialDeposit: -1000,
      annualContribution: 0,
      years: 1,
    });
    expect(r.endBalance).toBeCloseTo(-1030, 6);
    expect(r.totalInterest).toBeCloseTo(-30, 6);
  });

  it('treats a negative monthly contribution as a withdrawal', () => {
    const r = projectSavingsPlan({
      ...BASE,
      annualContribution: 0,
      monthlyContribution: -100,
      compound: 'monthly',
      years: 1,
    });
    expect(r.totalContributions).toBeCloseTo(-1200, 6);
    expect(r.endBalance).toBeLessThan(20000);
    expect(r.initialDeposit + r.totalContributions + r.totalInterest).toBeCloseTo(r.endBalance, 6);
  });

  it('a withdrawal that empties the account carries the balance negative rather than clamping', () => {
    const r = projectSavingsPlan({
      ...BASE,
      initialDeposit: 1000,
      annualContribution: 0,
      monthlyContribution: -500,
      annualRatePct: 0,
      years: 1,
    });
    expect(r.endBalance).toBeCloseTo(1000 - 6000, 6);
  });
});

describe('edges and bounds', () => {
  it('an all-zero plan projects zero, with a full schedule of zeroes', () => {
    const r = projectSavingsPlan({
      initialDeposit: 0,
      annualContribution: 0,
      annualIncreasePct: 0,
      monthlyContribution: 0,
      monthlyIncreasePct: 0,
      annualRatePct: 0,
      compound: 'annually',
      years: 5,
      taxRatePct: 0,
    });
    expect(r.endBalance).toBe(0);
    expect(r.annual).toHaveLength(5);
    expect(r.months).toHaveLength(60);
  });

  it('a zero rate returns exactly what was paid in', () => {
    const r = projectSavingsPlan({ ...BASE, annualRatePct: 0, annualIncreasePct: 0 });
    expect(r.totalInterest).toBeCloseTo(0, 10);
    expect(r.endBalance).toBeCloseTo(20000 + 10 * 5000, 6);
  });

  it('a term below one year produces no schedule at all', () => {
    for (const years of [0, -3, 0.5]) {
      const r = projectSavingsPlan({ ...BASE, years });
      expect(r.annual).toHaveLength(0);
      expect(r.months).toHaveLength(0);
      expect(r.endBalance).toBe(20000);
    }
  });

  it('truncates a fractional term to whole years rather than rounding up', () => {
    expect(projectSavingsPlan({ ...BASE, years: 3.9 }).annual).toHaveLength(3);
  });

  it('caps the projection at 100 years', () => {
    const r = projectSavingsPlan({ ...BASE, years: 500 });
    expect(r.annual).toHaveLength(MAX_SAVINGS_YEARS);
    expect(r.months).toHaveLength(MAX_SAVINGS_YEARS * 12);
    expect(Number.isFinite(r.endBalance)).toBe(true);
  });

  it('every figure stays finite across all nine frequencies at the cap', () => {
    for (const f of COMPOUND_FREQUENCIES) {
      const r = projectSavingsPlan({ ...BASE, compound: f, years: MAX_SAVINGS_YEARS });
      for (const v of [r.endBalance, r.totalContributions, r.totalInterest, r.totalTax]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('requiredMonthlyForGoal — solved against the same projection', () => {
  const base = {
    initialDeposit: 5000,
    annualContribution: 0,
    annualIncreasePct: 0,
    monthlyIncreasePct: 0,
    annualRatePct: 4,
    compound: 'monthly' as CompoundFrequency,
    years: 10,
    taxRatePct: 0,
  };

  it('the deposit it returns actually reaches the goal when fed back in', () => {
    const goal = 50000;
    const monthly = requiredMonthlyForGoal(base, goal);
    expect(monthly).not.toBeNull();
    const back = projectSavingsPlan({ ...base, monthlyContribution: monthly as number });
    expect(back.endBalance).toBeCloseTo(goal, 4);
  });

  it('returns 0 when the plan already reaches the goal with no monthly deposit', () => {
    expect(requiredMonthlyForGoal(base, 1000)).toBe(0);
    expect(requiredMonthlyForGoal({ ...base, initialDeposit: 100000 }, 50000)).toBe(0);
  });

  it('honours the rest of the plan — an annual contribution lowers the monthly one', () => {
    const withoutAnnual = requiredMonthlyForGoal(base, 50000) as number;
    const withAnnual = requiredMonthlyForGoal({ ...base, annualContribution: 1000 }, 50000) as number;
    expect(withAnnual).toBeLessThan(withoutAnnual);
  });

  it('honours tax — a taxed plan needs a bigger deposit', () => {
    const untaxed = requiredMonthlyForGoal(base, 50000) as number;
    const taxed = requiredMonthlyForGoal({ ...base, taxRatePct: 30 }, 50000) as number;
    expect(taxed).toBeGreaterThan(untaxed);
  });

  it('honours the compounding frequency', () => {
    const annual = requiredMonthlyForGoal({ ...base, compound: 'annually' }, 50000) as number;
    const daily = requiredMonthlyForGoal({ ...base, compound: 'daily' }, 50000) as number;
    expect(daily).toBeLessThan(annual);
  });

  it('rises with the goal', () => {
    let previous = -Infinity;
    for (const goal of [20000, 50000, 120000, 400000]) {
      const monthly = requiredMonthlyForGoal(base, goal) as number;
      expect(monthly).toBeGreaterThan(previous);
      previous = monthly;
    }
  });

  it('works with no growth at all — the deposit is simple division', () => {
    const monthly = requiredMonthlyForGoal(
      { ...base, initialDeposit: 0, annualRatePct: 0, years: 10 },
      12000,
    );
    expect(monthly).toBeCloseTo(100, 6);
  });

  it('reports unreachable rather than guessing', () => {
    expect(requiredMonthlyForGoal({ ...base, years: 0 }, 50000)).toBeNull();
    expect(requiredMonthlyForGoal(base, Number.NaN)).toBeNull();
    expect(requiredMonthlyForGoal(base, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
