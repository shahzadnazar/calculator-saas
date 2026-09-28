import { describe, it, expect } from 'vitest';
import {
  MAX_RATE,
  MSG,
  SIMPLE_INTEREST_EXAMPLE_VALUES,
  SOLVE_MODES,
  asks,
  completeSimpleInterestValue,
  computeSimpleInterest,
  describeSimpleInterest,
  presentSimpleInterest,
  simpleInterestBinding,
  unitNoun,
  validateSimpleInterest,
  yearStacks,
  type SimpleInterestComputed,
  type SimpleInterestValues,
} from './simple-interest-form';

/**
 * The simple-interest binding, pinned to the published reference case: $20,000 at 3%
 * a year for 10 years gives $6,000 of interest and a $26,000 end balance, with the
 * working written out and a 77% / 23% ring.
 */

const REF: SimpleInterestValues = SIMPLE_INTEREST_EXAMPLE_VALUES;
const at = (over: Partial<SimpleInterestValues> = {}): SimpleInterestValues => ({ ...REF, ...over });
const errs = (v: SimpleInterestValues): Record<string, string> => {
  const r = validateSimpleInterest(v);
  return r.ok ? {} : (r.fieldErrors ?? {});
};

describe('which fields each mode asks for', () => {
  it('offers the reference’s four tabs, in its order', () => {
    expect(SOLVE_MODES.map((m) => m.label)).toEqual(['Balance', 'Principal', 'Term', 'Rate']);
  });

  it('asks for the three it is not solving for', () => {
    expect(asks('balance', 'principal')).toBe(true);
    expect(asks('balance', 'endBalance')).toBe(false);
    expect(asks('principal', 'endBalance')).toBe(true);
    expect(asks('principal', 'principal')).toBe(false);
    expect(asks('term', 'term')).toBe(false);
    expect(asks('rate', 'ratePerUnitPct')).toBe(false);
  });

  it('ignores a value the current mode does not ask for', () => {
    // A stale end balance left over from another tab must not block a Balance result.
    expect(validateSimpleInterest(at({ endBalance: '-999' }))).toEqual({ ok: true });
  });
});

describe('validation', () => {
  it('accepts the reference entry', () => {
    expect(validateSimpleInterest(REF)).toEqual({ ok: true });
  });

  it('requires a positive principal where it is asked for', () => {
    expect(errs(at({ principal: '' })).principal).toBe(MSG.principalRequired);
    for (const bad of ['0', '-1', 'abc']) {
      expect(errs(at({ principal: bad })).principal).toBe(MSG.principalPositive);
    }
  });

  it('requires a positive end balance where it is asked for', () => {
    const mode = at({ solveFor: 'principal', endBalance: '' });
    expect(errs(mode).endBalance).toBe(MSG.balanceRequired);
    expect(errs(at({ solveFor: 'principal', endBalance: '0' })).endBalance).toBe(MSG.balancePositive);
  });

  it('requires a rate in range, and allows 0% except where it must be divided by', () => {
    expect(errs(at({ ratePerUnitPct: '' })).ratePerUnitPct).toBe(MSG.rateRequired);
    expect(errs(at({ ratePerUnitPct: String(MAX_RATE + 1) })).ratePerUnitPct).toBe(MSG.rateRange);
    expect(errs(at({ ratePerUnitPct: '-1' })).ratePerUnitPct).toBe(MSG.rateRange);
    // 0% is a real, if dull, Balance answer.
    expect(validateSimpleInterest(at({ ratePerUnitPct: '0' }))).toEqual({ ok: true });
    // But solving for a term divides by it.
    expect(errs(at({ solveFor: 'term', endBalance: '26000', ratePerUnitPct: '0' })).ratePerUnitPct).toBe(
      MSG.ratePositive,
    );
  });

  it('requires a term, and allows zero except where it must be divided by', () => {
    expect(errs(at({ term: '' })).term).toBe(MSG.termRequired);
    expect(errs(at({ term: '-1' })).term).toBe(MSG.termNonNegative);
    expect(validateSimpleInterest(at({ term: '0' }))).toEqual({ ok: true });
    expect(errs(at({ solveFor: 'rate', endBalance: '26000', term: '0' })).term).toBe(MSG.termPositive);
  });

  it('rejects solving backwards from a balance below the principal', () => {
    // Simple interest only adds, so no positive term or rate produces a loss.
    for (const solveFor of ['term', 'rate'] as const) {
      expect(errs(at({ solveFor, endBalance: '15000' })).endBalance).toBe(MSG.balanceBelowPrincipal);
    }
    // A balance EQUAL to the principal is fine for neither — it needs a zero term or
    // rate, which the other checks already caught.
    expect(validateSimpleInterest(at({ solveFor: 'rate', endBalance: '26000' }))).toEqual({ ok: true });
  });

  it('rejects figures that would need a term past the ceiling', () => {
    const v = at({ solveFor: 'term', endBalance: '1000000', principal: '20000', ratePerUnitPct: '0.01' });
    expect(Object.keys(errs(v)).length).toBeGreaterThan(0);
  });
});

