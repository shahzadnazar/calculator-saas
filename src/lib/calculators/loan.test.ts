import { describe, it, expect } from 'vitest';
import { calculateLoan, calculateExtendedLoan, effectiveAnnualRate, periodicRate } from './loan';

/**
 * Characterization of the calculateLoan wrapper (R11B1) — the engine behind the Amortization
 * calculator. Freezes how it composes @lib/finance (buildAmortization + collapseYearly) and derives
 * monthlyPayment / totalInterest / totalPaid / payoffMonths / schedule / yearlySchedule. Test-only: no
 * change to calculateLoan or @lib/finance. Binding-level validation (Commit 2) rejects the degenerate
 * domains frozen here (zero / negative / non-finite / fractional term); the pure function tolerates them.
 */

describe('loan calculator — ordinary', () => {
  it('computes the monthly payment for a fixed-rate loan', () => {
    const r = calculateLoan({ amount: 20000, annualInterestRate: 5, termYears: 5 });
    expect(r.monthlyPayment).toBeCloseTo(377.42, 2);
    expect(r.payoffMonths).toBe(60);
    expect(r.totalInterest).toBeCloseTo(2645.48, 2);
    expect(r.totalPaid).toBeCloseTo(22645.48, 2);
    expect(r.schedule.length).toBe(60);
    expect(r.yearlySchedule.length).toBe(5);
  });

  it('a 30-year loan is the full 360-row monthly schedule / 30 yearly rows, reconciling totals', () => {
    const r = calculateLoan({ amount: 250000, annualInterestRate: 6.5, termYears: 30 });
    expect(r.monthlyPayment).toBeCloseTo(1580.17, 2);
    expect(r.totalInterest).toBeCloseTo(318861.22, 2);
    expect(r.totalPaid).toBeCloseTo(568861.22, 2);
    expect(r.payoffMonths).toBe(360);
    expect(r.schedule.length).toBe(360);
    expect(r.yearlySchedule.length).toBe(30);
    // totalPaid = normalized principal + totalInterest
    expect(r.totalPaid).toBeCloseTo(250000 + r.totalInterest, 6);
    // schedule reconciliation
    expect(r.schedule.reduce((s, x) => s + x.principal, 0)).toBeCloseTo(250000, 2);
    expect(r.schedule.reduce((s, x) => s + x.interest, 0)).toBeCloseTo(r.totalInterest, 6);
    expect(r.schedule[359].balance).toBe(0);
  });

  it('handles a zero-interest loan (straight-line principal, no interest)', () => {
    const r = calculateLoan({ amount: 12000, annualInterestRate: 0, termYears: 1 });
    expect(r.monthlyPayment).toBe(1000);
    expect(r.totalInterest).toBe(0);
    expect(r.totalPaid).toBe(12000);
    expect(r.payoffMonths).toBe(12);
    expect(r.schedule[11].balance).toBe(0);
  });

  it('fully amortizes to zero for an ordinary loan', () => {
    const r = calculateLoan({ amount: 35000, annualInterestRate: 6.9, termYears: 6 });
    expect(r.schedule[r.schedule.length - 1].balance).toBeCloseTo(0, 6);
  });
});

