import { describe, it, expect } from 'vitest';
import { MAX_PLAN_MONTHS, planAvalanchePayoff, type PayoffCard } from './credit-cards-payoff';

/**
 * The avalanche planner, frozen against the published reference case.
 *
 * The reference is the whole specification here: three cards, one $500 budget, and a
 * schedule whose every step-up is printed to the cent. Reproducing that schedule is a
 * far stronger check than any invariant, because it pins the parts a formula cannot —
 * the ordering, the same-month cascade, and where each card's payment changes.
 */

const REF: PayoffCard[] = [
  { name: 'Card 1', balance: 4600, minPayment: 100, aprPct: 18.99 },
  { name: 'Card 2', balance: 3900, minPayment: 90, aprPct: 19.99 },
  { name: 'Card 3', balance: 6000, minPayment: 120, aprPct: 15.99 },
];
const money = (n: number) => Math.round(n * 100) / 100;
const paid = (p: ReturnType<typeof planAvalanchePayoff>) => {
  if (p.status !== 'paid') throw new Error('expected a payoff plan');
  return p;
};

describe('the reference case: $500 a month against three cards', () => {
  const plan = paid(planAvalanchePayoff(500, REF));

  it('clears every card in 38 months', () => {
    expect(plan.months).toBe(38);
  });

  it('reports what the whole plan costs', () => {
    expect(money(plan.totalPaid)).toBe(18971.2);
    expect(money(plan.totalInterest)).toBe(4471.2);
    expect(money(plan.totalPrincipal)).toBe(14500);
  });

  it('principal + interest is EXACTLY the total paid', () => {
    // Full precision is what buys this; rounding each month would not.
    expect(plan.totalPrincipal + plan.totalInterest).toBeCloseTo(plan.totalPaid, 9);
  });

  it('attacks the highest rate first, keeping each card findable by its entry number', () => {
    expect(plan.cards.map((c) => c.entryNumber)).toEqual([2, 1, 3]);
    expect(plan.cards.map((c) => c.aprPct)).toEqual([19.99, 18.99, 15.99]);
    expect(plan.cards.map((c) => c.name)).toEqual(['Card 2', 'Card 1', 'Card 3']);
  });

  it('reproduces each card’s payoff length and cost', () => {
    expect(plan.cards.map((c) => c.months)).toEqual([16, 28, 38]);
    expect(plan.cards.map((c) => money(c.paid))).toEqual([4474.33, 6141.21, 8355.66]);
    expect(plan.cards.map((c) => money(c.interest))).toEqual([574.33, 1541.21, 2355.66]);
  });

  it('reproduces the published payment schedule to the cent', () => {
    const runs = plan.cards.map((c) => c.runs.map((r) => [money(r.amount), r.throughMonth]));
    // Card 2 (highest rate) takes the surplus from the start and clears in month 16.
    expect(runs[0]).toEqual([
      [280, 15],
      [274.33, 16],
    ]);
    // Card 1 steps up TWICE: $5.67 freed inside month 16, then the whole of Card 2's
    // $280 from month 17. The mid-month hand-off is the cascade working.
    expect(runs[1]).toEqual([
      [100, 15],
      [105.67, 16],
      [380, 27],
      [355.54, 28],
    ]);
    expect(runs[2]).toEqual([
      [120, 27],
      [144.46, 28],
      [500, 37],
      [471.2, 38],
    ]);
  });

  it('never pays out more than the budget in any month', () => {
    const perMonth = new Array(plan.months).fill(0);
    for (const c of plan.cards) {
      let m = 0;
      for (const run of c.runs) {
        while (m < run.throughMonth) perMonth[m++] += run.amount;
      }
    }
    for (const total of perMonth) expect(total).toBeLessThanOrEqual(500 + 1e-9);
  });

  it('the final month is the only one that may fall short of the budget', () => {
    const lastRun = plan.cards[2].runs[plan.cards[2].runs.length - 1];
    expect(lastRun.throughMonth).toBe(38);
    expect(money(lastRun.amount)).toBe(471.2);
  });
});

describe('each card’s own arithmetic', () => {
  const plan = paid(planAvalanchePayoff(500, REF));

  it('every card is paid its balance plus exactly the interest it accrued', () => {
    for (const c of plan.cards) {
      expect(c.paid).toBeCloseTo(c.balance + c.interest, 6);
    }
  });

  it('every card gets at least its minimum until the month it clears', () => {
    for (const c of plan.cards) {
      const min = REF[c.entryNumber - 1].minPayment;
      const payments: number[] = [];
      let m = 0;
      for (const run of c.runs) while (m < run.throughMonth) (payments[m++] = run.amount);
      // Every month but the last, which is whatever clears the card.
      for (const p of payments.slice(0, -1)) expect(p).toBeGreaterThanOrEqual(min - 1e-9);
      expect(payments).toHaveLength(c.months);
    }
  });
});

