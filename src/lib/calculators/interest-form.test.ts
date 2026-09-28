import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INFLATION_PCT,
  INTEREST_EXAMPLE_VALUES,
  computeInterest,
  describeInterestResult,
  interestBinding,
  spokenUSD,
  validateInterestValues,
  type InterestComputed,
  type InterestValues,
} from './interest-form';
import { type InterestPlanResult } from './interest';

/**
 * Interest binding — validation, the two-box term and the complete-result guard.
 *
 * The guard earns most of these tests: it is the only thing between a reader and a
 * result whose seven figures do not add up, so every way a plan can be internally
 * inconsistent is asserted to fail it.
 */

const FULL: InterestValues = {
  initialInvestment: '20000',
  annualContribution: '5000',
  monthlyContribution: '0',
  contributeAt: 'beginning',
  annualRatePct: '5',
  compound: 'annually',
  years: '5',
  months: '0',
  taxRatePct: '0',
  inflationRatePct: '3',
};

const at = (over: Partial<InterestValues> = {}): InterestValues => ({ ...FULL, ...over });
const errs = (r: ReturnType<typeof validateInterestValues>): Record<string, string> =>
  r.ok ? {} : (r.fieldErrors ?? {});
const cents = (n: number) => Math.round(n * 100) / 100;

describe('validation — what is required', () => {
  it('accepts the full reference entry', () => {
    expect(validateInterestValues(FULL)).toEqual({ ok: true });
  });

  it('requires an initial investment', () => {
    expect(errs(validateInterestValues(at({ initialInvestment: '' }))).initialInvestment).toBe(
      'Enter an initial investment.',
    );
    expect(errs(validateInterestValues(at({ initialInvestment: 'abc' }))).initialInvestment).toBeTruthy();
    expect(errs(validateInterestValues(at({ initialInvestment: '-1' }))).initialInvestment).toBeTruthy();
    expect(validateInterestValues(at({ initialInvestment: '0' }))).toEqual({ ok: true });
  });

  it('requires an interest rate, and refuses a negative one', () => {
    expect(errs(validateInterestValues(at({ annualRatePct: '' }))).annualRatePct).toBe(
      'Enter an interest rate.',
    );
    expect(errs(validateInterestValues(at({ annualRatePct: '-2' }))).annualRatePct).toBeTruthy();
    expect(validateInterestValues(at({ annualRatePct: '0' }))).toEqual({ ok: true });
  });

  it('rejects a compounding frequency or timing that is not one of the offered options', () => {
    expect(errs(validateInterestValues(at({ compound: 'fortnightly' }))).compound).toBeTruthy();
    expect(errs(validateInterestValues(at({ contributeAt: 'middle' }))).contributeAt).toBeTruthy();
    expect(errs(validateInterestValues(at({ contributeAt: '' }))).contributeAt).toBeTruthy();
    expect(validateInterestValues(at({ compound: 'continuously', contributeAt: 'end' }))).toEqual({
      ok: true,
    });
  });
});

describe('validation — the term is two boxes but one quantity', () => {
  it('accepts years alone, months alone, or both', () => {
    expect(validateInterestValues(at({ years: '5', months: '' }))).toEqual({ ok: true });
    expect(validateInterestValues(at({ years: '', months: '7' }))).toEqual({ ok: true });
    expect(validateInterestValues(at({ years: '5', months: '6' }))).toEqual({ ok: true });
  });

  it('rejects a term of nothing at all, against the years box', () => {
    expect(errs(validateInterestValues(at({ years: '', months: '' }))).years).toBe(
      'Enter an investment length of at least one month.',
    );
    expect(errs(validateInterestValues(at({ years: '0', months: '0' }))).years).toBeTruthy();
  });

  it('rejects a term beyond 100 years', () => {
    expect(errs(validateInterestValues(at({ years: '101', months: '0' }))).years).toBeTruthy();
    expect(errs(validateInterestValues(at({ years: '100', months: '1' }))).years).toBeTruthy();
    expect(validateInterestValues(at({ years: '100', months: '0' }))).toEqual({ ok: true });
  });

  it('rejects a fractional or negative box, never rounding it', () => {
    expect(errs(validateInterestValues(at({ years: '5.5' }))).years).toBe(
      'Enter a whole number of years.',
    );
    expect(errs(validateInterestValues(at({ months: '2.5' }))).months).toBe(
      'Enter a whole number of months.',
    );
    expect(errs(validateInterestValues(at({ years: '-1' }))).years).toBeTruthy();
    expect(errs(validateInterestValues(at({ months: '-6' }))).months).toBeTruthy();
  });

  it('does not also complain about the total when a box is unparseable', () => {
    const e = errs(validateInterestValues(at({ years: 'five', months: '' })));
    expect(e.years).toBe('Enter a whole number of years.');
  });
});

