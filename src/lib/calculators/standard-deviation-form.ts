/**
 * Standard deviation form binding — validation and presentation over the pure engine.
 *
 * Three different rounding rules, because the reference uses three and a visitor checking one
 * figure against another tool will notice any of them:
 *   • the headline figures (σ, σ², the standard error) carry FOURTEEN significant figures;
 *   • a margin of error carries THREE decimals with trailing zeros dropped — 5.7, not 5.700;
 *   • its percentage carries TWO decimals kept — 42.50%, not 42.5%.
 *
 * The population/sample choice is a real input, not a display toggle: it changes the divisor, every
 * symbol in the working, and therefore every figure below the mean. It is read from the form like
 * any other field.
 *
 * There is no `isUsableResult` — the complete-result guard lives in `resultValue` as a NaN
 * sentinel, reconciled against a fresh computation from the accepted values.
 */
import { standardDeviation, SYMBOLS, type SdMode, type SdResult } from './standard-deviation';
import { formatDigits } from './formula-steps';
import { parseNumberList } from './statistics';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export const DEFAULT_MODE: SdMode = 'population';

/* ------------------------------------------------------------------ */
/* Formatting — the reference's three rules                            */
/* ------------------------------------------------------------------ */

/** A headline figure: fourteen significant figures, trailing zeros dropped. */
export const formatFigure = (value: number): string => formatDigits(value, 14);

/** A margin of error: three decimals, trailing zeros dropped (5.7, not 5.700). */
export function formatMargin(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return String(Number(value.toFixed(3)));
}

/** A margin as a share of the mean: two decimals KEPT (42.50%, not 42.5%). */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
}

