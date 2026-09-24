import { describe, it, expect } from 'vitest';
import { calculateAutoLoan } from './auto-loan';

/**
 * Auto Loan formula characterization (R11C1 Commit 1). Freezes the EXACT behaviour of the UNCHANGED
 * pure calculateAutoLoan (which delegates the payment to @lib/finance pmt) so the task-first migration
 * is a visible presentation/validation layer over an untouched formula. Test-only: no change to
 * calculateAutoLoan, pmt, the financed-amount equation, the tax basis, trade-in / fee treatment, the
 * loan-amount clamp, the totalOfPayments convention or the result shape.
 *
 * Frozen model: salesTax = price × salesTaxRate on the FULL (non-negative) price; netTradeIn =
 * tradeInValue − amountOwedOnTradeIn (UNCLAMPED — may be negative); cashDown = downPayment +
 * netTradeIn; loanAmount = max(0, [price (+ salesTax + fees when financed)] − cashDown); monthly
 * payment = pmt(loanAmount, rate, months); totalOfPayments = payment × months; totalLoanInterest =
 * max(0, totalOfPayments − loanAmount). Extra outputs: upfrontPayment = downPayment (+ salesTax + fees
 * when NOT financed); totalCost = price + salesTax + fees + max(0, interest). Inputs are normalized
 * with `|| 0` and price/months are clamped to >= 0 — the future binding rejects malformed fields while
 * preserving supported cross-field economic scenarios (negative equity, credits exceeding the base).
 */

const base = {
  autoPrice: 30000,
  loanTermMonths: 60,
  interestRatePct: 5,
  downPayment: 3000,
  tradeInValue: 0,
  amountOwedOnTradeIn: 0,
  salesTaxRatePct: 7,
  fees: 300,
};
const financed = (over = {}) => calculateAutoLoan({ ...base, includeTaxesFeesInLoan: true, ...over });
const upfront = (over = {}) => calculateAutoLoan({ ...base, includeTaxesFeesInLoan: false, ...over });

/* ------------------------------------------------------------------ */
/* Ordinary financed loan — every output                               */
/* ------------------------------------------------------------------ */

describe('auto loan — ordinary financed loan (all outputs)', () => {
  const r = financed();
  it('freezes the full result shape for 30000 / 5% / 60mo / 3000 down / 7% tax / 300 fees', () => {
    expect(r.salesTax).toBeCloseTo(2100, 6); // 30000 × 7%
    expect(r.loanAmount).toBeCloseTo(29400, 6); // 30000 + 2100 + 300 − 3000
    expect(r.monthlyPayment).toBeCloseTo(554.814269, 4);
    expect(r.totalLoanInterest).toBeCloseTo(3888.856148, 4);
    expect(r.totalOfPayments).toBeCloseTo(33288.856148, 4);
    expect(r.upfrontPayment).toBeCloseTo(3000, 6); // down only when financed
    expect(r.totalCost).toBeCloseTo(36288.856148, 4);
  });
  it('is internally consistent: totalOfPayments = payment × months, interest = max(0, top − loan)', () => {
    expect(r.totalOfPayments).toBeCloseTo(r.monthlyPayment * 60, 6);
    expect(r.totalLoanInterest).toBeCloseTo(Math.max(0, r.totalOfPayments - r.loanAmount), 6);
    expect(r.totalCost).toBeCloseTo(30000 + r.salesTax + 300 + r.totalLoanInterest, 6);
  });
});

/* ------------------------------------------------------------------ */
/* Term options — freeze every source-supported term                   */
/* ------------------------------------------------------------------ */

