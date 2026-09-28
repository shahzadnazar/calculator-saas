import { describe, it, expect } from 'vitest';
import {
  MAX_TERM_YEARS,
  PAYMENT_EXAMPLE_VALUES,
  TERM_MESSAGE,
  computePayment,
  describePaymentResult,
  isUsablePayment,
  paymentBinding,
  paymentResultValue,
  payoffSentence,
  spokenUSD,
  validatePaymentValues,
  type PaymentComputed,
  type PaymentValues,
} from './payment-form';
import { type AmortizationResult } from './amortization';

/**
 * Payment binding — two modes over one loan, and the guard that keeps the enriched
 * result honest.
 *
 * The reference case ($200,000 at 6%) is pinned in both directions: over 15 years it
 * costs $1,687.71 a month, and at $2,000 a month it takes 11 years 7 months. Those
 * two are the same loan seen from either end, which is what most of the round-trip
 * tests below check.
 */

const FULL: PaymentValues = {
  mode: 'term',
  principal: '200000',
  annualRatePct: '6',
  termYears: '15',
  payment: '',
};

const term = (over: Partial<PaymentValues> = {}): PaymentValues => ({ ...FULL, ...over });
const fixedPay = (over: Partial<PaymentValues> = {}): PaymentValues => ({
  ...FULL,
  mode: 'payment',
  termYears: '',
  payment: '2000',
  ...over,
});

const errs = (r: ReturnType<typeof validatePaymentValues>): Record<string, string> =>
  r.ok ? {} : (r.fieldErrors ?? {});
const cents = (n: number) => Math.round(n * 100) / 100;

describe('validation', () => {
  it('accepts both reference entries', () => {
    expect(validatePaymentValues(FULL)).toEqual({ ok: true });
    expect(validatePaymentValues(fixedPay())).toEqual({ ok: true });
  });

  it('requires a loan amount greater than zero', () => {
    expect(errs(validatePaymentValues(term({ principal: '' }))).principal).toBe('Enter a loan amount.');
    for (const bad of ['0', '-1000', 'abc']) {
      expect(errs(validatePaymentValues(term({ principal: bad }))).principal).toBeTruthy();
    }
  });

  it('requires an interest rate, and accepts zero', () => {
    expect(errs(validatePaymentValues(term({ annualRatePct: '' }))).annualRatePct).toBe(
      'Enter an interest rate.',
    );
    expect(errs(validatePaymentValues(term({ annualRatePct: '-1' }))).annualRatePct).toBeTruthy();
    expect(validatePaymentValues(term({ annualRatePct: '0' }))).toEqual({ ok: true });
  });

  it('requires only the ACTIVE mode field', () => {
    // Fixed term ignores the payment box entirely...
    expect(validatePaymentValues(term({ payment: 'nonsense' }))).toEqual({ ok: true });
    // ...and fixed payments ignores the term box.
    expect(validatePaymentValues(fixedPay({ termYears: 'nonsense' }))).toEqual({ ok: true });
  });

  it('bounds the term to whole years from 1 to the ceiling', () => {
    expect(errs(validatePaymentValues(term({ termYears: '' }))).termYears).toBe('Enter a loan term.');
    for (const bad of ['0', '15.5', '-3', String(MAX_TERM_YEARS + 1)]) {
      expect(errs(validatePaymentValues(term({ termYears: bad }))).termYears).toBe(TERM_MESSAGE);
    }
    expect(validatePaymentValues(term({ termYears: String(MAX_TERM_YEARS) }))).toEqual({ ok: true });
  });

  it('requires a positive monthly payment in fixed-payment mode', () => {
    expect(errs(validatePaymentValues(fixedPay({ payment: '' }))).payment).toBe(
      'Enter a monthly payment.',
    );
    expect(errs(validatePaymentValues(fixedPay({ payment: '0' }))).payment).toBeTruthy();
    expect(errs(validatePaymentValues(fixedPay({ payment: '-50' }))).payment).toBeTruthy();
  });
});

