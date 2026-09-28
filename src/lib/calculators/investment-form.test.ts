import { describe, it, expect } from 'vitest';
import {
  INVESTMENT_EXAMPLE_VALUES,
  MAX_RETURN,
  MAX_YEARS,
  MIN_RETURN,
  MSG,
  completeInvestmentValue,
  computeInvestment,
  contributionPhrase,
  describeInvestment,
  investmentBinding,
  presentInvestment,
  spokenUSD,
  validateInvestment,
  yearStacks,
  type InvestmentComputed,
  type InvestmentValues,
} from './investment-form';

/**
 * The investment binding, pinned to the published reference case: $20,000 at 6%
 * compounded annually for ten years with $1,000 added at the end of every month ends
 * at $198,290.40 — $20,000 started, $120,000 contributed, $58,290.40 earned, a
 * 10% / 61% / 29% ring.
 */

const REF: InvestmentValues = INVESTMENT_EXAMPLE_VALUES;
const at = (over: Partial<InvestmentValues> = {}): InvestmentValues => ({ ...REF, ...over });
const errs = (v: InvestmentValues): Record<string, string> => {
  const r = validateInvestment(v);
  return r.ok ? {} : (r.fieldErrors ?? {});
};
const money = (n: number) => Math.round(n * 100) / 100;

describe('validation', () => {
  it('accepts the reference entry', () => {
    expect(validateInvestment(REF)).toEqual({ ok: true });
  });

  it('requires a starting amount, but allows zero when something is contributed', () => {
    expect(errs(at({ startingAmount: '' })).startingAmount).toBe(MSG.startRequired);
    expect(errs(at({ startingAmount: '-1' })).startingAmount).toBe(MSG.startNonNegative);
    expect(validateInvestment(at({ startingAmount: '0' }))).toEqual({ ok: true });
  });

  it('rejects investing nothing at all', () => {
    expect(errs(at({ startingAmount: '0', contribution: '0' })).startingAmount).toBe(MSG.nothingInvested);
    expect(errs(at({ startingAmount: '0', contribution: '' })).startingAmount).toBe(MSG.nothingInvested);
  });

  it(`requires a length from 1 to ${MAX_YEARS} years`, () => {
    expect(errs(at({ years: '' })).years).toBe(MSG.yearsRequired);
    for (const bad of ['0', '101', '-5', 'abc']) {
      expect(errs(at({ years: bad })).years).toBe(MSG.yearsRange);
    }
    expect(validateInvestment(at({ years: String(MAX_YEARS) }))).toEqual({ ok: true });
  });

  it('requires a return rate, and allows a negative one', () => {
    expect(errs(at({ annualReturnPct: '' })).annualReturnPct).toBe(MSG.returnRequired);
    // A losing year is a real scenario, not a typo.
    expect(validateInvestment(at({ annualReturnPct: '-5' }))).toEqual({ ok: true });
    expect(validateInvestment(at({ annualReturnPct: '0' }))).toEqual({ ok: true });
    expect(errs(at({ annualReturnPct: String(MAX_RETURN + 1) })).annualReturnPct).toBe(MSG.returnRange);
    expect(errs(at({ annualReturnPct: String(MIN_RETURN - 1) })).annualReturnPct).toBe(MSG.returnRange);
  });

  it('treats a blank contribution as none, and rejects a negative one', () => {
    expect(validateInvestment(at({ contribution: '' }))).toEqual({ ok: true });
    expect(computeInvestment(at({ contribution: '' })).contribution).toBe(0);
    expect(errs(at({ contribution: '-100' })).contribution).toBe(MSG.contributionNonNegative);
  });
});

describe('the reference case', () => {
  const c = computeInvestment(REF);
  const p = presentInvestment(c);

  it('reaches the published end balance', () => {
    expect(p.endBalance).toBe('$198,290.40');
    expect(money(c.result.endBalance)).toBe(198290.4);
  });

  it('prints the three figures the reference reports', () => {
    expect(p.startingAmount).toBe('$20,000.00');
    expect(p.totalContributions).toBe('$120,000.00');
    expect(p.totalInterest).toBe('$58,290.40');
  });

  it('splits the ring the way the reference does', () => {
    expect(p.startingShare).toBe('10%');
    expect(p.contributionShare).toBe('61%');
    expect(p.interestShare).toBe('29%');
  });

  it('says the whole thing in a sentence', () => {
    expect(p.interpretation).toBe(
      'Starting with $20,000 and adding $1,000 a month at 6% a year, after 10 years you would have ' +
        '$198,290.40 — of which $58,290.40 is return.',
    );
  });

  it('announces the end balance', () => {
    expect(describeInvestment(c)).toBe('End balance: 198290 dollars and 40 cents.');
    expect(spokenUSD(1000)).toBe('1000 dollars');
    expect(spokenUSD(0.01)).toBe('0 dollars and 1 cent');
  });

  it('leaves out the contribution clause when there is none', () => {
    const p2 = presentInvestment(computeInvestment(at({ contribution: '' })));
    expect(p2.interpretation).toContain('Starting with $20,000 at 6% a year');
    expect(p2.interpretation).not.toContain('adding');
  });

  it('names the contribution by how often it is made', () => {
    expect(contributionPhrase(1000, 'month')).toBe('$1,000 a month');
    expect(contributionPhrase(12000, 'year')).toBe('$12,000 a year');
  });

  it('says one year, not one years', () => {
    const p3 = presentInvestment(computeInvestment(at({ years: '1' })));
    expect(p3.interpretation).toContain('after 1 year you');
  });
});

