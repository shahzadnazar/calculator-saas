/**
 * Investment form binding (R11D1 Commit 2 — task-first migration, finance complex-form family).
 *
 * Wraps the UNCHANGED calculateInvestment (which delegates to the shared calculateCompoundInterest
 * engine — monthly compounding, END-of-period monthly contributions), frozen by investment.test.ts +
 * compound-interest.test.ts. Everything here is at the VALIDATION / PRESENTATION boundary; the pure
 * formula and the shared engine are untouched.
 *
 * Product decisions (R11D1):
 *   • Task-first, summary-only: all fields start EMPTY, the result is empty, and the visitor presses
 *     "Calculate Investment Growth" for the first result (live-after-first). The latent yearly series is
 *     NOT rendered. No structural selector, no goal mode.
 *   • Starting investment and monthly contribution are each individually optional (empty → 0, entered 0
 *     valid, negative / non-finite invalid), but COLLECTIVELY at least one must be > 0 — a FORM-level
 *     funding error (no single field is blamed).
 *   • Expected annual return is required, finite and strictly > -100% (a negative return above -100% is
 *     a supported economic scenario, never an input error). Projection period is a required whole number
 *     1–100 (an intentional binding horizon, not a formula limit).
 *   • The output is a NOMINAL projection — no inflation / tax / fee adjustment. Investment growth may be
 *     negative and is shown signed. The complete-result guard lives in the ordinary resultValue (a NaN
 *     sentinel → the runtime's default finite gate). There is NO isUsableResult.
 */
import { calculateInvestment, type InvestmentResult } from './investment';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export const MIN_YEARS = 1;
export const MAX_YEARS = 100;
export const FUNDING_ERROR = 'Enter a starting investment or a monthly contribution greater than zero.';

export interface InvestmentValues {
  startingAmount: string;
  monthlyContribution: string;
  annualReturnPct: string;
  years: string;
}

export interface InvestmentComputed extends InvestmentResult {
  years: number;
  annualReturnPct: number;
  /** totalEarnings < 0 (a valid negative-return outcome). */
  negativeGrowth: boolean;
}

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure) — strict, never Number(v) || 0          */
/* ------------------------------------------------------------------ */

/** Optional amount: empty means 0, entered 0 is valid, negative / non-finite is invalid. */
function parseOptionalAmount(raw: string): 'invalid' | number {
  const t = raw.trim();
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** Required annual return: finite and strictly greater than -100. */
function parseReturn(raw: string): 'empty' | 'invalid' | number {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= -100) return 'invalid';
  return n;
}

/** Required whole projection period within [MIN_YEARS, MAX_YEARS]. */
function parseYears(raw: string): 'empty' | 'invalid' | number {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < MIN_YEARS || n > MAX_YEARS) return 'invalid';
  return n;
}

export function validateInvestmentValues(values: InvestmentValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const start = parseOptionalAmount(values.startingAmount);
  if (start === 'invalid') fieldErrors.startingAmount = 'Enter a starting investment of zero or more.';

  const contribution = parseOptionalAmount(values.monthlyContribution);
  if (contribution === 'invalid') fieldErrors.monthlyContribution = 'Enter a monthly contribution of zero or more.';

  const rate = parseReturn(values.annualReturnPct);
  if (rate === 'empty') fieldErrors.annualReturnPct = 'Enter an expected annual return.';
  else if (rate === 'invalid') fieldErrors.annualReturnPct = 'Enter an annual return greater than -100%.';

  const years = parseYears(values.years);
  if (years === 'empty' || years === 'invalid') {
    fieldErrors.years = `Enter a whole projection period from ${MIN_YEARS} to ${MAX_YEARS} years.`;
  }

  // Collective funding — only when BOTH funding fields are individually valid. No single field is blamed.
  let formError: string | undefined;
  if (start !== 'invalid' && contribution !== 'invalid' && !(start > 0 || contribution > 0)) {
    formError = FUNDING_ERROR;
  }

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors, ...(formError ? { formError } : {}) };
  if (formError) return { ok: false, formError };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — unchanged pass-through to calculateInvestment   */
/* ------------------------------------------------------------------ */

const optNum = (raw: string): number => (raw.trim() === '' ? 0 : Number(raw));