describe('fixed term — solve for the payment', () => {
  const r = computePayment(FULL);

  it('reproduces the reference case', () => {
    expect(r.status).toBe('payment');
    if (r.status !== 'payment') throw new Error('unreachable');
    expect(cents(r.monthlyPayment)).toBe(1687.71);
    expect(r.paymentCount).toBe(180);
    expect(cents(r.plan.totalOfPayments)).toBe(303788.46);
    expect(cents(r.plan.totalInterest)).toBe(103788.46);
  });

  it('carries the full schedule, matching the amortization calculator', () => {
    if (r.status !== 'payment') throw new Error('unreachable');
    expect(r.plan.schedule).toHaveLength(180);
    expect(r.plan.annual).toHaveLength(15);
    expect(cents(r.plan.annual[0].interest)).toBe(11769.23);
    expect(cents(r.plan.annual[0].principal)).toBe(8483.33);
    expect(cents(r.plan.annual[0].balance)).toBe(191516.67);
  });

  it('reconciles: principal + interest === total of payments', () => {
    if (r.status !== 'payment') throw new Error('unreachable');
    expect(r.plan.loanAmount + r.plan.totalInterest).toBeCloseTo(r.plan.totalOfPayments, 6);
  });

  it('a zero rate repays principal only', () => {
    const z = computePayment(term({ principal: '12000', annualRatePct: '0', termYears: '1' }));
    if (z.status !== 'payment') throw new Error('unreachable');
    expect(cents(z.monthlyPayment)).toBe(1000);
    expect(z.plan.totalInterest).toBeCloseTo(0, 8);
  });
});

describe('fixed payments — solve for the time', () => {
  const r = computePayment(fixedPay());

  it('reproduces the reference case', () => {
    expect(r.status).toBe('payoff');
    if (r.status !== 'payoff') throw new Error('unreachable');
    expect(r.months).toBeCloseTo(138.9757, 3);
    expect(r.paymentCount).toBe(139);
    expect(cents(r.plan.totalOfPayments)).toBe(277951.56);
    expect(cents(r.plan.totalInterest)).toBe(77951.56);
  });

  it('builds the schedule on the visitor’s payment, not a recomputed one', () => {
    if (r.status !== 'payoff') throw new Error('unreachable');
    expect(r.monthlyPayment).toBe(2000);
    expect(cents(r.plan.schedule[0].payment)).toBe(2000);
    // The last payment is short, because $2,000 does not divide the debt exactly.
    const last = r.plan.schedule[r.plan.schedule.length - 1];
    expect(cents(last.payment)).toBe(1951.56);
    expect(last.balance).toBeCloseTo(0, 6);
  });

  it('rounds the part month UP, so the schedule ends on a zero balance', () => {
    if (r.status !== 'payoff') throw new Error('unreachable');
    expect(r.paymentCount).toBe(Math.ceil(r.months));
    expect(r.plan.schedule[r.plan.schedule.length - 1].balance).toBeCloseTo(0, 6);
  });

  it('a bigger payment clears the loan sooner', () => {
    const slow = computePayment(fixedPay({ payment: '1500' }));
    const fast = computePayment(fixedPay({ payment: '3000' }));
    if (slow.status !== 'payoff' || fast.status !== 'payoff') throw new Error('unreachable');
    expect(fast.months).toBeLessThan(slow.months);
    expect(fast.plan.totalInterest).toBeLessThan(slow.plan.totalInterest);
  });
});

describe('the two modes are the same loan from either end', () => {
  it('paying the fixed-term payment clears the loan in the fixed term', () => {
    const forward = computePayment(FULL);
    if (forward.status !== 'payment') throw new Error('unreachable');
    const back = computePayment(fixedPay({ payment: String(forward.monthlyPayment) }));
    if (back.status !== 'payoff') throw new Error('unreachable');
    expect(back.paymentCount).toBe(180);
    expect(back.plan.totalInterest).toBeCloseTo(forward.plan.totalInterest, 2);
  });
});

describe('the "never" outcome', () => {
  const never = computePayment(fixedPay({ payment: '500' })); // interest alone is $1,000

  it('is reported for a payment that does not cover the interest', () => {
    expect(never.status).toBe('never');
    if (never.status !== 'never') throw new Error('unreachable');
    expect(never.reason).toBe('payment-does-not-cover-interest');
  });

  it('is a VALID informational result, not an error', () => {
    expect(isUsablePayment(never)).toBe(true);
    // ...even though it has no magnitude of its own.
    expect(paymentResultValue(never)).toBeNaN();
  });

  it('says why, in words', () => {
    expect(describePaymentResult(never)).toContain('never be paid off');
    expect(describePaymentResult(never)).toContain('does not cover the monthly interest');
  });

  it('a payment exactly equal to the interest never pays off either', () => {
    const exact = computePayment(fixedPay({ payment: '1000' }));
    expect(exact.status).toBe('never');
  });

  it('a payment a cent above the interest does pay off, eventually', () => {
    const barely = computePayment(fixedPay({ payment: '1000.01' }));
    expect(barely.status).toBe('payoff');
  });
});

