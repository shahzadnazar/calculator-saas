/**
 * Target heart-rate training zones. Pure and unit-tested.
 *
 * Two things the visitor chooses, and the reference hides both behind "+ Settings" because
 * most people never change them:
 *
 *   - which equation estimates maximum heart rate from age;
 *   - which scale describes exercise intensity.
 *
 * Maximum heart rate can also be entered directly, from an actual test, in which case no
 * equation is used at all — a measured figure beats any estimate of it.
 *
 * Zone bpm always comes from the Karvonen (heart-rate reserve) method when a resting heart
 * rate is supplied, and from a plain percentage of maximum heart rate when it is not. That
 * is why resting heart rate is optional but changes what the percentages MEAN, and the
 * result says which of the two it used rather than leaving the reader to guess.
 */

export type MhrFormula = 'haskell-fox' | 'tanaka' | 'nes';

/** The three published age equations, in the order the settings panel offers them. */
export const MHR_FORMULAS: { value: MhrFormula; label: string }[] = [
  { value: 'haskell-fox', label: 'Haskell & Fox (1971)' },
  { value: 'tanaka', label: 'Tanaka, Monahan, & Seals (2001)' },
  { value: 'nes', label: 'Nes, Janszky, Wisloff, Stoylen, Karlsen (2013)' },
];

export type IntensityScale = 'karvonen' | 'borg' | 'borg-cr10';

/**
 * The three ways of describing how hard a zone is.
 *
 * They describe the SAME five bands, so the bpm never changes with the scale — only the
 * column that names the effort. Karvonen states it as a share of heart-rate reserve; the two
 * Borg scales state it as how hard the exercise feels, which is what makes them useful when
 * a monitor is not to hand.
 */
export const INTENSITY_SCALES: { value: IntensityScale; label: string; column: string }[] = [
  { value: 'karvonen', label: 'The Karvonen Formula', column: 'Heart Rate Reserve' },
  { value: 'borg', label: 'Rating of perceived exertion with Borg scale', column: 'Borg scale (6-20)' },
  { value: 'borg-cr10', label: 'Rating of perceived exertion with modified Borg CR10 scale', column: 'Borg CR10 (0-10)' },
];

export interface IntensityBand {
  key: string;
  label: string;
  lowPct: number;
  highPct: number;
  /** The band on the 6-20 Borg scale. */
  borg: string;
  /** The band on the modified Borg CR10 scale. */
  cr10: string;
}

/** The reference's five bands, in its order and its wording. */
export const INTENSITY_BANDS: readonly IntensityBand[] = [
  { key: 'very-light', label: 'Very light', lowPct: 50, highPct: 60, borg: '9 - 11', cr10: '1 - 2' },
  { key: 'light', label: 'Light', lowPct: 60, highPct: 70, borg: '11 - 13', cr10: '3 - 4' },
  { key: 'moderate', label: 'Moderate', lowPct: 70, highPct: 80, borg: '13 - 15', cr10: '5 - 6' },
  { key: 'hard', label: 'Hard', lowPct: 80, highPct: 90, borg: '15 - 17', cr10: '7 - 8' },
  { key: 'vo2max', label: 'VO₂ Max (maximum)', lowPct: 90, highPct: 100, borg: '17 - 20', cr10: '9 - 10' },
] as const;

/** The band the headline sentence quotes — the span usually recommended for aerobic work. */
export const AEROBIC_LOW_PCT = 50;
export const AEROBIC_HIGH_PCT = 85;

/** The age span the calculator accepts. */
export const AGE_MIN = 1;
export const AGE_MAX = 120;

/** Maximum heart rate from age, unrounded. */
export function maxHeartRate(formula: MhrFormula, age: number): number {
  switch (formula) {
    case 'tanaka':
      return 208 - 0.7 * age;
    case 'nes':
      return 211 - 0.64 * age;
    case 'haskell-fox':
    default:
      return 220 - age;
  }
}

export interface HeartRateZone extends IntensityBand {
  /** How this band is named on the chosen scale. */
  scaleLabel: string;
  low: number;
  high: number;
}

export interface TargetHeartRateInput {
  /** Age in years — used only when no measured maximum is supplied. */
  age?: number;
  /** A measured maximum heart rate, which beats any estimate of it. */
  measuredMaxHr?: number;
  /** Optional. Its presence switches the zones from %MHR to Karvonen. */
  restingHr?: number;
  formula?: MhrFormula;
  scale?: IntensityScale;
}

export interface TargetHeartRateResult {
  /** The maximum heart rate the zones are built from, rounded. */
  maxHr: number;
  /** Heart-rate reserve (max − resting), or null when no resting rate was given. */
  reserve: number | null;
  /** Whether the percentages are of reserve (Karvonen) or of maximum. */
  usesReserve: boolean;
  scale: IntensityScale;
  /** The headline aerobic span, in bpm. */
  aerobicLow: number;
  aerobicHigh: number;
  zones: HeartRateZone[];
}

const EMPTY: TargetHeartRateResult = {
  maxHr: Number.NaN,
  reserve: null,
  usesReserve: false,
  scale: 'karvonen',
  aerobicLow: Number.NaN,
  aerobicHigh: Number.NaN,
  zones: [],
};

/** How a band is written on the chosen scale. */
export function scaleLabelFor(band: IntensityBand, scale: IntensityScale): string {
  if (scale === 'borg') return band.borg;
  if (scale === 'borg-cr10') return band.cr10;
  return `${band.lowPct} - ${band.highPct}%`;
}

export function calculateTargetHeartRate(input: TargetHeartRateInput): TargetHeartRateResult {
  const formula = input.formula ?? 'haskell-fox';
  const scale = input.scale ?? 'karvonen';

  const measured = input.measuredMaxHr;
  const rawMax =
    measured !== undefined && Number.isFinite(measured) && measured > 0
      ? measured
      : input.age !== undefined && Number.isFinite(input.age) && input.age > 0
        ? maxHeartRate(formula, input.age)
        : Number.NaN;
  if (!Number.isFinite(rawMax) || rawMax <= 0) return EMPTY;

  // Zones are built from the DISPLAYED maximum, so the table reconciles with the figure
  // printed above it rather than with an unrounded value nobody can see.
  const maxHr = Math.round(rawMax);

  const resting = input.restingHr;
  const hasResting = resting !== undefined && Number.isFinite(resting) && resting > 0;
  // A resting rate at or above the maximum is not a heart-rate reserve, it is a contradiction.
  const usesReserve = hasResting && resting! < maxHr;
  const reserve = usesReserve ? maxHr - resting! : null;

  const bpmAt = (pct: number) =>
    usesReserve ? Math.round((reserve! * pct) / 100 + resting!) : Math.round((maxHr * pct) / 100);

  return {
    maxHr,
    reserve,
    usesReserve,
    scale,
    aerobicLow: bpmAt(AEROBIC_LOW_PCT),
    aerobicHigh: bpmAt(AEROBIC_HIGH_PCT),
    zones: INTENSITY_BANDS.map((band) => ({
      ...band,
      scaleLabel: scaleLabelFor(band, scale),
      low: bpmAt(band.lowPct),
      high: bpmAt(band.highPct),
    })),
  };
}
