import { describe, it, expect } from 'vitest';
import {
  GRADE_BANDS,
  bandForPercent,
  bandForLetter,
  nearestBand,
  parseGradeValue,
  weightedGrade,
  finalScoreNeeded,
  planRemaining,
  formatAverageGrade,
  formatGradePoints,
  formatScore,
} from './grade';

/** The reference's own worked example. */
const ROWS = [
  { name: 'Homework 1', grade: '90', weight: 5 },
  { name: 'Project', grade: 'B', weight: 20 },
  { name: 'Midterm exam', grade: '88', weight: 20 },
];

describe('the letter-grade table', () => {
  it('is the reference table, with grade points and percentage ranges', () => {
    expect(GRADE_BANDS.map((b) => [b.letter, b.gpa, b.min, b.max])).toEqual([
      ['A+', 4.3, 97, 100],
      ['A', 4, 93, 96],
      ['A-', 3.7, 90, 92],
      ['B+', 3.3, 87, 89],
      ['B', 3, 83, 86],
      ['B-', 2.7, 80, 82],
      ['C+', 2.3, 77, 79],
      ['C', 2, 73, 76],
      ['C-', 1.7, 70, 72],
      ['D+', 1.3, 67, 69],
      ['D', 1, 63, 66],
      ['D-', 0.7, 60, 62],
      ['F', 0, 0, 59],
    ]);
  });

  it('covers every percentage from 0 to 100 with no gap', () => {
    for (let p = 0; p <= 100; p += 1) expect(bandForPercent(p)?.letter, String(p)).toBeTruthy();
  });

  it('places a percentage in its band, at both edges', () => {
    expect(bandForPercent(90)?.letter).toBe('A-');
    expect(bandForPercent(92)?.letter).toBe('A-');
    expect(bandForPercent(89)?.letter).toBe('B+');
    expect(bandForPercent(59)?.letter).toBe('F');
    expect(bandForPercent(0)?.letter).toBe('F');
    expect(bandForPercent(100)?.letter).toBe('A+');
  });

  it('treats extra credit as an A+, and a negative as no grade at all', () => {
    expect(bandForPercent(105)?.letter).toBe('A+');
    expect(bandForPercent(-1)).toBeUndefined();
  });

  it('reads a letter whatever the case, and with a unicode minus', () => {
    expect(bandForLetter('b+')?.gpa).toBe(3.3);
    expect(bandForLetter(' A- ')?.gpa).toBe(3.7);
    expect(bandForLetter('A−')?.gpa).toBe(3.7); // U+2212
    expect(bandForLetter('E')).toBeUndefined();
  });

  it('picks the NEAREST letter to a grade-point value, not the one it has passed', () => {
    expect(nearestBand(3.21)?.letter).toBe('B+'); // nearer 3.3 than 3.0
    expect(nearestBand(3.05)?.letter).toBe('B');
    expect(nearestBand(4.3)?.letter).toBe('A+');
    expect(nearestBand(0)?.letter).toBe('F');
  });
});

describe('parsing a grade', () => {
  it('accepts a percentage and a letter in the same column', () => {
    expect(parseGradeValue('90')).toMatchObject({ kind: 'percent', gpa: 3.7, raw: '90' });
    expect(parseGradeValue('B')).toMatchObject({ kind: 'letter', gpa: 3, raw: 'B' });
    expect(parseGradeValue('88.5')).toMatchObject({ kind: 'percent', gpa: 3.3 });
  });

  it('refuses what is not a grade', () => {
    expect(parseGradeValue('')).toBe(null);
    expect(parseGradeValue('Z')).toBe(null);
    expect(parseGradeValue('-5')).toBe(null);
    expect(parseGradeValue('90%')).toBe(null);
  });
});

