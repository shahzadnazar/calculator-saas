/**
 * Home Equity Loan form binding (R15B2 — Loan family follow-on, 2 of 3).
 *
 * Wraps the UNCHANGED `calculateHomeEquity` (and, beneath it, the shared
 * @lib/finance `pmt`), frozen by home-equity.test.ts + finance.test.ts.
 * Everything here is at the VALIDATION / PRESENTATION boundary; the pure formula
 * is untouched.
 *
 * INDEPENDENCE: Home Equity owns this binding outright. It imports NOTHING from
 * loan-form.ts or amortization-form.ts and shares no implementation file with any
 * other calculator (the mirror-not-share discipline). There is NO shared
 * loan-family / finance-form / property-equity / amortization abstraction.
 *
 * Product decisions (R15B2):
 *   • Task-first: fields start EMPTY; the visitor presses "Calculate Home Equity
 *     Loan" for the first result (live-after-first thereafter).
 *   • Field validation is strict (never `Number()||0`): home value > 0, mortgage
 *     balance ≥ 0, maximum loan-to-value in (0, 100], loan amount > 0, rate ≥ 0
 *     (0% valid), term a whole 1–30 years (the migrated-product boundary shared
 *     with Loan; the frozen formula has no maximum term).
 *   • The frozen `exceedsMax` (requested loan above the LTV-capped maximum) is a
 *     SHOWN informational outcome, NOT a rejection: the estimated payment, equity
 *     and maximum-borrow figures still display, with a neutral over-limit note.
 *     This preserves the legacy behaviour (the auto-loan "supported scenario,
 *     shown not rejected" precedent) — no arbitrary borrowing limit is added.
 *   • The dominant result is the estimated monthly payment; equity and the
 *     LTV-capped maximum borrow are prominent secondaries. The calculator computes
 *     NO total-paid / total-interest / schedule (the frozen result exposes none),
 *     so none is invented.
 *   • The complete-result guard lives in the ordinary `resultValue` (returns the
 *     finite monthly payment only when the whole result reconciles with the
 *     unchanged formula, else a NaN sentinel → the runtime's default finite gate).
 *     There is NO `isUsableResult`.
 */
import { calculateHomeEquity, type HomeEquityResult } from './home-equity';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** Migrated-product term ceiling (whole years), shared with Loan (bounds pmt's month count). */
export const MAX_TERM_YEARS = 30;

export interface HomeEquityFormValues {
  homeValue: string;
  mortgageBalance: string;
  maxLtvPct: string;
  loanAmount: string;
  annualRatePct: string;
  termYears: string;
}

/** The parsed inputs alongside the unchanged `calculateHomeEquity` output. */
export interface HomeEquityComputed {
  homeValue: number;
  mortgageBalance: number;
  maxLtvPct: number;
  loanAmount: number;
  annualRatePct: number;
  termYears: number;
  result: HomeEquityResult;
}

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure) — strict, never Number(v) || 0          */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

