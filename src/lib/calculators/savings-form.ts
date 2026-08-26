/**
 * Savings form binding (R8D1 — standard-form wave, calculator #16; product family
 * MULTI-MODE, on the standard-form runtime UNCHANGED — no `isUsableResult`).
 *
 * Two modes — Project savings (start + monthly deposit + rate + years → projected balance
 * + total deposited + interest) and Reach a goal (goal + start + rate + years → required
 * monthly deposit) — swap ONE conditional field by mode (the Payment/Credit-Card precedent),
 * sharing the starting balance, annual return and years.
 *
 * The pure `projectSavings` / `requiredMonthlyForGoal` (which delegate to the shared
 * `calculateCompoundInterest`) are UNCHANGED and frozen by savings.test.ts. Everything here
 * is at the VALIDATION / PRESENTATION boundary. Product decisions (R8D1):
 *   • The calculator is SUMMARY-ONLY — the formula's yearly `series` is NOT rendered.
 *   • "Goal already reached" is a VALID numeric result (required deposit = 0), presented
 *     with a clarifying interpretation. Savings has NO impossible/non-finite outcome, so
 *     the runtime's default finite gate suffices and `isUsableResult` is NOT implemented.
 *   • Zero is a real projection input (a $0 start and/or $0 deposit are valid); years must
 *     be a WHOLE number ≥ 1 (never silently rounded). Inputs are parsed strictly.
 */
import { projectSavings, requiredMonthlyForGoal } from './savings';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export type SavingsMode = 'project' | 'goal';

export interface SavingsValues {
  mode: SavingsMode;
  startingAmount: string;
  annualRatePct: string;
  years: string;
  monthlyContribution: string;
  goal: string;
}

/** Structured result. Two shapes: a projection (enriched breakdown) and a required
 *  deposit (single value, with a goal-already-reached flag). No non-finite outcome. */
