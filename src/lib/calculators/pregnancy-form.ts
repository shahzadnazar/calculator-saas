/**
 * Pregnancy form binding — the reference's five dating methods, on the UNCHANGED
 * standard-form runtime.
 *
 * The visitor says how they are dating the pregnancy and gets the schedule that follows from
 * it. Five routes, because this calculator can accept the due date ITSELF: someone already
 * carrying a date from their provider wants the weeks-and-days and the milestones that go
 * with it, not a fresh estimate. The due-date calculator cannot offer that fifth route — it
 * would be asking for its own answer — so the two share the four they have in common through
 * `dating-method-form.ts` and diverge only on that one.
 *
 * Every route resolves to a last menstrual period, from which everything else follows. The
 * arithmetic is the reviewed pure `due-date.ts`; the pregnancy view of it — current
 * gestational age, trimester, progress, and the dated schedule with the visitor's own place
 * in it — is the UNCHANGED `pregnancyInfo` engine plus `pregnancySchedule`.
 *
 * Date semantics: every date is a civil calendar date parsed strictly as YYYY-MM-DD → UTC
 * midnight, so nothing moves by a day across a timezone or a daylight-saving boundary. The
 * visitor's "today" is their LOCAL calendar Y/M/D pinned the same way, captured at
 * readValues time and threaded through the pure functions so validation, compute and the
 * completeness guard are all testable with an injected date.
 *
 * Product decisions:
 *   • Task-first: every field starts EMPTY; the visitor presses "Calculate Pregnancy
 *     Progress" for the first result; live-after-first thereafter.
 *   • The DOMINANT result is the CURRENT gestational age while the pregnancy is ongoing
 *     (how far along — the calculator's whole purpose); once the estimated due date has
 *     PASSED it becomes the estimated due date with a neutral note and no unbounded current
 *     progress.
 *   • The two trimester milestones — LMP+91 and LMP+189 — are labelled by the trimester they
 *     BEGIN, because that is exactly what those days are.
 *   • The complete-result guard lives in the ordinary `resultValue`: it returns the finite
 *     due-date timestamp only when the WHOLE result reconciles with the unchanged engine,
 *     else a NaN sentinel. There is NO `isUsableResult`.
 */
import {
  dueDateFromLMP,
  conceptionFromLMP,
  gestationalAge,
  milestones,
  PREGNANCY_DATING_METHODS,
  EMBRYO_AGES,
  CYCLE_MIN,
  CYCLE_MAX,
  REFERENCE_CYCLE_DAYS,
  GESTATION_DAYS,
  type DatingMethod,
} from './due-date';
import {
  MSG,
  SCAN_WEEKS_MAX,
  todayISO,
  longDate,
  shortDate,
  isStrictCalendarDate,
  validateDating,
  resolveLmp,
  readDatingValues,
  resetDatingValues,
  type DatingValues,
} from './dating-method-form';
import { pregnancyInfo, pregnancySchedule, type PregnancyInfo, type ScheduleRow } from './pregnancy';
import { parseISODateUTC } from './age';
import { toISODateUTC, addDays } from './date-duration';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
} from '@lib/result/form-runtime';

export {
  PREGNANCY_DATING_METHODS,
  EMBRYO_AGES,
  CYCLE_MIN,
  CYCLE_MAX,
  REFERENCE_CYCLE_DAYS,
  SCAN_WEEKS_MAX,
  MSG,
  todayISO,
  longDate,
  shortDate,
  isStrictCalendarDate,
};
export type { DatingMethod };

/** The five methods this calculator offers, in the reference's order. */
export const PREGNANCY_METHODS: DatingMethod[] = PREGNANCY_DATING_METHODS.map((m) => m.value);

/** Every dating field; this calculator offers all five methods, so it reads them all. */
export type PregnancyValues = DatingValues;

/** Validation for the five methods this calculator offers. */
export const validatePregnancy = validateDating;

export interface PregnancyComputed {
  method: DatingMethod;
  /** The LMP every method resolves to. */
  lmpISO: string;
  today: string;
  info: PregnancyInfo;
  schedule: ScheduleRow[];
  /** The estimated due date is before the visitor's local today. */
  pastDue: boolean;
}

const ord = (n: 1 | 2 | 3): string => (n === 1 ? '1st' : n === 2 ? '2nd' : '3rd');

/* ------------------------------------------------------------------ */
/* Computation (pure) — unchanged engine pass-through                  */
/* ------------------------------------------------------------------ */

const INVALID = new Date(Number.NaN);