function parsePositive(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

function parseNonNegative(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** A loan-to-value percentage in (0, 100]. */
function parseLtv(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return 'invalid';
  return n;
}

/** Finite WHOLE number of years within [1, MAX_TERM_YEARS]. */
function parseWholeTerm(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_TERM_YEARS) return 'invalid';
  return n;
}

export const MSG = {
  homeValueRequired: 'Enter your home value.',
  homeValuePositive: 'Enter a home value greater than zero.',
  mortgageRequired: 'Enter your current mortgage balance.',
  mortgageNonNeg: 'Enter a mortgage balance of zero or more.',
  ltvRequired: 'Enter the maximum loan-to-value.',
  ltvRange: 'Enter a loan-to-value between 0 and 100 percent.',
  loanRequired: 'Enter the loan amount you want.',
  loanPositive: 'Enter a loan amount greater than zero.',
  rateRequired: 'Enter an interest rate.',
  rateNonNeg: 'Enter an interest rate of zero or more.',
  term: `Enter a whole loan term from 1 to ${MAX_TERM_YEARS} years.`,
} as const;

/**
 * Validate home-equity values. All six fields are required and range-checked.
 * The requested loan exceeding the LTV-capped maximum is NOT a validation error —
 * it is a shown informational outcome (see the module header).
 */
export function validateHomeEquity(v: HomeEquityFormValues): ValidationResult {
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

  const loan = parsePositive(v.loanAmount);
  if (loan === 'empty') fieldErrors.loanAmount = MSG.loanRequired;
  else if (loan === 'invalid') fieldErrors.loanAmount = MSG.loanPositive;

  const rate = parseNonNegative(v.annualRatePct);
  if (rate === 'empty') fieldErrors.annualRatePct = MSG.rateRequired;
  else if (rate === 'invalid') fieldErrors.annualRatePct = MSG.rateNonNeg;

  const term = parseWholeTerm(v.termYears);
  if (term === 'empty' || term === 'invalid') fieldErrors.termYears = MSG.term;

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — unchanged pass-through to calculateHomeEquity  */
/* ------------------------------------------------------------------ */

export function computeHomeEquity(v: HomeEquityFormValues): HomeEquityComputed {
  const nums = {
    homeValue: Number(v.homeValue),
    mortgageBalance: Number(v.mortgageBalance),
    maxLtvPct: Number(v.maxLtvPct),
    loanAmount: Number(v.loanAmount),
    annualRatePct: Number(v.annualRatePct),
    termYears: Number(v.termYears),
  };
  return { ...nums, result: calculateHomeEquity(nums) };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const TOL = 1e-6;
const FAIL = Number.NaN;

/**
 * The finite monthly payment — but ONLY when the whole result reconciles with the
 * unchanged formula: equity, maxBorrow and monthlyPayment are finite and
 * non-negative and match `calculateHomeEquity` recomputed from the parsed inputs,
 * and the exceedsMax flag matches. Any failure returns the NaN sentinel, which the
 * runtime's DEFAULT finite gate rejects — there is NO `isUsableResult`.
 */
export function completeHomeEquityValue(c: HomeEquityComputed): number {
  const { homeValue, mortgageBalance, maxLtvPct, loanAmount, annualRatePct, termYears, result } = c;
  if (![homeValue, mortgageBalance, maxLtvPct, loanAmount, annualRatePct, termYears].every(Number.isFinite)) return FAIL;

  const expected = calculateHomeEquity({ homeValue, mortgageBalance, maxLtvPct, loanAmount, annualRatePct, termYears });
  const { equity, maxBorrow, monthlyPayment } = result;

  if (!Number.isFinite(equity) || equity < 0) return FAIL;
  if (!Number.isFinite(maxBorrow) || maxBorrow < 0) return FAIL;
  if (!Number.isFinite(monthlyPayment) || monthlyPayment < 0) return FAIL;

  if (Math.abs(equity - expected.equity) > TOL) return FAIL;
  if (Math.abs(maxBorrow - expected.maxBorrow) > TOL) return FAIL;
  if (Math.abs(monthlyPayment - expected.monthlyPayment) > TOL) return FAIL;
  if (result.exceedsMax !== expected.exceedsMax) return FAIL;

  return monthlyPayment;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

const pctLabel = (ltv: number): string => `${ltv}%`;

export interface HomeEquityPresentation {
  payment: string;
  equity: string;
  maxBorrow: string;
  overLimit: boolean;
  /** Neutral secondary explanation — equity held and the LTV-capped maximum (always shown). */
  interpretation: string;
  /** The specific over-limit warning — meaningful only when `overLimit` is true. */
  overLimitNote: string;
}

export function presentHomeEquity(c: HomeEquityComputed): HomeEquityPresentation {
  const { result } = c;
  const equity = formatCurrencyRounded(result.equity);
  const maxBorrow = formatCurrencyRounded(result.maxBorrow);
  const ltv = pctLabel(c.maxLtvPct);
  const loan = formatCurrencyRounded(c.loanAmount);

  return {
    payment: formatCurrency(result.monthlyPayment),
    equity,
    maxBorrow,
    overLimit: result.exceedsMax,
    // The neutral secondary is always the equity + LTV-capped maximum; the over-limit
    // warning is a SEPARATE callout so the facts and the flag never double-signal.
    interpretation: `You hold ${equity} of equity; at a ${ltv} loan-to-value cap you could borrow up to ${maxBorrow}.`,
    overLimitNote: `The ${loan} you entered is more than the ${maxBorrow} you can borrow at a ${ltv} loan-to-value cap. The estimated payment is for the amount you entered.`,
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

/** Concise announcement — the dominant payment plus the maximum-borrow constraint. */
export function describeHomeEquity(c: HomeEquityComputed): string {
  const payment = `Estimated monthly payment: ${spokenUSD(c.result.monthlyPayment)}.`;
  return c.result.exceedsMax
    ? `${payment} The entered loan is above your ${spokenUSD(c.result.maxBorrow)} maximum.`
    : `${payment} You can borrow up to ${spokenUSD(c.result.maxBorrow)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`);

const FIELDS = ['homeValue', 'mortgageBalance', 'maxLtvPct', 'loanAmount', 'annualRatePct', 'termYears'] as const;

export const homeEquityBinding: FormCalculatorBinding<HomeEquityFormValues, HomeEquityComputed> = {
  readValues(root) {
    const v = {} as HomeEquityFormValues;
    for (const name of FIELDS) v[name] = control(root, name)?.value ?? '';
    return v;
  },

  validate: validateHomeEquity,

  compute: computeHomeEquity,

  /** The finite monthly payment when the whole result reconciles, else NaN — no isUsableResult. */
  resultValue: completeHomeEquityValue,

  describeResult: describeHomeEquity,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const p = presentHomeEquity(result);
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);

    const shown = q('[data-result-when~="valid"] [data-result-value]');
    if (shown) shown.textContent = p.payment;
    const spoken = q('[data-result-when~="valid"] [data-result-value-a11y]');
    if (spoken) spoken.textContent = spokenUSD(result.result.monthlyPayment);

    const set = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };
    set('[data-he-equity]', p.equity);
    set('[data-he-max]', p.maxBorrow);
    set('[data-he-interpretation]', p.interpretation);

    // The over-limit note is the frozen estimator warning, shown only when the
    // requested loan exceeds the LTV-capped maximum (result stays valid).
    const note = q('[data-he-overlimit]');
    if (note) {
      note.textContent = p.overLimitNote;
      note.hidden = !p.overLimit;
    }
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of FIELDS) {
      const el = control(root, name);
      if (el) el.value = '';
    }
  },
};

/* ------------------------------------------------------------------ */
/* Starting values (arrive-filled)                                     */
/* ------------------------------------------------------------------ */

/**
 * The values this calculator arrives filled with, so the visitor lands on a real
 * worked result they can type over instead of an empty form. They are OURS, not
 * the visitor's: the runtime computes them silently on mount (`prefill`), and
 * Reset still clears the form to blank rather than restoring them.
 *
 * The borrow amount must sit inside the available equity for the result to be
 * usable — 85% of $400,000 is $340,000, less the $250,000 owed leaves $90,000,
 * so $50,000 borrows comfortably within it. `starting-values.test.ts` pins that.
 */
export const HOME_EQUITY_STARTING_VALUES = {
  homeValue: '400000',
  mortgageBalance: '250000',
  maxLtvPct: '85',
  loanAmount: '50000',
  annualRatePct: '8.5',
  termYears: '15',
} as const;
