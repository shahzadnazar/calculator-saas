import { describe, it, expect } from 'vitest';
import { computePace, predictTime, formatDuration, RACE_DISTANCES } from './pace';

/**
 * Pace CHARACTERIZATION suite (R7C-2E1, commit 1 of 2).
 *
 * Existing coverage was a couple of shared-batch assertions (batch-c.test.ts); this
 * dedicated suite freezes the EXACT current behaviour of the reviewed pure module
 * BEFORE the task-first UX migration, so the migration's new validation (which stops
 * non-positive / non-finite inputs from ever reaching these functions) is a visible
 * binding-level decision — not a silent formula change.
 *
 * Confirmed from source (src/lib/calculators/pace.ts), not assumed:
 *   - KM_PER_MI = 1.609344;
 *   - computePace: km = unit==='km' ? distance : distance·KM_PER_MI; NaN-all when
 *     km ≤ 0 or t ≤ 0; else secPerKm = t/km, secPerMi = secPerKm·KM_PER_MI,
 *     kmh = km/(t/3600), mph = (km/KM_PER_MI)/(t/3600);
 *   - predictTime(secPerKm, raceKm) = secPerKm·raceKm;
 *   - formatDuration → H:MM:SS (hour dropped when 0), Math.round, negative/non-finite → '—';
 *   - RACE_DISTANCES = 5K/10K/Half(21.0975)/Marathon(42.195).
 *
 * SINGLE-MODE: the module solves only for pace from a distance + time. There is no
 * solve-for-time or solve-for-distance path (verified in R7C-2E0).
 */
const KM_PER_MI = 1.609344;

describe('pace — computePace (valid distance + time)', () => {
  it('computes pace and speed from a kilometre distance (10 km in 50:00)', () => {
    const r = computePace({ distance: 10, unit: 'km', timeSeconds: 3000 });
    expect(r.secPerKm).toBe(300); // 3000 / 10  → 5:00 /km
    expect(r.secPerMi).toBeCloseTo(482.8032, 4); // 300 · KM_PER_MI  → ~8:03 /mi
    expect(r.kmh).toBeCloseTo(12, 9); // 10 / (3000/3600)
    expect(r.mph).toBeCloseTo(7.4564543, 6); // (10/KM_PER_MI) / (3000/3600)
  });

  it('treats a mile distance as the same physical distance (6.213712 mi ≈ 10 km)', () => {
    const km = computePace({ distance: 10, unit: 'km', timeSeconds: 3000 });
    const mi = computePace({ distance: 10 / KM_PER_MI, unit: 'mi', timeSeconds: 3000 });
    // Same physical distance → same pace and speed.
    expect(mi.secPerKm).toBeCloseTo(km.secPerKm, 6);
    expect(mi.secPerMi).toBeCloseTo(km.secPerMi, 6);
    expect(mi.kmh).toBeCloseTo(km.kmh, 6);
    expect(mi.mph).toBeCloseTo(km.mph, 6);
  });

  it('holds the exact KM_PER_MI relationships between the metrics', () => {
    const r = computePace({ distance: 7.5, unit: 'km', timeSeconds: 2400 });
    expect(r.secPerMi).toBeCloseTo(r.secPerKm * KM_PER_MI, 9); // per-mile = per-km · KM_PER_MI
    expect(r.mph).toBeCloseTo(r.kmh / KM_PER_MI, 9); // mph = kmh / KM_PER_MI
  });

  it('returns raw (unrounded) speeds — display rounding (toFixed(1)) is a UI concern', () => {
    const r = computePace({ distance: 10, unit: 'km', timeSeconds: 3000 });
    expect(r.mph).not.toBe(7.5); // the pure value is 7.4564543…, not the displayed 7.5
    expect(Number(r.mph.toFixed(1))).toBe(7.5); // …which the island renders as 7.5
  });

  it('a valid result is fully finite, positive and correctly ordered', () => {
    const r = computePace({ distance: 5, unit: 'km', timeSeconds: 1500 });
    for (const v of [r.secPerKm, r.secPerMi, r.kmh, r.mph]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(r.secPerMi).toBeGreaterThan(r.secPerKm); // a mile takes longer than a km
    expect(r.kmh).toBeGreaterThan(r.mph); // more km than miles per hour
  });
});

describe('pace — computePace (unusable inputs → all NaN, frozen quirks)', () => {
  it('returns all-NaN for zero distance / zero time / negatives', () => {
    for (const input of [
      { distance: 0, unit: 'km' as const, timeSeconds: 1500 },
      { distance: 5, unit: 'km' as const, timeSeconds: 0 },
      { distance: -5, unit: 'km' as const, timeSeconds: 1500 },
      { distance: 5, unit: 'km' as const, timeSeconds: -100 },
    ]) {
      const r = computePace(input);
      expect([r.secPerKm, r.secPerMi, r.kmh, r.mph].every(Number.isNaN)).toBe(true);
    }
  });

  it('treats NaN distance / time as 0 (via `|| 0`) → all NaN', () => {
    expect(Number.isNaN(computePace({ distance: NaN, unit: 'km', timeSeconds: 1500 }).secPerKm)).toBe(true);
    expect(Number.isNaN(computePace({ distance: 5, unit: 'km', timeSeconds: NaN }).secPerKm)).toBe(true);
  });

  it('Infinity distance is NOT guarded (frozen quirk): pace 0, speed Infinity', () => {
    const r = computePace({ distance: Infinity, unit: 'km', timeSeconds: 1500 });
    expect(r.secPerKm).toBe(0); // 1500 / Infinity
    expect(r.kmh).toBe(Infinity);
    // The migration's validation (finite distance > 0) prevents this from being reached.
  });
});

describe('pace — predictTime (even-pace equivalents; formula unchanged)', () => {
  it('multiplies pace-per-km by the race distance for every RACE_DISTANCES entry', () => {
    expect(RACE_DISTANCES.map((race) => [race.name, race.km])).toEqual([
      ['5K', 5],
      ['10K', 10],
      ['Half Marathon', 21.0975],
      ['Marathon', 42.195],
    ]);
    expect(predictTime(300, 5)).toBe(1500); // 25:00
    expect(predictTime(300, 10)).toBe(3000); // 50:00
    expect(predictTime(300, 21.0975)).toBeCloseTo(6329.25, 6);
    expect(predictTime(300, 42.195)).toBeCloseTo(12658.5, 6);
  });
});

describe('pace — formatDuration', () => {
  it('formats below one hour as M:SS and drops the hour', () => {
    expect(formatDuration(1500)).toBe('25:00');
    expect(formatDuration(300)).toBe('5:00');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(3599)).toBe('59:59'); // still below an hour → no hour segment
  });

  it('formats at or above one hour as H:MM:SS', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(12658.5)).toBe('3:30:59'); // 12658.5 → round 12659 → 3:30:59
  });

  it('rounds to the nearest whole second, halves upward', () => {
    expect(formatDuration(89.5)).toBe('1:30'); // 89.5 → 90
    expect(formatDuration(89.4)).toBe('1:29'); // 89.4 → 89
  });

  it('returns an em-dash placeholder for negative or non-finite durations', () => {
    expect(formatDuration(-5)).toBe('—');
    expect(formatDuration(NaN)).toBe('—');
    expect(formatDuration(Infinity)).toBe('—');
  });
});
