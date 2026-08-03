import { describe, it, expect } from 'vitest';
import { weightedGrade, finalScoreNeeded } from './grade';

/**
 * Dedicated Grade characterization (R16B2 Commit 1 — Academic family follow-on, 2 of
 * 2). FREEZES the current behaviour of `weightedGrade` and `finalScoreNeeded` ahead
 * of the task-first multi-mode migration; it does NOT change any module. The Grade
 * binding (grade-form.ts) layers per-mode validation and a complete-result guard ON
 * TOP of these unchanged functions — this file pins exactly what it wraps.
 *
 *   weightedGrade: w = max(0, weight||0); grade = Σ(score·w) / Σw  (NaN when Σw = 0)
 *                  → NORMALIZED by total weight; weights need not total 100.
 *   finalScoreNeeded: w = min(1, max(0, finalWeightPct/100));
 *                     w === 0 → NaN; else (target − (1−w)·current) / w
 *                  → ≤0 already met · 0–100 reachable · >100 unreachable (no flag; the
 *                     status is DERIVED from the number by the binding).
 *
 * The 2 Grade cases previously in batch-e.test.ts are consolidated here and expanded;
 * batch-e keeps its conversion coverage.
 */

describe('weightedGrade — normalized weighted average', () => {
  it('one row is that score (normalized by its own weight)', () => {
    const r = weightedGrade([{ score: 90, weight: 25 }]);
    expect(r.grade).toBeCloseTo(90, 10);
    expect(r.totalWeight).toBe(25);
  });

  it('multiple rows weight by their share (moved from batch-e)', () => {
    expect(weightedGrade([{ score: 90, weight: 50 }, { score: 80, weight: 50 }]).grade).toBeCloseTo(85, 10);
    expect(weightedGrade([{ score: 100, weight: 20 }, { score: 60, weight: 80 }]).grade).toBeCloseTo(68, 10);
  });

  it("matches the page's 80/20 + 75/30 + 90/50 = 83.5 example", () => {
    const r = weightedGrade([{ score: 80, weight: 20 }, { score: 75, weight: 30 }, { score: 90, weight: 50 }]);
    expect(r.grade).toBeCloseTo(83.5, 10);
    expect(r.totalWeight).toBe(100);
  });

  it('normalizes regardless of whether weights total 100 (below and above)', () => {
    expect(weightedGrade([{ score: 90, weight: 25 }, { score: 70, weight: 25 }]).grade).toBeCloseTo(80, 10); // Σw = 50
    expect(weightedGrade([{ score: 90, weight: 60 }, { score: 80, weight: 60 }]).grade).toBeCloseTo(85, 10); // Σw = 120
  });

  it('supports decimal scores and weights, and reconciles grade = Σ(score·w)/Σw', () => {
    const items = [{ score: 88.5, weight: 33.3 }, { score: 91.2, weight: 66.7 }];
    const expected = (88.5 * 33.3 + 91.2 * 66.7) / (33.3 + 66.7);
    expect(weightedGrade(items).grade).toBeCloseTo(expected, 10);
  });

  it('a zero-weight row contributes nothing; a zero-SCORE row counts at its weight', () => {
    expect(weightedGrade([{ score: 90, weight: 50 }, { score: 40, weight: 0 }]).grade).toBeCloseTo(90, 10);
    expect(weightedGrade([{ score: 0, weight: 50 }, { score: 90, weight: 50 }]).grade).toBeCloseTo(45, 10);
  });

  it('an empty list and all-zero weights both return NaN with 0 total weight', () => {
    expect(Number.isNaN(weightedGrade([]).grade)).toBe(true);
    expect(weightedGrade([]).totalWeight).toBe(0);
    expect(Number.isNaN(weightedGrade([{ score: 90, weight: 0 }]).grade)).toBe(true);
  });

  it('a negative weight clamps to 0 (max(0, weight||0)); a NaN weight clamps to 0', () => {
    expect(weightedGrade([{ score: 90, weight: -50 }, { score: 80, weight: 50 }]).grade).toBeCloseTo(80, 10);
    expect(Number.isNaN(weightedGrade([{ score: 90, weight: Number.NaN }]).grade)).toBe(true);
  });

  it('a NaN score contributes 0 quality (score||0)', () => {
    const r = weightedGrade([{ score: Number.NaN, weight: 50 }]);
    expect(r.grade).toBe(0);
    expect(r.totalWeight).toBe(50);
  });

  it('is deterministic', () => {
    const items = [{ score: 82, weight: 40 }, { score: 91, weight: 60 }];
    expect(weightedGrade(items)).toEqual(weightedGrade(items));
  });
});

describe('finalScoreNeeded — score required on the final', () => {
  it('an ordinary reachable target (moved from batch-e)', () => {
    expect(finalScoreNeeded(80, 40, 85)).toBeCloseTo(92.5, 10); // (85 − 0.6·80)/0.4
  });

  it('an unreachable target returns > 100 (moved from batch-e)', () => {
    expect(finalScoreNeeded(85, 30, 90)).toBeCloseTo(101.6667, 3); // (90 − 0.7·85)/0.3
  });

  it('an already-met target returns ≤ 0', () => {
    expect(finalScoreNeeded(90, 20, 70)).toBeCloseTo(-10, 10); // (70 − 0.8·90)/0.2
  });

  it('the exact 0 boundary (target = current with no remaining lift needed)', () => {
    expect(finalScoreNeeded(100, 20, 80)).toBeCloseTo(0, 10); // (80 − 0.8·100)/0.2
  });

  it('the exact 100 boundary (a perfect final exactly reaches the target)', () => {
    expect(finalScoreNeeded(80, 50, 90)).toBeCloseTo(100, 10); // (90 − 0.5·80)/0.5
  });

  it('a zero final-exam weight returns NaN (no final to solve for)', () => {
    expect(Number.isNaN(finalScoreNeeded(80, 0, 90))).toBe(true);
  });

  it('a final weight over 100 clamps to 100% (w = 1 → needed = target)', () => {
    expect(finalScoreNeeded(80, 150, 90)).toBeCloseTo(90, 10);
  });

  it('a negative final weight clamps to 0 → NaN', () => {
    expect(Number.isNaN(finalScoreNeeded(80, -30, 90))).toBe(true);
  });

  it('malformed / non-finite inputs propagate to NaN', () => {
    expect(Number.isNaN(finalScoreNeeded(Number.NaN, 30, 90))).toBe(true);
    expect(Number.isNaN(finalScoreNeeded(80, 30, Number.NaN))).toBe(true);
    expect(Number.isNaN(finalScoreNeeded(80, Number.NaN, 90))).toBe(true); // NaN/100 → NaN → w 0 → NaN
  });

  it('is deterministic', () => {
    expect(finalScoreNeeded(78, 35, 88)).toBe(finalScoreNeeded(78, 35, 88));
  });
});
