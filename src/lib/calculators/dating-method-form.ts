/**
 * The form layer shared by the two gestational calculators: reading a dating method's
 * fields, validating them, and resolving whichever one the visitor chose to a last
 * menstrual period.
 *
 * Both the due-date and pregnancy calculators put the same question to the visitor — how
 * are you dating this pregnancy? — and differ only in which methods they offer and what
 * they do with the answer. Due Date offers four; Pregnancy offers those four plus the due
 * date itself, for someone who already has one from their provider and wants the schedule
 * that goes with it. The arithmetic for every route lives in the reviewed pure `due-date.ts`;
 * what lives here is the part a FORM needs: field names, messages, precedence and the
 * per-method validation.
 *
 * One shape carries every method's fields. A calculator that does not offer a method simply
 * never reads or renders its fields, and `readDatingValues` refuses a method that is not on
 * that calculator's own list — so a value from a method the calculator does not offer can
 * never reach a result.
 *
 * Dates are pinned to UTC midnight so no estimate moves by a day across a timezone or a
 * daylight-saving boundary.
 */
import {
  lmpFromDueDate,
  lmpFromCycle,
  lmpFromConception,
  lmpFromUltrasound,
  lmpFromIvfTransfer,
  CYCLE_MIN,
  CYCLE_MAX,
  REFERENCE_CYCLE_DAYS,
  GESTATION_DAYS,
  type DatingMethod,
  type EmbryoAge,
} from './due-date';
import { parseISODateUTC } from './age';
import { toISODateUTC } from './date-duration';
import type { ValidationResult } from '@lib/result/form-runtime';

/** The longest a scan can sensibly report. */
export const SCAN_WEEKS_MAX = 42;

/**
 * Every dating field, in one shape. Each calculator fills only the ones it offers; the rest
 * stay empty strings and are never read, because validation and resolution both switch on
 * the chosen method first.
 */
export interface DatingValues {
  method: DatingMethod;
  /* Due Date */
  dueDate: string;
  /* Last Period */
  lmp: string;
  cycleDays: string;
  /* Conception Date */
  conception: string;
  /* Ultrasound */
  scanDate: string;
  scanWeeks: string;
  scanDays: string;
  /* IVF Transfer Date */
  transferDate: string;
  embryoAge: string;
  /** Visitor's local calendar date pinned to UTC midnight, ISO (captured at read time). */
  today: string;
}

export const MSG = {
  dueRequired: 'Enter your estimated due date.',
  dueInvalid: 'Enter a valid due date.',
  dueTooFar: 'Enter a due date within the next 40 weeks.',
  lmpRequired: 'Enter the first day of your last menstrual period.',
  lmpInvalid: 'Enter a valid last menstrual period date.',
  lmpFuture: 'Enter a last menstrual period date that is not in the future.',
  cycleRange: `Enter a cycle length from ${CYCLE_MIN} to ${CYCLE_MAX} days.`,
  conceptionRequired: 'Enter the conception date.',
  conceptionInvalid: 'Enter a valid conception date.',
  conceptionFuture: 'Enter a conception date that is not in the future.',
  scanRequired: 'Enter the date of the ultrasound.',
  scanInvalid: 'Enter a valid ultrasound date.',
  scanFuture: 'Enter an ultrasound date that is not in the future.',
  scanAgeRequired: 'Enter how far along the scan said you were.',
  scanWeeksRange: `Enter scan weeks from 0 to ${SCAN_WEEKS_MAX}.`,
  scanDaysRange: 'Enter scan days from 0 to 6.',
  transferRequired: 'Enter the IVF transfer date.',
  transferInvalid: 'Enter a valid IVF transfer date.',
  transferFuture: 'Enter an IVF transfer date that is not in the future.',
} as const;

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

