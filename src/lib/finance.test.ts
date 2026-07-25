import { describe, it, expect } from 'vitest';
import { pmt, buildAmortization, collapseYearly, type AmortRow } from './finance';

/**
 * Dedicated characterization of the shared finance engine (@lib/finance) — R11B1, filling a gap where
 * pmt / buildAmortization / collapseYearly were only covered INDIRECTLY (through loan, auto-loan,
 * payment, credit-card, home-equity, interest-rate). Freezes the EXACT source behaviour so the
 * Amortization migration (and every other consumer) is a visible presentation/validation layer over an
 * unchanged engine. Test-only: no change to pmt, buildAmortization, collapseYearly, the AmortRow
 * contract, the early-payoff threshold, final-payment handling or precision.
 *
 * Frozen facts: buildAmortization SANITIZES its inputs (`principal||0`, `Math.round(months||0)`,
 * `(annualRatePct||0)`) so a non-finite / negative / zero domain collapses to an empty schedule; pmt
 * does NOT sanitize (NaN/Infinity propagate, a negative principal yields a negative payment). Rows are
 * NOT rounded per period; the last row's principal is capped at the remaining balance (final-payment
 * remainder) and the closing balance is `Math.max(0, balance)`; the loop stops once balance <= 0.005.
 */

/* ------------------------------------------------------------------ */
/* pmt                                                                 */
/* ------------------------------------------------------------------ */

describe('finance — pmt', () => {
  it('computes the standard fixed-rate payment for a positive-rate loan', () => {
    expect(pmt(250000, 6.5 / 100 / 12, 360)).toBeCloseTo(1580.17, 2);
    expect(pmt(20000, 6 / 100 / 12, 60)).toBeCloseTo(386.66, 2);
  });

  it('a zero monthly rate is straight-line principal / months', () => {
    expect(pmt(1000, 0, 10)).toBe(100);
    expect(pmt(12000, 0, 12)).toBe(1000);
  });

  it('months <= 0 returns 0 (no schedule to pay)', () => {
    expect(pmt(1000, 0.01, 0)).toBe(0);
    expect(pmt(1000, 0.01, -5)).toBe(0);
  });

  it('a zero principal pays nothing', () => {
    expect(pmt(0, 0.01, 12)).toBe(0);
  });

  it('does NOT clamp: a negative principal yields a negative payment, a negative rate still computes', () => {
    expect(pmt(-1000, 0.01, 12)).toBeCloseTo(-88.85, 2);
    expect(pmt(1000, -0.01, 12)).toBeCloseTo(78.02, 2);
  });

  it('propagates non-finite inputs (the binding, not pmt, rejects these)', () => {
    expect(Number.isNaN(pmt(NaN, 0.01, 12))).toBe(true);
    expect(pmt(Infinity, 0.01, 12)).toBe(Infinity);
  });
});

/* ------------------------------------------------------------------ */
/* buildAmortization                                                   */
/* ------------------------------------------------------------------ */

