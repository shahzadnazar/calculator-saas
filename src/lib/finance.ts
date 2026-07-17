/**
 * Shared finance math used by multiple calculators (loan, auto loan, etc.).
 * Pure and unit-tested. Keeping these primitives in one place avoids
 * re-deriving the amortization formula per calculator.
 */

export interface AmortRow {
  period: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

/** Fixed-rate monthly payment (PMT). Handles the zero-interest case. */
export function pmt(principal: number, monthlyRate: number, months: number): number {
  if (months <= 0) return 0;
  if (monthlyRate === 0) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * factor) / (factor - 1);
}

/** Build a monthly amortization schedule for a fixed-rate loan. */
export function buildAmortization(
  principal: number,
  annualRatePct: number,
  months: number,
): { payment: number; totalInterest: number; schedule: AmortRow[] } {
  const p = Math.max(0, principal || 0);
  const n = Math.max(0, Math.round(months || 0));
  const monthlyRate = (annualRatePct || 0) / 100 / 12;
  const payment = pmt(p, monthlyRate, n);

  const schedule: AmortRow[] = [];
  let balance = p;
  let totalInterest = 0;
  for (let period = 1; period <= n && balance > 0.005; period++) {
    const interest = balance * monthlyRate;
    let principalPaid = payment - interest;
    if (principalPaid > balance) principalPaid = balance;
    balance -= principalPaid;
    totalInterest += interest;
    schedule.push({
      period,
      payment: principalPaid + interest,
      principal: principalPaid,
      interest,
      balance: Math.max(0, balance),
    });
  }
  return { payment, totalInterest, schedule };
}

/** Collapse a monthly schedule into yearly rows for compact display. */
export function collapseYearly(schedule: AmortRow[]): AmortRow[] {
  const yearly: AmortRow[] = [];
  for (let i = 0; i < schedule.length; i += 12) {
    const chunk = schedule.slice(i, i + 12);
    const last = chunk[chunk.length - 1];
    yearly.push({
      period: Math.ceil((i + 1) / 12),
      payment: chunk.reduce((s, r) => s + r.payment, 0),
      principal: chunk.reduce((s, r) => s + r.principal, 0),
      interest: chunk.reduce((s, r) => s + r.interest, 0),
      balance: last.balance,
    });
  }
  return yearly;
}
