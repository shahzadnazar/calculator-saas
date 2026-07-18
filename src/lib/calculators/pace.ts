/**
 * Running pace and speed from a distance and time, plus predicted finish times
 * for standard race distances. Pure and unit-tested.
 */
export type DistanceUnit = 'km' | 'mi';
const KM_PER_MI = 1.609344;

export interface PaceInput {
  distance: number;
  unit: DistanceUnit;
  timeSeconds: number;
}

export interface PaceResult {
  secPerKm: number;
  secPerMi: number;
  kmh: number;
  mph: number;
}

export const RACE_DISTANCES: { name: string; km: number }[] = [
  { name: '5K', km: 5 },
  { name: '10K', km: 10 },
  { name: 'Half Marathon', km: 21.0975 },
  { name: 'Marathon', km: 42.195 },
];

export function computePace(input: PaceInput): PaceResult {
  const km = input.unit === 'km' ? input.distance || 0 : (input.distance || 0) * KM_PER_MI;
  const t = input.timeSeconds || 0;
  if (km <= 0 || t <= 0) return { secPerKm: NaN, secPerMi: NaN, kmh: NaN, mph: NaN };
  const secPerKm = t / km;
  return {
    secPerKm,
    secPerMi: secPerKm * KM_PER_MI,
    kmh: km / (t / 3600),
    mph: km / KM_PER_MI / (t / 3600),
  };
}

/** Predicted finish time (seconds) for a race distance at the given pace. */
export function predictTime(secPerKm: number, raceKm: number): number {
  return secPerKm * raceKm;
}

/** Format seconds as H:MM:SS (drops the hour when zero). */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
