/**
 * Tip bindings — TWO independent calculators on one page, each its own `<form data-equation>`
 * on the shared equation runtime, the way the percentage and inflation pages already work.
 *
 *   1. `quick`  — one price in, every customary percentage out as a table. Nobody arrives
 *                 knowing exactly what rate they want; they want to see the options priced.
 *   2. `shared` — price, tip percentage and number of people, split down to what each person
 *                 actually hands over.
 *
 * Both run on `calculateTip` / `tipTable` (tip.ts). `calculateTip` is UNCHANGED and still
 * frozen by tip.test.ts, because the tip reference table is built from it.
 */
import { CUSTOMARY_TIP_PCT, calculateTip, tipTable, type TipResult, type TipTableRow } from './tip';
import { formatCurrency } from '@lib/format';
import type {
  EquationCalculatorBinding,
  EquationRenderContext,
  ValidationResult,
} from '@lib/result/equation-runtime';

export { CUSTOMARY_TIP_PCT, TIP_PERCENTAGES } from './tip';

export const MSG = {
  priceRequired: 'Enter a price.',
  priceInvalid: 'Enter a price of zero or more.',
  tipRequired: 'Enter a tip percentage.',
  tipInvalid: 'Enter a tip percentage of zero or more.',
  peopleRequired: 'Enter the number of people.',
  peopleInvalid: 'Enter a whole number of people, one or more.',
} as const;

/** Structural defaults: the customary rate, and a bill that splits one way. */
export const DEFAULT_TIP_PCT = String(CUSTOMARY_TIP_PCT);
export const DEFAULT_PEOPLE = '1';

/* ------------------------------------------------------------------ */
/* Parsing — strict, never Number(v) || 0                              */
/* ------------------------------------------------------------------ */

type Parsed = 'empty' | 'invalid' | number;