export function computeInvestment(values: InvestmentValues): InvestmentComputed {
  const years = Number(values.years);
  const annualReturnPct = Number(values.annualReturnPct);
  const result = calculateInvestment({
    startingAmount: optNum(values.startingAmount),
    monthlyContribution: optNum(values.monthlyContribution),
    annualReturnPct,
    years,
  });
  return { ...result, years, annualReturnPct, negativeGrowth: result.totalEarnings < 0 };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const CONSIST_TOL = 1e-6;
const reconTol = (magnitude: number) => Math.max(0.01, Math.abs(magnitude) * 1e-6);
const FAIL = Number.NaN;

/**
 * The dominant projected value when the WHOLE result is well-formed, else a NaN sentinel the runtime's
 * default finite gate rejects. Investment growth MAY be negative (a valid negative-return outcome);
 * everything else must be finite and non-negative, the series must exist with length years + 1 (a
 * year-0 seed row), be ordered and finite, its final balance ≈ the projected value, and the projected
 * value ≈ starting + contributions + growth. No isUsableResult.
 */
export function completeResultValue(r: InvestmentComputed): number {
  const { futureValue, startingAmount, totalContributions, totalEarnings, series, years } = r;

  if (!Number.isFinite(futureValue) || futureValue < 0) return FAIL;
  if (!Number.isFinite(startingAmount) || startingAmount < 0) return FAIL;
  if (!Number.isFinite(totalContributions) || totalContributions < 0) return FAIL;
  if (!Number.isFinite(totalEarnings)) return FAIL; // may be negative
  if (!Number.isFinite(years) || !Number.isInteger(years) || years < MIN_YEARS || years > MAX_YEARS) return FAIL;

  if (Math.abs(futureValue - (startingAmount + totalContributions + totalEarnings)) > reconTol(futureValue)) return FAIL;

  // Yearly series: a leading year-0 seed row → length = years + 1.
  if (!Array.isArray(series) || series.length !== years + 1) return FAIL;
  for (let i = 0; i < series.length; i++) {
    const row = series[i];
    if (!row || row.year !== i) return FAIL; // ordered from 0
    if (!Number.isFinite(row.balance) || !Number.isFinite(row.contributed) || !Number.isFinite(row.interest)) return FAIL;
  }
  if (Math.abs(series[series.length - 1].balance - futureValue) > reconTol(futureValue)) return FAIL;

  return futureValue;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** Announcement (§17) — the dominant projected value only, rounded to whole dollars. */
export function describeInvestmentResult(r: InvestmentComputed): string {
  return `The projected investment value is ${Math.round(r.futureValue)} dollars.`;
}

const fmtPct = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(2)}%`;

/** The visible interpretation sentence (§16), using the actual computed values. */
export function interpretInvestment(r: InvestmentComputed): string {
  if (r.annualReturnPct === 0) {
    return 'At a 0% return, the projected value equals the starting investment plus the monthly contributions.';
  }
  if (r.negativeGrowth) {
    return `At an annual return of ${fmtPct(r.annualReturnPct)}, the investment is projected to lose value relative to the ${formatCurrency(r.startingAmount + r.totalContributions)} contributed.`;
  }
  return `At an assumed annual return of ${fmtPct(r.annualReturnPct)} for ${r.years} year${r.years === 1 ? '' : 's'}, the projected nominal value is approximately ${formatCurrency(r.futureValue)}.`;
}

/** Proportion-bar segment percentages of the projected value. Only meaningful for non-negative growth
 *  (the three parts then sum to 100%); for negative growth the caller hides the bar. */
export function proportionSegments(r: InvestmentComputed): { start: number; contrib: number; earn: number } {
  const fv = r.futureValue;
  const pct = (v: number) => (fv > 0 ? Math.max(0, (v / fv) * 100) : 0);
  return { start: pct(r.startingAmount), contrib: pct(r.totalContributions), earn: pct(r.totalEarnings) };
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const investmentBinding: FormCalculatorBinding<InvestmentValues, InvestmentComputed> = {
  readValues(root) {
    const val = (n: string) => input(root, n)?.value ?? '';
    return {
      startingAmount: val('startingAmount'),
      monthlyContribution: val('monthlyContribution'),
      annualReturnPct: val('annualReturnPct'),
      years: val('years'),
    };
  },

  validate: validateInvestmentValues,

  compute: computeInvestment,

  /** Complete-result guard as the ordinary result value — no isUsableResult. */
  resultValue: completeResultValue,

  describeResult: describeInvestmentResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };
    const show = (sel: string, visible: boolean) => {
      const el = q(sel);
      if (el) el.hidden = !visible;
    };

    // Dominant projected value (shown + spoken).
    setText('[data-result-when~="valid"] [data-result-value]', formatCurrency(result.futureValue));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', `${Math.round(result.futureValue)} dollars`);

    // Breakdown — growth may be negative and is shown signed.
    setText('[data-inv-start]', formatCurrencyRounded(result.startingAmount));
    setText('[data-inv-contrib]', formatCurrencyRounded(result.totalContributions));
    const earn = result.totalEarnings;
    setText('[data-inv-earn]', `${earn < 0 ? '−' : ''}${formatCurrencyRounded(Math.abs(earn))}`);

    // Interpretation.
    setText('[data-inv-interpretation]', interpretInvestment(result));

    // Proportion bar — supplemental (aria-hidden; the text conveys every value). Hidden for negative
    // growth so no invalid CSS width is produced; the textual result remains complete.
    const seg = proportionSegments(result);
    const setW = (sel: string, w: number) => {
      const el = q(sel);
      if (el) el.style.width = `${w}%`;
    };
    show('[data-inv-bar]', !result.negativeGrowth);
    if (!result.negativeGrowth) {
      setW('[data-inv-seg="start"]', seg.start);
      setW('[data-inv-seg="contrib"]', seg.contrib);
      setW('[data-inv-seg="earn"]', seg.earn);
    }
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['startingAmount', 'monthlyContribution', 'annualReturnPct', 'years']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },
};