export function computePregnancy(v: PregnancyValues): PregnancyComputed {
  const lmp = resolveLmp(v);
  const usable = Number.isFinite(lmp.getTime());
  const today = parseISODateUTC(v.today) ?? lmp;
  const info = pregnancyInfo(usable ? lmp : INVALID, today);
  return {
    method: v.method,
    lmpISO: usable ? toISODateUTC(lmp) : '',
    today: v.today,
    info,
    schedule: usable ? pregnancySchedule(lmp, today) : [],
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
  // The schedule is rendered as fact, so it is held to the same standard: it must carry
  // every shared milestone, at the dates the engine says, in order — plus at most the one
  // TODAY row this calculator inserts. A schedule that does not reconcile fails the whole
  // result rather than printing a plausible-looking wrong date.
  const expectedRows = milestones(lmp);
  const scheduled = r.schedule ?? [];
  const todayRows = scheduled.filter((row) => row.isToday);
  if (todayRows.length > 1) return FAIL;
  const fixed = scheduled.filter((row) => !row.isToday);
  if (fixed.length !== expectedRows.length) return FAIL;
  for (let i = 0; i < expectedRows.length; i += 1) {
    const got = fixed[i];
    const want = expectedRows[i];
    if (!got || got.key !== want.key || got.label !== want.label) return FAIL;
    if (!(got.date instanceof Date) || got.date.getTime() !== want.date.getTime()) return FAIL;
    const age = gestationalAge(lmp, want.date);
    if (got.weeks !== age.weeks || got.days !== age.days) return FAIL;
  }
  for (let i = 1; i < scheduled.length; i += 1) {
    if (scheduled[i].date.getTime() < scheduled[i - 1].date.getTime()) return FAIL;
  }

  // Past-due: date relationships validated above; the active gestational block is
  // intentionally not rendered, so it is not re-validated here.
  return due;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

export interface ScheduleView {
  key: string;
  label: string;
  date: string;
  age: string;
  isToday: boolean;
}

export interface PregnancyPresentation {
  pastDue: boolean;
  /** The dated schedule, with the visitor's own row marked. */
  schedule: ScheduleView[];
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

/** Weeks and days, the way prenatal care says it. */
function ageLabel(weeks: number, days: number): string {
  return days === 0 ? `${weeks}w` : `${weeks}w ${days}d`;
}

function scheduleView(r: PregnancyComputed): ScheduleView[] {
  return (r.schedule ?? []).map((row) => ({
    key: row.key,
    label: row.label,
    date: shortDate(row.date),
    age: ageLabel(row.weeks, row.days),
    isToday: row.isToday,
  }));
}

/**
 * The interpretation names the route the visitor actually took. Saying "based on the entered
 * last menstrual period" to someone who typed a due date is simply wrong, and it is exactly
 * the sentence that tells them whether the calculator understood them.
 */
const LEAD_IN: Record<DatingMethod, string> = {
  due: 'From the due date you entered',
  lmp: 'Based on the entered last menstrual period',
  conception: 'Based on the conception date you entered',
  ultrasound: 'Based on the ultrasound you entered',
  ivf: 'Based on the IVF transfer date you entered',
};

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
      schedule: scheduleView(r),
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
    schedule: scheduleView(r),
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
    // The due date is the visitor's own input on that route, so it is confirmed rather than
    // presented back to them as an estimate.
    interpretation: `${LEAD_IN[r.method] ?? LEAD_IN.lmp}, you are ${a.weeks} weeks and ${a.days} days along — the ${ord(a.trimester)} trimester — with ${r.method === 'due' ? 'a' : 'an estimated'} due date of ${dueLong}.`,
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
    return readDatingValues(root, PREGNANCY_METHODS);
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

    // The schedule is a fixed set of milestone rows plus one optional TODAY row, so the
    // markup carries every row and this only fills them — no row is created or destroyed at
    // runtime, and the TODAY row moves down the list as the pregnancy progresses.
    const todayRow = scope.querySelector<HTMLElement>('[data-pg-row="today"]');
    for (const row of p.schedule) {
      const el = scope.querySelector<HTMLElement>(`[data-pg-row="${row.key}"]`);
      if (!el) continue;
      const date = el.querySelector<HTMLElement>('[data-pg-row-date]');
      const age = el.querySelector<HTMLElement>('[data-pg-row-age]');
      if (date) date.textContent = row.date;
      if (age) age.textContent = row.age;
    }
    if (todayRow) {
      const shown = p.schedule.find((row) => row.isToday);
      todayRow.hidden = !shown;
      // Reposition the visitor's own row: it belongs after the last milestone they have
      // already passed, which changes as the pregnancy progresses.
      if (shown) {
        const index = p.schedule.findIndex((row) => row.isToday);
        const after = p.schedule[index - 1];
        const anchor = after ? scope.querySelector<HTMLElement>(`[data-pg-row="${after.key}"]`) : null;
        const parent = todayRow.parentElement;
        if (parent) {
          if (anchor && anchor.parentElement === parent) anchor.after(todayRow);
          else parent.prepend(todayRow);
        }
      }
    }
    // The dominant slot carries two different shapes — "14 weeks, 2 days" while ongoing, a
    // full weekday date once past due — and one type size cannot serve both. Say which is
    // in there and let the stylesheet size it, exactly as the due-date calculator sizes the
    // same string.
    const headline = scope.querySelector<HTMLElement>('[data-pg-headline]');
    if (headline) headline.dataset.kind = p.pastDue ? 'date' : 'progress';
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
    resetDatingValues(root, 'due');
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
export function pregnancyExampleValues(): PregnancyValues {
  const today = todayISO();
  const base = parseISODateUTC(today)!;
  // Dated the way the form opens — from a due date — and placed 20 weeks along, so the
  // example always shows a live pregnancy rather than one that quietly went past due as the
  // months rolled by.
  const due = addDays(base, GESTATION_DAYS - 140);
  return {
    method: 'due',
    dueDate: toISODateUTC(due),
    lmp: '',
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
