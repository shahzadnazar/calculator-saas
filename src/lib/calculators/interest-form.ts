/**
 * Interest form binding (R20A1 — task-first Interest migration; calculator-OWNED binding on the
 * UNCHANGED standard-form runtime).
 *
 * Interest owns NO formula module. This binding is the Interest-specific COMPOSITION layer over two
 * FROZEN engines — `calculateSimpleInterest` and `calculateCompoundInterest` (frozen by
 * simple-interest.test.ts / compound-interest.test.ts and by interest.test.ts's composition
 * characterization). The SAME principal / annual rate / years feed both engines; only the COMPOUND
 * side additionally receives the compounding frequency; the "compounding advantage" is
 * compound.totalInterest − simple.interest. No conversion math is reimplemented, neither engine is
 * modified (so Compound Interest / Investment / Savings / Retirement / the reference tables stay
 * behaviourally unchanged), and NO new shared Finance engine is created.
 *
 * Product decisions (R20A1):
 *   • Task-first: principal / rate / years start EMPTY (the legacy island SSR-seeded a populated
 *     $10,000 / 5% / 10y result and recomputed live on every keystroke); the compounding frequency
 *     is a structural select defaulting to Monthly (restored on Reset); the result is EMPTY on the
 *     server AND after hydration, and the visitor presses Calculate for the first result
 *     (live-after-first).
 *   • Strict validation — NEVER `Number(value) || 0`. Principal, rate and years are each required,
 *     finite and >= 0 (the legacy inputs are all min="0"; a nonsensical NEGATIVE is a visitor error
 *     even though the frozen engines still compute negatives — UI policy only, the engines are
 *     untouched and interest.test.ts still freezes their negative behaviour). A valid ZERO in any
 *     field is a real result (a $0 earned), not an absent one.
 *   • Result: the COMPOUND interest earned is the dominant primary + the final balance; simple
 *     interest earned, simple final balance and the compounding advantage are supporting — ALL from
 *     the single composed result (no duplicated calculation).
 *   • NO isUsableResult — the complete-result guard lives in resultValue (a finite COMPOUND-interest
 *     sentinel), reconciling every displayed figure via a fresh recompute of both engines; a valid $0
 *     is the finite 0 the runtime's default gate accepts (validity is never a truthiness test).
 */
import { calculateSimpleInterest } from './simple-interest';
import { calculateCompoundInterest } from './compound-interest';
import { formatCurrency } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export type CompoundFreq = '1' | '4' | '12' | '365';

export const COMPOUND_FREQUENCIES: { value: CompoundFreq; label: string }[] = [
  { value: '1', label: 'Annually' },
  { value: '4', label: 'Quarterly' },
  { value: '12', label: 'Monthly' },
  { value: '365', label: 'Daily' },
];
const VALID_FREQ = new Set<string>(COMPOUND_FREQUENCIES.map((f) => f.value));

export const DEFAULT_FREQUENCY: CompoundFreq = '12'; // Monthly

export interface InterestValues {
  principal: string;
  annualRatePct: string;
  years: string;
  compoundsPerYear: CompoundFreq;
}

/** The composed result — only values the current Interest calculator already displays or derives. */
export interface InterestComputed {
  principal: number;
  annualRatePct: number;
  years: number;
  compoundsPerYear: number;
  simpleInterest: number; // simple.interest
  simpleFinal: number; // simple.total
  compoundInterest: number; // compound.totalInterest — DOMINANT
  compoundFinal: number; // compound.futureValue — final balance
  advantage: number; // compound.totalInterest − simple.interest
}

