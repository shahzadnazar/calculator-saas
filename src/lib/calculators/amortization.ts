/**
 * Loan amortization: the scheduled payment, the schedule it produces, and what
 * optional extra principal does to both.
 *
 * THE MODEL, stated once because every figure depends on it:
 *
 *  • The payment is the ordinary fixed-rate PMT on the FULL term, computed once and
 *    never recomputed. Extra principal shortens the loan; it does not lower the
 *    payment, which is what "extra payment" means to a lender.
 *  • Each month, interest accrues on the opening balance, the scheduled payment
 *    covers it and the remainder reduces principal, and only then is any extra
 *    principal applied. Extra paid this month therefore saves interest from NEXT
 *    month onward — it cannot retroactively reduce interest already accrued.
 *  • The loop stops when the balance is gone, which with extras is before the term
 *    ends. Both the scheduled term and the actual payoff are reported, because the
 *    gap between them is the whole point of paying extra.
 *  • Every total is SUMMED from the schedule rather than derived from the payment, so
 *    a figure shown to a reader can always be traced to rows they can see.
 *
 * `@lib/finance` owns `pmt` and the plain no-extras schedule, and both are reused
 * unchanged. The loop here exists because extra principal changes the shape of the
 * schedule (an early payoff, a clamped final payment) in ways the plain builder
 * deliberately does not model.
 */
import { pmt } from '@lib/finance';

/** An extra principal payment: an amount, and when it starts, in months from the first payment. */
export interface ExtraPrincipal {
  amount: number;
  /** 0-based months from the first payment. 0 means "from the very first payment". */
  offset: number;
}

/** One month of the schedule. `payment` is the scheduled amount; `extra` is on top of it. */
export interface AmortizationRow {
  /** 1-based month. */
  period: number;
  /** Scheduled payment only — always exactly `principal + interest`. */
  payment: number;
  principal: number;
  interest: number;
  /** Extra principal applied this month, on top of `principal`. 0 when none applies. */
  extra: number;
  balance: number;
}

/** One year of the schedule — the same figures summed, closing on the year's balance. */
export interface AmortizationYear extends AmortizationRow {
  /** Months this row actually covers: 12, except possibly the last. */
  monthCount: number;
}

export interface AmortizationInput {
  amount: number;
  annualRatePct: number;
  /** Scheduled term in whole months. */
  months: number;
  /** Paid every month from its offset onwards. */
  extraMonthly?: ExtraPrincipal;
  /** Paid once a year, starting at its offset. */
  extraYearly?: ExtraPrincipal;
  /** Paid once each, at their own offsets. */
  extraOneTime?: readonly ExtraPrincipal[];
}

/** What the same loan costs without any extra principal. */
export interface PlainOutcome {
  totalInterest: number;
  payoffMonths: number;
  totalOfPayments: number;
}

export interface AmortizationResult {
  loanAmount: number;
  /** The scheduled monthly payment. Unchanged by extra principal. */
  monthlyPayment: number;
  totalInterest: number;
  /** Extra principal paid over the life of the loan. 0 when none is set. */
  totalExtra: number;
  /** Everything paid out: scheduled payments plus extras. */
  totalOfPayments: number;
  /** Months actually taken to clear the balance. */
  payoffMonths: number;
  /** The term that was entered, for comparison with `payoffMonths`. */
  scheduledMonths: number;
  schedule: AmortizationRow[];
  annual: AmortizationYear[];
  /** The identical loan WITHOUT the extras. null when none are set. */
  withoutExtras: PlainOutcome | null;
  /** What the extras save. Both 0 when no extras are set. */
  interestSaved: number;
  monthsSaved: number;
}

/** The longest schedule this calculator will build — 30 years of monthly rows. */
export const MAX_TERM_MONTHS = 360;

/** A balance below a cent is cleared; a float residue is not a month of debt. */
const CENT = 0.005;

/** Whole months, clamped to the ceiling. Fractions are truncated, never rounded up. */
function termMonths(months: number): number {
  const m = Math.trunc(months || 0);
  if (!Number.isFinite(m) || m < 1) return 0;
  return Math.min(m, MAX_TERM_MONTHS);
}

const isLive = (e: ExtraPrincipal | undefined): e is ExtraPrincipal =>
  !!e && Number.isFinite(e.amount) && e.amount > 0 && Number.isFinite(e.offset) && e.offset >= 0;

