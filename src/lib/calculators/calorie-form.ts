/**
 * Calorie form binding (R7C-2B) — standard-form binding for the calorie / TDEE
 * calculator (Mifflin-St Jeor BMR × activity, with the reviewed goal deltas).
 *
 * The runtime (@lib/result/form-runtime) is used UNCHANGED. This binding owns the
 * calorie specifics: reading sex + age + height/weight + the activity and goal
 * selectors, validating the personal inputs, Metric/Imperial conversion, calling
 * the reviewed pure `calculateCalories`, and rendering a SELECTED-GOAL daily
 * target (dominant) with maintenance/BMR references and the full goal comparison.
 *
 * The reviewed `calculateCalories` already returns every figure — bmr,
 * maintenance (TDEE = BMR × activity) and the four goal adjustments (±250 / ±500
 * kcal). This binding adds a goal SELECTOR that chooses which of those existing
 * values is the headline; it fabricates no new number, range, average or minimum.
 * Activity levels come from the shared `ACTIVITY_LEVELS`; Metric/Imperial
 * conversion + imperial-height classification from the shared
 * `@lib/health/body-measurements` primitives (as BMR uses). Field-error MESSAGES
 * stay here.
 *
 * A finiteness+positivity gate (mirrored in `validate`) means a non-positive or
 * non-finite selected target surfaces the invalid state with plain guidance,
 * never a nonsensical figure; secondary goal values that are non-positive render
 * as a dash rather than a number.
 */
import { calculateCalories, ACTIVITY_LEVELS, type CalorieInput, type CalorieResult, type Sex } from './calorie';
import {
  round1,
  kilogramsToPounds,
  poundsToKilograms,
  centimetresToTotalInches,
  totalInchesToCentimetres,
  totalInchesToFeetAndInches,
  classifyImperialHeight,
} from '@lib/health/body-measurements';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export { ACTIVITY_LEVELS };

/** Moderate — the historical island default activity multiplier. */
export const DEFAULT_ACTIVITY = 1.55;
/** Maintenance — the historical dominant output, so the safe default goal. */
export const DEFAULT_GOAL_KEY = 'maintain';

const nf = new Intl.NumberFormat('en-US');
/** Display a calorie figure with thousands separators; a non-finite / non-positive
 *  value renders as a dash (§7 — a non-positive goal value is never shown). */
export const formatCalories = (v: number): string =>
  Number.isFinite(v) && v > 0 ? nf.format(Math.round(v)) : '—';

/** A usable calorie figure: finite and strictly positive. */
export const isUsableCalories = (v: number): boolean => Number.isFinite(v) && v > 0;

const CALORIE_SANITY_MESSAGE =
  'These details do not produce a usable calorie estimate. Check your entries and try again.';

/** The goal model, keyed to the reviewed `CalorieResult` fields (no new numbers):
 *  maintenance and the ±250 / ±500 kcal adjustments the module already returns. */
export type CalorieGoalField = 'maintenance' | 'mildLoss' | 'loss' | 'mildGain' | 'gain';
export interface CalorieGoal {
  key: string;
  label: string;
  /** Spoken fragment, e.g. "for weight loss". */
  announce: string;
  /** Concise interpretation shown under the figure. */
  note: string;
  field: CalorieGoalField;
}
export const CALORIE_GOALS: readonly CalorieGoal[] = [
  {
    key: 'maintain',
    label: 'Maintain weight',
    announce: 'for maintaining weight',
    note: 'Based on the selected calculation scenario — eating around your maintenance (TDEE).',
    field: 'maintenance',
  },
  {
    key: 'mild-loss',
    label: 'Mild weight loss (−250 kcal/day)',
    announce: 'for mild weight loss',
    note: 'Based on the selected calculation scenario — 250 kcal/day below maintenance.',
    field: 'mildLoss',
  },
  {
    key: 'loss',
    label: 'Weight loss (−500 kcal/day)',
    announce: 'for weight loss',
    note: 'Based on the selected calculation scenario — 500 kcal/day below maintenance.',
    field: 'loss',
  },
  {
    key: 'mild-gain',
    label: 'Mild weight gain (+250 kcal/day)',
    announce: 'for mild weight gain',
    note: 'Based on the selected calculation scenario — 250 kcal/day above maintenance.',
    field: 'mildGain',
  },
  {
    key: 'gain',
    label: 'Weight gain (+500 kcal/day)',
    announce: 'for weight gain',
    note: 'Based on the selected calculation scenario — 500 kcal/day above maintenance.',
    field: 'gain',
  },
] as const;

