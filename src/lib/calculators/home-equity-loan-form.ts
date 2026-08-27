/**
 * Home equity loan binding — what a home-equity loan costs.
 *
 * A home equity loan is a fixed-rate amortizing second mortgage, so it runs on the
 * shared `calculateAmortization` rather than on a formula of its own: three fields
 * (amount, rate, term) produce the payment, the total of every payment, the interest
 * inside it, the ring splitting that total, the schedule and the amortization graph.
 * There is NO home-equity-specific payment maths to own.
 *
 * CLOSING COSTS are the one thing that makes this different from a plain loan, and
 * they are an OPTIONAL disclosure: an unchecked box, and behind it an amount (in
 * dollars or as a percentage of the loan) and whether it is deducted from the loan or
 * paid at closing. They do not touch the payment — you borrowed what you borrowed, and
 * you repay it on the same schedule. What they change is what the loan really COSTS,
 * which is why including them adds the net cash you walk away with and the REAL APR:
 * the rate that equates that net cash with the payments you make. Both treatments
 * leave the borrower net the same amount, so the APR is the same either way; the
 * difference is whether you need the cash at closing. Saying so plainly is more honest
 * than inventing a distinction between them.
 *
 * The borrowing-power question — how much a lender's loan-to-value cap leaves room for
 * — is a SEPARATE calculator with its own binding (home-equity-borrowing-form.ts),
 * because it answers a different question from different facts. This binding no longer
 * knows anything about home values or mortgage balances.
 *
 * The complete-result guard lives in `resultValue` as a NaN sentinel feeding the
 * runtime's DEFAULT finite gate; there is NO `isUsableResult`.
 */
import { calculateAmortization, type AmortizationResult } from './amortization';
import { solveAnnualRate } from './interest-rate';
import { formatCurrency, formatCurrencyRounded, formatPercent } from '@lib/format';
import {
  drawDonut,
  drawLoanLineChart,
  fillLoanSchedule,
  percentLabel,
  share,
} from '@lib/result/loan-schedule';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** Term ceiling in whole years, shared with the rest of the loan family. */
export const MAX_TERM_YEARS = 30;
/** Closing costs above this share of the loan are a typo, not a fee. */
export const MAX_CLOSING_PCT = 20;

export type ClosingUnit = 'usd' | 'pct';
export type ClosingTreatment = 'deducted' | 'upfront';

export interface HomeEquityFormValues {
  loanAmount: string;
  annualRatePct: string;
  termYears: string;
  includeClosingCosts: boolean;
  closingAmount: string;
  closingUnit: ClosingUnit;
  closingTreatment: ClosingTreatment;
}

/** What the closing costs do to the deal, when the visitor has asked about them. */
export interface ClosingCostOutcome {
  /** The costs in dollars, whichever unit they were entered in. */
  costs: number;
  treatment: ClosingTreatment;
  /** Cash in your hand once the costs are settled. */
  netProceeds: number;
  /** Cash you must bring on the day. Zero when the costs come out of the loan. */
  cashAtClosing: number;
  /** The rate that equates the net cash with the payments — NaN if unsolvable. */
  realAprPct: number;
}

export interface HomeEquityComputed {
  loanAmount: number;
  annualRatePct: number;
  termYears: number;
  months: number;
  plan: AmortizationResult;
  /** null when the closing-costs disclosure is closed. */
  closing: ClosingCostOutcome | null;
}

export const MSG = {
  loanRequired: 'Enter the loan amount.',
  loanPositive: 'Enter a loan amount greater than zero.',
  rateRequired: 'Enter an interest rate.',
  rateNonNeg: 'Enter an interest rate of zero or more.',
  rateMax: 'Enter an interest rate of 100% or less.',
  term: `Enter a whole loan term from 1 to ${MAX_TERM_YEARS} years.`,
  closingRequired: 'Enter the closing costs, or clear the checkbox.',
  closingNonNeg: 'Enter closing costs of zero or more.',
  closingPctMax: `Enter closing costs of ${MAX_CLOSING_PCT}% of the loan or less.`,
  closingTooBig: 'Closing costs cannot be more than the loan amount.',
} as const;

