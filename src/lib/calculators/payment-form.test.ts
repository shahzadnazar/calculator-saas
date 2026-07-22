import { describe, it, expect } from 'vitest';
import {
  validatePaymentValues,
  computePayment,
  describePaymentResult,
  isUsablePayment,
  paymentsLabel,
  spokenUSD,
  paymentBinding,
  type PaymentValues,
  type PaymentComputed,
} from './payment-form';
import { presentDuration } from '@lib/format';

const term = (over: Partial<PaymentValues> = {}): PaymentValues => ({
  mode: 'term',
  principal: '20000',
  annualRatePct: '6',
  termYears: '5',
  payment: '',
  ...over,
});

const pay = (over: Partial<PaymentValues> = {}): PaymentValues => ({
  mode: 'payment',
  principal: '20000',
  annualRatePct: '6',
  termYears: '',
  payment: '400',
  ...over,
});

const errs = (r: ReturnType<typeof validatePaymentValues>) =>
  (r as { fieldErrors: Record<string, string> }).fieldErrors;

/* ------------------------------------------------------------------ */
/* Validation — shared fields + active-mode-only conditional field     */
/* ------------------------------------------------------------------ */

describe('payment-form — validation', () => {
  it('accepts a valid fixed-term and a valid fixed-payment calculation', () => {
    expect(validatePaymentValues(term())).toEqual({ ok: true });
    expect(validatePaymentValues(pay())).toEqual({ ok: true });
  });

  it('requires the loan amount and rejects zero / negative / non-finite', () => {
    expect(errs(validatePaymentValues(term({ principal: '' }))).principal).toBe('Enter a loan amount.');
    expect(errs(validatePaymentValues(term({ principal: '0' }))).principal).toBe(
      'Enter a loan amount greater than zero.',
    );
    expect(errs(validatePaymentValues(term({ principal: '-100' }))).principal).toBe(
      'Enter a loan amount greater than zero.',
    );
    expect(errs(validatePaymentValues(term({ principal: 'abc' }))).principal).toBe(
      'Enter a loan amount greater than zero.',
    );
  });

  it('requires the rate but treats an entered 0% as VALID (no maximum)', () => {
    expect(errs(validatePaymentValues(term({ annualRatePct: '' }))).annualRatePct).toBe('Enter an interest rate.');
    expect(validatePaymentValues(term({ annualRatePct: '0' }))).toEqual({ ok: true });
    expect(validatePaymentValues(term({ annualRatePct: '35' }))).toEqual({ ok: true });
    expect(errs(validatePaymentValues(term({ annualRatePct: '-1' }))).annualRatePct).toBe(
      'Enter an interest rate of zero or more.',
    );
  });

  it('term mode requires the term (> 0) and IGNORES the monthly payment field', () => {
    expect(errs(validatePaymentValues(term({ termYears: '' }))).termYears).toBe('Enter a loan term.');
    expect(errs(validatePaymentValues(term({ termYears: '0' }))).termYears).toBe(
      'Enter a loan term greater than zero.',
    );
    // A garbage payment value never blocks a term calculation — it is excluded.
    expect(validatePaymentValues(term({ payment: '-5' }))).toEqual({ ok: true });
    expect(validatePaymentValues(term({ payment: 'abc' }))).toEqual({ ok: true });
  });

  it('payment mode requires the monthly payment (> 0) and IGNORES the term field', () => {
    expect(errs(validatePaymentValues(pay({ payment: '' }))).payment).toBe('Enter a monthly payment.');
    expect(errs(validatePaymentValues(pay({ payment: '0' }))).payment).toBe(
      'Enter a monthly payment greater than zero.',
    );
    // A garbage term value never blocks a payoff calculation — it is excluded.
    expect(validatePaymentValues(pay({ termYears: 'abc' }))).toEqual({ ok: true });
    expect(validatePaymentValues(pay({ termYears: '-3' }))).toEqual({ ok: true });
  });

  it('allows a fractional (non-whole-year) term', () => {
    expect(validatePaymentValues(term({ termYears: '5.5' }))).toEqual({ ok: true });
    expect(validatePaymentValues(term({ termYears: '0.5' }))).toEqual({ ok: true });
  });
});

