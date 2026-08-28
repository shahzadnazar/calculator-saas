/**
 * Pregnancy dating. Pure and unit-tested. Shared by the due-date and pregnancy calculators.
 *
 * Every method lands on the same place: a last menstrual period, from which the due date is
 * 280 days (40 weeks) by Naegele's rule. What differs is how the LMP is arrived at, and each
 * route is a different amount of guesswork:
 *
 *   - LAST PERIOD is the LMP directly, adjusted when the cycle is not the textbook 28 days,
 *     because ovulation moves with cycle length while the luteal phase does not.
 *   - CONCEPTION DATE is 14 days after a notional LMP, so the due date is 266 days on.
 *   - ULTRASOUND is the most reliable early on: the scan measures the pregnancy, so the LMP
 *     is worked backwards from the gestational age it reports.
 *   - IVF TRANSFER is the most precise of all, because the embryo's age on the day it was
 *     transferred is known exactly rather than estimated.
 *
 * Dates are handled through the shared date primitives, at local midnight, so a due date
 * never shifts by a day because of a timezone or a daylight-saving boundary.
 */
import { addDays } from '@lib/calculators/date-duration';

export const GESTATION_DAYS = 280;
/** Days from conception to birth: 280 less the two weeks before ovulation. */
export const CONCEPTION_TO_BIRTH_DAYS = 266;
/** The cycle length Naegele's rule assumes. */
export const REFERENCE_CYCLE_DAYS = 28;

const DAY_MS = 86_400_000;

/** How the visitor is dating the pregnancy. */
export type DatingMethod = 'lmp' | 'conception' | 'ultrasound' | 'ivf';

export const DATING_METHODS: { value: DatingMethod; label: string }[] = [
  { value: 'lmp', label: 'Last Period' },
  { value: 'conception', label: 'Conception Date' },
  { value: 'ultrasound', label: 'Ultrasound' },
  { value: 'ivf', label: 'IVF Transfer Date' },
];

/** The two embryo ages a clinic transfers at, and the day count each implies. */
export type EmbryoAge = 3 | 5;
export const EMBRYO_AGES: { value: EmbryoAge; label: string }[] = [
  { value: 3, label: '3-day embryo' },
  { value: 5, label: '5-day embryo' },
];

/** Cycle lengths the calculator will accept. Outside this it is not a cycle. */
export const CYCLE_MIN = 20;
export const CYCLE_MAX = 45;

/* ------------------------------------------------------------------ */
/* Each route to an LMP                                                */
/* ------------------------------------------------------------------ */

/**
 * The LMP a cycle of this length implies, for dating purposes.
 *
 * A 35-day cycle ovulates about a week later than a 28-day one, so the pregnancy is a week
 * younger than the calendar suggests — which is the same as treating the LMP as a week
 * later. Ignoring this puts a long-cycle due date out by that whole week.
 */
export function lmpFromCycle(lmp: Date, cycleDays: number): Date {
  const usable = Number.isFinite(cycleDays) && cycleDays > 0 ? cycleDays : REFERENCE_CYCLE_DAYS;
  return addDays(lmp, usable - REFERENCE_CYCLE_DAYS);
}

/** Conception is about two weeks after the LMP, so the LMP is two weeks before it. */
export function lmpFromConception(conception: Date): Date {
  return addDays(conception, -14);
}

/** A scan reports how far along the pregnancy is; the LMP is that far back from the scan. */
export function lmpFromUltrasound(scanDate: Date, weeks: number, days: number): Date {
  return addDays(scanDate, -(weeks * 7 + days));
}

/**
 * On transfer day the embryo is already 3 or 5 days old, and conception was that many days
 * before — so the notional LMP is 14 days before that.
 */
export function lmpFromIvfTransfer(transferDate: Date, embryoAge: EmbryoAge): Date {
  return addDays(transferDate, -(embryoAge + 14));
}

/* ------------------------------------------------------------------ */
/* From an LMP                                                         */
/* ------------------------------------------------------------------ */

export function dueDateFromLMP(lmp: Date): Date {
  return addDays(lmp, GESTATION_DAYS);
}

/** Estimated conception is about two weeks after the LMP. */
export function conceptionFromLMP(lmp: Date): Date {
  return addDays(lmp, 14);
}

export interface GestationalAge {
  totalDays: number;
  weeks: number;
  days: number;
  trimester: 1 | 2 | 3;
  progressPct: number;
  daysRemaining: number;
}

export function gestationalAge(lmp: Date, at: Date): GestationalAge {
  const totalDays = Math.max(0, Math.floor((at.getTime() - lmp.getTime()) / DAY_MS));
  const weeks = Math.floor(totalDays / 7);
  const trimester: 1 | 2 | 3 = weeks < 13 ? 1 : weeks < 27 ? 2 : 3;
  return {
    totalDays,
    weeks,
    days: totalDays % 7,
    trimester,
    progressPct: Math.max(0, Math.min(100, (totalDays / GESTATION_DAYS) * 100)),
    daysRemaining: Math.max(0, GESTATION_DAYS - totalDays),
  };
}

/* ------------------------------------------------------------------ */
/* The pregnancy timeline                                              */
/* ------------------------------------------------------------------ */

export interface Milestone {
  key: string;
  label: string;
  /** Gestational age at this point, in whole weeks from the LMP. */
  weeks: number;
  date: Date;
}

/**
 * The dates a pregnancy is usually described by, all measured from the LMP.
 *
 * Trimester boundaries are stated as the week each one BEGINS, which is how they are
 * conventionally quoted: the second trimester starts at 13 weeks and the third at 27.
 */
export function milestones(lmp: Date): Milestone[] {
  const at = (weeks: number) => addDays(lmp, weeks * 7);
  return [
    { key: 'lmp', label: 'Last menstrual period', weeks: 0, date: lmp },
    { key: 'conception', label: 'Estimated conception', weeks: 2, date: addDays(lmp, 14) },
    { key: 'trimester-2', label: 'Second trimester begins', weeks: 13, date: at(13) },
    { key: 'trimester-3', label: 'Third trimester begins', weeks: 27, date: at(27) },
    { key: 'full-term', label: 'Full term begins', weeks: 39, date: at(39) },
    { key: 'due', label: 'Estimated due date', weeks: 40, date: dueDateFromLMP(lmp) },
  ];
}
