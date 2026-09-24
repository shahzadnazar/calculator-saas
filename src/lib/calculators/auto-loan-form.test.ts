import { describe, it, expect } from 'vitest';
import {
  validateAutoLoanValues,
  computeAutoLoan,
  completeResultValue,
  describeAutoLoanResult,
  interpretationLines,
  autoLoanBinding,
  TERM_OPTIONS,
  MAX_TERM_MONTHS,
  TERM_MESSAGE,
  formatPercent,
  DEFAULT_TERM,
  type AutoLoanValues,
  type AutoLoanComputed,
} from './auto-loan-form';

const values = (over: Partial<AutoLoanValues> = {}): AutoLoanValues => ({
  cashIncentives: '',
  stateCode: '',
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
  it('offers the common terms as suggestions, defaults to 60, and caps at 120 months', () => {
    expect([...TERM_OPTIONS]).toEqual([24, 36, 48, 60, 72, 84]);
    expect(DEFAULT_TERM).toBe(60);
    expect(MAX_TERM_MONTHS).toBe(120);
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
  it('accepts any whole term in 1..120 — an off-list 54 or 99 months is a real deal', () => {
    for (const m of ['1', '54', '99', '120', ...TERM_OPTIONS.map(String)]) {
      expect(validateAutoLoanValues(values({ loanTermMonths: m })).ok).toBe(true);
    }
  });
  it('rejects a blank, fractional, zero or over-cap term with the one range message', () => {
    for (const bad of ['', '0', '60.5', '121', '-12', 'x']) {
      expect(validateAutoLoanValues(values({ loanTermMonths: bad }))).toMatchObject({
        ok: false,
        fieldErrors: { loanTermMonths: TERM_MESSAGE },
      });
    }
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
  it('rejects a term outside 1..120 or a fractional one', () => {
    for (const bad of [0, 121, 60.5, Number.NaN]) {
      expect(rejects({ ...good(), termMonths: bad })).toBe(true);
    }
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

/* ------------------------------------------------------------------ */
/* Cash incentives, the state selector and the schedule guard          */
/* ------------------------------------------------------------------ */

describe('auto-loan binding — cash incentives', () => {
  it('are optional: blank and 0 are valid, negative and garbage are not', () => {
    expect(validateAutoLoanValues(values({ cashIncentives: '' })).ok).toBe(true);
    expect(validateAutoLoanValues(values({ cashIncentives: '0' })).ok).toBe(true);
    expect(validateAutoLoanValues(values({ cashIncentives: '1500' })).ok).toBe(true);
    for (const bad of ['-1', 'x']) {
      expect(validateAutoLoanValues(values({ cashIncentives: bad })).ok).toBe(false);
    }
  });
  it('reach the engine and lower the financed amount', () => {
    const plain = computeAutoLoan(values());
    const rebate = computeAutoLoan(values({ cashIncentives: '2000' }));
    expect(rebate.cashIncentives).toBe(2000);
    expect(rebate.loanAmount).toBe(plain.loanAmount - 2000);
    expect(rebate.salesTax).toBe(plain.salesTax);
    expect(Number.isFinite(completeResultValue(rebate))).toBe(true);
  });
});

describe('auto-loan binding — the state selector never drives the maths', () => {
  it('is carried on the values but read by nothing downstream', () => {
    const withState = computeAutoLoan(values({ stateCode: 'CA', salesTaxRatePct: '7' }));
    const without = computeAutoLoan(values({ stateCode: '', salesTaxRatePct: '7' }));
    // Same tax rate → identical tax, whatever the state field says.
    expect(withState.salesTax).toBe(without.salesTax);
    expect(withState.monthlyPayment).toBe(without.monthlyPayment);
  });
  it('an unknown code is inert rather than an error', () => {
    expect(validateAutoLoanValues(values({ stateCode: 'ZZ' })).ok).toBe(true);
  });
});

describe('auto-loan binding — the schedule must reconcile for a result to render', () => {
  const good = () => computeAutoLoan(values({ autoPrice: '50000', downPayment: '10000', interestRatePct: '5', loanTermMonths: '60', salesTaxRatePct: '7', fees: '2000' }));
  const rejects = (r: ReturnType<typeof computeAutoLoan>) => Number.isNaN(completeResultValue(r));

  it('accepts the well-formed reference result', () => {
    const r = good();
    expect(r.schedule.length).toBe(60);
    expect(r.yearlySchedule.length).toBe(5);
    expect(Number.isFinite(completeResultValue(r))).toBe(true);
  });
  it('rejects a missing, truncated or over-long schedule', () => {
    expect(rejects({ ...good(), schedule: [] })).toBe(true);
    expect(rejects({ ...good(), schedule: good().schedule.slice(0, 30) })).toBe(true);
  });
  it('rejects out-of-order periods', () => {
    expect(rejects({ ...good(), schedule: [...good().schedule].reverse() })).toBe(true);
  });
  it('rejects a row whose payment is not interest + principal', () => {
    const broken = good().schedule.map((r, i) => (i === 4 ? { ...r, payment: r.payment + 100 } : r));
    expect(rejects({ ...good(), schedule: broken })).toBe(true);
  });
  it('rejects a non-finite or negative figure on any row', () => {
    for (const patch of [{ interest: Number.NaN }, { principal: -1 }, { balance: -1 }]) {
      const broken = good().schedule.map((r, i) => (i === 4 ? { ...r, ...patch } : r));
      expect(rejects({ ...good(), schedule: broken })).toBe(true);
    }
  });
  it('rejects a schedule that does not discharge the loan or close at zero', () => {
    const short = good().schedule.map((r, i) => (i === 0 ? { ...r, principal: r.principal - 500 } : r));
    expect(rejects({ ...good(), schedule: short })).toBe(true);
    const openEnded = good().schedule.map((r, i, a) => (i === a.length - 1 ? { ...r, balance: 500 } : r));
    expect(rejects({ ...good(), schedule: openEnded })).toBe(true);
  });
  it('rejects a yearly collapse of the wrong length or that does not agree with the months', () => {
    expect(rejects({ ...good(), yearlySchedule: good().yearlySchedule.slice(0, 4) })).toBe(true);
    const drifted = good().yearlySchedule.map((y, i) => (i === 0 ? { ...y, interest: y.interest + 250 } : y));
    expect(rejects({ ...good(), yearlySchedule: drifted })).toBe(true);
  });
  it('rejects a principal share outside 0..1', () => {
    expect(rejects({ ...good(), principalShare: 1.2 })).toBe(true);
    expect(rejects({ ...good(), principalShare: -0.1 })).toBe(true);
  });
  it('a ZERO loan is valid precisely because it has no schedule', () => {
    const none = computeAutoLoan(values({ autoPrice: '20000', downPayment: '25000' }));
    expect(none.loanAmount).toBe(0);
    expect(Number.isFinite(completeResultValue(none))).toBe(true);
    expect(rejects({ ...none, schedule: good().schedule })).toBe(true);
  });
});

describe('auto-loan binding — formatPercent', () => {
  it('reads a 0–1 share as whole percent and clamps anything outside it', () => {
    expect(formatPercent(0.883)).toBe('88%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(1.5)).toBe('100%');
    expect(formatPercent(-1)).toBe('0%');
    expect(formatPercent(Number.NaN)).toBe('0%');
  });
});
