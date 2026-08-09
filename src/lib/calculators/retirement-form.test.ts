import { describe, it, expect } from 'vitest';
import {
  retirementBinding,
  validateRetirementValues,
  computeRetirement,
  completeResultValue,
  describeRetirementResult,
  MSG,
  FUNDING_ERROR,
  MAX_AGE,
  type RetirementValues,
  type RetirementComputed,
} from './retirement-form';
import { calculateRetirement } from './retirement';

/**
 * Retirement binding unit tests (R18B3, Commit 2). Validation, computation (reconciled
 * against the frozen calculateRetirement — no hand-computed compound values), the
 * complete-result guard (incl. tamper + relationship rejection), description, and the DOM
 * read/reset helpers via a mock root.
 */

const vals = (v: Partial<RetirementValues> = {}): RetirementValues => ({
  currentAge: '30',
  retirementAge: '65',
  currentSavings: '20000',
  monthlyContribution: '500',
  annualReturnPct: '6',
  withdrawalRatePct: '4',
  ...v,
});

function mockRoot(v: Partial<RetirementValues> = {}) {
  const store: Record<string, { value: string }> = {
    currentAge: { value: v.currentAge ?? '' },
    retirementAge: { value: v.retirementAge ?? '' },
    currentSavings: { value: v.currentSavings ?? '' },
    monthlyContribution: { value: v.monthlyContribution ?? '' },
    annualReturnPct: { value: v.annualReturnPct ?? '' },
    withdrawalRatePct: { value: v.withdrawalRatePct ?? '' },
  };
  const root = {
    querySelector(sel: string) {
      const m = sel.match(/\[name="(\w+)"\]/);
      return m && store[m[1]] ? store[m[1]] : null;
    },
  } as unknown as HTMLElement;
  return { root, store };
}

describe('retirement binding — contract', () => {
  it('does NOT implement isUsableResult (the guard lives in resultValue)', () => {
    expect(retirementBinding.isUsableResult).toBeUndefined();
  });

  it('resultValue is the complete-result guard: nest egg when complete, NaN when tampered', () => {
    const c = computeRetirement(vals());
    expect(retirementBinding.resultValue(c)).toBe(c.nestEgg);
    expect(Number.isNaN(retirementBinding.resultValue({ ...c, nestEgg: c.nestEgg + 1000 }))).toBe(true);
  });
});

describe('retirement binding — validation', () => {
  it('ordinary input is valid', () => {
    expect(validateRetirementValues(vals()).ok).toBe(true);
  });

  it('requires both ages', () => {
    const a = validateRetirementValues(vals({ currentAge: '' }));
    if (!a.ok) expect(a.fieldErrors?.currentAge).toBe(MSG.currentAgeRequired);
    const b = validateRetirementValues(vals({ retirementAge: '' }));
    if (!b.ok) expect(b.fieldErrors?.retirementAge).toBe(MSG.retirementAgeRequired);
  });

  it('rejects non-integer / out-of-range / negative ages', () => {
    for (const bad of ['30.5', '130', '-5', 'abc']) {
      const v = validateRetirementValues(vals({ currentAge: bad }));
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.fieldErrors?.currentAge).toBe(MSG.currentAgeInvalid);
    }
    expect(validateRetirementValues(vals({ currentAge: String(MAX_AGE), retirementAge: '' })).ok).toBe(false);
  });

  it('rejects retirement age equal to or below current age (cross-field form error)', () => {
    for (const pair of [['30', '30'], ['65', '60']]) {
      const v = validateRetirementValues(vals({ currentAge: pair[0], retirementAge: pair[1] }));
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.formError).toBe(MSG.ageOrder);
    }
  });

  it('accepts a one-year horizon and an ordinary horizon', () => {
    expect(validateRetirementValues(vals({ currentAge: '64', retirementAge: '65' })).ok).toBe(true);
    expect(validateRetirementValues(vals({ currentAge: '25', retirementAge: '60' })).ok).toBe(true);
  });

  it('savings + contribution are each optional but collectively required to fund', () => {
    // both empty (→ 0) with valid ages/rates → funding error
    const v = validateRetirementValues(vals({ currentSavings: '', monthlyContribution: '' }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.formError).toBe(FUNDING_ERROR);
    // one of them > 0 → ok
    expect(validateRetirementValues(vals({ currentSavings: '', monthlyContribution: '100' })).ok).toBe(true);
    expect(validateRetirementValues(vals({ currentSavings: '5000', monthlyContribution: '' })).ok).toBe(true);
    // explicit 0/0 → funding error
    const z = validateRetirementValues(vals({ currentSavings: '0', monthlyContribution: '0' }));
    if (!z.ok) expect(z.formError).toBe(FUNDING_ERROR);
  });

  it('rejects negative / malformed money, allows decimals', () => {
    for (const bad of ['-1', 'abc', '1e999']) {
      const v = validateRetirementValues(vals({ currentSavings: bad }));
      if (!v.ok) expect(v.fieldErrors?.currentSavings).toBe(MSG.savingsInvalid);
    }
    expect(validateRetirementValues(vals({ currentSavings: '20000.50' })).ok).toBe(true);
  });

  it('return is required and non-negative (a negative expected return is rejected)', () => {
    const empty = validateRetirementValues(vals({ annualReturnPct: '' }));
    if (!empty.ok) expect(empty.fieldErrors?.annualReturnPct).toBe(MSG.returnRequired);
    const neg = validateRetirementValues(vals({ annualReturnPct: '-5' }));
    if (!neg.ok) expect(neg.fieldErrors?.annualReturnPct).toBe(MSG.returnInvalid);
    expect(validateRetirementValues(vals({ annualReturnPct: '0' })).ok).toBe(true);
  });

  it('withdrawal rate is required and non-negative; zero is valid', () => {
    const empty = validateRetirementValues(vals({ withdrawalRatePct: '' }));
    if (!empty.ok) expect(empty.fieldErrors?.withdrawalRatePct).toBe(MSG.withdrawalRequired);
    const neg = validateRetirementValues(vals({ withdrawalRatePct: '-4' }));
    if (!neg.ok) expect(neg.fieldErrors?.withdrawalRatePct).toBe(MSG.withdrawalInvalid);
    expect(validateRetirementValues(vals({ withdrawalRatePct: '0' })).ok).toBe(true);
  });
});

