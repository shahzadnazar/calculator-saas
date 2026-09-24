/**
 * Sales tax form binding — the reference's three-field solver on the UNCHANGED standard-form
 * runtime.
 *
 * Before-tax price, sales tax rate, after-tax price: fill in any two and the third follows.
 * There is no mode selector, because the blank field IS the mode — which is the whole reason
 * this shape is better than an add/remove toggle. A toggle can disagree with the fields; a
 * blank cannot.
 *
 * The arithmetic lives in `solveSalesTax` (sales-tax.ts), which is built on the frozen
 * `addSalesTax` / `removeSalesTax` primitives. Everything here is at the VALIDATION /
 * PRESENTATION boundary.
 *
 * Product decisions:
 *   • All three fields start EMPTY. Exactly two must be filled: none of the three is more
 *     "the input" than the others, so there is nothing to default.
 *   • Strict parsing, never `Number(v) || 0` — a field containing "abc" is an error, not a
 *     zero, and a blank is a request to solve for that field rather than a zero.
 *   • The dominant figure is whichever one was solved for, and the label says which.
 *   • No isUsableResult: the complete-result guard is `resultValue`, which returns a
 *     non-finite sentinel unless all three figures reconcile.
 */
import { solveSalesTax, unknownOf, type SalesTaxSolution, type SalesTaxUnknown } from './sales-tax';
import { formatCurrency } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export interface SalesTaxValues {
  beforeTax: string;
  rate: string;
  afterTax: string;
}

export interface SalesTaxComputed extends SalesTaxSolution {}

export const FIELD_LABELS: Record<SalesTaxUnknown, string> = {
  beforeTax: 'Before Tax Price',
  ratePct: 'Sales Tax Rate',
  afterTax: 'After Tax Price',
};

