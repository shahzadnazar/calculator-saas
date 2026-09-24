/**
 * Course grades — the weighted average of graded work, and what the final has to be.
 *
 * The reference's grade calculator does something a plain weighted average does not: it accepts
 * "90" and "B" in the same column and treats them as the same kind of thing. A percentage is read
 * as the letter band it falls in, that letter becomes grade points, and it is the GRADE POINTS that
 * are weight-averaged — which is why 90 (5%), B (20%) and 88 (20%) come out at B+ (3.21) rather
 * than the 86.9% a percentage average would give.
 *
 * Pure and unit-tested. No rounding here beyond what a caller asks for, and no DOM.
 */
import { roundHalfUp } from './formula-steps';

export interface GradeBand {
  letter: string;
  gpa: number;
  /** The percentage range this letter covers, inclusive at both ends. */
  min: number;
  max: number;
}

/** The reference's letter grades with their grade points and percentage equivalents. */
export const GRADE_BANDS: readonly GradeBand[] = [
  { letter: 'A+', gpa: 4.3, min: 97, max: 100 },
  { letter: 'A', gpa: 4, min: 93, max: 96 },
  { letter: 'A-', gpa: 3.7, min: 90, max: 92 },
  { letter: 'B+', gpa: 3.3, min: 87, max: 89 },
  { letter: 'B', gpa: 3, min: 83, max: 86 },
  { letter: 'B-', gpa: 2.7, min: 80, max: 82 },
  { letter: 'C+', gpa: 2.3, min: 77, max: 79 },
  { letter: 'C', gpa: 2, min: 73, max: 76 },
  { letter: 'C-', gpa: 1.7, min: 70, max: 72 },
  { letter: 'D+', gpa: 1.3, min: 67, max: 69 },
  { letter: 'D', gpa: 1, min: 63, max: 66 },
  { letter: 'D-', gpa: 0.7, min: 60, max: 62 },
  { letter: 'F', gpa: 0, min: 0, max: 59 },
];

/** The band a percentage falls in. Above 100 is still an A+; below 0 is not a grade. */
export function bandForPercent(percent: number): GradeBand | undefined {
  if (!Number.isFinite(percent) || percent < 0) return undefined;
  if (percent >= 97) return GRADE_BANDS[0];
  return GRADE_BANDS.find((b) => percent >= b.min && percent <= b.max);
}

/** The band for a letter, case-insensitive, accepting a unicode minus as well as a hyphen. */
export function bandForLetter(letter: string): GradeBand | undefined {
  const key = (letter ?? '').trim().toUpperCase().replace(/[−–—]/g, '-');
  return GRADE_BANDS.find((b) => b.letter === key);
}

/**
 * The band closest to a grade-point value.
 *
 * An average of 3.21 sits between B (3.0) and B+ (3.3), and the reference calls it B+ — the nearer
 * of the two, not the one it has passed.
 */
export function nearestBand(gpa: number): GradeBand | undefined {
  if (!Number.isFinite(gpa)) return undefined;
  return GRADE_BANDS.reduce((best, band) =>
    Math.abs(band.gpa - gpa) < Math.abs(best.gpa - gpa) ? band : best,
  );
}

/** A grade as the visitor wrote it, and what it is worth. */
export interface GradeValue {
  /** How it was written: a letter, or a percentage. */
  kind: 'letter' | 'percent';
  /** Exactly what was typed, for the report. */
  raw: string;
  /** The band it resolves to. */
  band: GradeBand;
  /** Its grade points. */
  gpa: number;
}

const PERCENT = /^\d*\.?\d+$/;

/** "B", "b-", "90" or "88.5" → a grade. Anything else is not one. */
export function parseGradeValue(raw: string): GradeValue | null {
  const text = (raw ?? '').trim();
  if (text === '') return null;

  if (PERCENT.test(text)) {
    const percent = Number(text);
    const band = bandForPercent(percent);
    return band ? { kind: 'percent', raw: text, band, gpa: band.gpa } : null;
  }
  const band = bandForLetter(text);
  return band ? { kind: 'letter', raw: text, band, gpa: band.gpa } : null;
}

