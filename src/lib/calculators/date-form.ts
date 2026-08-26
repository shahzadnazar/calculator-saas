/**
 * Date form binding (R18C2 — task-first Date migration; calculator-OWNED binding on the UNCHANGED
 * standard-form runtime).
 *
 * Date stays ONE public calculator route with two calculator-owned STRUCTURAL modes (a plain
 * `<select name="mode">` the runtime recomputes on, exactly like Area's shape selector — NOT a new
 * runtime mode):
 *   • DIFFERENCE — the calendar difference between two dates.
 *   • ADD / SUBTRACT — a date shifted by a whole number of days.
 *
 * It wraps the UNCHANGED date-duration primitives (diffDates / addDays / toISODateUTC), frozen by
 * date-duration.test.ts (which in turn delegates the difference breakdown to the R18C0-repaired
 * calculateAge), and the UNCHANGED parseISODateUTC. Everything here is at the VALIDATION /
 * PRESENTATION boundary; no date arithmetic is reimplemented and NOTHING is shared with
 * age-form / due-date-form / pregnancy-form beyond those frozen helpers (no generic date runtime,
 * no shared Age/Date binding, no civil-date form abstraction).
 *
 * Date semantics: every date field is a civil calendar date parsed STRICTLY as YYYY-MM-DD → UTC
 * midnight (all arithmetic UTC, DST-independent, time-of-day irrelevant). All task-specific fields
 * start EMPTY — the source used arbitrary fixed examples, never TODAY, so nothing prefills (SSR ==
 * hydrated empty) and the visitor presses Calculate for the first result (live-after-first).
 *
 * Product decisions (R18C2):
 *   • DIFFERENCE: both dates required + strict; the pair is order-INDEPENDENT (diffDates is), so a
 *     reverse pair is VALID and its direction ('after' | 'before' | 'same') is shown — never swapped,
 *     never an error. A same-date pair is a VALID 0y 0m 0d (finite 0 totalDays).
 *   • ADD / SUBTRACT: the source addDays takes a signed, Math.round-ed day count. The legacy public
 *     UI splits this into a structural Add/Subtract selector + a non-negative magnitude, so the
 *     binding requires a WHOLE, non-negative day count and applies the sign from the selector
 *     (0 is valid → the same date). Fractional / negative / non-finite magnitudes are field errors —
 *     never truncated, abs()'d or sign-flipped; the frozen source (which would round) is only ever
 *     fed whole integers. No arbitrary maximum — a count that overflows the Date is caught by the
 *     complete-result guard.
 *   • NO isUsableResult — each mode's complete-result guard lives in resultValue (a finite scalar:
 *     totalDays for DIFFERENCE, the result date's epoch-day for ADD/SUBTRACT), reconciling every
 *     displayed field via a source recompute. A same-date 0 and a 1970-01-01 epoch-day 0 are the
 *     finite 0s the runtime's default gate accepts.
 */
import { diffDates, addDays, toISODateUTC, type DateDiff } from './date-duration';
import { parseISODateUTC } from './age';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

const DAY_MS = 86_400_000;

export type DateMode = 'diff' | 'add';
export type AddOp = 'add' | 'sub';

export const DEFAULT_MODE: DateMode = 'diff';
export const DEFAULT_OP: AddOp = 'add';

export interface DateValues {
  mode: DateMode;
  // difference mode
  from: string;
  to: string;
  // add / subtract mode
  start: string;
  op: AddOp;
  days: string;
}

export interface DiffComputed {
  mode: 'diff';
  fromISO: string;
  toISO: string;
  diff: DateDiff;
}
export interface AddComputed {
  mode: 'add';
  startISO: string;
  op: AddOp;
  days: number; // normalized whole, non-negative magnitude
  signedDays: number; // magnitude with the operation's sign applied
  resultISO: string; // toISODateUTC(addDays(start, signedDays))
}
export type DateComputed = DiffComputed | AddComputed;