/** A frequency share: up to four decimals, trailing zeros dropped (12.5%, 25%). */
export function formatShare(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${String(Number(value.toFixed(4)))}%`;
}

/* ------------------------------------------------------------------ */
/* Values, tokenising and validation                                   */
/* ------------------------------------------------------------------ */

export interface SdValues {
  raw: string;
  mode: string;
}

export interface SdComputed {
  values: number[];
  mode: SdMode;
  result: SdResult;
}

export const MSG = {
  empty: 'Enter at least one number.',
  invalid: (token: string) =>
    `Remove invalid values like “${token}”. Enter only finite numbers separated by commas, spaces or new lines.`,
  needTwo: 'A sample needs at least two numbers — with one, there is nothing to vary.',
} as const;

const SEPARATORS = /[\s,]+/;

const tokenize = (raw: string): string[] =>
  (raw ?? '').split(SEPARATORS).map((t) => t.trim()).filter((t) => t !== '');

/** The first token that is not a finite number, else null. */
export function firstInvalidToken(raw: string): string | null {
  for (const token of tokenize(raw)) if (!Number.isFinite(Number(token))) return token;
  return null;
}

const truncate = (t: string): string => (t.length > 12 ? `${t.slice(0, 12)}…` : t);

export const asMode = (raw: string): SdMode => (raw === 'sample' ? 'sample' : DEFAULT_MODE);

export function validateSd(values: SdValues): ValidationResult {
  const bad = firstInvalidToken(values.raw);
  if (bad !== null) return { ok: false, fieldErrors: { values: MSG.invalid(truncate(bad)) } };

  const numbers = parseNumberList(values.raw);
  if (numbers.length === 0) return { ok: false, fieldErrors: { values: MSG.empty } };
  // A one-number sample divides by n − 1 = 0. That is a question about the data, not about the
  // number typed, so it is reported on the field the visitor can act on.
  if (asMode(values.mode) === 'sample' && numbers.length < 2) {
    return { ok: false, fieldErrors: { values: MSG.needTwo } };
  }
  return { ok: true };
}

export function computeSd(values: SdValues): SdComputed {
  const numbers = parseNumberList(values.raw);
  const mode = asMode(values.mode);
  return { values: numbers, mode, result: standardDeviation(numbers, mode) };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard — the resultValue sentinel                    */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN;
const TOL = 1e-9;
const close = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(TOL, Math.abs(b) * TOL);

/**
 * The standard deviation — but only when the WHOLE result reconciles with a fresh computation from
 * the accepted values: the same count, sum, mean, sum of squared deviations, divisor, variance,
 * standard error, and a confidence and frequency table of the right shape with finite margins.
 */
export function completeSdValue(r: SdComputed): number {
  const s = r.result;
  if (!Array.isArray(r.values) || r.values.length === 0) return FAIL;
  if (!r.values.every(Number.isFinite)) return FAIL;
  if (s.count !== r.values.length) return FAIL;
  if (s.mode !== r.mode) return FAIL;
  if (r.mode === 'sample' && r.values.length < 2) return FAIL;

  const expected = standardDeviation(r.values, r.mode);
  for (const key of ['sum', 'mean', 'sumSquaredDeviations', 'divisor', 'variance', 'standardDeviation', 'sem'] as const) {
    const value = s[key];
    if (!Number.isFinite(value) || !close(value, expected[key])) return FAIL;
  }
  if (s.variance < 0 || s.standardDeviation < 0 || s.sem < 0) return FAIL;

  if (s.confidence.length !== expected.confidence.length) return FAIL;
  if (!s.confidence.every((row) => Number.isFinite(row.margin) && row.margin >= 0)) return FAIL;

  if (s.frequency.length !== expected.frequency.length) return FAIL;
  const counted = s.frequency.reduce((acc, row) => acc + row.count, 0);
  if (counted !== s.count) return FAIL;

  return s.standardDeviation;
}

/* ------------------------------------------------------------------ */
/* The working, as the reference lays it out                           */
/* ------------------------------------------------------------------ */

export interface SdStep {
  /** The left-hand side, e.g. "σ²" or "=" — rendered in its own column so the "=" signs line up. */
  lead: string;
  /** The right-hand side. */
  body: string;
}

/**
 * The derivation the reference prints:
 *
 *   σ²  = Σ(xᵢ - μ)² / N
 *       = ((10 - 18)² + … + (16 - 18)²) / 8
 *       = 192 / 8
 *       = 24
 *   σ   = √24
 *       = 4.8989794855664
 *
 * The middle line quotes the FIRST and LAST value as they were entered, with an ellipsis between —
 * a set of two shows both terms and no ellipsis, and a set of one shows its single term.
 */
export function sdSteps(r: SdResult): SdStep[] {
  if (!Number.isFinite(r.standardDeviation)) return [];
  const { sd, variance, mean, count } = r.symbols;
  // Parenthesised: "Σ(xᵢ - x̄)² / n - 1" reads as a different formula from the one being applied.
  const divisor = r.mode === 'sample' ? `(${count} - 1)` : count;

  const term = (value: number) => `(${formatFigure(value)} - ${formatFigure(r.mean)})²`;
  const first = r.values[0];
  const last = r.values[r.values.length - 1];
  const expansion =
    r.values.length === 1
      ? term(first)
      : r.values.length === 2
        ? `${term(first)} + ${term(last)}`
        : `${term(first)} + … + ${term(last)}`;

  return [
    { lead: variance, body: `Σ(xᵢ - ${mean})² / ${divisor}` },
    { lead: '=', body: `(${expansion}) / ${formatFigure(r.divisor)}` },
    { lead: '=', body: `${formatFigure(r.sumSquaredDeviations)} / ${formatFigure(r.divisor)}` },
    { lead: '=', body: formatFigure(r.variance) },
    { lead: sd, body: `√${formatFigure(r.variance)}` },
    { lead: '=', body: formatFigure(r.standardDeviation) },
  ];
}

/** The formula, stated once above the working. */
export function sdFormula(r: SdResult): string {
  const { sd, mean, count } = r.symbols;
  const divisor = r.mode === 'sample' ? `(${count} - 1)` : count;
  return `${sd} = √( (1 / ${divisor}) × Σ(xᵢ - ${mean})² )`;
}

/** The standard-error line under the margin-of-error heading. */
export function semLine(r: SdResult): string {
  const { sem, sd, count } = r.symbols;
  return `${sem} = ${sd} / √${count} = ${formatFigure(r.sem)}`;
}

/* ------------------------------------------------------------------ */
/* Announcement                                                        */
/* ------------------------------------------------------------------ */

export function describeSd(r: SdComputed): string {
  const s = r.result;
  if (!Number.isFinite(s.standardDeviation)) return '';
  const noun = r.mode === 'sample' ? 'Sample standard deviation' : 'Population standard deviation';
  return `${noun}: ${formatFigure(s.standardDeviation)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLTextAreaElement | HTMLInputElement>(`[name="${name}"]`)?.value ?? '';

export function readSdValues(root: HTMLElement): SdValues {
  const checked = root.querySelector<HTMLInputElement>('input[name="mode"]:checked');
  return { raw: field(root, 'values'), mode: checked?.value ?? DEFAULT_MODE };
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

const cell = (tag: 'td' | 'th', text: string, className?: string): HTMLElement => {
  const node = el(tag, className);
  node.textContent = text;
  if (tag === 'th') node.setAttribute('scope', 'row');
  return node;
};

export function renderSdResult(result: SdComputed, context: FormRenderContext): void {
  const scope = context.result;
  const s = result.result;
  const set = (selector: string, text: string) => {
    const node = scope.querySelector<HTMLElement>(selector);
    if (node) node.textContent = text;
  };

  set('[data-result-when~="valid"] [data-result-value]', formatFigure(s.standardDeviation));
  set('[data-result-when~="valid"] [data-result-value-a11y]', describeSd(result));
  set('[data-sd-label]', `Standard Deviation, ${s.symbols.sd}:`);
  set('[data-sd-count-label]', `Count, ${s.symbols.count}:`);
  set('[data-sd-count]', String(s.count));
  set('[data-sd-sum]', formatFigure(s.sum));
  set('[data-sd-mean-label]', `Mean, ${s.symbols.mean}:`);
  set('[data-sd-mean]', formatFigure(s.mean));
  set('[data-sd-variance-label]', `Variance, ${s.symbols.variance}:`);
  set('[data-sd-variance]', formatFigure(s.variance));
  set('[data-sd-formula]', sdFormula(s));
  set('[data-sd-sem]', semLine(s));

  const steps = scope.querySelector<HTMLElement>('[data-sd-steps]');
  if (steps) {
    steps.textContent = '';
    for (const step of sdSteps(s)) {
      const row = el('div', 'sd-step');
      const lead = el('span', 'sd-step__lead');
      lead.textContent = step.lead;
      const body = el('span', 'sd-step__body');
      body.textContent = step.body;
      row.append(lead, body);
      steps.appendChild(row);
    }
  }

  const confidence = scope.querySelector<HTMLElement>('[data-sd-confidence]');
  if (confidence) {
    confidence.textContent = '';
    for (const row of s.confidence) {
      const tr = el('tr');
      tr.append(
        cell('th', `${row.level}, ${row.multiplier}`),
        cell('td', `${formatFigure(s.mean)} ±${formatMargin(row.margin)} (±${formatPercent(row.percent)})`),
      );

      // The error bar: the mean drawn on a 0 → mean + margin axis, with the whisker across it.
      const barCell = el('td', 'sd-bar-cell');
      const bar = el('div', 'sd-bar');
      const fill = el('div', 'sd-bar__fill');
      fill.style.width = `${(row.barFraction * 100).toFixed(2)}%`;
      const whisker = el('div', 'sd-bar__whisker');
      whisker.style.left = `${(row.lowFraction * 100).toFixed(2)}%`;
      whisker.style.right = '0%';
      bar.append(fill, whisker);
      barCell.appendChild(bar);
      tr.appendChild(barCell);
      confidence.appendChild(tr);
    }
  }

  const frequency = scope.querySelector<HTMLElement>('[data-sd-frequency]');
  if (frequency) {
    frequency.textContent = '';
    for (const row of s.frequency) {
      const tr = el('tr');
      tr.append(
        cell('th', formatFigure(row.value)),
        cell('td', `${row.count} (${formatShare(row.percent)})`),
      );
      frequency.appendChild(tr);
    }
  }
}

export const standardDeviationBinding: FormCalculatorBinding<SdValues, SdComputed> = {
  readValues: readSdValues,
  validate: validateSd,
  compute: computeSd,
  resultValue: completeSdValue,
  describeResult: describeSd,
  renderResult: renderSdResult,
  resetValues(root, _mode: ResetMode) {
    const textarea = root.querySelector<HTMLTextAreaElement>('[name="values"]');
    if (textarea) textarea.value = '';
    const population = root.querySelector<HTMLInputElement>(`input[name="mode"][value="${DEFAULT_MODE}"]`);
    if (population) population.checked = true;
  },
};

/**
 * Example values for the labelled worked result shown on first load.
 *
 * These are OURS, not the visitor's: the runtime computes them and calls this binding's own
 * renderResult, so the example reuses the real result markup and can never drift from the engine.
 */
export const SD_EXAMPLE_VALUES: SdValues = { raw: '10, 12, 23, 23, 16, 23, 21, 16', mode: 'population' };

export { SYMBOLS };
