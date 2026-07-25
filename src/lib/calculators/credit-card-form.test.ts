import { describe, it, expect } from 'vitest';
import {
  validateCreditCardValues,
  computeCreditCard,
  describeCreditCardResult,
  isUsableCreditCard,
  spokenUSD,
  creditCardBinding,
  type CreditCardValues,
  type CreditCardComputed,
} from './credit-card-form';

const byPayment = (over: Partial<CreditCardValues> = {}): CreditCardValues => ({
  mode: 'payment',
  balance: '5000',
  aprPct: '19.99',
  payment: '200',
  months: '',
  ...over,
});

const byMonths = (over: Partial<CreditCardValues> = {}): CreditCardValues => ({
  mode: 'months',
  balance: '5000',
  aprPct: '19.99',
  payment: '',
  months: '24',
  ...over,
});

const errs = (r: ReturnType<typeof validateCreditCardValues>) =>
  (r as { fieldErrors: Record<string, string> }).fieldErrors;

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('credit-card-form — validation', () => {
  it('accepts a valid By-payment and a valid By-timeline calculation', () => {
    expect(validateCreditCardValues(byPayment())).toEqual({ ok: true });
    expect(validateCreditCardValues(byMonths())).toEqual({ ok: true });
  });

  it('requires a balance GREATER THAN ZERO (zero balance is invalid)', () => {
    expect(errs(validateCreditCardValues(byPayment({ balance: '' }))).balance).toBe('Enter your card balance.');
    expect(errs(validateCreditCardValues(byPayment({ balance: '0' }))).balance).toBe(
      'Enter a balance greater than zero.',
    );
    expect(errs(validateCreditCardValues(byPayment({ balance: '-100' }))).balance).toBe(
      'Enter a balance greater than zero.',
    );
  });

  it('requires the APR but treats an entered 0% as VALID (no maximum)', () => {
    expect(errs(validateCreditCardValues(byPayment({ aprPct: '' }))).aprPct).toBe('Enter the APR.');
    expect(validateCreditCardValues(byPayment({ aprPct: '0' }))).toEqual({ ok: true });
    expect(validateCreditCardValues(byPayment({ aprPct: '29.99' }))).toEqual({ ok: true });
    expect(errs(validateCreditCardValues(byPayment({ aprPct: '-1' }))).aprPct).toBe('Enter an APR of zero or more.');
  });

  it('By-payment requires the payment (> 0) and IGNORES the months field', () => {
    expect(errs(validateCreditCardValues(byPayment({ payment: '' }))).payment).toBe('Enter a monthly payment.');
    expect(errs(validateCreditCardValues(byPayment({ payment: '0' }))).payment).toBe(
      'Enter a monthly payment greater than zero.',
    );
    // An insufficient (but positive) payment is NOT a field error — it becomes "Never".
    expect(validateCreditCardValues(byPayment({ payment: '50' }))).toEqual({ ok: true });
    // Garbage months never blocks a By-payment calculation.
    expect(validateCreditCardValues(byPayment({ months: 'abc' }))).toEqual({ ok: true });
  });

  it('By-timeline requires a WHOLE month >= 1 and IGNORES the payment field', () => {
    expect(errs(validateCreditCardValues(byMonths({ months: '' }))).months).toBe('Enter a target payoff time.');
    expect(errs(validateCreditCardValues(byMonths({ months: '0' }))).months).toBe(
      'Enter a whole number of months (1 or more).',
    );
    expect(errs(validateCreditCardValues(byMonths({ months: '24.5' }))).months).toBe(
      'Enter a whole number of months (1 or more).',
    );
    expect(errs(validateCreditCardValues(byMonths({ months: '-3' }))).months).toBe(
      'Enter a whole number of months (1 or more).',
    );
    expect(validateCreditCardValues(byMonths({ months: '1' }))).toEqual({ ok: true });
    // Garbage payment never blocks a By-timeline calculation.
    expect(validateCreditCardValues(byMonths({ payment: '-9' }))).toEqual({ ok: true });
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('credit-card-form — compute', () => {
  it('By-payment → a payoff with the enriched interest + total-paid breakdown', () => {
    const r = computeCreditCard(byPayment({ balance: '5000', aprPct: '19.99', payment: '200' }));
    expect(r.status).toBe('payoff');
    if (r.status !== 'payoff') throw new Error('expected payoff');
    expect(r.payoffMonths).toBe(33);
    expect(r.paymentCount).toBe(33);
    expect(r.totalPaid).toBe(6600); // 200 × 33
    expect(r.totalInterest).toBe(1600);
  });

  it('By-timeline → a required payment with the enriched breakdown', () => {
    const r = computeCreditCard(byMonths({ balance: '6000', aprPct: '0', months: '24' }));
    if (r.status !== 'required-payment') throw new Error('expected required-payment');
    expect(r.monthlyPayment).toBe(250); // 6000 / 24, zero interest
    expect(r.paymentCount).toBe(24);
    expect(r.totalPaid).toBe(6000);
    expect(r.totalInterest).toBe(0);
  });

  it('a payment that does not cover the interest → the "never" outcome', () => {
    // interest on 5,000 @ 18% is 75/mo; 75 (equal) and 50 (below) both never pay down.
    expect(computeCreditCard(byPayment({ aprPct: '18', payment: '75' })).status).toBe('never');
    expect(computeCreditCard(byPayment({ aprPct: '18', payment: '50' })).status).toBe('never');
  });

  it('a payment above the interest is a finite payoff, not "never"', () => {
    expect(computeCreditCard(byPayment({ aprPct: '18', payment: '200' })).status).toBe('payoff');
  });
});

/* ------------------------------------------------------------------ */
/* Usability gate + guarded magnitude                                  */
/* ------------------------------------------------------------------ */

describe('credit-card-form — usability gate', () => {
  it('ordinary payoff / required-payment with finite figures are usable', () => {
    expect(isUsableCreditCard({ status: 'payoff', mode: 'payment', payoffMonths: 33, paymentCount: 33, totalInterest: 1600, totalPaid: 6600 })).toBe(true);
    expect(isUsableCreditCard({ status: 'required-payment', mode: 'months', monthlyPayment: 250, paymentCount: 24, totalInterest: 0, totalPaid: 6000 })).toBe(true);
  });

  it('the "never" outcome is ALWAYS usable (valid informational result)', () => {
    expect(isUsableCreditCard({ status: 'never', mode: 'payment', reason: 'payment-does-not-cover-interest' })).toBe(true);
  });

  it('a malformed (non-finite) figure falls through to invalid', () => {
    expect(isUsableCreditCard({ status: 'payoff', mode: 'payment', payoffMonths: Infinity, paymentCount: 0, totalInterest: Infinity, totalPaid: Infinity })).toBe(false);
    expect(isUsableCreditCard({ status: 'required-payment', mode: 'months', monthlyPayment: NaN, paymentCount: 24, totalInterest: 0, totalPaid: 0 })).toBe(false);
  });

  it('resultValue exposes the guarded magnitude; NaN for the non-numeric "never"', () => {
    expect(creditCardBinding.resultValue({ status: 'payoff', mode: 'payment', payoffMonths: 33, paymentCount: 33, totalInterest: 1600, totalPaid: 6600 })).toBe(33);
    expect(creditCardBinding.resultValue({ status: 'required-payment', mode: 'months', monthlyPayment: 250, paymentCount: 24, totalInterest: 0, totalPaid: 6000 })).toBe(250);
    expect(Number.isNaN(creditCardBinding.resultValue({ status: 'never', mode: 'payment', reason: 'payment-does-not-cover-interest' }))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Announcement                                                        */
/* ------------------------------------------------------------------ */

describe('credit-card-form — announcement (dominant only)', () => {
  it('By-payment announces the spoken payoff time', () => {
    const r: CreditCardComputed = { status: 'payoff', mode: 'payment', payoffMonths: 28, paymentCount: 28, totalInterest: 600, totalPaid: 5600 };
    expect(describeCreditCardResult(r)).toBe('Your estimated payoff time is 2 years and 4 months.');
  });

  it('By-timeline announces the required payment in spoken USD', () => {
    const r: CreditCardComputed = { status: 'required-payment', mode: 'months', monthlyPayment: 245.63, paymentCount: 24, totalInterest: 895, totalPaid: 5895 };
    expect(describeCreditCardResult(r)).toBe('Your required monthly payment is 245 dollars and 63 cents.');
  });

  it('the "never" announcement explains the cause without formula language', () => {
    const r: CreditCardComputed = { status: 'never', mode: 'payment', reason: 'payment-does-not-cover-interest' };
    expect(describeCreditCardResult(r)).toBe(
      'At this payment amount, the credit card balance will never be paid off because the payment does not cover the monthly interest.',
    );
    expect(describeCreditCardResult(r)).not.toMatch(/log|denominator|Infinity|NaN/i);
  });

  it('spokenUSD reads dollars and cents with correct singular/plural', () => {
    expect(spokenUSD(245.63)).toBe('245 dollars and 63 cents');
    expect(spokenUSD(250)).toBe('250 dollars');
    expect(spokenUSD(1)).toBe('1 dollar');
    expect(spokenUSD(0.01)).toBe('0 dollars and 1 cent');
  });
});
