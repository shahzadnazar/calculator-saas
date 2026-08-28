/**
 * Due-date form binding — the reference's four dating methods, on the UNCHANGED
 * standard-form runtime.
 *
 * The visitor chooses how they are dating the pregnancy — last period, conception date, an
 * ultrasound, or an IVF transfer — and only that method's fields are shown and validated.
 * All four resolve to a last menstrual period, from which the due date is 280 days; the
 * arithmetic for each route is in the reviewed pure `due-date.ts`.
 *
 * Dates are pinned to UTC midnight so a due date never moves by a day across a timezone or
 * a daylight-saving boundary. Field-error MESSAGES stay here per the R7B.1 policy.
 *
 * The medical disclaimer belongs to the ISLAND, not to this binding: it must be visible
 * without interaction and outside the live region, which is a markup question.
 */
import {
  dueDateFromLMP,
  conceptionFromLMP,
  gestationalAge,
  milestones,
  lmpFromCycle,
  lmpFromConception,
  lmpFromUltrasound,
  lmpFromIvfTransfer,
  DATING_METHODS,
  EMBRYO_AGES,
  CYCLE_MIN,
  CYCLE_MAX,
  REFERENCE_CYCLE_DAYS,
  GESTATION_DAYS,
  type DatingMethod,
  type EmbryoAge,
  type GestationalAge,
  type Milestone,
} from './due-date';
import { parseISODateUTC } from './age';
import { toISODateUTC } from './date-duration';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export {
  DATING_METHODS,
  EMBRYO_AGES,
  CYCLE_MIN,
  CYCLE_MAX,
  REFERENCE_CYCLE_DAYS,
  GESTATION_DAYS,
};
export type { DatingMethod, EmbryoAge };

/** The longest a scan can sensibly report. */
export const SCAN_WEEKS_MAX = 42;

