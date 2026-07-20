import { describe, it, expect } from 'vitest';
import { calculateTargetHeartRate } from './target-heart-rate';

/**
 * Target heart-rate CHARACTERIZATION suite (R7C-2C, commit 1 of 2).
 *
 * This locks the EXACT current behaviour of the reviewed pure function BEFORE the
 * task-first UX migration touches anything around it. It changes no formula — it
 * freezes what `calculateTargetHeartRate` does today so the migration's new
 * validation layer (which stops nonsensical inputs from ever reaching this
 * function) is a visible binding-level decision, not a silent formula change.
 *
 * Confirmed from source (src/lib/calculators/target-heart-rate.ts), not assumed:
 *   - max HR = Math.max(0, 220 − (age || 0));
 *   - method = Karvonen (heart-rate reserve) when restingHr > 0, else simple % of max;
 *   - 5 fixed contiguous zones: 50–60 / 60–70 / 70–80 / 80–90 / 90–100 %.
 *
 * The pure function is SHARED with the reference chart (referenceTables.ts) and the
 * embed, so this parity net guards every consumer.
 */
describe('target-heart-rate — max HR (220 − age, floored at 0)', () => {
  it('is 220 − age for typical ages', () => {
    expect(calculateTargetHeartRate(30).maxHr).toBe(190);
    expect(calculateTargetHeartRate(25).maxHr).toBe(195);
    expect(calculateTargetHeartRate(40).maxHr).toBe(180);
    expect(calculateTargetHeartRate(50).maxHr).toBe(170);
  });

  // Characterized quirks — frozen deliberately (the migration's validation prevents
  // these inputs from reaching the function; the function itself is unchanged).
  it('treats age 0 / empty / NaN as 0 → maxHr 220 (suspected-defect input, frozen)', () => {
    expect(calculateTargetHeartRate(0).maxHr).toBe(220);
    expect(calculateTargetHeartRate(NaN).maxHr).toBe(220);
  });

  it('floors an over-large age at maxHr 0 (never negative)', () => {
    const r = calculateTargetHeartRate(250);
    expect(r.maxHr).toBe(0);
    expect(r.zones.every((z) => z.low === 0 && z.high === 0)).toBe(true);
  });
});

describe('target-heart-rate — zone model (5 fixed contiguous bands)', () => {
  it('exposes exactly five zones with the documented names and percentages', () => {
    const { zones } = calculateTargetHeartRate(30);
    expect(zones.map((z) => [z.name, z.lowPct, z.highPct])).toEqual([
      ['Warm up / recovery', 50, 60],
      ['Fat burn (light)', 60, 70],
      ['Aerobic (moderate)', 70, 80],
      ['Anaerobic (hard)', 80, 90],
      ['Maximum effort', 90, 100],
    ]);
  });

  it('bands are contiguous (each zone high% is the next zone low%)', () => {
    const { zones } = calculateTargetHeartRate(30);
    for (let i = 0; i < zones.length - 1; i++) {
      expect(zones[i].highPct).toBe(zones[i + 1].lowPct);
    }
  });
});

describe('target-heart-rate — simple % of max (no resting HR)', () => {
  it('computes every zone bound for age 30 (maxHr 190)', () => {
    const { zones } = calculateTargetHeartRate(30);
    expect(zones.map((z) => [z.low, z.high])).toEqual([
      [95, 114], // 50–60%
      [114, 133], // 60–70%
      [133, 152], // 70–80%
      [152, 171], // 80–90%
      [171, 190], // 90–100%
    ]);
  });

  it('the top of the maximum zone equals maxHr; the default arg equals restingHr 0', () => {
    const r = calculateTargetHeartRate(30);
    expect(r.zones[4].high).toBe(r.maxHr);
    expect(calculateTargetHeartRate(30)).toEqual(calculateTargetHeartRate(30, 0));
  });

  it('rounds to the nearest bpm, halves upward (age 25, 70% of 195 = 136.5 → 137)', () => {
    const { zones } = calculateTargetHeartRate(25); // maxHr 195
    expect(zones[2].low).toBe(137); // 70%: 136.5 → 137
    expect(zones[3].high).toBe(176); // 90%: 175.5 → 176
  });
});

describe('target-heart-rate — Karvonen (heart-rate reserve) when resting HR > 0', () => {
  it('computes every zone bound for age 30, resting 60 (reserve 130)', () => {
    const { zones } = calculateTargetHeartRate(30, 60);
    // round(130 · pct + 60)
    expect(zones.map((z) => [z.low, z.high])).toEqual([
      [125, 138], // 50–60%
      [138, 151], // 60–70%
      [151, 164], // 70–80%
      [164, 177], // 80–90%
      [177, 190], // 90–100%
    ]);
  });

  it('a positive resting HR switches methods (age 30: simple 95 → Karvonen 125)', () => {
    expect(calculateTargetHeartRate(30, 0).zones[0].low).toBe(95);
    expect(calculateTargetHeartRate(30, 60).zones[0].low).toBe(125);
  });

  it('the top of the maximum zone still equals maxHr under Karvonen', () => {
    const r = calculateTargetHeartRate(30, 60);
    expect(r.zones[4].high).toBe(r.maxHr); // round((190−60)·1 + 60) = 190
  });

  it('resting HR ≥ max HR yields inverted zones (suspected-defect input, frozen)', () => {
    // age 30 → maxHr 190; resting 200 → reserve −10; the warm-up floor exceeds the max ceiling.
    const { zones } = calculateTargetHeartRate(30, 200);
    expect(zones[0].low).toBe(195); // round(−10·0.5 + 200)
    expect(zones[4].high).toBe(190); // round(−10·1 + 200)
    expect(zones[0].low).toBeGreaterThan(zones[4].high);
  });
});

describe('target-heart-rate — result shape', () => {
  it('returns maxHr plus five fully-populated zone rows', () => {
    const r = calculateTargetHeartRate(30, 60);
    expect(typeof r.maxHr).toBe('number');
    expect(r.zones).toHaveLength(5);
    for (const z of r.zones) {
      expect(z).toEqual({
        name: expect.any(String),
        lowPct: expect.any(Number),
        highPct: expect.any(Number),
        low: expect.any(Number),
        high: expect.any(Number),
      });
    }
  });
});
