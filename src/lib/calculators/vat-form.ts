/**
 * VAT form binding — the reference's four-field solver on the UNCHANGED standard-form runtime.
 *
 * VAT rate, net price, gross price, tax amount: fill in ANY TWO and the other two follow.
 * There is no mode selector, because the blank fields ARE the mode. A selector can disagree
 * with what is typed; a blank cannot. This is the same shape as the sales tax solver, one
 * quantity wider, because a VAT invoice states the tax as its own line.
 *
 * The arithmetic lives in `solveVat` (vat.ts). Everything here is at the VALIDATION /
 * PRESENTATION boundary.
 *
 * Product decisions:
 *   - All four fields start EMPTY. None of them is more "the input" than the others, so
 *     there is nothing to default to.
 *   - Amounts are printed WITHOUT a currency symbol. VAT is levied in more than 170
 *     countries; stamping a dollar sign on a European tax would be wrong for almost every
 *     visitor, and picking a currency is a setting nobody asked for. The page says the tool
 *     is currency-neutral instead.
 *   - Strict parsing, never `Number(v) || 0` — "abc" is an error, and a blank is a request
 *     to work that field out rather than a zero.
 *   - A 0% rate is VALID, not an error: zero-rated goods are a real VAT category.
 *   - No isUsableResult. The complete-result guard is `resultValue`, which returns a
 *     non-finite sentinel unless all four figures reconcile against both identities.
 */
import { solveVat, VAT_QUANTITIES, type VatQuantity, type VatSolution } from './vat';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export interface VatValues {
  rate: string;
  net: string;
  gross: string;
  tax: string;
}

export interface VatComputed extends VatSolution {}

/** Field name in the DOM for each quantity, and the label the visitor reads. */
export const FIELD_NAME: Record<VatQuantity, keyof VatValues> = {
  ratePct: 'rate',
  net: 'net',
  gross: 'gross',
  tax: 'tax',
};

export const FIELD_LABELS: Record<VatQuantity, string> = {
  ratePct: 'VAT rate',
  net: 'Net price',
  gross: 'Gross price',
  tax: 'Tax amount',
};