/* ------------------------------------------------------------------ */
/* The weighted average                                                */
/* ------------------------------------------------------------------ */

export interface GradeRow {
  /** Optional — the reference labels the column "Assignment/Exam (optional)". */
  name: string;
  /** As typed: a letter or a percentage. */
  grade: string;
  /** Weight in percent. */
  weight: number;
}

export interface GradeRowResult extends GradeRow {
  value: GradeValue;
}

export interface GradeAverage {
  rows: GradeRowResult[];
  /** The weights of the rows that counted, summed. */
  totalWeight: number;
  /** The weight-averaged grade points. */
  averageGpa: number;
  /** The nearest letter to that average. */
  letter: string;
}

export function weightedGrade(rows: readonly GradeRow[]): GradeAverage {
  const counted: GradeRowResult[] = [];
  let totalWeight = 0;
  let weighted = 0;

  for (const row of rows) {
    const value = parseGradeValue(row.grade);
    if (!value || !Number.isFinite(row.weight) || row.weight < 0) continue;
    counted.push({ ...row, value });
    totalWeight += row.weight;
    weighted += value.gpa * row.weight;
  }

  const averageGpa = totalWeight > 0 ? weighted / totalWeight : Number.NaN;
  return { rows: counted, totalWeight, averageGpa, letter: nearestBand(averageGpa)?.letter ?? '—' };
}

/** "B+ (3.21)" — the reference's way of saying an average grade. */
export function formatAverageGrade(average: GradeAverage): string {
  if (!Number.isFinite(average.averageGpa)) return '—';
  return `${average.letter} (${formatGradePoints(average.averageGpa)})`;
}

/** Grade points to two decimals, trailing zeros dropped: 3.21, and 3 rather than 3.00. */
export function formatGradePoints(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return String(roundHalfUp(value, 2));
}

/** A weight or a needed score, without floating-point noise. */
export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return String(Number(value.toPrecision(12)));
}

/* ------------------------------------------------------------------ */
/* What the final has to be                                            */
/* ------------------------------------------------------------------ */

export interface FinalGradeNeed {
  needed: number;
  /** True when the target is already secured whatever the final scores. */
  alreadyMet: boolean;
}

/**
 * The score needed on the final to reach `target`, where the final is worth `finalWeightPct`% of
 * the course and `current` is the average on everything else.
 *
 * Works in whatever units the caller passes: percentages in, a percentage out; grade points in, a
 * grade point out. It never clamps — "you would need 112" is the useful answer, not an error.
 */
export function finalScoreNeeded(current: number, finalWeightPct: number, target: number): FinalGradeNeed {
  const w = (finalWeightPct ?? 0) / 100;
  if (!Number.isFinite(w) || w <= 0 || w > 1 || !Number.isFinite(current) || !Number.isFinite(target)) {
    return { needed: Number.NaN, alreadyMet: false };
  }
  const needed = (target - (1 - w) * current) / w;
  return { needed, alreadyMet: needed <= 0 };
}

/**
 * The average the remaining work has to reach for the course to land on `goalGpa`.
 *
 * The same shape as the final-grade question, but posed against the work already entered: the
 * weights so far supply part of the total, and the remaining weight has to supply the rest.
 */
export function planRemaining(
  averageGpa: number,
  doneWeight: number,
  goalGpa: number,
  remainingWeight: number,
): number {
  if (![averageGpa, doneWeight, goalGpa, remainingWeight].every(Number.isFinite)) return Number.NaN;
  if (remainingWeight <= 0) return Number.NaN;
  return (goalGpa * (doneWeight + remainingWeight) - averageGpa * doneWeight) / remainingWeight;
}
