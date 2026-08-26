/**
 * Statistics form binding (R13B1 — descriptive-statistics ATOMIC migration).
 *
 * Wraps the UNCHANGED `parseNumberList` / `calculateStats`, frozen by
 * statistics.test.ts. Everything here is at the VALIDATION / PRESENTATION
 * boundary; the formula, the 17-field `StatsResult`, the Tukey-hinge quartiles
 * and the population/sample split are untouched.
 *
 * ONE calculator-owned binding serves BOTH routes. The `primary` value is
 * route CONFIGURATION ('summary' for the Statistics page, 'sd' for the Standard
 * Deviation page), read from the island's `data-primary`. It changes ONLY the
 * dominant hero, the announcement and the interpretation — the parse,
 * validation, formulas, full grid and Reset lifecycle are identical for both.
 * This is NOT a generic textarea/parsing/multi-stat framework and is not shared
 * with any other calculator.
 *
 * Product decisions (R13B1):
 *   • Task-first: the textarea starts EMPTY, the result is empty, and the visitor
 *     presses "Calculate Statistics" / "Calculate Standard Deviation" for the
 *     first result (live-after-first thereafter). No calculation on load.
 *   • The binding TOKENIZES the raw textarea itself and REJECTS any non-empty
 *     token that is not a finite number (unlike the lenient `parseNumberList`,
 *     which silently drops them). At least one valid number is required.
 *   • n = 1 is a VALID result: mean/median remain available, population variance
 *     and SD are 0, while sample variance, sample SD and the quartiles are
 *     deliberately presented as "Not available" (never coerced to 0).
 *   • The complete-result guard lives in the ordinary `resultValue`: it
 *     re-derives the canonical result from the accepted values and reconciles
 *     every field, returning a finite sentinel (the mean) only when the WHOLE
 *     result is well-formed, else a NaN sentinel. There is NO `isUsableResult`.
 */
import { calculateStats, parseNumberList, type StatsResult } from './statistics';
import { formatNumber } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export type StatPrimary = 'summary' | 'sd';
export const DEFAULT_PRIMARY: StatPrimary = 'summary';

/** Field decimals for every displayed statistic. */
const DECIMALS = 4;
const NA = 'Not available';

export interface StatValues {
  /** Route configuration — which result is featured. Never affects the maths. */
  primary: StatPrimary;
  /** The raw textarea contents. */
  raw: string;
}

export interface StatComputed {
  primary: StatPrimary;
  /** The number of ACCEPTED finite values (== values.length). */
  count: number;
  /** The accepted parsed values, kept for the guard's reconciliation. */
  values: number[];
  stats: StatsResult;
}

/* ------------------------------------------------------------------ */
/* Tokenising + validation (pure) — strict, unlike parseNumberList     */
/* ------------------------------------------------------------------ */

/** The SAME separators parseNumberList uses: any run of whitespace or commas. */
const SEPARATORS = /[\s,]+/;

/** Non-empty, trimmed tokens from the raw text. */
function tokenize(raw: string): string[] {
  return (raw ?? '').split(SEPARATORS).map((t) => t.trim()).filter((t) => t !== '');
}

/** The first token that is not a finite number, else null. Uses the same
 *  `Number(...)` coercion as the frozen formula, so acceptance is consistent. */
export function firstInvalidToken(raw: string): string | null {
  for (const tok of tokenize(raw)) {
    if (!Number.isFinite(Number(tok))) return tok;
  }
  return null;
}

/** Bound the visitor text echoed in an error message. */
function truncateToken(t: string): string {
  return t.length > 12 ? `${t.slice(0, 12)}…` : t;
}

const EMPTY_ERROR = 'Enter at least one number.';

/**
 * Reject any invalid token first (identifying the first offender without echoing
 * unbounded input), then require at least one valid number. Keyed to the textarea
 * field name `values` so the runtime binds the error and focus to it.
 */
