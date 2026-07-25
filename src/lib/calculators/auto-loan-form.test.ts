import { describe, it, expect } from 'vitest';
import {
  validateAutoLoanValues,
  computeAutoLoan,
  completeResultValue,
  describeAutoLoanResult,
  interpretationLines,
  autoLoanBinding,
  TERM_OPTIONS,
  DEFAULT_TERM,
  type AutoLoanValues,
  type AutoLoanComputed,
} from './auto-loan-form';

const values = (over: Partial<AutoLoanValues> = {}): AutoLoanValues => ({
  autoPrice: '30000',
  interestRatePct: '5',
  loanTermMonths: '60',
  downPayment: '3000',
  salesTaxRatePct: '7',
  tradeInValue: '',
  amountOwedOnTradeIn: '',
  fees: '300',
  includeTaxesFeesInLoan: true,
  ...over,
});
const good = () => computeAutoLoan(values());
const rejects = (r: AutoLoanComputed) => Number.isNaN(completeResultValue(r));

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe('auto-loan binding — contract', () => {
  it('supported terms are 36/48/60/72/84, default 60', () => {
    expect([...TERM_OPTIONS]).toEqual([36, 48, 60, 72, 84]);
    expect(DEFAULT_TERM).toBe(60);
  });
  it('does NOT define isUsableResult (guard lives in resultValue)', () => {
    expect(autoLoanBinding.isUsableResult).toBeUndefined();
    expect(autoLoanBinding.resultValue).toBe(completeResultValue);
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('validateAutoLoanValues', () => {
  it('requires all required inputs on an empty submission', () => {
    const r = validateAutoLoanValues(values({ autoPrice: '', interestRatePct: '' }));
    expect(r).toMatchObject({ ok: false, fieldErrors: { autoPrice: 'Enter a vehicle price.', interestRatePct: 'Enter an interest rate.' } });
  });
  it('rejects a zero / negative / non-finite vehicle price', () => {
    expect(validateAutoLoanValues(values({ autoPrice: '0' }))).toMatchObject({ ok: false, fieldErrors: { autoPrice: 'Enter a vehicle price greater than zero.' } });
    expect(validateAutoLoanValues(values({ autoPrice: '-100' })).ok).toBe(false);
    expect(validateAutoLoanValues(values({ autoPrice: 'abc' })).ok).toBe(false);
  });
  it('rejects a negative or non-finite rate; accepts 0%', () => {
    expect(validateAutoLoanValues(values({ interestRatePct: '-1' }))).toMatchObject({ ok: false, fieldErrors: { interestRatePct: 'Enter an interest rate of zero or more.' } });
    expect(validateAutoLoanValues(values({ interestRatePct: 'x' })).ok).toBe(false);
    expect(validateAutoLoanValues(values({ interestRatePct: '0' })).ok).toBe(true);
  });
  it('rejects an unsupported term', () => {
    expect(validateAutoLoanValues(values({ loanTermMonths: '99' }))).toMatchObject({ ok: false, fieldErrors: { loanTermMonths: 'Choose a loan term.' } });
    for (const m of TERM_OPTIONS) expect(validateAutoLoanValues(values({ loanTermMonths: String(m) })).ok).toBe(true);
  });
  it('treats optional fields: empty and entered 0 are valid; negative / non-finite invalid', () => {
    expect(validateAutoLoanValues(values({ downPayment: '', salesTaxRatePct: '', tradeInValue: '', amountOwedOnTradeIn: '', fees: '' })).ok).toBe(true);
    expect(validateAutoLoanValues(values({ downPayment: '0', fees: '0' })).ok).toBe(true);
    expect(validateAutoLoanValues(values({ downPayment: '-5' }))).toMatchObject({ ok: false, fieldErrors: { downPayment: 'Enter a down payment of zero or more.' } });
    expect(validateAutoLoanValues(values({ fees: 'abc' })).ok).toBe(false);
  });
  it('does NOT reject supported cross-field scenarios (down > price, negative equity, credits > base)', () => {
    expect(validateAutoLoanValues(values({ downPayment: '40000' })).ok).toBe(true);
    expect(validateAutoLoanValues(values({ tradeInValue: '10000', amountOwedOnTradeIn: '14000' })).ok).toBe(true);
    expect(validateAutoLoanValues(values({ downPayment: '20000', tradeInValue: '15000' })).ok).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Computation — pass-through to the frozen formula                    */
/* ------------------------------------------------------------------ */

describe('computeAutoLoan — preserves the formula outputs', () => {
  it('ordinary financed loan matches the frozen result', () => {
    const r = good();
    expect(r.salesTax).toBeCloseTo(2100, 6);
    expect(r.loanAmount).toBeCloseTo(29400, 6);
    expect(r.monthlyPayment).toBeCloseTo(554.814269, 4);
    expect(r.totalLoanInterest).toBeCloseTo(3888.856148, 4);
    expect(r.totalOfPayments).toBeCloseTo(33288.856148, 4);
    expect(r.upfrontPayment).toBeCloseTo(3000, 6);
    expect(r.financed).toBe(true);
    expect(r.termMonths).toBe(60);
  });
  it('a zero rate gives payment = loan / months', () => {
    expect(computeAutoLoan(values({ interestRatePct: '0' })).monthlyPayment).toBe(490);
  });
  it('each supported term computes', () => {
    for (const m of TERM_OPTIONS) expect(computeAutoLoan(values({ loanTermMonths: String(m) })).monthlyPayment).toBeGreaterThan(0);
  });
  it('decimal price and rate carry precision', () => {
    const r = computeAutoLoan(values({ autoPrice: '28450.55', interestRatePct: '4.9', salesTaxRatePct: '6.25', fees: '129.5' }));
    expect(r.loanAmount).toBeCloseTo(27358.209375, 4);
  });
  it('empty optionals behave as 0 (same as entered 0)', () => {
    const empty = computeAutoLoan(values({ tradeInValue: '', amountOwedOnTradeIn: '', downPayment: '' }));
    const zero = computeAutoLoan(values({ tradeInValue: '0', amountOwedOnTradeIn: '0', downPayment: '0' }));
    expect(empty.loanAmount).toBeCloseTo(zero.loanAmount, 6);
  });
  it('toggle OFF excludes tax + fees from the loan but keeps salesTax output', () => {
    const r = computeAutoLoan(values({ includeTaxesFeesInLoan: false }));
    expect(r.loanAmount).toBeCloseTo(27000, 6);
    expect(r.salesTax).toBeCloseTo(2100, 6);
    expect(r.upfrontPayment).toBeCloseTo(5400, 6);
    expect(r.financed).toBe(false);
  });
});

describe('computeAutoLoan — trade-in equity', () => {
  it('positive equity reduces the loan', () => {
    expect(computeAutoLoan(values({ includeTaxesFeesInLoan: false, tradeInValue: '8000', amountOwedOnTradeIn: '2000' })).loanAmount).toBeCloseTo(21000, 6);
  });
  it('equal value/owed is net zero, not negative equity', () => {
    const r = computeAutoLoan(values({ tradeInValue: '5000', amountOwedOnTradeIn: '5000' }));
    expect(r.netTradeIn).toBe(0);
    expect(r.negativeEquity).toBe(false);
  });
  it('negative equity is signed and increases the loan', () => {
    const r = computeAutoLoan(values({ includeTaxesFeesInLoan: false, tradeInValue: '10000', amountOwedOnTradeIn: '14000' }));
    expect(r.netTradeIn).toBe(-4000);
    expect(r.negativeEquity).toBe(true);
    expect(r.loanAmount).toBeCloseTo(31000, 6);
  });
});

describe('computeAutoLoan — zero financed balance (informational)', () => {
  it('down payment >= price clamps the loan to zero', () => {
    const r = computeAutoLoan(values({ includeTaxesFeesInLoan: false, downPayment: '30000' }));
    expect(r.loanAmount).toBe(0);
    expect(r.zeroLoan).toBe(true);
    expect(r.monthlyPayment).toBe(0);
    expect(r.totalLoanInterest).toBe(0);
    expect(r.salesTax).toBeCloseTo(2100, 6);
  });
  it('credits exceeding the base also clamp to zero', () => {
    expect(computeAutoLoan(values({ includeTaxesFeesInLoan: false, downPayment: '20000', tradeInValue: '15000' })).zeroLoan).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

describe('completeResultValue guard', () => {
  it('returns the monthly payment for a well-formed result', () => {
    expect(completeResultValue(good())).toBeCloseTo(554.814269, 4);
  });
  it('ACCEPTS a valid zero-loan result', () => {
    const r = computeAutoLoan(values({ includeTaxesFeesInLoan: false, downPayment: '30000' }));
    expect(completeResultValue(r)).toBe(0);
    expect(Number.isNaN(completeResultValue(r))).toBe(false);
  });
  it('rejects non-finite / negative outputs', () => {
    expect(rejects({ ...good(), monthlyPayment: Infinity })).toBe(true);
    expect(rejects({ ...good(), loanAmount: -1 })).toBe(true);
    expect(rejects({ ...good(), salesTax: NaN })).toBe(true);
  });
  it('rejects a broken totalOfPayments = payment × months identity', () => {
    expect(rejects({ ...good(), totalOfPayments: good().totalOfPayments + 500 })).toBe(true);
  });
  it('rejects a broken interest = max(0, top − loan) identity', () => {
    expect(rejects({ ...good(), totalLoanInterest: good().totalLoanInterest + 500 })).toBe(true);
  });
  it('rejects a financed-amount that does not match the source equation', () => {
    expect(rejects({ ...good(), loanAmount: good().loanAmount + 500 })).toBe(true);
  });
  it('rejects a sales tax that does not match price × rate', () => {
    expect(rejects({ ...good(), salesTax: good().salesTax + 500 })).toBe(true);
  });
  it('rejects an unsupported term', () => {
    expect(rejects({ ...good(), termMonths: 99 })).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Descriptions + interpretation                                       */
/* ------------------------------------------------------------------ */

describe('descriptions + interpretation', () => {
  it('ordinary announcement is the dominant payment only', () => {
    expect(describeAutoLoanResult(good())).toBe('Your estimated monthly payment is 554 dollars and 81 cents.');
  });
  it('zero-loan announcement', () => {
    const r = computeAutoLoan(values({ includeTaxesFeesInLoan: false, downPayment: '30000' }));
    expect(describeAutoLoanResult(r)).toBe('No auto-loan balance remains based on the entered values.');
  });
  it('financed interpretation includes tax + fees', () => {
    expect(interpretationLines(good()).toggle).toContain('includes the entered sales tax and fees');
  });
  it('not-financed interpretation excludes them', () => {
    expect(interpretationLines(computeAutoLoan(values({ includeTaxesFeesInLoan: false }))).toggle).toContain('excludes the entered sales tax and fees');
  });
  it('negative-equity interpretation states the signed amount', () => {
    const r = computeAutoLoan(values({ tradeInValue: '10000', amountOwedOnTradeIn: '14000' }));
    expect(interpretationLines(r).equity).toContain('$4,000.00 of negative equity');
  });
  it('a positive/zero-equity result has no equity line', () => {
    expect(interpretationLines(good()).equity).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Reset                                                               */
/* ------------------------------------------------------------------ */

describe('resetValues', () => {
  it('clears personal numeric fields (structural defaults are island-owned)', () => {
    // Minimal mock root — resetValues only reads [name="..."] and sets .value (no DOM env needed).
    const fields: Record<string, { value: string }> = {};
    for (const n of ['autoPrice', 'interestRatePct', 'downPayment', 'salesTaxRatePct', 'tradeInValue', 'amountOwedOnTradeIn', 'fees']) {
      fields[n] = { value: '5' };
    }
    const root = {
      querySelector: (sel: string) => fields[sel.replace(/^\[name="(.+)"\]$/, '$1')] ?? null,
    } as unknown as HTMLElement;
    autoLoanBinding.resetValues(root, 'personal');
    for (const n of Object.keys(fields)) expect(fields[n].value).toBe('');
  });
});