/** The visitor's LOCAL calendar Y/M/D, pinned to UTC midnight, as ISO. */
export function todayISO(): string {
  const d = new Date();
  return toISODateUTC(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}

/** Long-form, UTC-stable date (e.g. "Monday, October 7, 2024"). */
export function longDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Short form for a dense table row. */
export function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * A structurally valid civil calendar date. The raw string must round-trip EXACTLY through
 * the primitive, which rejects the frozen roll-over of impossible components (2023-02-30 →
 * 2023-03-02) and non-canonical formatting (2026-1-2) without replacing the parser.
 */
export function isStrictCalendarDate(raw: string): boolean {
  const d = parseISODateUTC(raw);
  return !!d && Number.isFinite(d.getTime()) && toISODateUTC(d) === raw;
}

/* ------------------------------------------------------------------ */
/* Field checks (pure)                                                 */
/* ------------------------------------------------------------------ */

type DateCheck = { required: string; invalid: string; future: string };

/** Required → a real calendar date → not in the future. In that order, always. */
export function checkPastDate(raw: string, today: string, msg: DateCheck): string | null {
  if ((raw ?? '').trim() === '') return msg.required;
  if (!isStrictCalendarDate(raw)) return msg.invalid;
  const value = parseISODateUTC(raw)!;
  const now = parseISODateUTC(today);
  if (now && value.getTime() > now.getTime()) return msg.future;
  return null;
}

/**
 * The due date is the one field that SHOULD normally be in the future, so the future rule is
 * replaced by its consequence: a due date more than 280 days out implies a last period that
 * has not happened yet, which is not a pregnancy anyone can be dating.
 */
export function dueDateError(raw: string, today: string): string | null {
  if ((raw ?? '').trim() === '') return MSG.dueRequired;
  if (!isStrictCalendarDate(raw)) return MSG.dueInvalid;
  const value = parseISODateUTC(raw)!;
  const now = parseISODateUTC(today);
  if (now && lmpFromDueDate(value).getTime() > now.getTime()) return MSG.dueTooFar;
  return null;
}

/** Optional; a blank cycle means the textbook 28 days rather than an error. */
export function cycleError(raw: string): string | null {
  const t = (raw ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < CYCLE_MIN || n > CYCLE_MAX) {
    return MSG.cycleRange;
  }
  return null;
}

/** The scan's gestational age: weeks and days, at least one of them present. */
export function scanAgeError(weeksRaw: string, daysRaw: string): string | null {
  const w = (weeksRaw ?? '').trim();
  const dd = (daysRaw ?? '').trim();
  if (w === '' && dd === '') return MSG.scanAgeRequired;
  const weeks = w === '' ? 0 : Number(w);
  const days = dd === '' ? 0 : Number(dd);
  if (
    w !== '' &&
    (!Number.isFinite(weeks) || !Number.isInteger(weeks) || weeks < 0 || weeks > SCAN_WEEKS_MAX)
  ) {
    return MSG.scanWeeksRange;
  }
  if (dd !== '' && (!Number.isFinite(days) || !Number.isInteger(days) || days < 0 || days > 6)) {
    return MSG.scanDaysRange;
  }
  if (weeks * 7 + days <= 0) return MSG.scanAgeRequired;
  return null;
}

/* ------------------------------------------------------------------ */
/* Validation + resolution (pure)                                      */
/* ------------------------------------------------------------------ */

/** Only the chosen method's fields are validated; the others are not on screen. */
export function validateDating(v: DatingValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  switch (v.method) {
    case 'due': {
      const e = dueDateError(v.dueDate, v.today);
      if (e) fieldErrors.dueDate = e;
      break;
    }
    case 'lmp': {
      const e = checkPastDate(v.lmp, v.today, {
        required: MSG.lmpRequired,
        invalid: MSG.lmpInvalid,
        future: MSG.lmpFuture,
      });
      if (e) fieldErrors.lmp = e;
      const c = cycleError(v.cycleDays);
      if (c) fieldErrors.cycleDays = c;
      break;
    }
    case 'conception': {
      const e = checkPastDate(v.conception, v.today, {
        required: MSG.conceptionRequired,
        invalid: MSG.conceptionInvalid,
        future: MSG.conceptionFuture,
      });
      if (e) fieldErrors.conception = e;
      break;
    }
    case 'ultrasound': {
      const e = checkPastDate(v.scanDate, v.today, {
        required: MSG.scanRequired,
        invalid: MSG.scanInvalid,
        future: MSG.scanFuture,
      });
      if (e) fieldErrors.scanDate = e;
      const a = scanAgeError(v.scanWeeks, v.scanDays);
      if (a) fieldErrors.scanAge = a;
      break;
    }
    case 'ivf': {
      const e = checkPastDate(v.transferDate, v.today, {
        required: MSG.transferRequired,
        invalid: MSG.transferInvalid,
        future: MSG.transferFuture,
      });
      if (e) fieldErrors.transferDate = e;
      break;
    }
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

const INVALID = new Date(Number.NaN);

/** The LMP the chosen method resolves to, or an invalid date if it cannot. */
export function resolveLmp(v: DatingValues): Date {
  switch (v.method) {
    case 'due': {
      const due = parseISODateUTC(v.dueDate);
      return due ? lmpFromDueDate(due) : INVALID;
    }
    case 'lmp': {
      const lmp = parseISODateUTC(v.lmp);
      if (!lmp) return INVALID;
      const raw = (v.cycleDays ?? '').trim();
      const cycle = raw === '' ? REFERENCE_CYCLE_DAYS : Number(raw);
      return lmpFromCycle(lmp, cycle);
    }
    case 'conception': {
      const c = parseISODateUTC(v.conception);
      return c ? lmpFromConception(c) : INVALID;
    }
    case 'ultrasound': {
      const scan = parseISODateUTC(v.scanDate);
      if (!scan) return INVALID;
      const weeks = (v.scanWeeks ?? '').trim() === '' ? 0 : Number(v.scanWeeks);
      const days = (v.scanDays ?? '').trim() === '' ? 0 : Number(v.scanDays);
      if (!Number.isFinite(weeks) || !Number.isFinite(days)) return INVALID;
      return lmpFromUltrasound(scan, weeks, days);
    }
    case 'ivf': {
      const transfer = parseISODateUTC(v.transferDate);
      if (!transfer) return INVALID;
      const age = Number(v.embryoAge) === 5 ? 5 : 3;
      return lmpFromIvfTransfer(transfer, age as EmbryoAge);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Reading the form                                                    */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
const value = (root: HTMLElement, name: string) => control(root, name)?.value ?? '';

/**
 * Read every dating field, falling back to the calculator's first offered method if the
 * checked radio names one it does not offer — so a method a calculator never shows can never
 * be validated or resolved against.
 */
export function readDatingValues(root: HTMLElement, offered: DatingMethod[]): DatingValues {
  const checked = root.querySelector<HTMLInputElement>('[name="method"]:checked')?.value ?? '';
  const method = (offered as string[]).includes(checked)
    ? (checked as DatingMethod)
    : offered[0];
  return {
    method,
    dueDate: value(root, 'dueDate'),
    lmp: value(root, 'lmp'),
    cycleDays: value(root, 'cycleDays'),
    conception: value(root, 'conception'),
    scanDate: value(root, 'scanDate'),
    scanWeeks: value(root, 'scanWeeks'),
    scanDays: value(root, 'scanDays'),
    transferDate: value(root, 'transferDate'),
    embryoAge: value(root, 'embryoAge') || '5',
    today: todayISO(),
  };
}

/** Every dating field a reset must clear, and the one that has a default. */
export function resetDatingValues(root: HTMLElement, firstMethod: DatingMethod): void {
  for (const name of [
    'dueDate',
    'lmp',
    'cycleDays',
    'conception',
    'scanDate',
    'scanWeeks',
    'scanDays',
    'transferDate',
  ]) {
    const el = control(root, name);
    if (el) el.value = '';
  }
  const embryo = control(root, 'embryoAge');
  if (embryo) embryo.value = '5';
  root.querySelectorAll<HTMLInputElement>('[name="method"]').forEach((el) => {
    el.checked = el.value === firstMethod;
  });
}

export { CYCLE_MIN, CYCLE_MAX, REFERENCE_CYCLE_DAYS, GESTATION_DAYS };
export type { DatingMethod, EmbryoAge };
