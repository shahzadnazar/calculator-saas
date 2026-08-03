import { describe, it, expect } from 'vitest';
import {
  validateLoanValues,
  computeLoan,
  completeLoanValue,
  describeLoanResult,
  spokenUSD,
  payoffLabel,
  loanBinding,
  MAX_TERM_YEARS,
  type LoanComputed,
  type LoanFormValues,
} from './loan-form';

/**
 * Loan form-binding tests (R15B1 Commit 2). Exercise the VALIDATION / PRESENTATION
 * boundary only — the pure engine (calculateLoan → @lib/finance) is unchanged and
 * separately frozen by loan.test.ts + finance.test.ts. Covers: strict validation
 * (amount > 0, rate >= 0, whole term 1–30), pass-through computation, the
 * complete-result guard (summary + monthly + yearly reconciliation; NaN sentinel;
 * NO isUsableResult), announcement/payoff helpers, and readValues/resetValues.
 */

const v = (amount: string, annualInterestRate = '5', termYears = '5'): LoanFormValues => ({
  amount,
  annualInterestRate,
  termYears,
});
const ok = (r: ReturnType<typeof validateLoanValues>) => r.ok === true;
const err = (r: ReturnType<typeof validateLoanValues>, field: string) =>
  (r as { fieldErrors: Record<string, string> }).fieldErrors[field];
