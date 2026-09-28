/**
 * Hours form binding (R17B2 — bounded Everyday singleton; task-first).
 *
 * Wraps the UNCHANGED `parseTimeToMinutes` / `calculateHours` and layers the visitor-facing contract
 * they lack: required + strict time validation, a strict non-negative break (whole or decimal), and a complete-result
 * guard. Start / end are native `type="time"` fields (HH:MM); the break is in MINUTES.
 *
 * Own file — the standard-form runtime is UNCHANGED; there is NO `isUsableResult` (the complete-result
 * guard lives in `resultValue` as a NaN sentinel → the runtime's DEFAULT finite gate; a valid zero
 * duration — equal times, or a break at least as long as the interval — is a finite 0 that passes).
 * The frozen source keeps its behaviour: OVERNIGHT is supported (end earlier than start counts as the
 * next day); the binding never reproduces elapsed-time arithmetic — it calls the source and reconciles
 * via a recompute. Visitor validation is STRICTER than the source in ONE safe way only: a negative
 * break is rejected (the source silently clamps it). The frozen source accepts nonnegative DECIMAL
 * break minutes, so the binding HONOURS them too — a fractional break yields fractional remaining
 * minutes (e.g. a 30.5-minute break off 09:00–17:00 → 7h 29.5m), shown without truncation.
 */
import {
  parseTimeToMinutes,
  calculateHours,
  spanBetweenInstants,
  type HoursResult,
  type InstantSpan,
} from './hours';
import { parseISODateUTC } from './age';
import { toISODateUTC } from './date-duration';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

const DAY = 24 * 60;

export interface HoursFormValues {
  start: string;
  end: string;
  breakMin: string;
}

export interface HoursComputed {
  startMin: number;
  endMin: number;
  breakMin: number;
  overnight: boolean;
  span: number; // overnight-adjusted elapsed BEFORE the break
  result: HoursResult;
}

export const MSG = {
  startRequired: 'Enter a start time.',
  startInvalid: 'Enter a valid start time (HH:MM).',
  endRequired: 'Enter an end time.',
  endInvalid: 'Enter a valid end time (HH:MM).',
  breakInvalid: 'Enter the break as a number of minutes.',
  breakNegative: 'The break cannot be negative.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * '' → 0 (the neutral "no break"); a finite NON-NEGATIVE number (whole OR decimal) → the number;
 * else a reason. The frozen source honours nonnegative decimal break minutes, so the binding does too
 * — WITHOUT `Number(v)||0` / `parseInt` coercion or silent truncation: a strict finite-decimal grammar
 * (optional sign, digits with an optional single fractional part — "30", "30.5", "0.5", ".5", "5."; no
 * exponent, no junk) then a finiteness guard (an over-long digit run that overflows to Infinity fails).
 */
function parseBreak(raw: string): number | 'invalid' | 'negative' {
  const s = raw.trim();
  if (s === '') return 0; // an empty break means the verified neutral value (0)
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(s)) return 'invalid'; // finite decimal only — rejects junk / partial / exponent
  const n = Number(s);
  if (!Number.isFinite(n)) return 'invalid';
  if (n < 0) return 'negative';
  return n;
}

const field = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? '';

export function readHoursValues(root: HTMLElement): HoursFormValues {
  return { start: field(root, 'start'), end: field(root, 'end'), breakMin: field(root, 'breakMin') };
}

/* ------------------------------------------------------------------ */
/* Validate                                                            */
/* ------------------------------------------------------------------ */