describe('the shape of the plan', () => {
  it('a single card is just a plan with one row', () => {
    const plan = paid(planAvalanchePayoff(280, [REF[1]]));
    expect(plan.cards).toHaveLength(1);
    expect(plan.cards[0].months).toBe(16);
    expect(money(plan.totalPaid)).toBe(4474.33);
  });

  it('a bigger budget clears the same debt sooner and cheaper', () => {
    const slow = paid(planAvalanchePayoff(500, REF));
    const fast = paid(planAvalanchePayoff(800, REF));
    expect(fast.months).toBeLessThan(slow.months);
    expect(fast.totalInterest).toBeLessThan(slow.totalInterest);
    expect(money(fast.totalPrincipal)).toBe(money(slow.totalPrincipal));
  });

  it('a zero-rate card costs no interest and divides cleanly', () => {
    const plan = paid(planAvalanchePayoff(100, [{ name: 'Free', balance: 1000, minPayment: 100, aprPct: 0 }]));
    expect(plan.months).toBe(10);
    expect(plan.totalInterest).toBeCloseTo(0, 9);
    expect(plan.cards[0].runs).toEqual([{ amount: 100, throughMonth: 10 }]);
  });

  it('a tie on rate keeps the visitor’s own order', () => {
    const plan = paid(
      planAvalanchePayoff(300, [
        { name: 'Second', balance: 1000, minPayment: 50, aprPct: 20 },
        { name: 'First', balance: 1000, minPayment: 50, aprPct: 20 },
      ]),
    );
    expect(plan.cards.map((c) => c.entryNumber)).toEqual([1, 2]);
  });

  it('a card small enough to clear in month one shows a single run', () => {
    const plan = paid(planAvalanchePayoff(500, [{ name: 'Nearly clear', balance: 50, minPayment: 25, aprPct: 20 }]));
    expect(plan.months).toBe(1);
    expect(plan.cards[0].runs).toHaveLength(1);
    expect(plan.cards[0].runs[0].throughMonth).toBe(1);
  });

  it('the minimum is never overpaid on a card that needs less to clear', () => {
    // A $10 balance with a $100 minimum is paid $10-and-change, not $100.
    const plan = paid(planAvalanchePayoff(200, [{ name: 'Tiny', balance: 10, minPayment: 100, aprPct: 24 }]));
    expect(money(plan.totalPaid)).toBe(10.2);
  });
});

describe('when the budget cannot do the job', () => {
  it('rejects a budget below the minimum payments, saying what they total', () => {
    const plan = planAvalanchePayoff(200, REF);
    expect(plan.status).toBe('never');
    if (plan.status !== 'never') throw new Error('unreachable');
    expect(plan.totalMinimum).toBe(310);
    expect(plan.monthlyBudget).toBe(200);
  });

  it('rejects a budget that never gets ahead of the interest', () => {
    // Minimums are covered, but they are below what the cards charge each month.
    const stuck: PayoffCard[] = [{ name: 'Runaway', balance: 20000, minPayment: 100, aprPct: 29.99 }];
    const plan = planAvalanchePayoff(100, stuck);
    expect(plan.status).toBe('never');
    if (plan.status !== 'never') throw new Error('unreachable');
    expect(plan.firstMonthInterest).toBeCloseTo((20000 * 0.2999) / 12, 6);
    expect(plan.firstMonthInterest).toBeGreaterThan(plan.monthlyBudget);
  });

  it('a budget barely ahead of the interest is a real plan, however grim', () => {
    // $10,000 at 29.99% charges $249.92 in the first month, so $251 clears only $1.08
    // of principal — but each month the interest falls and the plan accelerates. This
    // is a genuine 221-month answer, not a `never`, and reporting it as one would be
    // the most useful thing this calculator ever tells someone.
    const plan = paid(planAvalanchePayoff(251, [{ name: 'Crawl', balance: 10000, minPayment: 250, aprPct: 29.99 }]));
    expect(plan.months).toBe(221);
    expect(plan.totalInterest).toBeGreaterThan(plan.totalPrincipal * 3);
  });

  it('a plan just inside the cap is still a plan', () => {
    const plan = planAvalanchePayoff(100, [{ name: 'Long', balance: 10000, minPayment: 100, aprPct: 0 }]);
    expect(plan.status).toBe('paid');
    if (plan.status !== 'paid') throw new Error('unreachable');
    expect(plan.months).toBe(100);
    expect(plan.months).toBeLessThanOrEqual(MAX_PLAN_MONTHS);
  });

  it('no cards is nothing to plan', () => {
    expect(planAvalanchePayoff(500, []).status).toBe('never');
  });

  it('a non-finite input never produces a plan', () => {
    expect(planAvalanchePayoff(Number.NaN, REF).status).toBe('never');
    expect(planAvalanchePayoff(500, [{ ...REF[0], balance: Number.POSITIVE_INFINITY }]).status).toBe('never');
  });
});
