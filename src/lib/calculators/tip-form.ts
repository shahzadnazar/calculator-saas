/**
 * Tip form binding (R9B1 — standard-form wave, calculator #18; product family FINANCE-SIMPLE,
 * on the standard-form runtime UNCHANGED — no `isUsableResult`).
 *
 * Single mode, no structural selectors. Bill + tip percentage + number of people →
 * total-per-person (dominant) plus a tip / total-bill / tip-per-person breakdown. The pure
 * `calculateTip` is UNCHANGED and frozen by tip.test.ts; everything here is at the VALIDATION /
 * PRESENTATION boundary. Product decisions (R9B1):
 *   • Bill and tip percentage are required, finite and >= 0 (an explicit 0 is valid; empty and
 *     negative / non-finite are not). Number of people is required, finite, a WHOLE number >= 1 —
 *     a fractional / zero / negative entry is REJECTED at the interaction layer, never silently
 *     floored (the formula's own max(1, floor(...)) is a backstop, never the visitor's experience).
 *   • Total per person is the DOMINANT result; tip amount, total bill and tip-per-person are the
 *     subordinate breakdown. All four formula outputs are represented; all are finite and >= 0 for
 *     the validated domain, so the default finite gate suffices and `isUsableResult` is NOT used.
 *   • USD only — amounts are US dollars; the announcement is spoken in dollars/cents.
 *
 * The tip-percentage PRESET quick-set buttons are entirely ISLAND-owned markup: they write into
 * the tip-percentage field and dispatch its normal input event, so this binding never sees a
 * preset — it only ever reads the numeric tip field. No preset runtime / abstraction exists.
 */
import { calculateTip } from './tip';
import { formatCurrency } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export interface TipValues {
  bill: string;
  tipPct: string;
  people: string;
}

/** Structured result — carries the normalized whole people count so presentation can build the
 *  split interpretation without re-reading the DOM. Always finite and >= 0 for the validated domain. */
export interface TipComputed {
  tipAmount: number;
  total: number;
  perPersonTip: number;
  perPersonTotal: number;
  people: number;
}

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** Finite and >= 0. An explicit 0 is valid; empty and negative / non-finite are not. */
function parseNonNegative(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** Finite WHOLE number, at least 1. A fractional / zero / negative entry is rejected, not floored. */
function parseWholeAtLeastOne(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 'invalid';
  return n;
}

/** Validate tip values. Bill (>= 0), tip percentage (>= 0) and people (whole >= 1) are all
 *  required. Distinguishes an empty field from an entered 0. */
export function validateTipValues(values: TipValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const bill = parseNonNegative(values.bill);
  if (bill === 'empty') fieldErrors.bill = 'Enter a bill amount.';
  else if (bill === 'invalid') fieldErrors.bill = 'Enter a bill amount of zero or more.';

  const tipPct = parseNonNegative(values.tipPct);
  if (tipPct === 'empty') fieldErrors.tipPct = 'Enter a tip percentage.';
  else if (tipPct === 'invalid') fieldErrors.tipPct = 'Enter a tip percentage of zero or more.';

  const people = parseWholeAtLeastOne(values.people);
  if (people === 'empty') fieldErrors.people = 'Enter the number of people.';
  else if (people === 'invalid') fieldErrors.people = 'Enter a whole number of at least 1.';

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export function computeTip(values: TipValues): TipComputed {
  const people = Number(values.people);
  const r = calculateTip({ bill: Number(values.bill), tipPct: Number(values.tipPct), people });
  return {
    tipAmount: r.tipAmount,
    total: r.total,
    perPersonTip: r.perPersonTip,
    perPersonTotal: r.perPersonTotal,
    people,
  };
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** A USD amount in spoken form, e.g. "59 dollars", "29 dollars and 50 cents". */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

/** "1 person", "2 people". */
export function peoplePhrase(people: number): string {
  return `${people} ${people === 1 ? 'person' : 'people'}`;
}

/** The plain-language interpretation under the value. A zero bill is explained explicitly. */
export function interpretTip(r: TipComputed): string {
  if (r.total === 0) {
    return `With a $0 bill, there is nothing to tip or split — the total is ${formatCurrency(0)}.`;
  }
  if (r.people === 1) {
    return `The total including tip is ${formatCurrency(r.perPersonTotal)}.`;
  }
  return `Split between ${peoplePhrase(r.people)}, each person pays ${formatCurrency(r.perPersonTotal)}.`;
}

/** Concise announcement — the dominant result (total per person) only. */
export function describeTipResult(result: TipComputed): string {
  if (result.people === 1) {
    return `The total per person is ${spokenUSD(result.perPersonTotal)}.`;
  }
  return `Each person pays ${spokenUSD(result.perPersonTotal)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const tipBinding: FormCalculatorBinding<TipValues, TipComputed> = {
  readValues(root) {
    return {
      bill: input(root, 'bill')?.value ?? '',
      tipPct: input(root, 'tipPct')?.value ?? '',
      people: input(root, 'people')?.value ?? '',
    };
  },

  validate: validateTipValues,

  compute: computeTip,

  /** Guarded magnitude — the dominant "total per person". Always finite (and >= 0) for the
   *  validated domain (bill >= 0, tip >= 0, whole people >= 1), so the runtime's default finite
   *  gate accepts it; no `isUsableResult`. */
  resultValue(result) {
    return result.perPersonTotal;
  },

  // No isUsableResult — Tip has no impossible / non-finite outcome in the validated domain (R9A0 Decision A).

  describeResult: describeTipResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };

    const label = q('[data-result-when~="valid"] [data-result-summary-label]');
    if (label) label.textContent = 'Total per person';
    setText('[data-result-when~="valid"] [data-result-value]', formatCurrency(result.perPersonTotal));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(result.perPersonTotal));
    setText('[data-tp-interpretation]', interpretTip(result));
    setText('[data-tp-tip]', formatCurrency(result.tipAmount));
    setText('[data-tp-total]', formatCurrency(result.total));
    setText('[data-tp-tipperson]', formatCurrency(result.perPersonTip));
  },

  /** Clear bill + tip percentage; restore people to the neutral default of 1. The island clears
   *  the preset pressed-state on reset (preset markup is island-owned). */
  resetValues(root, _mode: ResetMode) {
    const bill = input(root, 'bill');
    if (bill) bill.value = '';
    const tip = input(root, 'tipPct');
    if (tip) tip.value = '';
    const people = input(root, 'people');
    if (people) people.value = '1';
  },
};