export const MSG = {
  fromRequired: 'Enter a start date.',
  fromInvalid: 'Enter a valid start date (YYYY-MM-DD).',
  toRequired: 'Enter an end date.',
  toInvalid: 'Enter a valid end date (YYYY-MM-DD).',
  startRequired: 'Enter a date.',
  startInvalid: 'Enter a valid date (YYYY-MM-DD).',
  daysRequired: 'Enter a number of days.',
  daysInvalid: 'Enter a whole number of days (zero or more).',
} as const;

/* ------------------------------------------------------------------ */
/* Strict parsing (pure)                                               */
/* ------------------------------------------------------------------ */

/**
 * A structurally valid civil calendar date: the raw string round-trips EXACTLY through the UNCHANGED
 * primitive (`toISODateUTC(parseISODateUTC(raw)) === raw`), so impossible / rolled-over /
 * non-canonical inputs (`2025-02-29`, `2024-13-01`, `2026-1-2`) are rejected WITHOUT touching the
 * parser (parseISODateUTC rolls impossible components over rather than returning null).
 */
export function isStrictCalendarDate(raw: string): boolean {
  const d = parseISODateUTC(raw);
  return !!d && Number.isFinite(d.getTime()) && toISODateUTC(d) === raw;
}

type WholeParse = 'empty' | 'invalid' | number;
/** A whole, non-negative day magnitude; empty is distinct from invalid. Zero is valid. Never
 *  parseInt / Number(v)||0 — a fractional, negative or non-finite entry is invalid. */
export function parseWholeNonNegative(raw: string): WholeParse {
  const t = (raw ?? '').trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return 'invalid';
  return n;
}

/* ------------------------------------------------------------------ */
/* Validation (pure) — mode-scoped                                     */
/* ------------------------------------------------------------------ */

