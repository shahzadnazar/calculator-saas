/**
 * Simple interest binding — one formula, solved for whichever variable is missing.
 *
 * Wraps the pure `solveSimpleInterest` (frozen by simple-interest.test.ts against the
 * published reference case) and layers the visitor-facing contract: strict parsing,
 * per-mode validation, the cross-field checks that stop an unanswerable question from
 * reaching the solver, a complete-result guard, and the presentation.
 *
 * FOUR MODES, one formula. Because nothing compounds, every variable is as easy to
 * solve for as any other — so the mode chooses which field disappears and becomes the
 * answer. This is the multi-mode family pattern: one binding, a mode field, and no
 * dedicated runtime.
 *
 * THE STEPS are the point of a simple-interest calculator. The formula is short enough
 * to check by hand, and someone using it usually wants to see it done rather than
 * trusted, so the result writes out the arithmetic the way the reference does.
 *
 * The schedule table and the stacked chart come from `@lib/result/accumulation`,
 * shared with Savings, Interest and Investment; the ring is the same `drawDonut` the
 * borrowing calculators use.
 */
import {
  MAX_TERM_YEARS,
  isTimeUnit,
  solveSimpleInterest,
  type SimpleInterestResult,
  type SimpleSolveFor,
  type TimeUnit,
} from './simple-interest';
import { formatCurrency, formatNumber, formatPercent } from '@lib/format';
import { drawAccumulationChart, fillSchedule, percentLabel, share, type YearStack } from '@lib/result/accumulation';
import { drawDonut } from '@lib/result/loan-schedule';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** Above this a rate is a typo rather than an offer. */
export const MAX_RATE = 1000;

export const SOLVE_MODES: readonly { value: SimpleSolveFor; label: string }[] = [
  { value: 'balance', label: 'Balance' },
  { value: 'principal', label: 'Principal' },
  { value: 'term', label: 'Term' },
  { value: 'rate', label: 'Rate' },
];

/** "per year" in the rate selector; "years" in the term selector. */
export const RATE_UNIT_LABELS: Readonly<Record<TimeUnit, string>> = {
  year: 'per year',
  month: 'per month',
  week: 'per week',
  day: 'per day',
};
export const TERM_UNIT_LABELS: Readonly<Record<TimeUnit, string>> = {
  year: 'years',
  month: 'months',
  week: 'weeks',
  day: 'days',
};

export interface SimpleInterestValues {
  solveFor: SimpleSolveFor;
  principal: string;
  endBalance: string;
  ratePerUnitPct: string;
  rateUnit: TimeUnit;
  term: string;
  termUnit: TimeUnit;
}

export interface SimpleInterestComputed {
  solveFor: SimpleSolveFor;
  rateUnit: TimeUnit;
  termUnit: TimeUnit;
  result: SimpleInterestResult;
}

export const MSG = {
  principalRequired: 'Enter the principal.',
  principalPositive: 'Enter a principal greater than zero.',
  balanceRequired: 'Enter the end balance.',
  balancePositive: 'Enter an end balance greater than zero.',
  rateRequired: 'Enter the interest rate.',
  rateRange: `Enter an interest rate between 0 and ${MAX_RATE}%.`,
  ratePositive: 'Enter an interest rate greater than zero — at 0% no term ever reaches a higher balance.',
  termRequired: 'Enter the term.',
  termNonNegative: 'Enter a term of zero or more.',
  termPositive: 'Enter a term greater than zero — in no time at all, no rate gets anywhere.',
  termMax: `Enter a term of ${MAX_TERM_YEARS} years or less.`,
  balanceBelowPrincipal: 'The end balance must be at least the principal — simple interest only adds to it.',
  termTooLong: `Those figures need a term longer than ${MAX_TERM_YEARS} years.`,
} as const;

const FAIL = Number.NaN;
const MONEY_TOL = 0.01;

/* ------------------------------------------------------------------ */
/* Which fields each mode asks for                                     */
/* ------------------------------------------------------------------ */

/** The mode decides which field is the answer, so the other three are required. */
export const FIELDS_FOR: Readonly<Record<SimpleSolveFor, readonly string[]>> = {
  balance: ['principal', 'ratePerUnitPct', 'term'],
  principal: ['endBalance', 'ratePerUnitPct', 'term'],
  term: ['endBalance', 'principal', 'ratePerUnitPct'],
  rate: ['endBalance', 'principal', 'term'],
};

export const asks = (mode: SimpleSolveFor, field: string): boolean => FIELDS_FOR[mode].includes(field);

/* ------------------------------------------------------------------ */
/* Strict parsing                                                      */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

