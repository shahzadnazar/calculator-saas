import { describe, it, expect } from 'vitest';
import {
  GRADE_SCALE,
  GRADED_LETTERS,
  IGNORED_LETTERS,
  gradePoints,
  isGrade,
  MAX_GRADE_POINTS,
  calculateGPA,
  planGpa,
  formatGpa,
  formatPoints,
  gradePointsExpression,
} from './gpa';

/** The reference's own worked example. */
const COURSES = [
  { name: 'Math', credits: 3, grade: 'A' },
  { name: 'English', credits: 3, grade: 'B+' },
  { name: 'History', credits: 2, grade: 'A-' },
];

describe('the grade scale', () => {
  it('is the reference scale, including the A+ and D- most 4.0 tables leave out', () => {
    expect(GRADED_LETTERS.map((g) => [g.label, g.points])).toEqual([
      ['A+', 4.3],
      ['A', 4],
      ['A-', 3.7],
      ['B+', 3.3],
      ['B', 3],
      ['B-', 2.7],
      ['C+', 2.3],
      ['C', 2],
      ['C-', 1.7],
      ['D+', 1.3],
      ['D', 1],
      ['D-', 0.7],
      ['F', 0],
    ]);
  });

  it('carries the four grades that are ignored rather than scored', () => {
    expect(IGNORED_LETTERS.map((g) => g.label)).toEqual(['P', 'NP', 'I', 'W']);
    for (const g of IGNORED_LETTERS) expect(g.points).toBe(null);
  });

  it('tops out at 4.3, not 4', () => {
    expect(MAX_GRADE_POINTS).toBe(4.3);
  });

  it('tells a scored grade, an ignored grade and an unknown one apart', () => {
    expect(gradePoints('B+')).toBe(3.3);
    expect(gradePoints('W')).toBe(null); // ignored, NOT zero
    expect(gradePoints('Z')).toBeUndefined();
    expect(isGrade('D-')).toBe(true);
    expect(isGrade('E')).toBe(false);
  });

  it('has no duplicate labels', () => {
    expect(new Set(GRADE_SCALE.map((g) => g.label)).size).toBe(GRADE_SCALE.length);
  });
});

describe('GPA from courses — the reference example', () => {
  const r = calculateGPA(COURSES);

  it('totals the credits of the counted courses', () => {
    expect(r.totalCredits).toBe(8);
  });

  it('gives each course its grade points, as the reference writes them', () => {
    expect(r.courses.map(gradePointsExpression)).toEqual(['3×4 = 12', '3×3.3 = 9.9', '2×3.7 = 7.4']);
  });

  it('reports the reference GPA of 3.663', () => {
    // The exact value is 3.6625; in binary floating point it arrives just under, and a naive
    // round would print 3.662 — one digit off the reference.
    expect(r.gpa).toBeCloseTo(3.6625, 10);
    expect(formatGpa(r.gpa)).toBe('3.663');
  });
});

describe('GPA — ignored grades', () => {
  it('leaves a P, NP, I or W out of both the credits and the average', () => {
    const r = calculateGPA([
      { name: 'Math', credits: 3, grade: 'A' },
      { name: 'Yoga', credits: 2, grade: 'P' },
      { name: 'Dropped', credits: 4, grade: 'W' },
    ]);
    expect(r.totalCredits).toBe(3); // not 9
    expect(r.gpa).toBe(4);
    expect(r.courses.map((c) => c.counted)).toEqual([true, false, false]);
  });

  it('scores an F as zero, which is not the same as ignoring it', () => {
    const r = calculateGPA([
      { name: 'Math', credits: 3, grade: 'A' },
      { name: 'Physics', credits: 3, grade: 'F' },
    ]);
    expect(r.totalCredits).toBe(6);
    expect(r.gpa).toBe(2);
  });

  it('has no GPA at all when nothing counted', () => {
    const r = calculateGPA([{ name: 'Yoga', credits: 2, grade: 'P' }]);
    expect(r.totalCredits).toBe(0);
    expect(r.gpa).toBeNaN();
    expect(formatGpa(r.gpa)).toBe('—');
  });

  it('has no GPA for an empty list', () => {
    expect(calculateGPA([]).gpa).toBeNaN();
  });
});