export function parseMoney(raw: string): Parsed {
  const t = (raw ?? '').trim().replace(/[$,]/g, '');
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

export function parsePercent(raw: string): Parsed {
  const t = (raw ?? '').trim().replace(/%/g, '');
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

export function parsePeople(raw: string): Parsed {
  const t = (raw ?? '').trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1) return 'invalid';
  return n;
}

const readField = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? '';

function clearField(root: HTMLElement, name: string, to = ''): void {
  const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (el) el.value = to;
}

function setText(scope: HTMLElement, sel: string, text: string): void {
  const el = scope.querySelector<HTMLElement>(sel);
  if (el) el.textContent = text;
}

/** A USD amount spoken aloud, e.g. "63 dollars and 25 cents". */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

/** "15%" — whole where it is whole, a decimal only when one was entered. */
export function formatTipPct(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/* ------------------------------------------------------------------ */
/* 1. The tip table                                                    */
/* ------------------------------------------------------------------ */

export interface QuickTipOperands {
  price: string;
}

export interface QuickTipComputed {
  price: number;
  rows: TipTableRow[];
  /** The row at the customary rate, which the panel leads with. */
  customary: TipTableRow | null;
}

export function validateQuickTip(o: QuickTipOperands): ValidationResult {
  const price = parseMoney(o.price);
  if (price === 'empty') return { ok: false, fieldErrors: { price: MSG.priceRequired } };
  if (price === 'invalid') return { ok: false, fieldErrors: { price: MSG.priceInvalid } };
  return { ok: true };
}

export function computeQuickTip(o: QuickTipOperands): QuickTipComputed {
  const parsed = parseMoney(o.price);
  const price = typeof parsed === 'number' ? parsed : Number.NaN;
  const rows = tipTable(price);
  return { price, rows, customary: rows.find((r) => r.customary) ?? null };
}

export function describeQuickTip(r: QuickTipComputed): string {
  if (!r.customary) return 'No result.';
  return `At ${formatTipPct(r.customary.tipPct)}, the tip is ${spokenUSD(r.customary.tipAmount)} and the total ${spokenUSD(r.customary.total)}.`;
}

export function interpretQuickTip(r: QuickTipComputed): string {
  if (!r.customary) return '';
  return `On ${formatCurrency(r.price)}, the customary ${formatTipPct(r.customary.tipPct)} is ${formatCurrency(r.customary.tipAmount)}, making ${formatCurrency(r.customary.total)} in all. Every other rate is priced below.`;
}

export const quickTipBinding: EquationCalculatorBinding<QuickTipOperands, QuickTipComputed> = {
  readOperands: (root) => ({ price: readField(root, 'price') }),
  validate: validateQuickTip,
  compute: computeQuickTip,
  /** No table means nothing to show; the runtime's finite gate takes it from here. */
  resultValue: (r) => (r.customary && r.rows.length ? r.customary.total : Number.NaN),
  describeResult: describeQuickTip,
  renderResult(result, ctx: EquationRenderContext) {
    const scope = ctx.result;
    if (!result.customary) return;
    setText(scope, '[data-result-when~="valid"] [data-result-value]', formatCurrency(result.customary.total));
    setText(scope, '[data-result-when~="valid"] [data-result-value-a11y]', describeQuickTip(result));
    setText(scope, '[data-tip-interpretation]', interpretQuickTip(result));
    for (const row of result.rows) {
      setText(scope, `[data-tip-amount="${row.tipPct}"]`, formatCurrency(row.tipAmount));
      setText(scope, `[data-tip-total="${row.tipPct}"]`, formatCurrency(row.total));
    }
  },
  resetOperands: (root) => clearField(root, 'price'),
};

export const QUICK_TIP_EXAMPLE_VALUES: QuickTipOperands = { price: '55' };

/* ------------------------------------------------------------------ */
/* 2. The shared bill                                                  */
/* ------------------------------------------------------------------ */

export interface SharedTipOperands {
  price: string;
  tipPct: string;
  people: string;
}

export interface SharedTipComputed extends TipResult {
  price: number;
  tipPct: number;
  people: number;
}

export function validateSharedTip(o: SharedTipOperands): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const price = parseMoney(o.price);
  if (price === 'empty') fieldErrors.price = MSG.priceRequired;
  else if (price === 'invalid') fieldErrors.price = MSG.priceInvalid;

  const tip = parsePercent(o.tipPct);
  if (tip === 'empty') fieldErrors.tipPct = MSG.tipRequired;
  else if (tip === 'invalid') fieldErrors.tipPct = MSG.tipInvalid;

  const people = parsePeople(o.people);
  if (people === 'empty') fieldErrors.people = MSG.peopleRequired;
  else if (people === 'invalid') fieldErrors.people = MSG.peopleInvalid;

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function computeSharedTip(o: SharedTipOperands): SharedTipComputed {
  const price = parseMoney(o.price);
  const tipPct = parsePercent(o.tipPct);
  const people = parsePeople(o.people);
  const bill = typeof price === 'number' ? price : Number.NaN;
  const pct = typeof tipPct === 'number' ? tipPct : Number.NaN;
  const n = typeof people === 'number' ? people : Number.NaN;
  return { ...calculateTip({ bill, tipPct: pct, people: n }), price: bill, tipPct: pct, people: n };
}

/** Every figure on screen must be a real, non-negative number before any of them shows. */
export function completeSharedTip(r: SharedTipComputed): number {
  const all = [r.price, r.tipPct, r.people, r.tipAmount, r.total, r.perPersonTip, r.perPersonTotal];
  if (!all.every((n) => Number.isFinite(n)) || all.some((n) => n < 0)) return Number.NaN;
  if (!(r.people >= 1)) return Number.NaN;
  return r.perPersonTotal;
}

/** The reference's two lines; per person once a bill is split. */
export function sharedLabels(r: SharedTipComputed): { tip: string; total: string } {
  return r.people > 1
    ? { tip: 'Tip per Person', total: 'Total per Person' }
    : { tip: 'Tip', total: 'Total Amount' };
}

export function describeSharedTip(r: SharedTipComputed): string {
  const { total } = sharedLabels(r);
  return `${total}: ${spokenUSD(r.perPersonTotal)}.`;
}

export function interpretSharedTip(r: SharedTipComputed): string {
  const tip = `${formatTipPct(r.tipPct)} on ${formatCurrency(r.price)} is ${formatCurrency(r.tipAmount)}`;
  if (r.people <= 1) return `${tip}, making ${formatCurrency(r.total)} to pay.`;
  return `${tip}, making ${formatCurrency(r.total)}. Split ${r.people} ways, that is ${formatCurrency(r.perPersonTotal)} each, of which ${formatCurrency(r.perPersonTip)} is tip.`;
}

export const sharedTipBinding: EquationCalculatorBinding<SharedTipOperands, SharedTipComputed> = {
  readOperands: (root) => ({
    price: readField(root, 'price'),
    tipPct: readField(root, 'tipPct'),
    people: readField(root, 'people'),
  }),
  validate: validateSharedTip,
  compute: computeSharedTip,
  resultValue: completeSharedTip,
  describeResult: describeSharedTip,
  renderResult(result, ctx: EquationRenderContext) {
    const scope = ctx.result;
    const labels = sharedLabels(result);
    setText(scope, '[data-result-when~="valid"] [data-result-summary-label]', labels.total);
    setText(scope, '[data-result-when~="valid"] [data-result-value]', formatCurrency(result.perPersonTotal));
    setText(scope, '[data-result-when~="valid"] [data-result-value-a11y]', describeSharedTip(result));
    setText(scope, '[data-shared-interpretation]', interpretSharedTip(result));
    setText(scope, '[data-shared-tip-label]', labels.tip);
    setText(scope, '[data-shared-tip]', formatCurrency(result.perPersonTip));
    setText(scope, '[data-shared-total-label]', labels.total);
    setText(scope, '[data-shared-total]', formatCurrency(result.perPersonTotal));

    // The whole-bill figures only mean something once there is more than one person.
    const whole = scope.querySelector<HTMLElement>('[data-shared-whole]');
    if (whole) whole.hidden = result.people <= 1;
    setText(scope, '[data-shared-bill-tip]', formatCurrency(result.tipAmount));
    setText(scope, '[data-shared-bill-total]', formatCurrency(result.total));
  },
  resetOperands(root) {
    clearField(root, 'price');
    clearField(root, 'tipPct', DEFAULT_TIP_PCT);
    clearField(root, 'people', DEFAULT_PEOPLE);
  },
};

export const SHARED_TIP_EXAMPLE_VALUES: SharedTipOperands = {
  price: '55',
  tipPct: DEFAULT_TIP_PCT,
  people: DEFAULT_PEOPLE,
};
