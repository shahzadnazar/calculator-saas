/**
 * Multi-card payoff planning by the DEBT AVALANCHE method — pure, and unit-tested.
 *
 * The task is not "how long will this one card take". It is: I have a fixed amount I
 * can put toward cards each month, I have several cards, which order clears them for
 * the least money? The avalanche answer is to pay every card its minimum and throw
 * every spare dollar at the HIGHEST interest rate first, because that is the debt
 * charging the most for each month it survives.
 *
 * The month runs in one order: interest posts on the balance carried in, every live
 * card takes its minimum (or whatever is left to clear it, if that is less), and the
 * surplus then cascades down the cards by rate. The cascade is what produces the
 * reference's characteristic schedule — a card that needs only part of its usual
 * payment in its final month frees the remainder to the next card THAT SAME MONTH,
 * so payments step up mid-plan rather than only when a card disappears.
 *
 * Money is carried at FULL PRECISION and rounded only for display. Rounding each
 * month to the cent accumulates a visible drift across a multi-year plan, and it
 * breaks the identity that makes the result trustworthy: principal + interest is
 * exactly the total paid.
 */

/** A card as the visitor described it. `name` may be blank — the presenter names it. */
export interface PayoffCard {
  name: string;
  balance: number;
  minPayment: number;
  aprPct: number;
}

/** "pay $280.00 until month #15" — one amount held for a stretch of months. */
export interface PaymentRun {
  amount: number;
  /** The LAST month paid at this amount, inclusive. */
  throughMonth: number;
}

export interface CardPayoffPlan {
  /** 1-based position in the ENTERED order, so a visitor can find their own row again. */
  entryNumber: number;
  name: string;
  aprPct: number;
  balance: number;
  /** The month this card reaches zero. */
  months: number;
  interest: number;
  paid: number;
  /** In payment order; the last run is always the single final payment. */
  runs: PaymentRun[];
}

export type PayoffPlan =
  | {
      status: 'paid';
      monthlyBudget: number;
      /** When the LAST card clears. */
      months: number;
      totalPaid: number;
      totalInterest: number;
      totalPrincipal: number;
      /** Highest rate first — the order the money actually goes out in. */
      cards: CardPayoffPlan[];
    }
  | {
      status: 'never';
      monthlyBudget: number;
      /** What the minimums alone demand each month. */
      totalMinimum: number;
      /** What the cards charge in the first month — the bar a budget has to clear. */
      firstMonthInterest: number;
    };

/**
 * Fifty years. Long past any real payoff plan, so reaching it means the budget is
 * losing to the interest rather than that the plan is merely slow.
 */
export const MAX_PLAN_MONTHS = 600;

/** Below a tenth of a cent a balance is settled, not outstanding. */
const SETTLED = 0.0005;

const cents = (n: number) => Math.round(n * 100);

interface Live {
  card: PayoffCard;
  entryNumber: number;
  balance: number;
  interest: number;
  paid: number;
  months: number;
  /** One entry per month paid, compressed into runs at the end. */
  payments: number[];
}

/** Consecutive months at the same displayed amount are one run. */
function toRuns(payments: readonly number[]): PaymentRun[] {
  const runs: PaymentRun[] = [];
  payments.forEach((amount, i) => {
    const last = runs[runs.length - 1];
    if (last && cents(last.amount) === cents(amount)) last.throughMonth = i + 1;
    else runs.push({ amount, throughMonth: i + 1 });
  });
  return runs;
}

/**
 * Plan the payoff of every card from one monthly budget.
 *
 * Total: any input produces a plan or an explicit `never`. A budget that cannot even
 * cover the minimums, or that never gets ahead of the interest, returns `never` with
 * the two figures that explain why, rather than a misleading number of months.
 */
export function planAvalanchePayoff(monthlyBudget: number, cards: readonly PayoffCard[]): PayoffPlan {
  const totalMinimum = cards.reduce((s, c) => s + c.minPayment, 0);
  const firstMonthInterest = cards.reduce((s, c) => s + (c.balance * c.aprPct) / 100 / 12, 0);
  const giveUp: PayoffPlan = {
    status: 'never',
    monthlyBudget,
    totalMinimum,
    firstMonthInterest,
  };

  if (!cards.length) return giveUp;
  if (![monthlyBudget, totalMinimum, firstMonthInterest].every(Number.isFinite)) return giveUp;
  if (monthlyBudget + SETTLED < totalMinimum) return giveUp;

  // Highest rate first — the avalanche. A tie keeps the visitor's own order, so the
  // plan stays stable and explicable rather than reshuffling on an invisible rule.
  const live: Live[] = cards
    .map((card, i) => ({
      card,
      entryNumber: i + 1,
      balance: card.balance,
      interest: 0,
      paid: 0,
      months: 0,
      payments: [] as number[],
    }))
    .sort((a, b) => b.card.aprPct - a.card.aprPct || a.entryNumber - b.entryNumber);

  let month = 0;
  while (live.some((c) => c.balance > SETTLED)) {
    month++;
    if (month > MAX_PLAN_MONTHS) return giveUp;

    for (const c of live) {
      if (c.balance <= SETTLED) continue;
      const posted = (c.balance * c.card.aprPct) / 100 / 12;
      c.interest += posted;
      c.balance += posted;
    }

    // Every live card takes its minimum first — that is the promise the plan makes to
    // the cards it is NOT attacking this month.
    let remaining = monthlyBudget;
    const due = new Map<Live, number>();
    for (const c of live) {
      if (c.balance <= SETTLED) continue;
      const pay = Math.min(c.card.minPayment, c.balance);
      due.set(c, pay);
      remaining -= pay;
    }

    // Then the surplus cascades by rate. A card that needs less than the surplus takes
    // only what clears it and passes the rest down the same month.
    for (const c of live) {
      if (remaining <= SETTLED) break;
      if (c.balance <= SETTLED) continue;
      const room = c.balance - (due.get(c) ?? 0);
      if (room <= SETTLED) continue;
      const extra = Math.min(room, remaining);
      due.set(c, (due.get(c) ?? 0) + extra);
      remaining -= extra;
    }

    for (const [c, pay] of due) {
      c.balance -= pay;
      c.paid += pay;
      c.payments.push(pay);
      if (c.balance <= SETTLED) {
        c.balance = 0;
        c.months = month;
      }
    }
  }

  const plans: CardPayoffPlan[] = live.map((c) => ({
    entryNumber: c.entryNumber,
    name: c.card.name,
    aprPct: c.card.aprPct,
    balance: c.card.balance,
    months: c.months,
    interest: c.interest,
    paid: c.paid,
    runs: toRuns(c.payments),
  }));

  return {
    status: 'paid',
    monthlyBudget,
    months: month,
    totalPaid: plans.reduce((s, c) => s + c.paid, 0),
    totalInterest: plans.reduce((s, c) => s + c.interest, 0),
    totalPrincipal: plans.reduce((s, c) => s + c.balance, 0),
    cards: plans,
  };
}