export interface DueDateValues {
  method: DatingMethod;
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

export interface DueDateComputed {
  method: DatingMethod;
  /** The LMP every method resolves to. */
  lmpISO: string;
  today: string;
  dueDate: Date;
  conceptionDate: Date;
  age: GestationalAge;
  milestones: Milestone[];
  /** The estimated due date is before the visitor's local today. */
  pastDue: boolean;
}

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
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const ord = (n: 1 | 2 | 3): string => (n === 1 ? '1st' : n === 2 ? '2nd' : '3rd');

/* ------------------------------------------------------------------ */
/* Validation (pure)                                                   */
/* ------------------------------------------------------------------ */

/**
 * A structurally valid civil calendar date. The raw string must round-trip EXACTLY through
 * the primitive, which rejects the frozen roll-over of impossible components (2023-02-30 →
 * 2023-03-02) and non-canonical formatting (2026-1-2) without replacing the parser.
 */
export function isStrictCalendarDate(raw: string): boolean {
  const d = parseISODateUTC(raw);
  return !!d && Number.isFinite(d.getTime()) && toISODateUTC(d) === raw;
}

type DateCheck = { required: string; invalid: string; future: string };

/** Required → a real calendar date → not in the future. In that order, always. */
function checkDate(raw: string, today: string, msg: DateCheck): string | null {
  if ((raw ?? '').trim() === '') return msg.required;
  if (!isStrictCalendarDate(raw)) return msg.invalid;
  const value = parseISODateUTC(raw)!;
  const now = parseISODateUTC(today);
  if (now && value.getTime() > now.getTime()) return msg.future;
  return null;
}

/** Optional; a blank cycle means the textbook 28 days rather than an error. */
export function cycleError(raw: string): string | null {
  const t = (raw ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < CYCLE_MIN || n > CYCLE_MAX) return MSG.cycleRange;
  return null;
}

/** The scan's gestational age: weeks and days, at least one of them present. */
export function scanAgeError(weeksRaw: string, daysRaw: string): string | null {
  const w = (weeksRaw ?? '').trim();
  const dd = (daysRaw ?? '').trim();
  if (w === '' && dd === '') return MSG.scanAgeRequired;
  const weeks = w === '' ? 0 : Number(w);
  const days = dd === '' ? 0 : Number(dd);
  if (w !== '' && (!Number.isFinite(weeks) || !Number.isInteger(weeks) || weeks < 0 || weeks > SCAN_WEEKS_MAX)) {
    return MSG.scanWeeksRange;
  }
  if (dd !== '' && (!Number.isFinite(days) || !Number.isInteger(days) || days < 0 || days > 6)) {
    return MSG.scanDaysRange;
  }
  if (weeks * 7 + days <= 0) return MSG.scanAgeRequired;
  return null;
}

export function validateDueDate(v: DueDateValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  switch (v.method) {
    case 'lmp': {
      const e = checkDate(v.lmp, v.today, {
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
      const e = checkDate(v.conception, v.today, {
        required: MSG.conceptionRequired,
        invalid: MSG.conceptionInvalid,
        future: MSG.conceptionFuture,
      });
      if (e) fieldErrors.conception = e;
      break;
    }
    case 'ultrasound': {
      const e = checkDate(v.scanDate, v.today, {
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
      const e = checkDate(v.transferDate, v.today, {
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

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

const INVALID = new Date(Number.NaN);

/** The LMP the chosen method resolves to, or an invalid date if it cannot. */
export function resolveLmp(v: DueDateValues): Date {
  switch (v.method) {
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

export function computeDueDate(v: DueDateValues): DueDateComputed {
  const lmp = resolveLmp(v);
  const today = parseISODateUTC(v.today) ?? lmp;
  const dueDate = Number.isFinite(lmp.getTime()) ? dueDateFromLMP(lmp) : INVALID;
  return {
    method: v.method,
    lmpISO: Number.isFinite(lmp.getTime()) ? toISODateUTC(lmp) : '',
    today: v.today,
    dueDate,
    conceptionDate: Number.isFinite(lmp.getTime()) ? conceptionFromLMP(lmp) : INVALID,
    age: gestationalAge(lmp, today),
    milestones: Number.isFinite(lmp.getTime()) ? milestones(lmp) : [],
    pastDue:
      Number.isFinite(dueDate.getTime()) &&
      Number.isFinite(today.getTime()) &&
      dueDate.getTime() < today.getTime(),
  };
}

/**
 * The finiteness sentinel: the due-date timestamp, finite only when the chosen method
 * resolved to a real LMP and the whole timeline came with it.
 */
export function completeDueDateValue(r: DueDateComputed): number {
  if (!Number.isFinite(r.dueDate.getTime())) return Number.NaN;
  if (r.milestones.length === 0) return Number.NaN;
  for (const m of r.milestones) if (!Number.isFinite(m.date.getTime())) return Number.NaN;
  return r.dueDate.getTime();
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

export interface DuePresentation {
  due: string;
  along: string;
  trimester: string;
  interpretation: string;
}

export function presentDueDate(r: DueDateComputed): DuePresentation {
  const due = longDate(r.dueDate);
  if (r.pastDue) {
    return {
      due,
      along: '—',
      trimester: '—',
      interpretation: 'The estimated due date has passed. Check the entered date if this is unexpected.',
    };
  }
  const { weeks, days, trimester, daysRemaining } = r.age;
  return {
    due,
    along: `${weeks}w ${days}d`,
    trimester: ord(trimester),
    interpretation: `You are ${weeks} weeks and ${days} days along, in the ${ord(trimester)} trimester, with about ${daysRemaining} days to go.`,
  };
}

/**
 * Concise accessible announcement — the dominant due date only, never the whole
 * timeline. Past due is announced too: it is the one fact a screen-reader user would
 * otherwise miss, because the "how far along" pair reads as an em dash.
 */
export function describeDueDate(r: DueDateComputed): string {
  const due = longDate(r.dueDate);
  return r.pastDue
    ? `Estimated due date: ${due}. This estimated date has passed.`
    : `Estimated due date: ${due}.`;
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
const readValue = (root: HTMLElement, name: string) => field(root, name)?.value ?? '';
const readChecked = (root: HTMLElement, name: string, fallback: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value ?? fallback;

const VALID_METHODS = new Set<string>(DATING_METHODS.map((m) => m.value));

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

export const dueDateBinding: FormCalculatorBinding<DueDateValues, DueDateComputed> = {
  readValues(root) {
    const method = readChecked(root, 'method', 'lmp');
    return {
      method: (VALID_METHODS.has(method) ? method : 'lmp') as DatingMethod,
      lmp: readValue(root, 'lmp'),
      cycleDays: readValue(root, 'cycleDays'),
      conception: readValue(root, 'conception'),
      scanDate: readValue(root, 'scanDate'),
      scanWeeks: readValue(root, 'scanWeeks'),
      scanDays: readValue(root, 'scanDays'),
      transferDate: readValue(root, 'transferDate'),
      embryoAge: readValue(root, 'embryoAge') || '5',
      today: todayISO(),
    };
  },

  validate: validateDueDate,

  compute: computeDueDate,

  resultValue: completeDueDateValue,

  describeResult: describeDueDate,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    const view = presentDueDate(result);

    set('[data-dd-due]', view.due);
    set('[data-dd-along]', view.along);
    set('[data-dd-trimester]', view.trimester);
    set('[data-dd-interpretation]', view.interpretation);

    for (const m of result.milestones) {
      const row = scope.querySelector<HTMLElement>(`[data-milestone="${m.key}"]`);
      if (!row) continue;
      const dateCell = row.querySelector<HTMLElement>('[data-milestone-date]');
      const weekCell = row.querySelector<HTMLElement>('[data-milestone-week]');
      if (dateCell) dateCell.textContent = shortDate(m.date);
      if (weekCell) weekCell.textContent = `${m.weeks} weeks`;
    }
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of [
      'lmp',
      'cycleDays',
      'conception',
      'scanDate',
      'scanWeeks',
      'scanDays',
      'transferDate',
    ]) {
      const el = field(root, name);
      if (el) el.value = '';
    }
    const embryo = field(root, 'embryoAge');
    if (embryo) embryo.value = '5';
    root.querySelectorAll<HTMLInputElement>('[name="method"]').forEach((el) => {
      el.checked = el.value === 'lmp';
    });
  },
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * An LMP ten weeks before today, so the labelled example always shows a live pregnancy
 * rather than one that quietly went past due as the months rolled by. It is OURS, not the
 * visitor's; their fields load and stay empty behind it.
 */
export function dueDateExampleValues(): DueDateValues {
  const today = todayISO();
  const lmp = parseISODateUTC(today)!;
  lmp.setUTCDate(lmp.getUTCDate() - 70);
  return {
    method: 'lmp',
    lmp: toISODateUTC(lmp),
    cycleDays: '',
    conception: '',
    scanDate: '',
    scanWeeks: '',
    scanDays: '',
    transferDate: '',
    embryoAge: '5',
    today,
  };
}