describe('the complete-result guard', () => {
  const good = computePayment(FULL) as Extract<PaymentComputed, { status: 'payment' }>;
  const payoff = computePayment(fixedPay()) as Extract<PaymentComputed, { status: 'payoff' }>;
  const clonePlan = (p: AmortizationResult): AmortizationResult => ({
    ...p,
    schedule: p.schedule.map((x) => ({ ...x })),
    annual: p.annual.map((x) => ({ ...x })),
  });
  const broken = <T extends { plan: AmortizationResult }>(base: T, mutate: (p: AmortizationResult) => void): T => {
    const plan = clonePlan(base.plan);
    mutate(plan);
    return { ...base, plan };
  };

  it('accepts both solvable shapes', () => {
    expect(cents(paymentResultValue(good))).toBe(1687.71);
    expect(paymentResultValue(payoff)).toBeCloseTo(138.9757, 3);
    expect(isUsablePayment(good)).toBe(true);
    expect(isUsablePayment(payoff)).toBe(true);
  });

  it('rejects a plan whose totals do not add up', () => {
    expect(paymentResultValue(broken(good, (p) => (p.totalInterest += 100)))).toBeNaN();
    expect(paymentResultValue(broken(good, (p) => (p.totalOfPayments *= 2)))).toBeNaN();
  });

  it('rejects a row whose payment is not its principal plus interest', () => {
    expect(paymentResultValue(broken(good, (p) => (p.schedule[9].payment += 5)))).toBeNaN();
  });

  it('rejects a schedule that does not repay the loan or end on zero', () => {
    expect(paymentResultValue(broken(good, (p) => (p.schedule[3].principal += 400)))).toBeNaN();
    expect(paymentResultValue(broken(good, (p) => (p.schedule[179].balance = 500)))).toBeNaN();
  });

  it('rejects rows that are reordered or truncated', () => {
    expect(paymentResultValue(broken(good, (p) => (p.schedule[2].period = 99)))).toBeNaN();
    expect(paymentResultValue(broken(good, (p) => p.schedule.splice(4, 1)))).toBeNaN();
  });

  it('rejects yearly rows that disagree with the monthly ones', () => {
    expect(paymentResultValue(broken(good, (p) => (p.annual[3].interest += 40)))).toBeNaN();
    expect(paymentResultValue(broken(good, (p) => (p.annual[3].balance += 40)))).toBeNaN();
  });

  it('rejects a headline payment the schedule was not built on', () => {
    expect(paymentResultValue({ ...good, monthlyPayment: good.monthlyPayment + 10 })).toBeNaN();
  });

  it('rejects a payment count that disagrees with the schedule', () => {
    expect(paymentResultValue({ ...good, paymentCount: 179 })).toBeNaN();
    expect(paymentResultValue({ ...payoff, paymentCount: 200 })).toBeNaN();
  });

  it('rejects a solve that is not within a part month of the schedule', () => {
    expect(paymentResultValue({ ...payoff, months: 60 })).toBeNaN();
  });

  it('marks a broken result unusable, so it renders as an error rather than a number', () => {
    expect(isUsablePayment(broken(good, (p) => (p.totalInterest += 100)))).toBe(false);
  });
});

describe('presentation', () => {
  it('announces the mode-owned headline', () => {
    expect(describePaymentResult(computePayment(FULL))).toBe(
      'Your estimated monthly payment is 1687 dollars and 71 cents.',
    );
    expect(describePaymentResult(computePayment(fixedPay()))).toBe(
      'Your estimated payoff time is 11 years and 7 months.',
    );
  });

  it('writes the payoff sentence in both modes', () => {
    expect(payoffSentence(computePayment(FULL))).toBe(
      'You will need to pay $1,687.71 every month for 15 years to pay off the debt.',
    );
    expect(payoffSentence(computePayment(fixedPay()))).toBe(
      'You will need to pay $2,000.00 every month for 11 years, 7 months to pay off the debt.',
    );
  });

  it('has no sentence for a loan that is never paid off', () => {
    expect(payoffSentence(computePayment(fixedPay({ payment: '500' })))).toBe('');
  });

  it('speaks dollars and cents', () => {
    expect(spokenUSD(0)).toBe('0 dollars');
    expect(spokenUSD(1)).toBe('1 dollar');
    expect(spokenUSD(1687.71)).toBe('1687 dollars and 71 cents');
  });
});

describe('the worked example', () => {
  it('validates, so the example a visitor sees is a real calculation', () => {
    expect(validatePaymentValues(PAYMENT_EXAMPLE_VALUES)).toEqual({ ok: true });
  });

  it('is the published reference case and passes the same guard as any other result', () => {
    const r = computePayment(PAYMENT_EXAMPLE_VALUES);
    expect(cents(paymentBinding.resultValue(r) as number)).toBe(1687.71);
  });

  it('opens in fixed-term mode, which is the default', () => {
    expect(PAYMENT_EXAMPLE_VALUES.mode).toBe('term');
  });
});