describe('loan calculator — degenerate / non-finite domains (frozen; the binding rejects these)', () => {
  it('a zero principal produces an empty schedule and zero everything', () => {
    const r = calculateLoan({ amount: 0, annualInterestRate: 5, termYears: 5 });
    expect(r).toMatchObject({ monthlyPayment: 0, totalInterest: 0, totalPaid: 0, payoffMonths: 0 });
    expect(r.schedule).toEqual([]);
    expect(r.yearlySchedule).toEqual([]);
  });

  it('a zero term produces no schedule, yet totalPaid still equals the amount (quirk)', () => {
    const r = calculateLoan({ amount: 20000, annualInterestRate: 5, termYears: 0 });
    expect(r.payoffMonths).toBe(0);
    expect(r.schedule).toEqual([]);
    expect(r.totalPaid).toBe(20000); // max(0, amount) + 0 interest, independent of the schedule
  });

  it('a negative amount clamps to an empty, all-zero result', () => {
    const r = calculateLoan({ amount: -20000, annualInterestRate: 5, termYears: 5 });
    expect(r).toMatchObject({ monthlyPayment: 0, totalInterest: 0, totalPaid: 0, payoffMonths: 0 });
  });

  it('a negative rate flows through to NEGATIVE total interest (no clamp)', () => {
    const r = calculateLoan({ amount: 20000, annualInterestRate: -5, termYears: 5 });
    expect(r.totalInterest).toBeCloseTo(-2437.42, 2);
    expect(r.totalPaid).toBeLessThan(20000);
    expect(r.payoffMonths).toBe(60);
  });

  it('a NaN amount collapses to empty; a NaN rate is treated as 0%', () => {
    expect(calculateLoan({ amount: NaN, annualInterestRate: 5, termYears: 5 }).schedule).toEqual([]);
    const nr = calculateLoan({ amount: 20000, annualInterestRate: NaN, termYears: 5 });
    expect(nr.monthlyPayment).toBeCloseTo(333.33, 2); // 20000 / 60, zero-rate branch
    expect(nr.totalInterest).toBe(0);
    expect(nr.payoffMonths).toBe(60);
  });

  it('an INFINITE amount yields a malformed, NON-FINITE result (a single malformed row)', () => {
    const r = calculateLoan({ amount: Infinity, annualInterestRate: 5, termYears: 5 });
    expect(Number.isFinite(r.monthlyPayment)).toBe(false); // Infinity payment
    expect(Number.isFinite(r.totalInterest)).toBe(false); // Infinity interest
    expect(r.payoffMonths).toBe(1); // the loop pushes one malformed row then stops (NaN > 0.005 is false)
    // The Commit 2 binding's complete-result guard rejects this before it can render.
  });

  it('a fractional term is rounded to whole months (2.5 years -> 30 months)', () => {
    const r = calculateLoan({ amount: 10000, annualInterestRate: 5, termYears: 2.5 });
    expect(r.payoffMonths).toBe(30);
    expect(r.yearlySchedule.length).toBe(3); // 30 months -> years 1,2,3 (partial)
  });
});

/**
 * R15B1 expanded characterization — freezes the reconciliation invariants the Loan
 * binding's complete-result guard (loan-form.ts) relies on. Test-only; no change to
 * loan.ts / @lib/finance. Reconciliation is asserted structurally (Σ principal ≈
 * amount, Σ interest ≈ totalInterest, payment × months ≈ totalPaid, final balance ≈ 0,
 * yearly totals ≈ monthly totals) rather than by hardcoding derived figures.
 */
