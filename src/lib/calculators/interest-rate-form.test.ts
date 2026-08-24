import { describe, it, expect } from 'vitest';
import {
  validateInterestRate,
  computeInterestRate,
  completeInterestRateValue,
  presentInterestRate,
  describeInterestRate,
  spokenPercent,
  interestRateBinding,
  MSG,
  type InterestRateComputed,
  type InterestRateFormValues,
} from './interest-rate-form';
import { pmt } from '@lib/finance';

/**
 * Interest Rate form-binding tests (R15B3 Commit 2 — Loan family follow-on, 3 of 3).
 * Exercise the VALIDATION / PRESENTATION boundary only — the pure solver
 * (solveAnnualRate → @lib/finance `pmt`) is unchanged and separately frozen by
 * interest-rate.test.ts + finance.test.ts. Covers strict validation (amount > 0,
 * payment > 0, whole term ≥ 1 month), the cross-field FEASIBILITY rule (a payment
 * below principal ÷ months cannot amortize the loan — rejected, where the pure
 * solver floors to a misleading 0), pass-through computation, the complete-result
 * guard (payment reconciliation via the unchanged `pmt`; NaN sentinel; NO
 * isUsableResult), and the presentation / announcement helpers.
 */

const V = (over: Partial<InterestRateFormValues> = {}): InterestRateFormValues => ({
  amount: '20000',
  payment: '377.42',
  months: '60',
  ...over,
});
const ok = (r: ReturnType<typeof validateInterestRate>) => r.ok === true;
const err = (r: ReturnType<typeof validateInterestRate>, f: string) =>
  (r as { fieldErrors: Record<string, string> }).fieldErrors[f];
const rejects = (c: InterestRateComputed) => Number.isNaN(completeInterestRateValue(c));

