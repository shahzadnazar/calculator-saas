/**
 * Sales-tax form binding (R8A1 — standard-form wave, calculator #13; product family
 * MULTI-MODE, on the standard-form runtime UNCHANGED).
 *
 * Sales Tax has two modes — add tax / remove tax — but they are a STRUCTURAL selector
 * (same two fields, same {net,tax,gross} shape; only the equation, the labels and the
 * dominant result change). The runtime already recomputes on a structural change
 * (like calorie's goal `<select>`); this binding owns the sales-tax specifics: reading
 * the mode, selecting the reviewed formula, validating amount + rate, and rendering a
 * MODE-SPECIFIC dominant result with USD figures and a concise announcement. The
 * island owns the visible mode control + the amount/action labels (see the island).
 *
 * The pure `addSalesTax` / `removeSalesTax` / `formatCurrency` are UNCHANGED and frozen
 * by the characterization suite (sales-tax.test.ts). Everything added here is at the
 * VALIDATION / PRESENTATION boundary: amount and rate must be finite and >= 0 (an
 * entered 0 is a VALID result; empty / negative / non-finite are rejected) — never
 * `Number(value) || 0`. USD is explicit throughout.
 */
import { addSalesTax, removeSalesTax, type AddTaxResult } from './sales-tax';
import { formatCurrency } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export type TaxMode = 'add' | 'remove';

export interface SalesTaxValues {
  mode: TaxMode;
  amount: string;
  rate: string;
}

export interface SalesTaxComputed extends AddTaxResult {
  mode: TaxMode;
  rate: number;
}

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type NonNegParse = 'empty' | 'invalid' | number;
/** Parse a finite, non-negative number; empty is distinct from invalid. An entered 0
 *  is valid (a $0 amount or a tax-free 0% rate). Never `Number(value) || 0`. */
function parseNonNegative(raw: string): NonNegParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/**
 * Validate sales-tax values. Amount and rate are each required, finite and >= 0
 * (0 is valid; empty / negative / non-finite are field errors). No maximum rate is
 * imposed — the content spans 0% to over 10%.
 */
export function validateSalesTaxValues(values: SalesTaxValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const amount = parseNonNegative(values.amount);
  if (amount === 'empty') fieldErrors.amount = 'Enter an amount.';
  else if (amount === 'invalid') fieldErrors.amount = 'Enter an amount of zero or more.';

  const rate = parseNonNegative(values.rate);
  if (rate === 'empty') fieldErrors.rate = 'Enter a sales-tax rate.';
  else if (rate === 'invalid') fieldErrors.rate = 'Enter a sales-tax rate of zero or more.';

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/** A usable result: every figure finite and non-negative, ordered, and self-consistent
 *  (gross ≈ net + tax within a floating-point tolerance). */
export function isUsableTax(r: AddTaxResult): boolean {
  return (
    [r.net, r.tax, r.gross].every((v) => Number.isFinite(v) && v >= 0) &&
    r.gross >= r.net &&
    Math.abs(r.gross - (r.net + r.tax)) < 1e-6
  );
}

/* ------------------------------------------------------------------ */
/* Computation + description (pure)                                    */
/* ------------------------------------------------------------------ */

export function computeSalesTax(values: SalesTaxValues): SalesTaxComputed {
  const amount = Number(values.amount);
  const rate = Number(values.rate);
  const base = values.mode === 'remove' ? removeSalesTax(amount, rate) : addSalesTax(amount, rate);
  return { ...base, mode: values.mode, rate };
}

/** A USD amount in spoken form, e.g. "107 dollars and 25 cents", "100 dollars". */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  if (rem === 0) return d;
  return `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

/** Concise announcement — the dominant mode-owned result only. */
export function describeSalesTaxResult(result: SalesTaxComputed): string {
  return result.mode === 'remove'
    ? `Amount before sales tax is ${spokenUSD(result.net)}.`
    : `Total including sales tax is ${spokenUSD(result.gross)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const readMode = (root: HTMLElement): TaxMode =>
  root.querySelector<HTMLInputElement>('[name="mode"]:checked')?.value === 'remove' ? 'remove' : 'add';

export const salesTaxBinding: FormCalculatorBinding<SalesTaxValues, SalesTaxComputed> = {
  readValues(root) {
    return {
      mode: readMode(root),
      amount: input(root, 'amount')?.value ?? '',
      rate: input(root, 'rate')?.value ?? '',
    };
  },

  validate: validateSalesTaxValues,

  compute: computeSalesTax,

  /** Guarded primary magnitude — the dominant value (gross when adding, net when
   *  removing); NaN when the result is unusable so the runtime never shows it. */
  resultValue(result) {
    if (!isUsableTax(result)) return NaN;
    return result.mode === 'remove' ? result.net : result.gross;
  },

  describeResult: describeSalesTaxResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const add = result.mode === 'add';

    // Primary: the dominant mode-owned figure (label + value both change by mode).
    const dominantLabel = add ? 'Total including sales tax' : 'Amount before sales tax';
    const dominantValue = add ? result.gross : result.net;
    const labelEl = q('[data-result-when~="valid"] [data-result-summary-label]');
    if (labelEl) labelEl.textContent = dominantLabel;
    const valueEl = q('[data-result-when~="valid"] [data-result-value]');
    if (valueEl) valueEl.textContent = formatCurrency(dominantValue);
    const a11yEl = q('[data-result-when~="valid"] [data-result-value-a11y]');
    if (a11yEl) a11yEl.textContent = spokenUSD(dominantValue);

    // Interpretation.
    const interp = q('[data-tax-interpretation]');
    if (interp) {
      interp.textContent = add
        ? `The total after adding ${String(result.rate)}% sales tax is ${formatCurrency(result.gross)}.`
        : `The amount before tax in a total of ${formatCurrency(result.gross)} is ${formatCurrency(result.net)}.`;
    }

    // Secondary verification values (the other two of the three; all three stay visible).
    const setSec = (n: 1 | 2, label: string, value: string) => {
      const l = q(`[data-tax-sec${n}-label]`);
      const v = q(`[data-tax-sec${n}]`);
      if (l) l.textContent = label;
      if (v) v.textContent = value;
    };
    if (add) {
      setSec(1, 'Sales tax', formatCurrency(result.tax));
      setSec(2, 'Amount before tax', formatCurrency(result.net));
    } else {
      setSec(1, 'Included sales tax', formatCurrency(result.tax));
      setSec(2, 'Total including tax', formatCurrency(result.gross));
    }
  },

  resetValues(root, _mode: ResetMode) {
    // The island restores the Add-tax mode + its labels; the binding clears the values.
    for (const name of ['amount', 'rate']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },
};
