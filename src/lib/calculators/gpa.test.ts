import { describe, it, expect } from 'vitest';
import { calculateGPA, GRADE_POINTS } from './gpa';

/**
 * Dedicated GPA characterization (R16B1 Commit 1 — Academic family pilot, 1 of 2).
 * FREEZES the current behaviour of `calculateGPA` + the `GRADE_POINTS` scale ahead
 * of the task-first migration; it does NOT change any module. The GPA binding
 * (gpa-form.ts) layers row/credit validation and a complete-result guard ON TOP of
 * this unchanged function — this file pins exactly what it wraps:
 *
 *   • per course: credits = max(0, credits||0); qualityPoints += (gradePoints||0)·credits;
 *   • totalCredits = Σ credits; totalQualityPoints = Σ qualityPoints;
 *   • gpa = totalCredits > 0 ? totalQualityPoints / totalCredits : NaN.
 *
 * A valid GPA of 0 (an F with positive credits) is DISTINCT from the NaN returned
 * when total credits is 0 — the migration's complete-result guard depends on this.
 * The 2 GPA cases previously in batch-e.test.ts are consolidated here and expanded;
 * batch-e keeps its grade / conversion coverage.
 */

const MAX_GRADE_POINT = Math.max(...GRADE_POINTS.map((g) => g.value));

describe('GPA — GRADE_POINTS scale (frozen)', () => {
  it('is the exact 11-entry unweighted 4.0 scale (no A+, no D−)', () => {
    expect(GRADE_POINTS).toEqual([
      { label: 'A', value: 4.0 },
      { label: 'A-', value: 3.7 },
      { label: 'B+', value: 3.3 },
      { label: 'B', value: 3.0 },
      { label: 'B-', value: 2.7 },
      { label: 'C+', value: 2.3 },
      { label: 'C', value: 2.0 },
      { label: 'C-', value: 1.7 },
      { label: 'D+', value: 1.3 },
      { label: 'D', value: 1.0 },
      { label: 'F', value: 0.0 },
    ]);
  });
  it('the exact maximum scale value is 4.0 (the GPA guard ceiling)', () => {
    expect(MAX_GRADE_POINT).toBe(4.0);
  });
  it('every value is within [0, 4.0]', () => {
    for (const g of GRADE_POINTS) {
      expect(g.value).toBeGreaterThanOrEqual(0);
      expect(g.value).toBeLessThanOrEqual(MAX_GRADE_POINT);
    }
  });
});

describe('GPA — weighted computation', () => {
  it('one ordinary course: gpa = its grade points, credits echoed (moved/expanded from batch-e)', () => {
    const r = calculateGPA([{ gradePoints: 3.7, credits: 4 }]);
    expect(r.totalCredits).toBe(4);
    expect(r.totalQualityPoints).toBeCloseTo(14.8, 6);
    expect(r.gpa).toBeCloseTo(3.7, 6);
  });

  it('multiple courses weight quality points by credits (the batch-e 3.51 case)', () => {
    const r = calculateGPA([
      { gradePoints: 4.0, credits: 3 },
      { gradePoints: 3.0, credits: 4 },
      { gradePoints: 3.7, credits: 3 },
    ]);
    expect(r.totalCredits).toBe(10);
    expect(r.totalQualityPoints).toBeCloseTo(35.1, 6); // 12 + 12 + 11.1
    expect(r.gpa).toBeCloseTo(3.51, 2);
  });

  it('an all-A transcript is exactly 4.0', () => {
    const r = calculateGPA([
      { gradePoints: 4.0, credits: 3 },
      { gradePoints: 4.0, credits: 5 },
    ]);
    expect(r.gpa).toBe(4.0);
    expect(r.totalCredits).toBe(8);
  });

  it('valid F grades with positive credits are exactly 0.0 (NOT NaN)', () => {
    const r = calculateGPA([
      { gradePoints: 0.0, credits: 3 },
      { gradePoints: 0.0, credits: 4 },
    ]);
    expect(r.gpa).toBe(0);
    expect(Number.isNaN(r.gpa)).toBe(false);
    expect(r.totalCredits).toBe(7);
  });

  it('mixed grades reconcile gpa = totalQualityPoints / totalCredits', () => {
    const r = calculateGPA([
      { gradePoints: 4.0, credits: 3 },
      { gradePoints: 2.0, credits: 3 },
      { gradePoints: 0.0, credits: 2 },
    ]);
    expect(r.totalCredits).toBe(8);
    expect(r.totalQualityPoints).toBeCloseTo(18, 6); // 12 + 6 + 0
    expect(r.gpa).toBeCloseTo(18 / 8, 10);
  });

  it('supports decimal credit hours', () => {
    const r = calculateGPA([
      { gradePoints: 4.0, credits: 1.5 },
      { gradePoints: 3.0, credits: 0.5 },
    ]);
    expect(r.totalCredits).toBeCloseTo(2, 10);
    expect(r.gpa).toBeCloseTo(7.5 / 2, 10); // 6 + 1.5 = 7.5 over 2
  });
});

describe('GPA — zero / degenerate credit handling', () => {
  it('a zero-credit row contributes nothing but is not itself invalid', () => {
    const r = calculateGPA([
      { gradePoints: 4.0, credits: 3 },
      { gradePoints: 2.0, credits: 0 },
    ]);
    expect(r.totalCredits).toBe(3);
    expect(r.gpa).toBe(4.0); // the 0-credit C does not move the GPA
  });

  it('all-zero-credit input returns NaN (total credits 0)', () => {
    expect(Number.isNaN(calculateGPA([{ gradePoints: 4.0, credits: 0 }]).gpa)).toBe(true);
  });

  it('an empty course list returns NaN gpa with 0 totals', () => {
    const r = calculateGPA([]);
    expect(Number.isNaN(r.gpa)).toBe(true);
    expect(r.totalCredits).toBe(0);
    expect(r.totalQualityPoints).toBe(0);
  });
});

describe('GPA — malformed / negative source inputs (clamped, not sanitized-to-valid)', () => {
  it('negative credits clamp to 0 (Math.max(0, credits||0))', () => {
    const r = calculateGPA([
      { gradePoints: 4.0, credits: -3 },
      { gradePoints: 3.0, credits: 4 },
    ]);
    expect(r.totalCredits).toBe(4); // the −3 clamps to 0
    expect(r.gpa).toBe(3.0);
  });
  it('a NaN credit field clamps to 0 (NaN || 0)', () => {
    expect(Number.isNaN(calculateGPA([{ gradePoints: 4.0, credits: Number.NaN }]).gpa)).toBe(true);
  });
  it('a NaN gradePoints contributes 0 quality points (gradePoints || 0)', () => {
    const r = calculateGPA([{ gradePoints: Number.NaN, credits: 3 }]);
    expect(r.totalCredits).toBe(3);
    expect(r.totalQualityPoints).toBe(0);
    expect(r.gpa).toBe(0); // 0 quality points over 3 credits
  });
  it('is deterministic for identical input', () => {
    const input = [{ gradePoints: 3.3, credits: 3 }, { gradePoints: 2.7, credits: 4 }];
    expect(calculateGPA(input)).toEqual(calculateGPA(input));
  });
});
