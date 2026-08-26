import { describe, it, expect } from 'vitest';
import { calculateMortgage, toYearlySchedule, type MortgageInput } from './mortgage';

/**
 * Mortgage formula + PMI-schedule characterization (R11E1 Commit 1). Freezes the EXACT behaviour of the
 * UNCHANGED dedicated calculateMortgage / toYearlySchedule (its own PMI-aware schedule engine — NOT
 * @lib/finance.buildAmortization / calculateLoan). Test-only: no change to the monthly-payment formula,
 * the PMI threshold/calculation, the yearly-collapse logic, the row contract, final-payment behaviour or
 * precision.
 *
 * Frozen model: loanAmount = max(0, homePrice − min(downPayment, homePrice)); a dedicated fixed-rate
 * payment (zero-rate → principal/months); monthlyPropertyTax/Insurance = annual/12; monthlyHoa = hoa;
 * PMI = pmiAnnualRate% × loanAmount / 12, charged each month while the START-of-period balance exceeds
 * 80% of the home price (a >= 20% down payment ⇒ loanAmount = threshold ⇒ NO PMI, since the test is
 * strict >); monthlyTotal (estimated INITIAL monthly payment) = P&I + tax + insurance + HOA + initial
 * PMI; totalOfPayments = loanAmount + totalInterest (P&I only). PMI never alters principal amortization.
 * The row is {period, payment, principal, interest, pmi, balance}; toYearlySchedule sums 12 months per
 * year. Inputs normalize with `|| 0`; homePrice/months clamp to >= 0 and downPayment clamps to
 * [0, homePrice] — the future binding rejects malformed fields and a down payment above the price.
 */

const ordinary: MortgageInput = {
  homePrice: 360000,
  downPayment: 72000, // 20% → no PMI
  loanTermYears: 30,
  annualInterestRate: 6.5,
  propertyTaxAnnual: 3600,
  homeInsuranceAnnual: 1200,
  hoaMonthly: 0,
  pmiAnnualRate: 0.5,
};

/* ------------------------------------------------------------------ */
/* Ordinary mortgage — every output                                    */
/* ------------------------------------------------------------------ */

describe('mortgage — ordinary (360000 / 20% down / 30y / 6.5% + tax + insurance)', () => {
  const r = calculateMortgage(ordinary);
  it('freezes the full summary', () => {
    expect(r.loanAmount).toBe(288000);
    expect(r.monthlyPrincipalInterest).toBeCloseTo(1820.36, 1);
    expect(r.monthlyPropertyTax).toBe(300); // 3600/12
    expect(r.monthlyInsurance).toBe(100); // 1200/12
    expect(r.monthlyHoa).toBe(0);
    expect(r.monthlyPmi).toBe(0); // 20% down
    expect(r.monthlyTotal).toBeCloseTo(2220.36, 1);
    expect(r.totalInterest).toBeCloseTo(367328.13, 0);
    expect(r.totalPmi).toBe(0);
    expect(r.totalOfPayments).toBeCloseTo(655328.13, 0);
    expect(r.payoffMonths).toBe(360);
  });
  it('is internally consistent', () => {
    expect(r.monthlyTotal).toBeCloseTo(r.monthlyPrincipalInterest + r.monthlyPropertyTax + r.monthlyInsurance + r.monthlyHoa + r.monthlyPmi, 6);
    expect(r.totalOfPayments).toBeCloseTo(r.loanAmount + r.totalInterest, 6);
  });
});

/* ------------------------------------------------------------------ */
/* Term options                                                        */
/* ------------------------------------------------------------------ */

describe('mortgage — supported term options (10/15/20/30)', () => {
  const expected: Record<number, number> = { 10: 2664.49, 15: 2025.26, 20: 1719.43, 30: 1438.92 };
  for (const y of [10, 15, 20, 30]) {
    it(`${y} years: P&I ${expected[y]}, ${y * 12} months, ${y} yearly rows`, () => {
      const r = calculateMortgage({ homePrice: 300000, downPayment: 60000, loanTermYears: y, annualInterestRate: 6 });
      expect(r.monthlyPrincipalInterest).toBeCloseTo(expected[y], 1);
      expect(r.payoffMonths).toBe(y * 12);
      expect(toYearlySchedule(r.schedule).length).toBe(y);
    });
  }
});

