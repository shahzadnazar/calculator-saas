/**
 * Pregnancy form binding (R14B2 — Gestational follow-on, 2 of 2).
 *
 * The SECOND date-input migration, sharing the locked date-input policy proven by
 * the Due Date pilot but kept fully SELF-CONTAINED: it wraps the UNCHANGED
 * `pregnancyInfo` engine (frozen by pregnancy.test.ts) and the UNCHANGED shared
 * date primitives (`parseISODateUTC`, `toISODateUTC`, `addDays`) directly, and
 * imports NOTHING from due-date-form.ts — the two gestational islands stay
 * independent (no shared gestational binding, no shared date-input binding).
 *
 * Date semantics (identical policy to Due Date): the LMP is a civil calendar date
 * parsed strictly as YYYY-MM-DD → UTC midnight; all arithmetic is UTC
 * (DST-independent). The visitor's "today" is their LOCAL calendar Y/M/D pinned to
 * UTC midnight (`todayISO`), captured at readValues time and threaded through the
 * pure functions so validation / compute / guard are fully testable with an
 * injected date.
 *
 * Product decisions (R14B2):
 *   • Task-first: the LMP starts EMPTY; the visitor presses "Calculate Pregnancy
 *     Progress" for the first result; live-after-first thereafter.
 *   • A future LMP is INVALID (the island also caps the picker at today; the
 *     binding enforces the same rule independently).
 *   • The DOMINANT result is the CURRENT gestational age while the pregnancy is
 *     ongoing (how far along — the calculator's whole purpose); once the estimated
 *     due date has PASSED it becomes the estimated due date with a neutral note and
 *     no unbounded current progress.
 *   • Two calculator-owned milestones — LMP+91 and LMP+189 — are labelled by when
 *     the next trimester BEGINS (they are exactly the first days of the 2nd and 3rd
 *     trimesters), not by "end of trimester".
 *   • The complete-result guard lives in the ordinary `resultValue`: it returns the
 *     finite due-date timestamp only when the WHOLE result reconciles with the
 *     unchanged engine (due = LMP+280, conception = LMP+14, milestones = LMP+91 /
 *     LMP+189, strictly increasing key dates, and — while ongoing — a finite,
 *     in-range gestational block that matches the engine), else a NaN sentinel.
 *     There is NO `isUsableResult`.
 */
import {
  dueDateFromLMP,
  conceptionFromLMP,
  gestationalAge,
  GESTATION_DAYS,
} from './due-date';
import { pregnancyInfo, type PregnancyInfo } from './pregnancy';
import { parseISODateUTC } from './age';
import { toISODateUTC, addDays } from './date-duration';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export interface PregnancyValues {
  /** Raw LMP string from the date input. */
  lmp: string;
  /** Visitor's local calendar date pinned to UTC midnight, ISO (captured at read time). */
  today: string;
}

export interface PregnancyComputed {
  lmpISO: string;
  today: string;
  info: PregnancyInfo;
  /** The estimated due date is before the visitor's local today. */
  pastDue: boolean;
}

/* ------------------------------------------------------------------ */
/* Date helpers (self-contained — no import from due-date-form)        */
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

/** Compact, UTC-stable date for the milestone timeline (e.g. "Oct 7, 2024"). */
export function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const ord = (n: 1 | 2 | 3): string => (n === 1 ? '1st' : n === 2 ? '2nd' : '3rd');

const REQUIRED_MSG = 'Enter your last menstrual period date.';
const INVALID_CALENDAR_MSG = 'Enter a valid last menstrual period date.';
const FUTURE_MSG = 'Enter a last menstrual period date that is not in the future.';

/* ------------------------------------------------------------------ */
/* Validation (pure) — required → strict calendar date → not future    */
/* ------------------------------------------------------------------ */

/**
 * A structurally valid civil calendar date. The raw string must round-trip
 * EXACTLY through the UNCHANGED primitive — `toISODateUTC(parseISODateUTC(raw))
 * === raw` — which rejects the frozen roll-over of impossible components
 * (`2023-02-30` → `2023-03-02`, `2026-13-01` → `2027-01-01`) and non-canonical
 * formatting (`2026-1-2`) WITHOUT replacing the parser (same policy as Due Date;
 * the primitive stays exactly as characterized).
 */