export type CalorieValues =
  | { sex: Sex; system: 'metric'; age: string; heightCm: string; weightKg: string; activity: string; goalKey: string }
  | {
      sex: Sex;
      system: 'imperial';
      age: string;
      heightFt: string;
      heightIn: string;
      weightLb: string;
      activity: string;
      goalKey: string;
    };

export interface CalorieComputed extends CalorieResult {
  goalKey: string;
  goalLabel: string;
  goalAnnounce: string;
  goalNote: string;
  /** The selected goal's value — the dominant figure. */
  target: number;
}

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure) — mirrors BMR's accepted semantics      */
/* ------------------------------------------------------------------ */

type PositiveParse = 'empty' | 'nonpositive' | number;
function parsePositive(raw: string): PositiveParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'nonpositive';
  return n;
}

function validateImperialHeight(ftRaw: string, inRaw: string): string | null {
  switch (classifyImperialHeight(ftRaw, inRaw)) {
    case 'ok':
      return null;
    case 'empty':
      return 'Enter your height.';
    case 'inches-out-of-range':
      return 'Enter inches from 0 to 11.';
    case 'feet-not-integer':
      return 'Enter feet as a whole number.';
    case 'nonpositive':
      return 'Enter a height greater than zero.';
  }
}

/**
 * Validate calorie form values. Presence + positivity are explicit (never
 * `Number(value) || 0`). Activity and goal are `<select>`s that always hold a
 * valid option, so they are not validated. After the personal inputs pass, a
 * final sanity check rejects a non-usable selected target in plain language.
 */
