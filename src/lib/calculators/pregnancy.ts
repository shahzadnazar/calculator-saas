/**
 * Pregnancy progress from the LMP: current gestational age, trimester, key
 * dates and progress. Builds on the shared due-date math. Pure and unit-tested.
 */
import {
  dueDateFromLMP,
  conceptionFromLMP,
  gestationalAge,
  milestones,
  type GestationalAge,
} from '@lib/calculators/due-date';
import { addDays } from '@lib/calculators/date-duration';

export interface PregnancyInfo {
  dueDate: Date;
  conceptionDate: Date;
  age: GestationalAge;
  /** End of the first and second trimesters. */
  firstTrimesterEnd: Date;
  secondTrimesterEnd: Date;
}

export function pregnancyInfo(lmp: Date, at: Date): PregnancyInfo {
  return {
    dueDate: dueDateFromLMP(lmp),
    conceptionDate: conceptionFromLMP(lmp),
    age: gestationalAge(lmp, at),
    firstTrimesterEnd: addDays(lmp, 13 * 7), // end of week 13
    secondTrimesterEnd: addDays(lmp, 27 * 7), // end of week 27
  };
}

/* ------------------------------------------------------------------ */
/* The schedule                                                        */
/* ------------------------------------------------------------------ */

export interface ScheduleRow {
  key: string;
  label: string;
  date: Date;
  /** Gestational age on that date, as completed weeks and days from the LMP. */
  weeks: number;
  days: number;
  /** The visitor's own position in the schedule, inserted in date order. */
  isToday: boolean;
}

/**
 * The whole pregnancy as a dated schedule, with the visitor's own place in it.
 *
 * The milestones are the shared gestational ones, so both gestational calculators tell the
 * same story; what this adds is a TODAY row slotted into date order. Knowing you are 14
 * weeks along matters much less than seeing which milestone you have just passed and which
 * one is next, and a row in the sequence says that without any prose. It is inserted only
 * while the pregnancy is ongoing — once the due date is behind you, a "today" row below the
 * last milestone tells you nothing you did not already know.
 */
export function pregnancySchedule(lmp: Date, at: Date): ScheduleRow[] {
  const rows: ScheduleRow[] = milestones(lmp).map((m) => {
    const age = gestationalAge(lmp, m.date);
    return {
      key: m.key,
      label: m.label,
      date: m.date,
      weeks: age.weeks,
      days: age.days,
      isToday: false,
    };
  });

  const due = dueDateFromLMP(lmp);
  if (!(at.getTime() >= lmp.getTime() && at.getTime() <= due.getTime())) return rows;

  const now = gestationalAge(lmp, at);
  const today: ScheduleRow = {
    key: 'today',
    label: 'Today',
    date: at,
    weeks: now.weeks,
    days: now.days,
    isToday: true,
  };
  // Ahead of the first milestone it has not passed yet, so the row lands in date order and
  // ties resolve in the visitor's favour: on a milestone day, "Today" reads after it.
  const at_ = at.getTime();
  const idx = rows.findIndex((r) => r.date.getTime() > at_);
  if (idx === -1) rows.push(today);
  else rows.splice(idx, 0, today);
  return rows;
}
