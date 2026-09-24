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

/* ------------------------------------------------------------------ */
/* Hours between two dates                                             */
/* ------------------------------------------------------------------ */

export interface InstantSpan {
  /** Absolute minutes between the two instants. */
  totalMinutes: number;
  /** Which way round the pair was given — never used to swap the figures. */
  direction: 'after' | 'before' | 'same';
  /** The same span as whole hours plus the leftover minutes. */
  hours: number;
  minutes: number;
  /** And again as days plus the leftover hours and minutes, for spans over a day. */
  days: number;
  hoursOfDay: number;
  decimalHours: number;
}

/**
 * The span between two instants given as whole minutes since an epoch.
 *
 * Order-independent: a reversed pair is a valid span whose direction is reported rather than
 * silently swapped, the same contract the date calculator uses. Minutes rather than milliseconds
 * because the inputs are wall-clock times to the minute, and it keeps every figure an integer.
 */
export function spanBetweenInstants(startMin: number, endMin: number): InstantSpan {
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
    return {
      totalMinutes: Number.NaN,
      direction: 'same',
      hours: Number.NaN,
      minutes: Number.NaN,
      days: Number.NaN,
      hoursOfDay: Number.NaN,
      decimalHours: Number.NaN,
    };
  }
  const diff = Math.round(endMin) - Math.round(startMin);
  const totalMinutes = Math.abs(diff);
  return {
    totalMinutes,
    direction: diff === 0 ? 'same' : diff > 0 ? 'after' : 'before',
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    days: Math.floor(totalMinutes / (24 * 60)),
    hoursOfDay: Math.floor((totalMinutes % (24 * 60)) / 60),
    decimalHours: Math.round((totalMinutes / 60) * 100) / 100,
  };
}