export const MSG = {
  needTwo: 'Fill in any two of the three and leave the third blank.',
  tooMany: 'Leave one of the three blank — that is the one this works out.',
  price: 'Enter a price of zero or more.',
  rate: 'Enter a rate greater than -100%.',
  noRate: 'A rate needs a before-tax price greater than zero to be a percentage of.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing (pure) — strict, never Number(v) || 0                       */
/* ------------------------------------------------------------------ */

type Parsed = 'blank' | 'invalid' | number;

/** A price: blank means "solve for this one", never zero. */
export function parsePrice(raw: string): Parsed {
  const t = (raw ?? '').trim().replace(/[$,]/g, '');
  if (t === '') return 'blank';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** A rate: negative is a valid discount, but -100% and below collapse the arithmetic. */
export function parseRate(raw: string): Parsed {
  const t = (raw ?? '').trim().replace(/%/g, '');
  if (t === '') return 'blank';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= -100) return 'invalid';
  return n;
}

const asNumber = (p: Parsed): number | null => (typeof p === 'number' ? p : null);

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export function validateSalesTaxValues(v: SalesTaxValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const before = parsePrice(v.beforeTax);
  const rate = parseRate(v.rate);
  const after = parsePrice(v.afterTax);

  if (before === 'invalid') fieldErrors.beforeTax = MSG.price;
  if (after === 'invalid') fieldErrors.afterTax = MSG.price;
  if (rate === 'invalid') fieldErrors.rate = MSG.rate;
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  const blanks = [before, rate, after].filter((p) => p === 'blank').length;
  if (blanks === 0) return { ok: false, fieldErrors, formError: MSG.tooMany };
  if (blanks > 1) return { ok: false, fieldErrors, formError: MSG.needTwo };

  // Solving for a rate needs something to take a percentage of.
  if (rate === 'blank' && typeof before === 'number' && before <= 0) {
    return { ok: false, fieldErrors: { beforeTax: MSG.noRate } };
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

export function computeSalesTax(v: SalesTaxValues): SalesTaxComputed {
  return solveSalesTax({
    beforeTax: asNumber(parsePrice(v.beforeTax)),
    ratePct: asNumber(parseRate(v.rate)),
    afterTax: asNumber(parsePrice(v.afterTax)),
  });
}

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN;

/**
 * The figure that was solved for — but only when all three reconcile. Every one of them goes
 * on screen, so a plausible headline over an inconsistent trio is exactly what this stops.
 */
export function completeSalesTaxValue(r: SalesTaxComputed): number {
  if (r.unsolvable) return FAIL;
  const all = [r.beforeTax, r.ratePct, r.taxAmount, r.afterTax];
  if (!all.every((n) => Number.isFinite(n))) return FAIL;
  if (r.beforeTax < 0 || r.afterTax < 0) return FAIL;
  if (Math.abs(r.beforeTax + r.taxAmount - r.afterTax) > 1e-6) return FAIL;
  return r[r.solvedFor === 'ratePct' ? 'ratePct' : r.solvedFor];
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

/** The reference quotes the rate to two decimals: "6.50%". */
export function formatRate(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : '—';
}

export function summaryLabel(r: SalesTaxComputed): string {
  return FIELD_LABELS[r.solvedFor];
}

export function summaryValue(r: SalesTaxComputed): string {
  return r.solvedFor === 'ratePct' ? formatRate(r.ratePct) : formatCurrency(r[r.solvedFor]);
}

/** "6.50% or $6.50" — the reference's own phrasing for the tax line. */
export function taxLine(r: SalesTaxComputed): string {
  return `${formatRate(r.ratePct)} or ${formatCurrency(r.taxAmount)}`;
}

/** A USD amount spoken aloud, e.g. "106 dollars and 50 cents". */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

export function describeSalesTaxResult(r: SalesTaxComputed): string {
  if (r.solvedFor === 'ratePct') return `The sales tax rate is ${formatRate(r.ratePct)}.`;
  return `${FIELD_LABELS[r.solvedFor]}: ${spokenUSD(r[r.solvedFor])}.`;
}

export function interpretSalesTax(r: SalesTaxComputed): string {
  const tax = formatCurrency(r.taxAmount);
  const before = formatCurrency(r.beforeTax);
  const after = formatCurrency(r.afterTax);
  switch (r.solvedFor) {
    case 'afterTax':
      return `${formatRate(r.ratePct)} on ${before} adds ${tax}, so the price at the till is ${after}.`;
    case 'beforeTax':
      return `${after} includes ${tax} of tax at ${formatRate(r.ratePct)}, so the price before tax was ${before}.`;
    case 'ratePct':
      return `Going from ${before} to ${after} is ${tax} of tax, a rate of ${formatRate(r.ratePct)}.`;
  }
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const salesTaxBinding: FormCalculatorBinding<SalesTaxValues, SalesTaxComputed> = {
  readValues(root) {
    return {
      beforeTax: input(root, 'beforeTax')?.value ?? '',
      rate: input(root, 'rate')?.value ?? '',
      afterTax: input(root, 'afterTax')?.value ?? '',
    };
  },

  validate: validateSalesTaxValues,

  compute: computeSalesTax,

  resultValue: completeSalesTaxValue,

  describeResult: describeSalesTaxResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    set('[data-result-when~="valid"] [data-result-summary-label]', summaryLabel(result));
    set('[data-result-when~="valid"] [data-result-value]', summaryValue(result));
    set('[data-result-when~="valid"] [data-result-value-a11y]', describeSalesTaxResult(result));
    set('[data-st-interpretation]', interpretSalesTax(result));
    set('[data-st-before]', formatCurrency(result.beforeTax));
    set('[data-st-tax]', taxLine(result));
    set('[data-st-after]', formatCurrency(result.afterTax));
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['beforeTax', 'rate', 'afterTax']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },
};

/** The reference's own worked case, so the panel opens on a figure anyone can check. */
export const SALES_TAX_EXAMPLE_VALUES: SalesTaxValues = { beforeTax: '100', rate: '6.5', afterTax: '' };
