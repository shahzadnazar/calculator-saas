import { describe, it, expect } from 'vitest';
import {
  calculateTargetHeartRate,
  maxHeartRate,
  scaleLabelFor,
  MHR_FORMULAS,
  INTENSITY_SCALES,
  INTENSITY_BANDS,
  AEROBIC_LOW_PCT,
  AEROBIC_HIGH_PCT,
  type TargetHeartRateInput,
} from './target-heart-rate';

/** The reference's case: age 30, resting 70, Haskell & Fox, Karvonen. */
const base = (over: Partial<TargetHeartRateInput> = {}): TargetHeartRateInput => ({
  age: 30,
  restingHr: 70,
  formula: 'haskell-fox',
  scale: 'karvonen',
  ...over,
});
const zone = (r: ReturnType<typeof calculateTargetHeartRate>, key: string) =>
  r.zones.find((z) => z.key === key)!;

describe('the reference report reproduces exactly', () => {
  const r = calculateTargetHeartRate(base());

  it('estimates a maximum of 190 from age 30', () => {
    expect(r.maxHr).toBe(190);
    expect(r.reserve).toBe(120);
    expect(r.usesReserve).toBe(true);
  });

  it('quotes 130 to 172 bpm for aerobic exercise, at 50-85% of reserve', () => {
    expect([r.aerobicLow, r.aerobicHigh]).toEqual([130, 172]);
    expect([AEROBIC_LOW_PCT, AEROBIC_HIGH_PCT]).toEqual([50, 85]);
  });

  it('prints the five bands the reference prints, with its bpm', () => {
    expect(r.zones.map((z) => [z.label, z.scaleLabel, `${z.low} - ${z.high}`])).toEqual([
      ['Very light', '50 - 60%', '130 - 142'],
      ['Light', '60 - 70%', '142 - 154'],
      ['Moderate', '70 - 80%', '154 - 166'],
      ['Hard', '80 - 90%', '166 - 178'],
      ['VO₂ Max (maximum)', '90 - 100%', '178 - 190'],
    ]);
  });

  it('the bands run continuously — one zone’s top is the next one’s floor', () => {
    for (let i = 1; i < r.zones.length; i++) {
      expect(r.zones[i].low).toBe(r.zones[i - 1].high);
    }
  });
});

describe('the three maximum-heart-rate equations', () => {
  it('are the reference’s three, in its order', () => {
    expect(MHR_FORMULAS.map((f) => f.label)).toEqual([
      'Haskell & Fox (1971)',
      'Tanaka, Monahan, & Seals (2001)',
      'Nes, Janszky, Wisloff, Stoylen, Karlsen (2013)',
    ]);
  });

  it('compute their published formulas', () => {
    expect(maxHeartRate('haskell-fox', 30)).toBe(190); // 220 − age
    expect(maxHeartRate('tanaka', 30)).toBeCloseTo(187, 6); // 208 − 0.7 × age
    expect(maxHeartRate('nes', 30)).toBeCloseTo(191.8, 6); // 211 − 0.64 × age
  });

  it('genuinely disagree, and disagree more at the extremes of age', () => {
    const at = (age: number) => MHR_FORMULAS.map((f) => Math.round(maxHeartRate(f.value, age)));
    const spread = (age: number) => Math.max(...at(age)) - Math.min(...at(age));
    expect(new Set(at(30)).size).toBe(3);
    expect(spread(70)).toBeGreaterThan(spread(30));
  });

  it('change every zone', () => {
    expect(calculateTargetHeartRate(base({ formula: 'tanaka' })).maxHr).toBe(187);
    expect(calculateTargetHeartRate(base({ formula: 'nes' })).maxHr).toBe(192);
    expect(zone(calculateTargetHeartRate(base({ formula: 'nes' })), 'moderate').low).toBe(155);
  });
});