describe('loan calculator — R15B1 expanded characterization', () => {
  it('zero-interest loan: monthly payment = principal ÷ months, zero interest, equal instalments', () => {
    const r = calculateLoan({ amount: 9000, annualInterestRate: 0, termYears: 2 });
    expect(r.payoffMonths).toBe(24);
    expect(r.monthlyPayment).toBeCloseTo(9000 / 24, 6); // 375
    expect(r.totalInterest).toBe(0);
    expect(r.totalPaid).toBe(9000);
    for (const row of r.schedule) {
      expect(row.interest).toBe(0);
      expect(row.principal).toBeCloseTo(9000 / 24, 6);
    }
    expect(r.schedule[r.schedule.length - 1].balance).toBe(0);
  });

  it('short-term loan (2y): the full 24-row monthly schedule reconciles with the summary', () => {
    const r = calculateLoan({ amount: 6000, annualInterestRate: 6, termYears: 2 });
    expect(r.schedule.length).toBe(24);
    expect(r.payoffMonths).toBe(24);
    expect(r.yearlySchedule.length).toBe(2);
    expect(r.schedule.reduce((s, x) => s + x.principal, 0)).toBeCloseTo(6000, 2); // Σ principal ≈ amount
    expect(r.schedule.reduce((s, x) => s + x.interest, 0)).toBeCloseTo(r.totalInterest, 6); // Σ interest ≈ totalInterest
    expect(r.schedule[23].balance).toBeCloseTo(0, 6); // final balance ≈ 0
    expect(Math.abs(r.monthlyPayment * r.payoffMonths - r.totalPaid)).toBeLessThan(1); // payment × months ≈ totalPaid
  });

  it('long loan: payment × payoffMonths ≈ totalPaid, Σ principal ≈ amount, Σ interest ≈ totalInterest, final balance 0', () => {
    const r = calculateLoan({ amount: 250000, annualInterestRate: 6.5, termYears: 30 });
    expect(Math.abs(r.monthlyPayment * r.payoffMonths - r.totalPaid)).toBeLessThan(1);
    expect(r.schedule.reduce((s, x) => s + x.principal, 0)).toBeCloseTo(250000, 2);
    expect(r.schedule.reduce((s, x) => s + x.interest, 0)).toBeCloseTo(r.totalInterest, 4);
    expect(r.schedule[r.schedule.length - 1].balance).toBe(0);
  });

  it('yearly schedule reconciles with the monthly schedule and covers the whole payoff period', () => {
    const r = calculateLoan({ amount: 250000, annualInterestRate: 6.5, termYears: 30 });
    const mPrincipal = r.schedule.reduce((s, x) => s + x.principal, 0);
    const mInterest = r.schedule.reduce((s, x) => s + x.interest, 0);
    expect(r.yearlySchedule.reduce((s, x) => s + x.principal, 0)).toBeCloseTo(mPrincipal, 6); // yearly principal total = monthly total
    expect(r.yearlySchedule.reduce((s, x) => s + x.interest, 0)).toBeCloseTo(mInterest, 6); // yearly interest total = monthly total
    expect(r.yearlySchedule.length).toBe(Math.ceil(r.schedule.length / 12)); // covers the full period
    expect(r.yearlySchedule[r.yearlySchedule.length - 1].balance).toBeCloseTo(0, 6);
    r.yearlySchedule.forEach((row, i) => expect(row.period).toBe(i + 1)); // sequential 1..N
  });

  it('partial final year: a 30-month (2.5y) loan yields 3 yearly rows whose totals still reconcile', () => {
    const r = calculateLoan({ amount: 10000, annualInterestRate: 5, termYears: 2.5 });
    expect(r.schedule.length).toBe(30);
    expect(r.yearlySchedule.length).toBe(3); // years 1, 2 and a partial 3rd
    expect(r.yearlySchedule.reduce((s, x) => s + x.principal, 0)).toBeCloseTo(
      r.schedule.reduce((s, x) => s + x.principal, 0),
      6,
    );
  });

  it('decimal amount and rate inputs amortize and reconcile', () => {
    const r = calculateLoan({ amount: 15250.75, annualInterestRate: 4.25, termYears: 3 });
    expect(r.schedule.length).toBe(36);
    expect(Number.isFinite(r.monthlyPayment)).toBe(true);
    expect(r.schedule.reduce((s, x) => s + x.principal, 0)).toBeCloseTo(15250.75, 2);
    expect(r.schedule.reduce((s, x) => s + x.interest, 0)).toBeCloseTo(r.totalInterest, 6);
    expect(r.totalPaid).toBeCloseTo(15250.75 + r.totalInterest, 6);
    expect(r.schedule[35].balance).toBeCloseTo(0, 6);
  });
});

/* ------------------------------------------------------------------ */
/* Extended loan modes                                                 */
/* ------------------------------------------------------------------ */

const usd = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

