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
import { diffDates, addDays, shiftDate, toISODateUTC, type DateDiff } from './date-duration';
import { businessDaysBetween, addBusinessDays, BUSINESS_DAY_MAX } from './business-days';
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
  /** Count the end day as well — a range of "1st to the 3rd" is 2 days, or 3 including the end. */
  includeEnd: boolean;
  // add / subtract mode
  start: string;
  op: AddOp;
  years: string;
  months: string;
  weeks: string;
  days: string;
  /** Both modes: count Monday-to-Friday only. */
  businessOnly: boolean;
  /** Only meaningful with businessOnly: also skip the observed US federal holidays. */
  excludeHolidays: boolean;
}

/** The units an add or subtract can be expressed in, largest first. */
export const SHIFT_UNITS = ['years', 'months', 'weeks', 'days'] as const;
export type ShiftUnit = (typeof SHIFT_UNITS)[number];

export interface DiffComputed {
  mode: 'diff';
  fromISO: string;
  toISO: string;
  diff: DateDiff;
  includeEnd: boolean;
  businessOnly: boolean;
  excludeHolidays: boolean;
  /** Calendar days in the span, plus the end day when the visitor asked for it. */
  countedDays: number;
  /** Business days over the same span, on the same end-day rule. */
  businessDays: number;
}
export interface AddComputed {
  mode: 'add';
  startISO: string;
  op: AddOp;
  years: number;
  months: number;
  weeks: number;
  days: number;
  businessOnly: boolean;
  excludeHolidays: boolean;
  /** Business-day mode only: the day count with the operation's sign applied. */
  signedDays: number;
  resultISO: string;
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
  amountRequired: 'Enter how much to add or subtract.',
  amountInvalid: 'Enter whole numbers (zero or more) for years, months, weeks and days.',
  businessDaysOnly: 'In business-day mode, enter the amount in days.',
  businessDaysTooMany: `Enter ${BUSINESS_DAY_MAX.toLocaleString('en-US')} business days or fewer.`,
} as const;

/** Field names the add/subtract amount is spread across, for error targeting. */
export const AMOUNT_FIELD = 'amount';

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

/** Every amount box: blank counts as zero, but they cannot ALL be blank. */
function validateAmount(v: DateValues): string | null {
  let total = 0;
  let given = 0;
  for (const unit of SHIFT_UNITS) {
    const parsed = parseWholeNonNegative(v[unit]);
    if (parsed === 'invalid') return MSG.amountInvalid;
    if (parsed === 'empty') continue;
    given += 1;
    total += parsed;
  }
  if (given === 0) return MSG.amountRequired;
  // Business days are a count of working days; years, months and weeks do not translate into
  // them, so the amount has to be expressed in days.
  if (v.businessOnly) {
    for (const unit of ['years', 'months', 'weeks'] as const) {
      const parsed = parseWholeNonNegative(v[unit]);
      if (parsed !== 'empty' && parsed !== 'invalid' && parsed > 0) return MSG.businessDaysOnly;
    }
    const days = parseWholeNonNegative(v.days);
    if (typeof days === 'number' && days > BUSINESS_DAY_MAX) return MSG.businessDaysTooMany;
  }
  void total;
  return null;
}

