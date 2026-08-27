/**
 * Borrowing-power binding — how much a lender's loan-to-value cap leaves room for.
 *
 * The SECOND, optional calculator on the home-equity page, and a genuinely different
 * question from the first: not "what does this loan cost" but "how big a loan could I
 * even ask for". It takes what the home is worth, what is still owed on it, and the
 * combined loan-to-value the lender will go up to, and wraps the pure
 * `calculateBorrowingPower`.
 *
 * It has its OWN binding and its own result shell rather than sharing the loan
 * calculator's, because a visitor may want either answer without the other — and
 * folding them into one form would mean six required fields to get either.
 *
 * A mortgage that already fills the cap is a VALID informational result, not an input
 * error: "you cannot borrow against this home at an 80% cap" is a true and useful
 * answer, and the equity figure beside it still tells the visitor something. It
 * renders through `isUsableResult`, since a zero maximum is a finite 0 the default
 * gate would otherwise accept as an ordinary result — the gate is widened only so the
 * copy can change, never so a malformed result can slip through.
 */
import { calculateBorrowingPower, type BorrowingPowerResult } from './home-equity';
import { formatCurrency, formatCurrencyRounded, formatPercent } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** The caps lenders actually quote. 80% is the common ceiling and the default. */
export const LTV_OPTIONS = [70, 75, 80, 85, 90, 95, 100] as const;
export const DEFAULT_LTV = '80';

export interface BorrowingFormValues {
  homeValue: string;
  mortgageBalance: string;
  maxLtvPct: string;
}

export interface BorrowingComputed {
  homeValue: number;
  mortgageBalance: number;
  maxLtvPct: number;
  result: BorrowingPowerResult;
}

export const MSG = {
  homeValueRequired: 'Enter what your home is worth.',
  homeValuePositive: 'Enter a home value greater than zero.',
  mortgageRequired: 'Enter your outstanding mortgage balance.',
  mortgageNonNeg: 'Enter a mortgage balance of zero or more.',
  ltvRequired: 'Choose the loan-to-value ratio your lender allows.',
  ltvRange: 'Enter a loan-to-value between 0 and 100 percent.',
} as const;

const FAIL = Number.NaN;
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
const parseLtv = (raw: string): NumParse => {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 'invalid';
};

/* ------------------------------------------------------------------ */
/* Read / validate / compute                                           */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export function readBorrowingValues(root: HTMLElement): BorrowingFormValues {
  return {
    homeValue: control(root, 'homeValue')?.value ?? '',
    mortgageBalance: control(root, 'mortgageBalance')?.value ?? '',
    maxLtvPct: control(root, 'maxLtvPct')?.value ?? '',
  };
}