const MAX_RATE = 100;
const FAIL = Number.NaN;
const MONEY_TOL = 0.01;
const TOL = 1e-6;

/* ------------------------------------------------------------------ */
/* Strict parsing                                                      */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

const parsePositive = (raw: string): NumParse => {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : 'invalid';
};
const parseNonNegative = (raw: string): NumParse => {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
};
const parseWholeTerm = (raw: string): NumParse => {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  return Number.isFinite(n) && Number.isInteger(n) && n >= 1 && n <= MAX_TERM_YEARS ? n : 'invalid';
};

/** Closing costs in dollars, from whichever unit they were entered in. */
export function closingCostsInDollars(amount: number, unit: ClosingUnit, loanAmount: number): number {
  return unit === 'pct' ? (loanAmount * amount) / 100 : amount;
}

/* ------------------------------------------------------------------ */
/* Read / validate / compute                                           */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export function readHomeEquityValues(root: HTMLElement): HomeEquityFormValues {
  const checked = root.querySelector<HTMLInputElement>('[name="includeClosingCosts"]')?.checked ?? false;
  const treatment = root.querySelector<HTMLInputElement>('[name="closingTreatment"]:checked')?.value;
  const unit = root.querySelector<HTMLSelectElement>('[name="closingUnit"]')?.value;
  return {
    loanAmount: control(root, 'loanAmount')?.value ?? '',
    annualRatePct: control(root, 'annualRatePct')?.value ?? '',
    termYears: control(root, 'termYears')?.value ?? '',
    includeClosingCosts: checked,
    closingAmount: control(root, 'closingAmount')?.value ?? '',
    closingUnit: unit === 'pct' ? 'pct' : 'usd',
    closingTreatment: treatment === 'upfront' ? 'upfront' : 'deducted',
  };
}