describe('finance — buildAmortization', () => {
  const b = buildAmortization(250000, 6.5, 360);

  it('produces one row per month with the fixed payment and reconciling totals', () => {
    expect(b.payment).toBeCloseTo(1580.17, 2);
    expect(b.totalInterest).toBeCloseTo(318861.22, 2);
    expect(b.schedule.length).toBe(360);
  });

  it('the first row is mostly interest on the full balance', () => {
    const first = b.schedule[0];
    expect(first.period).toBe(1);
    expect(first.interest).toBeCloseTo(1354.17, 2); // 250000 * 6.5%/12
    expect(first.principal).toBeCloseTo(226.0, 2);
    expect(first.payment).toBeCloseTo(first.principal + first.interest, 6);
    expect(first.balance).toBeCloseTo(249773.997, 2);
  });

  it('every row: payment = principal + interest, balance never negative, balance strictly falls', () => {
    let prev = Infinity;
    for (const r of b.schedule) {
      expect(r.payment).toBeCloseTo(r.principal + r.interest, 6);
      expect(r.balance).toBeGreaterThanOrEqual(0);
      expect(r.balance).toBeLessThan(prev);
      prev = r.balance;
    }
  });

  it('the final row absorbs the remainder and the closing balance reaches zero', () => {
    const last = b.schedule[b.schedule.length - 1];
    expect(last.period).toBe(360);
    expect(last.balance).toBe(0);
    expect(last.interest).toBeCloseTo(8.51, 2);
  });

  it('reconciles: scheduled principal ~ loan amount, scheduled interest = totalInterest', () => {
    const sumP = b.schedule.reduce((s, r) => s + r.principal, 0);
    const sumI = b.schedule.reduce((s, r) => s + r.interest, 0);
    expect(sumP).toBeCloseTo(250000, 2);
    expect(sumI).toBeCloseTo(b.totalInterest, 6);
  });

  it('a zero-rate schedule is principal-only, paying down in equal steps to zero', () => {
    const z = buildAmortization(12000, 0, 12);
    expect(z.payment).toBe(1000);
    expect(z.totalInterest).toBe(0);
    expect(z.schedule.length).toBe(12);
    expect(z.schedule[0]).toMatchObject({ period: 1, payment: 1000, principal: 1000, interest: 0, balance: 11000 });
    expect(z.schedule[11]).toMatchObject({ period: 12, principal: 1000, interest: 0, balance: 0 });
  });

  it('rows are NOT rounded per period (full float precision retained)', () => {
    // The stored interest carries full precision, not a 2 dp value.
    expect(b.schedule[0].interest).toBe(250000 * (6.5 / 100 / 12));
  });

  it('a 30-year monthly loan is the full 360-row schedule (the migration cap reference)', () => {
    expect(b.schedule.length).toBe(360);
    expect(b.schedule[359].balance).toBe(0);
  });

  it('SANITIZES a degenerate domain to an empty schedule (months / principal / non-finite)', () => {
    expect(buildAmortization(1000, 5, 0)).toEqual({ payment: 0, totalInterest: 0, schedule: [] });
    expect(buildAmortization(0, 5, 12).schedule).toEqual([]);
    expect(buildAmortization(-1000, 5, 12).schedule).toEqual([]); // principal clamps to 0
    expect(buildAmortization(NaN, 5, 12).schedule.length).toBe(0); // NaN || 0 -> 0
    expect(buildAmortization(250000, NaN, 12).schedule.length).toBe(12); // NaN rate -> 0% (valid rows)
    expect(buildAmortization(250000, 5, NaN).schedule.length).toBe(0); // NaN months -> 0
  });
});

/* ------------------------------------------------------------------ */
/* collapseYearly                                                      */
/* ------------------------------------------------------------------ */

describe('finance — collapseYearly', () => {
  const monthly = buildAmortization(250000, 6.5, 360).schedule;
  const yearly = collapseYearly(monthly);

  it('collapses 12 months into one year and reconciles the yearly totals to the monthly rows', () => {
    expect(yearly.length).toBe(30);
    expect(yearly[0].period).toBe(1);
    expect(yearly[0].balance).toBeCloseTo(247205.69, 2); // = month 12 balance
    const sumP = yearly.reduce((s, r) => s + r.principal, 0);
    const sumI = yearly.reduce((s, r) => s + r.interest, 0);
    expect(sumP).toBeCloseTo(250000, 2);
    expect(sumI).toBeCloseTo(318861.22, 2);
    expect(yearly[29].balance).toBe(0);
  });

  it('year N balance equals month (12N) balance', () => {
    expect(yearly[0].balance).toBe(monthly[11].balance);
    expect(yearly[1].balance).toBe(monthly[23].balance);
  });

  it('keeps a final PARTIAL year (14 months -> years 1 and 2)', () => {
    const y = collapseYearly(buildAmortization(30000, 5, 14).schedule);
    expect(y.length).toBe(2);
    expect(y[1].period).toBe(2);
    expect(y[1].balance).toBe(0);
  });

  it('an empty schedule collapses to no yearly rows', () => {
    expect(collapseYearly([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* AmortRow contract                                                   */
/* ------------------------------------------------------------------ */

describe('finance — AmortRow contract', () => {
  it('exposes exactly period / payment / principal / interest / balance (no added fields)', () => {
    const row: AmortRow = buildAmortization(10000, 5, 12).schedule[0];
    expect(Object.keys(row).sort()).toEqual(['balance', 'interest', 'payment', 'period', 'principal'].sort());
  });
});