describe('retirement binding — computation + guard', () => {
  const ref = (v: RetirementValues) =>
    calculateRetirement({
      currentAge: Number(v.currentAge),
      retirementAge: Number(v.retirementAge),
      currentSavings: v.currentSavings.trim() === '' ? 0 : Number(v.currentSavings),
      monthlyContribution: v.monthlyContribution.trim() === '' ? 0 : Number(v.monthlyContribution),
      annualReturnPct: Number(v.annualReturnPct),
      withdrawalRatePct: Number(v.withdrawalRatePct),
    });

  it('delegates to calculateRetirement unchanged (reconciles every field) + echoes inputs', () => {
    const v = vals();
    const c = computeRetirement(v);
    const r = ref(v);
    expect(c.nestEgg).toBe(r.nestEgg);
    expect(c.totalContributions).toBe(r.totalContributions);
    expect(c.totalEarnings).toBe(r.totalEarnings);
    expect(c.estimatedAnnualIncome).toBe(r.estimatedAnnualIncome);
    expect(c.estimatedMonthlyIncome).toBe(r.estimatedMonthlyIncome);
    expect(c.yearsToRetirement).toBe(35);
    expect(c).toMatchObject({ currentAge: 30, retirementAge: 65, currentSavings: 20000, monthlyContribution: 500, annualReturnPct: 6, withdrawalRatePct: 4 });
    expect(completeResultValue(c)).toBe(c.nestEgg);
  });

  it('a complete ordinary result passes the guard with a positive nest egg', () => {
    const c = computeRetirement(vals());
    expect(completeResultValue(c)).toBeGreaterThan(20000);
  });

  it('zero savings funded by contributions is valid', () => {
    const c = computeRetirement(vals({ currentSavings: '', monthlyContribution: '300' }));
    expect(completeResultValue(c)).toBeGreaterThan(0);
    expect(c.currentSavings).toBe(0);
  });

  it('zero return → zero earnings, still complete', () => {
    const c = computeRetirement(vals({ annualReturnPct: '0' }));
    expect(c.totalEarnings).toBeCloseTo(0, 6);
    expect(Number.isNaN(completeResultValue(c))).toBe(false);
  });

  it('zero withdrawal rate → zero income, still complete', () => {
    const c = computeRetirement(vals({ withdrawalRatePct: '0' }));
    expect(c.estimatedAnnualIncome).toBe(0);
    expect(completeResultValue(c)).toBe(c.nestEgg);
  });

  it('rejects tampered / inconsistent / out-of-domain results', () => {
    const c = computeRetirement(vals());
    expect(Number.isNaN(completeResultValue({ ...c, estimatedAnnualIncome: c.estimatedAnnualIncome + 500 }))).toBe(true);
    expect(Number.isNaN(completeResultValue({ ...c, totalEarnings: -1 } as RetirementComputed))).toBe(true);
    expect(Number.isNaN(completeResultValue({ ...c, nestEgg: Number.NaN } as RetirementComputed))).toBe(true);
    expect(Number.isNaN(completeResultValue({ ...c, retirementAge: c.currentAge } as RetirementComputed))).toBe(true);
    expect(Number.isNaN(completeResultValue({ ...c, annualReturnPct: -1 } as RetirementComputed))).toBe(true);
  });
});

describe('retirement binding — description + DOM', () => {
  it('announces the dominant projected balance', () => {
    const c = computeRetirement(vals({ currentSavings: '100000', monthlyContribution: '0', annualReturnPct: '0', currentAge: '40', retirementAge: '60' }));
    expect(describeRetirementResult(c)).toBe('Projected retirement balance: $100,000.00.');
  });

  it('readValues reads all six fields', () => {
    const { root } = mockRoot({ currentAge: '35', retirementAge: '65', currentSavings: '50000', monthlyContribution: '400', annualReturnPct: '5', withdrawalRatePct: '4' });
    expect(retirementBinding.readValues(root)).toEqual({
      currentAge: '35', retirementAge: '65', currentSavings: '50000', monthlyContribution: '400', annualReturnPct: '5', withdrawalRatePct: '4',
    });
  });

  it('resetValues clears the personal fields but not the withdrawal-rate default (island restores it)', () => {
    const { root, store } = mockRoot({ currentAge: '35', retirementAge: '65', currentSavings: '50000', monthlyContribution: '400', annualReturnPct: '5', withdrawalRatePct: '4' });
    retirementBinding.resetValues(root, 'personal');
    expect(store.currentAge.value).toBe('');
    expect(store.retirementAge.value).toBe('');
    expect(store.currentSavings.value).toBe('');
    expect(store.monthlyContribution.value).toBe('');
    expect(store.annualReturnPct.value).toBe('');
    expect(store.withdrawalRatePct.value).toBe('4'); // untouched by the binding
  });
});