describe('calculateExtendedLoan — pinned against the published reference figures', () => {
  it('Amortized: $100,000 / 10y / 6% Monthly(APR) / Every Month', () => {
    const r = calculateExtendedLoan({ mode: 'amortized', amount: 100000, annualInterestRate: 6, termYears: 10, termMonths: 0, compoundKey: 'monthly', paybackKey: 'month' });
    expect(usd(r.primary)).toBe('$1,110.21');
    expect(usd(r.totalPaid)).toBe('$133,224.60');
    expect(usd(r.totalInterest)).toBe('$33,224.60');
  });

  it('Deferred: $100,000 / 10y / 6% Annually(APY)', () => {
    const r = calculateExtendedLoan({ mode: 'deferred', amount: 100000, annualInterestRate: 6, termYears: 10, termMonths: 0, compoundKey: 'annually', paybackKey: 'month' });
    expect(usd(r.primary)).toBe('$179,084.77');
    expect(usd(r.totalInterest)).toBe('$79,084.77');
  });

  it('Bond: $100,000 due / 10y / 6% Annually(APY)', () => {
    const r = calculateExtendedLoan({ mode: 'bond', amount: 100000, annualInterestRate: 6, termYears: 10, termMonths: 0, compoundKey: 'annually', paybackKey: 'month' });
    expect(usd(r.primary)).toBe('$55,839.48');
    expect(usd(r.totalInterest)).toBe('$44,160.52');
  });

  it('Deferred ANNUAL schedule matches the screenshot row for row', () => {
    const r = calculateExtendedLoan({ mode: 'deferred', amount: 100000, annualInterestRate: 6, termYears: 10, termMonths: 0, compoundKey: 'annually', paybackKey: 'month' });
    const want = [
      ['$100,000.00', '$6,000.00', '$106,000.00'],
      ['$106,000.00', '$6,360.00', '$112,360.00'],
      ['$112,360.00', '$6,741.60', '$119,101.60'],
      ['$119,101.60', '$7,146.10', '$126,247.70'],
      ['$126,247.70', '$7,574.86', '$133,822.56'],
      ['$133,822.56', '$8,029.35', '$141,851.91'],
      ['$141,851.91', '$8,511.11', '$150,363.03'],
      ['$150,363.03', '$9,021.78', '$159,384.81'],
      ['$159,384.81', '$9,563.09', '$168,947.90'],
      ['$168,947.90', '$10,136.87', '$179,084.77'],
    ];
    expect(r.yearlySchedule).toHaveLength(10);
    r.yearlySchedule.forEach((row, i) => {
      const got = [usd(row.beginning), usd(row.interest), usd(row.ending)];
      expect(got).toEqual(want[i]);
    });
  });

  it('Deferred MONTHLY schedule matches the screenshot row for row', () => {
    const r = calculateExtendedLoan({ mode: 'deferred', amount: 100000, annualInterestRate: 6, termYears: 10, termMonths: 0, compoundKey: 'annually', paybackKey: 'month' });
    const want = [
      ['$100,000.00', '$486.76', '$100,486.76'],
      ['$100,486.76', '$489.12', '$100,975.88'],
      ['$100,975.88', '$491.51', '$101,467.38'],
      ['$101,467.38', '$493.90', '$101,961.28'],
      ['$101,961.28', '$496.30', '$102,457.58'],
      ['$102,457.58', '$498.72', '$102,956.30'],
      ['$102,956.30', '$501.15', '$103,457.45'],
      ['$103,457.45', '$503.58', '$103,961.03'],
      ['$103,961.03', '$506.04', '$104,467.07'],
      ['$104,467.07', '$508.50', '$104,975.57'],
      ['$104,975.57', '$510.97', '$105,486.54'],
      ['$105,486.54', '$513.46', '$106,000.00'],
      ['$106,000.00', '$515.96', '$106,515.96'],
    ];
    want.forEach((w, i) => {
      const row = r.monthlySchedule[i];
      const got = [usd(row.beginning), usd(row.interest), usd(row.ending)];
      expect(got).toEqual(w);
    });
  });
});

describe('the Compound select genuinely changes the answer', () => {
  const at = (compoundKey: string) =>
    calculateExtendedLoan({
      mode: 'deferred', amount: 100000, annualInterestRate: 6,
      termYears: 10, termMonths: 0, compoundKey, paybackKey: 'month',
    }).primary;

  it('normalises a quoted rate to one effective annual rate', () => {
    expect(effectiveAnnualRate(6, 1)).toBeCloseTo(0.06, 12);           // APY is already effective
    expect(effectiveAnnualRate(6, 12)).toBeCloseTo(0.0616778119, 9);   // 6% APR compounded monthly
    expect(effectiveAnnualRate(6, Infinity)).toBeCloseTo(Math.exp(0.06) - 1, 12); // continuous
  });

  it('grows the maturity value as compounding gets more frequent', () => {
    const annual = at('annually');
    const monthly = at('monthly');
    const daily = at('daily');
    const continuous = at('continuously');
    expect(monthly).toBeGreaterThan(annual);
    expect(daily).toBeGreaterThan(monthly);
    expect(continuous).toBeGreaterThan(daily);
  });

  it('inverts itself: periodicRate compounded back gives the effective annual rate', () => {
    for (const perYear of [1, 2, 4, 12, 26, 52, 365]) {
      const ear = effectiveAnnualRate(7.5, 12);
      const i = periodicRate(ear, perYear);
      expect(Math.pow(1 + i, perYear) - 1).toBeCloseTo(ear, 12);
    }
  });
});

