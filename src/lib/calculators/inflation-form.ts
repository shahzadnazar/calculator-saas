/**
 * Inflation bindings — THREE independent calculators on one page, each its own
 * `<form data-equation>` on the shared equation runtime, exactly as the six percentage
 * equations work:
 *
 *   1. `cpi`      — what an amount in one month or annual average is worth in another,
 *                   read off the published U.S. CPI-U series.
 *   2. `forward`  — an amount grown at a flat rate for some years.
 *   3. `backward` — what an amount would have been that many years ago at a flat rate.
 *
 * The two flat-rate forms are mirror images and share one engine (`adjustForInflation`,
 * UNCHANGED and still frozen by inflation.test.ts). The CPI form is a different thing
 * entirely: it looks values up rather than assuming a rate, so it can also report the
 * rate that actually happened.
 *
 * Amounts start EMPTY behind a labelled worked example, the fleet-wide contract every
 * other calculator keeps (e2e/example-state.spec.ts). The period selects carry defaults
 * because a select always holds something, and that default is derived from the data —
 * the latest published month, against the annual average ten years before it — so the
 * page does not rot as new months are released. The CPI example is that same span, which
 * is why the panel opens on a real, reproducible figure with the visitor's own fields
 * still blank.
 */
import { adjustForInflation } from './inflation';
import {
  type CpiComparison,
  type CpiPeriod,
  compareCpi,
  cpiValue,
  hasAnnualAverage,
  latestPeriod,
  periodLabel,
} from './cpi';
import { drawPurchasingPowerChart } from './inflation-chart';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
import type {
  EquationCalculatorBinding,
  EquationRenderContext,
  ValidationResult,
} from '@lib/result/equation-runtime';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

const readField = (root: HTMLElement, name: string): string => field(root, name)?.value ?? '';

function clearField(root: HTMLElement, name: string): void {
  const el = field(root, name);
  if (el && el instanceof HTMLInputElement) el.value = '';
}

type NumParse = 'empty' | 'invalid' | number;

/** Finite and >= 0. An explicit 0 is valid; empty and negative are not. */
function parseNonNegative(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** Finite and strictly above -100. A negative rate is valid deflation. */
function parseRate(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= -100) return 'invalid';
  return n;
}

/** Exactly two decimals — the precision the published figures are quoted to. */
export function formatPct2(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
}

/**
 * A figure the visitor typed, echoed back as they typed it: "$100" and "3%", not
 * "$100.00" and "3.00%". Computed figures keep their two decimals — the distinction is
 * deliberate, because trailing zeros on a result carry precision and on an echo they are
 * just noise.
 */
export function formatAmountEntered(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? formatCurrencyRounded(value) : formatCurrency(value);
}

