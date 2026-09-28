import { describe, it, expect } from 'vitest';
import {
  MAX_TERM_MONTHS,
  calculateAmortization,
  toAnnual,
  type AmortizationInput,
} from './amortization';

/**
 * Loan amortization engine.
 *
 * The reference case below is the published worked example the calculator was built
 * to reproduce, pinned to the cent: the payment, both totals, and every yearly row.
 * The extras tests then pin the thing extras are for — an earlier payoff and less
 * interest — and the invariants that keep a schedule honest: rows that sum to their
 * totals, a balance that reaches exactly zero, and prepayment that never overshoots.
 */

const BASE: AmortizationInput = { amount: 200000, annualRatePct: 6, months: 180 };
const cents = (n: number) => Math.round(n * 100) / 100;

describe('calculateAmortization — the reference case, to the cent', () => {
  const r = calculateAmortization(BASE);

  it('reports the payment and both totals', () => {
    expect(cents(r.monthlyPayment)).toBe(1687.71);
    expect(cents(r.totalOfPayments)).toBe(303788.46);
    expect(cents(r.totalInterest)).toBe(103788.46);
    expect(r.payoffMonths).toBe(180);
    expect(r.scheduledMonths).toBe(180);
  });

  it('reconciles: principal + interest === total of payments', () => {
    expect(r.loanAmount + r.totalInterest).toBeCloseTo(r.totalOfPayments, 6);
  });

  it('reproduces the published yearly rows', () => {
    // year, interest, principal, ending balance
    const expected: readonly [number, number, number, number][] = [
      [1, 11769.23, 8483.33, 191516.67],
      [2, 11246.0, 9006.57, 182510.1],
      [3, 10690.49, 9562.07, 172948.02],
      [4, 10100.72, 10151.84, 162796.18],
      [5, 9474.58, 10777.98, 152018.2],
      [6, 8809.82, 11442.75, 140575.45],
      [7, 8104.05, 12148.51, 128426.94],
      [8, 7354.76, 12897.8, 115529.13],
      [9, 6559.25, 13693.31, 101835.82],
    ];
    expect(r.annual).toHaveLength(15);
    for (const [year, interest, principal, balance] of expected) {
      const row = r.annual[year - 1];
      expect(row.period).toBe(year);
      expect(row.monthCount).toBe(12);
      expect(cents(row.interest)).toBe(interest);
      expect(cents(row.principal)).toBe(principal);
      expect(cents(row.balance)).toBe(balance);
    }
  });

  it('clears the balance exactly, and never below zero', () => {
    expect(r.schedule).toHaveLength(180);
    expect(r.schedule[179].balance).toBeCloseTo(0, 6);
    for (const row of r.schedule) expect(row.balance).toBeGreaterThanOrEqual(0);
  });

  it('sums every total from the schedule it shows', () => {
    expect(r.schedule.reduce((s, x) => s + x.interest, 0)).toBeCloseTo(r.totalInterest, 6);
    expect(r.schedule.reduce((s, x) => s + x.principal, 0)).toBeCloseTo(r.loanAmount, 6);
    expect(r.schedule.reduce((s, x) => s + x.payment + x.extra, 0)).toBeCloseTo(r.totalOfPayments, 6);
  });

  it('has no extras, so nothing is saved and there is nothing to compare against', () => {
    expect(r.totalExtra).toBe(0);
    expect(r.withoutExtras).toBeNull();
    expect(r.interestSaved).toBe(0);
    expect(r.monthsSaved).toBe(0);
    for (const row of r.schedule) expect(row.extra).toBe(0);
  });

  it('keeps every row a scheduled payment of principal plus interest', () => {
    for (const row of r.schedule) {
      expect(row.payment).toBeCloseTo(row.principal + row.interest, 8);
    }
  });
});

