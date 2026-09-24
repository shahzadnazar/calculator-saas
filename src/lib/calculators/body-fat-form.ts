/**
 * Body fat form binding — the reference's full report and its unit tabs, on the UNCHANGED
 * standard-form runtime.
 *
 * TWO unit systems, each with its own boxes:
 *   • US Units     — pounds, and feet + inches for every length, as the reference does.
 *   • Metric Units — kilograms and centimetres.
 *
 * The reference's third tab, "Other Units", is NOT a third system: it opens a unit converter
 * above the calculator so you can turn whatever your scales read into one of these two. That
 * lives in the island and reuses the site's own conversion engine.
 *
 * Everything is converted to metric and handed to `bodyFatReport` (body-fat.ts); the
 * result is converted back for display. Nothing here re-implements a formula.
 *
 * Product decisions:
 *   • Measurements start EMPTY. Sex and unit system are structural choices with defaults.
 *   • The hip box exists only for women, because only the female formula uses it, and it is
 *     cleared on the way out so invisible state can never reach a result.
 *   • The dominant figure is the Navy percentage; the seven-row table is the breakdown.
 *   • No isUsableResult: the complete-result guard is `resultValue`.
 */
import {
  CATEGORY_BANDS,
  bodyFatReport,
  type BodyFatCategory,
  type BodyFatReport,
  type Sex,
} from './body-fat';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export { CATEGORY_BANDS } from './body-fat';

/** The two unit systems the boxes can be in, named as the reference names them. */
export type UnitTab = 'us' | 'metric';
export const UNIT_TABS: { value: UnitTab; label: string }[] = [
  { value: 'us', label: 'US Units' },
  { value: 'metric', label: 'Metric Units' },
];
const VALID_TABS = new Set<UnitTab>(UNIT_TABS.map((t) => t.value));

export const CM_PER_IN = 2.54;
export const KG_PER_LB = 0.45359237;
export const LB_PER_STONE = 14;

export const MSG = {
  age: 'Enter an age between 2 and 120.',
  weight: 'Enter a weight greater than zero.',
  height: 'Enter a height greater than zero.',
  neck: 'Enter a neck measurement greater than zero.',
  waist: 'Enter a waist measurement greater than zero.',
  hip: 'Enter a hip measurement greater than zero.',
  impossible:
    'Those measurements do not give a body fat percentage. Check the waist and neck — the waist must be the larger of the two.',
} as const;

export interface BodyFatValues {
  unitTab: UnitTab;
  sex: Sex;
  age: string;
  /** US: pounds. Metric: kilograms. Other: stones (+ weightLb for the pounds part). */
  weight: string;
  weightLb: string;
  /** US: feet (+ heightIn). Metric: cm. Other: metres. */
  height: string;
  heightIn: string;
  /** US: feet (+ neckIn). Metric: cm. Other: inches. */
  neck: string;
  neckIn: string;
  waist: string;
  waistIn: string;
  hip: string;
  hipIn: string;
}

export interface BodyFatComputed extends BodyFatReport {
  unitTab: UnitTab;
  sex: Sex;
  age: number;
  weightKg: number;
}

/* ------------------------------------------------------------------ */
/* Parsing — strict, never Number(v) || 0                              */
/* ------------------------------------------------------------------ */

type Parsed = 'empty' | 'invalid' | number;