describe('auto loan — supported term options (36/48/60/72/84)', () => {
  const expected: Record<number, number> = {
    36: 881.144375,
    48: 677.061231,
    60: 554.814269,
    72: 473.485020,
    84: 415.536927,
  };
  for (const m of [36, 48, 60, 72, 84]) {
    it(`${m} months: payment ${expected[m]}, loan constant 29400, top = payment × ${m}`, () => {
      const r = financed({ loanTermMonths: m });
      expect(r.loanAmount).toBeCloseTo(29400, 6);
      expect(r.monthlyPayment).toBeCloseTo(expected[m], 4);
      expect(r.totalOfPayments).toBeCloseTo(r.monthlyPayment * m, 6);
    });
  }
  it('a longer term lowers the payment but raises total interest', () => {
    expect(financed({ loanTermMonths: 84 }).monthlyPayment).toBeLessThan(financed({ loanTermMonths: 36 }).monthlyPayment);
    expect(financed({ loanTermMonths: 84 }).totalLoanInterest).toBeGreaterThan(financed({ loanTermMonths: 36 }).totalLoanInterest);
  });
});

/* ------------------------------------------------------------------ */
/* Zero rate                                                           */
/* ------------------------------------------------------------------ */

describe('auto loan — zero interest rate', () => {
  it('financed 0%: payment = loan / months, zero interest, top = loan', () => {
    const r = financed({ interestRatePct: 0 });
    expect(r.monthlyPayment).toBe(490); // 29400 / 60
    expect(r.totalLoanInterest).toBe(0);
    expect(r.totalOfPayments).toBe(29400);
  });
  it('not-financed 0%: payment = 27000 / 60', () => {
    expect(upfront({ interestRatePct: 0 }).monthlyPayment).toBe(450);
  });
});

/* ------------------------------------------------------------------ */
/* Finance-taxes-and-fees toggle                                       */
/* ------------------------------------------------------------------ */

describe('auto loan — finance taxes & fees toggle', () => {
  it('ON: tax + fees are inside the loan; upfront is the down payment only', () => {
    const r = financed();
    expect(r.loanAmount).toBeCloseTo(29400, 6); // includes 2100 tax + 300 fees
    expect(r.upfrontPayment).toBeCloseTo(3000, 6);
  });
  it('OFF: loan excludes tax + fees, but salesTax is still output and moves to upfront', () => {
    const r = upfront();
    expect(r.loanAmount).toBeCloseTo(27000, 6); // 30000 − 3000
    expect(r.salesTax).toBeCloseTo(2100, 6); // still calculated
    expect(r.upfrontPayment).toBeCloseTo(5400, 6); // 3000 + 2100 + 300
    expect(r.monthlyPayment).toBeCloseTo(509.523308, 4);
    expect(r.totalLoanInterest).toBeCloseTo(3571.398503, 4);
  });
  it('financing tax & fees raises the payment vs paying them upfront', () => {
    expect(financed().monthlyPayment).toBeGreaterThan(upfront().monthlyPayment);
  });
});

/* ------------------------------------------------------------------ */
/* Trade-in (incl. negative equity)                                    */
/* ------------------------------------------------------------------ */

describe('auto loan — trade-in equity', () => {
  it('positive equity reduces the loan like a down payment', () => {
    const r = upfront({ tradeInValue: 8000, amountOwedOnTradeIn: 2000 }); // net +6000
    expect(r.loanAmount).toBeCloseTo(21000, 6); // 30000 − (3000 + 6000)
    expect(r.monthlyPayment).toBeCloseTo(396.295907, 4);
  });
  it('trade-in value equal to the amount owed is net zero', () => {
    expect(upfront({ tradeInValue: 5000, amountOwedOnTradeIn: 5000 }).loanAmount).toBeCloseTo(27000, 6);
  });
  it('NEGATIVE equity increases the financed balance (not clamped)', () => {
    const r = upfront({ tradeInValue: 10000, amountOwedOnTradeIn: 14000 }); // net −4000
    expect(r.loanAmount).toBeCloseTo(31000, 6); // 30000 − (3000 − 4000)
    expect(r.monthlyPayment).toBeCloseTo(585.008243, 4);
  });
  it('negative equity also rolls into a financed loan', () => {
    expect(financed({ tradeInValue: 10000, amountOwedOnTradeIn: 14000 }).loanAmount).toBeCloseTo(33400, 6);
  });
  it('decimal inputs carry full precision', () => {
    const r = financed({ autoPrice: 28450.55, interestRatePct: 4.9, salesTaxRatePct: 6.25, fees: 129.5 });
    expect(r.salesTax).toBeCloseTo(1778.159375, 6);
    expect(r.loanAmount).toBeCloseTo(27358.209375, 6);
    expect(r.monthlyPayment).toBeCloseTo(515.030699, 4);
  });
});

