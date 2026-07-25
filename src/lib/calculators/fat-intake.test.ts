import { describe, it, expect } from 'vitest';
import { calculateFatIntake } from './fat-intake';

/**
 * Fat-intake CHARACTERIZATION suite (R7C-2D, commit 1 of 2).
 *
 * Existing coverage was a single shared-batch assertion (batch-c.test.ts); this
 * dedicated suite freezes the EXACT current behaviour of the reviewed pure function
 * BEFORE the task-first UX migration, so the migration's new validation layer (which
 * stops non-positive calories from ever reaching this function) is a visible
 * binding-level decision — not a silent formula change.
 *
 * Confirmed from source (src/lib/calculators/fat-intake.ts), not assumed:
 *   - cal = Math.max(0, calories || 0);
 *   - grams(pct) = Math.round(cal · pct / 100 / 9)  (fat = 9 kcal/g);
 *   - AMDR band: min 20% · moderate 27.5% · max 35% of calories.
 *
 * The pure function is shared with the batch tests and the embed, so this parity net
 * guards every consumer.
 */
describe('fat-intake — AMDR range (20% / 27.5% / 35% at 9 kcal/g)', () => {
  it('computes the documented 2,000-kcal range', () => {
    const r = calculateFatIntake(2000);
    expect(r.minGrams).toBe(44); // round(2000·0.20/9) = round(44.4)
    expect(r.moderateGrams).toBe(61); // round(2000·0.275/9) = round(61.1)
    expect(r.maxGrams).toBe(78); // round(2000·0.35/9) = round(77.8)
  });

  it('computes another representative target (2,500 kcal)', () => {
    const r = calculateFatIntake(2500);
    expect(r.minGrams).toBe(56); // round(55.6)
    expect(r.moderateGrams).toBe(76); // round(76.4)
    expect(r.maxGrams).toBe(97); // round(97.2)
  });

  it('rounds to the nearest whole gram, halves upward', () => {
    // 90·0.35/9 = 3.5 → round → 4 (half-up); 90·0.20/9 = 2.0; 90·0.275/9 = 2.75 → 3.
    const r = calculateFatIntake(90);
    expect(r.minGrams).toBe(2);
    expect(r.moderateGrams).toBe(3);
    expect(r.maxGrams).toBe(4);
  });

  it('keeps the band ordered (min ≤ moderate ≤ max) for positive calories', () => {
    for (const cal of [1200, 1800, 2200, 3000]) {
      const r = calculateFatIntake(cal);
      expect(r.minGrams).toBeLessThanOrEqual(r.moderateGrams);
      expect(r.moderateGrams).toBeLessThanOrEqual(r.maxGrams);
    }
  });
});

describe('fat-intake — non-positive / non-finite inputs (frozen quirks)', () => {
  // The migration's validation prevents these from reaching the function; the
  // function's own behaviour is frozen here and left unchanged.
  it('returns all zeros for 0 calories', () => {
    expect(calculateFatIntake(0)).toEqual({ minGrams: 0, moderateGrams: 0, maxGrams: 0 });
  });

  it('floors negative calories to 0 grams (never negative)', () => {
    expect(calculateFatIntake(-500)).toEqual({ minGrams: 0, moderateGrams: 0, maxGrams: 0 });
  });

  it('treats NaN calories as 0 (via `calories || 0`)', () => {
    expect(calculateFatIntake(NaN)).toEqual({ minGrams: 0, moderateGrams: 0, maxGrams: 0 });
  });
});

describe('fat-intake — result shape', () => {
  it('returns exactly the three named gram figures', () => {
    const r = calculateFatIntake(2000);
    expect(Object.keys(r).sort()).toEqual(['maxGrams', 'minGrams', 'moderateGrams']);
    for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true);
  });
});