describe('extra monthly principal', () => {
  const r = calculateAmortization({ ...BASE, extraMonthly: { amount: 200, offset: 0 } });

  it('pays the loan off early and saves interest', () => {
    expect(r.payoffMonths).toBeLessThan(180);
    expect(r.totalInterest).toBeLessThan(103788.46);
    expect(r.monthsSaved).toBe(180 - r.payoffMonths);
    expect(r.interestSaved).toBeCloseTo((r.withoutExtras as { totalInterest: number }).totalInterest - r.totalInterest, 6);
    expect(r.interestSaved).toBeGreaterThan(0);
  });

  it('leaves the scheduled payment alone — extra shortens the loan, it does not shrink the bill', () => {
    expect(cents(r.monthlyPayment)).toBe(1687.71);
  });

  it('reports the without-extras loan as the untouched reference case', () => {
    const plain = r.withoutExtras as { totalInterest: number; payoffMonths: number };
    expect(plain.payoffMonths).toBe(180);
    expect(cents(plain.totalInterest)).toBe(103788.46);
  });

  it('still reconciles, with the extras counted as principal', () => {
    expect(r.schedule.reduce((s, x) => s + x.principal + x.extra, 0)).toBeCloseTo(r.loanAmount, 6);
    expect(r.loanAmount + r.totalInterest).toBeCloseTo(r.totalOfPayments, 6);
  });

  it('starts only from its offset', () => {
    const later = calculateAmortization({ ...BASE, extraMonthly: { amount: 200, offset: 24 } });
    expect(later.schedule[0].extra).toBe(0);
    expect(later.schedule[23].extra).toBe(0);
    expect(later.schedule[24].extra).toBe(200);
    // Starting later saves less than starting immediately.
    expect(later.interestSaved).toBeLessThan(r.interestSaved);
  });

  it('a bigger extra saves more and finishes sooner', () => {
    const bigger = calculateAmortization({ ...BASE, extraMonthly: { amount: 500, offset: 0 } });
    expect(bigger.interestSaved).toBeGreaterThan(r.interestSaved);
    expect(bigger.payoffMonths).toBeLessThan(r.payoffMonths);
  });
});

describe('extra yearly principal', () => {
  const r = calculateAmortization({ ...BASE, extraYearly: { amount: 3000, offset: 0 } });

  it('applies once every twelve months from its offset', () => {
    const paid = r.schedule.filter((x) => x.extra > 0).map((x) => x.period);
    expect(paid[0]).toBe(1);
    expect(paid[1]).toBe(13);
    expect(paid[2]).toBe(25);
    for (const p of paid.slice(0, -1)) expect(r.schedule[p - 1].extra).toBe(3000);
  });

  it('respects an offset that is not the first month', () => {
    const later = calculateAmortization({ ...BASE, extraYearly: { amount: 3000, offset: 5 } });
    const paid = later.schedule.filter((x) => x.extra > 0).map((x) => x.period);
    expect(paid[0]).toBe(6);
    expect(paid[1]).toBe(18);
  });

  it('shortens the loan', () => {
    expect(r.payoffMonths).toBeLessThan(180);
    expect(r.interestSaved).toBeGreaterThan(0);
  });
});

describe('one-time extra principal', () => {
  it('applies exactly once, in its own month', () => {
    const r = calculateAmortization({ ...BASE, extraOneTime: [{ amount: 10000, offset: 11 }] });
    expect(r.schedule.filter((x) => x.extra > 0)).toHaveLength(1);
    expect(r.schedule[11].extra).toBe(10000);
    expect(r.totalExtra).toBe(10000);
  });

  it('accepts several, and adds two that land in the same month', () => {
    const r = calculateAmortization({
      ...BASE,
      extraOneTime: [
        { amount: 5000, offset: 6 },
        { amount: 2500, offset: 6 },
        { amount: 1000, offset: 40 },
      ],
    });
    expect(r.schedule[6].extra).toBe(7500);
    expect(r.schedule[40].extra).toBe(1000);
    expect(r.totalExtra).toBe(8500);
  });

  it('ignores a blank or zero row', () => {
    const r = calculateAmortization({
      ...BASE,
      extraOneTime: [
        { amount: 0, offset: 3 },
        { amount: Number.NaN, offset: 4 },
      ],
    });
    expect(r.totalExtra).toBe(0);
    expect(r.withoutExtras).toBeNull();
  });
});

describe('extras combine, and never overshoot the debt', () => {
  it('adds all three kinds in the months they share', () => {
    const r = calculateAmortization({
      ...BASE,
      extraMonthly: { amount: 100, offset: 0 },
      extraYearly: { amount: 1200, offset: 0 },
      extraOneTime: [{ amount: 5000, offset: 0 }],
    });
    expect(r.schedule[0].extra).toBe(100 + 1200 + 5000);
    expect(r.schedule[1].extra).toBe(100);
  });

  it('an extra bigger than the balance is clamped, not overpaid', () => {
    const r = calculateAmortization({ ...BASE, extraOneTime: [{ amount: 500000, offset: 0 }] });
    expect(r.payoffMonths).toBe(1);
    expect(r.schedule[0].balance).toBe(0);
    // Only what was actually owed came out.
    expect(r.totalExtra).toBeLessThan(500000);
    expect(r.loanAmount + r.totalInterest).toBeCloseTo(r.totalOfPayments, 6);
  });

  it('an enormous monthly extra clears the loan without a negative balance', () => {
    const r = calculateAmortization({ ...BASE, extraMonthly: { amount: 999999, offset: 0 } });
    expect(r.payoffMonths).toBe(1);
    for (const row of r.schedule) expect(row.balance).toBeGreaterThanOrEqual(0);
  });

  it('an extra dated beyond the payoff never applies', () => {
    const r = calculateAmortization({ ...BASE, extraOneTime: [{ amount: 5000, offset: 500 }] });
    expect(r.totalExtra).toBe(0);
    expect(r.payoffMonths).toBe(180);
  });

  it('a negative extra is ignored rather than treated as a withdrawal', () => {
    const r = calculateAmortization({ ...BASE, extraMonthly: { amount: -500, offset: 0 } });
    expect(r.totalExtra).toBe(0);
    expect(r.withoutExtras).toBeNull();
    expect(cents(r.totalInterest)).toBe(103788.46);
  });
});