export function isStrictCalendarDate(raw: string): boolean {
  const d = parseISODateUTC(raw);
  return !!d && Number.isFinite(d.getTime()) && toISODateUTC(d) === raw;
}

/**
 * Validation precedence: (1) required, (2) a valid civil calendar date (strict
 * round-trip), (3) not in the future (relative to the visitor's local today).
 */
export function validatePregnancy(v: PregnancyValues): ValidationResult {
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

export function computePregnancy(v: PregnancyValues): PregnancyComputed {
  const lmp = parseISODateUTC(v.lmp) ?? new Date(Number.NaN);
  const today = parseISODateUTC(v.today) ?? lmp;
  const info = pregnancyInfo(lmp, today);
  return {
    lmpISO: v.lmp,
    today: v.today,
    info,
    pastDue: info.dueDate.getTime() < today.getTime(),
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN;

/**
 * The finite due-date timestamp — but ONLY when the whole result reconciles with
 * the unchanged engine: LMP parses; due = LMP+280; conception = LMP+14; the two
 * milestones = LMP+13·7 and LMP+27·7; the key dates are strictly increasing
 * (LMP < conception < 2nd-trimester < 3rd-trimester < due); and, for an ONGOING
 * pregnancy, the gestational block is finite, in-range, bounded to ≤ 280 days and
 * matches `gestationalAge(lmp, today)`. Past-due results validate the date
 * relationships only (the unbounded active block is not rendered). Any failure
 * returns the NaN sentinel — NO `isUsableResult`.
 */
export function completePregnancyValue(r: PregnancyComputed): number {
  const lmp = parseISODateUTC(r.lmpISO);
  if (!lmp) return FAIL;
  const lmpMs = lmp.getTime();
  const info = r.info;
  if (!info) return FAIL;

  const due = info.dueDate instanceof Date ? info.dueDate.getTime() : Number.NaN;
  if (!Number.isFinite(due) || due !== dueDateFromLMP(lmp).getTime()) return FAIL;

  const con = info.conceptionDate instanceof Date ? info.conceptionDate.getTime() : Number.NaN;
  if (!Number.isFinite(con) || con !== conceptionFromLMP(lmp).getTime()) return FAIL;

  const t1 = info.firstTrimesterEnd instanceof Date ? info.firstTrimesterEnd.getTime() : Number.NaN;
  if (!Number.isFinite(t1) || t1 !== addDays(lmp, 13 * 7).getTime()) return FAIL;

  const t2 = info.secondTrimesterEnd instanceof Date ? info.secondTrimesterEnd.getTime() : Number.NaN;
  if (!Number.isFinite(t2) || t2 !== addDays(lmp, 27 * 7).getTime()) return FAIL;

  // Strictly increasing key dates: LMP < conception < 2nd-trimester begins <
  // 3rd-trimester begins < due date.
  if (!(lmpMs < con && con < t1 && t1 < t2 && t2 < due)) return FAIL;

  if (!r.pastDue) {
    const a = info.age;
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
  // Past-due: date relationships validated above; the active gestational block is
  // intentionally not rendered, so it is not re-validated here.
  return due;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

export interface PregnancyPresentation {
  pastDue: boolean;
  /** Dominant hero: the current gestational age (ongoing) or the due date (past-due). */
  headline: string;
  /** Label above the hero: "Pregnancy progress" (ongoing) or "Estimated due date" (past-due). */
  headlineLabel: string;
  /** Prominent secondary (ongoing): the current trimester ordinal, e.g. "2nd". */
  trimester: string;
  /** Prominent secondary (ongoing): the estimated due date (short form). */
  dueSecondary: string;
  /** Supporting caption (ongoing): estimated time remaining, e.g. "19 weeks to go". */
  remaining: string;
  /** Progress-bar width, 0–100. Zero (and the bar hidden) when past-due. */
  progressPct: number;
  conception: string;
  /** LMP+91 — the day the second trimester begins. */
  secondTrimester: string;
  /** LMP+189 — the day the third trimester begins. */
  thirdTrimester: string;
  dueDate: string;
  interpretation: string;
}

export function presentPregnancy(r: PregnancyComputed): PregnancyPresentation {
  const info = r.info;
  const conception = shortDate(info.conceptionDate);
  const secondTrimester = shortDate(info.firstTrimesterEnd);
  const thirdTrimester = shortDate(info.secondTrimesterEnd);
  const dueShort = shortDate(info.dueDate);
  const dueLong = longDate(info.dueDate);

  if (r.pastDue) {
    // Past-due: the due date IS the dominant figure; the ongoing-state prominent
    // secondary (trimester + due date) and the live progress bar are suppressed.
    return {
      pastDue: true,
      headline: dueLong,
      headlineLabel: 'Estimated due date',
      trimester: '—',
      dueSecondary: '—',
      remaining: '',
      progressPct: 0,
      conception,
      secondTrimester,
      thirdTrimester,
      dueDate: dueShort,
      interpretation: 'The estimated due date has passed. Check the entered date if this is unexpected.',
    };
  }

  const a = info.age;
  const weeksToGo = Math.ceil(a.daysRemaining / 7);
  return {
    pastDue: false,
    headline: `${a.weeks} weeks, ${a.days} days`,
    headlineLabel: 'Pregnancy progress',
    trimester: ord(a.trimester),
    dueSecondary: dueShort,
    remaining: `${weeksToGo} ${weeksToGo === 1 ? 'week' : 'weeks'} to go`,
    progressPct: a.progressPct,
    conception,
    secondTrimester,
    thirdTrimester,
    dueDate: dueShort,
    interpretation: `Based on the entered last menstrual period, you are ${a.weeks} weeks and ${a.days} days along — the ${ord(a.trimester)} trimester — with an estimated due date of ${dueLong}.`,
  };
}

/** Concise announcement — the dominant figure plus the due date. */
export function describePregnancy(r: PregnancyComputed): string {
  const dueLong = longDate(r.info.dueDate);
  if (r.pastDue) {
    return `Estimated due date: ${dueLong}. This estimated date has passed.`;
  }
  const a = r.info.age;
  return `Pregnancy progress: ${a.weeks} weeks and ${a.days} days. Estimated due date: ${dueLong}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const pregnancyBinding: FormCalculatorBinding<PregnancyValues, PregnancyComputed> = {
  readValues(root) {
    return { lmp: control(root, 'lmp')?.value ?? '', today: todayISO() };
  },

  validate: validatePregnancy,

  compute: computePregnancy,

  /** The finite due-date timestamp when the whole result reconciles, else NaN — no isUsableResult. */
  resultValue: completePregnancyValue,

  describeResult: describePregnancy,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const p = presentPregnancy(result);
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    set('[data-pg-headline-label]', p.headlineLabel);
    set('[data-pg-headline]', p.headline);
    set('[data-pg-trimester]', p.trimester);
    set('[data-pg-due-secondary]', p.dueSecondary);
    set('[data-pg-remaining]', p.remaining);
    set('[data-pg-conception]', p.conception);
    set('[data-pg-second]', p.secondTrimester);
    set('[data-pg-third]', p.thirdTrimester);
    set('[data-pg-due]', p.dueDate);
    set('[data-pg-interpretation]', p.interpretation);
    const bar = scope.querySelector<HTMLElement>('[data-pg-bar]');
    if (bar) bar.style.width = `${p.progressPct}%`;
    // The prominent secondary (current trimester + estimated due date) and the live
    // progress bar are meaningful only while ongoing — suppress both once past-due.
    const secondary = scope.querySelector<HTMLElement>('[data-pg-secondary]');
    if (secondary) secondary.hidden = p.pastDue;
    const progress = scope.querySelector<HTMLElement>('[data-pg-progress]');
    if (progress) progress.hidden = p.pastDue;
  },

  resetValues(root, _mode: ResetMode) {
    const el = control(root, 'lmp');
    if (el) el.value = '';
  },
};
