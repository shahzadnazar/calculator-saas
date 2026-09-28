/**
 * Ideal-weight form binding — the reference's fields and its result table, on the
 * UNCHANGED standard-form runtime.
 *
 * The reference asks four things: age, gender and height, under a US / Metric unit tab.
 * Its result is one table — Robinson, Miller, Devine, Hamwi and a healthy BMI range — and
 * we render exactly those five rows. What we add on top is our own hierarchy: the spread
 * across the four formulas is the dominant number, because a page called "ideal weight"
 * should answer with an ideal weight, and four values within a few pounds of each other
 * read as one band rather than four competing answers.
 *
 * Age changes no number. It decides whether the adult formulas APPLY: they were derived on
 * adults, so below 18 they are the wrong instrument and the honest result says so and
 * points at BMI-for-age instead. That is a VALID informational result, not an input error
 * (doctrine 8) — the visitor asked a sensible question and gets a true answer.
 *
 * All arithmetic delegates to the reviewed pure `calculateIdealWeight`; conversion and
 * imperial-height classification reuse the shared `@lib/health/body-measurements`
 * primitives; field-error MESSAGES stay here per the R7B.1 policy.
 */
import {
  calculateIdealWeight,
  ADULT_MIN_AGE,
  AGE_MIN,
  AGE_MAX,
  HEALTHY_BMI_MIN,
  HEALTHY_BMI_MAX,
  type IdealWeightResult,
  type Sex,
  type UnitSystem,
} from './ideal-weight';
import {
  round1,
  centimetresToTotalInches,
  totalInchesToCentimetres,
  totalInchesToFeetAndInches,
  classifyImperialHeight,
} from '@lib/health/body-measurements';
import { accessibleUnit } from '@lib/result/state';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ResultDescriptionContext,
  ValidationResult,
} from '@lib/result/form-runtime';

export { ADULT_MIN_AGE, AGE_MIN, AGE_MAX, HEALTHY_BMI_MIN, HEALTHY_BMI_MAX };

/** The two real unit systems. "Other Units" is the shared converter, not a system. */
export const UNIT_TABS: { value: UnitSystem; label: string }[] = [
  { value: 'imperial', label: 'US Units' },
  { value: 'metric', label: 'Metric Units' },
];

export interface IdealWeightValues {
  system: UnitSystem;
  sex: Sex;
  age: string;
  heightCm: string;
  heightFt: string;
  heightIn: string;
}

export const MSG = {
  ageMissing: 'Enter an age.',
  ageWhole: 'Enter an age in whole years.',
  ageRange: `Enter an age from ${AGE_MIN} to ${AGE_MAX}.`,
  heightMissing: 'Enter your height.',
  heightPositive: 'Enter a height greater than zero.',
  heightInches: 'Enter inches from 0 to 11.',
  heightFeetWhole: 'Enter feet as a whole number.',
} as const;

/* ---- parsing + validation (pure) ---------------------------------------- */

type PositiveParse = 'empty' | 'nonpositive' | number;
function parsePositive(raw: string): PositiveParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'nonpositive';
  return n;
}

/** Age is only ever a whole number of years, and only inside the accepted span. */
export function ageError(raw: string): string | null {
  const t = raw.trim();
  if (t === '') return MSG.ageMissing;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return MSG.ageWhole;
  if (n < AGE_MIN || n > AGE_MAX) return MSG.ageRange;
  return null;
}

function validateImperialHeight(ftRaw: string, inRaw: string): string | null {
  switch (classifyImperialHeight(ftRaw, inRaw)) {
    case 'ok':
      return null;
    case 'empty':
      return MSG.heightMissing;
    case 'inches-out-of-range':
      return MSG.heightInches;
    case 'feet-not-integer':
      return MSG.heightFeetWhole;
    case 'nonpositive':
      return MSG.heightPositive;
  }
}