/* ------------------------------------------------------------------ */
/* Down payment + zero financed balance                                */
/* ------------------------------------------------------------------ */

describe('auto loan — down payment and the clamped zero-loan result', () => {
  it('a down payment equal to the price clears the loan (financed off)', () => {
    const r = upfront({ downPayment: 30000 });
    expect(r.loanAmount).toBe(0);
    expect(r.monthlyPayment).toBe(0);
    expect(r.totalLoanInterest).toBe(0);
    expect(r.totalOfPayments).toBe(0);
    expect(r.salesTax).toBeCloseTo(2100, 6); // tax still output
  });
  it('cash + trade credits exceeding the base clamp the loan to zero', () => {
    const r = upfront({ downPayment: 20000, tradeInValue: 15000 }); // credits 35000 > 30000
    expect(r.loanAmount).toBe(0);
    expect(r.monthlyPayment).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Tax basis                                                           */
/* ------------------------------------------------------------------ */

describe('auto loan — tax basis (full vehicle price, no credits reduce it)', () => {
  it('sales tax is the full price × rate', () => {
    expect(financed().salesTax).toBeCloseTo(30000 * 0.07, 6);
  });
  it('a trade-in does NOT reduce the taxable price', () => {
    expect(upfront({ tradeInValue: 9000, amountOwedOnTradeIn: 1000 }).salesTax).toBeCloseTo(2100, 6);
  });
  it('a down payment does NOT reduce the taxable price', () => {
    expect(financed({ downPayment: 10000 }).salesTax).toBeCloseTo(2100, 6);
  });
  it('fees are NOT part of the tax base', () => {
    expect(financed({ fees: 5000 }).salesTax).toBeCloseTo(2100, 6);
  });
});

/* ------------------------------------------------------------------ */
/* Edge inputs (frozen source behaviour; the binding rejects these)    */
/* ------------------------------------------------------------------ */

describe('auto loan — edge inputs (frozen; the binding validates fields)', () => {
  it('a zero or negative price clamps to an all-zero loan (tax 0)', () => {
    for (const autoPrice of [0, -100]) {
      const r = financed({ autoPrice });
      expect(r.loanAmount).toBe(0);
      expect(r.salesTax).toBe(0);
      expect(r.monthlyPayment).toBe(0);
    }
  });
  it('zero months: the loan is computed but the payment (and top) are zero', () => {
    const r = financed({ loanTermMonths: 0 });
    expect(r.loanAmount).toBeCloseTo(29400, 6);
    expect(r.monthlyPayment).toBe(0);
    expect(r.totalOfPayments).toBe(0);
    expect(r.totalLoanInterest).toBe(0);
  });
  it('a negative rate drives top below the loan and clamps interest to zero', () => {
    const r = financed({ interestRatePct: -5 });
    expect(r.totalOfPayments).toBeLessThan(r.loanAmount);
    expect(r.totalLoanInterest).toBe(0);
  });
  it('a NaN price normalizes to zero; an Infinite price yields a non-finite (malformed) result', () => {
    expect(financed({ autoPrice: NaN }).loanAmount).toBe(0);
    expect(Number.isFinite(financed({ autoPrice: Infinity }).salesTax)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Rounding / precision                                                */
/* ------------------------------------------------------------------ */

describe('auto loan — precision', () => {
  it('the monthly payment keeps full float precision (not pre-rounded)', () => {
    const r = financed();
    expect(r.monthlyPayment).not.toBe(Math.round(r.monthlyPayment * 100) / 100);
  });
  it('totalOfPayments = payment × months exactly, and interest tracks it', () => {
    const r = financed({ autoPrice: 27333.33, fees: 99.99 });
    expect(r.totalOfPayments).toBeCloseTo(r.monthlyPayment * 60, 6);
    expect(r.totalLoanInterest).toBeCloseTo(Math.max(0, r.totalOfPayments - r.loanAmount), 6);
  });
});

/* ------------------------------------------------------------------ */
/* Cash incentives, the schedule and the loan breakdown                */
/* ------------------------------------------------------------------ */

/**
 * The reference case published for this calculator: a $50,000 car, 60 months at 5%,
 * $10,000 down, 7% sales tax and $2,000 of fees, with taxes and fees paid upfront.
 * Every figure below is pinned to that published result, so the engine cannot drift
 * away from the numbers the product is expected to produce.
 */
const REFERENCE = {
  autoPrice: 50000,
  loanTermMonths: 60,
  interestRatePct: 5,
  downPayment: 10000,
  tradeInValue: 0,
  amountOwedOnTradeIn: 0,
  salesTaxRatePct: 7,
  fees: 2000,
  includeTaxesFeesInLoan: false,
};

describe('auto loan — pinned against the published reference figures', () => {
  const r = calculateAutoLoan(REFERENCE);
  const money = (v: number) => Math.round(v * 100) / 100;

  it('reproduces the summary to the cent', () => {
    expect(money(r.loanAmount)).toBe(40000);
    expect(money(r.salesTax)).toBe(3500);
    expect(money(r.upfrontPayment)).toBe(15500);
    expect(money(r.monthlyPayment)).toBe(754.85);
    expect(money(r.totalOfPayments)).toBe(45290.96);
    expect(money(r.totalLoanInterest)).toBe(5290.96);
    expect(money(r.totalCost)).toBe(60790.96);
  });

  it('splits the repayment 88% principal / 12% interest', () => {
    expect(Math.round(r.principalShare * 100)).toBe(88);
    expect(Math.round((1 - r.principalShare) * 100)).toBe(12);
  });

  it('reproduces the monthly schedule to the cent', () => {
    expect(r.schedule.length).toBe(60);
    expect(r.schedule[0]).toMatchObject({ period: 1 });
    expect(money(r.schedule[0].interest)).toBe(166.67);
    expect(money(r.schedule[0].principal)).toBe(588.18);
    expect(money(r.schedule[0].balance)).toBe(39411.82);
    expect(money(r.schedule[11].interest)).toBe(139.14);
    expect(money(r.schedule[11].principal)).toBe(615.71);
    expect(money(r.schedule[11].balance)).toBe(32777.79);
    expect(money(r.schedule[59].balance)).toBe(0);
  });

  it('reproduces the annual schedule to the cent', () => {
    const expected = [
      [1835.98, 7222.21, 32777.79],
      [1466.48, 7591.71, 25186.08],
      [1078.07, 7980.12, 17205.96],
      [669.8, 8388.4, 8817.56],
      [240.63, 8817.56, 0],
    ];
    expect(r.yearlySchedule.length).toBe(5);
    r.yearlySchedule.forEach((row, i) => {
      expect(row.period).toBe(i + 1);
      expect([money(row.interest), money(row.principal), money(row.balance)]).toEqual(expected[i]);
    });
  });
});

describe('auto loan — the schedule is a real repayment', () => {
  const r = calculateAutoLoan(REFERENCE);

  it('every row pays interest + principal and periods run 1..n', () => {
    r.schedule.forEach((row, i) => {
      expect(row.period).toBe(i + 1);
      expect(row.payment).toBeCloseTo(row.interest + row.principal, 9);
      expect(row.interest).toBeGreaterThanOrEqual(0);
      expect(row.principal).toBeGreaterThanOrEqual(0);
      expect(row.balance).toBeGreaterThanOrEqual(0);
    });
  });
  it('the principal repaid sums to the loan and the interest to the reported total', () => {
    expect(r.schedule.reduce((s, x) => s + x.principal, 0)).toBeCloseTo(r.loanAmount, 6);
    expect(r.schedule.reduce((s, x) => s + x.interest, 0)).toBeCloseTo(r.totalLoanInterest, 6);
    expect(r.schedule.reduce((s, x) => s + x.payment, 0)).toBeCloseTo(r.totalOfPayments, 6);
  });
  it('interest falls and principal rises every month, closing at zero', () => {
    for (let i = 1; i < r.schedule.length; i++) {
      expect(r.schedule[i].interest).toBeLessThan(r.schedule[i - 1].interest);
      expect(r.schedule[i].principal).toBeGreaterThan(r.schedule[i - 1].principal);
    }
    expect(r.schedule[r.schedule.length - 1].balance).toBeLessThanOrEqual(0.005);
  });
  it('the yearly collapse sums the months it was built from', () => {
    expect(r.yearlySchedule.reduce((s, x) => s + x.interest, 0)).toBeCloseTo(r.totalLoanInterest, 6);
    expect(r.yearlySchedule.reduce((s, x) => s + x.principal, 0)).toBeCloseTo(r.loanAmount, 6);
  });
  it('a part-year makes a final short row rather than being dropped', () => {
    const odd = calculateAutoLoan({ ...REFERENCE, loanTermMonths: 30 });
    expect(odd.schedule.length).toBe(30);
    expect(odd.yearlySchedule.length).toBe(3);
    expect(odd.yearlySchedule[2].balance).toBeLessThanOrEqual(0.005);
  });
  it('a 0% loan still amortizes, with no interest at all', () => {
    const free = calculateAutoLoan({ ...REFERENCE, interestRatePct: 0 });
    expect(free.schedule.length).toBe(60);
    expect(free.totalLoanInterest).toBe(0);
    expect(free.schedule.every((row) => row.interest === 0)).toBe(true);
    expect(free.principalShare).toBeCloseTo(1, 9);
  });
  it('a zero loan has no schedule to show', () => {
    const none = calculateAutoLoan({ ...REFERENCE, downPayment: 60000 });
    expect(none.loanAmount).toBe(0);
    expect(none.schedule).toEqual([]);
    expect(none.yearlySchedule).toEqual([]);
    expect(none.principalShare).toBe(0);
  });
});

describe('auto loan — cash incentives', () => {
  const base = calculateAutoLoan(REFERENCE);

  it('are absent by default and change nothing', () => {
    expect(base.cashIncentives).toBe(0);
    expect(calculateAutoLoan({ ...REFERENCE, cashIncentives: 0 }).loanAmount).toBe(base.loanAmount);
  });
  it('reduce the amount financed dollar for dollar', () => {
    const r = calculateAutoLoan({ ...REFERENCE, cashIncentives: 2500 });
    expect(r.cashIncentives).toBe(2500);
    expect(r.loanAmount).toBe(base.loanAmount - 2500);
    expect(r.monthlyPayment).toBeLessThan(base.monthlyPayment);
  });
  it('do NOT reduce the sales tax — most states tax the pre-rebate price', () => {
    const r = calculateAutoLoan({ ...REFERENCE, cashIncentives: 2500 });
    expect(r.salesTax).toBe(base.salesTax);
    expect(r.upfrontPayment).toBe(base.upfrontPayment);
  });
  it('come off the total cost, because the buyer never pays them', () => {
    const r = calculateAutoLoan({ ...REFERENCE, cashIncentives: 2500 });
    expect(r.totalCost).toBeCloseTo(base.totalCost - 2500 - (base.totalLoanInterest - r.totalLoanInterest), 6);
    expect(r.totalCost).toBeLessThan(base.totalCost);
  });
  it('cannot push the loan below zero', () => {
    const r = calculateAutoLoan({ ...REFERENCE, cashIncentives: 999999 });
    expect(r.loanAmount).toBe(0);
    expect(r.monthlyPayment).toBe(0);
    expect(r.schedule).toEqual([]);
  });
  it('a negative incentive is ignored rather than becoming a surcharge', () => {
    expect(calculateAutoLoan({ ...REFERENCE, cashIncentives: -5000 }).loanAmount).toBe(base.loanAmount);
  });
});
