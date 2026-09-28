/**
 * Pace, time and distance — the three-way solver behind the pace calculator, plus the
 * multipoint splits and finish-time projection the same page carries. Pure and unit-tested.
 *
 * One relationship underlies all of it:
 *
 *     time = distance × pace          pace = time ÷ distance          distance = time ÷ pace
 *
 * Everything is held in metres and seconds and converted only at the edges, so a mile pace
 * and a kilometre pace are the same number wearing different units and can never drift apart.
 */

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

export interface LengthUnit {
  key: string;
  /** How the distance box labels it. */
  label: string;
  /** How a pace reads: "per mile". */
  paceLabel: string;
  metres: number;
}

export const LENGTH_UNITS: readonly LengthUnit[] = [
  { key: 'mi', label: 'Miles', paceLabel: 'Mile', metres: 1609.344 },
  { key: 'km', label: 'Kilometers', paceLabel: 'Kilometer', metres: 1000 },
  { key: 'm', label: 'Meters', paceLabel: 'Meter', metres: 1 },
  { key: 'yd', label: 'Yards', paceLabel: 'Yard', metres: 0.9144 },
  { key: 'ft', label: 'Feet', paceLabel: 'Foot', metres: 0.3048 },
] as const;

export const DEFAULT_DISTANCE_UNIT = 'mi';
export const DEFAULT_PACE_UNIT = 'mi';

export function lengthUnit(key: string): LengthUnit | undefined {
  return LENGTH_UNITS.find((u) => u.key === key);
}

/** Common race distances, for the quick-fill row and the equivalent-times table. */
export interface RaceDistance {
  key: string;
  name: string;
  metres: number;
}

export const RACE_DISTANCES: readonly RaceDistance[] = [
  { key: '5k', name: '5K', metres: 5000 },
  { key: '10k', name: '10K', metres: 10000 },
  { key: 'half', name: 'Half Marathon', metres: 21097.5 },
  { key: 'marathon', name: 'Marathon', metres: 42195 },
] as const;

/** Every distance the equivalent-times table reports, shortest first. */
export const EQUIVALENT_DISTANCES: readonly RaceDistance[] = [
  { key: '1k', name: '1K', metres: 1000 },
  { key: '1mi', name: '1 Mile', metres: 1609.344 },
  { key: '5k', name: '5K', metres: 5000 },
  { key: '10k', name: '10K', metres: 10000 },
  { key: 'half', name: 'Half Marathon', metres: 21097.5 },
  { key: 'marathon', name: 'Marathon', metres: 42195 },
] as const;

/* ------------------------------------------------------------------ */
/* Time                                                                */
/* ------------------------------------------------------------------ */

/** Seconds from an h/m/s triple. */
export function toSeconds(h: number, m: number, s: number): number {
  return h * 3600 + m * 60 + s;
}

/** Seconds back to whole h/m/s, for filling the boxes the solver worked out. */
export function fromSeconds(total: number): { h: number; m: number; s: number } {
  const whole = Math.round(total);
  return { h: Math.floor(whole / 3600), m: Math.floor((whole % 3600) / 60), s: whole % 60 };
}

/**
 * H:MM:SS, dropping the hour only when there is none.
 *
 * A pace of 8:30 and a time of 0:08:30 are the same duration, but a race time of 3:05:12
 * must never lose its hour, so the hour is dropped only when it is genuinely zero.
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
  const { h, m, s } = fromSeconds(totalSeconds);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/* ------------------------------------------------------------------ */
/* The three-way solver                                                */
/* ------------------------------------------------------------------ */

/** Which of the three the visitor wants worked out. */
export type PaceSolveFor = 'pace' | 'time' | 'distance';

export interface PaceSolveInput {
  solveFor: PaceSolveFor;
  /** Elapsed time in seconds. Read for every target except `time`. */
  timeSeconds?: number;
  /** Distance in the unit named by `distanceUnit`. Read for every target except `distance`. */
  distance?: number;
  distanceUnit: string;
  /** Pace in seconds per `paceUnit`. Read for every target except `pace`. */
  paceSeconds?: number;
  paceUnit: string;
}

export interface PaceSolveResult {
  /** All three, whichever was solved for. */
  timeSeconds: number;
  /** Distance in the chosen distance unit. */
  distance: number;
  /** In the chosen distance unit. */
  distanceMetres: number;
  /** Seconds per the chosen pace unit. */
  paceSeconds: number;
  /** Speed, both ways round. */
  kmh: number;
  mph: number;
  /** Pace in the two units people actually train in, whatever unit was chosen. */
  secPerKm: number;
  secPerMi: number;
}

const EMPTY: PaceSolveResult = {
  timeSeconds: Number.NaN,
  distance: Number.NaN,
  distanceMetres: Number.NaN,
  paceSeconds: Number.NaN,
  kmh: Number.NaN,
  mph: Number.NaN,
  secPerKm: Number.NaN,
  secPerMi: Number.NaN,
};

const positive = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n > 0;

/**
 * Solve for whichever of time, distance or pace is wanted, from the other two.
 *
 * Returns nothing usable rather than a number built from a missing input: a pace of zero
 * would mean infinite speed and a distance of zero would divide by it, and neither is an
 * answer to anything.
 */