export function validateHours(v: HoursFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  if (v.start.trim() === '') fieldErrors.start = MSG.startRequired;
  else if (parseTimeToMinutes(v.start.trim()) === null) fieldErrors.start = MSG.startInvalid;

  if (v.end.trim() === '') fieldErrors.end = MSG.endRequired;
  else if (parseTimeToMinutes(v.end.trim()) === null) fieldErrors.end = MSG.endInvalid;

  const b = parseBreak(v.breakMin);
  if (b === 'invalid') fieldErrors.breakMin = MSG.breakInvalid;
  else if (b === 'negative') fieldErrors.breakMin = MSG.breakNegative;

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Compute                                                             */
/* ------------------------------------------------------------------ */

export function computeHours(v: HoursFormValues): HoursComputed {
  const startMin = parseTimeToMinutes(v.start.trim()) ?? Number.NaN;
  const endMin = parseTimeToMinutes(v.end.trim()) ?? Number.NaN;
  const b = parseBreak(v.breakMin);
  const breakMin = typeof b === 'number' ? b : Number.NaN;
  const overnight = Number.isFinite(startMin) && Number.isFinite(endMin) && endMin < startMin;
  const span = Number.isFinite(startMin) && Number.isFinite(endMin) ? (overnight ? endMin - startMin + DAY : endMin - startMin) : Number.NaN;
  return { startMin, endMin, breakMin, overnight, span, result: calculateHours(startMin, endMin, breakMin) };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (in resultValue — NO isUsableResult)          */
/* ------------------------------------------------------------------ */

const clockOk = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= DAY - 1;

// The clock minutes stay whole; the BREAK, and therefore totalMinutes and the `total % 60` remaining
// minutes, MAY be decimal (the frozen source honours a decimal break). hours(*60) + minutes can differ
// from the stored totalMinutes by a floating-point ULP or two, so the decomposition is reconciled with a
// narrow tolerance; the recompute + two-decimal decimalHours checks stay exact — identical-input
// arithmetic is deterministic, so a re-run reproduces the same floats bit-for-bit.
const DECOMP_TOL = 1e-9;

export function completeHoursValue(c: HoursComputed): number {
  const { startMin, endMin, breakMin, result } = c;
  if (!clockOk(startMin) || !clockOk(endMin)) return Number.NaN;
  if (!Number.isFinite(breakMin) || breakMin < 0) return Number.NaN; // finite, non-negative; MAY be decimal

  const { totalMinutes, hours, minutes, decimalHours } = result;
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return Number.NaN; // MAY be decimal
  if (!Number.isInteger(hours) || hours < 0) return Number.NaN; // whole hours only
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 60) return Number.NaN; // [0, 60); MAY be decimal
  if (Math.abs(hours * 60 + minutes - totalMinutes) > DECOMP_TOL) return Number.NaN;
  if (!Number.isFinite(decimalHours) || decimalHours !== Math.round((totalMinutes / 60) * 100) / 100) return Number.NaN;

  const re = calculateHours(startMin, endMin, breakMin);
  if (re.totalMinutes !== totalMinutes || re.hours !== hours || re.minutes !== minutes || re.decimalHours !== decimalHours) {
    return Number.NaN;
  }
  return totalMinutes; // finite sentinel (a valid 0 duration passes the default gate; a decimal total is fine)
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface HoursPresentation {
  primary: string;
  a11y: string;
  decimal: string;
  interpretation: string;
  /** "The time between 8:30 AM and 5:30 PM is:" — the reference's lead-in. */
  lead: string;
  /** "9 hours" / "9 hours 30 minutes" — the reference's first figure. */
  hoursLine: string;
  /** "540 minutes" — the reference's second figure. */
  minutesLine: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** A wall-clock time the way it is read aloud: "8:30 AM", never "08:30". */
export function clock12(min: number): string {
  const h24 = Math.floor(min / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(min % 60)} ${h24 < 12 ? 'AM' : 'PM'}`;
}
const hm = (h: number, m: number): string => `${h}h ${m}m`;
/** Whole minutes get thousands separators; a decimal break can leave a fraction, so keep it. */
const formatMinutes = (n: number): string =>
  Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 4 });
const spokenHm = (h: number, m: number): string => {
  if (h === 0 && m === 0) return '0 hours';
  const hp = `${h} hour${h === 1 ? '' : 's'}`;
  const mp = `${m} minute${m === 1 ? '' : 's'}`;
  if (m === 0) return hp;
  if (h === 0) return mp;
  return `${hp} ${mp}`;
};

export function presentHours(c: HoursComputed): HoursPresentation {
  const { hours, minutes, totalMinutes, decimalHours } = c.result;
  // 12-hour throughout: the lead-in above it reads "8:30 AM", so this must not switch to 24-hour.
  let interpretation = `${clock12(c.startMin)} to ${clock12(c.endMin)}${c.overnight ? ', crossing midnight' : ''}`;
  interpretation += c.breakMin > 0 ? `, minus a ${c.breakMin}-minute break` : '';
  interpretation += '.';
  if (totalMinutes === 0) {
    interpretation +=
      c.span === 0
        ? ' The start and end times are the same, so no time is counted.'
        : ' The break is at least as long as the interval, so the time worked is zero.';
  }
  return {
    primary: hm(hours, minutes),
    a11y: spokenHm(hours, minutes),
    decimal: String(decimalHours),
    interpretation,
    lead: `The time between ${clock12(c.startMin)} and ${clock12(c.endMin)} is:`,
    hoursLine: spokenHm(hours, minutes),
    minutesLine: `${formatMinutes(totalMinutes)} ${totalMinutes === 1 ? 'minute' : 'minutes'}`,
  };
}

export function describeHours(c: HoursComputed): string {
  return `Total time: ${spokenHm(c.result.hours, c.result.minutes)}.`;
}

export function renderHoursResult(result: HoursComputed, context: FormRenderContext): void {
  const p = presentHours(result);
  const q = (sel: string) => context.result.querySelector<HTMLElement>(sel);
  const set = (sel: string, value: string) => {
    const el = q(sel);
    if (el) el.textContent = value;
  };
  const primary = q('[data-result-when~="valid"] [data-result-value]');
  if (primary) primary.textContent = p.primary;
  const a11y = q('[data-result-when~="valid"] [data-result-value-a11y]');
  if (a11y) a11y.textContent = p.a11y;
  set('[data-hr-decimal]', p.decimal);
  set('[data-hr-interpretation]', p.interpretation);
  set('[data-hr-lead]', p.lead);
  set('[data-hr-hours-line]', p.hoursLine);
  set('[data-hr-minutes-line]', p.minutesLine);
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

/** Clear the two time fields and the break (empty = the neutral "no break"). */
export function resetHoursValues(root: HTMLElement, _mode: ResetMode): void {
  for (const name of ['start', 'end', 'breakMin']) {
    const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (el) el.value = '';
  }
}

export const hoursBinding: FormCalculatorBinding<HoursFormValues, HoursComputed> = {
  readValues: readHoursValues,
  validate: validateHours,
  compute: computeHours,
  renderResult: renderHoursResult,
  describeResult: describeHours,
  resultValue: completeHoursValue,
  resetValues: resetHoursValues,
  // NO isUsableResult — the complete-result guard lives in resultValue (NaN sentinel).
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
export const HOURS_EXAMPLE_VALUES: HoursFormValues = { start: '09:00', end: '17:30', breakMin: '30' };

/* ================================================================== */
/* Hours Between Two Dates — a SECOND, independent calculator          */
/* ================================================================== */

/**
 * The reference puts this on the same page as its own box, with its own Calculate button and its
 * own result, because it answers a different question: the one above cannot span more than a day
 * and has to GUESS that an earlier end time means "the next morning". Here the visitor says which
 * day each time is on, so a span of three days is three days rather than a guess.
 *
 * It is a separate binding on the same island — never a mode of the first one.
 */

export interface HoursDatesValues {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

export interface HoursDatesComputed {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  startMinutes: number; // whole minutes since the epoch
  endMinutes: number;
  span: InstantSpan;
}

export const DATES_MSG = {
  startDateRequired: 'Enter a start date.',
  startDateInvalid: 'Enter a valid start date.',
  startTimeRequired: 'Enter a start time.',
  startTimeInvalid: 'Enter a valid start time.',
  endDateRequired: 'Enter an end date.',
  endDateInvalid: 'Enter a valid end date.',
  endTimeRequired: 'Enter an end time.',
  endTimeInvalid: 'Enter a valid end time.',
} as const;

const MS_PER_MIN = 60_000;

function strictDate(raw: string): boolean {
  const d = parseISODateUTC(raw);
  return !!d && Number.isFinite(d.getTime()) && toISODateUTC(d) === raw;
}

/** Whole minutes since the epoch for a civil date plus a wall-clock time, or NaN. */
export function instantMinutes(dateISO: string, timeHHMM: string): number {
  const d = parseISODateUTC(dateISO);
  const t = parseTimeToMinutes((timeHHMM ?? '').trim());
  if (!d || !Number.isFinite(d.getTime()) || t === null) return Number.NaN;
  return Math.round(d.getTime() / MS_PER_MIN) + t;
}

export function validateHoursDates(v: HoursDatesValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const check = (
    value: string,
    field: string,
    required: string,
    invalid: string,
    ok: (raw: string) => boolean,
  ) => {
    const raw = (value ?? '').trim();
    if (raw === '') fieldErrors[field] = required;
    else if (!ok(raw)) fieldErrors[field] = invalid;
  };
  check(v.startDate, 'startDate', DATES_MSG.startDateRequired, DATES_MSG.startDateInvalid, strictDate);
  check(v.startTime, 'startTime', DATES_MSG.startTimeRequired, DATES_MSG.startTimeInvalid, (r) => parseTimeToMinutes(r) !== null);
  check(v.endDate, 'endDate', DATES_MSG.endDateRequired, DATES_MSG.endDateInvalid, strictDate);
  check(v.endTime, 'endTime', DATES_MSG.endTimeRequired, DATES_MSG.endTimeInvalid, (r) => parseTimeToMinutes(r) !== null);
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function computeHoursDates(v: HoursDatesValues): HoursDatesComputed {
  const startMinutes = instantMinutes(v.startDate, v.startTime);
  const endMinutes = instantMinutes(v.endDate, v.endTime);
  return {
    startDate: v.startDate,
    startTime: v.startTime,
    endDate: v.endDate,
    endTime: v.endTime,
    startMinutes,
    endMinutes,
    span: spanBetweenInstants(startMinutes, endMinutes),
  };
}

/** The span in minutes, but only when every displayed figure reconciles with a recompute. */
export function completeHoursDatesValue(c: HoursDatesComputed): number {
  if (!strictDate(c.startDate) || !strictDate(c.endDate)) return Number.NaN;
  if (parseTimeToMinutes((c.startTime ?? '').trim()) === null) return Number.NaN;
  if (parseTimeToMinutes((c.endTime ?? '').trim()) === null) return Number.NaN;

  const startMinutes = instantMinutes(c.startDate, c.startTime);
  const endMinutes = instantMinutes(c.endDate, c.endTime);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return Number.NaN;
  if (startMinutes !== c.startMinutes || endMinutes !== c.endMinutes) return Number.NaN;

  const s = c.span;
  const ints = [s.totalMinutes, s.hours, s.minutes, s.days, s.hoursOfDay];
  if (!ints.every(Number.isInteger)) return Number.NaN;
  if (ints.some((n) => n < 0)) return Number.NaN;
  if (s.minutes >= 60 || s.hoursOfDay >= 24) return Number.NaN;
  if (s.hours * 60 + s.minutes !== s.totalMinutes) return Number.NaN;
  if (s.days * DAY + s.hoursOfDay * 60 + s.minutes !== s.totalMinutes) return Number.NaN;
  if (s.direction !== 'after' && s.direction !== 'before' && s.direction !== 'same') return Number.NaN;
  if (s.decimalHours !== Math.round((s.totalMinutes / 60) * 100) / 100) return Number.NaN;

  const re = spanBetweenInstants(startMinutes, endMinutes);
  if (
    re.totalMinutes !== s.totalMinutes ||
    re.hours !== s.hours ||
    re.minutes !== s.minutes ||
    re.days !== s.days ||
    re.hoursOfDay !== s.hoursOfDay ||
    re.direction !== s.direction ||
    re.decimalHours !== s.decimalHours
  ) {
    return Number.NaN;
  }
  return s.totalMinutes;
}

/** "Aug. 29, 2026" — abbreviated with a point, except May, which is not an abbreviation. */
export function shortDateLabel(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const full = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const day = d.getUTCDate();
  return `${month}${month === full ? '' : '.'} ${day}, ${d.getUTCFullYear()}`;
}

export interface HoursDatesPresentation {
  lead: string;
  hoursLine: string;
  minutesLine: string;
  primary: string;
  a11y: string;
  daysLine: string;
  decimal: string;
  interpretation: string;
}

export function presentHoursDates(c: HoursDatesComputed): HoursDatesPresentation {
  const s = c.span;
  const startLabel = `${shortDateLabel(c.startDate)}, ${clock12(parseTimeToMinutes(c.startTime.trim()) ?? 0)}`;
  const endLabel = `${shortDateLabel(c.endDate)}, ${clock12(parseTimeToMinutes(c.endTime.trim()) ?? 0)}`;
  const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
  const hourWord = (n: number) => `${n} ${n === 1 ? 'hour' : 'hours'}`;
  const minWord = (n: number) => `${n} ${n === 1 ? 'minute' : 'minutes'}`;

  const daysLine =
    s.days === 0
      ? 'Less than a day'
      : `${dayWord(s.days)}${s.hoursOfDay ? `, ${hourWord(s.hoursOfDay)}` : ''}${s.minutes ? `, ${minWord(s.minutes)}` : ''}`;

  let interpretation: string;
  if (s.direction === 'same') interpretation = 'The two instants are the same, so no time passes between them.';
  else if (s.direction === 'before') {
    interpretation = `The end is ${hourWord(s.hours)}${s.minutes ? ` and ${minWord(s.minutes)}` : ''} BEFORE the start; the span is shown as an absolute length.`;
  } else {
    interpretation = `${endLabel} is ${hourWord(s.hours)}${s.minutes ? ` and ${minWord(s.minutes)}` : ''} after ${startLabel}.`;
  }

  return {
    lead: `The time between ${startLabel} and ${endLabel} is:`,
    // The same phrasing rule as the calculator above it: a span under an hour reads "45 minutes",
    // not "0 hours 45 minutes". Two calculators on one page must not word the same figure two ways.
    hoursLine: spokenHm(s.hours, s.minutes),
    minutesLine: `${s.totalMinutes.toLocaleString('en-US')} ${s.totalMinutes === 1 ? 'minute' : 'minutes'}`,
    primary: `${s.hours}h ${s.minutes}m`,
    a11y: spokenHm(s.hours, s.minutes),
    daysLine,
    decimal: String(s.decimalHours),
    interpretation,
  };
}

export function describeHoursDates(c: HoursDatesComputed): string {
  const p = presentHoursDates(c);
  return `Time between the two dates: ${p.a11y}.`;
}

export const hoursDatesBinding: FormCalculatorBinding<HoursDatesValues, HoursDatesComputed> = {
  readValues(root) {
    return {
      startDate: field(root, 'startDate'),
      startTime: field(root, 'startTime'),
      endDate: field(root, 'endDate'),
      endTime: field(root, 'endTime'),
    };
  },
  validate: validateHoursDates,
  compute: computeHoursDates,
  resultValue: completeHoursDatesValue,
  describeResult: describeHoursDates,
  renderResult(result, context: FormRenderContext) {
    const p = presentHoursDates(result);
    const q = (sel: string) => context.result.querySelector<HTMLElement>(sel);
    const set = (sel: string, value: string) => {
      const el = q(sel);
      if (el) el.textContent = value;
    };
    const primary = q('[data-result-when~="valid"] [data-result-value]');
    if (primary) primary.textContent = p.hoursLine;
    const a11y = q('[data-result-when~="valid"] [data-result-value-a11y]');
    if (a11y) a11y.textContent = p.a11y;
    set('[data-hd-lead]', p.lead);
    set('[data-hd-hours-line]', p.hoursLine);
    set('[data-hd-minutes-line]', p.minutesLine);
    set('[data-hd-days]', p.daysLine);
    set('[data-hd-decimal]', p.decimal);
    set('[data-hd-interpretation]', p.interpretation);
  },
  resetValues(root, _mode: ResetMode) {
    for (const name of ['startDate', 'startTime', 'endDate', 'endTime']) {
      const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (el) el.value = '';
    }
  },
};

/** Example values for the labelled worked result — ours, never written into the visitor's fields. */
export function hoursDatesExampleValues(): HoursDatesValues {
  const now = new Date();
  const today = toISODateUTC(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  return { startDate: today, startTime: '08:30', endDate: today, endTime: '17:30' };
}
