/**
 * Pace form binding — the reference's three-way solver, on the UNCHANGED standard-form
 * runtime.
 *
 * The reference asks for Time, Distance and Pace and works out whichever one you leave to
 * it. That is one form with three targets, not three calculators: the visitor says what they
 * want by choosing "Calculate", and the box being solved for goes read-only so it cannot be
 * both an input and an output at once.
 *
 * All arithmetic is in the reviewed pure `pace.ts`. Field-error MESSAGES stay here per the
 * R7B.1 policy.
 */
import {
  solvePace,
  equivalentTimes,
  toSeconds,
  fromSeconds,
  formatDuration,
  lengthUnit,
  LENGTH_UNITS,
  RACE_DISTANCES,
  EQUIVALENT_DISTANCES,
  DEFAULT_DISTANCE_UNIT,
  DEFAULT_PACE_UNIT,
  type PaceSolveFor,
  type PaceSolveResult,
} from './pace';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export {
  LENGTH_UNITS,
  RACE_DISTANCES,
  EQUIVALENT_DISTANCES,
  DEFAULT_DISTANCE_UNIT,
  DEFAULT_PACE_UNIT,
  formatDuration,
  lengthUnit,
};
export type { PaceSolveFor };

/** The three things the form can work out, in the order it offers them. */
export const SOLVE_TARGETS: { value: PaceSolveFor; label: string; field: string }[] = [
  { value: 'pace', label: 'Pace', field: 'pace' },
  { value: 'time', label: 'Time', field: 'time' },
  { value: 'distance', label: 'Distance', field: 'distance' },
];

export interface PaceValues {
  solveFor: PaceSolveFor;
  /* Time — h : m : s */
  h: string;
  m: string;
  s: string;
  /* Distance */
  distance: string;
  distanceUnit: string;
  /* Pace — mm : ss per unit */
  paceMin: string;
  paceSec: string;
  paceUnit: string;
}