const rejects = (r: LoanComputed) => Number.isNaN(completeLoanValue(r));

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe('loan binding — contract', () => {
  it('does NOT define isUsableResult (the guard lives in resultValue)', () => {
    expect(loanBinding.isUsableResult).toBeUndefined();
    expect(loanBinding.resultValue).toBe(completeLoanValue);
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('loan binding — validation (strict, never Number()||0)', () => {
  it('accepts a well-formed loan (incl. 0% and the 30-year ceiling)', () => {
    expect(ok(validateLoanValues(v('20000', '5', '5')))).toBe(true);
    expect(ok(validateLoanValues(v('12000', '0', '1')))).toBe(true);
    expect(ok(validateLoanValues(v('250000', '6.5', '30')))).toBe(true);
  });
  it('amount required and strictly greater than zero', () => {
    expect(err(validateLoanValues(v('', '5', '5')), 'amount')).toBe('Enter a loan amount.');
    expect(err(validateLoanValues(v('   ', '5', '5')), 'amount')).toBe('Enter a loan amount.');
    for (const bad of ['0', '-100', 'abc', 'Infinity']) {
      expect(err(validateLoanValues(v(bad, '5', '5')), 'amount')).toBe('Enter a loan amount greater than zero.');
    }
  });
  it('rate required and >= 0 (0% valid, negative/garbage invalid)', () => {
    expect(err(validateLoanValues(v('20000', '', '5')), 'annualInterestRate')).toBe('Enter an interest rate.');
    expect(err(validateLoanValues(v('20000', '-1', '5')), 'annualInterestRate')).toBe('Enter an interest rate of zero or more.');
    expect(err(validateLoanValues(v('20000', 'x', '5')), 'annualInterestRate')).toBe('Enter an interest rate of zero or more.');
    expect(ok(validateLoanValues(v('20000', '0', '5')))).toBe(true);
  });
  it('term required whole 1..30 — fractional / zero / >30 rejected, never rounded', () => {
    const msg = `Enter a whole loan term from 1 to ${MAX_TERM_YEARS} years.`;
    for (const bad of ['', '0', '0.5', '2.5', '31', '-5', 'x']) {
      expect(err(validateLoanValues(v('20000', '5', bad)), 'termYears')).toBe(msg);
    }
    for (const good of ['1', '15', '30']) expect(ok(validateLoanValues(v('20000', '5', good)))).toBe(true);
  });
  it('reports all three field errors together on an empty submission', () => {
    const r = validateLoanValues(v('', '', ''));
    expect(err(r, 'amount')).toBeDefined();
    expect(err(r, 'annualInterestRate')).toBeDefined();
    expect(err(r, 'termYears')).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/* Computation (pass-through)                                          */
/* ------------------------------------------------------------------ */

describe('loan binding — computation', () => {
  it('computes the ordinary loan exactly as calculateLoan', () => {
    const r = computeLoan(v('20000', '5', '5'));
    expect(r.monthlyPayment).toBeCloseTo(377.42, 2);
    expect(r.payoffMonths).toBe(60);
    expect(r.yearlySchedule.length).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

describe('loan binding — complete-result guard', () => {
  const good = computeLoan(v('250000', '6.5', '30'));

  it('returns the finite monthly payment for a well-formed result', () => {
    expect(completeLoanValue(good)).toBeCloseTo(good.monthlyPayment, 10);
    expect(Number.isFinite(completeLoanValue(good))).toBe(true);
  });
  it('accepts a 0% principal-only loan', () => {
    expect(Number.isFinite(completeLoanValue(computeLoan(v('12000', '0', '1'))))).toBe(true);
  });
  it('rejects a non-finite or negative monthly payment', () => {
    expect(rejects({ ...good, monthlyPayment: Number.POSITIVE_INFINITY })).toBe(true);
    expect(rejects({ ...good, monthlyPayment: Number.NaN })).toBe(true);
    expect(rejects({ ...good, monthlyPayment: -1 })).toBe(true);
  });
  it('rejects a payoffMonths out of range / non-integer / mismatched with the schedule', () => {
    expect(rejects({ ...good, payoffMonths: 0 })).toBe(true);
    expect(rejects({ ...good, payoffMonths: 361 })).toBe(true);
    expect(rejects({ ...good, payoffMonths: 30.5 })).toBe(true);
    expect(rejects({ ...good, payoffMonths: 359 })).toBe(true); // != schedule.length (360)
  });
  it('rejects a monthly schedule that does not reconcile (broken principal sum)', () => {
    const broken = {
      ...good,
      schedule: good.schedule.map((r, i) => (i === 0 ? { ...r, principal: r.principal + 5000, payment: r.payment + 5000 } : r)),
    };
    expect(rejects(broken)).toBe(true);
  });
  it('rejects a schedule whose final balance is not ~0', () => {
    const broken = {
      ...good,
      schedule: good.schedule.map((r, i) => (i === good.schedule.length - 1 ? { ...r, balance: 1000 } : r)),
    };
    expect(rejects(broken)).toBe(true);
  });
  it('rejects a non-finite or negative schedule row', () => {
    expect(rejects({ ...good, schedule: good.schedule.map((r, i) => (i === 3 ? { ...r, interest: Number.NaN } : r)) })).toBe(true);
    expect(rejects({ ...good, schedule: good.schedule.map((r, i) => (i === 3 ? { ...r, principal: -1, payment: -1 } : r)) })).toBe(true);
  });
  it('rejects out-of-order periods', () => {
    expect(rejects({ ...good, schedule: [...good.schedule].reverse() })).toBe(true);
  });
  it('rejects a yearly schedule that does not reconcile with the monthly schedule', () => {
    const broken = {
      ...good,
      yearlySchedule: good.yearlySchedule.map((y, i) => (i === 0 ? { ...y, principal: y.principal + 9999 } : y)),
    };
    expect(rejects(broken)).toBe(true);
  });
  it('rejects a yearly schedule of the wrong length', () => {
    expect(rejects({ ...good, yearlySchedule: good.yearlySchedule.slice(0, 29) })).toBe(true);
  });
  it('rejects the frozen Infinity-amount malformed result', () => {
    expect(rejects(computeLoan(v('Infinity', '5', '5')))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

describe('loan binding — presentation helpers', () => {
  it('payoffLabel formats whole years and partial years', () => {
    expect(payoffLabel(60)).toBe('5 years');
    expect(payoffLabel(12)).toBe('1 year');
    expect(payoffLabel(30)).toBe('2 years 6 months');
    expect(payoffLabel(0)).toBe('0 months');
  });
  it('spokenUSD reads dollars and cents', () => {
    expect(spokenUSD(1580.17)).toBe('1580 dollars and 17 cents');
    expect(spokenUSD(1000)).toBe('1000 dollars');
    expect(spokenUSD(1)).toBe('1 dollar');
  });
  it('describeLoanResult announces payment, count and total interest', () => {
    expect(describeLoanResult(computeLoan(v('250000', '6.5', '30')))).toBe(
      'Your estimated monthly payment is 1580 dollars and 17 cents over 360 monthly payments, with 318861 dollars and 22 cents in total interest.',
    );
  });
});

/* ------------------------------------------------------------------ */
/* readValues / resetValues (mock root)                                */
/* ------------------------------------------------------------------ */

describe('loan binding — readValues / resetValues', () => {
  const mockRoot = () => {
    const inputs: Record<string, { value: string }> = {
      amount: { value: '20000' },
      annualInterestRate: { value: '5' },
      termYears: { value: '5' },
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
    expect(loanBinding.readValues(mockRoot())).toEqual({ amount: '20000', annualInterestRate: '5', termYears: '5' });
  });
  it('reset clears all fields', () => {
    const root = mockRoot();
    loanBinding.resetValues(root, 'personal');
    const inputs = (root as unknown as { __inputs: Record<string, { value: string }> }).__inputs;
    expect(inputs.amount.value).toBe('');
    expect(inputs.annualInterestRate.value).toBe('');
    expect(inputs.termYears.value).toBe('');
  });
});