describe('the yearly view', () => {
  it('closes a short final year as its own row', () => {
    const r = calculateAmortization({ ...BASE, months: 30 });
    expect(r.annual).toHaveLength(3);
    expect(r.annual[2].monthCount).toBe(6);
    expect(r.annual[2].balance).toBeCloseTo(0, 6);
  });

  it('sums each yearly row from its own months', () => {
    const r = calculateAmortization({ ...BASE, extraMonthly: { amount: 250, offset: 3 } });
    let seen = 0;
    for (const y of r.annual) {
      const own = r.schedule.slice(seen, seen + y.monthCount);
      seen += y.monthCount;
      expect(own.reduce((s, x) => s + x.interest, 0)).toBeCloseTo(y.interest, 6);
      expect(own.reduce((s, x) => s + x.principal, 0)).toBeCloseTo(y.principal, 6);
      expect(own.reduce((s, x) => s + x.extra, 0)).toBeCloseTo(y.extra, 6);
      expect(own[own.length - 1].balance).toBeCloseTo(y.balance, 6);
    }
    expect(seen).toBe(r.schedule.length);
  });

  it('is empty for an empty schedule', () => {
    expect(toAnnual([])).toHaveLength(0);
  });
});

describe('rates, terms and edges', () => {
  it('a zero rate repays principal only, in equal instalments', () => {
    const r = calculateAmortization({ amount: 12000, annualRatePct: 0, months: 12 });
    expect(cents(r.monthlyPayment)).toBe(1000);
    expect(r.totalInterest).toBeCloseTo(0, 8);
    expect(cents(r.totalOfPayments)).toBe(12000);
    expect(r.schedule[11].balance).toBeCloseTo(0, 8);
  });

  it('a one-month term is a single payment of the whole debt plus its interest', () => {
    const r = calculateAmortization({ amount: 1000, annualRatePct: 12, months: 1 });
    expect(r.schedule).toHaveLength(1);
    expect(cents(r.schedule[0].interest)).toBe(10);
    expect(cents(r.monthlyPayment)).toBe(1010);
    expect(r.schedule[0].balance).toBeCloseTo(0, 8);
  });

  it('a term in odd months is honoured exactly', () => {
    expect(calculateAmortization({ ...BASE, months: 66 }).schedule).toHaveLength(66);
    expect(calculateAmortization({ ...BASE, months: 66 }).annual).toHaveLength(6);
  });

  it('produces nothing for a term below one month', () => {
    for (const months of [0, -12, 0.5]) {
      const r = calculateAmortization({ ...BASE, months });
      expect(r.schedule).toHaveLength(0);
      expect(r.annual).toHaveLength(0);
      expect(r.monthlyPayment).toBe(0);
      expect(r.totalInterest).toBe(0);
    }
  });

  it('caps the schedule at 30 years', () => {
    const r = calculateAmortization({ ...BASE, months: 999 });
    expect(r.scheduledMonths).toBe(MAX_TERM_MONTHS);
    expect(r.schedule.length).toBeLessThanOrEqual(MAX_TERM_MONTHS);
  });

  it('a zero loan has nothing to schedule', () => {
    const r = calculateAmortization({ ...BASE, amount: 0 });
    expect(r.monthlyPayment).toBe(0);
    expect(r.schedule).toHaveLength(0);
    expect(r.totalOfPayments).toBe(0);
  });

  it('keeps every figure finite at the extremes', () => {
    for (const input of [
      { amount: 1_000_000, annualRatePct: 25, months: 360 },
      { amount: 1, annualRatePct: 0.01, months: 360 },
      { amount: 500000, annualRatePct: 0, months: 360 },
    ]) {
      const r = calculateAmortization(input);
      for (const v of [r.monthlyPayment, r.totalInterest, r.totalOfPayments]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