describe('the reference case', () => {
  const c = computeSimpleInterest(REF);
  const p = presentSimpleInterest(c);

  it('prints the two figures the reference reports', () => {
    expect(p.endBalance).toBe('$26,000.00');
    expect(p.totalInterest).toBe('$6,000.00');
  });

  it('writes out the calculation steps the reference shows', () => {
    expect(p.steps).toHaveLength(2);
    expect(p.steps[0].expression).toBe('Total Interest = $20,000 × 3% × 10');
    expect(p.steps[0].value).toBe('$6,000.00');
    expect(p.steps[1].expression).toBe('End Balance = $20,000 + $6,000.00');
    expect(p.steps[1].value).toBe('$26,000.00');
  });

  it('splits the ring 77% / 23%', () => {
    expect(p.principalShare).toBe('77%');
    expect(p.interestShare).toBe('23%');
  });

  it('announces the balance', () => {
    expect(describeSimpleInterest(c)).toBe('End balance: 26000 dollars.');
  });

  it('does not show a separate answer row when the balance IS the answer', () => {
    expect(p.solvedLabel).toBe('End balance');
    expect(p.solvedValue).toBe('$26,000.00');
  });
});

describe('the other three modes', () => {
  it('solves for the principal, and says so', () => {
    const c = computeSimpleInterest(at({ solveFor: 'principal', endBalance: '30000' }));
    const p = presentSimpleInterest(c);
    expect(p.solvedLabel).toBe('Principal');
    expect(p.solvedValue).toBe('$23,076.92');
    expect(p.endBalance).toBe('$30,000.00');
  });

  it('solves for the term in the unit that was chosen', () => {
    const c = computeSimpleInterest(at({ solveFor: 'term', endBalance: '30000' }));
    expect(presentSimpleInterest(c).solvedValue).toBe('16.67 years');
    const months = computeSimpleInterest(at({ solveFor: 'term', endBalance: '26000', termUnit: 'month' }));
    expect(presentSimpleInterest(months).solvedValue).toBe('120 months');
  });

  it('solves for the rate in the period it was quoted in', () => {
    const c = computeSimpleInterest(at({ solveFor: 'rate', endBalance: '30000' }));
    expect(presentSimpleInterest(c).solvedValue).toBe('5% per year');
    const monthly = computeSimpleInterest(at({ solveFor: 'rate', endBalance: '26000', rateUnit: 'month' }));
    expect(presentSimpleInterest(monthly).solvedValue).toBe('0.25% per month');
  });

  it('announces the answer rather than the balance in a solve-for mode', () => {
    const c = computeSimpleInterest(at({ solveFor: 'rate', endBalance: '30000' }));
    expect(describeSimpleInterest(c)).toBe('Interest rate: 5% per year. End balance $30,000.00.');
  });

  it('says one year, not one years', () => {
    expect(unitNoun(1, 'year')).toBe('year');
    expect(unitNoun(2, 'year')).toBe('years');
    expect(unitNoun(0.5, 'month')).toBe('months');
  });

  it('every mode reaches the same case from a different direction', () => {
    for (const solveFor of ['balance', 'principal', 'term', 'rate'] as const) {
      const c = computeSimpleInterest(at({ solveFor, endBalance: '26000' }));
      const p = presentSimpleInterest(c);
      expect(p.endBalance).toBe('$26,000.00');
      expect(p.totalInterest).toBe('$6,000.00');
    }
  });
});

