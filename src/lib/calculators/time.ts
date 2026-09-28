/**
 * Time arithmetic: add or subtract two durations and break a duration down into
 * days/hours/minutes/seconds. Pure and unit-tested.
 */
export interface Duration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function toSeconds(d: Partial<Duration>): number {
  return (d.days || 0) * 86400 + (d.hours || 0) * 3600 + (d.minutes || 0) * 60 + (d.seconds || 0);
}

export function combineDurations(aSeconds: number, op: 'add' | 'subtract', bSeconds: number): number {
  const total = op === 'add' ? aSeconds + bSeconds : aSeconds - bSeconds;
  return total; // may be negative
}

export function breakdownDuration(totalSeconds: number): Duration & { negative: boolean } {
  const negative = totalSeconds < 0;
  let s = Math.abs(Math.round(totalSeconds));
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  const seconds = s - minutes * 60;
  return { days, hours, minutes, seconds, negative };
}

/* ------------------------------------------------------------------ */
/* Clock time                                                          */
/* ------------------------------------------------------------------ */

export const SECONDS_PER_DAY = 86400;

/** Seconds since midnight for a wall-clock time, or NaN if it is not a real time of day. */
export function clockToSeconds(hours: number, minutes: number, seconds: number): number {
  if (![hours, minutes, seconds].every((n) => Number.isFinite(n) && Number.isInteger(n))) return Number.NaN;
  if (hours < 0 || hours > 23) return Number.NaN;
  if (minutes < 0 || minutes > 59) return Number.NaN;
  if (seconds < 0 || seconds > 59) return Number.NaN;
  return hours * 3600 + minutes * 60 + seconds;
}

/** "HH:MM:SS" for seconds since midnight. */
export function formatClock(secondsOfDay: number): string {
  const s = ((Math.round(secondsOfDay) % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** "2:30:00 PM" — the way a clock time is usually read back. */
export function formatClock12(secondsOfDay: number): string {
  const s = ((Math.round(secondsOfDay) % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const h24 = Math.floor(s / 3600);
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h12}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)} ${suffix}`;
}

export interface ShiftedDateTime {
  /** Whole days the shift crossed — negative when it went backwards. */
  dayOffset: number;
  /** Seconds since midnight on the resulting day, always 0…86399. */
  secondsOfDay: number;
}

/**
 * Move a wall-clock time by a signed number of seconds, reporting how many days it crossed.
 *
 * Returning a day OFFSET rather than a date keeps this free of calendars: the caller adds the
 * offset to whatever date it holds with the shared date primitives, so there is one place that
 * knows about months and leap years and it is not this one.
 */
export function shiftClock(secondsOfDay: number, offsetSeconds: number): ShiftedDateTime {
  if (!Number.isFinite(secondsOfDay) || !Number.isFinite(offsetSeconds)) {
    return { dayOffset: Number.NaN, secondsOfDay: Number.NaN };
  }
  const total = Math.round(secondsOfDay + offsetSeconds);
  const dayOffset = Math.floor(total / SECONDS_PER_DAY);
  return { dayOffset, secondsOfDay: total - dayOffset * SECONDS_PER_DAY };
}

/* ------------------------------------------------------------------ */
/* Time expressions                                                    */
/* ------------------------------------------------------------------ */

export type ExpressionResult =
  | { ok: true; seconds: number }
  | { ok: false; reason: 'empty' | 'syntax' | 'unit' | 'overflow' };

const UNIT_SECONDS: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };

/**
 * Evaluate a time expression such as "1d 2h 3m 4s + 4h 5s - 2030s".
 *
 * Each value carries its own unit — d, h, m or s — and terms between + and - are summed, so a
 * term is however many value/unit pairs sit together. Only + and - join terms; there is no
 * precedence to get wrong, which is the whole point of the notation.
 *
 * Written as a small explicit tokeniser rather than anything that evaluates the string, because
 * this is visitor input.
 */
export function parseTimeExpression(input: string): ExpressionResult {
  const text = (input ?? '').trim().toLowerCase();
  if (text === '') return { ok: false, reason: 'empty' };
  // Reject anything outside the grammar's alphabet before looking at structure.
  if (!/^[0-9dhms+\-.\s]+$/.test(text)) return { ok: false, reason: 'syntax' };

  let total = 0;
  let sign = 1;
  let termSeen = false;
  let i = 0;
  let pendingSign = true; // a leading sign is allowed; a sign must be followed by a term

  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t') {
      i += 1;
      continue;
    }
    if (ch === '+' || ch === '-') {
      if (pendingSign && termSeen) return { ok: false, reason: 'syntax' }; // two signs in a row
      if (!termSeen && total === 0 && !pendingSign) return { ok: false, reason: 'syntax' };
      sign = ch === '-' ? -1 : 1;
      pendingSign = true;
      i += 1;
      continue;
    }

    // A term: one or more <number><unit> pairs.
    let termSeconds = 0;
    let pairs = 0;
    while (i < text.length) {
      const rest = text.slice(i);
      const m = /^\s*(\d+\.?\d*|\.\d+)\s*([dhms])/.exec(rest);
      if (!m) break;
      const value = Number(m[1]);
      if (!Number.isFinite(value)) return { ok: false, reason: 'overflow' };
      termSeconds += value * UNIT_SECONDS[m[2]];
      pairs += 1;
      i += m[0].length;
    }
    if (pairs === 0) {
      // A bare number with no unit, or a stray unit letter.
      if (/^\s*(\d+\.?\d*|\.\d+)/.test(text.slice(i))) return { ok: false, reason: 'unit' };
      return { ok: false, reason: 'syntax' };
    }
    total += sign * termSeconds;
    termSeen = true;
    pendingSign = false;
  }

  if (!termSeen) return { ok: false, reason: 'syntax' };
  if (pendingSign) return { ok: false, reason: 'syntax' }; // a trailing operator
  if (!Number.isFinite(total)) return { ok: false, reason: 'overflow' };
  return { ok: true, seconds: total };
}
