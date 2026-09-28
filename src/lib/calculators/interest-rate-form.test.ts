import { describe, it, expect } from 'vitest';
import {
  INTEREST_RATE_EXAMPLE_VALUES,
  MAX_TERM_YEARS,
  MSG,
  completeInterestRateValue,
  computeInterestRate,
  describeInterestRate,
  interestRateBinding,
  presentInterestRate,
  spokenPercent,
  termInMonths,
  termLabel,
  validateInterestRate,
  type InterestRateComputed,
  type InterestRateFormValues,
} from './interest-rate-form';
import { type AmortizationResult } from './amortization';

/**
 * Interest rate binding — the solver's visitor-facing contract.
 *
 * The reference case ($32,000 repaid at $960 a month over 3 years implies 5.065%)
 * is pinned to the figure the result prints, and the guard tests then cover every
 * way a result could be internally inconsistent — including the one that matters
 * most here: a solved rate that does not reproduce the payment it was solved from.
 */

const FULL: InterestRateFormValues = {
  amount: '32000',
  payment: '960',
  termYears: '3',
  termMonths: '0',
};

const at = (over: Partial<InterestRateFormValues> = {}): InterestRateFormValues => ({
  ...FULL,
  ...over,
});
const errs = (r: ReturnType<typeof validateInterestRate>): Record<string, string> =>
  r.ok ? {} : (r.fieldErrors ?? {});
const cents = (n: number) => Math.round(n * 100) / 100;

describe('validation — the required fields', () => {
  it('accepts the reference entry', () => {
    expect(validateInterestRate(FULL)).toEqual({ ok: true });
  });

  it('requires a loan amount greater than zero', () => {
    expect(errs(validateInterestRate(at({ amount: '' }))).amount).toBe(MSG.amountRequired);
    for (const bad of ['0', '-100', 'abc']) {
      expect(errs(validateInterestRate(at({ amount: bad }))).amount).toBe(MSG.amountPositive);
    }
  });

  it('requires a monthly payment greater than zero', () => {
    expect(errs(validateInterestRate(at({ payment: '' }))).payment).toBe(MSG.paymentRequired);
    for (const bad of ['0', '-50', 'x']) {
      expect(errs(validateInterestRate(at({ payment: bad }))).payment).toBe(MSG.paymentPositive);
    }
  });
});

describe('validation — the term is two boxes but one quantity', () => {
  it('reads years and months together', () => {
    expect(termInMonths(at({ termYears: '3', termMonths: '0' }))).toBe(36);
    expect(termInMonths(at({ termYears: '', termMonths: '18' }))).toBe(18);
    expect(termInMonths(at({ termYears: '2', termMonths: '6' }))).toBe(30);
    expect(termInMonths(at({ termYears: '', termMonths: '' }))).toBe(0);
  });

  it('accepts years alone, months alone, or both', () => {
    expect(validateInterestRate(at({ termYears: '3', termMonths: '' }))).toEqual({ ok: true });
    expect(validateInterestRate(at({ termYears: '', termMonths: '36', payment: '960' }))).toEqual({
      ok: true,
    });
  });

  it('rejects a term of nothing at all, against the years box', () => {
    expect(errs(validateInterestRate(at({ termYears: '', termMonths: '' }))).termYears).toBe(
      MSG.termRequired,
    );
    expect(errs(validateInterestRate(at({ termYears: '0', termMonths: '0' }))).termYears).toBe(
      MSG.termRequired,
    );
  });

  it(`rejects a term beyond ${MAX_TERM_YEARS} years`, () => {
    expect(errs(validateInterestRate(at({ termYears: '31' }))).termYears).toBe(MSG.termMax);
    expect(errs(validateInterestRate(at({ termYears: '30', termMonths: '1' }))).termYears).toBe(
      MSG.termMax,
    );
  });

  it('rejects a fractional or negative box, never rounding it', () => {
    expect(errs(validateInterestRate(at({ termYears: '3.5' }))).termYears).toBe(MSG.termWhole);
    expect(errs(validateInterestRate(at({ termMonths: '2.5' }))).termMonths).toBe(MSG.termWholeMonths);
    expect(errs(validateInterestRate(at({ termYears: '-1' }))).termYears).toBe(MSG.termWhole);
  });
});

describe('validation — the feasibility check', () => {
  it('rejects a payment too small to ever repay the loan', () => {
    // $32,000 over 36 months needs at least $888.89 a month even at 0%.
    expect(errs(validateInterestRate(at({ payment: '500' }))).payment).toBe(MSG.infeasible);
  });

  it('accepts the exact zero-interest payment', () => {
    const exact = (32000 / 36).toFixed(2);
    expect(validateInterestRate(at({ payment: exact }))).toEqual({ ok: true });
  });

  it('does not fire when another field is already wrong', () => {
    const e = errs(validateInterestRate(at({ payment: '500', amount: '' })));
    expect(e.amount).toBeTruthy();
    // The infeasibility is not reported against a loan whose amount is unknown.
    expect(e.payment).toBeUndefined();
  });
});

