/**
 * Result state machine (R1) — pure, framework-agnostic, side-effect-free.
 *
 * Two INDEPENDENT axes: content (`ResultState`) and transient activity
 * (`ResultActivity`). There are no permanent `reset`/`updated`/`completed`/
 * `loading-complete` states — reset returns to `empty`, a finished calculation
 * returns to `idle`, and `just-updated` is transient. Illegal transitions are
 * protected (they no-op).
 *
 * This module owns only the state logic + text helpers (value sanitization,
 * accessible unit labels, announcement generation). It renders nothing and
 * never touches the DOM.
 */

export type ResultState = 'empty' | 'example' | 'valid' | 'invalid';
export type ResultActivity = 'idle' | 'calculating' | 'just-updated';

export interface ResultStatus {
  readonly state: ResultState;
  readonly activity: ResultActivity;
}

export const INITIAL_STATUS: ResultStatus = { state: 'empty', activity: 'idle' };

export type ResultEvent =
  | { type: 'calculate'; valid: boolean } // explicit primary action
  | { type: 'liveUpdate'; valid: boolean; perceptible?: boolean } // input change after first valid
  | { type: 'computed' } // async/perceptible compute finished: calculating -> just-updated
  | { type: 'settle' } // transient activity -> idle
  | { type: 'reset' } // -> empty / idle
  | { type: 'showExample' }; // -> example / idle

/**
 * Pure reducer. Given the current status and an event, returns the next status.
 * Unknown or illegal events return the SAME status object's value (no throw), so
 * a controller can never drive the machine into an inconsistent state.
 */
export function reduceResult(status: ResultStatus, event: ResultEvent): ResultStatus {
  switch (event.type) {
    case 'reset':
      return { state: 'empty', activity: 'idle' };

    case 'showExample':
      return { state: 'example', activity: 'idle' };

    case 'calculate':
      return event.valid
        ? { state: 'valid', activity: 'just-updated' }
        : { state: 'invalid', activity: 'idle' };

    case 'liveUpdate':
      // Only meaningful once a valid result already exists (after the first
      // successful calculation). Otherwise ignore — protection.
      if (status.state !== 'valid') return status;
      if (!event.valid) return { state: 'invalid', activity: 'idle' };
      return { state: 'valid', activity: event.perceptible ? 'calculating' : 'just-updated' };

    case 'computed':
      // Perceptible compute finished. Only advances from 'calculating'.
      return status.activity === 'calculating'
        ? { state: status.state, activity: 'just-updated' }
        : status;

    case 'settle':
      // Any transient activity settles to idle; state is preserved.
      return status.activity === 'idle' ? status : { state: status.state, activity: 'idle' };

    default:
      return status;
  }
}

/** True while a transient activity is in progress. */
export function isTransient(status: ResultStatus): boolean {
  return status.activity !== 'idle';
}

/* ------------------------------------------------------------------ */
/* Value sanitization                                                  */
/* ------------------------------------------------------------------ */

/** Non-finite guard: returns null (never NaN/Infinity) so the UI can show a dash. */
export function sanitizeResultNumber(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

/**
 * Presentation guard for a display value. `null`/`undefined`/non-finite become
 * the dash; a number is stringified only if finite; a string is passed through
 * (the caller is responsible for its own numeric formatting via @lib/format).
 */
export function presentResultValue(
  value: number | string | null | undefined,
  dash = '—',
): string {
  if (value === null || value === undefined) return dash;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : dash;
  return value;
}

/* ------------------------------------------------------------------ */
/* Accessible units + result name                                      */
/* ------------------------------------------------------------------ */

const UNIT_SPEECH: Readonly<Record<string, string>> = {
  '%': 'percent',
  'kg/m²': 'kilograms per square metre',
  'kg/m2': 'kilograms per square metre',
  kg: 'kilograms',
  g: 'grams',
  lb: 'pounds',
  lbs: 'pounds',
  cm: 'centimetres',
  mm: 'millimetres',
  m: 'metres',
  km: 'kilometres',
  ft: 'feet',
  in: 'inches',
  mi: 'miles',
  yd: 'yards',
  'ft²': 'square feet',
  'm²': 'square metres',
  'm³': 'cubic metres',
  'yd³': 'cubic yards',
  bpm: 'beats per minute',
  kcal: 'kilocalories',
  cal: 'calories',
  hr: 'hours',
  hrs: 'hours',
  min: 'minutes',
  sec: 'seconds',
  '/mo': 'per month',
  '/yr': 'per year',
  $: 'dollars',
};

/** Spoken form of a unit; unknown units are returned unchanged (still spoken). */
export function accessibleUnit(unit: string): string {
  const key = unit.trim();
  return UNIT_SPEECH[key] ?? UNIT_SPEECH[key.toLowerCase()] ?? key;
}

/** Combined accessible name for a result, e.g. "22.4 kilograms per square metre". */
export function accessibleResultName(valueText: string, unit?: string): string {
  const v = valueText.trim();
  return unit ? `${v} ${accessibleUnit(unit)}` : v;
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

export interface AnnouncePayload {
  /** Accessible result name to announce for a completed valid result. */
  valueLabel?: string;
  /** Message to announce for an invalid result. */
  errorLabel?: string;
}

/**
 * The single announcement string for a status, or null for silence. Announce
 * ONLY: a completed valid result (state valid + activity just-updated) and
 * errors (state invalid). Empty, example, calculating and valid/idle are silent
 * — so screen readers are not spammed on every keystroke or animation frame.
 */
export function resultAnnouncement(status: ResultStatus, payload: AnnouncePayload = {}): string | null {
  if (status.state === 'invalid') return payload.errorLabel ?? 'The values entered are not valid.';
  if (status.state === 'valid' && status.activity === 'just-updated') return payload.valueLabel ?? null;
  return null;
}