const parseNumber = (raw: string): NumParse => {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  return Number.isFinite(n) ? n : 'invalid';
};

/* ------------------------------------------------------------------ */
/* Read / validate / compute                                           */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const unit = (root: HTMLElement, name: string, fallback: TimeUnit): TimeUnit => {
  const value = root.querySelector<HTMLSelectElement>(`[name="${name}"]`)?.value;
  return value && isTimeUnit(value) ? value : fallback;
};

export function readSimpleInterestValues(root: HTMLElement): SimpleInterestValues {
  const mode = root.querySelector<HTMLInputElement>('[name="solveFor"]:checked')?.value;
  return {
    solveFor: (SOLVE_MODES.some((m) => m.value === mode) ? mode : 'balance') as SimpleSolveFor,
    principal: field(root, 'principal')?.value ?? '',
    endBalance: field(root, 'endBalance')?.value ?? '',
    ratePerUnitPct: field(root, 'ratePerUnitPct')?.value ?? '',
    rateUnit: unit(root, 'rateUnit', 'year'),
    term: field(root, 'term')?.value ?? '',
    termUnit: unit(root, 'termUnit', 'year'),
  };
}

export function validateSimpleInterest(v: SimpleInterestValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const mode = v.solveFor;

  const principal = parseNumber(v.principal);
  if (asks(mode, 'principal')) {
    if (principal === 'empty') fieldErrors.principal = MSG.principalRequired;
    else if (principal === 'invalid' || principal <= 0) fieldErrors.principal = MSG.principalPositive;
  }

  const balance = parseNumber(v.endBalance);
  if (asks(mode, 'endBalance')) {
    if (balance === 'empty') fieldErrors.endBalance = MSG.balanceRequired;
    else if (balance === 'invalid' || balance <= 0) fieldErrors.endBalance = MSG.balancePositive;
  }

  const rate = parseNumber(v.ratePerUnitPct);
  if (asks(mode, 'ratePerUnitPct')) {
    if (rate === 'empty') fieldErrors.ratePerUnitPct = MSG.rateRequired;
    else if (rate === 'invalid' || rate < 0 || rate > MAX_RATE) fieldErrors.ratePerUnitPct = MSG.rateRange;
    // Solving for a term divides by the rate, so zero has no answer rather than a
    // large one.
    else if (mode === 'term' && rate === 0) fieldErrors.ratePerUnitPct = MSG.ratePositive;
  }

  const term = parseNumber(v.term);
  if (asks(mode, 'term')) {
    if (term === 'empty') fieldErrors.term = MSG.termRequired;
    else if (term === 'invalid' || term < 0) fieldErrors.term = MSG.termNonNegative;
    else if (mode === 'rate' && term === 0) fieldErrors.term = MSG.termPositive;
  }

  // Cross-field: solving backwards from an end balance below the principal would need
  // a negative term or rate, which simple interest cannot produce.
  if (
    (mode === 'term' || mode === 'rate') &&
    typeof principal === 'number' &&
    typeof balance === 'number' &&
    !fieldErrors.principal &&
    !fieldErrors.endBalance &&
    balance < principal
  ) {
    fieldErrors.endBalance = MSG.balanceBelowPrincipal;
  }

  // Everything parses, so the only remaining failure is a term past the ceiling.
  if (!Object.keys(fieldErrors).length) {
    const solved = solveSimpleInterest(toInput(v));
    if (solved.unsolvable) {
      fieldErrors[mode === 'term' ? 'endBalance' : 'term'] =
        mode === 'term' ? MSG.termTooLong : MSG.termMax;
    }
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/** A validated set of values as the solver wants them. An unasked field is ignored. */
function toInput(v: SimpleInterestValues) {
  const num = (raw: string) => (raw.trim() === '' ? 0 : Number(raw));
  return {
    solveFor: v.solveFor,
    principal: num(v.principal),
    endBalance: num(v.endBalance),
    ratePerUnitPct: num(v.ratePerUnitPct),
    rateUnit: v.rateUnit,
    term: num(v.term),
    termUnit: v.termUnit,
  };
}

export function computeSimpleInterest(v: SimpleInterestValues): SimpleInterestComputed {
  return {
    solveFor: v.solveFor,
    rateUnit: v.rateUnit,
    termUnit: v.termUnit,
    result: solveSimpleInterest(toInput(v)),
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (in resultValue — NO isUsableResult)          */
/* ------------------------------------------------------------------ */

/**
 * Returns the end balance ONLY when the whole result reconciles: a solvable answer,
 * finite non-negative figures, interest equal to the gap it claims, the balance equal
 * to the formula recomputed from the normalised rate and term, and a schedule that
 * closes on the balance.
 */
export function completeSimpleInterestValue(c: SimpleInterestComputed): number {
  const r = c.result;
  if (r.unsolvable) return FAIL;
  const { principal, endBalance, interest, annualRatePct, termYears, solved, schedule } = r;
  if (![principal, endBalance, interest, annualRatePct, termYears, solved].every(Number.isFinite)) {
    return FAIL;
  }
  if (principal <= 0 || endBalance < 0 || annualRatePct < 0) return FAIL;
  if (termYears < 0 || termYears > MAX_TERM_YEARS) return FAIL;

  // Interest is the gap, and the gap is what the formula says it should be.
  if (Math.abs(interest - (endBalance - principal)) > MONEY_TOL) return FAIL;
  if (Math.abs(interest - principal * (annualRatePct / 100) * termYears) > MONEY_TOL) return FAIL;
  // Simple interest only ever adds.
  if (interest < -MONEY_TOL) return FAIL;

  if (schedule.length) {
    if (schedule.length !== Math.ceil(termYears - 1e-9)) return FAIL;
    let summed = 0;
    for (const row of schedule) {
      if (![row.interest, row.balance].every(Number.isFinite)) return FAIL;
      if (row.interest < 0) return FAIL;
      summed += row.interest;
    }
    if (Math.abs(summed - interest) > MONEY_TOL) return FAIL;
    if (Math.abs(schedule[schedule.length - 1].balance - endBalance) > MONEY_TOL) return FAIL;
  } else if (termYears > 1e-9) {
    // A real term must produce rows.
    return FAIL;
  }

  return endBalance;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

/** One line of the working: an expression and what it comes to. */
export interface CalculationStep {
  expression: string;
  value: string;
}

export interface SimpleInterestPresentation {
  endBalance: string;
  totalInterest: string;
  principal: string;
  principalShare: string;
  interestShare: string;
  /** The answer for the mode, labelled — e.g. "Term" / "16.67 years". */
  solvedLabel: string;
  solvedValue: string;
  steps: CalculationStep[];
}

/** A rate as it reads in the working: "3%", "0.25%". */
const ratePart = (pct: number) => `${formatNumber(pct, 4)}%`;
/** A bare amount as the reference writes it inside an expression: "$20000". */
const plain = (value: number) => `$${formatNumber(value, 2)}`;

export function unitNoun(value: number, u: TimeUnit): string {
  const one = value === 1;
  return `${u}${one ? '' : 's'}`;
}

export function presentSimpleInterest(c: SimpleInterestComputed): SimpleInterestPresentation {
  const r = c.result;
  const total = r.endBalance;

  // The working, as the reference writes it: the interest from the formula, then the
  // balance from the interest.
  const steps: CalculationStep[] = [
    {
      expression: `Total Interest = ${plain(r.principal)} × ${ratePart(r.annualRatePct)} × ${formatNumber(r.termYears, 4)}`,
      value: formatCurrency(r.interest),
    },
    {
      expression: `End Balance = ${plain(r.principal)} + ${formatCurrency(r.interest)}`,
      value: formatCurrency(r.endBalance),
    },
  ];

  const solvedLabel = { balance: 'End balance', principal: 'Principal', term: 'Term', rate: 'Interest rate' }[
    c.solveFor
  ];
  const solvedValue =
    c.solveFor === 'term'
      ? `${formatNumber(r.solved, 2)} ${unitNoun(r.solved, c.termUnit)}`
      : c.solveFor === 'rate'
        ? `${formatPercent(r.solved, 4)} ${RATE_UNIT_LABELS[c.rateUnit]}`
        : formatCurrency(r.solved);

  return {
    endBalance: formatCurrency(r.endBalance),
    totalInterest: formatCurrency(r.interest),
    principal: formatCurrency(r.principal),
    principalShare: percentLabel(share(r.principal, total)),
    interestShare: percentLabel(share(r.interest, total)),
    solvedLabel,
    solvedValue,
    steps,
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

export function describeSimpleInterest(c: SimpleInterestComputed): string {
  const p = presentSimpleInterest(c);
  return c.solveFor === 'balance'
    ? `End balance: ${spokenUSD(c.result.endBalance)}.`
    : `${p.solvedLabel}: ${p.solvedValue}. End balance ${p.endBalance}.`;
}

/**
 * The columns behind the accumulation graph — principal at the bottom, interest
 * stacked on it, one column per year INCLUDING year zero, which is the principal
 * before any interest has been earned.
 */
export function yearStacks(c: SimpleInterestComputed): YearStack[] {
  const r = c.result;
  const stacks: YearStack[] = [{ year: 0, initial: r.principal, contributions: 0, interest: 0, total: r.principal }];
  for (const row of r.schedule) {
    stacks.push({
      year: row.year,
      initial: r.principal,
      contributions: 0,
      interest: Math.max(0, row.balance - r.principal),
      total: row.balance,
    });
  }
  return stacks;
}

function donutLabel(c: SimpleInterestComputed): string {
  const r = c.result;
  return (
    `Of ${formatCurrency(r.endBalance)} at the end, ${formatCurrency(r.principal)} ` +
    `(${percentLabel(share(r.principal, r.endBalance))}) is principal and ` +
    `${formatCurrency(r.interest)} (${percentLabel(share(r.interest, r.endBalance))}) is interest.`
  );
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

/** One step of the working: the expression, then its value on its own line. */
function stepRow(step: CalculationStep): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'si-step';
  const expression = document.createElement('span');
  expression.className = 'si-step__expression';
  expression.textContent = step.expression;
  const value = document.createElement('span');
  value.className = 'si-step__value';
  value.textContent = `= ${step.value}`;
  wrap.append(expression, value);
  return wrap;
}

export function renderSimpleInterestResult(result: SimpleInterestComputed, context: FormRenderContext): void {
  const p = presentSimpleInterest(result);
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

  setText('[data-result-when~="valid"] [data-result-value]', p.endBalance);
  setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(result.result.endBalance));
  setText('[data-si-balance]', p.endBalance);
  setText('[data-si-interest]', p.totalInterest);

  // In a solve-for mode the answer is not the balance, so it gets its own row.
  const solvedRow = q('[data-si-solved-row]');
  if (solvedRow) solvedRow.hidden = result.solveFor === 'balance';
  setText('[data-si-solved-label]', p.solvedLabel);
  setText('[data-si-solved]', p.solvedValue);

  const steps = q('[data-si-steps]');
  if (steps) steps.replaceChildren(...p.steps.map(stepRow));

  const charted = drawDonut(
    q('[data-si-donut]'),
    [
      { key: 'principal', value: result.result.principal },
      { key: 'interest', value: result.result.interest },
    ],
    { prefix: 'si', label: donutLabel(result) },
  );
  show('[data-si-donut-figure]', charted);
  if (charted) {
    setText('[data-si-share-principal]', p.principalShare);
    setText('[data-si-share-interest]', p.interestShare);
  }

  const stacks = yearStacks(result);
  const graphed =
    stacks.length > 1 &&
    drawAccumulationChart(q('[data-si-chart]'), stacks, {
      prefix: 'si',
      format: formatCurrency,
      label:
        `Balance by year, from ${formatCurrency(result.result.principal)} at the start to ` +
        `${formatCurrency(result.result.endBalance)}, each column split into principal and the ` +
        `interest earned by then.`,
    });
  show('[data-si-chart-figure]', graphed === true);

  const rows = result.result.schedule.map((y) => ({
    period: y.year,
    deposit: 0,
    interest: y.interest,
    balance: y.balance,
  }));
  fillSchedule(q('[data-si-rows]'), rows, { prefix: 'si', format: formatCurrency, showDeposit: false });
  show('[data-si-schedule]', rows.length > 0);
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

/** Clear the figures; the mode and both units go back to their defaults. */
export function resetSimpleInterestValues(root: HTMLElement, _mode: ResetMode): void {
  for (const name of ['principal', 'endBalance', 'ratePerUnitPct', 'term'] as const) {
    const el = field(root, name);
    if (el) el.value = '';
  }
  for (const name of ['rateUnit', 'termUnit'] as const) {
    const el = root.querySelector<HTMLSelectElement>(`[name="${name}"]`);
    if (el) el.value = 'year';
  }
  const balance = root.querySelector<HTMLInputElement>('[name="solveFor"][value="balance"]');
  if (balance) balance.checked = true;
}

export const simpleInterestBinding: FormCalculatorBinding<SimpleInterestValues, SimpleInterestComputed> = {
  readValues: readSimpleInterestValues,
  validate: validateSimpleInterest,
  compute: computeSimpleInterest,
  describeResult: describeSimpleInterest,
  renderResult: renderSimpleInterestResult,
  resetValues: resetSimpleInterestValues,
  resultValue: completeSimpleInterestValue,
  // NO isUsableResult — an unsolvable case is caught in validation and rejected by
  // the guard, so it never needs to render.
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/** The published reference case, pinned to the cent by the tests. */
export const SIMPLE_INTEREST_EXAMPLE_VALUES: SimpleInterestValues = {
  solveFor: 'balance',
  principal: '20000',
  endBalance: '',
  ratePerUnitPct: '3',
  rateUnit: 'year',
  term: '10',
  termUnit: 'year',
};