export function validateStatValues(values: StatValues): ValidationResult {
  const bad = firstInvalidToken(values.raw);
  if (bad !== null) {
    return {
      ok: false,
      fieldErrors: {
        values: `Remove invalid values like “${truncateToken(bad)}”. Enter only finite numbers separated by commas, spaces or new lines.`,
      },
    };
  }
  if (parseNumberList(values.raw).length === 0) {
    return { ok: false, fieldErrors: { values: EMPTY_ERROR } };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — unchanged pass-through to calculateStats        */
/* ------------------------------------------------------------------ */

export function computeStats(values: StatValues): StatComputed {
  const nums = parseNumberList(values.raw);
  return {
    primary: values.primary,
    count: nums.length,
    values: nums,
    stats: calculateStats(nums),
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN; // non-finite sentinel → the runtime's default finite gate rejects the result
const TOL = 1e-9;
const close = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(TOL, Math.abs(b) * TOL);

/** Fields that must be finite for EVERY valid result (n ≥ 1). */
const ALWAYS_FINITE: readonly (keyof StatsResult)[] = [
  'sum', 'mean', 'median', 'min', 'max', 'range', 'populationVariance', 'populationSD', 'sumSquares',
];
/** Fields defined only for n ≥ 2; deliberately "Not available" (non-finite) at n = 1. */
const SAMPLE_QUARTILE: readonly (keyof StatsResult)[] = [
  'sampleVariance', 'sampleSD', 'q1', 'q3', 'iqr',
];

function sameNumberList(a: readonly number[], b: readonly number[]): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * The dominant magnitude (the mean) — but ONLY when the ENTIRE result contract is
 * well-formed: the accepted values are finite, count reconciles with the input
 * length, and every field reconciles with a fresh `calculateStats(values)` (sorted
 * order, the mode as the true max-frequency set, all always-finite fields, and the
 * sample/quartile fields — finite and matching for n ≥ 2, deliberately non-finite
 * for n = 1). Any failure returns the NaN sentinel — NO `isUsableResult`.
 */
export function completeResultValue(r: StatComputed): number {
  const { values, stats: s, count: n } = r;
  if (!Array.isArray(values) || values.length === 0) return FAIL;
  if (!Number.isInteger(n) || n !== values.length) return FAIL;
  for (const v of values) if (!Number.isFinite(v)) return FAIL;

  const expected = calculateStats(values);
  if (s.count !== n || expected.count !== n) return FAIL;
  if (!sameNumberList(s.sorted, expected.sorted)) return FAIL; // finite, ordered, complete
  if (!sameNumberList([...s.mode].sort((a, b) => a - b), [...expected.mode].sort((a, b) => a - b))) {
    return FAIL; // mode is exactly the verified max-frequency set
  }

  for (const k of ALWAYS_FINITE) {
    const v = s[k] as number;
    if (!Number.isFinite(v) || !close(v, expected[k] as number)) return FAIL;
  }
  if (s.range < 0 || s.populationVariance < 0 || s.populationSD < 0 || s.sumSquares < 0) return FAIL;

  if (n >= 2) {
    for (const k of SAMPLE_QUARTILE) {
      const v = s[k] as number;
      if (!Number.isFinite(v) || !close(v, expected[k] as number)) return FAIL;
    }
    if (s.sampleVariance < 0 || s.sampleSD < 0 || s.iqr < 0) return FAIL;
  } else {
    // n === 1: the sample dispersion + quartiles must be the source-confirmed
    // non-finite "Not available" values, never coerced numbers.
    for (const k of SAMPLE_QUARTILE) {
      if (Number.isFinite(s[k] as number)) return FAIL;
    }
  }

  return s.mean;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** Mode as a single value, a comma list, or an explicit "No mode". */
export const modeText = (mode: number[]): string =>
  mode.length ? mode.map((v) => formatNumber(v, DECIMALS)).join(', ') : 'No mode';

/** The `data-stat` cells the island fills, mapping DOM keys → formatted text.
 *  Sample dispersion and quartiles render "Not available" (never a bare dash or
 *  zero) when non-finite; population figures stay 0 at n = 1. */
export function statCells(s: StatsResult): Array<{ key: string; text: string }> {
  const num = (v: number, optional = false): string =>
    Number.isFinite(v) ? formatNumber(v, DECIMALS) : optional ? NA : '—';
  return [
    { key: 'mean', text: num(s.mean) },
    { key: 'median', text: num(s.median) },
    { key: 'mode', text: modeText(s.mode) },
    { key: 'sampleSD', text: num(s.sampleSD, true) },
    { key: 'popSD', text: num(s.populationSD) },
    { key: 'sampleVar', text: num(s.sampleVariance, true) },
    { key: 'popVar', text: num(s.populationVariance) },
    { key: 'range', text: num(s.range) },
    { key: 'iqr', text: num(s.iqr, true) },
    { key: 'min', text: num(s.min) },
    { key: 'q1', text: num(s.q1, true) },
    { key: 'q3', text: num(s.q3, true) },
    { key: 'max', text: num(s.max) },
    { key: 'count', text: String(s.count) },
    { key: 'sum', text: num(s.sum) },
  ];
}

function pluralValues(n: number): string {
  return `${n} ${n === 1 ? 'value' : 'values'}`;
}

function modePhrase(mode: number[]): string {
  if (!mode.length) return 'there is no mode';
  if (mode.length === 1) return `the mode is ${formatNumber(mode[0], DECIMALS)}`;
  return `the modes are ${mode.map((v) => formatNumber(v, DECIMALS)).join(', ')}`;
}

/** The visible interpretation sentence, route-aware. */
export function interpretStats(r: StatComputed): string {
  const s = r.stats;
  if (r.primary === 'sd') {
    if (r.count < 2) {
      return `Across ${pluralValues(r.count)}, the population standard deviation is ${formatNumber(s.populationSD, DECIMALS)}. Sample standard deviation needs at least two values.`;
    }
    return `Across ${pluralValues(r.count)}, the sample standard deviation is ${formatNumber(s.sampleSD, DECIMALS)} and the population standard deviation is ${formatNumber(s.populationSD, DECIMALS)}.`;
  }
  return `Across ${pluralValues(r.count)}, the mean is ${formatNumber(s.mean, DECIMALS)}, the median is ${formatNumber(s.median, DECIMALS)} and ${modePhrase(s.mode)}.`;
}

/** The concise, route-specific accessible announcement (never the whole grid). */
export function describeStatsResult(r: StatComputed): string {
  const s = r.stats;
  if (r.primary === 'sd') {
    if (r.count < 2) {
      return 'The population standard deviation is 0. Sample standard deviation is not available for one value.';
    }
    return `The sample standard deviation is ${formatNumber(s.sampleSD, DECIMALS)}.`;
  }
  return `Statistics calculated for ${pluralValues(r.count)}. The mean is ${formatNumber(s.mean, DECIMALS)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const textarea = (root: HTMLElement) => root.querySelector<HTMLTextAreaElement>('[name="values"]');

export const statisticsBinding: FormCalculatorBinding<StatValues, StatComputed> = {
  readValues(root) {
    const raw = textarea(root)?.value ?? '';
    const primary: StatPrimary = root.getAttribute('data-primary') === 'sd' ? 'sd' : 'summary';
    return { primary, raw };
  },

  validate: validateStatValues,

  compute: computeStats,

  /** The dominant mean when the WHOLE result reconciles, else a NaN sentinel — no isUsableResult. */
  resultValue: completeResultValue,

  describeResult: describeStatsResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const setAll = (key: string, text: string) =>
      scope.querySelectorAll<HTMLElement>(`[data-stat="${key}"]`).forEach((el) => {
        el.textContent = text;
      });
    for (const cell of statCells(result.stats)) setAll(cell.key, cell.text);
    const interp = scope.querySelector<HTMLElement>('[data-stat-interpretation]');
    if (interp) interp.textContent = interpretStats(result);
  },

  resetValues(root, _mode: ResetMode) {
    const ta = textarea(root);
    if (ta) ta.value = '';
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
export const STATISTICS_EXAMPLE_VALUES: StatValues = { primary: 'summary', raw: '12, 15, 18, 22, 25, 25, 30' };
