/**
 * Pregnancy dating from the last menstrual period (LMP) using Naegele's rule
 * (due date = LMP + 280 days). Pure and unit-tested. Shared by the due-date and
 * pregnancy calculators.
 */
import { addDays } from '@lib/calculators/date-duration';

export const GESTATION_DAYS = 280;
const DAY_MS = 86_400_000;

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