describe('the accumulation columns', () => {
  const stacks = yearStacks(computeSimpleInterest(REF));

  it('opens on year zero — the principal before any interest', () => {
    expect(stacks).toHaveLength(11);
    expect(stacks[0].year).toBe(0);
    expect(stacks[0].interest).toBe(0);
    expect(stacks[0].total).toBe(20000);
  });

  it('every column sums to that year’s balance', () => {
    for (const s of stacks) {
      expect(s.initial + s.contributions + s.interest).toBeCloseTo(s.total, 6);
      expect(s.contributions).toBe(0); // nothing is ever added to a simple-interest balance
    }
  });

  it('interest grows by a flat step, which is what makes it simple', () => {
    const steps = stacks.slice(1).map((s, i) => s.interest - stacks[i].interest);
    for (const step of steps) expect(step).toBeCloseTo(600, 6);
  });

  it('closes on the end balance', () => {
    expect(stacks[10].total).toBeCloseTo(26000, 6);
  });
});

describe('the complete-result guard', () => {
  const good = computeSimpleInterest(REF);
  const broken = (mutate: (c: SimpleInterestComputed) => void): SimpleInterestComputed => {
    const copy = JSON.parse(JSON.stringify(good)) as SimpleInterestComputed;
    mutate(copy);
    return copy;
  };

  it('accepts a result that reconciles, returning the end balance', () => {
    expect(completeSimpleInterestValue(good)).toBeCloseTo(26000, 6);
  });

  it('rejects an unsolvable case outright', () => {
    const stuck = computeSimpleInterest(at({ solveFor: 'rate', endBalance: '26000', term: '0' }));
    expect(stuck.result.unsolvable).toBe(true);
    expect(completeSimpleInterestValue(stuck)).toBeNaN();
  });

  it('rejects interest that is not the gap it claims', () => {
    expect(completeSimpleInterestValue(broken((c) => (c.result.interest += 100)))).toBeNaN();
    expect(completeSimpleInterestValue(broken((c) => (c.result.endBalance += 100)))).toBeNaN();
  });

  it('rejects interest that does not follow from the rate and term', () => {
    expect(
      completeSimpleInterestValue(
        broken((c) => {
          c.result.annualRatePct = 9;
        }),
      ),
    ).toBeNaN();
    expect(
      completeSimpleInterestValue(
        broken((c) => {
          c.result.termYears = 3;
        }),
      ),
    ).toBeNaN();
  });

  it('rejects a schedule that does not match the term or close on the balance', () => {
    expect(completeSimpleInterestValue(broken((c) => c.result.schedule.pop()))).toBeNaN();
    expect(completeSimpleInterestValue(broken((c) => (c.result.schedule[9].balance += 500)))).toBeNaN();
    expect(completeSimpleInterestValue(broken((c) => (c.result.schedule[2].interest += 50)))).toBeNaN();
  });

  it('rejects a non-finite or impossible figure', () => {
    expect(completeSimpleInterestValue(broken((c) => (c.result.principal = 0)))).toBeNaN();
    expect(completeSimpleInterestValue(broken((c) => (c.result.annualRatePct = -1)))).toBeNaN();
    expect(completeSimpleInterestValue(broken((c) => (c.result.endBalance = Number.NaN)))).toBeNaN();
    expect(completeSimpleInterestValue(broken((c) => (c.result.termYears = 200)))).toBeNaN();
  });

  it('a zero-term case is well-formed and has no schedule to check', () => {
    const flat = computeSimpleInterest(at({ term: '0' }));
    expect(completeSimpleInterestValue(flat)).toBeCloseTo(20000, 6);
    expect(flat.result.schedule).toEqual([]);
  });
});

describe('the worked example', () => {
  it('validates, so the example a visitor sees is a real calculation', () => {
    expect(validateSimpleInterest(SIMPLE_INTEREST_EXAMPLE_VALUES)).toEqual({ ok: true });
  });

  it('is the published reference case and passes the same guard as any other result', () => {
    const c = computeSimpleInterest(SIMPLE_INTEREST_EXAMPLE_VALUES);
    expect(simpleInterestBinding.resultValue(c)).toBeCloseTo(26000, 6);
    expect(presentSimpleInterest(c).endBalance).toBe('$26,000.00');
  });

  it('opens on the Balance tab, with the end balance left for the answer', () => {
    expect(SIMPLE_INTEREST_EXAMPLE_VALUES.solveFor).toBe('balance');
    expect(SIMPLE_INTEREST_EXAMPLE_VALUES.endBalance).toBe('');
  });
});