export const MSG = {
  principalRequired: 'Enter a principal amount.',
  principalInvalid: 'Enter a principal of zero or more.',
  rateRequired: 'Enter an annual interest rate.',
  rateInvalid: 'Enter a rate of zero or more.',
  yearsRequired: 'Enter a number of years.',
  yearsInvalid: 'Enter a number of years of zero or more.',
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

export function validateInterestValues(v: InterestValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const checks: [keyof InterestValues, string, string][] = [
    ['principal', MSG.principalRequired, MSG.principalInvalid],
    ['annualRatePct', MSG.rateRequired, MSG.rateInvalid],
    ['years', MSG.yearsRequired, MSG.yearsInvalid],
  ];
  for (const [name, req, inv] of checks) {
    const p = parseNonNegative(v[name] as string);
    if (p === 'empty') fieldErrors[name] = req;
    else if (p === 'invalid') fieldErrors[name] = inv;
  }
  // compoundsPerYear is a structurally-constrained select; readFrequency coerces an unknown value to
  // the default, and completeInterestValue guards it defensively — so no visitor-facing field error.
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — composes the two frozen engines               */
/* ------------------------------------------------------------------ */

export function computeInterest(v: InterestValues): InterestComputed {
  const principal = Number(v.principal);
  const annualRatePct = Number(v.annualRatePct);
  const years = Number(v.years);
  const compoundsPerYear = Number(v.compoundsPerYear);
  const simple = calculateSimpleInterest({ principal, annualRatePct, years });
  const compound = calculateCompoundInterest({ principal, annualRatePct, years, compoundsPerYear });
  return {
    principal,
    annualRatePct,
    years,
    compoundsPerYear,
    simpleInterest: simple.interest,
    simpleFinal: simple.total,
    compoundInterest: compound.totalInterest,
    compoundFinal: compound.futureValue,
    advantage: compound.totalInterest - simple.interest,
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN; // non-finite sentinel → the runtime's default finite gate rejects the result

/** The dominant COMPOUND interest earned — but ONLY when the whole composed result is coherent: a
 *  known frequency, finite non-negative inputs, every displayed figure finite, and a fresh recompute
 *  of BOTH engines reproducing all of them (including the advantage identity). A valid $0 (zero
 *  principal / rate / years) is the finite 0 the runtime's default gate accepts. */
export function completeInterestValue(r: InterestComputed): number {
  if (!VALID_FREQ.has(String(r.compoundsPerYear))) return FAIL;
  if (!Number.isFinite(r.principal) || r.principal < 0) return FAIL;
  if (!Number.isFinite(r.annualRatePct) || r.annualRatePct < 0) return FAIL;
  if (!Number.isFinite(r.years) || r.years < 0) return FAIL;

  const fields = [r.simpleInterest, r.simpleFinal, r.compoundInterest, r.compoundFinal, r.advantage];
  if (!fields.every((n) => Number.isFinite(n))) return FAIL;

  const s = calculateSimpleInterest({
    principal: r.principal,
    annualRatePct: r.annualRatePct,
    years: r.years,
  });
  const c = calculateCompoundInterest({
    principal: r.principal,
    annualRatePct: r.annualRatePct,
    years: r.years,
    compoundsPerYear: r.compoundsPerYear,
  });
  if (
    s.interest !== r.simpleInterest ||
    s.total !== r.simpleFinal ||
    c.totalInterest !== r.compoundInterest ||
    c.futureValue !== r.compoundFinal ||
    c.totalInterest - s.interest !== r.advantage
  ) {
    return FAIL;
  }
  return r.compoundInterest; // finite; a valid $0 compound interest is the finite 0 the gate accepts
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** Concise announcement — the dominant compound interest earned + the final balance. */
export function describeInterestResult(r: InterestComputed): string {
  return `Compound interest earned: ${formatCurrency(r.compoundInterest)}; final balance ${formatCurrency(
    r.compoundFinal,
  )}.`;
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

export const interestBinding: FormCalculatorBinding<InterestValues, InterestComputed> = {
  readValues(root) {
    return {
      principal: control(root, 'principal')?.value ?? '',
      annualRatePct: control(root, 'annualRatePct')?.value ?? '',
      years: control(root, 'years')?.value ?? '',
      compoundsPerYear: readFrequency(root),
    };
  },

  validate: validateInterestValues,

  compute: computeInterest,

  /** Complete-result guard as the ordinary result value — no isUsableResult. */
  resultValue: completeInterestValue,

  describeResult: describeInterestResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    // Dominant: the compound interest earned (shown + spoken).
    const dominant = formatCurrency(result.compoundInterest);
    set('[data-result-when~="valid"] [data-result-value]', dominant);
    set('[data-result-when~="valid"] [data-result-value-a11y]', dominant);
    // Prominent: the compound final balance.
    set('[data-int-final]', formatCurrency(result.compoundFinal));
    // Supporting: simple interest, simple final balance, the compounding advantage.
    set('[data-int-simple]', formatCurrency(result.simpleInterest));
    set('[data-int-simple-final]', formatCurrency(result.simpleFinal));
    set('[data-int-advantage]', formatCurrency(result.advantage));
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
export const INTEREST_EXAMPLE_VALUES: InterestValues = { principal: '10000', annualRatePct: '5', years: '10', compoundsPerYear: '12' };
