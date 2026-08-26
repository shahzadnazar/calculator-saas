/**
 * Age form binding (R18C1 — task-first Age migration; own binding on the UNCHANGED standard-form
 * runtime).
 *
 * Wraps the UNCHANGED calculateAge (frozen by age.test.ts, INCLUDING the R18C0 month-end repair —
 * 2020-01-31 → 2020-03-01 = 0y 1m 1d) and the UNCHANGED parseISODateUTC / toISODateUTC primitives.
 * Everything here is at the VALIDATION / PRESENTATION boundary; the pure formula is untouched, and
 * NOTHING is shared with due-date-form / date-duration beyond those frozen helpers — there is no
 * shared Age/Date binding and no civil-date form abstraction.
 *
 * Date semantics: both the date of birth and the "age at" date are civil calendar dates parsed
 * strictly as YYYY-MM-DD → UTC midnight; all arithmetic is UTC (DST-independent, time-of-day
 * irrelevant). The "age at" date defaults to the visitor's LOCAL today (client-derived on
 * hydration — the legacy island treated an empty as-of as today); the binding treats it as an
 * ordinary editable date input.
 *
 * Product decisions (R18C1):
 *   • Task-first: DOB starts EMPTY, "age at" defaults to today (island-set on hydration), the
 *     result is empty, and the visitor presses "Calculate Age" for the first result
 *     (live-after-first thereafter).
 *   • Strict civil-date validation: DOB + as-of each required and a valid calendar date — an
 *     impossible date (2025-02-29, 2024-13-01) is rejected via an EXACT round-trip through the
 *     unchanged primitive, never silently rolled over. DOB must be ON OR BEFORE the as-of date (a
 *     later birth is a visitor error on the DOB field, never swapped). Same-date is VALID (0y 0m 0d).
 *   • NO isUsableResult — the complete-result guard lives in resultValue (a finite totalDays
 *     sentinel), reconciling every displayed field via a calculateAge recompute; a same-date zero
 *     age is a finite 0 the default gate accepts.
 */
import { calculateAge, parseISODateUTC, type AgeResult } from './age';
import { toISODateUTC } from './date-duration';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export interface AgeValues {
  dob: string;
  at: string;
}

export interface AgeComputed extends AgeResult {
  dobISO: string;
  atISO: string;
}

export const MSG = {
  dobRequired: 'Enter a date of birth.',
  dobInvalid: 'Enter a valid date of birth (YYYY-MM-DD).',
  atRequired: 'Enter the date to calculate the age at.',
  atInvalid: 'Enter a valid date (YYYY-MM-DD).',
  order: 'Date of birth must be on or before the “age at” date.',
} as const;