export function validateBorrowing(v: BorrowingFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const value = parsePositive(v.homeValue);
  if (value === 'empty') fieldErrors.homeValue = MSG.homeValueRequired;
  else if (value === 'invalid') fieldErrors.homeValue = MSG.homeValuePositive;

  const owed = parseNonNegative(v.mortgageBalance);
  if (owed === 'empty') fieldErrors.mortgageBalance = MSG.mortgageRequired;
  else if (owed === 'invalid') fieldErrors.mortgageBalance = MSG.mortgageNonNeg;

  const ltv = parseLtv(v.maxLtvPct);
  if (ltv === 'empty') fieldErrors.maxLtvPct = MSG.ltvRequired;
  else if (ltv === 'invalid') fieldErrors.maxLtvPct = MSG.ltvRange;

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function computeBorrowing(v: BorrowingFormValues): BorrowingComputed {
  const nums = {
    homeValue: Number(v.homeValue),
    mortgageBalance: Number(v.mortgageBalance),
    maxLtvPct: Number(v.maxLtvPct),
  };
  return { ...nums, result: calculateBorrowingPower(nums) };
}

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

/** A zero maximum is a real answer; anything malformed is still rejected. */
export function isUsableBorrowingResult(c: BorrowingComputed): boolean {
  return Number.isFinite(completeBorrowingValue(c));
}

/**
 * Returns the maximum borrowable ONLY when the whole result reconciles with the
 * unchanged formula recomputed from the parsed inputs.
 */
export function completeBorrowingValue(c: BorrowingComputed): number {
  const { homeValue, mortgageBalance, maxLtvPct, result } = c;
  if (!Number.isFinite(homeValue) || homeValue <= 0) return FAIL;
  if (!Number.isFinite(mortgageBalance) || mortgageBalance < 0) return FAIL;
  if (!Number.isFinite(maxLtvPct) || maxLtvPct <= 0 || maxLtvPct > 100) return FAIL;

  const { equity, maxBorrow, currentLtvPct, atCap } = result;
  if (![equity, maxBorrow, currentLtvPct].every(Number.isFinite)) return FAIL;
  if (equity < 0 || maxBorrow < 0 || currentLtvPct < 0) return FAIL;

  const expected = calculateBorrowingPower({ homeValue, mortgageBalance, maxLtvPct });
  if (Math.abs(equity - expected.equity) > TOL) return FAIL;
  if (Math.abs(maxBorrow - expected.maxBorrow) > TOL) return FAIL;
  if (Math.abs(currentLtvPct - expected.currentLtvPct) > TOL) return FAIL;
  if (atCap !== expected.atCap) return FAIL;

  // A loan can never exceed the equity behind it.
  if (maxBorrow > equity + TOL) return FAIL;

  return maxBorrow;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface BorrowingPresentation {
  /** "$230,000" — the dominant answer, or "Nothing" at the cap. */
  headline: string;
  /**
   * Only carries text when there is something the headline cannot say on its own.
   * "You may borrow up to $230,000" beneath a "You may borrow up to / $230,000"
   * summary is the same sentence twice, so the ordinary case says nothing here.
   */
  summary: string;
  currentLtv: string;
  equity: string;
  atCap: boolean;
}

export function presentBorrowing(c: BorrowingComputed): BorrowingPresentation {
  const { result } = c;
  const ltv = formatPercent(result.currentLtvPct, 1);
  const cap = formatPercent(c.maxLtvPct, 2);
  const maxBorrow = formatCurrencyRounded(result.maxBorrow);

  return {
    headline: result.atCap ? 'Nothing' : maxBorrow,
    summary: result.atCap
      ? `Your mortgage already uses the whole ${cap} a lender will lend against this home, so there is nothing left to borrow. You still hold ${formatCurrencyRounded(result.equity)} of equity — it is just not borrowable at this ratio.`
      : '',
    currentLtv: ltv,
    equity: formatCurrency(result.equity),
    atCap: result.atCap,
  };
}

export function describeBorrowing(c: BorrowingComputed): string {
  const ltv = `Your current loan-to-value ratio is ${Number(c.result.currentLtvPct.toFixed(1))} percent.`;
  return c.result.atCap
    ? `There is nothing left to borrow at this loan-to-value cap. ${ltv}`
    : `You may borrow up to ${formatCurrencyRounded(c.result.maxBorrow)}. ${ltv}`;
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

export function renderBorrowingResult(result: BorrowingComputed, context: FormRenderContext): void {
  const p = presentBorrowing(result);
  const scope = context.result;
  const setText = (sel: string, value: string) => {
    const el = scope.querySelector<HTMLElement>(sel);
    if (el) el.textContent = value;
  };

  setText('[data-result-when~="valid"] [data-result-value]', p.headline);
  setText('[data-hb-summary]', p.summary);
  const summary = scope.querySelector<HTMLElement>('[data-hb-summary]');
  if (summary) summary.hidden = p.summary === '';
  setText('[data-hb-ltv]', p.currentLtv);
  setText('[data-hb-equity]', p.equity);
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

/** Clear the personal figures; the lender's ratio is a structural default. */
export function resetBorrowingValues(root: HTMLElement, _mode: ResetMode): void {
  for (const name of ['homeValue', 'mortgageBalance'] as const) {
    const el = control(root, name);
    if (el) el.value = '';
  }
  const ltv = root.querySelector<HTMLSelectElement>('[name="maxLtvPct"]');
  if (ltv) ltv.value = DEFAULT_LTV;
}

export const borrowingBinding: FormCalculatorBinding<BorrowingFormValues, BorrowingComputed> = {
  readValues: readBorrowingValues,
  validate: validateBorrowing,
  compute: computeBorrowing,
  describeResult: describeBorrowing,
  renderResult: renderBorrowingResult,
  resetValues: resetBorrowingValues,
  resultValue: completeBorrowingValue,
  // A zero maximum is an informational answer, so the gate is widened for it.
  isUsableResult: isUsableBorrowingResult,
};

/** The published reference case. */
export const BORROWING_EXAMPLE_VALUES: BorrowingFormValues = {
  homeValue: '600000',
  mortgageBalance: '250000',
  maxLtvPct: '80',
};