function validateAdd(v: DateValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const start = (v.start ?? '').trim();
  if (start === '') fieldErrors.start = MSG.startRequired;
  else if (!isStrictCalendarDate(v.start)) fieldErrors.start = MSG.startInvalid;
  const amount = validateAmount(v);
  if (amount) fieldErrors[AMOUNT_FIELD] = amount;
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function validateDateValues(v: DateValues): ValidationResult {
  return v.mode === 'add' ? validateAdd(v) : validateDiff(v);
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — pass-through to the frozen source              */
/* ------------------------------------------------------------------ */

const whole = (raw: string): number => {
  const parsed = parseWholeNonNegative(raw);
  return typeof parsed === 'number' ? parsed : 0;
};

export function computeDate(v: DateValues): DateComputed {
  if (v.mode === 'add') {
    const start = parseISODateUTC(v.start) ?? new Date(Number.NaN);
    const years = whole(v.years);
    const months = whole(v.months);
    const weeks = whole(v.weeks);
    const days = whole(v.days);
    const sign: 1 | -1 = v.op === 'sub' ? -1 : 1;
    const signedDays = sign * days;
    const result = v.businessOnly
      ? addBusinessDays(start, signedDays, { excludeHolidays: v.excludeHolidays })
      : shiftDate(start, { years, months, weeks, days }, sign);
    return {
      mode: 'add',
      startISO: v.start,
      op: v.op,
      years,
      months,
      weeks,
      days,
      businessOnly: v.businessOnly,
      excludeHolidays: v.excludeHolidays,
      signedDays,
      resultISO: Number.isFinite(result.getTime()) ? toISODateUTC(result) : '',
    };
  }
  const a = parseISODateUTC(v.from) ?? new Date(Number.NaN);
  const b = parseISODateUTC(v.to) ?? new Date(Number.NaN);
  const diff = diffDates(a, b);
  const usable = Number.isFinite(a.getTime()) && Number.isFinite(b.getTime());
  return {
    mode: 'diff',
    fromISO: v.from,
    toISO: v.to,
    diff,
    includeEnd: v.includeEnd,
    businessOnly: v.businessOnly,
    excludeHolidays: v.excludeHolidays,
    countedDays: diff.totalDays + (v.includeEnd ? 1 : 0),
    businessDays: usable
      ? businessDaysBetween(a, b, {
          includeEnd: v.includeEnd,
          excludeHolidays: v.excludeHolidays,
        })
      : Number.NaN,
  };
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
  // The counted total and the business-day figure are rendered as fact, so they are held to the
  // same standard: both must reproduce from a recompute, and neither may be negative.
  if (r.countedDays !== d.totalDays + (r.includeEnd ? 1 : 0)) return FAIL;
  if (!Number.isInteger(r.countedDays) || r.countedDays < 0) return FAIL;
  const business = businessDaysBetween(a, b, {
    includeEnd: r.includeEnd,
    excludeHolidays: r.excludeHolidays,
  });
  if (!Number.isInteger(business) || business < 0) return FAIL;
  if (business !== r.businessDays) return FAIL;
  if (business > r.countedDays) return FAIL; // working days can never exceed calendar days

  // In business mode the business-day count IS the answer, so it is what the gate returns.
  return r.businessOnly ? business : d.totalDays;
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
  if (r.op !== 'add' && r.op !== 'sub') return FAIL;
  for (const n of [r.years, r.months, r.weeks, r.days]) {
    if (!Number.isInteger(n) || n < 0) return FAIL;
  }
  const sign: 1 | -1 = r.op === 'sub' ? -1 : 1;
  if (sign * r.days !== r.signedDays) return FAIL;

  if (r.businessOnly) {
    // Business days do not compose with calendar units; a stray year, month or week here would
    // mean the displayed result was computed from something other than what is on screen.
    if (r.years !== 0 || r.months !== 0 || r.weeks !== 0) return FAIL;
    if (r.days > BUSINESS_DAY_MAX) return FAIL;
  }

  const result = r.businessOnly
    ? addBusinessDays(start, r.signedDays, { excludeHolidays: r.excludeHolidays })
    : shiftDate(start, { years: r.years, months: r.months, weeks: r.weeks, days: r.days }, sign);
  const t = result.getTime();
  if (!Number.isFinite(t)) return FAIL; // overflow, or a business shift too large to walk
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

/** Whole weeks and the days left over, e.g. "32 weeks and 4 days". */
export function weeksAndDays(totalDays: number): string {
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays - weeks * 7;
  if (weeks === 0) return plural(days, 'day');
  if (days === 0) return plural(weeks, 'week');
  return `${plural(weeks, 'week')} and ${plural(days, 'day')}`;
}

export interface TimeUnitRow {
  key: string;
  label: string;
  value: string;
}

/** A common year, the denominator the percentage is quoted against. */
export const COMMON_YEAR_DAYS = 365;

/**
 * The same span expressed in every unit someone might actually want it in.
 *
 * A day count answers "how long", but people arrive needing it in other shapes — hours for
 * billing, weeks for a schedule, a fraction of a year for a contract — and converting it by hand
 * is exactly the arithmetic they came here to avoid.
 */
export function alternativeUnits(totalDays: number): TimeUnitRow[] {
  const pct = (totalDays / COMMON_YEAR_DAYS) * 100;
  return [
    { key: 'seconds', label: 'Seconds', value: withCommas(totalDays * 86_400) },
    { key: 'minutes', label: 'Minutes', value: withCommas(totalDays * 1_440) },
    { key: 'hours', label: 'Hours', value: withCommas(totalDays * 24) },
    { key: 'days', label: 'Days', value: withCommas(totalDays) },
    { key: 'weeks', label: 'Weeks and days', value: weeksAndDays(totalDays) },
    {
      key: 'year-pct',
      label: 'Of a common year (365 days)',
      value: `${pct.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
    },
  ];
}

/** The amount phrase for an add or subtract, omitting the units left blank or at zero. */
export function shiftPhrase(r: AddComputed): string {
  if (r.businessOnly) return plural(r.days, 'business day');
  const parts: string[] = [];
  if (r.years) parts.push(plural(r.years, 'year'));
  if (r.months) parts.push(plural(r.months, 'month'));
  if (r.weeks) parts.push(plural(r.weeks, 'week'));
  if (r.days) parts.push(plural(r.days, 'day'));
  if (parts.length === 0) return '0 days';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The DIFFERENCE direction/context sentence (supporting; distinct from the total-day count). */
export function interpretDiff(r: DiffComputed): string {
  const from = longDate(r.fromISO);
  const to = longDate(r.toISO);
  const ending = r.includeEnd ? ', end day included' : '';
  if (r.diff.direction === 'same' && !r.includeEnd) return `${from} and ${to} are the same day.`;
  if (r.businessOnly) {
    const holidays = r.excludeHolidays ? ', excluding US federal holidays' : '';
    return `There are ${withCommas(r.businessDays)} business ${r.businessDays === 1 ? 'day' : 'days'} from ${from} to ${to}${ending}${holidays} — out of ${withCommas(r.countedDays)} calendar ${r.countedDays === 1 ? 'day' : 'days'}.`;
  }
  if (r.diff.direction === 'same') {
    return `${from} and ${to} are the same day — ${withCommas(r.countedDays)} day counting it.`;
  }
  const rel = r.diff.direction === 'after' ? 'after' : 'before';
  return `${to} is ${diffPhrase(r.diff)} ${rel} ${from} — ${withCommas(r.countedDays)} days in total${ending}.`;
}

/** The ADD/SUBTRACT context sentence (original date + operation + amount). */
export function interpretAdd(r: AddComputed): string {
  const verb = r.op === 'sub' ? 'Subtracting' : 'Adding';
  const prep = r.op === 'sub' ? 'from' : 'to';
  const holidays = r.businessOnly && r.excludeHolidays ? ', skipping US federal holidays' : '';
  return `${verb} ${shiftPhrase(r)} ${prep} ${longDate(r.startISO)} gives ${longDate(r.resultISO)}${holidays}.`;
}

/** Concise, mode-specific announcement — the dominant result only (§15). */
export function describeDateResult(r: DateComputed): string {
  if (r.mode === 'add') return `Resulting date: ${spokenDate(r.resultISO)}.`;
  if (r.businessOnly) return `Business days: ${withCommas(r.businessDays)}.`;
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
const readChecked = (root: HTMLElement, name: string): boolean =>
  !!root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked;

export const dateBinding: FormCalculatorBinding<DateValues, DateComputed> = {
  readValues(root) {
    const businessOnly = readChecked(root, 'businessOnly');
    return {
      mode: readMode(root),
      from: control(root, 'from')?.value ?? '',
      to: control(root, 'to')?.value ?? '',
      includeEnd: readChecked(root, 'includeEnd'),
      start: control(root, 'start')?.value ?? '',
      op: readOp(root),
      years: control(root, 'years')?.value ?? '',
      months: control(root, 'months')?.value ?? '',
      weeks: control(root, 'weeks')?.value ?? '',
      days: control(root, 'days')?.value ?? '',
      businessOnly,
      // Holidays are a refinement of business days; ticked on its own it means nothing, so it
      // never reaches the computation unless business days are on.
      excludeHolidays: businessOnly && readChecked(root, 'excludeHolidays'),
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
      set('[data-dc-add-amount]', shiftPhrase(result));
      set('[data-dc-add-from]', longDate(result.startISO));
      set('[data-dc-add-interpretation]', interpretAdd(result));
      return;
    }

    // In business mode the working-day count IS the answer; the calendar breakdown stays, one
    // step down, because "83 business days" is only meaningful next to the span it came from.
    const phrase = diffPhrase(result.diff);
    const business = withCommas(result.businessDays);
    const dominant = result.businessOnly
      ? `${business} business ${result.businessDays === 1 ? 'day' : 'days'}`
      : phrase;
    set('[data-dc-panel="diff"] [data-result-value]', dominant);
    set('[data-dc-panel="diff"] [data-result-value-a11y]', dominant);
    set('[data-dc-breakdown]', phrase);
    set('[data-dc-total-days]', withCommas(result.countedDays));
    set('[data-dc-total-weeks]', weeksAndDays(result.countedDays));
    set('[data-dc-business-days]', business);
    set('[data-dc-diff-interpretation]', interpretDiff(result));

    // The calendar breakdown is the dominant figure unless business days took its place, in
    // which case it moves into the supporting rows instead of being shown twice.
    const breakdownRow = scope.querySelector<HTMLElement>('[data-dc-row="breakdown"]');
    if (breakdownRow) breakdownRow.hidden = !result.businessOnly;
    const businessRow = scope.querySelector<HTMLElement>('[data-dc-row="business"]');
    if (businessRow) businessRow.hidden = result.businessOnly;

    for (const row of alternativeUnits(result.countedDays)) {
      set(`[data-dc-unit="${row.key}"] [data-dc-unit-value]`, row.value);
    }
  },

  resetValues(root, _mode: ResetMode) {
    // Restore the default mode + operation; clear every task field across BOTH modes so switching
    // modes after a reset never restores stale values. The island re-syncs panel visibility.
    const modeSel = control(root, 'mode');
    if (modeSel) modeSel.value = DEFAULT_MODE;
    const opSel = control(root, 'op');
    if (opSel) opSel.value = DEFAULT_OP;
    for (const name of ['from', 'to', 'start', 'years', 'months', 'weeks', 'days']) {
      const el = control(root, name);
      if (el) el.value = '';
    }
    for (const name of ['includeEnd', 'businessOnly', 'excludeHolidays']) {
      const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (el) el.checked = false;
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
  return {
    mode: 'diff',
    from: iso(today),
    to: iso(later),
    includeEnd: false,
    start: iso(today),
    op: 'add',
    years: '',
    months: '',
    weeks: '',
    days: '30',
    businessOnly: false,
    excludeHolidays: false,
  };
}
