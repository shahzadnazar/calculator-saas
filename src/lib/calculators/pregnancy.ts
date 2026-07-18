/**
 * Pregnancy progress from the LMP: current gestational age, trimester, key
 * dates and progress. Builds on the shared due-date math. Pure and unit-tested.
 */
import {
  dueDateFromLMP,
  conceptionFromLMP,
  gestationalAge,
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