export type SavingsComputed =
  | {
      status: 'projected';
      mode: 'project';
      futureValue: number;
      totalContributions: number;
      totalInterest: number;
    }
  | { status: 'required-deposit'; mode: 'goal'; monthlyDeposit: number; goalAlreadyReached: boolean };

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** Finite and >= 0: starting balance, monthly deposit, annual return. 0 is valid. */
function parseNonNegative(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** Finite and strictly greater than zero: a savings goal. */
function parsePositive(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

/** Finite WHOLE number of years, at least 1. A fractional entry is rejected, not rounded. */
function parseWholeAtLeastOne(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 'invalid';
  return n;
}

/**
 * Validate savings values. Starting balance (>= 0), annual return (>= 0) and years (whole,
 * >= 1) are always required. Only the ACTIVE mode's field is additionally required — the
 * inactive field (hidden + disabled by the island) is excluded.
 */
export function validateSavingsValues(values: SavingsValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const start = parseNonNegative(values.startingAmount);
  if (start === 'empty') fieldErrors.startingAmount = 'Enter a starting balance.';
  else if (start === 'invalid') fieldErrors.startingAmount = 'Enter a starting balance of zero or more.';

  const rate = parseNonNegative(values.annualRatePct);
  if (rate === 'empty') fieldErrors.annualRatePct = 'Enter an annual return.';
  else if (rate === 'invalid') fieldErrors.annualRatePct = 'Enter an annual return of zero or more.';

  const years = parseWholeAtLeastOne(values.years);
  if (years === 'empty') fieldErrors.years = 'Enter a number of years.';
  else if (years === 'invalid') fieldErrors.years = 'Enter a whole number of years (1 or more).';

  if (values.mode === 'project') {
    const monthly = parseNonNegative(values.monthlyContribution);
    if (monthly === 'empty') fieldErrors.monthlyContribution = 'Enter a monthly deposit.';
    else if (monthly === 'invalid') fieldErrors.monthlyContribution = 'Enter a monthly deposit of zero or more.';
  } else {
    const goal = parsePositive(values.goal);
    if (goal === 'empty') fieldErrors.goal = 'Enter a savings goal.';
    else if (goal === 'invalid') fieldErrors.goal = 'Enter a savings goal greater than zero.';
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export function computeSavings(values: SavingsValues): SavingsComputed {
  const startingAmount = Number(values.startingAmount);
  const annualRatePct = Number(values.annualRatePct);
  const years = Number(values.years);

  if (values.mode === 'project') {
    const r = projectSavings({
      startingAmount,
      monthlyContribution: Number(values.monthlyContribution),
      annualRatePct,
      years,
    });
    return {
      status: 'projected',
      mode: 'project',
      futureValue: r.futureValue,
      totalContributions: r.totalContributions,
      totalInterest: r.totalInterest,
    };
  }

  const monthlyDeposit = requiredMonthlyForGoal({ goal: Number(values.goal), startingAmount, annualRatePct, years });
  // Post-validation (goal > 0, years >= 1), a deposit of exactly 0 means the grown starting
  // balance already reaches the goal — a valid informational outcome, not an error.
  return { status: 'required-deposit', mode: 'goal', monthlyDeposit, goalAlreadyReached: monthlyDeposit === 0 };
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** A USD amount in spoken form, e.g. "45320 dollars", "325 dollars and 50 cents". */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

const ALREADY_REACHED =
  'Your starting balance is projected to reach this goal within the selected period, so no monthly deposit is required.';
const ALL_ZERO_PROJECT = 'With no starting balance or monthly deposits, the projected balance remains $0.';

/** Concise announcement — the dominant mode-owned result only. */
export function describeSavingsResult(result: SavingsComputed): string {
  if (result.status === 'projected') {
    return `Your projected savings balance is ${spokenUSD(result.futureValue)}.`;
  }
  if (result.goalAlreadyReached) {
    return 'No monthly deposit is required because your starting balance is projected to reach the goal within the selected period.';
  }
  return `You need to deposit ${spokenUSD(result.monthlyDeposit)} per month to reach your goal.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const readMode = (root: HTMLElement): SavingsMode =>
  root.querySelector<HTMLInputElement>('[name="mode"]:checked')?.value === 'goal' ? 'goal' : 'project';

export const savingsBinding: FormCalculatorBinding<SavingsValues, SavingsComputed> = {
  readValues(root) {
    return {
      mode: readMode(root),
      startingAmount: input(root, 'startingAmount')?.value ?? '',
      annualRatePct: input(root, 'annualRatePct')?.value ?? '',
      years: input(root, 'years')?.value ?? '',
      monthlyContribution: input(root, 'monthlyContribution')?.value ?? '',
      goal: input(root, 'goal')?.value ?? '',
    };
  },

  validate: validateSavingsValues,

  compute: computeSavings,

  /** Guarded magnitude — the projected balance or the required deposit. Both are always
   *  finite (including a valid 0 for an all-zero projection or an already-reached goal), so
   *  the runtime's default finite gate accepts them; no `isUsableResult` is needed. */
  resultValue(result) {
    return result.status === 'projected' ? result.futureValue : result.monthlyDeposit;
  },

  // No isUsableResult — Savings has no non-finite outcome (R8D1 decision A).

  describeResult: describeSavingsResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const setLabel = (text: string) => {
      const el = q('[data-result-when~="valid"] [data-result-summary-label]');
      if (el) el.textContent = text;
    };
    const setValue = (shown: string, spoken: string) => {
      const v = q('[data-result-when~="valid"] [data-result-value]');
      if (v) v.textContent = shown;
      const a = q('[data-result-when~="valid"] [data-result-value-a11y]');
      if (a) a.textContent = spoken;
    };
    const show = (sel: string, visible: boolean) => {
      const el = q(sel);
      if (el) el.hidden = !visible;
    };
    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };

    if (result.status === 'projected') {
      setLabel('Projected savings balance');
      setValue(formatCurrency(result.futureValue), spokenUSD(result.futureValue));
      show('[data-sv-breakdown]', true);
      setText('[data-sv-contrib]', formatCurrencyRounded(result.totalContributions));
      setText('[data-sv-interest]', formatCurrencyRounded(result.totalInterest));
      const allZero = result.futureValue === 0;
      show('[data-sv-interpretation]', allZero);
      if (allZero) setText('[data-sv-interpretation]', ALL_ZERO_PROJECT);
    } else {
      setLabel('Required monthly deposit');
      setValue(formatCurrency(result.monthlyDeposit), spokenUSD(result.monthlyDeposit));
      show('[data-sv-breakdown]', false); // goal mode is single-value only
      show('[data-sv-interpretation]', result.goalAlreadyReached);
      if (result.goalAlreadyReached) setText('[data-sv-interpretation]', ALREADY_REACHED);
    }
  },

  resetValues(root, _mode: ResetMode) {
    // The island restores Project mode + its field/labels; the binding clears every value.
    for (const name of ['startingAmount', 'annualRatePct', 'years', 'monthlyContribution', 'goal']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * Example inputs for the labelled worked result shown on first load.
 *
 * These are OURS, not the visitor's. The shared runtime computes them and calls
 * this binding's own `renderResult`, so the example reuses the calculator's real
 * result markup and can never drift from the engine. The visitor's fields are
 * never written to — they load and stay empty behind it.
 */
export const SAVINGS_EXAMPLE_VALUES: SavingsValues = { mode: 'project', startingAmount: '5000', annualRatePct: '4', years: '10', monthlyContribution: '250', goal: '50000' };