describe('the stacked columns behind the chart', () => {
  const c = computeInvestment(REF);
  const stacks = yearStacks(c);

  it('has one column per year', () => {
    expect(stacks).toHaveLength(10);
    expect(stacks.map((s) => s.year)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('every column sums to that year’s balance, so its height IS the balance', () => {
    for (const [i, s] of stacks.entries()) {
      expect(s.initial + s.contributions + s.interest).toBeCloseTo(s.total, 6);
      expect(s.total).toBeCloseTo(c.result.annual[i].balance, 9);
    }
  });

  it('takes the starting amount back out of year one’s deposit', () => {
    // Year one's deposit column shows $32,000; only $12,000 of it is contribution.
    expect(money(stacks[0].contributions)).toBe(12000);
    expect(stacks[0].initial).toBe(20000);
  });

  it('the last column is the end balance, split the same way as the ring', () => {
    const last = stacks[9];
    expect(money(last.total)).toBe(198290.4);
    expect(money(last.contributions)).toBe(120000);
    expect(money(last.interest)).toBe(58290.4);
  });

  it('contributions and interest only ever grow', () => {
    for (let i = 1; i < stacks.length; i++) {
      expect(stacks[i].contributions).toBeGreaterThanOrEqual(stacks[i - 1].contributions);
      expect(stacks[i].interest).toBeGreaterThan(stacks[i - 1].interest);
    }
  });

  it('never produces a negative slice, even on a losing projection', () => {
    const losing = yearStacks(computeInvestment(at({ annualReturnPct: '-8', contribution: '' })));
    for (const s of losing) expect(s.interest).toBeGreaterThanOrEqual(0);
  });
});

describe('the complete-result guard', () => {
  const good = computeInvestment(REF);
  const broken = (mutate: (c: InvestmentComputed) => void): InvestmentComputed => {
    const copy = JSON.parse(JSON.stringify(good)) as InvestmentComputed;
    mutate(copy);
    return copy;
  };

  it('accepts a result that reconciles, returning the end balance', () => {
    expect(completeInvestmentValue(good)).toBeCloseTo(198290.4, 2);
  });

  it('rejects a split that does not add back to the balance', () => {
    expect(completeInvestmentValue(broken((c) => (c.result.totalContributions += 100)))).toBeNaN();
    expect(completeInvestmentValue(broken((c) => (c.result.totalInterest += 100)))).toBeNaN();
    expect(completeInvestmentValue(broken((c) => (c.result.endBalance += 100)))).toBeNaN();
  });

  it('rejects a schedule of the wrong length in either view', () => {
    expect(completeInvestmentValue(broken((c) => c.result.monthly.pop()))).toBeNaN();
    expect(completeInvestmentValue(broken((c) => c.result.annual.pop()))).toBeNaN();
  });

  it('rejects a schedule that does not close on the end balance', () => {
    expect(completeInvestmentValue(broken((c) => (c.result.monthly[119].balance += 500)))).toBeNaN();
    expect(completeInvestmentValue(broken((c) => (c.result.annual[9].balance += 500)))).toBeNaN();
  });

  it('rejects deposits that do not account for what went in', () => {
    expect(completeInvestmentValue(broken((c) => (c.result.monthly[4].deposit += 250)))).toBeNaN();
  });

  it('rejects a year that does not sum the months inside it', () => {
    expect(completeInvestmentValue(broken((c) => (c.result.annual[3].interest += 50)))).toBeNaN();
  });

  it('rejects a non-finite or out-of-range input', () => {
    expect(completeInvestmentValue(broken((c) => (c.years = 0)))).toBeNaN();
    expect(completeInvestmentValue(broken((c) => (c.years = MAX_YEARS + 1)))).toBeNaN();
    expect(completeInvestmentValue(broken((c) => (c.annualReturnPct = 500)))).toBeNaN();
    expect(completeInvestmentValue(broken((c) => (c.startingAmount = -1)))).toBeNaN();
    expect(completeInvestmentValue(broken((c) => (c.result.endBalance = Number.NaN)))).toBeNaN();
  });

  it('rejects investing nothing', () => {
    expect(
      completeInvestmentValue(
        broken((c) => {
          c.startingAmount = 0;
          c.contribution = 0;
        }),
      ),
    ).toBeNaN();
  });

  it('a losing projection is still a well-formed result', () => {
    const losing = computeInvestment(at({ annualReturnPct: '-5', contribution: '' }));
    expect(Number.isFinite(completeInvestmentValue(losing))).toBe(true);
    expect(losing.result.totalInterest).toBeLessThan(0);
  });
});

describe('reading the structural choices', () => {
  it('carries the compounding frequency and the contribution timing through', () => {
    const c = computeInvestment(at({ compound: 'daily', contributeAt: 'beginning', contributeEvery: 'year' }));
    expect(c.compound).toBe('daily');
    expect(c.contributeAt).toBe('beginning');
    expect(c.contributeEvery).toBe('year');
  });

  it('a beginning-of-period contribution ends higher than an end-of-period one', () => {
    const end = computeInvestment(REF).result.endBalance;
    const beginning = computeInvestment(at({ contributeAt: 'beginning' })).result.endBalance;
    expect(beginning).toBeGreaterThan(end);
  });
});

describe('the worked example', () => {
  it('validates, so the example a visitor sees is a real calculation', () => {
    expect(validateInvestment(INVESTMENT_EXAMPLE_VALUES)).toEqual({ ok: true });
  });

  it('is the published reference case and passes the same guard as any other result', () => {
    const c = computeInvestment(INVESTMENT_EXAMPLE_VALUES);
    expect(investmentBinding.resultValue(c)).toBeCloseTo(198290.4, 2);
    expect(presentInvestment(c).endBalance).toBe('$198,290.40');
  });
});