export function validateCalorieValues(values: CalorieValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const age = parsePositive(values.age);
  if (age === 'empty') fieldErrors.age = 'Enter your age.';
  else if (age === 'nonpositive') fieldErrors.age = 'Enter an age greater than zero.';

  if (values.system === 'metric') {
    const h = parsePositive(values.heightCm);
    if (h === 'empty') fieldErrors.heightCm = 'Enter your height.';
    else if (h === 'nonpositive') fieldErrors.heightCm = 'Enter a height greater than zero.';
    const w = parsePositive(values.weightKg);
    if (w === 'empty') fieldErrors.weightKg = 'Enter your weight.';
    else if (w === 'nonpositive') fieldErrors.weightKg = 'Enter a weight greater than zero.';
  } else {
    const heightError = validateImperialHeight(values.heightFt, values.heightIn);
    if (heightError) fieldErrors.height = heightError;
    const w = parsePositive(values.weightLb);
    if (w === 'empty') fieldErrors.weightLb = 'Enter your weight.';
    else if (w === 'nonpositive') fieldErrors.weightLb = 'Enter a weight greater than zero.';
  }

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  // §7 sanity: the selected goal's target must be usable (finite, > 0). No clamp.
  if (!isUsableCalories(computeCalorie(values).target)) {
    return { ok: false, formError: CALORIE_SANITY_MESSAGE };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation + description (pure)                                    */
/* ------------------------------------------------------------------ */

function toInput(values: CalorieValues): CalorieInput {
  const age = Number(values.age);
  const activityRaw = Number(values.activity);
  const activity = Number.isFinite(activityRaw) && activityRaw > 0 ? activityRaw : DEFAULT_ACTIVITY;
  if (values.system === 'metric') {
    return {
      sex: values.sex,
      age,
      system: 'metric',
      heightCm: Number(values.heightCm),
      weightKg: Number(values.weightKg),
      activity,
    };
  }
  return {
    sex: values.sex,
    age,
    system: 'imperial',
    heightFt: Number(values.heightFt || 0),
    heightIn: Number(values.heightIn || 0),
    weightLb: Number(values.weightLb),
    activity,
  };
}

export function computeCalorie(values: CalorieValues): CalorieComputed {
  const base = calculateCalories(toInput(values));
  const goal = CALORIE_GOALS.find((g) => g.key === values.goalKey) ?? CALORIE_GOALS[0];
  return {
    ...base,
    goalKey: goal.key,
    goalLabel: goal.label,
    goalAnnounce: goal.announce,
    goalNote: goal.note,
    target: base[goal.field],
  };
}

/** Concise announcement — the selected daily target only, never the comparison. */
export function describeCalorieResult(result: CalorieComputed): string {
  return `Your estimated daily calorie target ${result.goalAnnounce} is ${formatCalories(
    result.target,
  )} kilocalories per day.`;
}

/* ------------------------------------------------------------------ */
/* Unit conversion (pure) — built on the shared body-measurement utils */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const select = (root: HTMLElement, name: string) => root.querySelector<HTMLSelectElement>(`[name="${name}"]`);
const numOrNull = (raw: string | undefined): number | null => {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const toField = (n: number | null): string => (n === null ? '' : String(n));
const readSex = (root: HTMLElement): Sex =>
  (root.querySelector<HTMLInputElement>('[name="sex"]:checked')?.value as Sex) ?? 'male';

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

export const calorieBinding: FormCalculatorBinding<CalorieValues, CalorieComputed> = {
  readValues(root) {
    const active = root.querySelector<HTMLElement>('[data-unit].is-active, [data-unit][aria-checked="true"]');
    const system = active?.dataset.unit === 'imperial' ? 'imperial' : 'metric';
    const sex = readSex(root);
    const age = input(root, 'age')?.value ?? '';
    const activity = select(root, 'activity')?.value ?? String(DEFAULT_ACTIVITY);
    const goalKey = select(root, 'goalKey')?.value ?? DEFAULT_GOAL_KEY;
    if (system === 'metric') {
      return {
        sex,
        system: 'metric',
        age,
        heightCm: input(root, 'heightCm')?.value ?? '',
        weightKg: input(root, 'weightKg')?.value ?? '',
        activity,
        goalKey,
      };
    }
    return {
      sex,
      system: 'imperial',
      age,
      heightFt: input(root, 'heightFt')?.value ?? '',
      heightIn: input(root, 'heightIn')?.value ?? '',
      weightLb: input(root, 'weightLb')?.value ?? '',
      activity,
      goalKey,
    };
  },

  validate: validateCalorieValues,

  compute: computeCalorie,

  resultValue(result) {
    return isUsableCalories(result.target) ? result.target : NaN;
  },

  describeResult: describeCalorieResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);

    // Primary: the selected goal's daily target (dominant).
    const target = formatCalories(result.target);
    const valueEl = q('[data-result-when~="valid"] [data-result-value]');
    const a11yEl = q('[data-result-when~="valid"] [data-result-value-a11y]');
    if (valueEl) valueEl.textContent = target;
    if (a11yEl) a11yEl.textContent = `${target} kilocalories per day`;

    // Selected goal label + concise interpretation.
    const labelEl = q('[data-cal-goal-label]');
    if (labelEl) labelEl.textContent = result.goalLabel;
    const noteEl = q('[data-cal-interpretation]');
    if (noteEl) noteEl.textContent = result.goalNote;

    // Secondary references: maintenance (TDEE) + BMR, accurately labelled.
    const maint = q('[data-cal-maintenance]');
    if (maint) maint.textContent = formatCalories(result.maintenance);
    const bmr = q('[data-cal-bmr]');
    if (bmr) bmr.textContent = formatCalories(result.bmr);

    // Goal comparison: fill each goal's value, mark the selected row (text
    // ownership, not colour / aria-current alone). A non-positive goal value is
    // shown as "Not available" (never a dash, zero or negative) with an accessible
    // explanation inside the same cell.
    scope.querySelectorAll<HTMLElement>('[data-cal-row]').forEach((row) => {
      const key = row.dataset.calRow;
      const goal = CALORIE_GOALS.find((g) => g.key === key);
      const valEl = row.querySelector<HTMLElement>('[data-cal-goalval]');
      const noteEl = row.querySelector<HTMLElement>('[data-cal-goalnote]');
      if (goal && valEl) {
        const v = result[goal.field];
        if (isUsableCalories(v)) {
          valEl.textContent = formatCalories(v);
          if (noteEl) noteEl.textContent = '';
        } else {
          valEl.textContent = 'Not available';
          if (noteEl) noteEl.textContent = ' This goal does not produce a usable positive calorie estimate for these inputs.';
        }
      }
      const own = row.querySelector<HTMLElement>('[data-cal-own]');
      if (key === result.goalKey) {
        row.setAttribute('aria-current', 'true');
        if (own) own.textContent = ' — your goal';
      } else {
        row.removeAttribute('aria-current');
        if (own) own.textContent = '';
      }
    });
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['age', 'heightCm', 'weightKg', 'heightFt', 'heightIn', 'weightLb']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
    const male = root.querySelector<HTMLInputElement>('[name="sex"][value="male"]');
    const female = root.querySelector<HTMLInputElement>('[name="sex"][value="female"]');
    if (male) male.checked = true;
    if (female) female.checked = false;
    // Restore the safe structural defaults the binding owns (the runtime restores
    // the default UNIT itself; activity + goal are not units).
    const act = select(root, 'activity');
    if (act) act.value = String(DEFAULT_ACTIVITY);
    const goal = select(root, 'goalKey');
    if (goal) goal.value = DEFAULT_GOAL_KEY;
  },

  convertValues(root, fromUnit, toUnit) {
    if (fromUnit === 'metric' && toUnit === 'imperial') {
      const cm = numOrNull(input(root, 'heightCm')?.value);
      const ft = input(root, 'heightFt');
      const inch = input(root, 'heightIn');
      if (cm !== null && cm > 0) {
        const { feet, inches } = totalInchesToFeetAndInches(centimetresToTotalInches(cm));
        if (ft) ft.value = String(feet);
        if (inch) inch.value = String(inches);
      } else {
        if (ft) ft.value = '';
        if (inch) inch.value = '';
      }
      const kg = numOrNull(input(root, 'weightKg')?.value);
      const lb = input(root, 'weightLb');
      if (lb) lb.value = kg !== null && kg > 0 ? toField(round1(kilogramsToPounds(kg))) : '';
    } else if (fromUnit === 'imperial' && toUnit === 'metric') {
      const ftNum = numOrNull(input(root, 'heightFt')?.value);
      const inNum = numOrNull(input(root, 'heightIn')?.value);
      const cmEl = input(root, 'heightCm');
      const total = (ftNum ?? 0) * 12 + (inNum ?? 0);
      if (cmEl) cmEl.value = total > 0 ? toField(round1(totalInchesToCentimetres(total))) : '';
      const lbNum = numOrNull(input(root, 'weightLb')?.value);
      const kgEl = input(root, 'weightKg');
      if (kgEl) kgEl.value = lbNum !== null && lbNum > 0 ? toField(round1(poundsToKilograms(lbNum))) : '';
    }
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
export const CALORIE_EXAMPLE_VALUES: CalorieValues = { sex: 'male', system: 'metric', age: '35', heightCm: '175', weightKg: '70', activity: '1.55', goalKey: 'maintain' };
