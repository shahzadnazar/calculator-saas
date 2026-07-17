/**
 * Work-hours calculator: elapsed time between two clock times, minus a break.
 * Handles overnight shifts (end earlier than start). Pure and unit-tested.
 */

export interface HoursResult {
  totalMinutes: number;
  hours: number;
  minutes: number;
  decimalHours: number;
}

/** Parse "HH:MM" (24h) to minutes since midnight, or null if invalid. */
export function parseTimeToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function calculateHours(
  startMin: number,
  endMin: number,
  breakMinutes = 0,
): HoursResult {
  let span = endMin - startMin;
  if (span < 0) span += 24 * 60; // crossed midnight
  const total = Math.max(0, span - Math.max(0, breakMinutes));
  return {
    totalMinutes: total,
    hours: Math.floor(total / 60),
    minutes: total % 60,
    decimalHours: Math.round((total / 60) * 100) / 100,
  };
}
