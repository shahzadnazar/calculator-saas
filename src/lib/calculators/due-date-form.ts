/**
 * Due-date form binding — the reference's four dating methods, on the UNCHANGED
 * standard-form runtime.
 *
 * The visitor chooses how they are dating the pregnancy — last period, conception date, an
 * ultrasound, or an IVF transfer — and only that method's fields are shown and validated.
 * All four resolve to a last menstrual period, from which the due date is 280 days; the
 * arithmetic for each route is in the reviewed pure `due-date.ts`, and the form layer around
 * it — field names, messages, precedence, per-method validation — is shared with the
 * pregnancy calculator in `dating-method-form.ts`. This calculator cannot offer the fifth
 * method, Due Date: that would be asking for its own answer.
 *
 * The medical disclaimer belongs to the ISLAND, not to this binding: it must be visible
 * without interaction and outside the live region, which is a markup question.
 */
import {
  dueDateFromLMP,
  conceptionFromLMP,
  gestationalAge,
  milestones,
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
import {
  MSG,
  SCAN_WEEKS_MAX,
  todayISO,
  longDate,
  shortDate,
  isStrictCalendarDate,
  cycleError,
  scanAgeError,
  validateDating,
  resolveLmp,
  readDatingValues,
  resetDatingValues,
  type DatingValues,
} from './dating-method-form';
import { parseISODateUTC } from './age';
import { toISODateUTC } from './date-duration';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
} from '@lib/result/form-runtime';

export {
  DATING_METHODS,
  EMBRYO_AGES,
  CYCLE_MIN,
  CYCLE_MAX,
  REFERENCE_CYCLE_DAYS,
  GESTATION_DAYS,
  SCAN_WEEKS_MAX,
  MSG,
  todayISO,
  longDate,
  shortDate,
  isStrictCalendarDate,
  cycleError,
  scanAgeError,
  resolveLmp,
};
export type { DatingMethod, EmbryoAge };

/** The four methods this calculator offers, in the reference's order. */
export const DUE_DATE_METHODS: DatingMethod[] = DATING_METHODS.map((m) => m.value);

/** Every dating field; this calculator simply never shows or reads `dueDate`. */
export type DueDateValues = DatingValues;

/** Validation for the four methods this calculator offers. */
export const validateDueDate = validateDating;

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

const ord = (n: 1 | 2 | 3): string => (n === 1 ? '1st' : n === 2 ? '2nd' : '3rd');

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

const INVALID = new Date(Number.NaN);

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

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

export const dueDateBinding: FormCalculatorBinding<DueDateValues, DueDateComputed> = {
  readValues(root) {
    return readDatingValues(root, DUE_DATE_METHODS);
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
    resetDatingValues(root, 'lmp');
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
    dueDate: '',
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