describe('GPA — weighting and edges', () => {
  it('weights by credits, not by course count', () => {
    const r = calculateGPA([
      { name: 'Big', credits: 6, grade: 'A' },
      { name: 'Small', credits: 1, grade: 'F' },
    ]);
    expect(r.gpa).toBeCloseTo(24 / 7, 12);
  });

  it('accepts fractional credits', () => {
    const r = calculateGPA([
      { name: 'Lab', credits: 0.5, grade: 'A' },
      { name: 'Seminar', credits: 1.5, grade: 'B' },
    ]);
    expect(r.totalCredits).toBe(2);
    expect(r.gpa).toBeCloseTo(3.25, 12);
  });

  it('lets a zero-credit course count without moving the average', () => {
    const r = calculateGPA([
      { name: 'Math', credits: 3, grade: 'A' },
      { name: 'Audit', credits: 0, grade: 'F' },
    ]);
    expect(r.totalCredits).toBe(3);
    expect(r.gpa).toBe(4);
  });

  it('gives an all-F transcript a real 0, not an absent result', () => {
    const r = calculateGPA([{ name: 'One', credits: 3, grade: 'F' }]);
    expect(r.gpa).toBe(0);
    expect(formatGpa(r.gpa)).toBe('0');
  });
});

describe('GPA planning — the reference example', () => {
  const p = planGpa({ currentGpa: 3.663, targetGpa: 3, currentCredits: 8, additionalCredits: 15 });

  it('reports the reference requirement of 2.646', () => {
    expect(formatGpa(p.required)).toBe('2.646');
    expect(p.achievable).toBe(true);
  });

  it('knows when a target is already met', () => {
    const met = planGpa({ currentGpa: 4, targetGpa: 2, currentCredits: 30, additionalCredits: 15 });
    expect(met.alreadyMet).toBe(true);
    expect(met.required).toBeLessThanOrEqual(0);
  });

  it('knows when a target cannot be reached on this scale', () => {
    const hard = planGpa({ currentGpa: 1, targetGpa: 4, currentCredits: 60, additionalCredits: 3 });
    expect(hard.achievable).toBe(false);
    expect(hard.required).toBeGreaterThan(MAX_GRADE_POINTS);
  });

  it('has no answer without additional credits, rather than dividing by zero', () => {
    const none = planGpa({ currentGpa: 3, targetGpa: 3.5, currentCredits: 10, additionalCredits: 0 });
    expect(none.required).toBeNaN();
    expect(none.achievable).toBe(false);
  });

  it('needs exactly the target when there is no history to average against', () => {
    const fresh = planGpa({ currentGpa: 0, targetGpa: 3.5, currentCredits: 0, additionalCredits: 12 });
    expect(fresh.required).toBeCloseTo(3.5, 12);
  });
});

describe('formatting', () => {
  it('prints a GPA to three decimals, trailing zeros dropped', () => {
    expect(formatGpa(3.6625)).toBe('3.663');
    expect(formatGpa(4)).toBe('4');
    expect(formatGpa(3.5)).toBe('3.5');
    expect(formatGpa(2.6464)).toBe('2.646');
  });

  it('rounds half UP, and corrects the float error that would round it down', () => {
    expect(formatGpa(3.6624999999999996)).toBe('3.663');
    expect(formatGpa(0.0005)).toBe('0.001');
  });

  it('never prints a non-finite GPA', () => {
    expect(formatGpa(Number.NaN)).toBe('—');
    expect(formatGpa(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('strips floating-point noise from a product', () => {
    expect(formatPoints(9.899999999999999)).toBe('9.9');
    expect(formatPoints(12)).toBe('12');
    expect(formatPoints(0.5)).toBe('0.5');
  });

  it('says an ignored course has no grade points rather than showing a product', () => {
    const r = calculateGPA([{ name: 'Yoga', credits: 2, grade: 'W' }]);
    expect(gradePointsExpression(r.courses[0])).toBe('—');
  });
});