export const MSG = {
  timeMissing: 'Enter a time.',
  timeParts: 'Enter hours, minutes and seconds as whole numbers.',
  timeMinutes: 'Enter minutes from 0 to 59.',
  timeSeconds: 'Enter seconds from 0 to 59.',
  timeZero: 'Enter a time greater than zero.',
  distanceMissing: 'Enter a distance.',
  distancePositive: 'Enter a distance greater than zero.',
  paceMissing: 'Enter a pace.',
  paceParts: 'Enter pace minutes and seconds as whole numbers.',
  paceSeconds: 'Enter pace seconds from 0 to 59.',
  paceZero: 'Enter a pace greater than zero.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing (pure)                                                      */
/* ------------------------------------------------------------------ */

type Part = 'empty' | 'invalid' | number;

/** A whole, non-negative component; an empty box is distinct from a bad one. */
function parsePart(raw: string, max?: number): Part {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return 'invalid';
  if (max !== undefined && n > max) return 'invalid';
  return n;
}

/** The time boxes as one duration, or why they are not one. */
export function parseTime(values: Pick<PaceValues, 'h' | 'm' | 's'>): { seconds: number } | { error: string } {
  const h = parsePart(values.h);
  const m = parsePart(values.m, 59);
  const s = parsePart(values.s, 59);
  if (h === 'empty' && m === 'empty' && s === 'empty') return { error: MSG.timeMissing };
  if (h === 'invalid') return { error: MSG.timeParts };
  if (m === 'invalid') return { error: MSG.timeMinutes };
  if (s === 'invalid') return { error: MSG.timeSeconds };
  const total = toSeconds(h === 'empty' ? 0 : h, m === 'empty' ? 0 : m, s === 'empty' ? 0 : s);
  return total > 0 ? { seconds: total } : { error: MSG.timeZero };
}

/** The pace boxes as seconds per unit, or why they are not. */
export function parsePace(values: Pick<PaceValues, 'paceMin' | 'paceSec'>): { seconds: number } | { error: string } {
  const min = parsePart(values.paceMin);
  const sec = parsePart(values.paceSec, 59);
  if (min === 'empty' && sec === 'empty') return { error: MSG.paceMissing };
  if (min === 'invalid') return { error: MSG.paceParts };
  if (sec === 'invalid') return { error: MSG.paceSeconds };
  const total = (min === 'empty' ? 0 : min) * 60 + (sec === 'empty' ? 0 : sec);
  return total > 0 ? { seconds: total } : { error: MSG.paceZero };
}

export function parseDistance(raw: string): { value: number } | { error: string } {
  const t = raw.trim();
  if (t === '') return { error: MSG.distanceMissing };
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return { error: MSG.distancePositive };
  return { value: n };
}

/* ------------------------------------------------------------------ */
/* Validation (pure)                                                   */
/* ------------------------------------------------------------------ */

/**
 * Only the two boxes the solver READS are required.
 *
 * The third is the answer, so demanding it would be asking the visitor for the thing they
 * came here to be told.
 */
export function validatePaceValues(values: PaceValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  if (values.solveFor !== 'time') {
    const t = parseTime(values);
    if ('error' in t) fieldErrors.time = t.error;
  }
  if (values.solveFor !== 'distance') {
    const d = parseDistance(values.distance);
    if ('error' in d) fieldErrors.distance = d.error;
  }
  if (values.solveFor !== 'pace') {
    const p = parsePace(values);
    if ('error' in p) fieldErrors.pace = p.error;
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export interface PaceComputed extends PaceSolveResult {
  solveFor: PaceSolveFor;
  distanceUnit: string;
  paceUnit: string;
}

export function computePaceValues(values: PaceValues): PaceComputed {
  const t = parseTime(values);
  const d = parseDistance(values.distance);
  const p = parsePace(values);
  const solved = solvePace({
    solveFor: values.solveFor,
    timeSeconds: 'seconds' in t ? t.seconds : undefined,
    distance: 'value' in d ? d.value : undefined,
    distanceUnit: values.distanceUnit,
    paceSeconds: 'seconds' in p ? p.seconds : undefined,
    paceUnit: values.paceUnit,
  });
  return { ...solved, solveFor: values.solveFor, distanceUnit: values.distanceUnit, paceUnit: values.paceUnit };
}

/**
 * The finiteness sentinel: finite only when all three of time, distance and pace came out,
 * so a half-solved row can never reach the panel.
 */
export function completePaceValue(result: PaceComputed): number {
  for (const v of [result.timeSeconds, result.distance, result.paceSeconds, result.kmh, result.mph]) {
    if (!Number.isFinite(v) || v <= 0) return Number.NaN;
  }
  return result.paceSeconds;
}

/** The distance as the box would write it — trimmed, never in exponent notation. */
export function formatDistance(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  const rounded = Math.round(value * 100) / 100;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(rounded);
}

/** The dominant figure, whichever the visitor asked for. */
export function headlineValue(result: PaceComputed): string {
  if (result.solveFor === 'time') return formatDuration(result.timeSeconds);
  if (result.solveFor === 'distance') return formatDistance(result.distance);
  return formatDuration(result.paceSeconds);
}

export function headlineUnit(result: PaceComputed): string {
  if (result.solveFor === 'time') return '';
  if (result.solveFor === 'distance') return lengthUnit(result.distanceUnit)?.label ?? '';
  return `per ${lengthUnit(result.paceUnit)?.paceLabel ?? ''}`;
}

export function headlineLabel(result: PaceComputed): string {
  return SOLVE_TARGETS.find((t) => t.value === result.solveFor)?.label ?? 'Pace';
}

/** Concise accessible announcement — the solved figure only, never the whole table. */
export function describePaceResult(result: PaceComputed): string {
  if (result.solveFor === 'time') {
    return `That distance at that pace takes ${formatDuration(result.timeSeconds)}.`;
  }
  if (result.solveFor === 'distance') {
    return `At that pace you cover ${formatDistance(result.distance)} ${lengthUnit(result.distanceUnit)?.label ?? ''}.`;
  }
  return `Your pace is ${formatDuration(result.paceSeconds)} per ${lengthUnit(result.paceUnit)?.paceLabel ?? ''}.`;
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
const readValue = (root: HTMLElement, name: string) => field(root, name)?.value ?? '';
const readChecked = (root: HTMLElement, name: string, fallback: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value ?? fallback;

const VALID_TARGETS = new Set<string>(SOLVE_TARGETS.map((t) => t.value));
const VALID_UNITS = new Set<string>(LENGTH_UNITS.map((u) => u.key));

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

export const paceBinding: FormCalculatorBinding<PaceValues, PaceComputed> = {
  readValues(root) {
    const solveFor = readChecked(root, 'solveFor', 'pace');
    const distanceUnit = readValue(root, 'distanceUnit');
    const paceUnit = readValue(root, 'paceUnit');
    return {
      solveFor: (VALID_TARGETS.has(solveFor) ? solveFor : 'pace') as PaceSolveFor,
      h: readValue(root, 'h'),
      m: readValue(root, 'm'),
      s: readValue(root, 's'),
      distance: readValue(root, 'distance'),
      distanceUnit: VALID_UNITS.has(distanceUnit) ? distanceUnit : DEFAULT_DISTANCE_UNIT,
      paceMin: readValue(root, 'paceMin'),
      paceSec: readValue(root, 'paceSec'),
      paceUnit: VALID_UNITS.has(paceUnit) ? paceUnit : DEFAULT_PACE_UNIT,
    };
  },

  validate: validatePaceValues,

  compute: computePaceValues,

  resultValue: completePaceValue,

  describeResult: describePaceResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };

    set('[data-pace-label]', headlineLabel(result));
    set('[data-pace-value]', headlineValue(result));
    set('[data-pace-unit]', headlineUnit(result));
    set('[data-pace-a11y]', describePaceResult(result));

    // All three, so the two that were entered are echoed beside the one that was worked out.
    set('[data-pace-time]', formatDuration(result.timeSeconds));
    set(
      '[data-pace-distance]',
      `${formatDistance(result.distance)} ${lengthUnit(result.distanceUnit)?.label ?? ''}`,
    );
    set(
      '[data-pace-pace]',
      `${formatDuration(result.paceSeconds)} per ${lengthUnit(result.paceUnit)?.paceLabel ?? ''}`,
    );

    set('[data-pace-permi]', `${formatDuration(result.secPerMi)} / mile`);
    set('[data-pace-perkm]', `${formatDuration(result.secPerKm)} / km`);
    set('[data-pace-mph]', `${result.mph.toFixed(2)} mph`);
    set('[data-pace-kmh]', `${result.kmh.toFixed(2)} km/h`);

    for (const row of equivalentTimes(result)) {
      set(`[data-equiv="${row.race.key}"]`, formatDuration(row.seconds));
    }
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['h', 'm', 's', 'distance', 'paceMin', 'paceSec']) {
      const el = field(root, name);
      if (el) el.value = '';
    }
    const dUnit = field(root, 'distanceUnit');
    if (dUnit) dUnit.value = DEFAULT_DISTANCE_UNIT;
    const pUnit = field(root, 'paceUnit');
    if (pUnit) pUnit.value = DEFAULT_PACE_UNIT;
    root.querySelectorAll<HTMLInputElement>('[name="solveFor"]').forEach((el) => {
      el.checked = el.value === 'pace';
    });
  },
};

/** Fill the solved box back into the form, so the visitor can carry it into the next sum. */
export function writeSolvedField(root: HTMLElement, result: PaceComputed): void {
  const set = (name: string, value: string) => {
    const el = field(root, name);
    if (el) el.value = value;
  };
  if (result.solveFor === 'time') {
    const { h, m, s } = fromSeconds(result.timeSeconds);
    set('h', String(h));
    set('m', String(m));
    set('s', String(s));
  } else if (result.solveFor === 'distance') {
    set('distance', String(Math.round(result.distance * 100) / 100));
  } else {
    const { h, m, s } = fromSeconds(result.paceSeconds);
    set('paceMin', String(h * 60 + m));
    set('paceSec', String(s));
  }
}

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/** A 10K in 50 minutes — a round, recognisable run, not anybody's real one. */
export const PACE_EXAMPLE_VALUES: PaceValues = {
  solveFor: 'pace',
  h: '0',
  m: '50',
  s: '0',
  distance: '10',
  distanceUnit: 'km',
  paceMin: '',
  paceSec: '',
  paceUnit: 'km',
};
