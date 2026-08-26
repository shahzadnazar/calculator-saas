import { describe, it, expect } from 'vitest';
import {
  validateLoanValues,
  computeLoan,
  completeLoanValue,
  describeLoanResult,
  primaryLabel,
  totalLabel,
  periodHeading,
  loanTermMonths,
  spokenUSD,
  payoffLabel,
  loanBinding,
  LOAN_EXAMPLE_VALUES,
  MAX_TERM_YEARS,
  MONTHS_MESSAGE,
  TERM_MESSAGE,
  TERM_TOTAL_MESSAGE,
  type LoanComputed,
  type LoanFormValues,
} from './loan-form';

/**
 * Loan form-binding tests. Exercise the VALIDATION / PRESENTATION boundary only —
 * the pure engine (calculateExtendedLoan) is separately frozen by loan.test.ts,
 * which pins every published reference figure. Covers: strict validation across
 * the three modes (amount > 0, rate >= 0, whole years 0–30 + whole months 0–11
 * totalling at least one month), the complete-result guard (summary + both
 * schedules reconcile; NaN sentinel; NO isUsableResult), the mode-dependent
 * labels and announcement, and readValues / resetValues.
 */

const v = (over: Partial<LoanFormValues> = {}): LoanFormValues => ({
  mode: 'amortized',
  amount: '20000',
  annualInterestRate: '5',
  termYears: '5',
  termMonths: '',
  compoundKey: 'monthly',
  paybackKey: 'month',
  ...over,
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
  it('the worked example is a complete, valid set of values', () => {
    expect(ok(validateLoanValues(LOAN_EXAMPLE_VALUES))).toBe(true);
    expect(Number.isFinite(completeLoanValue(computeLoan(LOAN_EXAMPLE_VALUES)))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('loan binding — validation (strict, never Number()||0)', () => {
  it('accepts a well-formed loan in every mode (incl. 0% and the 30-year ceiling)', () => {
    for (const mode of ['amortized', 'deferred', 'bond']) {
      expect(ok(validateLoanValues(v({ mode })))).toBe(true);
      expect(ok(validateLoanValues(v({ mode, annualInterestRate: '0', termYears: '1' })))).toBe(true);
      expect(ok(validateLoanValues(v({ mode, termYears: String(MAX_TERM_YEARS) })))).toBe(true);
    }
  });
  it('amount required and strictly greater than zero', () => {
    expect(err(validateLoanValues(v({ amount: '' })), 'amount')).toBe('Enter a loan amount.');
    expect(err(validateLoanValues(v({ amount: '   ' })), 'amount')).toBe('Enter a loan amount.');
    for (const bad of ['0', '-100', 'abc', 'Infinity']) {
      expect(err(validateLoanValues(v({ amount: bad })), 'amount')).toBe(
        'Enter a loan amount greater than zero.',
      );
    }
  });
  it('bond mode asks for the amount DUE, so its amount messages name that', () => {
    expect(err(validateLoanValues(v({ mode: 'bond', amount: '' })), 'amount')).toBe(
      'Enter the amount due at maturity.',
    );
    expect(err(validateLoanValues(v({ mode: 'bond', amount: '0' })), 'amount')).toBe(
      'Enter an amount due greater than zero.',
    );
  });
  it('rate required and >= 0 (0% valid, negative/garbage invalid)', () => {
    expect(err(validateLoanValues(v({ annualInterestRate: '' })), 'annualInterestRate')).toBe(
      'Enter an interest rate.',
    );
    for (const bad of ['-1', 'x']) {
      expect(err(validateLoanValues(v({ annualInterestRate: bad })), 'annualInterestRate')).toBe(
        'Enter an interest rate of zero or more.',
      );
    }
    expect(ok(validateLoanValues(v({ annualInterestRate: '0' })))).toBe(true);
  });
  it('years must be whole and within 0..30 — fractional / negative / >30 rejected, never rounded', () => {
    for (const bad of ['', '0.5', '2.5', '31', '-5', 'x']) {
      expect(err(validateLoanValues(v({ termYears: bad })), 'termYears')).toBe(TERM_MESSAGE);
    }
    for (const good of ['1', '15', '30']) expect(ok(validateLoanValues(v({ termYears: good })))).toBe(true);
  });
  it('extra months are optional but must be whole and within 0..11', () => {
    expect(ok(validateLoanValues(v({ termMonths: '' })))).toBe(true);
    expect(ok(validateLoanValues(v({ termMonths: '0' })))).toBe(true);
    expect(ok(validateLoanValues(v({ termMonths: '11' })))).toBe(true);
    for (const bad of ['12', '-1', '1.5', 'x']) {
      expect(err(validateLoanValues(v({ termMonths: bad })), 'termMonths')).toBe(MONTHS_MESSAGE);
    }
  });
  it('0 years is valid when extra months carry the term, but 0y 0m is not a loan', () => {
    expect(ok(validateLoanValues(v({ termYears: '0', termMonths: '6' })))).toBe(true);
    expect(err(validateLoanValues(v({ termYears: '0', termMonths: '0' })), 'termYears')).toBe(
      TERM_TOTAL_MESSAGE,
    );
    expect(err(validateLoanValues(v({ termYears: '0', termMonths: '' })), 'termYears')).toBe(
      TERM_TOTAL_MESSAGE,
    );
  });
  it('reports every field error together on an empty submission', () => {
    const r = validateLoanValues(v({ amount: '', annualInterestRate: '', termYears: '' }));
    expect(err(r, 'amount')).toBeDefined();
    expect(err(r, 'annualInterestRate')).toBeDefined();
    expect(err(r, 'termYears')).toBeDefined();
  });
  it('an unknown mode falls back to amortized rather than failing', () => {
    expect(ok(validateLoanValues(v({ mode: 'nonsense' })))).toBe(true);
    expect(computeLoan(v({ mode: 'nonsense' })).mode).toBe('amortized');
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('loan binding — computation', () => {
  it('the amortized default (monthly compound, monthly payback) matches the classic loan', () => {
    const r = computeLoan(v());
    expect(r.mode).toBe('amortized');
    expect(r.primary).toBeCloseTo(377.42, 2);
    expect(r.paymentCount).toBe(60);
    expect(r.monthlySchedule.length).toBe(60);
    expect(r.yearlySchedule.length).toBe(5);
    expect(r.periodsPerYear).toBe(12);
  });
  it('extra months lengthen the term by whole months', () => {
    const r = computeLoan(v({ termYears: '5', termMonths: '6' }));
    expect(r.paymentCount).toBe(66);
    expect(loanTermMonths(r)).toBe(66);
  });
  it('the payback frequency changes the schedule cadence, not just the label', () => {
    const r = computeLoan(v({ paybackKey: 'quarter' }));
    expect(r.paymentCount).toBe(20);
    expect(r.periodsPerYear).toBe(4);
    expect(r.periodNoun).toBe('Quarter');
    expect(r.yearlySchedule.length).toBe(5);
  });
  it('compounding changes the answer (annually/APY costs less than daily at the same quoted rate)', () => {
    const apy = computeLoan(v({ compoundKey: 'annually' })).primary;
    const daily = computeLoan(v({ compoundKey: 'daily' })).primary;
    expect(apy).toBeLessThan(daily);
  });
  it('deferred grows the balance to a lump sum and repays nothing before maturity', () => {
    const r = computeLoan(v({ mode: 'deferred', termYears: '10' }));
    expect(r.paymentCount).toBe(0);
    expect(r.primary).toBeGreaterThan(20000);
    expect(r.totalPaid).toBeCloseTo(r.primary, 6);
    expect(r.monthlySchedule.every((row) => row.ending > row.beginning)).toBe(true);
  });
  it('bond solves the same growth backwards: today’s value of the amount due', () => {
    const r = computeLoan(v({ mode: 'bond', amount: '100000', termYears: '10' }));
    expect(r.primary).toBeLessThan(100000);
    expect(r.totalPaid).toBeCloseTo(100000, 6);
    expect(r.totalInterest).toBeCloseTo(100000 - r.primary, 6);
    // The bond's present value grown forward is the amount due again.
    const forward = computeLoan(v({ mode: 'deferred', amount: String(r.primary), termYears: '10' }));
    expect(forward.primary).toBeCloseTo(100000, 4);
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

describe('loan binding — complete-result guard', () => {
  const good = computeLoan(v({ amount: '250000', annualInterestRate: '6.5', termYears: '30' }));
  const deferred = computeLoan(v({ mode: 'deferred', amount: '100000', termYears: '10' }));

  it('returns the finite dominant figure for a well-formed result in every mode', () => {
    for (const r of [good, deferred, computeLoan(v({ mode: 'bond', amount: '100000', termYears: '10' }))]) {
      expect(completeLoanValue(r)).toBeCloseTo(r.primary, 10);
      expect(Number.isFinite(completeLoanValue(r))).toBe(true);
    }
  });
  it('accepts a 0% principal-only loan', () => {
    expect(
      Number.isFinite(completeLoanValue(computeLoan(v({ amount: '12000', annualInterestRate: '0', termYears: '1' })))),
    ).toBe(true);
  });
  it('rejects an invalid result outright', () => {
    expect(rejects({ ...good, valid: false })).toBe(true);
    expect(rejects(computeLoan(v({ amount: 'Infinity' })))).toBe(true);
    expect(rejects(computeLoan(v({ termYears: '0', termMonths: '0' })))).toBe(true);
  });
  it('rejects a non-finite or negative headline figure', () => {
    expect(rejects({ ...good, primary: Number.POSITIVE_INFINITY })).toBe(true);
    expect(rejects({ ...good, primary: Number.NaN })).toBe(true);
    expect(rejects({ ...good, primary: -1 })).toBe(true);
  });
  it('rejects non-finite or negative totals', () => {
    expect(rejects({ ...good, totalInterest: Number.NaN })).toBe(true);
    expect(rejects({ ...good, totalInterest: -1 })).toBe(true);
    expect(rejects({ ...good, totalPaid: Number.POSITIVE_INFINITY })).toBe(true);
  });
  it('rejects an empty or over-long detailed schedule', () => {
    expect(rejects({ ...good, monthlySchedule: [] })).toBe(true);
    expect(rejects({ ...good, monthlySchedule: [...good.monthlySchedule, ...good.monthlySchedule] })).toBe(true);
  });
  it('rejects out-of-order or gapped periods in either schedule', () => {
    expect(rejects({ ...good, monthlySchedule: [...good.monthlySchedule].reverse() })).toBe(true);
    expect(rejects({ ...good, yearlySchedule: [...good.yearlySchedule].reverse() })).toBe(true);
  });
  it('rejects a non-finite or negative row', () => {
    const bad = (i: number, patch: Record<string, number>) =>
      good.monthlySchedule.map((r, n) => (n === i ? { ...r, ...patch } : r));
    expect(rejects({ ...good, monthlySchedule: bad(3, { interest: Number.NaN }) })).toBe(true);
    expect(rejects({ ...good, monthlySchedule: bad(3, { beginning: -1 }) })).toBe(true);
  });
  it('rejects a row that does not reconcile (beginning + interest ≠ ending + repayment)', () => {
    const broken = good.monthlySchedule.map((r, i) => (i === 0 ? { ...r, ending: r.ending + 5000 } : r));
    expect(rejects({ ...good, monthlySchedule: broken })).toBe(true);
  });
  it('rejects an accrual schedule that repays anything before maturity', () => {
    const broken = deferred.monthlySchedule.map((r, i) => (i === 0 ? { ...r, ending: r.ending - 100 } : r));
    expect(rejects({ ...deferred, monthlySchedule: broken })).toBe(true);
  });
  it('rejects interest that does not sum to the reported total', () => {
    expect(rejects({ ...good, totalInterest: good.totalInterest + 1000 })).toBe(true);
  });
  it('rejects an annual schedule that does not reconcile with the detailed one', () => {
    const broken = good.yearlySchedule.map((y, i) => (i === 0 ? { ...y, interest: y.interest + 9999 } : y));
    expect(rejects({ ...good, yearlySchedule: broken })).toBe(true);
    expect(rejects({ ...good, yearlySchedule: good.yearlySchedule.slice(0, 29) })).toBe(true);
    expect(rejects({ ...good, yearlySchedule: [] })).toBe(true);
  });
  it('rejects annual and detailed views that open or close on different balances', () => {
    const shifted = good.yearlySchedule.map((y, i) => (i === 0 ? { ...y, beginning: y.beginning + 1 } : y));
    expect(rejects({ ...good, yearlySchedule: shifted })).toBe(true);
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
  it('the headline label names what each mode answers', () => {
    expect(primaryLabel(computeLoan(v()))).toBe('Payment every month');
    expect(primaryLabel(computeLoan(v({ paybackKey: 'quarter' })))).toBe('Payment every quarter');
    expect(primaryLabel(computeLoan(v({ mode: 'deferred' })))).toBe('Amount due at loan maturity');
    expect(primaryLabel(computeLoan(v({ mode: 'bond' })))).toBe('Amount received when the loan starts');
  });
  it('the total label counts payments when there are any, else names the maturity value', () => {
    expect(totalLabel(computeLoan(v()))).toBe('Total of 60 payments');
    expect(totalLabel(computeLoan(v({ termYears: '0', termMonths: '1' })))).toBe('Total of 1 payment');
    expect(totalLabel(computeLoan(v({ mode: 'deferred' })))).toBe('Amount due at maturity');
    expect(totalLabel(computeLoan(v({ mode: 'bond' })))).toBe('Amount due at maturity');
  });
  it('the detailed schedule heading follows the payback cadence', () => {
    expect(periodHeading(computeLoan(v()))).toBe('Month');
    expect(periodHeading(computeLoan(v({ paybackKey: 'halfyear' })))).toBe('Half year');
    expect(periodHeading(computeLoan(v({ mode: 'bond' })))).toBe('Month');
  });
  it('describeLoanResult announces the mode’s own figure and the total interest', () => {
    expect(describeLoanResult(computeLoan(v({ amount: '250000', annualInterestRate: '6.5', termYears: '30' })))).toBe(
      'Your payment is 1580 dollars and 17 cents every month over 360 payments, with 318861 dollars and 22 cents in total interest.',
    );
    expect(describeLoanResult(computeLoan(v({ mode: 'deferred', amount: '100000', annualInterestRate: '6', termYears: '10' })))).toMatch(
      /^The amount due at maturity is .* including .* in total interest\.$/,
    );
    expect(describeLoanResult(computeLoan(v({ mode: 'bond', amount: '100000', annualInterestRate: '6', termYears: '10' })))).toMatch(
      /^You receive .* today for an amount due of .*, so total interest is .*\.$/,
    );
  });
  it('never leaks NaN, Infinity or undefined into any label', () => {
    for (const mode of ['amortized', 'deferred', 'bond']) {
      const r = computeLoan(v({ mode }));
      for (const text of [primaryLabel(r), totalLabel(r), periodHeading(r), describeLoanResult(r)]) {
        expect(text).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
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
      termMonths: { value: '6' },
      compoundKey: { value: 'quarterly' },
      paybackKey: { value: 'year' },
    };
    const modes = [
      { value: 'amortized', checked: false },
      { value: 'deferred', checked: true },
      { value: 'bond', checked: false },
    ];
    const nameOf = (sel: string) => /\[name="([^"]+)"\]/.exec(sel)?.[1] ?? null;
    return {
      querySelector: (sel: string) => {
        const name = nameOf(sel);
        if (name === 'mode') return sel.includes(':checked') ? modes.find((m) => m.checked) ?? null : modes[0];
        return name ? inputs[name] ?? null : null;
      },
      querySelectorAll: (sel: string) => (nameOf(sel) === 'mode' ? modes : []),
      __inputs: inputs,
      __modes: modes,
    } as unknown as HTMLElement & {
      __inputs: Record<string, { value: string }>;
      __modes: { value: string; checked: boolean }[];
    };
  };

  it('reads every field, taking the CHECKED mode rather than the first radio', () => {
    expect(loanBinding.readValues(mockRoot())).toEqual({
      mode: 'deferred',
      amount: '20000',
      annualInterestRate: '5',
      termYears: '5',
      termMonths: '6',
      compoundKey: 'quarterly',
      paybackKey: 'year',
    });
  });

  it('reset clears the values and restores the structural defaults', () => {
    const root = mockRoot();
    loanBinding.resetValues(root, 'personal');
    const { __inputs: inputs, __modes: modes } = root;
    for (const name of ['amount', 'annualInterestRate', 'termYears', 'termMonths']) {
      expect(inputs[name].value).toBe('');
    }
    expect(inputs.compoundKey.value).toBe('monthly');
    expect(inputs.paybackKey.value).toBe('month');
    expect(modes.filter((m) => m.checked).map((m) => m.value)).toEqual(['amortized']);
  });
});