/* ------------------------------------------------------------------ */
/* Computation — three result shapes                                   */
/* ------------------------------------------------------------------ */

describe('payment-form — compute', () => {
  it('fixed term → a monthly payment and the payment count (= term in months)', () => {
    const r = computePayment(term({ principal: '20000', annualRatePct: '6', termYears: '5' }));
    expect(r.status).toBe('payment');
    if (r.status !== 'payment') throw new Error('expected payment');
    expect(r.monthlyPayment).toBeCloseTo(386.66, 1);
    expect(r.paymentCount).toBe(60);
  });

  it('zero-interest fixed term divides principal across the term', () => {
    const r = computePayment(term({ principal: '12000', annualRatePct: '0', termYears: '1' }));
    if (r.status !== 'payment') throw new Error('expected payment');
    expect(r.monthlyPayment).toBeCloseTo(1000, 6);
    expect(r.paymentCount).toBe(12);
  });

  it('fixed payment → a finite payoff with a ceil-ed payment count', () => {
    // Zero interest keeps it exact: 20,000 / 500 = 40 months.
    const r = computePayment(pay({ principal: '20000', annualRatePct: '0', payment: '500' }));
    expect(r.status).toBe('payoff');
    if (r.status !== 'payoff') throw new Error('expected payoff');
    expect(r.months).toBeCloseTo(40, 6);
    expect(r.paymentCount).toBe(40);
  });

  it('fixed payment with a fractional payoff ceils the payment count', () => {
    // 10,000 / 300 = 33.33 → 34 payments.
    const r = computePayment(pay({ principal: '10000', annualRatePct: '0', payment: '300' }));
    if (r.status !== 'payoff') throw new Error('expected payoff');
    expect(r.months).toBeCloseTo(33.333, 2);
    expect(r.paymentCount).toBe(34);
  });

  it('a payment that does not cover the interest → the "never" outcome (not an error)', () => {
    // 100,000 at 12% → 1,000/mo interest; paying 500 (below) or 1,000 (equal) never pays down.
    expect(computePayment(pay({ principal: '100000', annualRatePct: '12', payment: '500' })).status).toBe('never');
    expect(computePayment(pay({ principal: '100000', annualRatePct: '12', payment: '1000' })).status).toBe('never');
  });

  it('a payment just above the interest is a (very long) finite payoff, not "never"', () => {
    expect(computePayment(pay({ principal: '100000', annualRatePct: '12', payment: '1001' })).status).toBe('payoff');
  });
});

/* ------------------------------------------------------------------ */
/* Usability gate + guarded magnitude                                  */
/* ------------------------------------------------------------------ */