describe('validation — blank means none, nonsense is still an error', () => {
  it('accepts the optional fields left blank', () => {
    expect(
      validateInterestValues(at({ annualContribution: '', monthlyContribution: '', taxRatePct: '' })),
    ).toEqual({ ok: true });
  });

  it('treats a blank optional field as zero rather than dropping the calculation', () => {
    const blank = computeInterest(at({ annualContribution: '', monthlyContribution: '', taxRatePct: '' }));
    const zeroed = computeInterest(at({ annualContribution: '0', monthlyContribution: '0', taxRatePct: '0' }));
    expect(blank.plan.endingBalance).toBeCloseTo(zeroed.plan.endingBalance, 8);
  });

  it('still rejects an unparseable optional field', () => {
    expect(errs(validateInterestValues(at({ annualContribution: 'abc' }))).annualContribution).toBeTruthy();
    expect(errs(validateInterestValues(at({ monthlyContribution: '-50' }))).monthlyContribution).toBeTruthy();
    expect(errs(validateInterestValues(at({ taxRatePct: 'lots' }))).taxRatePct).toBeTruthy();
  });

  it('bounds the tax and inflation rates to 0–100', () => {
    for (const bad of ['-1', '101']) {
      expect(errs(validateInterestValues(at({ taxRatePct: bad }))).taxRatePct).toBeTruthy();
      expect(errs(validateInterestValues(at({ inflationRatePct: bad }))).inflationRatePct).toBeTruthy();
    }
    expect(validateInterestValues(at({ taxRatePct: '100', inflationRatePct: '100' }))).toEqual({
      ok: true,
    });
  });
});

describe('computeInterest', () => {
  it('reproduces the reference case', () => {
    const r = computeInterest(FULL);
    expect(cents(r.plan.endingBalance)).toBe(54535.2);
    expect(cents(r.plan.totalPrincipal)).toBe(45000);
    expect(cents(r.plan.totalContributions)).toBe(25000);
    expect(cents(r.plan.totalInterest)).toBe(9535.2);
    expect(cents(r.plan.interestOfInitial)).toBe(5525.63);
    expect(cents(r.plan.interestOfContributions)).toBe(4009.56);
    expect(cents(r.plan.buyingPower)).toBe(47042.54);
  });

  it('carries the inflation rate alongside the plan, so the buying-power line knows', () => {
    expect(computeInterest(at({ inflationRatePct: '' })).inflationRatePct).toBe(0);
    expect(computeInterest(at({ inflationRatePct: '2.5' })).inflationRatePct).toBe(2.5);
  });

  it('passes the timing and the frequency through', () => {
    expect(cents(computeInterest(at({ contributeAt: 'end' })).plan.endingBalance)).toBe(53153.79);
    const daily = computeInterest(at({ compound: 'daily' })).plan.endingBalance;
    expect(daily).toBeGreaterThan(computeInterest(FULL).plan.endingBalance);
  });

  it('reads the term from both boxes', () => {
    expect(computeInterest(at({ years: '5', months: '6' })).plan.termMonths).toBe(66);
    expect(computeInterest(at({ years: '', months: '9' })).plan.termMonths).toBe(9);
  });
});

