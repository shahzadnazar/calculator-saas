import { describe, it, expect } from 'vitest';
import {
  validateAmortizationValues,
  computeAmortization,
  describeAmortizationResult,
  spokenUSD,
  amortizationBinding,
  MAX_TERM_YEARS,
  MAX_MONTHLY_ROWS,
  TERM_MESSAGE,
  type AmortValues,
} from './amortization-form';

const values = (over: Partial<AmortValues> = {}): AmortValues => ({
  amount: '250000',
  annualInterestRate: '6.5',
  termYears: '30',
  ...over,
});

/* ------------------------------------------------------------------ */
/* Constants / contract                                                */
/* ------------------------------------------------------------------ */

describe('amortization binding — contract constants', () => {
  it('the migrated-product term ceiling is 30 years / 360 monthly rows', () => {
    expect(MAX_TERM_YEARS).toBe(30);
    expect(MAX_MONTHLY_ROWS).toBe(360);
    expect(TERM_MESSAGE).toBe('Enter a whole loan term from 1 to 30 years.');
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('validateAmortizationValues — amount', () => {
  it('requires a loan amount', () => {
    const r = validateAmortizationValues(values({ amount: '' }));
    expect(r).toMatchObject({ ok: false, fieldErrors: { amount: 'Enter a loan amount.' } });
  });
  it('rejects zero and negative amounts as greater-than-zero', () => {
    for (const amount of ['0', '-100', '-0.5']) {
      const r = validateAmortizationValues(values({ amount }));
      expect(r).toMatchObject({ ok: false, fieldErrors: { amount: 'Enter a loan amount greater than zero.' } });
    }
  });
  it('rejects non-finite amounts', () => {
    for (const amount of ['abc', 'Infinity', 'NaN']) {
      expect(validateAmortizationValues(values({ amount })).ok).toBe(false);
    }
  });
  it('accepts a positive amount', () => {
    expect(validateAmortizationValues(values({ amount: '1000' })).ok).toBe(true);
  });
});

describe('validateAmortizationValues — interest rate', () => {
  it('requires a rate', () => {
    expect(validateAmortizationValues(values({ annualInterestRate: '' }))).toMatchObject({
      ok: false,
      fieldErrors: { annualInterestRate: 'Enter an interest rate.' },
    });
  });
  it('rejects a negative rate', () => {
    expect(validateAmortizationValues(values({ annualInterestRate: '-1' }))).toMatchObject({
      ok: false,
      fieldErrors: { annualInterestRate: 'Enter an interest rate of zero or more.' },
    });
  });
  it('ACCEPTS a 0% rate (a valid zero-interest loan)', () => {
    expect(validateAmortizationValues(values({ annualInterestRate: '0' })).ok).toBe(true);
  });
});

describe('validateAmortizationValues — term (migrated-product boundary 1–30, whole)', () => {
  it('accepts the boundary terms 1 and 30', () => {
    expect(validateAmortizationValues(values({ termYears: '1' })).ok).toBe(true);
    expect(validateAmortizationValues(values({ termYears: '30' })).ok).toBe(true);
  });

  it('rejects a term above the 30-year maximum with the single term message', () => {
    for (const termYears of ['31', '40', '50', '100']) {
      expect(validateAmortizationValues(values({ termYears }))).toMatchObject({
        ok: false,
        fieldErrors: { termYears: TERM_MESSAGE },
      });
    }
  });

  it('rejects a term below 1', () => {
    for (const termYears of ['0', '-5']) {
      expect(validateAmortizationValues(values({ termYears })).ok).toBe(false);
      expect(validateAmortizationValues(values({ termYears })).ok).toBe(false);
    }
  });

  it('rejects a fractional term (never rounded)', () => {
    for (const termYears of ['2.5', '29.9', '0.5']) {
      expect(validateAmortizationValues(values({ termYears }))).toMatchObject({
        ok: false,
        fieldErrors: { termYears: TERM_MESSAGE },
      });
    }
  });

  it('rejects an empty or non-finite term with the same single message', () => {
    for (const termYears of ['', 'abc', 'Infinity', 'NaN']) {
      expect(validateAmortizationValues(values({ termYears }))).toMatchObject({
        ok: false,
        fieldErrors: { termYears: TERM_MESSAGE },
      });
    }
  });
});

describe('validateAmortizationValues — combined', () => {
  it('passes for a complete, in-range loan', () => {
    expect(validateAmortizationValues(values())).toEqual({ ok: true });
  });
  it('reports every invalid field at once', () => {
    const r = validateAmortizationValues({ amount: '', annualInterestRate: '-1', termYears: '99' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors!).sort()).toEqual(['amount', 'annualInterestRate', 'termYears']);
  });
});

/* ------------------------------------------------------------------ */
/* Computation — pass-through to the unchanged calculateLoan           */
/* ------------------------------------------------------------------ */

describe('computeAmortization', () => {
  it('delegates to calculateLoan for a 30-year loan (360 rows, reconciling totals)', () => {
    const r = computeAmortization(values());
    expect(r.monthlyPayment).toBeCloseTo(1580.17, 2);
    expect(r.totalInterest).toBeCloseTo(318861.22, 2);
    expect(r.totalPaid).toBeCloseTo(568861.22, 2);
    expect(r.payoffMonths).toBe(360);
    expect(r.schedule.length).toBe(360);
    expect(r.yearlySchedule.length).toBe(30);
    expect(r.schedule[359].balance).toBe(0);
  });

  it('a 1-year term yields exactly 12 monthly rows / 1 yearly row', () => {
    const r = computeAmortization(values({ termYears: '1' }));
    expect(r.schedule.length).toBe(12);
    expect(r.yearlySchedule.length).toBe(1);
  });

  it('the maximum in-range term never exceeds MAX_MONTHLY_ROWS', () => {
    const r = computeAmortization(values({ termYears: String(MAX_TERM_YEARS) }));
    expect(r.schedule.length).toBeLessThanOrEqual(MAX_MONTHLY_ROWS);
    expect(r.schedule.length).toBe(MAX_MONTHLY_ROWS);
  });

  it('a 0% loan computes a principal-only schedule', () => {
    const r = computeAmortization(values({ amount: '12000', annualInterestRate: '0', termYears: '1' }));
    expect(r.monthlyPayment).toBe(1000);
    expect(r.totalInterest).toBe(0);
    expect(r.schedule[0].interest).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Usability gate — the 360-row schedule contract                      */
/* ------------------------------------------------------------------ */

describe('amortizationBinding.isUsableResult', () => {
  it('accepts a well-formed result', () => {
    expect(amortizationBinding.isUsableResult!(computeAmortization(values()))).toBe(true);
  });
  it('rejects an empty schedule', () => {
    const r = computeAmortization(values());
    expect(amortizationBinding.isUsableResult!({ ...r, schedule: [] })).toBe(false);
  });
  it('rejects a schedule beyond the 360-row ceiling', () => {
    const r = computeAmortization(values());
    const tooMany = Array.from({ length: MAX_MONTHLY_ROWS + 1 }, () => r.schedule[0]);
    expect(amortizationBinding.isUsableResult!({ ...r, schedule: tooMany })).toBe(false);
  });
  it('rejects a non-finite monthly payment', () => {
    const r = computeAmortization(values());
    expect(amortizationBinding.isUsableResult!({ ...r, monthlyPayment: Infinity })).toBe(false);
    expect(amortizationBinding.isUsableResult!({ ...r, monthlyPayment: NaN })).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Announcement                                                        */
/* ------------------------------------------------------------------ */

describe('describeAmortizationResult + spokenUSD', () => {
  it('speaks a USD amount with cents', () => {
    expect(spokenUSD(1580.17)).toBe('1580 dollars and 17 cents');
    expect(spokenUSD(1000)).toBe('1000 dollars');
    expect(spokenUSD(1)).toBe('1 dollar');
    expect(spokenUSD(0.01)).toBe('0 dollars and 1 cent');
  });

  it('announces the dominant payment, the payment count and total interest', () => {
    const msg = describeAmortizationResult(computeAmortization(values()));
    expect(msg).toBe(
      'Your estimated monthly payment is 1580 dollars and 17 cents over 360 monthly payments, with 318861 dollars and 22 cents in total interest.',
    );
  });

  it('singularizes a one-payment loan', () => {
    const r = { ...computeAmortization(values()), payoffMonths: 1 };
    expect(describeAmortizationResult(r)).toContain('over 1 monthly payment,');
  });
});
