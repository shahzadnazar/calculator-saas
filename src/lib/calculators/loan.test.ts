import { describe, it, expect } from 'vitest';
import { calculateLoan } from './loan';

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
