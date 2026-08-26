/**
 * Pace form binding (R7C-2E1 — standard-form wave, calculator #12).
 *
 * The runtime (@lib/result/form-runtime) is used UNCHANGED. Pace is SINGLE-MODE
 * (distance + elapsed time → pace, speed and equivalent finish times); there is no
 * solve-for-time / solve-for-distance mode. This binding owns the pace specifics:
 * reading a distance + its unit + a composite h:m:s elapsed time, validating them,
 * converting the entered distance when the unit changes, calling the reviewed pure
 * `computePace` / `predictTime`, and rendering the SELECTED-UNIT pace as the dominant
 * result with secondary conversions + equivalent finish times.
 *
 * The pure module is UNCHANGED and frozen by the characterization suite
 * (pace.test.ts). Everything added here is at the VALIDATION / PRESENTATION boundary:
 *   - distance required, finite, > 0;
 *   - h/m/s optional only when empty; if entered, whole and in range (h ≥ 0, m/s
 *     0–59 — 60 is NOT normalised, it is a field error); total elapsed time > 0;
 *   - the distance-unit toggle CONVERTS the entered value (km ↔ mi via KM_PER_MI),
 *     it does not reinterpret the same number as a different physical distance.
 */
import {
  computePace,
  predictTime,
  formatDuration,
  RACE_DISTANCES,
  type PaceResult,
  type DistanceUnit,
} from './pace';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** Miles → kilometres. Mirrors the (unexported) constant in the reviewed pace.ts so
 *  the conversion factor is identical; a fixed physical constant, never re-tuned. */
const KM_PER_MI = 1.609344;

export interface PaceValues {
  distance: string;
  unit: DistanceUnit;
  h: string;
  m: string;
  s: string;
}

export interface PaceComputed extends PaceResult {
  /** The selected distance unit — drives which pace is dominant. */
  unit: DistanceUnit;
  distance: number;
  timeSeconds: number;
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

type ComponentParse = 'empty' | 'invalid' | number;
/** A whole time component in [min, max]; empty is distinct from an invalid entry. */
function parseComponent(raw: string, min: number, max: number): ComponentParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return 'invalid';
  return n;
}

const componentValue = (p: ComponentParse): number => (typeof p === 'number' ? p : 0);

/**
 * Validate pace values. Distance is required + positive. h/m/s are optional only when
 * empty; if entered they must be whole and in range (60 is NOT normalised — it is a
 * field error). Total elapsed time must be > 0. Never `Number(value) || 0`.
 */