/**
 * Run the schedule, applying extra principal after each scheduled payment.
 *
 * Returns nothing but the raw run; the caller decides what to report. Splitting it
 * out is what lets the same code produce both the visitor's schedule and the
 * without-extras comparison, so the two can never drift apart.
 */
function run(
  amount: number,
  monthlyRate: number,
  payment: number,
  months: number,
  extras: { monthly?: ExtraPrincipal; yearly?: ExtraPrincipal; oneTime: readonly ExtraPrincipal[] },
): { schedule: AmortizationRow[]; totalInterest: number; totalExtra: number; totalOfPayments: number } {
  const schedule: AmortizationRow[] = [];
  let balance = amount;
  let totalInterest = 0;
  let totalExtra = 0;
  let totalOfPayments = 0;

  for (let period = 1; period <= months && balance > CENT; period++) {
    const interest = balance * monthlyRate;
    // The last scheduled payment is usually short: never take more principal than is
    // owed, or the balance goes negative and the final row reads as an overpayment.
    let principal = Math.min(payment - interest, balance);
    if (principal < 0) principal = 0;
    balance -= principal;

    let extra = 0;
    const elapsed = period - 1;
    if (isLive(extras.monthly) && elapsed >= extras.monthly.offset) extra += extras.monthly.amount;
    if (
      isLive(extras.yearly) &&
      elapsed >= extras.yearly.offset &&
      (elapsed - extras.yearly.offset) % 12 === 0
    ) {
      extra += extras.yearly.amount;
    }
    for (const one of extras.oneTime) {
      if (isLive(one) && elapsed === one.offset) extra += one.amount;
    }
    // Extra principal never overshoots the debt — you cannot prepay past zero.
    if (extra > balance) extra = balance;
    balance -= extra;

    totalInterest += interest;
    totalExtra += extra;
    totalOfPayments += principal + interest + extra;

    schedule.push({
      period,
      payment: principal + interest,
      principal,
      interest,
      extra,
      balance: Math.max(0, balance),
    });
  }

  return { schedule, totalInterest, totalExtra, totalOfPayments };
}

/** Collapse a monthly schedule into yearly rows, closing each on that year's balance. */
export function toAnnual(schedule: readonly AmortizationRow[]): AmortizationYear[] {
  const out: AmortizationYear[] = [];
  for (let i = 0; i < schedule.length; i += 12) {
    const chunk = schedule.slice(i, i + 12);
    const last = chunk[chunk.length - 1];
    out.push({
      period: i / 12 + 1,
      monthCount: chunk.length,
      payment: chunk.reduce((s, r) => s + r.payment, 0),
      principal: chunk.reduce((s, r) => s + r.principal, 0),
      interest: chunk.reduce((s, r) => s + r.interest, 0),
      extra: chunk.reduce((s, r) => s + r.extra, 0),
      balance: last.balance,
    });
  }
  return out;
}

export function calculateAmortization(input: AmortizationInput): AmortizationResult {
  const months = termMonths(input.months);
  const amount = Math.max(0, input.amount || 0);
  const monthlyRate = (input.annualRatePct || 0) / 100 / 12;
  const payment = pmt(amount, monthlyRate, months);

  const oneTime = input.extraOneTime ?? [];
  const hasExtras =
    isLive(input.extraMonthly) || isLive(input.extraYearly) || oneTime.some(isLive);

  const main = run(amount, monthlyRate, payment, months, {
    monthly: input.extraMonthly,
    yearly: input.extraYearly,
    oneTime,
  });

  // The same loan without the extras, run through the same code so the comparison
  // cannot drift from the schedule it is compared against.
  const plain = hasExtras
    ? run(amount, monthlyRate, payment, months, { oneTime: [] })
    : null;

  const payoffMonths = main.schedule.length;

  return {
    loanAmount: amount,
    monthlyPayment: payment,
    totalInterest: main.totalInterest,
    totalExtra: main.totalExtra,
    totalOfPayments: main.totalOfPayments,
    payoffMonths,
    scheduledMonths: months,
    schedule: main.schedule,
    annual: toAnnual(main.schedule),
    withoutExtras: plain
      ? {
          totalInterest: plain.totalInterest,
          payoffMonths: plain.schedule.length,
          totalOfPayments: plain.totalOfPayments,
        }
      : null,
    interestSaved: plain ? plain.totalInterest - main.totalInterest : 0,
    monthsSaved: plain ? plain.schedule.length - payoffMonths : 0,
  };
}