export function solvePace(input: PaceSolveInput): PaceSolveResult {
  const dUnit = lengthUnit(input.distanceUnit);
  const pUnit = lengthUnit(input.paceUnit);
  if (!dUnit || !pUnit) return EMPTY;

  let timeSeconds = input.timeSeconds ?? Number.NaN;
  let distanceMetres = positive(input.distance) ? input.distance * dUnit.metres : Number.NaN;
  // Seconds per METRE, so the pace unit and the distance unit never have to match.
  let secPerMetre = positive(input.paceSeconds) ? input.paceSeconds / pUnit.metres : Number.NaN;

  switch (input.solveFor) {
    case 'time':
      if (!positive(distanceMetres) || !positive(secPerMetre)) return EMPTY;
      timeSeconds = distanceMetres * secPerMetre;
      break;
    case 'distance':
      if (!positive(timeSeconds) || !positive(secPerMetre)) return EMPTY;
      distanceMetres = timeSeconds / secPerMetre;
      break;
    case 'pace':
      if (!positive(timeSeconds) || !positive(distanceMetres)) return EMPTY;
      secPerMetre = timeSeconds / distanceMetres;
      break;
  }

  if (!positive(timeSeconds) || !positive(distanceMetres) || !positive(secPerMetre)) return EMPTY;

  const metresPerSecond = 1 / secPerMetre;
  return {
    timeSeconds,
    distance: distanceMetres / dUnit.metres,
    distanceMetres,
    paceSeconds: secPerMetre * pUnit.metres,
    kmh: (metresPerSecond * 3600) / 1000,
    mph: (metresPerSecond * 3600) / 1609.344,
    secPerKm: secPerMetre * 1000,
    secPerMi: secPerMetre * 1609.344,
  };
}

/** Time to cover `metres` at this pace. */
export function timeForDistance(secPerMetre: number, metres: number): number {
  return secPerMetre * metres;
}

/** Equivalent finish times at the standard distances, from a solved result. */
export function equivalentTimes(result: PaceSolveResult): { race: RaceDistance; seconds: number }[] {
  if (!Number.isFinite(result.secPerKm) || result.secPerKm <= 0) return [];
  const secPerMetre = result.secPerKm / 1000;
  return EQUIVALENT_DISTANCES.map((race) => ({ race, seconds: timeForDistance(secPerMetre, race.metres) }));
}

/* ------------------------------------------------------------------ */
/* Multipoint splits                                                   */
/* ------------------------------------------------------------------ */

/** One recorded point: how far in, and the clock time when you got there. */
export interface SplitPoint {
  /** Cumulative distance in metres. */
  metres: number;
  /** Cumulative elapsed time in seconds. */
  seconds: number;
}

export interface SplitSegment {
  index: number;
  /** This leg alone. */
  legMetres: number;
  legSeconds: number;
  legSecPerKm: number;
  legSecPerMi: number;
  /** Everything up to and including this point. */
  cumulativeMetres: number;
  cumulativeSeconds: number;
  cumulativeSecPerKm: number;
  cumulativeSecPerMi: number;
}

/**
 * Turn recorded points into per-leg and cumulative paces.
 *
 * Points are cumulative, so the first leg runs from the start line, not from the first
 * point. A leg that covers no ground or takes no time has no pace, and gets NaN rather than
 * a fabricated one — a caller renders that as a dash.
 */
export function splitSegments(points: SplitPoint[]): SplitSegment[] {
  const out: SplitSegment[] = [];
  let prevMetres = 0;
  let prevSeconds = 0;
  points.forEach((point, i) => {
    const legMetres = point.metres - prevMetres;
    const legSeconds = point.seconds - prevSeconds;
    const legOk = legMetres > 0 && legSeconds > 0;
    const cumOk = point.metres > 0 && point.seconds > 0;
    out.push({
      index: i,
      legMetres,
      legSeconds,
      legSecPerKm: legOk ? (legSeconds / legMetres) * 1000 : Number.NaN,
      legSecPerMi: legOk ? (legSeconds / legMetres) * 1609.344 : Number.NaN,
      cumulativeMetres: point.metres,
      cumulativeSeconds: point.seconds,
      cumulativeSecPerKm: cumOk ? (point.seconds / point.metres) * 1000 : Number.NaN,
      cumulativeSecPerMi: cumOk ? (point.seconds / point.metres) * 1609.344 : Number.NaN,
    });
    prevMetres = point.metres;
    prevSeconds = point.seconds;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Finish time projection                                              */
/* ------------------------------------------------------------------ */

export interface FinishProjection {
  /** Pace so far. */
  secPerKm: number;
  secPerMi: number;
  /** Projected total time for the whole distance. */
  finishSeconds: number;
  /** What is left. */
  remainingMetres: number;
  remainingSeconds: number;
}

/**
 * Project a finish time from a partial split, at the pace held so far.
 *
 * Returns nothing usable when the total is not longer than what has been covered — there is
 * nothing to project, and pretending otherwise would report a finish time already past.
 */
export function projectFinish(
  coveredMetres: number,
  elapsedSeconds: number,
  totalMetres: number,
): FinishProjection | null {
  if (!(coveredMetres > 0) || !(elapsedSeconds > 0) || !(totalMetres > coveredMetres)) return null;
  const secPerMetre = elapsedSeconds / coveredMetres;
  const finishSeconds = secPerMetre * totalMetres;
  return {
    secPerKm: secPerMetre * 1000,
    secPerMi: secPerMetre * 1609.344,
    finishSeconds,
    remainingMetres: totalMetres - coveredMetres,
    remainingSeconds: finishSeconds - elapsedSeconds,
  };
}