export const MSG = {
  needTwo: 'Fill in any two of the four and leave the other two blank.',
  tooMany: 'Leave two of the four blank — those are the ones this works out.',
  amount: 'Enter an amount of zero or more.',
  rate: 'Enter a VAT rate of zero or more.',
  grossBelowNet: 'A gross price cannot be lower than the net price it came from.',
  grossBelowTax: 'A gross price cannot be lower than the tax inside it.',
  noNet: 'Working out a rate needs a net price above zero to be a percentage of.',
  noRate: 'Working out a net price from a tax amount needs a VAT rate above zero.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing (pure) — strict, never Number(v) || 0                       */
/* ------------------------------------------------------------------ */

type Parsed = 'blank' | 'invalid' | number;

/**
 * An amount. Blank means "work this one out", never zero.
 *
 * Currency symbols and separators people actually paste are tolerated on the way IN even
 * though nothing is printed with them on the way out — a figure copied from an invoice
 * should not be rejected for carrying its symbol.
 */
export function parseAmount(raw: string): Parsed {
  const t = (raw ?? '')
    .trim()
    .replace(/[$£€,\s]/g, '');
  if (t === '') return 'blank';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** A VAT rate. Zero is valid — zero-rated goods — but a negative rate is not. */
export function parseRate(raw: string): Parsed {
  const t = (raw ?? '').trim().replace(/[%\s]/g, '');
  if (t === '') return 'blank';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

const asNumber = (p: Parsed): number | null => (typeof p === 'number' ? p : null);

interface ParsedValues {
  ratePct: Parsed;
  net: Parsed;
  gross: Parsed;
  tax: Parsed;
}

export function parseVatValues(v: VatValues): ParsedValues {
  return {
    ratePct: parseRate(v.rate),
    net: parseAmount(v.net),
    gross: parseAmount(v.gross),
    tax: parseAmount(v.tax),
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export function validateVatValues(v: VatValues): ValidationResult {
  const p = parseVatValues(v);
  const fieldErrors: Record<string, string> = {};

  if (p.ratePct === 'invalid') fieldErrors.rate = MSG.rate;
  if (p.net === 'invalid') fieldErrors.net = MSG.amount;
  if (p.gross === 'invalid') fieldErrors.gross = MSG.amount;
  if (p.tax === 'invalid') fieldErrors.tax = MSG.amount;
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  const filled = VAT_QUANTITIES.filter((q) => typeof p[q] === 'number');
  if (filled.length < 2) return { ok: false, fieldErrors, formError: MSG.needTwo };
  if (filled.length > 2) return { ok: false, fieldErrors, formError: MSG.tooMany };

  // Contradictions the visitor can see and correct, named on the field that is wrong.
  if (typeof p.net === 'number' && typeof p.gross === 'number' && p.gross < p.net) {
    return { ok: false, fieldErrors: { gross: MSG.grossBelowNet } };
  }
  if (typeof p.gross === 'number' && typeof p.tax === 'number' && p.gross < p.tax) {
    return { ok: false, fieldErrors: { gross: MSG.grossBelowTax } };
  }

  // A rate has to be a percentage OF something.
  const solvingForRate = p.ratePct === 'blank';
  if (solvingForRate && typeof p.net === 'number' && p.net <= 0) {
    return { ok: false, fieldErrors: { net: MSG.noNet } };
  }
  if (solvingForRate && typeof p.gross === 'number' && typeof p.tax === 'number' && p.gross - p.tax <= 0) {
    return { ok: false, fieldErrors: { gross: MSG.noNet } };
  }

  // ...and recovering a net from a tax amount needs one to divide by.
  if (typeof p.ratePct === 'number' && typeof p.tax === 'number' && p.ratePct <= 0) {
    return { ok: false, fieldErrors: { rate: MSG.noRate } };
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

export function computeVat(v: VatValues): VatComputed {
  const p = parseVatValues(v);
  return solveVat({
    ratePct: asNumber(p.ratePct),
    net: asNumber(p.net),
    gross: asNumber(p.gross),
    tax: asNumber(p.tax),
  });
}

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN;

/**
 * The headline figure — but only once all four reconcile against BOTH identities. All four go
 * on screen together, so a plausible headline over an inconsistent set is exactly what this
 * stops.
 */
export function completeVatValue(r: VatComputed): number {
  if (r.unsolvable) return FAIL;
  if (!VAT_QUANTITIES.every((q) => Number.isFinite(r[q]))) return FAIL;
  if (r.ratePct < 0 || r.net < 0 || r.gross < 0 || r.tax < 0) return FAIL;
  const scale = Math.max(1, Math.abs(r.gross));
  if (Math.abs(r.net + r.tax - r.gross) > 1e-6 * scale) return FAIL;
  if (Math.abs(r.net * (r.ratePct / 100) - r.tax) > 1e-6 * scale) return FAIL;
  return r[headlineOf(r)];
}

/**
 * Which of the two worked-out figures leads.
 *
 * Priority is the order people ask the question in: the gross price is what you pay, the net
 * is what the seller keeps, the tax is the line on the invoice, and the rate is the thing you
 * usually already knew.
 */
const HEADLINE_PRIORITY: readonly VatQuantity[] = ['gross', 'net', 'tax', 'ratePct'];

export function headlineOf(r: VatComputed): VatQuantity {
  return HEADLINE_PRIORITY.find((q) => r.solvedFor.includes(q)) ?? 'gross';
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

/**
 * An amount, with grouping and two decimals but NO currency symbol.
 *
 * Deliberately not `formatCurrency`: see the currency-neutral decision at the top of the file.
 */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** A rate to two decimals, trailing zeros trimmed: "20%", "7.75%". */
export function formatRate(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(2).replace(/\.?0+$/, '');
  return `${fixed}%`;
}

export const formatQuantity = (q: VatQuantity, r: VatComputed): string =>
  q === 'ratePct' ? formatRate(r.ratePct) : formatAmount(r[q]);

export function summaryLabel(r: VatComputed): string {
  return FIELD_LABELS[headlineOf(r)];
}

export function summaryValue(r: VatComputed): string {
  return formatQuantity(headlineOf(r), r);
}

export function describeVatResult(r: VatComputed): string {
  const q = headlineOf(r);
  return `${FIELD_LABELS[q]}: ${formatQuantity(q, r)}.`;
}

/**
 * One sentence naming what was worked out and how it follows, phrased for the direction the
 * visitor actually took.
 */
export function interpretVat(r: VatComputed): string {
  const rate = formatRate(r.ratePct);
  const net = formatAmount(r.net);
  const gross = formatAmount(r.gross);
  const tax = formatAmount(r.tax);

  switch (r.given.join('+')) {
    case 'ratePct+net':
      return `VAT at ${rate} on a net price of ${net} adds ${tax}, so the gross price is ${gross}.`;
    case 'ratePct+gross':
      return `A gross price of ${gross} at ${rate} contains ${tax} of VAT, leaving a net price of ${net}.`;
    case 'ratePct+tax':
      return `${tax} of VAT at ${rate} was charged on a net price of ${net}, making the gross price ${gross}.`;
    case 'net+gross':
      return `Going from ${net} to ${gross} is ${tax} of VAT, a rate of ${rate}.`;
    case 'net+tax':
      return `${tax} of VAT on a net price of ${net} is a rate of ${rate}, so the gross price is ${gross}.`;
    case 'gross+tax':
      return `Taking ${tax} of VAT out of ${gross} leaves a net price of ${net}, a rate of ${rate}.`;
    default:
      return `Net ${net} plus ${tax} of VAT at ${rate} gives a gross price of ${gross}.`;
  }
}

/** "Net price, Gross price" — used to label which figures the tool supplied. */
export function solvedForLabel(r: VatComputed): string {
  return r.solvedFor.map((q) => FIELD_LABELS[q]).join(' and ');
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const vatBinding: FormCalculatorBinding<VatValues, VatComputed> = {
  readValues(root) {
    return {
      rate: input(root, 'rate')?.value ?? '',
      net: input(root, 'net')?.value ?? '',
      gross: input(root, 'gross')?.value ?? '',
      tax: input(root, 'tax')?.value ?? '',
    };
  },

  validate: validateVatValues,

  compute: computeVat,

  resultValue: completeVatValue,

  describeResult: describeVatResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    set('[data-result-when~="valid"] [data-result-summary-label]', summaryLabel(result));
    set('[data-result-when~="valid"] [data-result-value]', summaryValue(result));
    set('[data-result-when~="valid"] [data-result-value-a11y]', describeVatResult(result));
    set('[data-vat-interpretation]', interpretVat(result));
    set('[data-vat-rate]', formatRate(result.ratePct));
    set('[data-vat-net]', formatAmount(result.net));
    set('[data-vat-tax]', formatAmount(result.tax));
    set('[data-vat-gross]', formatAmount(result.gross));

    // Mark the two figures the tool supplied, so the breakdown shows at a glance which came
    // from the visitor. Never colour alone — the row also carries a "worked out" text tag.
    for (const q of VAT_QUANTITIES) {
      const row = scope.querySelector<HTMLElement>(`[data-vat-row="${q}"]`);
      if (!row) continue;
      const derived = result.solvedFor.includes(q);
      row.dataset.vatDerived = String(derived);
      const tag = row.querySelector<HTMLElement>('[data-vat-tag]');
      if (tag) tag.hidden = !derived;
    }
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['rate', 'net', 'gross', 'tax']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },
};

/** The reference's own worked case, so the panel opens on a figure anyone can check. */
export const VAT_EXAMPLE_VALUES: VatValues = { rate: '20', net: '1200', gross: '', tax: '' };