describe('computeInterestRate — the reference case', () => {
  const r = computeInterestRate(FULL);

  it('solves the rate the reference reports', () => {
    expect(r.annualRate).toBeCloseTo(5.0648, 3);
    expect(r.monthlyRate).toBeCloseTo(5.0648 / 12, 4);
    expect(r.months).toBe(36);
  });

  it('reports what the loan costs', () => {
    expect(cents(r.totalRepaid)).toBe(34560);
    expect(cents(r.totalInterest)).toBe(2560);
  });

  it('carries a schedule of the loan the answer describes', () => {
    expect(r.plan.schedule).toHaveLength(36);
    expect(r.plan.loanAmount).toBe(32000);
    // The solved rate is exactly the one that clears the balance on the last payment.
    expect(r.plan.schedule[35].balance).toBeCloseTo(0, 4);
    expect(cents(r.plan.schedule[0].payment)).toBe(960);
  });

  it('the schedule interest agrees with the headline total', () => {
    const summed = r.plan.schedule.reduce((s, x) => s + x.interest, 0);
    expect(summed).toBeCloseTo(r.totalInterest, 2);
  });

  it('a zero-interest loan is a valid 0% result', () => {
    const z = computeInterestRate(at({ amount: '36000', payment: '1000', termYears: '3' }));
    expect(z.annualRate).toBeCloseTo(0, 6);
    expect(cents(z.totalInterest)).toBe(0);
  });
});

describe('the complete-result guard', () => {
  const good = computeInterestRate(FULL);
  const clone = (c: InterestRateComputed): InterestRateComputed => ({
    ...c,
    plan: {
      ...c.plan,
      schedule: c.plan.schedule.map((x) => ({ ...x })),
      annual: c.plan.annual.map((x) => ({ ...x })),
    } as AmortizationResult,
  });
  const broken = (mutate: (c: InterestRateComputed) => void): InterestRateComputed => {
    const copy = clone(good);
    mutate(copy);
    return copy;
  };

  it('accepts a result that reconciles', () => {
    expect(completeInterestRateValue(good)).toBeCloseTo(5.0648, 3);
  });

  it('rejects a rate that does not reproduce the payment it was solved from', () => {
    expect(completeInterestRateValue(broken((c) => (c.annualRate = 12)))).toBeNaN();
    expect(completeInterestRateValue(broken((c) => (c.payment = 1200)))).toBeNaN();
  });

  it('rejects a monthly rate that is not the annual one over twelve', () => {
    expect(completeInterestRateValue(broken((c) => (c.monthlyRate += 0.5)))).toBeNaN();
  });

  it('rejects totals that do not follow from the inputs', () => {
    expect(completeInterestRateValue(broken((c) => (c.totalRepaid += 100)))).toBeNaN();
    expect(completeInterestRateValue(broken((c) => (c.totalInterest += 100)))).toBeNaN();
  });

  it('rejects a non-finite or impossible figure', () => {
    expect(completeInterestRateValue(broken((c) => (c.annualRate = Number.NaN)))).toBeNaN();
    expect(completeInterestRateValue(broken((c) => (c.annualRate = -1)))).toBeNaN();
    expect(completeInterestRateValue(broken((c) => (c.amount = 0)))).toBeNaN();
    expect(completeInterestRateValue(broken((c) => (c.months = 36.5)))).toBeNaN();
  });

  it('rejects a schedule that does not describe the same loan', () => {
    expect(completeInterestRateValue(broken((c) => c.plan.schedule.pop()))).toBeNaN();
    expect(completeInterestRateValue(broken((c) => (c.plan.loanAmount += 500)))).toBeNaN();
    expect(completeInterestRateValue(broken((c) => (c.plan.schedule[35].balance = 400)))).toBeNaN();
    expect(completeInterestRateValue(broken((c) => (c.plan.schedule[4].interest += 200)))).toBeNaN();
  });

  it('rejects a term beyond the ceiling', () => {
    expect(completeInterestRateValue(broken((c) => (c.months = 400)))).toBeNaN();
  });
});

describe('presentation', () => {
  const p = presentInterestRate(computeInterestRate(FULL));

  it('prints the rate to three decimals, as the reference does', () => {
    expect(p.rate).toBe('5.065%');
    expect(p.monthlyRate).toBe('0.422%');
  });

  it('labels and prints the two cost figures', () => {
    expect(p.paymentsLabel).toBe('Total of 36 monthly payments');
    expect(p.totalRepaid).toBe('$34,560.00');
    expect(p.totalInterest).toBe('$2,560.00');
  });

  it('says the whole thing in a sentence', () => {
    expect(p.interpretation).toBe(
      'To repay $32,000.00 with 36 monthly payments of $960.00, the implied interest rate is about 5.065% a year (0.422% a month).',
    );
  });

  it('announces the rate', () => {
    expect(describeInterestRate(computeInterestRate(FULL))).toBe(
      'Estimated annual interest rate: 5.065 percent.',
    );
    expect(spokenPercent(5)).toBe('5 percent');
    expect(spokenPercent(0)).toBe('0 percent');
  });

  it('labels a term in years and months, dropping the empty half', () => {
    expect(termLabel(36)).toBe('3 years');
    expect(termLabel(18)).toBe('1 year 6 months');
    expect(termLabel(7)).toBe('7 months');
    expect(termLabel(12)).toBe('1 year');
    expect(termLabel(0)).toBe('0 months');
  });

  it('says one payment, not one payments', () => {
    const one = presentInterestRate(
      computeInterestRate(at({ amount: '1000', payment: '1010', termYears: '', termMonths: '1' })),
    );
    expect(one.paymentsLabel).toBe('Total of 1 monthly payment');
  });
});

describe('the worked example', () => {
  it('validates, so the example a visitor sees is a real calculation', () => {
    expect(validateInterestRate(INTEREST_RATE_EXAMPLE_VALUES)).toEqual({ ok: true });
  });

  it('is the published reference case and passes the same guard as any other result', () => {
    const r = computeInterestRate(INTEREST_RATE_EXAMPLE_VALUES);
    expect(interestRateBinding.resultValue(r)).toBeCloseTo(5.0648, 3);
    expect(presentInterestRate(r).rate).toBe('5.065%');
  });
});
