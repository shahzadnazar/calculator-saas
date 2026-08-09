/**
 * Retirement form binding (R18B3 — finance complex-form family; own binding on the
 * UNCHANGED standard-form runtime).
 *
 * Wraps the UNCHANGED calculateRetirement (which delegates to the SHARED
 * calculateCompoundInterest engine — monthly compounding, monthly end-of-period
 * contributions — then a withdrawal-rate step), frozen by retirement.test.ts +
 * compound-interest.test.ts. Everything here is at the VALIDATION / PRESENTATION boundary;
 * the pure formula and the shared engine are untouched. This is a SEPARATE calculator-owned
 * binding — it shares NOTHING with investment-form.ts / savings-form.ts beyond the frozen
 * engine underneath; there is no shared growth / retirement / projection binding.
 *
 * Product decisions (R18B3):
 *   • Task-first, summary-only: personal fields start EMPTY (the withdrawal rate is prefilled
 *     with the source's 4% default — a non-personal assumption), the result is empty, and the
 *     visitor presses "Calculate Retirement" for the first result (live-after-first). The
 *     latent yearly series is NOT rendered.
 *   • Ages: required whole years in [MIN_AGE, MAX_AGE]; retirement age must be GREATER than
 *     current age (equal / below rejected — a cross-field error; the source clamps to 0, but
 *     a zero / negative horizon is not a task-valid projection).
 *   • Current savings + monthly contribution are each optional (empty → 0, entered 0 valid,
 *     negative / non-finite invalid) but COLLECTIVELY at least one must be > 0 (a FORM-level
 *     funding error, mirroring Investment — no single field is blamed).
 *   • Annual return is required, finite and >= 0 (a retirement "expected return" is
 *     non-negative; the legacy field enforced min=0) — so earnings are always >= 0. Withdrawal
 *     rate is required, finite and >= 0.
 *   • The withdrawal output is a neutral "estimated retirement income" (nest egg × withdrawal
 *     rate), never labelled guaranteed / safe / sustainable. NO isUsableResult: the
 *     complete-result guard lives in resultValue (a NaN sentinel), reconciling every displayed
 *     field via a calculateRetirement recompute; the dominant value is the nest egg. Never
 *     Number(value) || 0.
 */
import { calculateRetirement, type RetirementResult } from './retirement';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export const MIN_AGE = 0;
export const MAX_AGE = 120;
export const DEFAULT_WITHDRAWAL_PCT = 4;
export const FUNDING_ERROR = 'Enter current savings or a monthly contribution greater than zero.';

export const MSG = {
  currentAgeRequired: 'Enter your current age.',
  currentAgeInvalid: `Enter a current age from ${MIN_AGE} to ${MAX_AGE}.`,
  retirementAgeRequired: 'Enter your retirement age.',
  retirementAgeInvalid: `Enter a retirement age from ${MIN_AGE} to ${MAX_AGE}.`,
  ageOrder: 'Retirement age must be greater than your current age.',
  savingsInvalid: 'Enter current savings of zero or more.',
  contributionInvalid: 'Enter a monthly contribution of zero or more.',
  returnRequired: 'Enter an expected annual return.',
  returnInvalid: 'Enter an annual return of zero or more.',
  withdrawalRequired: 'Enter a withdrawal rate.',
  withdrawalInvalid: 'Enter a withdrawal rate of zero or more.',
} as const;

export interface RetirementValues {
  currentAge: string;
  retirementAge: string;
  currentSavings: string;
  monthlyContribution: string;
  annualReturnPct: string;
  withdrawalRatePct: string;
}

export interface RetirementComputed extends RetirementResult {
  currentAge: number;
  retirementAge: number;
  currentSavings: number;
  monthlyContribution: number;
  annualReturnPct: number;
  withdrawalRatePct: number;
}

/* ------------------------------------------------------------------ */
/* Parsing (pure) — strict, never Number(v) || 0                       */
/* ------------------------------------------------------------------ */

type AgeParse = 'empty' | 'invalid' | number;
/** Required whole-year age in [MIN_AGE, MAX_AGE]. */
function parseAge(raw: string): AgeParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < MIN_AGE || n > MAX_AGE) return 'invalid';
  return n;
}

