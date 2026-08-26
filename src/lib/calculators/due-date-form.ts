/**
 * Due Date form binding (R14B1 — Gestational pilot, 1 of 2).
 *
 * The fleet's FIRST date-input migration. Wraps the UNCHANGED gestational engine
 * (`dueDateFromLMP` / `conceptionFromLMP` / `gestationalAge`, frozen by
 * due-date.test.ts) and the UNCHANGED shared date primitives (`parseISODateUTC`,
 * `toISODateUTC`). Everything here is at the VALIDATION / PRESENTATION boundary.
 *
 * Date semantics (§2): the LMP is a civil calendar date parsed strictly as
 * YYYY-MM-DD → UTC midnight; all arithmetic is UTC (DST-independent). The
 * visitor's "today" is their LOCAL calendar Y/M/D pinned to UTC midnight
 * (`todayISO`) — so "how far along today" reflects the viewer's own date while
 * the math stays timezone-stable. `today` is captured at readValues time and
 * threaded through the pure functions so validation/compute/guard are fully
 * testable with an injected date.
 *
 * Product decisions (R14B1):
 *   • Task-first: the LMP starts EMPTY; the visitor presses "Calculate Due Date"
 *     for the first result; live-after-first thereafter.
 *   • A future LMP is INVALID (§3) — "Enter a last menstrual period date that is
 *     not in the future." (the island also sets the picker max to today; the
 *     binding enforces the same rule independently).
 *   • The dominant result is the estimated due date (a clock-free function of the
 *     LMP). Secondary "how far along" + trimester render only while the pregnancy
 *     is ongoing (LMP within the last 280 days).
 *   • Past-due (§4): when the estimated due date is before the visitor's local
 *     today, keep the due date visible with a neutral "has passed" interpretation
 *     and DO NOT render unbounded current gestational progress.
 *   • The complete-result guard lives in the ordinary `resultValue` (returns the
 *     finite due-date timestamp only when the whole result reconciles, else a NaN
 *     sentinel). There is NO `isUsableResult`.
 */
import {
  dueDateFromLMP,
  conceptionFromLMP,
  gestationalAge,
  GESTATION_DAYS,
  type GestationalAge,
} from './due-date';
import { parseISODateUTC } from './age';
import { toISODateUTC } from './date-duration';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export interface DueDateValues {
  /** Raw LMP string from the date input. */
  lmp: string;
  /** Visitor's local calendar date pinned to UTC midnight, ISO (captured at read time). */
  today: string;
}

export interface DueDateComputed {
  lmpISO: string;
  today: string;
  dueDate: Date;
  conceptionDate: Date;
  age: GestationalAge;
  /** The estimated due date is before the visitor's local today. */
  pastDue: boolean;
}

/** The visitor's LOCAL calendar Y/M/D, pinned to UTC midnight, as ISO (§2). */
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

const ord = (n: 1 | 2 | 3): string => (n === 1 ? '1st' : n === 2 ? '2nd' : '3rd');

const REQUIRED_MSG = 'Enter the first day of your last menstrual period.';
const INVALID_CALENDAR_MSG = 'Enter a valid last menstrual period date.';
const FUTURE_MSG = 'Enter a last menstrual period date that is not in the future.';

/* ------------------------------------------------------------------ */
/* Validation (pure) — required → strict calendar date → not future    */
/* ------------------------------------------------------------------ */

/**
 * A structurally valid civil calendar date (R14B1.1). The raw string must
 * round-trip EXACTLY through the UNCHANGED primitive —
 * `toISODateUTC(parseISODateUTC(raw)) === raw` — which rejects the frozen
 * roll-over of impossible components (e.g. `2023-02-30` → `2023-03-02`, `2026-13-01`
 * → `2027-01-01`) and non-canonical formatting (`2026-1-2`) WITHOUT replacing the
 * parser. The primitive stays exactly as characterized in due-date.test.ts.
 */
export function isStrictCalendarDate(raw: string): boolean {
  const d = parseISODateUTC(raw);
  return !!d && Number.isFinite(d.getTime()) && toISODateUTC(d) === raw;
}

/**
 * Validation precedence: (1) required, (2) a valid civil calendar date (strict
 * round-trip), (3) not in the future (relative to the visitor's local today).
 */
