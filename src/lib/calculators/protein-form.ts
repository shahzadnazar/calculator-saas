/**
 * Protein form binding (R7C-1) — standard-form binding for the daily-protein
 * calculator, the second calculator in the R7C-1 standard-form wave.
 *
 * The runtime (@lib/result/form-runtime) is used UNCHANGED. This binding owns the
 * protein specifics: reading a body-weight input + a goal/activity selector,
 * validating the weight, Metric/Imperial weight conversion, and rendering a
 * PRIMARY daily-protein target for the SELECTED goal plus the SECONDARY
 * factor/goal comparison the tool has always shown. All computation delegates to
 * the reviewed pure `calculateProtein` (grams-per-kg factors preserved); the
 * per-goal grams are exactly what that module returns, only enriched with each
 * goal's g/kg factor for display.
 *
 * The pure module returns ONE gram value per goal (round(kg × factor)), never a
 * range — so a single figure is the honest primary and the comparison table
 * supplies the surrounding context. The announcement carries only that primary
 * amount + unit, never the table. Weight conversion reuses the shared
 * `@lib/health/body-measurements` primitives; field-error MESSAGES stay here per
 * the R7B.1 policy.
 *
 * Pure parts (`validateProteinValues`, `computeProtein`, `describeProteinResult`,
 * `metricWeightToImperial`, `imperialWeightToMetric`) are unit-tested directly;
 * the DOM parts (`readValues`, `renderResult`, `resetValues`, `convertValues`)
 * are exercised end-to-end.
 */
import { calculateProtein, PROTEIN_GOALS, type ProteinResult } from './protein';
import { round1, kilogramsToPounds, poundsToKilograms } from '@lib/health/body-measurements';
import { formatNumber } from '@lib/format';
import { accessibleResultName } from '@lib/result/state';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** Default goal — general activity, matching the historical default selection. */
export const DEFAULT_GOAL_KEY = 'active';

/** Raw string values as read from the form (empty ≠ zero ≠ invalid). The goal is
 *  shared across unit systems; only the weight field name varies. */
export type ProteinValues =
  | { system: 'metric'; weightKg: string; goalKey: string }
  | { system: 'imperial'; weightLb: string; goalKey: string };

export interface ProteinGoalEstimate {
  key: string;
  label: string;
  /** g protein per kg body weight (from the reviewed goal table). */
  factor: number;
  /** round(kg × factor); NaN when weight is non-positive. */
  grams: number;
}

export interface ProteinComputed {
  /** The selected goal — drives the primary figure + the highlighted row. */
  goalKey: string;
  label: string;
  factor: number;
  /** Primary daily-protein target for the selected goal, in grams/day. */
  grams: number;
  /** Every goal for comparison — the preserved factor/range breakdown. */
  perGoal: ProteinGoalEstimate[];
}

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type PositiveParse = 'empty' | 'nonpositive' | number;

function parsePositive(raw: string): PositiveParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'nonpositive';
  return n;
}

/**
 * Validate protein form values. Presence + finiteness are explicit (never
 * `Number(value) || 0`). Only body weight is validated — the goal is a `<select>`
 * that always holds a valid option. Field keys match the markup: metric →
 * `weightKg`; imperial → `weightLb`.
 */