describe('the payback frequency drives the amortized schedule', () => {
  const at = (paybackKey: string) =>
    calculateExtendedLoan({
      mode: 'amortized', amount: 100000, annualInterestRate: 6,
      termYears: 10, termMonths: 0, compoundKey: 'monthly', paybackKey,
    });

  it('gives one row per payment period, not per month', () => {
    expect(at('month').paymentCount).toBe(120);
    expect(at('quarter').paymentCount).toBe(40);
    expect(at('halfyear').paymentCount).toBe(20);
    expect(at('year').paymentCount).toBe(10);
  });

  it('costs about the same in total however often you pay', () => {
    // Same effective rate, same term — the totals differ only by payment timing.
    const monthly = at('month').totalPaid;
    for (const key of ['quarter', 'halfyear', 'year']) {
      expect(at(key).totalPaid / monthly).toBeGreaterThan(0.97);
      expect(at(key).totalPaid / monthly).toBeLessThan(1.06);
    }
  });

  it('always repays the balance to zero', () => {
    for (const key of ['month', 'quarter', 'halfyear', 'year']) {
      const r = at(key);
      expect(r.monthlySchedule[r.monthlySchedule.length - 1].ending).toBeCloseTo(0, 6);
    }
  });
});

describe('extra term months are part of the term', () => {
  const base = { mode: 'amortized' as const, amount: 100000, annualInterestRate: 6, compoundKey: 'monthly', paybackKey: 'month' };
  it('10y 6m is 126 payments, between 10y and 11y', () => {
    expect(calculateExtendedLoan({ ...base, termYears: 10, termMonths: 6 }).paymentCount).toBe(126);
    const ten = calculateExtendedLoan({ ...base, termYears: 10, termMonths: 0 }).primary;
    const half = calculateExtendedLoan({ ...base, termYears: 10, termMonths: 6 }).primary;
    const eleven = calculateExtendedLoan({ ...base, termYears: 11, termMonths: 0 }).primary;
    expect(half).toBeLessThan(ten);
    expect(half).toBeGreaterThan(eleven); // a longer term means a smaller payment
  });
});

describe('the guard never lets an unusable result through', () => {
  const base = { mode: 'amortized' as const, amount: 100000, annualInterestRate: 6, termYears: 10, termMonths: 0, compoundKey: 'monthly', paybackKey: 'month' };

  it('marks a zero amount or a zero term invalid rather than returning NaN figures', () => {
    for (const bad of [{ amount: 0 }, { termYears: 0, termMonths: 0 }]) {
      const r = calculateExtendedLoan({ ...base, ...bad });
      expect(r.valid).toBe(false);
      expect(r.monthlySchedule).toEqual([]);
    }
  });

  it('handles a 0% loan as a straight repayment of principal', () => {
    const r = calculateExtendedLoan({ ...base, annualInterestRate: 0 });
    expect(r.valid).toBe(true);
    expect(r.totalInterest).toBeCloseTo(0, 6);
    expect(r.primary).toBeCloseTo(100000 / 120, 6);
  });

  it('a bond and a deferred loan are exact inverses of each other', () => {
    const deferred = calculateExtendedLoan({ ...base, mode: 'deferred', compoundKey: 'annually' });
    const bond = calculateExtendedLoan({ ...base, mode: 'bond', amount: deferred.primary, compoundKey: 'annually' });
    expect(bond.primary).toBeCloseTo(100000, 6); // back to the original principal
  });

  it('every schedule row reconciles: beginning + interest === ending', () => {
    for (const mode of ['amortized', 'deferred', 'bond'] as const) {
      const r = calculateExtendedLoan({ ...base, mode, compoundKey: 'annually' });
      for (const row of r.monthlySchedule) {
        const paid = mode === 'amortized' ? row.beginning + row.interest - row.ending : 0;
        expect(row.beginning + row.interest - paid).toBeCloseTo(row.ending, 6);
      }
    }
  });

  it('the yearly view sums exactly to the monthly view', () => {
    const r = calculateExtendedLoan({ ...base, mode: 'deferred', compoundKey: 'annually' });
    const monthlyInterest = r.monthlySchedule.reduce((s, x) => s + x.interest, 0);
    const yearlyInterest = r.yearlySchedule.reduce((s, x) => s + x.interest, 0);
    expect(yearlyInterest).toBeCloseTo(monthlyInterest, 6);
    expect(r.yearlySchedule[r.yearlySchedule.length - 1].ending).toBeCloseTo(
      r.monthlySchedule[r.monthlySchedule.length - 1].ending, 6,
    );
  });
});