/** The visitor's LOCAL calendar Y/M/D, pinned to UTC midnight, as ISO. Client-derived at read time. */
export function todayISO(): string {
  const d = new Date();
  return toISODateUTC(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}

/**
 * A structurally valid civil calendar date: the raw string round-trips EXACTLY through the
 * UNCHANGED primitive (`toISODateUTC(parseISODateUTC(raw)) === raw`), so impossible / rolled-over /
 * non-canonical inputs (`2025-02-29`, `2024-13-01`, `2026-1-2`) are rejected WITHOUT touching the
 * parser (the primitive stays exactly as characterized in age.test.ts).
 */
export function isStrictCalendarDate(raw: string): boolean {
  const d = parseISODateUTC(raw);
  return !!d && Number.isFinite(d.getTime()) && toISODateUTC(d) === raw;
}

export function validateAgeValues(v: AgeValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const dobRaw = (v.dob ?? '').trim();
  const atRaw = (v.at ?? '').trim();

  if (dobRaw === '') fieldErrors.dob = MSG.dobRequired;
  else if (!isStrictCalendarDate(v.dob)) fieldErrors.dob = MSG.dobInvalid;

  if (atRaw === '') fieldErrors.at = MSG.atRequired;
  else if (!isStrictCalendarDate(v.at)) fieldErrors.at = MSG.atInvalid;

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  // Cross-field: birth must be ON OR BEFORE the as-of date (never swapped). Blame the DOB field —
  // the most actionable control for "born after the date you're measuring against".
  const dob = parseISODateUTC(v.dob)!;
  const at = parseISODateUTC(v.at)!;
  if (dob.getTime() > at.getTime()) return { ok: false, fieldErrors: { dob: MSG.order } };

  return { ok: true };
}

export function computeAge(v: AgeValues): AgeComputed {
  const dob = parseISODateUTC(v.dob) ?? new Date(Number.NaN);
  const at = parseISODateUTC(v.at) ?? new Date(Number.NaN);
  const result = calculateAge(dob, at);
  return { ...result, dobISO: v.dob, atISO: v.at };
}

const FAIL = Number.NaN;

/**
 * The finite totalDays sentinel — but ONLY when the WHOLE AgeResult is coherent: strict calendar
 * dates, DOB ≤ as-of, valid === true, every component a finite non-negative integer (months < 12,
 * next-birthday within the frozen 1–366 range), and a calculateAge RECOMPUTE reproducing every
 * displayed field (the calendar math is never rebuilt here). A same-date zero age is a finite 0 the
 * runtime's default gate accepts. Any failure returns the NaN sentinel — NO isUsableResult.
 */
export function completeAgeValue(r: AgeComputed): number {
  const dob = parseISODateUTC(r.dobISO);
  const at = parseISODateUTC(r.atISO);
  if (!dob || !at) return FAIL;
  if (!isStrictCalendarDate(r.dobISO) || !isStrictCalendarDate(r.atISO)) return FAIL;
  if (dob.getTime() > at.getTime()) return FAIL;
  if (r.valid !== true) return FAIL;

  const scalars = [r.years, r.months, r.days, r.totalDays, r.totalWeeks, r.totalMonths, r.nextBirthdayInDays];
  if (!scalars.every((n) => Number.isInteger(n))) return FAIL;
  if (r.years < 0 || r.months < 0 || r.days < 0) return FAIL;
  if (r.months > 11) return FAIL;
  if (r.totalDays < 0 || r.totalWeeks < 0 || r.totalMonths < 0) return FAIL;
  if (r.nextBirthdayInDays < 1 || r.nextBirthdayInDays > 366) return FAIL;

  const c = calculateAge(dob, at);
  if (
    c.valid !== true ||
    c.years !== r.years ||
    c.months !== r.months ||
    c.days !== r.days ||
    c.totalDays !== r.totalDays ||
    c.totalWeeks !== r.totalWeeks ||
    c.totalMonths !== r.totalMonths ||
    c.nextBirthdayInDays !== r.nextBirthdayInDays
  ) {
    return FAIL;
  }
  return r.totalDays; // finite; 0 (same date) is a valid result the default gate accepts
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;
const withCommas = (n: number): string => n.toLocaleString('en-US');

/** The dominant exact-age phrase, e.g. "34 years, 2 months, 15 days". */
export function exactAge(r: AgeComputed): string {
  return `${plural(r.years, 'year')}, ${plural(r.months, 'month')}, ${plural(r.days, 'day')}`;
}

/** A concise interpretation using the totals + next birthday (source semantics only). */
export function interpretAge(r: AgeComputed): string {
  return (
    `That is ${withCommas(r.totalMonths)} months or ${withCommas(r.totalDays)} days in total — ` +
    `${plural(r.nextBirthdayInDays, 'day')} until the next birthday.`
  );
}

/** Concise announcement — the dominant exact age only (§10). Same-date reads "0 years, 0 months, 0 days". */
export function describeAgeResult(r: AgeComputed): string {
  return `Exact age: ${exactAge(r)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const ageBinding: FormCalculatorBinding<AgeValues, AgeComputed> = {
  readValues(root) {
    return { dob: control(root, 'dob')?.value ?? '', at: control(root, 'at')?.value ?? '' };
  },

  validate: validateAgeValues,

  compute: computeAge,

  /** Complete-result guard as the ordinary result value — no isUsableResult. */
  resultValue: completeAgeValue,

  describeResult: describeAgeResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    const phrase = exactAge(result);
    // Dominant: the exact age (shown + spoken).
    set('[data-result-when~="valid"] [data-result-value]', phrase);
    set('[data-result-when~="valid"] [data-result-value-a11y]', phrase);
    // Supporting totals.
    set('[data-age-months]', withCommas(result.totalMonths));
    set('[data-age-weeks]', withCommas(result.totalWeeks));
    set('[data-age-days]', withCommas(result.totalDays));
    // Secondary contextual metric.
    set('[data-age-next]', withCommas(result.nextBirthdayInDays));
    // Interpretation.
    set('[data-age-interpretation]', interpretAge(result));
  },

  resetValues(root, _mode: ResetMode) {
    // Clear both dates; the island restores the "age at" default (today) — the structural default.
    for (const name of ['dob', 'at']) {
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
export function ageExampleValues(): AgeValues {
  const today = new Date();
  const dob = new Date(today.getFullYear() - 35, 5, 15); // 35 years ago, 15 June
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { dob: iso(dob), at: iso(today) };
}