/** The payment for a known annual rate — used to round-trip compute back to the rate. */
const payFor = (amount: number, annualPct: number, months: number) => pmt(amount, annualPct / 100 / 12, months);

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe('interest rate binding — contract', () => {
  it('does NOT define isUsableResult (the guard lives in resultValue)', () => {
    expect(interestRateBinding.isUsableResult).toBeUndefined();
    expect(interestRateBinding.resultValue).toBe(completeInterestRateValue);
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('interest rate binding — validation (strict, never Number()||0)', () => {
  it('accepts a well-formed set', () => {
    expect(ok(validateInterestRate(V()))).toBe(true);
    expect(ok(validateInterestRate(V({ amount: '12000', payment: '1000', months: '12' })))).toBe(true); // 0% boundary
    expect(ok(validateInterestRate(V({ amount: '1000', payment: '1000', months: '1' })))).toBe(true); // feasible 1-month
  });

  it('amount required and strictly greater than zero', () => {
    expect(err(validateInterestRate(V({ amount: '' })), 'amount')).toBe(MSG.amountRequired);
    expect(err(validateInterestRate(V({ amount: '   ' })), 'amount')).toBe(MSG.amountRequired);
    for (const bad of ['0', '-1', 'abc', 'Infinity']) {
      expect(err(validateInterestRate(V({ amount: bad })), 'amount')).toBe(MSG.amountPositive);
    }
  });

  it('payment required and strictly greater than zero', () => {
    expect(err(validateInterestRate(V({ payment: '' })), 'payment')).toBe(MSG.paymentRequired);
    for (const bad of ['0', '-1', 'abc', 'Infinity']) {
      expect(err(validateInterestRate(V({ payment: bad })), 'payment')).toBe(MSG.paymentPositive);
    }
  });

  it('term required whole ≥ 1 month — fractional / zero / negative rejected, never rounded', () => {
    expect(err(validateInterestRate(V({ months: '' })), 'months')).toBe(MSG.termRequired);
    for (const bad of ['0', '0.5', '2.5', '-5', 'abc']) {
      expect(err(validateInterestRate(V({ months: bad })), 'months')).toBe(MSG.termWhole);
    }
    // A feasible payment (≥ principal ÷ months for every term below) isolates the term-parse check.
    for (const good of ['1', '60', '360', '600']) expect(ok(validateInterestRate({ amount: '1000', payment: '1000', months: good }))).toBe(true);
  });

  it('feasibility: a payment below the zero-interest minimum (principal ÷ months) is rejected on the payment field', () => {
    // 20000 / 12 = 1666.67 minimum; 100 can never repay it.
    expect(err(validateInterestRate(V({ payment: '100', months: '12' })), 'payment')).toBe(MSG.infeasible);
  });

  it('feasibility: a payment EXACTLY at the zero-interest minimum is valid (0% boundary)', () => {
    // 12000 / 12 = 1000 = payment.
    expect(ok(validateInterestRate(V({ amount: '12000', payment: '1000', months: '12' })))).toBe(true);
  });

  it('feasibility never fires when the payment already has a range error', () => {
    // payment 0 → positive error, NOT the infeasible message.
    expect(err(validateInterestRate(V({ payment: '0', months: '12' })), 'payment')).toBe(MSG.paymentPositive);
  });

  it('reports every field error together on an empty submission', () => {
    const r = validateInterestRate({ amount: '', payment: '', months: '' });
    for (const f of ['amount', 'payment', 'months']) expect(err(r, f)).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/* Computation (pass-through)                                          */
/* ------------------------------------------------------------------ */

describe('interest rate binding — computation', () => {
  it('round-trips a pmt-generated payment back to its rate', () => {
    const payment = payFor(20000, 6, 60);
    const c = computeInterestRate(V({ payment: String(payment) }));
    expect(c.annualRate).toBeCloseTo(6, 6);
    expect(c.monthlyRate).toBeCloseTo(0.5, 6);
    expect(c.totalRepaid).toBeCloseTo(payment * 60, 6);
  });

  it('the zero-interest boundary computes rate 0', () => {
    const c = computeInterestRate(V({ amount: '12000', payment: '1000', months: '12' }));
    expect(c.annualRate).toBe(0);
    expect(c.monthlyRate).toBe(0);
    expect(c.totalRepaid).toBe(12000);
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

describe('interest rate binding — complete-result guard', () => {
  const good = computeInterestRate(V({ payment: String(payFor(20000, 7.5, 60)) }));

  it('returns the finite annual rate for a well-formed result', () => {
    expect(completeInterestRateValue(good)).toBe(good.annualRate);
    expect(Number.isFinite(completeInterestRateValue(good))).toBe(true);
  });

  it('accepts a valid 0% result (a finite 0 the default gate accepts)', () => {
    const zero = computeInterestRate(V({ amount: '12000', payment: '1000', months: '12' }));
    expect(completeInterestRateValue(zero)).toBe(0);
    expect(Number.isFinite(completeInterestRateValue(zero))).toBe(true);
  });

  it('rejects a non-finite or negative rate', () => {
    expect(rejects({ ...good, annualRate: Number.NaN })).toBe(true);
    expect(rejects({ ...good, annualRate: Number.POSITIVE_INFINITY })).toBe(true);
    expect(rejects({ ...good, annualRate: -1 })).toBe(true);
  });

  it('rejects a monthly rate that is not annual ÷ 12', () => {
    expect(rejects({ ...good, monthlyRate: good.monthlyRate + 1 })).toBe(true);
  });

  it('rejects a total-repaid that does not equal payment × months', () => {
    expect(rejects({ ...good, totalRepaid: good.totalRepaid + 100 })).toBe(true);
  });

  it('rejects a non-integer or sub-1 term', () => {
    expect(rejects({ ...good, months: 60.5 })).toBe(true);
    expect(rejects({ ...good, months: 0 })).toBe(true);
  });

  it('rejects a non-finite principal or payment', () => {
    expect(rejects({ ...good, amount: Number.NaN })).toBe(true);
    expect(rejects({ ...good, payment: Number.POSITIVE_INFINITY })).toBe(true);
  });

  it('rejects a result whose rate does not reconcile with the submitted payment through pmt', () => {
    // Keep the solved rate, but claim a different payment (+$100). pmt at the rate no
    // longer reproduces it, so the reconciliation fails.
    const bumped = good.payment + 100;
    expect(rejects({ ...good, payment: bumped, totalRepaid: bumped * good.months })).toBe(true);
  });

  it('rejects the frozen underpayment (solver floors to 0 but pmt(p,0,n)=p/n ≠ the tiny payment)', () => {
    const under = computeInterestRate(V({ amount: '20000', payment: '100', months: '12' }));
    expect(under.annualRate).toBe(0); // the frozen floor
    expect(rejects(under)).toBe(true); // ...but the guard rejects it
  });
});

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

describe('interest rate binding — presentation', () => {
  it('presents the dominant annual rate, a monthly rate, payment, amount, payments count and total', () => {
    const p = presentInterestRate(computeInterestRate(V({ payment: String(payFor(20000, 6, 60)) })));
    expect(p.rate).toBe('6%'); // formatPercent(6, 2)
    expect(p.monthlyRate).toBe('0.5%'); // 6 / 12
    expect(p.payment).toBe('$386.66'); // pmt(20000, 6%/12, 60)
    expect(p.amount).toBe('$20,000.00');
    expect(p.payments).toBe('60 monthly payments');
    expect(p.interpretation).toContain('6%');
    expect(p.interpretation).toContain('$20,000.00');
  });

  it('uses a singular label for a 1-month term', () => {
    const p = presentInterestRate(computeInterestRate(V({ amount: '1000', payment: '1100', months: '1' })));
    expect(p.payments).toBe('1 monthly payment');
  });

  it('spokenPercent reads at most two decimals with no trailing zeros', () => {
    expect(spokenPercent(5)).toBe('5 percent');
    expect(spokenPercent(5.05)).toBe('5.05 percent');
    expect(spokenPercent(0)).toBe('0 percent');
  });

  it('describeInterestRate leads with the estimated annual rate', () => {
    const c = computeInterestRate(V({ payment: String(payFor(20000, 6, 60)) }));
    expect(describeInterestRate(c)).toBe('Estimated annual interest rate: 6 percent.');
  });

  it('describeInterestRate announces a 0% result cleanly', () => {
    const zero = computeInterestRate(V({ amount: '12000', payment: '1000', months: '12' }));
    expect(describeInterestRate(zero)).toBe('Estimated annual interest rate: 0 percent.');
  });
});

/* ------------------------------------------------------------------ */
/* readValues / resetValues (mock root)                                */
/* ------------------------------------------------------------------ */

describe('interest rate binding — readValues / resetValues', () => {
  const mockRoot = () => {
    const inputs: Record<string, { value: string }> = {
      amount: { value: '20000' },
      payment: { value: '377.42' },
      months: { value: '60' },
    };
    return {
      querySelector: (sel: string) => {
        const m = /\[name="([^"]+)"\]/.exec(sel);
        return m ? inputs[m[1]] ?? null : null;
      },
      __inputs: inputs,
    } as unknown as HTMLElement & { __inputs: Record<string, { value: string }> };
  };

  it('reads all three fields', () => {
    expect(interestRateBinding.readValues(mockRoot())).toEqual({ amount: '20000', payment: '377.42', months: '60' });
  });

  it('reset clears every field', () => {
    const root = mockRoot();
    interestRateBinding.resetValues(root, 'personal');
    const inputs = (root as unknown as { __inputs: Record<string, { value: string }> }).__inputs;
    for (const k of Object.keys(inputs)) expect(inputs[k].value).toBe('');
  });
});