/* ------------------------------------------------------------------ */
/* Zero rate                                                           */
/* ------------------------------------------------------------------ */

describe('mortgage — zero interest rate', () => {
  const r = calculateMortgage({ homePrice: 240000, downPayment: 0, loanTermYears: 20, annualInterestRate: 0 });
  it('principal-only payment, zero interest, final balance zero', () => {
    expect(r.monthlyPrincipalInterest).toBe(1000); // 240000 / 240
    expect(r.totalInterest).toBe(0);
    expect(r.schedule[r.schedule.length - 1].balance).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Down payment + zero-mortgage clamp                                  */
/* ------------------------------------------------------------------ */

describe('mortgage — down payment', () => {
  const at = (downPayment: number) => calculateMortgage({ ...ordinary, pmiAnnualRate: 0.5, downPayment });
  it('a larger down payment lowers the loan and the payment', () => {
    expect(at(36000).loanAmount).toBe(324000); // 10%
    expect(at(108000).loanAmount).toBe(252000); // 30%
    expect(at(108000).monthlyPrincipalInterest).toBeLessThan(at(36000).monthlyPrincipalInterest);
  });
  it('a down payment above the price is CLAMPED to the price (loan 0)', () => {
    const r = calculateMortgage({ ...ordinary, downPayment: 500000 });
    expect(r.loanAmount).toBe(0);
    expect(r.monthlyPrincipalInterest).toBe(0);
  });
  it('a NEGATIVE / NaN / Infinite down payment normalizes (0 / 0 / clamped to price)', () => {
    expect(calculateMortgage({ ...ordinary, downPayment: -5000 }).loanAmount).toBe(360000); // → 0 down
    expect(calculateMortgage({ ...ordinary, downPayment: NaN }).loanAmount).toBe(360000);
    expect(calculateMortgage({ ...ordinary, downPayment: Infinity }).loanAmount).toBe(0); // min(Inf, price)=price
  });
  it('down payment EQUAL to the price is a valid zero-mortgage (empty schedule, ongoing costs remain)', () => {
    const r = calculateMortgage({ homePrice: 300000, downPayment: 300000, loanTermYears: 30, annualInterestRate: 6, propertyTaxAnnual: 3600, homeInsuranceAnnual: 1200, hoaMonthly: 50 });
    expect(r.loanAmount).toBe(0);
    expect(r.monthlyPrincipalInterest).toBe(0);
    expect(r.totalInterest).toBe(0);
    expect(r.totalPmi).toBe(0);
    expect(r.totalOfPayments).toBe(0);
    expect(r.schedule.length).toBe(0);
    expect(r.monthlyTotal).toBe(450); // 300 tax + 100 insurance + 50 HOA
  });
});

/* ------------------------------------------------------------------ */
/* Property costs                                                      */
/* ------------------------------------------------------------------ */

describe('mortgage — optional property costs', () => {
  it('tax/insurance/HOA compose into the monthly total and do NOT alter amortization', () => {
    const bare = calculateMortgage({ homePrice: 400000, downPayment: 80000, loanTermYears: 30, annualInterestRate: 6 });
    const withCosts = calculateMortgage({ homePrice: 400000, downPayment: 80000, loanTermYears: 30, annualInterestRate: 6, propertyTaxAnnual: 6000, homeInsuranceAnnual: 1800, hoaMonthly: 250 });
    expect(withCosts.monthlyPropertyTax).toBe(500);
    expect(withCosts.monthlyInsurance).toBe(150);
    expect(withCosts.monthlyHoa).toBe(250);
    expect(withCosts.monthlyTotal).toBeCloseTo(bare.monthlyPrincipalInterest + 900, 6);
    // The principal/interest schedule is identical regardless of the ancillary costs.
    expect(withCosts.schedule[0].principal).toBeCloseTo(bare.schedule[0].principal, 6);
    expect(withCosts.totalInterest).toBeCloseTo(bare.totalInterest, 6);
  });
  it('decimal annual costs divide to the month', () => {
    const r = calculateMortgage({ homePrice: 400000, downPayment: 80000, loanTermYears: 30, annualInterestRate: 6, propertyTaxAnnual: 3650 });
    expect(r.monthlyPropertyTax).toBeCloseTo(304.1667, 4);
  });
});

/* ------------------------------------------------------------------ */
/* PMI                                                                 */
/* ------------------------------------------------------------------ */

describe('mortgage — PMI (charged while start-of-period balance > 80% of home price)', () => {
  const pmi = calculateMortgage({ homePrice: 400000, downPayment: 40000, loanTermYears: 30, annualInterestRate: 6, pmiAnnualRate: 0.5 });
  it('initial PMI = pmiRate% × loan / 12; charged from row 1 while above the threshold', () => {
    expect(pmi.loanAmount).toBe(360000); // 10% down → above 320000 threshold
    expect(pmi.monthlyPmi).toBe(150); // 0.5% × 360000 / 12
    expect(pmi.schedule[0].pmi).toBe(150);
  });
  it('PMI drops to 0 at the first period whose START balance <= 80% LTV, and stays 0', () => {
    // Threshold 320000. Charged months 1..89; month 90 starts at 319,950 <= 320,000 → PMI stops.
    expect(pmi.schedule[88].pmi).toBe(150); // period 89 (last PMI)
    expect(pmi.schedule[89].pmi).toBe(0); // period 90 (first no-PMI)
    expect(pmi.schedule[pmi.schedule.length - 1].pmi).toBe(0);
    expect(pmi.totalPmi).toBeCloseTo(89 * 150, 6); // 13350
  });
  it('a down payment of exactly 20% (loan = threshold) produces NO PMI (strict >)', () => {
    expect(calculateMortgage({ homePrice: 400000, downPayment: 80000, loanTermYears: 30, annualInterestRate: 6, pmiAnnualRate: 0.5 }).monthlyPmi).toBe(0);
  });
  it('a zero PMI rate produces no PMI even above 80% LTV', () => {
    expect(calculateMortgage({ homePrice: 400000, downPayment: 40000, loanTermYears: 30, annualInterestRate: 6, pmiAnnualRate: 0 }).monthlyPmi).toBe(0);
  });
  it('PMI does NOT alter the loan balance or principal/interest', () => {
    const noPmi = calculateMortgage({ homePrice: 400000, downPayment: 40000, loanTermYears: 30, annualInterestRate: 6, pmiAnnualRate: 0 });
    for (let i = 0; i < 5; i++) {
      expect(pmi.schedule[i].balance).toBeCloseTo(noPmi.schedule[i].balance, 6);
      expect(pmi.schedule[i].principal).toBeCloseTo(noPmi.schedule[i].principal, 6);
    }
    expect(pmi.totalInterest).toBeCloseTo(noPmi.totalInterest, 6);
  });
});

/* ------------------------------------------------------------------ */
/* Schedule contract + reconciliation                                  */
/* ------------------------------------------------------------------ */

describe('mortgage — schedule contract', () => {
  const r = calculateMortgage({ homePrice: 400000, downPayment: 40000, loanTermYears: 30, annualInterestRate: 6, pmiAnnualRate: 0.5 });
  it('rows expose period/payment/principal/interest/pmi/balance/extra/costs, ordered from 1', () => {
    expect(Object.keys(r.schedule[0]).sort()).toEqual(['balance', 'costs', 'extra', 'interest', 'payment', 'period', 'pmi', 'principal'].sort());
    r.schedule.forEach((row, i) => expect(row.period).toBe(i + 1));
  });
  it('payment = principal + interest per row; balance never negative and falls to ~0', () => {
    let prev = Infinity;
    for (const row of r.schedule) {
      expect(row.payment).toBeCloseTo(row.principal + row.interest, 6);
      expect(row.balance).toBeGreaterThanOrEqual(0);
      expect(row.balance).toBeLessThan(prev);
      prev = row.balance;
    }
    expect(r.schedule[r.schedule.length - 1].balance).toBeCloseTo(0, 2);
  });
  it('reconciles: principal → loan, interest → totalInterest, PMI → totalPmi', () => {
    const sum = (k: 'principal' | 'interest' | 'pmi') => r.schedule.reduce((s, row) => s + row[k], 0);
    expect(sum('principal')).toBeCloseTo(r.loanAmount, 2);
    expect(sum('interest')).toBeCloseTo(r.totalInterest, 4);
    expect(sum('pmi')).toBeCloseTo(r.totalPmi, 4);
  });
  it('yearly collapse: 30 rows, reconciling to the monthly totals', () => {
    const y = toYearlySchedule(r.schedule);
    expect(y.length).toBe(30);
    expect(y[0].period).toBe(1);
    expect(y[29].balance).toBeCloseTo(0, 2);
    expect(y.reduce((s, row) => s + row.interest, 0)).toBeCloseTo(r.totalInterest, 2);
    expect(y.reduce((s, row) => s + row.pmi, 0)).toBeCloseTo(r.totalPmi, 4);
  });
});

/* ------------------------------------------------------------------ */
/* Edge inputs                                                         */
/* ------------------------------------------------------------------ */

describe('mortgage — edge inputs (frozen; the binding validates fields)', () => {
  it('a zero home price is an all-zero result', () => {
    const r = calculateMortgage({ homePrice: 0, downPayment: 0, loanTermYears: 30, annualInterestRate: 6 });
    expect(r.loanAmount).toBe(0);
    expect(r.monthlyTotal).toBe(0);
    expect(r.schedule.length).toBe(0);
  });
  it('zero term: no schedule, zero payment', () => {
    const r = calculateMortgage({ homePrice: 300000, downPayment: 0, loanTermYears: 0, annualInterestRate: 6 });
    expect(r.monthlyPrincipalInterest).toBe(0);
    expect(r.schedule.length).toBe(0);
  });
  it('a non-finite home price yields a non-finite (malformed) result', () => {
    expect(Number.isFinite(calculateMortgage({ homePrice: Infinity, downPayment: 0, loanTermYears: 30, annualInterestRate: 6 }).monthlyPrincipalInterest)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Precision                                                           */
/* ------------------------------------------------------------------ */

describe('mortgage — precision', () => {
  it('the P&I payment keeps full float precision', () => {
    const r = calculateMortgage(ordinary);
    expect(r.monthlyPrincipalInterest).not.toBe(Math.round(r.monthlyPrincipalInterest * 100) / 100);
  });
  it('the final payment absorbs the remainder to a zero balance', () => {
    const r = calculateMortgage({ homePrice: 500000, downPayment: 100000, loanTermYears: 15, annualInterestRate: 5.5 });
    expect(r.schedule[r.schedule.length - 1].balance).toBeCloseTo(0, 2);
    expect(r.schedule.reduce((s, row) => s + row.principal, 0)).toBeCloseTo(r.loanAmount, 2);
  });
});

/* ------------------------------------------------------------------ */
/* Optional extras: annual cost increases, extra payments, biweekly    */
/* ------------------------------------------------------------------ */

/**
 * Every option below is OPT-IN. The first block is the one that matters most:
 * with none of them supplied the engine must return exactly what it returned
 * before they existed, so an ordinary mortgage is provably unaffected.
 */
describe('mortgage — the optional inputs are genuinely optional', () => {
  const BASE = { homePrice: 400000, downPayment: 80000, loanTermYears: 30, annualInterestRate: 6.5 };
  const plain = calculateMortgage({ ...BASE, propertyTaxAnnual: 3600, homeInsuranceAnnual: 1200, hoaMonthly: 50 });

  it('omitting every option leaves the schedule and every total untouched', () => {
    expect(plain.payoffMonths).toBe(360);
    expect(plain.totalExtraPrincipal).toBe(0);
    expect(plain.withoutExtra).toBeNull();
    expect(plain.interestSaved).toBe(0);
    expect(plain.monthsSaved).toBe(0);
    expect(plain.biweekly).toBeNull();
    expect(plain.schedule.every((r) => r.extra === 0)).toBe(true);
  });

  it('zero-valued options are the same as omitting them', () => {
    const zeroed = calculateMortgage({
      ...BASE,
      propertyTaxAnnual: 3600,
      homeInsuranceAnnual: 1200,
      hoaMonthly: 50,
      propertyTaxIncreasePct: 0,
      homeInsuranceIncreasePct: 0,
      hoaIncreasePct: 0,
      otherCostsIncreasePct: 0,
      extraMonthly: { amount: 0, offset: 0 },
      extraYearly: { amount: 0, offset: 0 },
      extraOneTime: [{ amount: 0, offset: 3 }],
    });
    expect(zeroed.totalInterest).toBeCloseTo(plain.totalInterest, 6);
    expect(zeroed.payoffMonths).toBe(plain.payoffMonths);
    expect(zeroed.withoutExtra).toBeNull();
    expect(zeroed.biweekly).toBeNull();
  });

  it('with no increase the recorded costs are simply flat across the term', () => {
    const monthlyCosts = 3600 / 12 + 1200 / 12 + 50;
    expect(plain.schedule[0].costs).toBeCloseTo(monthlyCosts, 9);
    expect(plain.schedule[359].costs).toBeCloseTo(monthlyCosts, 9);
    expect(plain.totalPropertyTax).toBeCloseTo(300 * 360, 6);
    expect(plain.totalHoa).toBeCloseTo(50 * 360, 6);
    expect(plain.totalOtherCosts).toBe(0);
  });
});

describe('mortgage — annual tax & cost increase', () => {
  const r = calculateMortgage({
    homePrice: 400000, downPayment: 80000, loanTermYears: 30, annualInterestRate: 6.5,
    propertyTaxAnnual: 3600, homeInsuranceAnnual: 1200, hoaMonthly: 100, otherCostsAnnual: 600,
    propertyTaxIncreasePct: 3, homeInsuranceIncreasePct: 5, hoaIncreasePct: 2, otherCostsIncreasePct: 10,
  });

  it('year one is always the amount as entered, so the headline payment never moves', () => {
    const flat = calculateMortgage({
      homePrice: 400000, downPayment: 80000, loanTermYears: 30, annualInterestRate: 6.5,
      propertyTaxAnnual: 3600, homeInsuranceAnnual: 1200, hoaMonthly: 100, otherCostsAnnual: 600,
    });
    expect(r.monthlyTotal).toBeCloseTo(flat.monthlyTotal, 9);
    expect(r.schedule[0].costs).toBeCloseTo(flat.schedule[0].costs, 9);
    expect(r.schedule[11].costs).toBeCloseTo(flat.schedule[11].costs, 9); // still year one
  });

  it('each cost compounds once a year, at its OWN rate', () => {
    // Month 13 opens year two: tax +3%, insurance +5%, HOA +2%, other +10%.
    const y2 = 300 * 1.03 + 100 * 1.05 + 100 * 1.02 + 50 * 1.1;
    expect(r.schedule[12].costs).toBeCloseTo(y2, 9);
    // Month 25 opens year three — each rate applied twice.
    const y3 = 300 * 1.03 ** 2 + 100 * 1.05 ** 2 + 100 * 1.02 ** 2 + 50 * 1.1 ** 2;
    expect(r.schedule[24].costs).toBeCloseTo(y3, 9);
  });

  it('a rising cost totals more than the same flat cost, and the totals sum the rows', () => {
    expect(r.totalPropertyTax).toBeGreaterThan(300 * 360);
    expect(r.totalPropertyTax).toBeCloseTo(
      Array.from({ length: 30 }, (_, y) => 300 * 12 * 1.03 ** y).reduce((s, v) => s + v, 0), 4,
    );
    const rowCosts = r.schedule.reduce((s, row) => s + row.costs, 0);
    expect(rowCosts).toBeCloseTo(
      r.totalPropertyTax + r.totalHomeInsurance + r.totalHoa + r.totalOtherCosts, 4,
    );
  });

  it('increases never touch the loan itself', () => {
    const flat = calculateMortgage({
      homePrice: 400000, downPayment: 80000, loanTermYears: 30, annualInterestRate: 6.5,
    });
    expect(r.totalInterest).toBeCloseTo(flat.totalInterest, 6);
    expect(r.payoffMonths).toBe(flat.payoffMonths);
  });
});

describe('mortgage — extra payments', () => {
  const BASE = { homePrice: 400000, downPayment: 80000, loanTermYears: 30, annualInterestRate: 6.5 };
  const plain = calculateMortgage(BASE);

  it('an extra monthly payment shortens the loan and cuts the interest', () => {
    const r = calculateMortgage({ ...BASE, extraMonthly: { amount: 200, offset: 0 } });
    expect(r.payoffMonths).toBeLessThan(plain.payoffMonths);
    expect(r.totalInterest).toBeLessThan(plain.totalInterest);
    expect(r.totalExtraPrincipal).toBeGreaterThan(0);
    // The comparison is against the identical loan without them.
    expect(r.withoutExtra).toEqual({ totalInterest: plain.totalInterest, payoffMonths: plain.payoffMonths });
    expect(r.interestSaved).toBeCloseTo(plain.totalInterest - r.totalInterest, 6);
    expect(r.monthsSaved).toBe(plain.payoffMonths - r.payoffMonths);
  });

  it('an extra payment starts at its offset and not before', () => {
    const r = calculateMortgage({ ...BASE, extraMonthly: { amount: 500, offset: 24 } });
    expect(r.schedule.slice(0, 24).every((row) => row.extra === 0)).toBe(true);
    expect(r.schedule[24].extra).toBe(500);
    expect(r.schedule[25].extra).toBe(500);
  });

  it('an extra YEARLY payment lands every twelfth month from its offset', () => {
    const r = calculateMortgage({ ...BASE, extraYearly: { amount: 3000, offset: 6 } });
    const paid = r.schedule.filter((row) => row.extra > 0).map((row) => row.period);
    expect(paid.slice(0, 4)).toEqual([7, 19, 31, 43]);
    expect(r.schedule[6].extra).toBe(3000);
    expect(r.schedule[7].extra).toBe(0);
  });

  it('one-time payments land once, in their own month, and stack in the same month', () => {
    const r = calculateMortgage({
      ...BASE,
      extraOneTime: [{ amount: 10000, offset: 11 }, { amount: 5000, offset: 11 }, { amount: 20000, offset: 59 }],
    });
    expect(r.schedule[11].extra).toBe(15000);
    expect(r.schedule[59].extra).toBe(20000);
    expect(r.schedule.filter((row) => row.extra > 0).length).toBe(2);
    expect(r.totalExtraPrincipal).toBe(35000);
  });

  it('the three kinds combine', () => {
    const r = calculateMortgage({
      ...BASE,
      extraMonthly: { amount: 100, offset: 0 },
      extraYearly: { amount: 1200, offset: 0 },
      extraOneTime: [{ amount: 5000, offset: 0 }],
    });
    expect(r.schedule[0].extra).toBe(100 + 1200 + 5000);
    expect(r.schedule[1].extra).toBe(100);
    expect(r.payoffMonths).toBeLessThan(plain.payoffMonths);
  });

  it('an extra payment never overshoots: the balance closes at zero and principal still totals the loan', () => {
    const r = calculateMortgage({ ...BASE, extraMonthly: { amount: 9000, offset: 0 } });
    const last = r.schedule[r.schedule.length - 1];
    expect(last.balance).toBeLessThanOrEqual(0.005);
    expect(r.schedule.every((row) => row.extra >= 0)).toBe(true);
    const repaid = r.schedule.reduce((s, row) => s + row.principal + row.extra, 0);
    expect(repaid).toBeCloseTo(r.loanAmount, 2);
  });

  it('rows keep the payment == principal + interest invariant the result guard relies on', () => {
    const r = calculateMortgage({ ...BASE, extraMonthly: { amount: 250, offset: 0 } });
    for (const row of r.schedule) expect(row.payment).toBeCloseTo(row.principal + row.interest, 9);
  });

  it('a negative or absurd offset is clamped rather than breaking the schedule', () => {
    const r = calculateMortgage({ ...BASE, extraMonthly: { amount: 200, offset: -12 } });
    expect(r.schedule[0].extra).toBe(200);
    const late = calculateMortgage({ ...BASE, extraOneTime: [{ amount: 200, offset: 9999 }] });
    expect(late.totalExtraPrincipal).toBe(0);
    expect(late.payoffMonths).toBe(plain.payoffMonths);
  });
});

describe('mortgage — biweekly payback comparison', () => {
  const BASE = { homePrice: 400000, downPayment: 80000, loanTermYears: 30, annualInterestRate: 6.5 };
  const plain = calculateMortgage(BASE);
  const r = calculateMortgage({ ...BASE, includeBiweekly: true });

  it('is null unless asked for', () => {
    expect(plain.biweekly).toBeNull();
  });

  it('pays half the monthly principal and interest, and closes the loan early', () => {
    expect(r.biweekly).not.toBeNull();
    expect(r.biweekly!.payment).toBeCloseTo(plain.monthlyPrincipalInterest / 2, 9);
    expect(r.biweekly!.payoffMonths).toBeLessThan(plain.payoffMonths);
    expect(r.biweekly!.totalInterest).toBeLessThan(plain.totalInterest);
    expect(r.biweekly!.interestSaved).toBeCloseTo(plain.totalInterest - r.biweekly!.totalInterest, 6);
    expect(r.biweekly!.monthsSaved).toBe(plain.payoffMonths - r.biweekly!.payoffMonths);
  });

  it('never leaves the monthly schedule it is compared against unchanged-in-name-only', () => {
    expect(r.totalInterest).toBeCloseTo(plain.totalInterest, 6);
    expect(r.payoffMonths).toBe(plain.payoffMonths);
  });

  it('compares against the ORDINARY monthly loan even when extra payments are set', () => {
    const withBoth = calculateMortgage({
      ...BASE, includeBiweekly: true, extraMonthly: { amount: 200, offset: 0 },
    });
    expect(withBoth.biweekly!.interestSaved).toBeCloseTo(
      plain.totalInterest - withBoth.biweekly!.totalInterest, 6,
    );
  });

  it('handles a 0% loan and refuses a zero mortgage', () => {
    const free = calculateMortgage({ homePrice: 120000, downPayment: 0, loanTermYears: 10, annualInterestRate: 0, includeBiweekly: true });
    expect(free.biweekly!.totalInterest).toBe(0);
    expect(free.biweekly!.payoffPeriods).toBeGreaterThan(0);
    const none = calculateMortgage({ homePrice: 300000, downPayment: 300000, loanTermYears: 30, annualInterestRate: 6.5, includeBiweekly: true });
    expect(none.biweekly).toBeNull();
  });
});

describe('mortgage — total cost of ownership', () => {
  it('sums principal, interest, PMI and every recurring cost', () => {
    const r = calculateMortgage({
      homePrice: 400000, downPayment: 40000, loanTermYears: 30, annualInterestRate: 6.5,
      propertyTaxAnnual: 3600, homeInsuranceAnnual: 1200, hoaMonthly: 50, otherCostsAnnual: 600,
      pmiAnnualRate: 0.5, propertyTaxIncreasePct: 3,
    });
    expect(r.totalCostOfOwnership).toBeCloseTo(
      r.loanAmount + r.totalInterest + r.totalPmi +
        r.totalPropertyTax + r.totalHomeInsurance + r.totalHoa + r.totalOtherCosts,
      6,
    );
    expect(r.totalCostOfOwnership).toBeGreaterThan(r.totalOfPayments);
  });
});