function parsePositive(raw: string): Parsed {
  const t = (raw ?? '').trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

/** The second box of a feet+inches or stones+pounds pair. Blank counts as zero. */
function parsePart(raw: string): Parsed {
  const t = (raw ?? '').trim();
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

export function parseAge(raw: string): Parsed {
  const t = (raw ?? '').trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 2 || n > 120) return 'invalid';
  return n;
}

/** True when the tab pairs each length with a second box (feet + inches). */
export function usesPairs(tab: UnitTab): boolean {
  return tab === 'us';
}

/** True when the tab needs a hip measurement, which only the female formula uses. */
export function needsHip(sex: Sex): boolean {
  return sex === 'female';
}

/* ------------------------------------------------------------------ */
/* Conversion into metric                                              */
/* ------------------------------------------------------------------ */

/** A length in the tab's units, as centimetres. */
export function toCm(tab: UnitTab, main: number, part: number): number {
  return tab === 'us' ? (main * 12 + part) * CM_PER_IN : main;
}

/** A height in the tab's units, as centimetres. */
export function heightToCm(tab: UnitTab, main: number, part: number): number {
  return toCm(tab, main, part);
}

/** A weight in the tab's units, as kilograms. */
export function weightToKg(tab: UnitTab, main: number, _part: number): number {
  return tab === 'us' ? main * KG_PER_LB : main;
}

/* ------------------------------------------------------------------ */
/* Converting between the three tabs                                   */
/* ------------------------------------------------------------------ */

const round = (n: number, dp: number) => String(Number(n.toFixed(dp)));

/** Split a total into a whole main part and a remainder, e.g. inches into feet + inches. */
function split(total: number, per: number, dp: number): [string, string] {
  const main = Math.floor(total / per);
  const part = total - main * per;
  return [String(main), round(part, dp)];
}

/** A length in centimetres, written the way the target tab wants it. */
export function cmToTab(tab: UnitTab, cm: number, _isHeight: boolean): [string, string] {
  if (!Number.isFinite(cm) || cm <= 0) return ['', ''];
  if (tab === 'metric') return [round(cm, 1), ''];
  return split(cm / CM_PER_IN, 12, 1); // US: feet + inches
}

/** A weight in kilograms, written the way the target tab wants it. */
export function kgToTab(tab: UnitTab, kg: number): [string, string] {
  if (!Number.isFinite(kg) || kg <= 0) return ['', ''];
  return tab === 'metric' ? [round(kg, 1), ''] : [round(kg / KG_PER_LB, 1), ''];
}

/**
 * Rewrite the measurements from one tab's units into another's.
 *
 * Switching tabs converts rather than clearing, because the visitor measured a body, not a
 * number — the tape does not change when the label above the box does. Anything blank stays
 * blank, so a half-filled form is not silently completed with zeros.
 */
export function convertMeasurements(v: BodyFatValues, from: UnitTab, to: UnitTab): BodyFatValues {
  if (from === to) return { ...v };
  const next: BodyFatValues = { ...v, unitTab: to };

  const lengths: [keyof BodyFatValues, keyof BodyFatValues, boolean][] = [
    ['height', 'heightIn', true],
    ['neck', 'neckIn', false],
    ['waist', 'waistIn', false],
    ['hip', 'hipIn', false],
  ];
  for (const [mainKey, partKey, isHeight] of lengths) {
    const main = String(v[mainKey] ?? '').trim();
    const part = String(v[partKey] ?? '').trim();
    if (main === '' && part === '') continue;
    const mainNum = Number(main === '' ? 0 : main);
    const partNum = Number(part === '' ? 0 : part);
    if (!Number.isFinite(mainNum) || !Number.isFinite(partNum)) continue;
    const cm = isHeight ? heightToCm(from, mainNum, partNum) : toCm(from, mainNum, partNum);
    const [a, b] = cmToTab(to, cm, isHeight);
    (next[mainKey] as string) = a;
    (next[partKey] as string) = b;
  }

  const w = String(v.weight ?? '').trim();
  const wp = String(v.weightLb ?? '').trim();
  if (w !== '' || wp !== '') {
    const mainNum = Number(w === '' ? 0 : w);
    const partNum = Number(wp === '' ? 0 : wp);
    if (Number.isFinite(mainNum) && Number.isFinite(partNum)) {
      const [a, b] = kgToTab(to, weightToKg(from, mainNum, partNum));
      next.weight = a;
      next.weightLb = b;
    }
  }

  return next;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * True when this tab writes this measurement across TWO boxes — feet and inches on the US
 * tab, stones and pounds for weight on the Other tab. On a paired field a main box of zero
 * is perfectly ordinary ("0 feet 19.5 inches"), which is why it cannot be validated with the
 * same "greater than zero" rule as a single box.
 */
export function isPaired(tab: UnitTab, name: string): boolean {
  return tab === 'us' && name !== 'weight';
}

/** Whether a measurement's boxes hold something usable. */
function checkMeasurement(tab: UnitTab, name: string, main: string, part: string): 'ok' | 'empty' | 'invalid' {
  if (isPaired(tab, name)) {
    const a = parsePart(main);
    const b = parsePart(part);
    if (a === 'invalid' || b === 'invalid') return 'invalid';
    if (main.trim() === '' && part.trim() === '') return 'empty';
    return (a as number) + (b as number) > 0 ? 'ok' : 'invalid';
  }
  const a = parsePositive(main);
  if (a === 'empty') return 'empty';
  if (a === 'invalid') return 'invalid';
  return 'ok';
}

export function validateBodyFatValues(v: BodyFatValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const tab = VALID_TABS.has(v.unitTab) ? v.unitTab : 'us';

  const age = parseAge(v.age);
  if (age === 'empty' || age === 'invalid') fieldErrors.age = MSG.age;

  const fields: [string, string, string, string][] = [
    ['weight', v.weight, v.weightLb, MSG.weight],
    ['height', v.height, v.heightIn, MSG.height],
    ['neck', v.neck, v.neckIn, MSG.neck],
    ['waist', v.waist, v.waistIn, MSG.waist],
  ];
  if (needsHip(v.sex)) fields.push(['hip', v.hip, v.hipIn, MSG.hip]);

  for (const [name, main, part, message] of fields) {
    if (checkMeasurement(tab, name, main ?? '', part ?? '') !== 'ok') fieldErrors[name] = message;
  }

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  // Only worth asking once every measurement is real.
  if (computeBodyFat(v).unsolvable) return { ok: false, fieldErrors, formError: MSG.impossible };

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

const numeric = (p: Parsed): number => (typeof p === 'number' ? p : Number.NaN);

export function computeBodyFat(v: BodyFatValues): BodyFatComputed {
  const tab = VALID_TABS.has(v.unitTab) ? v.unitTab : 'us';
  const age = numeric(parseAge(v.age));
  const weightKg = weightToKg(tab, numeric(parsePositive(v.weight)) || 0, numeric(parsePart(v.weightLb)) || 0);
  const heightCm = heightToCm(tab, numeric(parsePositive(v.height)) || 0, numeric(parsePart(v.heightIn)) || 0);
  const neckCm = toCm(tab, numeric(parsePositive(v.neck)) || 0, numeric(parsePart(v.neckIn)) || 0);
  const waistCm = toCm(tab, numeric(parsePositive(v.waist)) || 0, numeric(parsePart(v.waistIn)) || 0);
  const hipCm = needsHip(v.sex)
    ? toCm(tab, numeric(parsePositive(v.hip)) || 0, numeric(parsePart(v.hipIn)) || 0)
    : undefined;

  const report = bodyFatReport({ sex: v.sex, age, weightKg, heightCm, neckCm, waistCm, hipCm });
  return { ...report, unitTab: tab, sex: v.sex, age, weightKg };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN;

/**
 * The Navy percentage — but only when the whole report holds up. Seven figures go on
 * screen; one of them being NaN behind a plausible headline is what this stops.
 */
export function completeBodyFatValue(r: BodyFatComputed): number {
  if (r.unsolvable) return FAIL;
  const all = [r.bodyFatPct, r.fatMassKg, r.leanMassKg, r.bmi, r.bmiBodyFatPct, r.idealPct, r.fatToLoseKg];
  if (!all.every((n) => Number.isFinite(n))) return FAIL;
  if (r.bodyFatPct <= 0 || r.bodyFatPct >= 100) return FAIL;
  if (r.fatMassKg < 0 || r.leanMassKg < 0) return FAIL;
  if (Math.abs(r.fatMassKg + r.leanMassKg - r.weightKg) > 1e-6) return FAIL;
  return r.bodyFatPct;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

/** Masses are shown in the units the visitor is working in. */
export function massUnit(tab: UnitTab): 'kg' | 'lbs' {
  return tab === 'metric' ? 'kg' : 'lbs';
}

export function formatMass(kg: number, tab: UnitTab): string {
  if (!Number.isFinite(kg)) return '—';
  const value = tab === 'metric' ? kg : kg / KG_PER_LB;
  return `${(Math.round(value * 10) / 10).toFixed(1)} ${massUnit(tab)}`;
}

export function formatPct(value: number): string {
  return Number.isFinite(value) ? `${(Math.round(value * 10) / 10).toFixed(1)}%` : '—';
}

/** Where the pointer sits on the gauge, as a percentage of its width. */
export function gaugePosition(sex: Sex, bodyFatPct: number): number {
  const { edges } = CATEGORY_BANDS[sex];
  const min = 0;
  const max = edges[edges.length - 1] * 1.6; // room past the obese edge for the pointer
  if (!Number.isFinite(bodyFatPct)) return 0;
  return Math.min(100, Math.max(0, ((bodyFatPct - min) / (max - min)) * 100));
}

export function describeBodyFatResult(r: BodyFatComputed): string {
  return `Body fat ${formatPct(r.bodyFatPct)}, in the ${r.category} range.`;
}

export function interpretBodyFat(r: BodyFatComputed): string {
  const gap = r.bodyFatPct - r.idealPct;
  const standing =
    Math.abs(gap) < 0.05
      ? `exactly the ${formatPct(r.idealPct)} typical for ${r.age}`
      : gap > 0
        ? `${formatPct(Math.abs(gap))} above the ${formatPct(r.idealPct)} typical for ${r.age}`
        : `${formatPct(Math.abs(gap))} below the ${formatPct(r.idealPct)} typical for ${r.age}`;
  return `${formatPct(r.bodyFatPct)} puts you in the ${r.category} range — ${standing}. That is ${formatMass(r.fatMassKg, r.unitTab)} of fat and ${formatMass(r.leanMassKg, r.unitTab)} of lean mass.`;
}

/** The seven rows the reference prints, in its order. */
export interface ReportRow {
  key: string;
  label: string;
  value: (r: BodyFatComputed) => string;
}

export const REPORT_ROWS: ReportRow[] = [
  { key: 'navy', label: 'Body Fat (U.S. Navy Method)', value: (r) => formatPct(r.bodyFatPct) },
  { key: 'category', label: 'Body Fat Category', value: (r) => r.category },
  { key: 'fatMass', label: 'Body Fat Mass', value: (r) => formatMass(r.fatMassKg, r.unitTab) },
  { key: 'leanMass', label: 'Lean Body Mass', value: (r) => formatMass(r.leanMassKg, r.unitTab) },
  { key: 'ideal', label: 'Ideal Body Fat for Given Age (Jackson & Pollock)', value: (r) => formatPct(r.idealPct) },
  { key: 'toLose', label: 'Body Fat to Lose to Reach Ideal', value: (r) => formatMass(r.fatToLoseKg, r.unitTab) },
  { key: 'bmi', label: 'Body Fat (BMI method)', value: (r) => formatPct(r.bmiBodyFatPct) },
];

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
const readValue = (root: HTMLElement, name: string): string => control(root, name)?.value ?? '';
const readChecked = (root: HTMLElement, name: string, fallback: string): string =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value ?? fallback;

export const bodyFatBinding: FormCalculatorBinding<BodyFatValues, BodyFatComputed> = {
  readValues(root) {
    const tab = readChecked(root, 'unitTab', 'us') as UnitTab;
    const sex = readChecked(root, 'sex', 'male') as Sex;
    return {
      unitTab: VALID_TABS.has(tab) ? tab : 'us',
      sex: sex === 'female' ? 'female' : 'male',
      age: readValue(root, 'age'),
      weight: readValue(root, 'weight'),
      weightLb: readValue(root, 'weightLb'),
      height: readValue(root, 'height'),
      heightIn: readValue(root, 'heightIn'),
      neck: readValue(root, 'neck'),
      neckIn: readValue(root, 'neckIn'),
      waist: readValue(root, 'waist'),
      waistIn: readValue(root, 'waistIn'),
      hip: readValue(root, 'hip'),
      hipIn: readValue(root, 'hipIn'),
    };
  },

  validate: validateBodyFatValues,

  compute: computeBodyFat,

  resultValue: completeBodyFatValue,

  describeResult: describeBodyFatResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    set('[data-result-when~="valid"] [data-result-value]', formatPct(result.bodyFatPct));
    set('[data-result-when~="valid"] [data-result-value-a11y]', describeBodyFatResult(result));
    set('[data-bf-interpretation]', interpretBodyFat(result));
    for (const row of REPORT_ROWS) set(`[data-bf-row="${row.key}"]`, row.value(result));

    // The gauge: move the pointer and say where it landed in words as well as position.
    // BOTH gauges are updated — one per sex, only one shown — because updating just the
    // first would leave a woman's pointer frozen wherever it happened to be.
    scope.querySelectorAll<HTMLElement>('[data-gauge-for]').forEach((figure) => {
      const sex = figure.dataset.gaugeFor === 'female' ? 'female' : 'male';
      const pointer = figure.querySelector<HTMLElement>('[data-bf-pointer]');
      if (pointer) {
        pointer.style.left = `${gaugePosition(sex, result.bodyFatPct)}%`;
        pointer.textContent = formatPct(result.bodyFatPct);
      }
      const track = figure.querySelector<HTMLElement>('.bf-gauge__track');
      if (track) {
        track.setAttribute('aria-valuenow', String(Math.round(result.bodyFatPct * 10) / 10));
        track.setAttribute('aria-valuetext', `${formatPct(result.bodyFatPct)}, ${result.category}`);
      }
    });
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['age', 'weight', 'weightLb', 'height', 'heightIn', 'neck', 'neckIn', 'waist', 'waistIn', 'hip', 'hipIn']) {
      const el = control(root, name);
      if (el) el.value = '';
    }
    const male = root.querySelector<HTMLInputElement>('[name="sex"][value="male"]');
    if (male) male.checked = true;
    const us = root.querySelector<HTMLInputElement>('[name="unitTab"][value="us"]');
    if (us) us.checked = true;
  },
};

/** The reference's own metric worked case, so the panel opens on figures anyone can check. */
export const BODY_FAT_EXAMPLE_VALUES: BodyFatValues = {
  unitTab: 'metric',
  sex: 'male',
  age: '25',
  weight: '70',
  weightLb: '',
  height: '178',
  heightIn: '',
  neck: '50',
  neckIn: '',
  waist: '96',
  waistIn: '',
  hip: '',
  hipIn: '',
};

export type { BodyFatCategory };