describe('payment-form — usability gate', () => {
  it('ordinary payment / payoff with finite magnitudes are usable', () => {
    expect(isUsablePayment({ status: 'payment', mode: 'term', monthlyPayment: 386.66, paymentCount: 60 })).toBe(true);
    expect(isUsablePayment({ status: 'payoff', mode: 'payment', months: 60, paymentCount: 60 })).toBe(true);
  });

  it('the "never" outcome is ALWAYS usable — it is a valid informational result', () => {
    expect(isUsablePayment({ status: 'never', mode: 'payment', reason: 'payment-does-not-cover-interest' })).toBe(true);
  });

  it('a malformed (non-finite) magnitude falls through to invalid', () => {
    expect(isUsablePayment({ status: 'payment', mode: 'term', monthlyPayment: NaN, paymentCount: 0 })).toBe(false);
    expect(isUsablePayment({ status: 'payoff', mode: 'payment', months: Infinity, paymentCount: 0 })).toBe(false);
  });

  it('resultValue exposes the guarded magnitude; NaN for the non-numeric "never"', () => {
    expect(paymentBinding.resultValue({ status: 'payment', mode: 'term', monthlyPayment: 386.66, paymentCount: 60 })).toBeCloseTo(386.66, 2);
    expect(paymentBinding.resultValue({ status: 'payoff', mode: 'payment', months: 60, paymentCount: 60 })).toBe(60);
    expect(
      Number.isNaN(paymentBinding.resultValue({ status: 'never', mode: 'payment', reason: 'payment-does-not-cover-interest' })),
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Announcement                                                        */
/* ------------------------------------------------------------------ */

describe('payment-form — announcement', () => {
  it('term mode announces the monthly payment in spoken USD', () => {
    const r = computePayment(term({ principal: '20000', annualRatePct: '6', termYears: '5' }));
    expect(describePaymentResult(r)).toBe('Your estimated monthly payment is 386 dollars and 66 cents.');
  });

  it('payment mode announces the spoken payoff time', () => {
    const r: PaymentComputed = { status: 'payoff', mode: 'payment', months: 56.3, paymentCount: 57 };
    expect(describePaymentResult(r)).toBe('Your estimated payoff time is 4 years and 8 months.');
  });

  it('the announcement uses the SAME normalized wording as the display (year carry)', () => {
    // 11.6 raw months → residual rounds to 12 → carries to "1 year"; the spoken
    // announcement must never say "12 months" either.
    const r: PaymentComputed = { status: 'payoff', mode: 'payment', months: 11.6, paymentCount: 12 };
    expect(describePaymentResult(r)).toBe('Your estimated payoff time is 1 year.');
    expect(describePaymentResult(r)).not.toMatch(/12 months/);
  });

  it('the "never" announcement explains the cause without formula language', () => {
    const r: PaymentComputed = { status: 'never', mode: 'payment', reason: 'payment-does-not-cover-interest' };
    expect(describePaymentResult(r)).toBe(
      'At this payment amount, the loan will never be paid off because the payment does not cover the monthly interest.',
    );
    expect(describePaymentResult(r)).not.toMatch(/log|denominator|Infinity|NaN/i);
  });
});

/* ------------------------------------------------------------------ */
/* Duration presentation — preserves the characterized floor/round     */
/* ------------------------------------------------------------------ */

describe('payment-form — duration presentation (uses the shared presenter)', () => {
  // The pure presenter itself (payoffParts / presentDuration) is characterized in
  // format.test.ts now that it is shared; here we lock only how Payment CONSUMES it.
  it('locks the distinction: raw months vs displayed duration vs payment count', () => {
    // 59,500 at 0% paying 1,000/mo → raw 59.5 months. The DISPLAY carries to "5 years";
    // the payment COUNT is ceil(raw) = 60. Three distinct concepts, never conflated.
    const r = computePayment(pay({ principal: '59500', annualRatePct: '0', payment: '1000' }));
    if (r.status !== 'payoff') throw new Error('expected payoff');
    expect(r.months).toBeCloseTo(59.5, 6); // raw formula months — unchanged
    expect(r.paymentCount).toBe(60); // payment count = ceil(raw) — unchanged
    expect(presentDuration(r.months).display).toBe('5 years'); // displayed duration — normalized
  });

  it('paymentsLabel pluralizes (1 is singular)', () => {
    expect(paymentsLabel(60)).toBe('60 monthly payments');
    expect(paymentsLabel(1)).toBe('1 monthly payment');
    expect(paymentsLabel(0)).toBe('0 monthly payments');
  });

  it('spokenUSD reads dollars and cents with correct singular/plural', () => {
    expect(spokenUSD(386.66)).toBe('386 dollars and 66 cents');
    expect(spokenUSD(1000)).toBe('1000 dollars');
    expect(spokenUSD(1)).toBe('1 dollar');
    expect(spokenUSD(0.01)).toBe('0 dollars and 1 cent');
  });
});