export function validatePaceValues(values: PaceValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const distance = parsePositive(values.distance);
  if (distance === 'empty') fieldErrors.distance = 'Enter a distance.';
  else if (distance === 'nonpositive') fieldErrors.distance = 'Enter a distance greater than zero.';

  const h = parseComponent(values.h, 0, Number.MAX_SAFE_INTEGER);
  if (h === 'invalid') fieldErrors.h = 'Enter whole hours (0 or more).';
  const m = parseComponent(values.m, 0, 59);
  if (m === 'invalid') fieldErrors.m = 'Enter whole minutes from 0 to 59.';
  const s = parseComponent(values.s, 0, 59);
  if (s === 'invalid') fieldErrors.s = 'Enter whole seconds from 0 to 59.';

  // Total-time check only once each component is individually valid (or empty).
  if (h !== 'invalid' && m !== 'invalid' && s !== 'invalid') {
    const total = componentValue(h) * 3600 + componentValue(m) * 60 + componentValue(s);
    if (total <= 0) fieldErrors.time = 'Enter an elapsed time greater than zero.';
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/** A usable pace: every metric finite and strictly positive. */
export function isUsablePace(r: PaceResult): boolean {
  return [r.secPerKm, r.secPerMi, r.kmh, r.mph].every((v) => Number.isFinite(v) && v > 0);
}

/* ------------------------------------------------------------------ */
/* Computation + description (pure)                                    */
/* ------------------------------------------------------------------ */

export function computePaceForm(values: PaceValues): PaceComputed {
  const distance = Number(values.distance);
  const h = values.h.trim() === '' ? 0 : Number(values.h);
  const m = values.m.trim() === '' ? 0 : Number(values.m);
  const s = values.s.trim() === '' ? 0 : Number(values.s);
  const timeSeconds = h * 3600 + m * 60 + s;
  const base = computePace({ distance, unit: values.unit, timeSeconds });
  return { ...base, unit: values.unit, distance, timeSeconds };
}

const unitWord = (u: DistanceUnit): string => (u === 'mi' ? 'mile' : 'kilometre');
const unitShort = (u: DistanceUnit): string => (u === 'mi' ? '/mi' : '/km');
/** The seconds of the dominant (selected-unit) pace. */
const dominantSeconds = (r: PaceComputed): number => (r.unit === 'mi' ? r.secPerMi : r.secPerKm);

/** A pace in spoken form, e.g. "5 minutes", "8 minutes and 3 seconds". */
export function spokenPace(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (mins > 0) parts.push(`${mins} minute${mins === 1 ? '' : 's'}`);
  if (secs > 0) parts.push(`${secs} second${secs === 1 ? '' : 's'}`);
  if (parts.length === 0) return '0 seconds';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Concise announcement — the dominant selected-unit pace only. */
export function describePaceResult(result: PaceComputed): string {
  return `Your pace is ${spokenPace(dominantSeconds(result))} per ${unitWord(result.unit)}.`;
}

/* ------------------------------------------------------------------ */
/* Distance-unit conversion (pure)                                     */
/* ------------------------------------------------------------------ */

/** Round to 3 dp (stable km↔mi round trip) and drop trailing zeros for display. */
const toDistanceField = (n: number): string => String(Math.round(n * 1000) / 1000);

/** Convert a distance value between units. Returns null to leave the field untouched
 *  (empty / non-positive / same unit). */
export function convertDistance(value: number | null, from: DistanceUnit, to: DistanceUnit): string | null {
  if (value === null || value <= 0 || from === to) return null;
  if (from === 'km' && to === 'mi') return toDistanceField(value / KM_PER_MI);
  if (from === 'mi' && to === 'km') return toDistanceField(value * KM_PER_MI);
  return null;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const numOrNull = (raw: string | undefined): number | null => {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export const paceBinding: FormCalculatorBinding<PaceValues, PaceComputed> = {
  readValues(root) {
    const active = root.querySelector<HTMLElement>('[data-unit].is-active, [data-unit][aria-checked="true"]');
    const unit: DistanceUnit = active?.dataset.unit === 'mi' ? 'mi' : 'km';
    return {
      distance: input(root, 'distance')?.value ?? '',
      unit,
      h: input(root, 'h')?.value ?? '',
      m: input(root, 'm')?.value ?? '',
      s: input(root, 's')?.value ?? '',
    };
  },

  validate: validatePaceValues,

  compute: computePaceForm,

  /** Guarded primary magnitude — the pace per km (finite, > 0 when usable). */
  resultValue(result) {
    return isUsablePace(result) ? result.secPerKm : NaN;
  },

  describeResult: describePaceResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const unit = result.unit;
    const dominant = dominantSeconds(result);
    const other = unit === 'mi' ? result.secPerKm : result.secPerMi;

    // Primary: the selected-unit pace (dominant).
    const valueEl = q('[data-result-when~="valid"] [data-result-value]');
    const unitEl = q('[data-result-when~="valid"] [data-result-unit]');
    const a11yEl = q('[data-result-when~="valid"] [data-result-value-a11y]');
    if (valueEl) valueEl.textContent = formatDuration(dominant);
    if (unitEl) unitEl.textContent = unitShort(unit);
    if (a11yEl) a11yEl.textContent = `${spokenPace(dominant)} per ${unitWord(unit)}`;

    const interp = q('[data-pc-interpretation]');
    if (interp) interp.textContent = `That's ${spokenPace(dominant)} per ${unitWord(unit)}.`;

    // Secondary: the other-unit pace + both speeds (subordinate to the dominant pace).
    const opLabel = q('[data-pc-otherpace-label]');
    if (opLabel) opLabel.textContent = unit === 'mi' ? 'Pace per kilometre' : 'Pace per mile';
    const op = q('[data-pc-otherpace]');
    if (op) op.textContent = `${formatDuration(other)} ${unit === 'mi' ? '/km' : '/mi'}`;

    const kmh = `${result.kmh.toFixed(1)} km/h`;
    const mph = `${result.mph.toFixed(1)} mph`;
    const setSpeed = (n: number, label: string, value: string) => {
      const l = q(`[data-pc-speed${n}-label]`);
      const v = q(`[data-pc-speed${n}]`);
      if (l) l.textContent = label;
      if (v) v.textContent = value;
    };
    if (unit === 'mi') {
      setSpeed(1, 'Speed (mph)', mph);
      setSpeed(2, 'Speed (km/h)', kmh);
    } else {
      setSpeed(1, 'Speed (km/h)', kmh);
      setSpeed(2, 'Speed (mph)', mph);
    }

    // Equivalent finish times (absolute — from pace per km, independent of unit).
    RACE_DISTANCES.forEach((race, i) => {
      const cell = scope.querySelector<HTMLElement>(`[data-pc-race="${i}"] [data-pc-race-time]`);
      if (cell) cell.textContent = formatDuration(predictTime(result.secPerKm, race.km));
    });
  },

  resetValues(root, _mode: ResetMode) {
    // The runtime restores the default unit (km); Pace holds no module state.
    for (const name of ['distance', 'h', 'm', 's']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },

  convertValues(root, fromUnit, toUnit) {
    const distEl = input(root, 'distance');
    if (!distEl) return;
    const converted = convertDistance(numOrNull(distEl.value), fromUnit as DistanceUnit, toUnit as DistanceUnit);
    if (converted !== null) distEl.value = converted; // empty / non-positive left untouched
  },
};

export { RACE_DISTANCES };

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
export const PACE_EXAMPLE_VALUES: PaceValues = { distance: '10', unit: 'km', h: '0', m: '55', s: '0' };