export function formatRateEntered(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Number(value.toFixed(4))}%`;
}

/** The index as BLS prints it: up to three decimals, trailing zeros trimmed. */
export function formatIndex(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return String(Math.round(value * 1000) / 1000);
}

/** A USD amount spoken aloud, e.g. "139 dollars and 13 cents". */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

function setText(scope: HTMLElement, sel: string, text: string): void {
  const el = scope.querySelector<HTMLElement>(sel);
  if (el) el.textContent = text;
}

function setValue(scope: HTMLElement, display: string, spoken: string): void {
  setText(scope, '[data-result-when~="valid"] [data-result-value]', display);
  setText(scope, '[data-result-when~="valid"] [data-result-value-a11y]', spoken);
}

/* ------------------------------------------------------------------ */
/* 1. CPI calculator                                                   */
/* ------------------------------------------------------------------ */

export interface CpiOperands {
  amount: string;
  fromMonth: string;
  fromYear: string;
  toMonth: string;
  toYear: string;
}

export interface CpiComputed {
  amount: number;
  comparison: CpiComparison | null;
}

/** "average" or "1".."12" from a select, into the engine's period shape. */
export function toPeriod(monthRaw: string, yearRaw: string): CpiPeriod | null {
  const year = Number(yearRaw);
  if (!Number.isInteger(year)) return null;
  if (monthRaw === 'average') return { year, month: 'average' };
  const month = Number(monthRaw);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * Both ends must name a period the Bureau actually published. The two failures a visitor
 * can really hit are a year whose annual average does not exist yet (this year, or 2025,
 * which lost October) and a month later than the last release — so each gets its own
 * sentence rather than one shrug.
 */
export function validateCpi(o: CpiOperands): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const amount = parseNonNegative(o.amount);
  if (amount === 'empty') fieldErrors.amount = 'Enter an amount.';
  else if (amount === 'invalid') fieldErrors.amount = 'Enter an amount of zero or more.';

  const ends: [CpiPeriod | null, string][] = [
    [toPeriod(o.fromMonth, o.fromYear), 'fromMonth'],
    [toPeriod(o.toMonth, o.toYear), 'toMonth'],
  ];
  let formError: string | undefined;
  for (const [period, name] of ends) {
    if (!period) {
      fieldErrors[name] = 'Choose a period.';
      continue;
    }
    if (cpiValue(period) !== null) continue;
    if (period.month === 'average' && !hasAnnualAverage(period.year)) {
      fieldErrors[name] = `${period.year} has no annual average yet. Choose a month.`;
    } else {
      fieldErrors[name] = `No index was published for ${periodLabel(period)}.`;
      formError = `The CPI runs to ${periodLabel(latestPeriod())}. October 2025 is missing because prices were never collected that month.`;
    }
  }

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors, formError };
  return { ok: true };
}

export function computeCpi(o: CpiOperands): CpiComputed {
  const amount = Number(o.amount);
  const from = toPeriod(o.fromMonth, o.fromYear);
  const to = toPeriod(o.toMonth, o.toYear);
  return {
    amount,
    comparison: from && to ? compareCpi(amount, from, to) : null,
  };
}

/** The result sentence, worded as the published reference words it. */
export function cpiHeadline(c: CpiComparison): string {
  return `${formatCurrency(c.value)} in ${periodLabel(c.to)} equals ${formatAmountEntered(c.amount)} of buying power in ${periodLabel(c.from)}.`;
}

export function cpiRates(c: CpiComparison): string {
  const total = `The total inflation rate from ${periodLabel(c.from)} to ${periodLabel(c.to)} is ${formatPct2(c.totalPct)}.`;
  if (!Number.isFinite(c.annualPct)) return total;
  return `${total} The average inflation rate is ${formatPct2(c.annualPct)} per year.`;
}

export function cpiIndexes(c: CpiComparison): string {
  return `The CPI of ${periodLabel(c.from)} is ${formatIndex(c.fromCpi)} and the CPI of ${periodLabel(c.to)} is ${formatIndex(c.toCpi)}.`;
}

export function cpiChartTitle(c: CpiComparison): string {
  return `Purchasing power of ${formatAmountEntered(c.amount)} in ${periodLabel(c.from)} over time: ${periodLabel(c.from)}–${periodLabel(c.to)}`;
}

export const cpiBinding: EquationCalculatorBinding<CpiOperands, CpiComputed> = {
  readOperands: (root) => ({
    amount: readField(root, 'amount'),
    fromMonth: readField(root, 'fromMonth'),
    fromYear: readField(root, 'fromYear'),
    toMonth: readField(root, 'toMonth'),
    toYear: readField(root, 'toYear'),
  }),

  validate: validateCpi,

  compute: computeCpi,

  /** No comparison means no figure to show; the runtime's finite gate takes it from here. */
  resultValue: (r) => (r.comparison ? r.comparison.value : Number.NaN),

  describeResult: (r) =>
    r.comparison
      ? `${spokenUSD(r.comparison.value)} in ${periodLabel(r.comparison.to)}.`
      : 'No result.',

  renderResult(result, ctx: EquationRenderContext) {
    const c = result.comparison;
    if (!c) return;
    const scope = ctx.result;
    setValue(scope, formatCurrency(c.value), spokenUSD(c.value));
    setText(scope, '[data-cpi-headline]', cpiHeadline(c));
    setText(scope, '[data-cpi-rates]', cpiRates(c));
    setText(scope, '[data-cpi-indexes]', cpiIndexes(c));

    const figure = scope.querySelector<HTMLElement>('[data-cpi-figure]');
    const drawn = drawPurchasingPowerChart(
      scope.querySelector<HTMLElement>('[data-cpi-chart]'),
      c.series,
      {
        prefix: 'if',
        label: cpiChartTitle(c),
        formatTick: (v) => `$${Math.round(v).toLocaleString('en-US')}`,
      },
    );
    setText(scope, '[data-cpi-chart-title]', cpiChartTitle(c));
    if (figure) figure.hidden = !drawn;
  },

  resetOperands(root) {
    clearField(root, 'amount');
    for (const [name, value] of Object.entries(CPI_DEFAULT_PERIODS)) {
      const el = field(root, name);
      if (el) el.value = value;
    }
  },
};

/** Latest published month, against the annual average ten years earlier. */
function defaultPeriods(): Record<string, string> {
  const latest = latestPeriod();
  let fromYear = latest.year - 10;
  // Fall back a year at a time if that year never got a complete annual average.
  while (fromYear > 1913 && !hasAnnualAverage(fromYear)) fromYear -= 1;
  return {
    fromMonth: 'average',
    fromYear: String(fromYear),
    toMonth: String(latest.month),
    toYear: String(latest.year),
  };
}

export const CPI_DEFAULT_PERIODS = defaultPeriods();

/** The worked example: the reference span, with an amount of our own, never the visitor's. */
export const CPI_EXAMPLE_VALUES: CpiOperands = { amount: '100', ...CPI_DEFAULT_PERIODS } as CpiOperands;

/* ------------------------------------------------------------------ */
/* 2 + 3. Flat-rate calculators                                        */
/* ------------------------------------------------------------------ */

export interface FlatOperands {
  amount: string;
  annualRatePct: string;
  years: string;
}

export interface FlatComputed {
  amount: number;
  annualRatePct: number;
  years: number;
  /** Forward: the amount grown. Backward: the amount discounted. */
  value: number;
  totalPct: number;
}

export function validateFlat(o: FlatOperands): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const amount = parseNonNegative(o.amount);
  if (amount === 'empty') fieldErrors.amount = 'Enter an amount.';
  else if (amount === 'invalid') fieldErrors.amount = 'Enter an amount of zero or more.';

  const rate = parseRate(o.annualRatePct);
  if (rate === 'empty') fieldErrors.annualRatePct = 'Enter an inflation rate.';
  else if (rate === 'invalid') fieldErrors.annualRatePct = 'Enter a rate greater than -100%.';

  const years = parseNonNegative(o.years);
  if (years === 'empty') fieldErrors.years = 'Enter a number of years.';
  else if (years === 'invalid') fieldErrors.years = 'Enter zero years or more.';

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

function computeFlat(o: FlatOperands, direction: 'forward' | 'backward'): FlatComputed {
  const amount = Number(o.amount);
  const annualRatePct = Number(o.annualRatePct);
  const years = Number(o.years);
  const r = adjustForInflation({ amount, annualRatePct, years });
  return {
    amount,
    annualRatePct,
    years,
    value: direction === 'forward' ? r.futureCost : r.buyingPower,
    totalPct: r.totalInflationPct,
  };
}

/** "10 years", "1 year", "1.5 years". */
export function yearsPhrase(years: number): string {
  const n = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(years);
  return `${n} ${years === 1 ? 'year' : 'years'}`;
}

export function forwardSentence(r: FlatComputed): string {
  return `${formatAmountEntered(r.amount)} today, at ${formatRateEntered(r.annualRatePct)} inflation a year, has the same buying power as ${formatCurrency(r.value)} in ${yearsPhrase(r.years)}. Prices rise ${formatPct2(r.totalPct)} in total over the period.`;
}

export function backwardSentence(r: FlatComputed): string {
  return `${formatAmountEntered(r.amount)} today had the same buying power as ${formatCurrency(r.value)} ${yearsPhrase(r.years)} ago, at ${formatRateEntered(r.annualRatePct)} inflation a year. Prices rose ${formatPct2(r.totalPct)} in total over the period.`;
}

/** Both flat-rate forms are one engine read in opposite directions. */
function flatBinding(
  direction: 'forward' | 'backward',
  sentence: (r: FlatComputed) => string,
): EquationCalculatorBinding<FlatOperands, FlatComputed> {
  return {
    readOperands: (root) => ({
      amount: readField(root, 'amount'),
      annualRatePct: readField(root, 'annualRatePct'),
      years: readField(root, 'years'),
    }),
    validate: validateFlat,
    compute: (o) => computeFlat(o, direction),
    /** Guard every figure on screen, not just the headline one. */
    resultValue: (r) =>
      Number.isFinite(r.value) && Number.isFinite(r.totalPct) && r.value >= 0 ? r.value : Number.NaN,
    describeResult: (r) => spokenUSD(r.value),
    renderResult(result, ctx: EquationRenderContext) {
      setValue(ctx.result, formatCurrency(result.value), spokenUSD(result.value));
      setText(ctx.result, '[data-flat-sentence]', sentence(result));
    },
    resetOperands(root) {
      clearField(root, 'amount');
      clearField(root, 'annualRatePct');
      clearField(root, 'years');
    },
  };
}

export const forwardInflationBinding = flatBinding('forward', forwardSentence);
export const backwardInflationBinding = flatBinding('backward', backwardSentence);

export const FLAT_EXAMPLE_VALUES: FlatOperands = { amount: '100', annualRatePct: '3', years: '10' };