describe('the complete-result guard', () => {
  const good = computeInterest(FULL);
  const value = (r: InterestComputed) => interestBinding.resultValue(r);
  const clone = (p: InterestPlanResult): InterestPlanResult => ({
    ...p,
    annual: p.annual.map((y) => ({ ...y })),
    months: p.months.map((m) => ({ ...m })),
  });
  const broken = (mutate: (p: InterestPlanResult) => void): InterestComputed => {
    const plan = clone(good.plan);
    mutate(plan);
    return { ...good, plan };
  };

  it('accepts a plan that reconciles', () => {
    expect(cents(value(good) as number)).toBe(54535.2);
  });

  it('rejects a principal that is not its two parts', () => {
    expect(value(broken((p) => (p.totalPrincipal += 100)))).toBeNaN();
    expect(value(broken((p) => (p.totalContributions -= 500)))).toBeNaN();
  });

  it('rejects a balance that is not principal plus interest', () => {
    expect(value(broken((p) => (p.endingBalance *= 1.1)))).toBeNaN();
    expect(value(broken((p) => (p.totalInterest += 1)))).toBeNaN();
  });

  it('rejects an interest split that does not re-sum', () => {
    expect(value(broken((p) => (p.interestOfInitial += 10)))).toBeNaN();
    expect(value(broken((p) => (p.interestOfContributions -= 10)))).toBeNaN();
  });

  it('rejects a negative interest share or tax, which no plan can produce', () => {
    expect(value(broken((p) => (p.interestOfInitial = -1)))).toBeNaN();
    expect(value(broken((p) => (p.totalTax = -1)))).toBeNaN();
  });

  it('rejects buying power that exceeds the balance — inflation never adds value', () => {
    expect(value(broken((p) => (p.buyingPower = p.endingBalance * 1.5)))).toBeNaN();
  });

  it('rejects a non-finite figure', () => {
    expect(value(broken((p) => (p.endingBalance = Number.NaN)))).toBeNaN();
    expect(value(broken((p) => (p.buyingPower = Number.POSITIVE_INFINITY)))).toBeNaN();
  });

  it('rejects yearly rows that disagree with the totals', () => {
    expect(value(broken((p) => (p.annual[2].interest += 50)))).toBeNaN();
    expect(value(broken((p) => (p.annual[0].deposit -= 1000)))).toBeNaN();
  });

  it('rejects a yearly balance that is not the balance of the month closing it', () => {
    expect(value(broken((p) => (p.annual[3].balance += 200)))).toBeNaN();
  });

  it('rejects a truncated or miscounted schedule', () => {
    expect(value(broken((p) => p.annual.pop()))).toBeNaN();
    expect(value(broken((p) => p.months.splice(0, 12)))).toBeNaN();
    expect(value(broken((p) => (p.annual[1].monthCount = 13)))).toBeNaN();
  });

  it('rejects an empty projection', () => {
    expect(value(broken((p) => (p.termMonths = 0)))).toBeNaN();
  });

  it('accepts a short final year', () => {
    const partial = computeInterest(at({ years: '5', months: '6' }));
    expect(Number.isFinite(value(partial) as number)).toBe(true);
    expect(partial.plan.annual[5].monthCount).toBe(6);
  });

  it('accepts a valid all-zero projection', () => {
    const zero = computeInterest(
      at({
        initialInvestment: '0',
        annualContribution: '0',
        monthlyContribution: '0',
        annualRatePct: '0',
        inflationRatePct: '0',
      }),
    );
    expect(value(zero)).toBe(0);
  });
});

describe('announcement', () => {
  it('announces the ending balance', () => {
    expect(describeInterestResult(computeInterest(FULL))).toBe(
      'Your ending balance is 54535 dollars and 20 cents.',
    );
  });

  it('speaks dollars and cents', () => {
    expect(spokenUSD(0)).toBe('0 dollars');
    expect(spokenUSD(1)).toBe('1 dollar');
    expect(spokenUSD(325.5)).toBe('325 dollars and 50 cents');
  });
});

describe('the worked example', () => {
  it('validates, so the example a visitor sees is a real calculation', () => {
    expect(validateInterestValues(INTEREST_EXAMPLE_VALUES)).toEqual({ ok: true });
  });

  it('is the published reference case and passes the same guard as any other result', () => {
    const r = computeInterest(INTEREST_EXAMPLE_VALUES);
    expect(cents(interestBinding.resultValue(r) as number)).toBe(54535.2);
  });

  it('uses the inflation assumption the form ships with', () => {
    expect(INTEREST_EXAMPLE_VALUES.inflationRatePct).toBe(DEFAULT_INFLATION_PCT);
  });
});
