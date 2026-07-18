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
