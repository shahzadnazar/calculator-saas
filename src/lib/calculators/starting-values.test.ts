import { describe, it, expect } from 'vitest';
import { isResultUsable } from '@lib/result/form-runtime';
import { AMORTIZATION_STARTING_VALUES, amortizationBinding, computeAmortization } from './amortization-form';
import { LOAN_STARTING_VALUES, loanBinding } from './loan-form';
import { HOME_EQUITY_STARTING_VALUES, homeEquityBinding } from './home-equity-loan-form';
import { PAYMENT_STARTING_VALUES, paymentBinding, computePayment } from './payment-form';
import { GPA_STARTING_ROWS, gpaBinding } from './gpa-form';
import { GRADE_POINTS } from './gpa';

/**
 * Run the EXACT sequence `mountFormCalculator`'s `prefill` trigger runs — the
 * binding's own validate, then compute, then the runtime's shared usability gate
 * — so these tests fail for the same reason the live page would.
 */
const gate = <V, R>(binding: any, values: V) => {
  const validation = binding.validate(values);
  if (!validation.ok) return { validation, usable: false, result: null as R | null };
  const result = binding.compute(values) as R;
  return { validation, usable: isResultUsable(binding, result), result };
};

/**
 * The five arrive-filled calculators (amortization, loan, home equity, payment,
 * GPA) render these values into the form and the runtime computes them silently
 * on mount. If a starting value ever fails validation or yields an unusable
 * result, the page greets the visitor with an error they did not cause — so each
 * set is pinned here against the SAME validate + compute + usability gate the
 * runtime runs.
 *
 * These are OUR values, not the visitor's: Reset still clears the form rather
 * than restoring them.
 */

describe('amortization starting values', () => {
  it('pass validation and the runtime usability gate', () => {
    const { validation, usable } = gate(amortizationBinding, { ...AMORTIZATION_STARTING_VALUES });
    expect(validation).toEqual({ ok: true });
    expect(usable).toBe(true);
  });

  it('are a realistic 30-year mortgage-sized loan', () => {
    const r = computeAmortization({ ...AMORTIZATION_STARTING_VALUES });
    expect(r.monthlyPayment).toBeGreaterThan(1000);
    expect(r.monthlyPayment).toBeLessThan(2500);
  });
});

describe('loan starting values', () => {
  it('pass validation and the runtime usability gate', () => {
    const { validation, usable } = gate(loanBinding, { ...LOAN_STARTING_VALUES });
    expect(validation).toEqual({ ok: true });
    expect(usable).toBe(true);
  });
});

describe('home equity starting values', () => {
  it('pass validation and the runtime usability gate', () => {
    const { validation, usable } = gate(homeEquityBinding, { ...HOME_EQUITY_STARTING_VALUES });
    expect(validation).toEqual({ ok: true });
    expect(usable).toBe(true);
  });

  it('leave headroom: the loan is well inside 85% LTV less the balance owed', () => {
    const v = HOME_EQUITY_STARTING_VALUES;
    const available =
      (Number(v.homeValue) * Number(v.maxLtvPct)) / 100 - Number(v.mortgageBalance);
    expect(available).toBeGreaterThan(0);
    expect(Number(v.loanAmount)).toBeLessThanOrEqual(available);
  });
});

describe('payment starting values', () => {
  it('pass validation and the runtime usability gate in the default term mode', () => {
    const { validation, usable } = gate(paymentBinding, { ...PAYMENT_STARTING_VALUES });
    expect(validation).toEqual({ ok: true });
    expect(usable).toBe(true);
  });

  it('also fill the OTHER mode, so switching lands on a result not an empty field', () => {
    const { validation, usable } = gate(paymentBinding, {
      ...PAYMENT_STARTING_VALUES,
      mode: 'payment' as const,
    });
    expect(validation).toEqual({ ok: true });
    expect(usable).toBe(true);
  });

  it('clear the monthly interest, so payoff mode never starts on "never pays off"', () => {
    const v = PAYMENT_STARTING_VALUES;
    const monthlyInterest = (Number(v.principal) * Number(v.annualRatePct)) / 100 / 12;
    expect(Number(v.payment)).toBeGreaterThan(monthlyInterest);
    const r = computePayment({ ...v, mode: 'payment' });
    expect(r.status).not.toBe('never');
  });
});

describe('GPA starting rows', () => {
  const withIds = () =>
    GPA_STARTING_ROWS.map((r, i) => ({ id: `r${i}`, grade: r.grade, credits: r.credits }));

  it('use only grades that exist in the published scale', () => {
    const labels = new Set(GRADE_POINTS.map((g) => g.label));
    for (const row of GPA_STARTING_ROWS) expect(labels.has(row.grade)).toBe(true);
  });

  it('pass validation and the runtime usability gate', () => {
    const { validation, usable } = gate(gpaBinding, { rows: withIds() });
    expect(validation).toEqual({ ok: true });
    expect(usable).toBe(true);
  });

  it('compute a finite GPA on the 0–4 scale', () => {
    const value = gpaBinding.resultValue(gpaBinding.compute({ rows: withIds() }));
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThanOrEqual(4);
  });

  it('seed more than one row, so the visitor sees the multi-course shape', () => {
    expect(GPA_STARTING_ROWS.length).toBeGreaterThan(1);
  });
});