export function validateHomeEquity(v: HomeEquityFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const loan = parsePositive(v.loanAmount);
  if (loan === 'empty') fieldErrors.loanAmount = MSG.loanRequired;
  else if (loan === 'invalid') fieldErrors.loanAmount = MSG.loanPositive;

  const rate = parseNonNegative(v.annualRatePct);
  if (rate === 'empty') fieldErrors.annualRatePct = MSG.rateRequired;
  else if (rate === 'invalid') fieldErrors.annualRatePct = MSG.rateNonNeg;
  else if (rate > MAX_RATE) fieldErrors.annualRatePct = MSG.rateMax;

  const term = parseWholeTerm(v.termYears);
  if (term === 'empty' || term === 'invalid') fieldErrors.termYears = MSG.term;

  // Closing costs are validated ONLY while the disclosure is open — a stale value
  // behind a cleared checkbox must never block a result.
  if (v.includeClosingCosts) {
    const amount = parseNonNegative(v.closingAmount);
    if (amount === 'empty') fieldErrors.closingAmount = MSG.closingRequired;
    else if (amount === 'invalid') fieldErrors.closingAmount = MSG.closingNonNeg;
    else if (v.closingUnit === 'pct' && amount > MAX_CLOSING_PCT) {
      fieldErrors.closingAmount = MSG.closingPctMax;
    } else if (typeof loan === 'number') {
      // Costs deducted from the loan cannot exceed it, or there are no proceeds at
      // all — and a real APR could not be solved from them.
      const dollars = closingCostsInDollars(amount, v.closingUnit, loan);
      if (dollars >= loan) fieldErrors.closingAmount = MSG.closingTooBig;
    }
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function computeHomeEquity(v: HomeEquityFormValues): HomeEquityComputed {
  const loanAmount = Number(v.loanAmount);
  const annualRatePct = Number(v.annualRatePct);
  const termYears = Number(v.termYears);
  const months = Math.round(termYears * 12);
  const plan = calculateAmortization({ amount: loanAmount, annualRatePct, months });

  let closing: ClosingCostOutcome | null = null;
  if (v.includeClosingCosts) {
    const costs = closingCostsInDollars(Number(v.closingAmount), v.closingUnit, loanAmount);
    // Whether the fee is financed or paid in cash, the borrower is net the same
    // amount against the same payments — so the real APR is solved from that net
    // either way. Only the cash needed on the day differs.
    const netProceeds = loanAmount - costs;
    closing = {
      costs,
      treatment: v.closingTreatment,
      netProceeds,
      cashAtClosing: v.closingTreatment === 'upfront' ? costs : 0,
      realAprPct: solveAnnualRate(netProceeds, plan.monthlyPayment, months),
    };
  }

  return { loanAmount, annualRatePct, termYears, months, plan, closing };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (in resultValue — NO isUsableResult)          */
/* ------------------------------------------------------------------ */

/**
 * Returns the finite monthly payment ONLY when the whole result reconciles: positive
 * finite inputs, a whole term inside the ceiling, a schedule of exactly that many
 * months that clears the loan, totals equal to the sums of their parts, and — when
 * closing costs are open — costs inside the loan with a solvable APR at or above the
 * note rate. A borrower can never be charged less than the note rate by paying a fee.
 */
export function completeHomeEquityValue(c: HomeEquityComputed): number {
  const { loanAmount, annualRatePct, termYears, months, plan, closing } = c;
  if (!Number.isFinite(loanAmount) || loanAmount <= 0) return FAIL;
  if (!Number.isFinite(annualRatePct) || annualRatePct < 0 || annualRatePct > MAX_RATE) return FAIL;
  if (!Number.isInteger(termYears) || termYears < 1 || termYears > MAX_TERM_YEARS) return FAIL;
  if (months !== termYears * 12) return FAIL;

  const { monthlyPayment, totalInterest, totalOfPayments, schedule } = plan;
  if (![monthlyPayment, totalInterest, totalOfPayments].every(Number.isFinite)) return FAIL;
  if (monthlyPayment <= 0 || totalInterest < -TOL) return FAIL;
  if (Math.abs(plan.loanAmount - loanAmount) > MONEY_TOL) return FAIL;
  if (schedule.length !== months) return FAIL;
  if (Math.abs(schedule[schedule.length - 1].balance) > 1) return FAIL;
  if (Math.abs(totalOfPayments - (loanAmount + totalInterest)) > MONEY_TOL) return FAIL;

  let sumInterest = 0;
  for (const row of schedule) {
    if (![row.payment, row.principal, row.interest, row.balance].every(Number.isFinite)) return FAIL;
    if (row.interest < 0 || row.balance < 0) return FAIL;
    sumInterest += row.interest;
  }
  if (Math.abs(sumInterest - totalInterest) > Math.max(1, Math.abs(totalInterest) * 1e-6)) return FAIL;

  if (closing) {
    const { costs, netProceeds, cashAtClosing, realAprPct } = closing;
    if (!Number.isFinite(costs) || costs < 0 || costs >= loanAmount) return FAIL;
    if (Math.abs(netProceeds - (loanAmount - costs)) > MONEY_TOL) return FAIL;
    if (!Number.isFinite(cashAtClosing) || cashAtClosing < 0) return FAIL;
    // Paying a fee can only ever raise the effective rate.
    if (!Number.isFinite(realAprPct) || realAprPct + TOL < annualRatePct) return FAIL;
  }

  return monthlyPayment;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface ClosingPresentation {
  costs: string;
  netProceeds: string;
  cashAtClosing: string;
  /** '' when the costs come out of the loan and nothing is due on the day. */
  realApr: string;
  note: string;
}

export interface HomeEquityPresentation {
  payment: string;
  paymentsLabel: string;
  totalOfPayments: string;
  totalInterest: string;
  principalShare: string;
  interestShare: string;
  interpretation: string;
  closing: ClosingPresentation | null;
}

const paymentsPhrase = (months: number) => `${months} loan payment${months === 1 ? '' : 's'}`;

export function presentHomeEquity(c: HomeEquityComputed): HomeEquityPresentation {
  const { plan, months } = c;
  const payment = formatCurrency(plan.monthlyPayment);

  let closing: ClosingPresentation | null = null;
  if (c.closing) {
    const k = c.closing;
    const apr = formatPercent(k.realAprPct, 2);
    closing = {
      costs: formatCurrency(k.costs),
      netProceeds: formatCurrency(k.netProceeds),
      cashAtClosing: formatCurrency(k.cashAtClosing),
      realApr: apr,
      note:
        k.treatment === 'deducted'
          ? `The ${formatCurrency(k.costs)} comes out of the loan, so you receive ${formatCurrency(k.netProceeds)} and owe the full ${formatCurrencyRounded(c.loanAmount)}. Repaying ${formatCurrencyRounded(c.loanAmount)} for ${formatCurrency(k.netProceeds)} of cash is what makes the real rate ${apr} rather than ${formatPercent(c.annualRatePct, 3)}.`
          : `You bring ${formatCurrency(k.costs)} on the day and receive the full ${formatCurrencyRounded(c.loanAmount)}. You are out the same money either way, so the real rate is the same ${apr} — what changes is whether you need the cash at closing.`,
    };
  }

  return {
    payment,
    paymentsLabel: `Total of ${paymentsPhrase(months)}`,
    totalOfPayments: formatCurrency(plan.totalOfPayments),
    totalInterest: formatCurrency(plan.totalInterest),
    principalShare: percentLabel(share(c.loanAmount, plan.totalOfPayments)),
    interestShare: percentLabel(share(plan.totalInterest, plan.totalOfPayments)),
    interpretation: `Borrowing ${formatCurrencyRounded(c.loanAmount)} at ${formatPercent(c.annualRatePct, 3)} over ${c.termYears} year${c.termYears === 1 ? '' : 's'} costs ${payment} a month and ${formatCurrency(plan.totalInterest)} in interest.`,
    closing,
  };
}

/** A USD amount in spoken form, for the announcement. */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

export function describeHomeEquity(c: HomeEquityComputed): string {
  const base = `Monthly payment: ${spokenUSD(c.plan.monthlyPayment)}.`;
  return c.closing && Number.isFinite(c.closing.realAprPct)
    ? `${base} Real APR with closing costs: ${Number(c.closing.realAprPct.toFixed(2))} percent.`
    : base;
}

function donutLabel(c: HomeEquityComputed): string {
  const total = c.plan.totalOfPayments;
  return (
    `Of ${formatCurrency(total)} repaid in total, ${formatCurrency(c.loanAmount)} ` +
    `(${percentLabel(share(c.loanAmount, total))}) is the loan amount and ` +
    `${formatCurrency(c.plan.totalInterest)} (${percentLabel(share(c.plan.totalInterest, total))}) is interest.`
  );
}

/** The three cumulative series the amortization graph plots. */
function chartSeries(plan: AmortizationResult) {
  let cumInterest = 0;
  let cumPaid = 0;
  const balance: number[] = [];
  const interest: number[] = [];
  const paid: number[] = [];
  for (const row of plan.schedule) {
    cumInterest += row.interest;
    cumPaid += row.payment;
    balance.push(row.balance);
    interest.push(cumInterest);
    paid.push(cumPaid);
  }
  return { balance, interest, paid, cumInterest, cumPaid };
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

export function renderHomeEquityResult(result: HomeEquityComputed, context: FormRenderContext): void {
  const p = presentHomeEquity(result);
  const scope = context.result;
  const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
  const setText = (sel: string, value: string) => {
    const el = q(sel);
    if (el) el.textContent = value;
  };
  const show = (sel: string, visible: boolean) => {
    const el = q(sel);
    if (el) el.hidden = !visible;
  };

  setText('[data-result-when~="valid"] [data-result-value]', p.payment);
  setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(result.plan.monthlyPayment));

  setText('[data-he-payments-label]', p.paymentsLabel);
  setText('[data-he-total]', p.totalOfPayments);
  setText('[data-he-interest]', p.totalInterest);
  setText('[data-he-interpretation]', p.interpretation);

  // Closing costs only appear when the visitor opened that disclosure.
  show('[data-he-closing]', p.closing !== null);
  if (p.closing) {
    setText('[data-he-closing-costs]', p.closing.costs);
    setText('[data-he-closing-net]', p.closing.netProceeds);
    setText('[data-he-closing-apr]', p.closing.realApr);
    setText('[data-he-closing-note]', p.closing.note);
    const upfront = result.closing?.treatment === 'upfront';
    show('[data-he-closing-cash-row]', upfront);
    if (upfront) setText('[data-he-closing-cash]', p.closing.cashAtClosing);
  }

  const charted = drawDonut(
    q('[data-he-donut]'),
    [
      { key: 'principal', value: result.loanAmount },
      { key: 'interest', value: result.plan.totalInterest },
    ],
    { prefix: 'he', label: donutLabel(result) },
  );
  show('[data-he-donut-figure]', charted);
  if (charted) {
    setText('[data-he-share-principal]', p.principalShare);
    setText('[data-he-share-interest]', p.interestShare);
    setText('[data-he-share-principal-amt]', formatCurrencyRounded(result.loanAmount));
    setText('[data-he-share-interest-amt]', formatCurrencyRounded(result.plan.totalInterest));
  }

  const s = chartSeries(result.plan);
  const graphed = drawLoanLineChart(
    q('[data-he-chart]'),
    [
      { key: 'balance', values: s.balance },
      { key: 'interest', values: s.interest },
      { key: 'paid', values: s.paid },
    ],
    {
      prefix: 'he',
      xStart: 'Year 0',
      xEnd: `Year ${result.termYears}`,
      label:
        `Balance falls from ${formatCurrency(result.loanAmount)} to zero over ${result.termYears} years, ` +
        `while total paid rises to ${formatCurrency(s.cumPaid)}, of which ` +
        `${formatCurrency(s.cumInterest)} is interest.`,
    },
  );
  show('[data-he-chart-figure]', graphed);

  // The schedule, in both views. Annual rows carry the year as their period.
  fillLoanSchedule(
    q('[data-he-rows-yearly]'),
    result.plan.annual.map((row, i) => ({
      period: i + 1,
      interest: row.interest,
      principal: row.principal,
      extra: 0,
      balance: row.balance,
    })),
    { prefix: 'he', format: formatCurrency },
  );
  fillLoanSchedule(
    q('[data-he-rows-monthly]'),
    result.plan.schedule.map((row) => ({
      period: row.period,
      interest: row.interest,
      principal: row.principal,
      extra: 0,
      balance: row.balance,
    })),
    { prefix: 'he', format: formatCurrency },
    true,
  );
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

const CLEARED = ['loanAmount', 'annualRatePct', 'termYears', 'closingAmount'] as const;

/** Clear the personal figures and close the closing-costs disclosure again. */
export function resetHomeEquityValues(root: HTMLElement, _mode: ResetMode): void {
  for (const name of CLEARED) {
    const el = control(root, name);
    if (el) el.value = '';
  }
  const box = root.querySelector<HTMLInputElement>('[name="includeClosingCosts"]');
  if (box) box.checked = false;
  const unit = root.querySelector<HTMLSelectElement>('[name="closingUnit"]');
  if (unit) unit.value = 'usd';
  const deducted = root.querySelector<HTMLInputElement>('[name="closingTreatment"][value="deducted"]');
  if (deducted) deducted.checked = true;
}

export const homeEquityBinding: FormCalculatorBinding<HomeEquityFormValues, HomeEquityComputed> = {
  readValues: readHomeEquityValues,
  validate: validateHomeEquity,
  compute: computeHomeEquity,
  describeResult: describeHomeEquity,
  renderResult: renderHomeEquityResult,
  resetValues: resetHomeEquityValues,
  resultValue: completeHomeEquityValue,
  // NO isUsableResult — the complete-result guard lives in resultValue.
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/** The published reference case, pinned to the cent by the tests. */
export const HOME_EQUITY_EXAMPLE_VALUES: HomeEquityFormValues = {
  loanAmount: '150000',
  annualRatePct: '8',
  termYears: '15',
  includeClosingCosts: false,
  closingAmount: '',
  closingUnit: 'usd',
  closingTreatment: 'deducted',
};
