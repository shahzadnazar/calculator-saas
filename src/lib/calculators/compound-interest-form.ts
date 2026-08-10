/**
 * Compound Interest form binding (R21A1 — the FINAL task-first migration; calculator-OWNED binding on
 * the UNCHANGED standard-form runtime).
 *
 * Wraps the UNCHANGED `calculateCompoundInterest` (frozen by compound-interest.test.ts) — the shared
 * compound-growth engine that Investment / Savings / Retirement / Interest and the two reference tables
 * also consume. Everything here is at the VALIDATION / PRESENTATION boundary: no compound formula is
 * reimplemented, the contribution/annuity semantics are untouched, the yearly series comes straight
 * from the engine, and NO shared sibling formula is modified. The engine stays byte-identical.
 *
 * Product decisions (R21A1):
 *   • Task-first: principal / rate / years start EMPTY; the compounding frequency defaults to Monthly;
 *     the contribution is OPTIONAL (blank → 0); the result is EMPTY on the server AND after hydration
 *     (the legacy island SSR-seeded a $10,000 / 7% / 20y / $200 result and recomputed live on every
 *     keystroke), and the visitor presses Calculate for the first result (live-after-first).
 *   • Strict validation — NEVER `Number(value) || 0`. Principal required, finite, >= 0; annual rate
 *     required, finite, >= 0 (a nonsensical NEGATIVE rate is a visitor error even though the frozen
 *     engine still computes a shrinking balance — UI policy only); years required, finite, a WHOLE
 *     number in [1, MAX_YEARS] (a migrated-product boundary that bounds the series table — the
 *     Investment 1–100 precedent; the frozen engine imposes no such bound); contribution optional,
 *     blank → 0, finite, >= 0 (the engine permits negative withdrawals, but the UI rejects them, the
 *     legacy field being min="0"). The compounding frequency must be one of the five UI options
 *     (1 / 2 / 4 / 12 / 365 — Compound Interest uniquely exposes Semi-annually).
 *   • Result: the FUTURE VALUE is dominant; the three-way split (initial principal / total
 *     contributions / interest earned) is the supporting breakdown + proportion bar; the "Balance by
 *     year" series is an island-owned disclosure rendered via the DOM API (never innerHTML). ALL from
 *     the single frozen CompoundResult (no duplicated calculation).
 *   • NO isUsableResult — the complete-result guard lives in resultValue (a finite FUTURE-VALUE
 *     sentinel), reconciling every displayed figure + the series against a fresh engine recompute; a
 *     valid $0 (zero principal + zero contribution) is the finite 0 the default gate accepts.
 */
import { calculateCompoundInterest, type CompoundYear, type CompoundResult } from './compound-interest';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export type CompoundFreq = '1' | '2' | '4' | '12' | '365';

export const COMPOUND_FREQUENCIES: { value: CompoundFreq; label: string }[] = [
  { value: '1', label: 'Annually' },
  { value: '2', label: 'Semi-annually' },
  { value: '4', label: 'Quarterly' },
  { value: '12', label: 'Monthly' },
  { value: '365', label: 'Daily' },
];
const VALID_FREQ = new Set<string>(COMPOUND_FREQUENCIES.map((f) => f.value));

export const DEFAULT_FREQUENCY: CompoundFreq = '12'; // Monthly

/** The migrated-product year ceiling (whole years) — bounds the series table (the Investment precedent). */
export const MAX_YEARS = 100;

export interface CompoundValues {
  principal: string;
  annualRatePct: string;
  years: string;
  compoundsPerYear: CompoundFreq;
  contribution: string;
}

/** The composed result — the frozen engine output plus the parsed inputs it was computed from. */
export interface CompoundComputed {
  principal: number;
  annualRatePct: number;
  years: number;
  compoundsPerYear: number;
  contribution: number;
  futureValue: number;
  totalPrincipal: number;
  totalContributions: number;
  totalInterest: number;
  series: CompoundYear[];
}

