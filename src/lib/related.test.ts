import { describe, it, expect } from 'vitest';
import { CALCULATORS, getCalculator, type Calculator } from '@data/calculators';
import { getRelatedCalculators, relatedness } from './related';

const live = CALCULATORS.filter((c) => c.status === 'live');
const get = (ref: string) => {
  const [category, slug] = ref.split('/');
  const c = getCalculator(category, slug);
  if (!c) throw new Error(`no such calculator: ${ref}`);
  return c;
};
const refOf = (c: Calculator) => `${c.category}/${c.slug}`;

describe('relatedness', () => {
  it('ranks a task-group sibling above a mere category sibling', () => {
    const mortgage = get('finance/mortgage-calculator');
    // Both are finance; only Credit Card Payoff shares the borrow-repay task group.
    expect(relatedness(mortgage, get('finance/credit-card-payoff-calculator'))).toBeGreaterThan(
      relatedness(mortgage, get('finance/retirement-calculator')),
    );
  });

  it('scores an unrelated pair at zero however many words they happen to share', () => {
    expect(relatedness(get('health/bmi-calculator'), get('finance/mortgage-calculator'))).toBe(0);
    expect(relatedness(get('math/fraction-calculator'), get('everyday/time-calculator'))).toBe(0);
  });

  it('relates across categories when a curated cluster says so', () => {
    // The geometry cluster spans math and everyday on purpose.
    expect(
      relatedness(get('everyday/square-footage-calculator'), get('math/area-calculator')),
    ).toBeGreaterThan(0);
  });

  it('is zero against itself', () => {
    for (const c of live) expect(relatedness(c, c)).toBe(0);
  });
});

describe('getRelatedCalculators', () => {
  it('never returns self, a duplicate, or anything not live', () => {
    for (const c of live) {
      const out = getRelatedCalculators(c, 12);
      expect(out.some((r) => refOf(r) === refOf(c)), refOf(c)).toBe(false);
      expect(new Set(out.map(refOf)).size, refOf(c)).toBe(out.length);
      expect(out.every((r) => r.status === 'live'), refOf(c)).toBe(true);
    }
  });

  it('gives every live calculator somewhere to go', () => {
    for (const c of live) expect(getRelatedCalculators(c, 12).length, refOf(c)).toBeGreaterThan(3);
  });

  it('returns the same order on every call, and honours the limit', () => {
    const c = get('finance/loan-calculator');
    expect(getRelatedCalculators(c, 12).map(refOf)).toEqual(getRelatedCalculators(c, 12).map(refOf));
    expect(getRelatedCalculators(c, 4)).toHaveLength(4);
    expect(getRelatedCalculators(c, 4).map(refOf)).toEqual(
      getRelatedCalculators(c, 12).slice(0, 4).map(refOf),
    );
  });

  /**
   * The regression this module exists for. Ranking by registry position put
   * Mortgage and Loan in the related list of 59 and 60 pages — every BMI,
   * fraction and password page among them — while Credit Card Payoff was in 4.
   * Nothing about the old code said "give the first two finance entries every
   * cross-category slot on the site"; it just fell out of `slice()`.
   */
  it('spreads the links instead of pooling them on whatever was authored first', () => {
    const appearances = new Map<string, number>();
    for (const c of live) {
      for (const r of getRelatedCalculators(c, 12)) {
        appearances.set(refOf(r), (appearances.get(refOf(r)) ?? 0) + 1);
      }
    }
    for (const c of live) {
      const n = appearances.get(refOf(c)) ?? 0;
      expect(n, `${refOf(c)} is linked from ${n} of ${live.length} related lists`).toBeLessThanOrEqual(26);
      expect(n, `${refOf(c)} is linked from only ${n} related lists`).toBeGreaterThan(3);
    }
  });

  it('puts a borrow-repay tool in every other borrow-repay tool\'s list', () => {
    const borrow = [
      'finance/mortgage-calculator',
      'finance/loan-calculator',
      'finance/auto-loan-calculator',
      'finance/amortization-calculator',
      'finance/payment-calculator',
      'finance/interest-rate-calculator',
      'finance/credit-card-payoff-calculator',
      'finance/home-equity-loan-calculator',
    ];
    for (const a of borrow) {
      const out = getRelatedCalculators(get(a), 12).map(refOf);
      for (const b of borrow) {
        if (a !== b) expect(out, `${a} -> ${b}`).toContain(b);
      }
    }
  });
});