/** Optional amount: empty → 0, entered 0 valid, negative / non-finite invalid. */
function parseOptionalAmount(raw: string): 'invalid' | number {
  const t = raw.trim();
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** Required non-negative rate (decimals allowed). */
function parseRate(raw: string): 'empty' | 'invalid' | number {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

export function validateRetirementValues(values: RetirementValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const currentAge = parseAge(values.currentAge);
  if (currentAge === 'empty') fieldErrors.currentAge = MSG.currentAgeRequired;
  else if (currentAge === 'invalid') fieldErrors.currentAge = MSG.currentAgeInvalid;

  const retirementAge = parseAge(values.retirementAge);
  if (retirementAge === 'empty') fieldErrors.retirementAge = MSG.retirementAgeRequired;
  else if (retirementAge === 'invalid') fieldErrors.retirementAge = MSG.retirementAgeInvalid;

  const savings = parseOptionalAmount(values.currentSavings);
  if (savings === 'invalid') fieldErrors.currentSavings = MSG.savingsInvalid;

  const contribution = parseOptionalAmount(values.monthlyContribution);
  if (contribution === 'invalid') fieldErrors.monthlyContribution = MSG.contributionInvalid;

  const rate = parseRate(values.annualReturnPct);
  if (rate === 'empty') fieldErrors.annualReturnPct = MSG.returnRequired;
  else if (rate === 'invalid') fieldErrors.annualReturnPct = MSG.returnInvalid;

  const withdrawal = parseRate(values.withdrawalRatePct);
  if (withdrawal === 'empty') fieldErrors.withdrawalRatePct = MSG.withdrawalRequired;
  else if (withdrawal === 'invalid') fieldErrors.withdrawalRatePct = MSG.withdrawalInvalid;

  // Cross-field age order — only when both ages are valid integers.
  let formError: string | undefined;
  if (typeof currentAge === 'number' && typeof retirementAge === 'number' && retirementAge <= currentAge) {
    formError = MSG.ageOrder;
  }
  // Collective funding — only when BOTH funding fields are individually valid; no single field blamed.
  if (!formError && savings !== 'invalid' && contribution !== 'invalid' && !(savings > 0 || contribution > 0)) {
    formError = FUNDING_ERROR;
  }

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors, ...(formError ? { formError } : {}) };
  if (formError) return { ok: false, formError };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — unchanged pass-through to calculateRetirement  */
/* ------------------------------------------------------------------ */

const optNum = (raw: string): number => (raw.trim() === '' ? 0 : Number(raw));

export function computeRetirement(values: RetirementValues): RetirementComputed {
  const currentAge = Number(values.currentAge);
  const retirementAge = Number(values.retirementAge);
  const currentSavings = optNum(values.currentSavings);
  const monthlyContribution = optNum(values.monthlyContribution);
  const annualReturnPct = Number(values.annualReturnPct);
  const withdrawalRatePct = Number(values.withdrawalRatePct);
  const result = calculateRetirement({
    currentAge,
    retirementAge,
    currentSavings,
    monthlyContribution,
    annualReturnPct,
    withdrawalRatePct,
  });
  return { ...result, currentAge, retirementAge, currentSavings, monthlyContribution, annualReturnPct, withdrawalRatePct };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel, NO isUsableResult */
/* ------------------------------------------------------------------ */

const reconTol = (magnitude: number) => Math.max(0.01, Math.abs(magnitude) * 1e-6);
const FAIL = Number.NaN;

/**
 * The dominant projected nest egg when the WHOLE result is coherent, else a NaN sentinel the
 * runtime's default finite gate rejects. The engine math is never rebuilt here — reconciliation
 * recomputes calculateRetirement and compares every DISPLAYED field, plus the frozen-contract
 * relationships (nest egg = savings + contributions + earnings; income = nest egg × rate;
 * monthly = annual / 12). The latent yearly series is not part of the public result and is not
 * checked. Zero supporting values (0 contributions / 0 earnings / 0 income) stay valid.
 */
export function completeResultValue(r: RetirementComputed): number {
  const { currentAge, retirementAge, currentSavings, monthlyContribution, annualReturnPct, withdrawalRatePct } = r;
  if (!Number.isInteger(currentAge) || currentAge < MIN_AGE || currentAge > MAX_AGE) return FAIL;
  if (!Number.isInteger(retirementAge) || retirementAge < MIN_AGE || retirementAge > MAX_AGE) return FAIL;
  if (retirementAge <= currentAge) return FAIL;
  if (!Number.isFinite(currentSavings) || currentSavings < 0) return FAIL;
  if (!Number.isFinite(monthlyContribution) || monthlyContribution < 0) return FAIL;
  if (!Number.isFinite(annualReturnPct) || annualReturnPct < 0) return FAIL;
  if (!Number.isFinite(withdrawalRatePct) || withdrawalRatePct < 0) return FAIL;

  const { nestEgg, totalContributions, totalEarnings, estimatedAnnualIncome, estimatedMonthlyIncome, yearsToRetirement } = r;
  if (![nestEgg, totalContributions, totalEarnings, estimatedAnnualIncome, estimatedMonthlyIncome, yearsToRetirement].every(Number.isFinite)) return FAIL;
  if (nestEgg < 0 || totalContributions < 0 || totalEarnings < 0) return FAIL; // return >= 0 → earnings >= 0
  if (yearsToRetirement !== retirementAge - currentAge || yearsToRetirement <= 0) return FAIL;

  const c = calculateRetirement({ currentAge, retirementAge, currentSavings, monthlyContribution, annualReturnPct, withdrawalRatePct });
  const close = (a: number, b: number) => Math.abs(a - b) <= reconTol(b);
  if (!close(c.nestEgg, nestEgg)) return FAIL;
  if (!close(c.totalContributions, totalContributions)) return FAIL;
  if (!close(c.totalEarnings, totalEarnings)) return FAIL;
  if (!close(c.estimatedAnnualIncome, estimatedAnnualIncome)) return FAIL;
  if (!close(c.estimatedMonthlyIncome, estimatedMonthlyIncome)) return FAIL;
  if (c.yearsToRetirement !== yearsToRetirement) return FAIL;

  // Frozen-contract relationships.
  if (!close(nestEgg, currentSavings + totalContributions + totalEarnings)) return FAIL;
  if (!close(estimatedAnnualIncome, nestEgg * (withdrawalRatePct / 100))) return FAIL;
  if (!close(estimatedMonthlyIncome, estimatedAnnualIncome / 12)) return FAIL;

  return nestEgg;
}

/* ------------------------------------------------------------------ */
/* Description + presentation (pure)                                   */
/* ------------------------------------------------------------------ */

/** Announcement (§11) — the dominant projected balance only. */
export function describeRetirementResult(r: RetirementComputed): string {
  return `Projected retirement balance: ${formatCurrency(r.nestEgg)}.`;
}

const fmtPct = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(2)}%`;

/** The visible interpretation sentence, using the actual computed values + the assumptions note. */
export function interpretRetirement(r: RetirementComputed): string {
  return (
    `Growing ${formatCurrency(r.currentSavings)} plus ${formatCurrency(r.monthlyContribution)} a month at ` +
    `${fmtPct(r.annualReturnPct)} for ${r.yearsToRetirement} year${r.yearsToRetirement === 1 ? '' : 's'} projects a ` +
    `${formatCurrency(r.nestEgg)} nest egg, giving about ${formatCurrencyRounded(r.estimatedAnnualIncome)} a year at a ` +
    `${fmtPct(r.withdrawalRatePct)} withdrawal rate. Nominal projection — it excludes taxes, inflation and market volatility.`
  );
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const retirementBinding: FormCalculatorBinding<RetirementValues, RetirementComputed> = {
  readValues(root) {
    const val = (n: string) => input(root, n)?.value ?? '';
    return {
      currentAge: val('currentAge'),
      retirementAge: val('retirementAge'),
      currentSavings: val('currentSavings'),
      monthlyContribution: val('monthlyContribution'),
      annualReturnPct: val('annualReturnPct'),
      withdrawalRatePct: val('withdrawalRatePct'),
    };
  },

  validate: validateRetirementValues,

  compute: computeRetirement,

  /** Complete-result guard as the ordinary result value — no isUsableResult. */
  resultValue: completeResultValue,

  describeResult: describeRetirementResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const set = (sel: string, v: string) => {
      const el = q(sel);
      if (el) el.textContent = v;
    };

    // Dominant: projected nest egg (shown + spoken) + horizon.
    set('[data-result-when~="valid"] [data-result-value]', formatCurrency(result.nestEgg));
    set('[data-result-when~="valid"] [data-result-value-a11y]', `${Math.round(result.nestEgg)} dollars`);
    set('[data-ret-years]', String(result.yearsToRetirement));

    // Estimated retirement income.
    set('[data-ret-monthly-income]', formatCurrency(result.estimatedMonthlyIncome));
    set('[data-ret-annual-income]', formatCurrencyRounded(result.estimatedAnnualIncome));

    // Breakdown.
    set('[data-ret-contrib]', formatCurrencyRounded(result.totalContributions));
    set('[data-ret-earn]', formatCurrencyRounded(result.totalEarnings));

    // Interpretation.
    set('[data-ret-interpretation]', interpretRetirement(result));
  },

  resetValues(root, _mode: ResetMode) {
    // The island restores the withdrawal-rate default; the binding clears the personal fields.
    for (const name of ['currentAge', 'retirementAge', 'currentSavings', 'monthlyContribution', 'annualReturnPct']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },
};