export function validateProteinValues(values: ProteinValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  if (values.system === 'metric') {
    const w = parsePositive(values.weightKg);
    if (w === 'empty') fieldErrors.weightKg = 'Enter your body weight.';
    else if (w === 'nonpositive') fieldErrors.weightKg = 'Enter a weight greater than zero.';
  } else {
    const w = parsePositive(values.weightLb);
    if (w === 'empty') fieldErrors.weightLb = 'Enter your body weight.';
    else if (w === 'nonpositive') fieldErrors.weightLb = 'Enter a weight greater than zero.';
  }
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation + description (pure)                                    */
/* ------------------------------------------------------------------ */

function toInput(values: ProteinValues) {
  if (values.system === 'metric') {
    return { system: 'metric' as const, weightKg: Number(values.weightKg), goalKey: values.goalKey };
  }
  return { system: 'imperial' as const, weightLb: Number(values.weightLb), goalKey: values.goalKey };
}

const factorFor = (key: string): number => PROTEIN_GOALS.find((g) => g.key === key)?.factor ?? NaN;

/**
 * Delegate the grams to the reviewed `calculateProtein` (factors preserved) and
 * enrich each per-goal row with its g/kg factor for display. The selected goal is
 * resolved with the SAME fallback the pure module uses (first goal when the key
 * is unknown), so the highlighted row and the primary figure always agree.
 */
export function computeProtein(values: ProteinValues): ProteinComputed {
  const base: ProteinResult = calculateProtein(toInput(values));
  const perGoal: ProteinGoalEstimate[] = base.perGoal.map((g) => ({
    key: g.key,
    label: g.label,
    factor: factorFor(g.key),
    grams: g.grams,
  }));
  const selected = PROTEIN_GOALS.find((g) => g.key === values.goalKey) ?? PROTEIN_GOALS[0];
  return {
    goalKey: selected.key,
    label: selected.label,
    factor: selected.factor,
    grams: base.grams,
    perGoal,
  };
}

/** Concise announcement — the PRIMARY daily target only, never the goal table. */
export function describeProteinResult(result: ProteinComputed): string {
  return `Your estimated daily protein target is about ${formatNumber(result.grams, 0)} grams per day.`;
}

/* ------------------------------------------------------------------ */
/* Weight conversion (pure) — built on the shared body-measurement utils */
/* ------------------------------------------------------------------ */

/** Metric kg → imperial lb (null if empty/non-positive, so nothing is fabricated). */
export function metricWeightToImperial(weightKg: number | null): number | null {
  if (weightKg === null || weightKg <= 0) return null;
  return round1(kilogramsToPounds(weightKg));
}
/** Imperial lb → metric kg (null if empty/non-positive). */
export function imperialWeightToMetric(weightLb: number | null): number | null {
  if (weightLb === null || weightLb <= 0) return null;
  return round1(poundsToKilograms(weightLb));
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                          */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);

const numOrNull = (raw: string | undefined): number | null => {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const toField = (n: number | null): string => (n === null ? '' : String(n));

const readGoal = (root: HTMLElement): string =>
  root.querySelector<HTMLSelectElement>('[name="goalKey"]')?.value ?? DEFAULT_GOAL_KEY;

const fmtGrams = (v: number): string => (Number.isFinite(v) ? `${formatNumber(v, 0)} g` : '—');

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

export const proteinBinding: FormCalculatorBinding<ProteinValues, ProteinComputed> = {
  readValues(root) {
    const active = root.querySelector<HTMLElement>('[data-unit].is-active, [data-unit][aria-checked="true"]');
    const system = active?.dataset.unit === 'imperial' ? 'imperial' : 'metric';
    const goalKey = readGoal(root);
    if (system === 'metric') {
      return { system: 'metric', weightKg: input(root, 'weightKg')?.value ?? '', goalKey };
    }
    return { system: 'imperial', weightLb: input(root, 'weightLb')?.value ?? '', goalKey };
  },

  validate: validateProteinValues,

  compute: computeProtein,

  resultValue(result) {
    return result.grams; // finiteness sentinel — finite whenever weight is valid
  },

  describeResult: describeProteinResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);

    // Primary: the selected goal's daily target (dominant).
    const valueEl = q('[data-result-when~="valid"] [data-result-value]');
    const a11yEl = q('[data-result-when~="valid"] [data-result-value-a11y]');
    const grams = formatNumber(result.grams, 0);
    if (valueEl) valueEl.textContent = grams;
    if (a11yEl) a11yEl.textContent = accessibleResultName(grams, 'grams per day');

    // Interpretation: name the goal + its g/kg factor (both straight from data).
    const interp = q('[data-pr-interpretation]');
    if (interp) {
      interp.textContent = `Based on ${result.label.toLowerCase()} at ${formatNumber(
        result.factor,
        1,
      )} g per kg of body weight.`;
    }

    // Secondary: fill each goal's grams, then mark the selected row.
    for (const g of result.perGoal) {
      const cell = q(`[data-pr-grams="${g.key}"]`);
      if (cell) cell.textContent = fmtGrams(g.grams);
    }
    scope.querySelectorAll<HTMLElement>('[data-pr-row]').forEach((row) => {
      if (row.dataset.prRow === result.goalKey) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['weightKg', 'weightLb']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
    // Restore the safe default goal (the runtime restores the default UNIT itself;
    // the goal is not a unit, so the binding owns it).
    const goal = root.querySelector<HTMLSelectElement>('[name="goalKey"]');
    if (goal) goal.value = DEFAULT_GOAL_KEY;
  },

  convertValues(root, fromUnit, toUnit) {
    if (fromUnit === 'metric' && toUnit === 'imperial') {
      const lb = metricWeightToImperial(numOrNull(input(root, 'weightKg')?.value));
      const lbEl = input(root, 'weightLb');
      if (lbEl) lbEl.value = toField(lb);
    } else if (fromUnit === 'imperial' && toUnit === 'metric') {
      const kg = imperialWeightToMetric(numOrNull(input(root, 'weightLb')?.value));
      const kgEl = input(root, 'weightKg');
      if (kgEl) kgEl.value = toField(kg);
    }
  },
};