describe('the weighted average — the reference example', () => {
  const r = weightedGrade(ROWS);

  it('averages GRADE POINTS, not percentages', () => {
    // 90 → A- → 3.7, B → 3.0, 88 → B+ → 3.3, weighted over 45 → 3.2111…
    expect(r.averageGpa).toBeCloseTo(3.2111111111, 9);
    expect(formatGradePoints(r.averageGpa)).toBe('3.21');
  });

  it('reports the reference letter and total weight', () => {
    expect(r.letter).toBe('B+');
    expect(r.totalWeight).toBe(45);
    expect(formatAverageGrade(r)).toBe('B+ (3.21)');
  });

  it('keeps each grade as it was typed, for the report', () => {
    expect(r.rows.map((row) => row.value.raw)).toEqual(['90', 'B', '88']);
  });
});

describe('the weighted average — edges', () => {
  it('skips a row with an unreadable grade rather than scoring it zero', () => {
    const r = weightedGrade([...ROWS, { name: 'Bad', grade: 'Z', weight: 55 }]);
    expect(r.totalWeight).toBe(45);
    expect(r.rows).toHaveLength(3);
  });

  it('has no average when nothing counted', () => {
    expect(weightedGrade([]).averageGpa).toBeNaN();
    expect(weightedGrade([{ name: '', grade: 'B', weight: 0 }]).averageGpa).toBeNaN();
    expect(formatAverageGrade(weightedGrade([]))).toBe('—');
  });

  it('gives an all-F course a real 0, not an absent result', () => {
    const r = weightedGrade([{ name: 'One', grade: 'F', weight: 100 }]);
    expect(r.averageGpa).toBe(0);
    expect(r.letter).toBe('F');
  });

  it('weights by weight, not by row count', () => {
    const r = weightedGrade([
      { name: 'Tiny', grade: 'A+', weight: 1 },
      { name: 'Huge', grade: 'F', weight: 99 },
    ]);
    expect(r.averageGpa).toBeCloseTo(0.043, 10);
    expect(r.letter).toBe('F');
  });
});

describe('what the final has to be — the reference example', () => {
  it('reproduces "80.5" for 88 now, 85 wanted, a final worth 40%', () => {
    const r = finalScoreNeeded(88, 40, 85);
    expect(r.needed).toBeCloseTo(80.5, 10);
    expect(r.alreadyMet).toBe(false);
  });

  it('knows when the target is already secured', () => {
    const r = finalScoreNeeded(90, 20, 50);
    expect(r.alreadyMet).toBe(true);
    expect(r.needed).toBeLessThanOrEqual(0);
  });

  it('returns a number above 100 rather than an error, because that is the useful answer', () => {
    expect(finalScoreNeeded(60, 10, 90).needed).toBeCloseTo(360, 10);
  });

  it('has no answer for a final worth nothing, or more than everything', () => {
    expect(finalScoreNeeded(88, 0, 85).needed).toBeNaN();
    expect(finalScoreNeeded(88, 140, 85).needed).toBeNaN();
  });

  it('needs exactly the target when the final is the whole course', () => {
    expect(finalScoreNeeded(50, 100, 85).needed).toBeCloseTo(85, 10);
  });
});

describe('planning the remaining work', () => {
  it('asks the same question against the work already entered', () => {
    // 3.2111… over 45%, aiming for 3.7 with 55% left.
    const required = planRemaining(3.2111111111111112, 45, 3.7, 55);
    expect(required).toBeCloseTo(4.09999999, 6);
  });

  it('has no answer without remaining weight', () => {
    expect(planRemaining(3, 45, 3.7, 0)).toBeNaN();
    expect(planRemaining(Number.NaN, 45, 3.7, 55)).toBeNaN();
  });
});

describe('formatting', () => {
  it('prints grade points to two decimals, trailing zeros dropped', () => {
    expect(formatGradePoints(3.2111111)).toBe('3.21');
    expect(formatGradePoints(3)).toBe('3');
    expect(formatGradePoints(4.3)).toBe('4.3');
  });

  it('strips floating-point noise from a weight or a score', () => {
    expect(formatScore(45.000000000000004)).toBe('45');
    expect(formatScore(80.5)).toBe('80.5');
  });

  it('never prints a non-finite figure', () => {
    expect(formatGradePoints(Number.NaN)).toBe('—');
    expect(formatScore(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