function validateDiff(v: DateValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const from = (v.from ?? '').trim();
  const to = (v.to ?? '').trim();
  if (from === '') fieldErrors.from = MSG.fromRequired;
  else if (!isStrictCalendarDate(v.from)) fieldErrors.from = MSG.fromInvalid;
  if (to === '') fieldErrors.to = MSG.toRequired;
  else if (!isStrictCalendarDate(v.to)) fieldErrors.to = MSG.toInvalid;
  // No order constraint: diffDates is order-independent and reports direction. A reverse pair and a
  // same-date pair are both valid.
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

function validateAdd(v: DateValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const start = (v.start ?? '').trim();
  if (start === '') fieldErrors.start = MSG.startRequired;
  else if (!isStrictCalendarDate(v.start)) fieldErrors.start = MSG.startInvalid;
  const days = parseWholeNonNegative(v.days);
  if (days === 'empty') fieldErrors.days = MSG.daysRequired;
  else if (days === 'invalid') fieldErrors.days = MSG.daysInvalid;
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function validateDateValues(v: DateValues): ValidationResult {
  return v.mode === 'add' ? validateAdd(v) : validateDiff(v);
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — pass-through to the frozen source              */
/* ------------------------------------------------------------------ */

export function computeDate(v: DateValues): DateComputed {
  if (v.mode === 'add') {
    const start = parseISODateUTC(v.start) ?? new Date(Number.NaN);
    const magnitude = Number(v.days);
    const signedDays = v.op === 'sub' ? -magnitude : magnitude;
    const result = addDays(start, signedDays);
    return {
      mode: 'add',
      startISO: v.start,
      op: v.op,
      days: magnitude,
      signedDays,
      resultISO: toISODateUTC(result),
    };
  }
  const a = parseISODateUTC(v.from) ?? new Date(Number.NaN);
  const b = parseISODateUTC(v.to) ?? new Date(Number.NaN);
  return { mode: 'diff', fromISO: v.from, toISO: v.to, diff: diffDates(a, b) };
}

/* ------------------------------------------------------------------ */
/* Complete-result guards (pure) — the resultValue sentinels           */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN; // non-finite sentinel → the runtime's default finite gate rejects the result

/** DIFFERENCE: a finite totalDays, but ONLY when the whole DateDiff is coherent — strict dates, all
 *  components finite integers, breakdown non-negative with months < 12, a known direction, and a
 *  diffDates RECOMPUTE reproducing every field. A same-date 0 is a valid finite result. */
export function completeDiffValue(r: DiffComputed): number {
  const a = parseISODateUTC(r.fromISO);
  const b = parseISODateUTC(r.toISO);
  if (!a || !b) return FAIL;
  if (!isStrictCalendarDate(r.fromISO) || !isStrictCalendarDate(r.toISO)) return FAIL;

  const d = r.diff;
  const scalars = [d.totalDays, d.weeks, d.breakdown.years, d.breakdown.months, d.breakdown.days];
  if (!scalars.every((n) => Number.isInteger(n))) return FAIL;
  if (d.totalDays < 0 || d.weeks < 0) return FAIL;
  if (d.breakdown.years < 0 || d.breakdown.months < 0 || d.breakdown.days < 0) return FAIL;
  if (d.breakdown.months > 11) return FAIL;
  if (d.direction !== 'after' && d.direction !== 'before' && d.direction !== 'same') return FAIL;

  const c = diffDates(a, b);
  if (
    c.totalDays !== d.totalDays ||
    c.weeks !== d.weeks ||
    c.breakdown.years !== d.breakdown.years ||
    c.breakdown.months !== d.breakdown.months ||
    c.breakdown.days !== d.breakdown.days ||
    c.direction !== d.direction
  ) {
    return FAIL;
  }
  return d.totalDays; // finite; 0 (same date) is a valid result the default gate accepts
}

/** ADD / SUBTRACT: the result date's epoch-day, but ONLY when everything is coherent — a strict
 *  start date, a whole non-negative magnitude, the sign matching the operation, a VALID result Date
 *  (a huge count that overflows the Date is rejected here), and the formatted result reconciling
 *  with an addDays recompute. The epoch-day may be negative (pre-1970) or 0 (1970-01-01); both are
 *  finite results the default gate accepts. */
export function completeAddValue(r: AddComputed): number {
  const start = parseISODateUTC(r.startISO);
  if (!start) return FAIL;
  if (!isStrictCalendarDate(r.startISO)) return FAIL;
  if (!Number.isInteger(r.days) || r.days < 0) return FAIL;
  if (r.op !== 'add' && r.op !== 'sub') return FAIL;
  const signed = r.op === 'sub' ? -r.days : r.days;
  if (signed !== r.signedDays) return FAIL;

  const result = addDays(start, signed);
  const t = result.getTime();
  if (!Number.isFinite(t)) return FAIL; // overflow → Invalid Date
  if (toISODateUTC(result) !== r.resultISO) return FAIL; // display integrity
  return Math.round(t / DAY_MS);
}

export function completeDateValue(r: DateComputed): number {
  return r.mode === 'add' ? completeAddValue(r) : completeDiffValue(r);
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;
const withCommas = (n: number): string => n.toLocaleString('en-US');

/** The dominant difference phrase, e.g. "2 years, 3 months, 4 days". */
export function diffPhrase(d: DateDiff): string {
  return `${plural(d.breakdown.years, 'year')}, ${plural(d.breakdown.months, 'month')}, ${plural(d.breakdown.days, 'day')}`;
}

/** A civil date in long form with weekday, e.g. "Sunday, March 31, 2024". UTC (no TZ drift). */
export function longDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** A civil date without weekday, e.g. "March 31, 2024" — used in the concise announcement. */
export function spokenDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** The DIFFERENCE direction/context sentence (supporting; distinct from the total-day count). */
export function interpretDiff(r: DiffComputed): string {
  const from = longDate(r.fromISO);
  const to = longDate(r.toISO);
  const phrase = diffPhrase(r.diff);
  if (r.diff.direction === 'same') return `${from} and ${to} are the same day.`;
  const rel = r.diff.direction === 'after' ? 'after' : 'before';
  return `${to} is ${phrase} ${rel} ${from} — ${withCommas(r.diff.totalDays)} days in total.`;
}

/** The ADD/SUBTRACT context sentence (original date + operation + magnitude). */
export function interpretAdd(r: AddComputed): string {
  const verb = r.op === 'sub' ? 'Subtracting' : 'Adding';
  const prep = r.op === 'sub' ? 'from' : 'to';
  return `${verb} ${plural(r.days, 'day')} ${prep} ${longDate(r.startISO)} gives ${longDate(r.resultISO)}.`;
}

/** Concise, mode-specific announcement — the dominant result only (§15). */
export function describeDateResult(r: DateComputed): string {
  if (r.mode === 'add') return `Resulting date: ${spokenDate(r.resultISO)}.`;
  return `Date difference: ${diffPhrase(r.diff)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

const readMode = (root: HTMLElement): DateMode =>
  control(root, 'mode')?.value === 'add' ? 'add' : 'diff';
const readOp = (root: HTMLElement): AddOp =>
  control(root, 'op')?.value === 'sub' ? 'sub' : 'add';

export const dateBinding: FormCalculatorBinding<DateValues, DateComputed> = {
  readValues(root) {
    return {
      mode: readMode(root),
      from: control(root, 'from')?.value ?? '',
      to: control(root, 'to')?.value ?? '',
      start: control(root, 'start')?.value ?? '',
      op: readOp(root),
      days: control(root, 'days')?.value ?? '',
    };
  },

  validate: validateDateValues,

  compute: computeDate,

  /** Complete-result guard as the ordinary result value — a finite scalar per mode; no isUsableResult. */
  resultValue: completeDateValue,

  describeResult: describeDateResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    const showPanel = (mode: DateMode) => {
      scope.querySelectorAll<HTMLElement>('[data-dc-panel]').forEach((p) => {
        p.hidden = p.dataset.dcPanel !== mode;
      });
    };
    showPanel(result.mode);

    if (result.mode === 'add') {
      const dominant = longDate(result.resultISO);
      set('[data-dc-panel="add"] [data-result-value]', dominant);
      set('[data-dc-panel="add"] [data-result-value-a11y]', spokenDate(result.resultISO));
      set('[data-dc-add-interpretation]', interpretAdd(result));
      return;
    }
    const phrase = diffPhrase(result.diff);
    set('[data-dc-panel="diff"] [data-result-value]', phrase);
    set('[data-dc-panel="diff"] [data-result-value-a11y]', phrase);
    set('[data-dc-total-days]', withCommas(result.diff.totalDays));
    set('[data-dc-total-weeks]', withCommas(result.diff.weeks));
    set('[data-dc-diff-interpretation]', interpretDiff(result));
  },

  resetValues(root, _mode: ResetMode) {
    // Restore the default mode + operation; clear every task field across BOTH modes so switching
    // modes after a reset never restores stale values. The island re-syncs panel visibility.
    const modeSel = control(root, 'mode');
    if (modeSel) modeSel.value = DEFAULT_MODE;
    const opSel = control(root, 'op');
    if (opSel) opSel.value = DEFAULT_OP;
    for (const name of ['from', 'to', 'start', 'days']) {
      const el = control(root, name);
      if (el) el.value = '';
    }
  },
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * Example inputs for the labelled worked result shown on first load.
 *
 * A FUNCTION, not a constant, because this calculator's example is relative to
 * today — a hardcoded date would silently go stale in the built markup. Called
 * by the island at mount, exactly like the client-today defaults the date
 * calculators already use.
 *
 * These values are OURS, not the visitor's: the runtime computes them and calls
 * this binding's own `renderResult`, so the example reuses the calculator's real
 * result markup. The visitor's fields are never written to.
 */
export function dateExampleValues(): DateValues {
  const today = new Date();
  const later = new Date(today);
  later.setDate(later.getDate() + 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { mode: 'diff', from: iso(today), to: iso(later), start: iso(today), op: 'add', days: '30' };
}