export const MSG = {
  principalRequired: 'Enter an initial amount.',
  principalInvalid: 'Enter an initial amount of zero or more.',
  rateRequired: 'Enter an annual interest rate.',
  rateInvalid: 'Enter a rate of zero or more.',
  yearsRequired: 'Enter a number of years.',
  yearsInvalid: `Enter a whole number of years from 1 to ${MAX_YEARS}.`,
  contributionInvalid: 'Enter a contribution of zero or more.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure) — strict, never Number(v) || 0          */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** A finite value >= 0; empty is distinct from invalid. Zero valid; negative rejected (UI policy). */
export function parseNonNegative(raw: string): NumParse {
  const t = (raw ?? '').trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** A finite WHOLE number of years in [1, MAX_YEARS]; fractional / out-of-range is rejected. */
export function parseWholeYears(raw: string): NumParse {
  const t = (raw ?? '').trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_YEARS) return 'invalid';
  return n;
}

/** An OPTIONAL contribution: blank → 0; otherwise finite and >= 0. */
export function parseOptionalNonNegative(raw: string): 'invalid' | number {
  const t = (raw ?? '').trim();
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

export function validateCompoundValues(v: CompoundValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const principal = parseNonNegative(v.principal);
  if (principal === 'empty') fieldErrors.principal = MSG.principalRequired;
  else if (principal === 'invalid') fieldErrors.principal = MSG.principalInvalid;

  const rate = parseNonNegative(v.annualRatePct);
  if (rate === 'empty') fieldErrors.annualRatePct = MSG.rateRequired;
  else if (rate === 'invalid') fieldErrors.annualRatePct = MSG.rateInvalid;

  const years = parseWholeYears(v.years);
  if (years === 'empty') fieldErrors.years = MSG.yearsRequired;
  else if (years === 'invalid') fieldErrors.years = MSG.yearsInvalid;

  const contribution = parseOptionalNonNegative(v.contribution);
  if (contribution === 'invalid') fieldErrors.contribution = MSG.contributionInvalid;

  // compoundsPerYear is a structurally-constrained select; readFrequency coerces an unknown value to
  // the default and completeCompoundValue guards it defensively — so no visitor-facing field error.
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — unchanged pass-through to the frozen engine    */
/* ------------------------------------------------------------------ */

export function computeCompound(v: CompoundValues): CompoundComputed {
  const principal = Number(v.principal);
  const annualRatePct = Number(v.annualRatePct);
  const years = Number(v.years);
  const compoundsPerYear = Number(v.compoundsPerYear);
  const contribution = v.contribution.trim() === '' ? 0 : Number(v.contribution);
  const r = calculateCompoundInterest({ principal, annualRatePct, years, compoundsPerYear, contribution });
  return {
    principal,
    annualRatePct,
    years,
    compoundsPerYear,
    contribution,
    futureValue: r.futureValue,
    totalPrincipal: r.totalPrincipal,
    totalContributions: r.totalContributions,
    totalInterest: r.totalInterest,
    series: r.series,
  };
}

/* ------------------------------------------------------------------ */
/* Proportion split (pure) — the island bar; guards division by zero   */
/* ------------------------------------------------------------------ */

export function proportion(r: CompoundComputed): { principal: number; contributions: number; interest: number } {
  const fv = r.futureValue;
  const pct = (v: number) => (fv ? (v / fv) * 100 : 0); // valid $0 → all-zero widths, never NaN
  return {
    principal: pct(r.totalPrincipal),
    contributions: pct(r.totalContributions),
    interest: pct(r.totalInterest),
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN; // non-finite sentinel → the runtime's default finite gate rejects the result
const reconTol = (magnitude: number) => Math.max(1e-6, Math.abs(magnitude) * 1e-9);

/** The dominant FUTURE VALUE — but ONLY when the whole composed result is coherent: a known frequency,
 *  finite inputs within the validated UI domain, every total finite, the totals reconciling to the
 *  future value, a well-formed series (year-0 seed, ordered years, per-row balance = principal +
 *  contributed + interest, final balance = future value), and a fresh engine recompute reproducing all
 *  of it. A valid $0 (zero principal + zero contribution) is the finite 0 the default gate accepts. */
export function completeCompoundValue(r: CompoundComputed): number {
  if (!VALID_FREQ.has(String(r.compoundsPerYear))) return FAIL;
  if (!Number.isFinite(r.principal) || r.principal < 0) return FAIL;
  if (!Number.isFinite(r.annualRatePct) || r.annualRatePct < 0) return FAIL;
  if (!Number.isInteger(r.years) || r.years < 1 || r.years > MAX_YEARS) return FAIL;
  if (!Number.isFinite(r.contribution) || r.contribution < 0) return FAIL;

  const totals = [r.futureValue, r.totalPrincipal, r.totalContributions, r.totalInterest];
  if (!totals.every((n) => Number.isFinite(n))) return FAIL;
  if (Math.abs(r.totalPrincipal + r.totalContributions + r.totalInterest - r.futureValue) > reconTol(r.futureValue)) {
    return FAIL;
  }

  // Series shape.
  if (!Array.isArray(r.series) || r.series.length !== r.years + 1) return FAIL;
  const seed = r.series[0];
  if (seed.year !== 0 || seed.balance !== r.principal || seed.contributed !== 0 || seed.interest !== 0) return FAIL;
  for (let i = 0; i < r.series.length; i++) {
    const row = r.series[i];
    if (row.year !== i) return FAIL; // ordered 0..years
    if (![row.balance, row.contributed, row.interest].every((n) => Number.isFinite(n))) return FAIL;
    if (Math.abs(row.balance - (r.principal + row.contributed + row.interest)) > reconTol(row.balance)) return FAIL;
  }
  const last = r.series[r.series.length - 1];
  if (Math.abs(last.balance - r.futureValue) > reconTol(r.futureValue)) return FAIL;

  // Reconcile against a fresh engine recompute.
  const c: CompoundResult = calculateCompoundInterest({
    principal: r.principal,
    annualRatePct: r.annualRatePct,
    years: r.years,
    compoundsPerYear: r.compoundsPerYear,
    contribution: r.contribution,
  });
  if (
    c.futureValue !== r.futureValue ||
    c.totalPrincipal !== r.totalPrincipal ||
    c.totalContributions !== r.totalContributions ||
    c.totalInterest !== r.totalInterest ||
    c.series.length !== r.series.length
  ) {
    return FAIL;
  }

  return r.futureValue; // finite; a valid $0 future value passes the default gate
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** Concise announcement — the dominant future value + the horizon + the interest earned. */
export function describeCompoundResult(r: CompoundComputed): string {
  const yr = `${r.years} year${r.years === 1 ? '' : 's'}`;
  return `Future value after ${yr}: ${formatCurrency(r.futureValue)}, including ${formatCurrency(
    r.totalInterest,
  )} in interest earned.`;
}

/* ------------------------------------------------------------------ */
/* DOM rendering (safe — no innerHTML)                                 */
/* ------------------------------------------------------------------ */

/** One "balance by year" row built with the DOM API — the year as a row header, three right-aligned
 *  money cells (cumulative contributions, cumulative interest, balance). Never uses innerHTML. */
function seriesRow(row: CompoundYear): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'ci-row';
  const year = document.createElement('th');
  year.scope = 'row';
  year.className = 'ci-cell ci-cell--year';
  year.textContent = String(row.year);
  tr.append(year);
  for (const value of [row.contributed, row.interest, row.balance]) {
    const td = document.createElement('td');
    td.className = 'ci-cell ci-num';
    td.textContent = formatCurrencyRounded(value);
    tr.append(td);
  }
  return tr;
}

function fillSeries(tbody: HTMLElement | null, rows: readonly CompoundYear[]): void {
  if (!tbody) return;
  const frag = document.createDocumentFragment();
  for (const row of rows) frag.append(seriesRow(row));
  tbody.replaceChildren(frag);
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

const readFrequency = (root: HTMLElement): CompoundFreq => {
  const v = control(root, 'compoundsPerYear')?.value;
  return v && VALID_FREQ.has(v) ? (v as CompoundFreq) : DEFAULT_FREQUENCY;
};

export const compoundInterestBinding: FormCalculatorBinding<CompoundValues, CompoundComputed> = {
  readValues(root) {
    return {
      principal: control(root, 'principal')?.value ?? '',
      annualRatePct: control(root, 'annualRatePct')?.value ?? '',
      years: control(root, 'years')?.value ?? '',
      compoundsPerYear: readFrequency(root),
      contribution: control(root, 'contribution')?.value ?? '',
    };
  },

  validate: validateCompoundValues,

  compute: computeCompound,

  /** Complete-result guard as the ordinary result value — no isUsableResult. */
  resultValue: completeCompoundValue,

  describeResult: describeCompoundResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const set = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };

    // Dominant: the future value (shown + spoken).
    const fv = formatCurrency(result.futureValue);
    set('[data-result-when~="valid"] [data-result-value]', fv);
    set('[data-result-when~="valid"] [data-result-value-a11y]', fv);

    // Breakdown: initial principal / total contributions / interest earned.
    set('[data-ci-principal]', formatCurrencyRounded(result.totalPrincipal));
    set('[data-ci-contrib]', formatCurrencyRounded(result.totalContributions));
    set('[data-ci-interest]', formatCurrencyRounded(result.totalInterest));

    // Proportion bar (guards division by zero for a valid $0 result).
    const pct = proportion(result);
    const seg: Record<string, number> = { principal: pct.principal, contrib: pct.contributions, interest: pct.interest };
    scope.querySelectorAll<HTMLElement>('[data-ci-seg]').forEach((el) => {
      el.style.width = `${seg[el.dataset.ciSeg ?? ''] ?? 0}%`;
    });

    // Balance-by-year series (island-owned disclosure; DOM API, never innerHTML).
    fillSeries(q('[data-ci-rows]'), result.series);
  },

  resetValues(root, _mode: ResetMode) {
    const set = (name: string, val: string) => {
      const el = control(root, name);
      if (el) el.value = val;
    };
    set('principal', '');
    set('annualRatePct', '');
    set('years', '');
    set('compoundsPerYear', DEFAULT_FREQUENCY);
    set('contribution', '');
  },
};