describe('a measured maximum beats any estimate of it', () => {
  it('is used instead of the equation, and the age is then irrelevant', () => {
    const r = calculateTargetHeartRate(base({ measuredMaxHr: 200 }));
    expect(r.maxHr).toBe(200);
    expect(r.reserve).toBe(130);
    expect(calculateTargetHeartRate(base({ measuredMaxHr: 200, age: 70 })).maxHr).toBe(200);
    expect(calculateTargetHeartRate(base({ measuredMaxHr: 200, formula: 'tanaka' })).maxHr).toBe(200);
  });

  it('falls back to the equation when the measurement is not usable', () => {
    for (const bad of [0, -5, Number.NaN]) {
      expect(calculateTargetHeartRate(base({ measuredMaxHr: bad })).maxHr).toBe(190);
    }
  });
});

describe('resting heart rate decides what the percentages mean', () => {
  it('with one, the percentages are of heart-rate reserve', () => {
    const r = calculateTargetHeartRate(base());
    expect(r.usesReserve).toBe(true);
    expect(zone(r, 'very-light').low).toBe(130); // 70 + 120 × 50%
  });

  it('without one, they are of maximum heart rate — a different, lower set', () => {
    const r = calculateTargetHeartRate(base({ restingHr: undefined }));
    expect(r.usesReserve).toBe(false);
    expect(r.reserve).toBe(null);
    expect(zone(r, 'very-light').low).toBe(95); // 190 × 50%
    expect([r.aerobicLow, r.aerobicHigh]).toEqual([95, 162]);
  });

  it('refuses to treat a resting rate at or above the maximum as a reserve', () => {
    // 190 − 190 is not a heart-rate reserve, it is a contradiction; fall back to %MHR.
    for (const resting of [190, 220]) {
      const r = calculateTargetHeartRate(base({ restingHr: resting }));
      expect(r.usesReserve).toBe(false);
      expect(r.reserve).toBe(null);
      expect(Number.isFinite(zone(r, 'moderate').low)).toBe(true);
    }
  });
});

describe('the intensity scale renames the effort, never the bpm', () => {
  it('offers the reference’s three scales, in its order', () => {
    expect(INTENSITY_SCALES.map((s) => s.label)).toEqual([
      'The Karvonen Formula',
      'Rating of perceived exertion with Borg scale',
      'Rating of perceived exertion with modified Borg CR10 scale',
    ]);
  });

  it('leaves every bpm identical across all three', () => {
    const bpm = (scale: 'karvonen' | 'borg' | 'borg-cr10') =>
      calculateTargetHeartRate(base({ scale })).zones.map((z) => [z.low, z.high]);
    expect(bpm('borg')).toEqual(bpm('karvonen'));
    expect(bpm('borg-cr10')).toEqual(bpm('karvonen'));
  });

  it('renames the middle column to match the scale', () => {
    const labels = (scale: 'karvonen' | 'borg' | 'borg-cr10') =>
      calculateTargetHeartRate(base({ scale })).zones.map((z) => z.scaleLabel);
    expect(labels('karvonen')).toEqual(['50 - 60%', '60 - 70%', '70 - 80%', '80 - 90%', '90 - 100%']);
    expect(labels('borg')).toEqual(['9 - 11', '11 - 13', '13 - 15', '15 - 17', '17 - 20']);
    expect(labels('borg-cr10')).toEqual(['1 - 2', '3 - 4', '5 - 6', '7 - 8', '9 - 10']);
  });

  it('names each column head', () => {
    expect(INTENSITY_SCALES.map((s) => s.column)).toEqual([
      'Heart Rate Reserve',
      'Borg scale (6-20)',
      'Borg CR10 (0-10)',
    ]);
    expect(scaleLabelFor(INTENSITY_BANDS[0], 'borg')).toBe('9 - 11');
  });
});

describe('guards', () => {
  it('returns nothing usable without an age or a measurement', () => {
    for (const bad of [{}, { age: 0 }, { age: Number.NaN }] as TargetHeartRateInput[]) {
      const r = calculateTargetHeartRate({ ...bad, restingHr: 70 });
      expect(Number.isNaN(r.maxHr)).toBe(true);
      expect(r.zones).toEqual([]);
    }
  });

  it('never produces a zone that runs backwards', () => {
    for (const age of [1, 20, 60, 120]) {
      for (const resting of [undefined, 40, 70]) {
        const r = calculateTargetHeartRate({ age, restingHr: resting });
        for (const z of r.zones) expect(z.high).toBeGreaterThanOrEqual(z.low);
      }
    }
  });
});
