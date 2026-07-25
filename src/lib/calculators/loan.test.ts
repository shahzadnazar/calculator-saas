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