export function validateDueDate(v: DueDateValues): ValidationResult {
  const raw = v.lmp ?? '';
  if (raw.trim() === '') return { ok: false, fieldErrors: { lmp: REQUIRED_MSG } };
  if (!isStrictCalendarDate(raw)) return { ok: false, fieldErrors: { lmp: INVALID_CALENDAR_MSG } };
  const lmp = parseISODateUTC(raw)!;
  const today = parseISODateUTC(v.today);
  if (today && lmp.getTime() > today.getTime()) {
    return { ok: false, fieldErrors: { lmp: FUTURE_MSG } };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — unchanged engine pass-through                  */
/* ------------------------------------------------------------------ */

export function computeDueDate(v: DueDateValues): DueDateComputed {
  const lmp = parseISODateUTC(v.lmp) ?? new Date(Number.NaN);
  const today = parseISODateUTC(v.today) ?? lmp;
  const dueDate = dueDateFromLMP(lmp);
  return {
    lmpISO: v.lmp,
    today: v.today,
    dueDate,
    conceptionDate: conceptionFromLMP(lmp),
    age: gestationalAge(lmp, today),
    pastDue: dueDate.getTime() < today.getTime(),
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN;

/**
 * The finite due-date timestamp — but ONLY when the whole result reconciles with
 * the unchanged engine: LMP parses, due date = LMP+280, conception = LMP+14, and
 * (for an ongoing pregnancy) the gestational block is finite, in-range, bounded to
 * ≤ 280 days and matches `gestationalAge(lmp, today)`. Past-due results validate
 * the due/conception relationships only (the unbounded active block is not
 * rendered). Any failure returns the NaN sentinel — NO `isUsableResult`.
 */
export function completeDueDateValue(r: DueDateComputed): number {
  const lmp = parseISODateUTC(r.lmpISO);
  if (!lmp) return FAIL;

  const t = r.dueDate instanceof Date ? r.dueDate.getTime() : Number.NaN;
  if (!Number.isFinite(t) || t !== dueDateFromLMP(lmp).getTime()) return FAIL;

  const c = r.conceptionDate instanceof Date ? r.conceptionDate.getTime() : Number.NaN;
  if (!Number.isFinite(c) || c !== conceptionFromLMP(lmp).getTime()) return FAIL;

  if (!r.pastDue) {
    const a = r.age;
    if (!a) return FAIL;
    if (!Number.isInteger(a.totalDays) || a.totalDays < 0 || a.totalDays > GESTATION_DAYS) return FAIL;
    if (!Number.isInteger(a.weeks) || a.weeks < 0) return FAIL;
    if (!Number.isInteger(a.days) || a.days < 0 || a.days > 6) return FAIL;
    if (a.trimester !== 1 && a.trimester !== 2 && a.trimester !== 3) return FAIL;
    if (!Number.isFinite(a.progressPct) || a.progressPct < 0 || a.progressPct > 100) return FAIL;
    if (!Number.isFinite(a.daysRemaining) || a.daysRemaining < 0) return FAIL;
    const today = parseISODateUTC(r.today);
    if (!today) return FAIL;
    const expected = gestationalAge(lmp, today);
    if (
      a.totalDays !== expected.totalDays ||
      a.weeks !== expected.weeks ||
      a.days !== expected.days ||
      a.trimester !== expected.trimester ||
      a.daysRemaining !== expected.daysRemaining
    ) {
      return FAIL;
    }
  }
  // Past-due: due/conception relationships validated above; the active gestational
  // block is intentionally not rendered, so it is not re-validated here.
  return t;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

export interface DuePresentation {
  dueDate: string;
  along: string;
  trimester: string;
  interpretation: string;
  pastDue: boolean;
}

export function presentDueDate(r: DueDateComputed): DuePresentation {
  const due = longDate(r.dueDate);
  if (r.pastDue) {
    return {
      dueDate: due,
      along: '—',
      trimester: '—',
      pastDue: true,
      interpretation: 'The estimated due date has passed. Check the entered date if this is unexpected.',
    };
  }
  return {
    dueDate: due,
    along: `${r.age.weeks}w ${r.age.days}d`,
    trimester: ord(r.age.trimester),
    pastDue: false,
    interpretation: `Based on the entered last menstrual period, the estimated due date is ${due}.`,
  };
}

/** Concise announcement — the dominant due date only (§10). */
export function describeDueDate(r: DueDateComputed): string {
  const due = longDate(r.dueDate);
  return r.pastDue
    ? `Estimated due date: ${due}. This estimated date has passed.`
    : `Estimated due date: ${due}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const dueDateBinding: FormCalculatorBinding<DueDateValues, DueDateComputed> = {
  readValues(root) {
    return { lmp: control(root, 'lmp')?.value ?? '', today: todayISO() };
  },

  validate: validateDueDate,

  compute: computeDueDate,

  /** The finite due-date timestamp when the whole result reconciles, else NaN — no isUsableResult. */
  resultValue: completeDueDateValue,

  describeResult: describeDueDate,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const p = presentDueDate(result);
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    set('[data-dd-due]', p.dueDate);
    set('[data-dd-along]', p.along);
    set('[data-dd-trimester]', p.trimester);
    set('[data-dd-interpretation]', p.interpretation);
  },

  resetValues(root, _mode: ResetMode) {
    const el = control(root, 'lmp');
    if (el) el.value = '';
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
export function dueDateExampleValues(): DueDateValues {
  const today = new Date();
  const lmp = new Date(today);
  lmp.setDate(lmp.getDate() - 70); // 10 weeks along
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { lmp: iso(lmp), today: iso(today) };
}
