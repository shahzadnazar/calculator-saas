/**
 * Target heart-rate training zones. Uses the Karvonen (heart-rate reserve)
 * method when a resting heart rate is supplied, otherwise a simple percentage
 * of maximum heart rate. Pure and unit-tested.
 */
export interface HeartRateZone {
  name: string;
  lowPct: number;
  highPct: number;
  low: number; // bpm
  high: number; // bpm
}

export interface TargetHeartRateResult {
  maxHr: number;
  zones: HeartRateZone[];
}

const ZONES: { name: string; lowPct: number; highPct: number }[] = [
  { name: 'Warm up / recovery', lowPct: 50, highPct: 60 },
  { name: 'Fat burn (light)', lowPct: 60, highPct: 70 },
  { name: 'Aerobic (moderate)', lowPct: 70, highPct: 80 },
  { name: 'Anaerobic (hard)', lowPct: 80, highPct: 90 },
  { name: 'Maximum effort', lowPct: 90, highPct: 100 },
];

export function calculateTargetHeartRate(age: number, restingHr = 0): TargetHeartRateResult {
  const maxHr = Math.max(0, 220 - (age || 0));
  const useKarvonen = restingHr > 0;
  const hrAt = (pct: number) =>
    useKarvonen
      ? Math.round((maxHr - restingHr) * (pct / 100) + restingHr)
      : Math.round(maxHr * (pct / 100));

  return {
    maxHr,
    zones: ZONES.map((z) => ({ ...z, low: hrAt(z.lowPct), high: hrAt(z.highPct) })),
  };
}