export function validateIdealWeightValues(values: IdealWeightValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const age = ageError(values.age);
  if (age) fieldErrors.age = age;

  if (values.system === 'metric') {
    const h = parsePositive(values.heightCm);
    if (h === 'empty') fieldErrors.heightCm = MSG.heightMissing;
    else if (h === 'nonpositive') fieldErrors.heightCm = MSG.heightPositive;
  } else {
    const heightError = validateImperialHeight(values.heightFt, values.heightIn);
    if (heightError) fieldErrors.height = heightError;
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ---- computation (pure) -------------------------------------------------- */

function toInput(values: IdealWeightValues) {
  if (values.system === 'metric') {
    return { sex: values.sex, system: 'metric' as const, heightCm: Number(values.heightCm) };
  }
  return {
    sex: values.sex,
    system: 'imperial' as const,
    heightFt: Number(values.heightFt || 0),
    heightIn: Number(values.heightIn || 0),
  };
}

export interface IdealWeightComputed extends IdealWeightResult {
  sex: Sex;
  system: UnitSystem;
  age: number;
  /** Whether the four adult formulas apply at all. */
  adult: boolean;
}

export function computeIdealWeight(values: IdealWeightValues): IdealWeightComputed {
  const ageRaw = values.age.trim();
  const age = ageRaw === '' ? Number.NaN : Number(ageRaw);
  return {
    ...calculateIdealWeight(toInput(values)),
    sex: values.sex,
    system: values.system,
    age,
    adult: Number.isFinite(age) && age >= ADULT_MIN_AGE,
  };
}

/**
 * The finiteness sentinel the runtime gates the whole result on.
 *
 * For an adult it is finite only when EVERY displayed figure reconciles, so a partial
 * table can never reach the panel. For a child it is the age itself: the informational
 * answer is a real result and must not be suppressed.
 */
export function completeIdealWeightValue(r: IdealWeightComputed): number {
  if (!Number.isFinite(r.age)) return Number.NaN;
  if (!r.adult) return r.age;
  for (const v of [r.robinson, r.miller, r.devine, r.hamwi, r.bmiMin, r.bmiMax]) {
    if (!Number.isFinite(v) || v <= 0) return Number.NaN;
  }
  return r.bmiMin;
}

/* ---- presentation (pure) ------------------------------------------------- */

/**
 * One decimal, always — the reference prints "155.0 lbs" and "81.0 kg", so a value that
 * happens to land on a whole number must not silently lose its decimal place and read as
 * a different precision from the row above it.
 */
function fixed1(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/** The unit as the reference writes it: "lbs" or "kg". */
export function displayUnit(system: UnitSystem): 'lbs' | 'kg' {
  return system === 'imperial' ? 'lbs' : 'kg';
}

export function formatWeight(value: number, system: UnitSystem): string {
  return Number.isFinite(value) ? `${fixed1(value)} ${displayUnit(system)}` : '—';
}

export interface FormulaRow {
  key: 'robinson' | 'miller' | 'devine' | 'hamwi';
  label: string;
}

/** The reference's four named formulas, in its order. */
export const FORMULA_ROWS: FormulaRow[] = [
  { key: 'robinson', label: 'Robinson (1983)' },
  { key: 'miller', label: 'Miller (1983)' },
  { key: 'devine', label: 'Devine (1974)' },
  { key: 'hamwi', label: 'Hamwi (1964)' },
];

/** The lowest and highest of the four formula estimates — our dominant number. */
export function formulaSpread(r: IdealWeightComputed): { low: number; high: number } {
  const vals = [r.robinson, r.miller, r.devine, r.hamwi];
  return { low: Math.min(...vals), high: Math.max(...vals) };
}

/** "128.9 - 174.2 lbs", as the reference writes the range row. */
export function formatRange(low: number, high: number, system: UnitSystem): string {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return '—';
  return `${fixed1(low)} - ${fixed1(high)} ${displayUnit(system)}`;
}

/* ---- announcement (pure) ------------------------------------------------- */

function spreadSpeech(r: IdealWeightComputed): string {
  const { low, high } = formulaSpread(r);
  return `${fixed1(low)} to ${fixed1(high)} ${accessibleUnit(r.unit)}`;
}

/**
 * One restrained announcement.
 *
 * Adults hear the formula spread. A sex change moves every formula but can leave the
 * SPOKEN text identical when the numbers round the same way, so the second shape names the
 * sex — otherwise the runtime's deduping announcer would leave a visible update silent.
 * Children hear why the formulas do not apply, which is the whole result for them.
 */
export function idealWeightAnnouncement(
  result: IdealWeightComputed,
  previous: { low: number; high: number } | null,
): string {
  if (!result.adult) {
    return `Ideal-weight formulas apply from age ${ADULT_MIN_AGE}. At ${result.age}, healthy weight is judged from BMI-for-age percentiles instead.`;
  }
  const spread = spreadSpeech(result);
  const { low, high } = formulaSpread(result);
  const unchanged =
    previous !== null &&
    fixed1(previous.low) === fixed1(low) &&
    fixed1(previous.high) === fixed1(high);
  if (unchanged) {
    return `Ideal weight: ${spread}. Estimates updated for ${result.sex}.`;
  }
  return `Your ideal weight is approximately ${spread}.`;
}

/* ---- height conversion (pure) -------------------------------------------- */

/** Metric cm → imperial feet/inches (null if empty/non-positive). */
export function metricHeightToImperial(heightCm: number | null): { heightFt: number | null; heightIn: number | null } {
  if (heightCm === null || heightCm <= 0) return { heightFt: null, heightIn: null };
  const { feet, inches } = totalInchesToFeetAndInches(centimetresToTotalInches(heightCm));
  return { heightFt: feet, heightIn: inches };
}
/** Imperial feet/inches → metric cm (null if both empty / non-positive total). */
export function imperialHeightToMetric(heightFt: number | null, heightIn: number | null): number | null {
  if (heightFt === null && heightIn === null) return null;
  const total = (heightFt ?? 0) * 12 + (heightIn ?? 0);
  return total > 0 ? round1(totalInchesToCentimetres(total)) : null;
}

/* ---- DOM helpers --------------------------------------------------------- */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const readValue = (root: HTMLElement, name: string) => input(root, name)?.value ?? '';
const numOrNull = (raw: string | undefined): number | null => {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const toField = (n: number | null): string => (n === null ? '' : String(n));

/* ---- the binding --------------------------------------------------------- */

export const idealWeightBinding: FormCalculatorBinding<IdealWeightValues, IdealWeightComputed> = {
  readValues(root) {
    const active = root.querySelector<HTMLElement>('[data-unit].is-active, [data-unit][aria-checked="true"]');
    const system: UnitSystem = active?.dataset.unit === 'metric' ? 'metric' : 'imperial';
    const sex = (root.querySelector<HTMLInputElement>('[name="sex"]:checked')?.value as Sex) ?? 'male';
    return {
      system,
      sex: sex === 'female' ? 'female' : 'male',
      age: readValue(root, 'age'),
      heightCm: readValue(root, 'heightCm'),
      heightFt: readValue(root, 'heightFt'),
      heightIn: readValue(root, 'heightIn'),
    };
  },

  validate: validateIdealWeightValues,

  compute: computeIdealWeight,

  resultValue: completeIdealWeightValue,

  describeResult(result, context: ResultDescriptionContext<IdealWeightComputed>) {
    const previous = context.previousResult ? formulaSpread(context.previousResult) : null;
    return idealWeightAnnouncement(result, previous);
  },

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const set = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };

    // Adults get the table; children get the reason it does not apply. Exactly one shows.
    const adultBlock = q('[data-iw-adult]');
    const childBlock = q('[data-iw-child]');
    if (adultBlock) adultBlock.hidden = !result.adult;
    if (childBlock) childBlock.hidden = result.adult;

    if (!result.adult) {
      set('[data-iw-age-echo]', Number.isFinite(result.age) ? String(result.age) : '—');
      return;
    }

    // Dominant: the band the four formulas agree on.
    const { low, high } = formulaSpread(result);
    set('[data-iw-low]', fixed1(low));
    set('[data-iw-high]', fixed1(high));
    set('[data-iw-unit]', displayUnit(result.system));
    set('[data-iw-spread-a11y]', spreadSpeech(result));

    // The reference's table, row for row.
    for (const row of FORMULA_ROWS) set(`[data-iw-row="${row.key}"]`, formatWeight(result[row.key], result.system));
    set('[data-iw-bmirange]', formatRange(result.bmiMin, result.bmiMax, result.system));
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['age', 'heightCm', 'heightFt', 'heightIn']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
    const male = root.querySelector<HTMLInputElement>('[name="sex"][value="male"]');
    const female = root.querySelector<HTMLInputElement>('[name="sex"][value="female"]');
    if (male) male.checked = true;
    if (female) female.checked = false;
    // The unit tab is a preference, not a value, so Reset leaves it where the visitor put it.
    // The runtime's per-instance tracker forgets the previous result, so the next
    // calculation announces as a first result — no module state to clear here.
  },

  convertValues(root, fromUnit, toUnit) {
    if (fromUnit === 'metric' && toUnit === 'imperial') {
      const imp = metricHeightToImperial(numOrNull(input(root, 'heightCm')?.value));
      const ft = input(root, 'heightFt');
      const inch = input(root, 'heightIn');
      if (ft) ft.value = toField(imp.heightFt);
      if (inch) inch.value = toField(imp.heightIn);
    } else if (fromUnit === 'imperial' && toUnit === 'metric') {
      const cm = imperialHeightToMetric(numOrNull(input(root, 'heightFt')?.value), numOrNull(input(root, 'heightIn')?.value));
      const cmEl = input(root, 'heightCm');
      if (cmEl) cmEl.value = toField(cm);
    }
  },
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * Example inputs for the labelled worked result shown on first load — the reference's own
 * published case (a 25-year-old man of 5 ft 10 in), so the example and the reference agree
 * figure for figure. It is deliberately in the system the tabs OPEN on, so the worked
 * result never reads in kilograms under a tab that says US Units. These are OURS, not the
 * visitor's: the shared runtime computes them through this binding's own `renderResult`,
 * and the visitor's fields stay empty behind it.
 */
export const IDEAL_WEIGHT_EXAMPLE_VALUES: IdealWeightValues = {
  system: 'imperial',
  sex: 'male',
  age: '25',
  heightCm: '',
  heightFt: '5',
  heightIn: '10',
};
