/**
 * Grade point average, and the GPA you need next — pure and unit-tested.
 *
 * Two calculators, kept separate because they answer different questions: what my GPA is from the
 * courses I have taken, and what I need to average from here to reach a target.
 *
 * The scale is the reference's own, including the two grades most 4.0 tables leave out — A+ at 4.3
 * and D- at 0.7 — and the four that carry no grade points at all: P, NP, I and W are ignored, not
 * scored as zero. Scoring a withdrawal as an F would be a different answer to a different question.
 */
import { roundHalfUp } from './formula-steps';

export interface GradeDef {
  label: string;
  /** Grade points, or null for a grade that is ignored rather than scored. */
  points: number | null;
  /** What the grade means, for the scale table on the page. */
  note?: string;
}

/** The reference's letter grades and their numerical equivalents. */
export const GRADE_SCALE: readonly GradeDef[] = [
  { label: 'A+', points: 4.3 },
  { label: 'A', points: 4 },
  { label: 'A-', points: 3.7 },
  { label: 'B+', points: 3.3 },
  { label: 'B', points: 3 },
  { label: 'B-', points: 2.7 },
  { label: 'C+', points: 2.3 },
  { label: 'C', points: 2 },
  { label: 'C-', points: 1.7 },
  { label: 'D+', points: 1.3 },
  { label: 'D', points: 1 },
  { label: 'D-', points: 0.7 },
  { label: 'F', points: 0 },
  { label: 'P', points: null, note: 'pass' },
  { label: 'NP', points: null, note: 'not pass' },
  { label: 'I', points: null, note: 'incomplete' },
  { label: 'W', points: null, note: 'withdrawal' },
];

/** The graded letters only — the ones that carry grade points. */
export const GRADED_LETTERS: readonly GradeDef[] = GRADE_SCALE.filter((g) => g.points !== null);

/** The grades that are ignored rather than scored. */
export const IGNORED_LETTERS: readonly GradeDef[] = GRADE_SCALE.filter((g) => g.points === null);

const SCALE = new Map(GRADE_SCALE.map((g) => [g.label, g] as const));

export const isGrade = (label: string): boolean => SCALE.has(label);

/** Grade points for a letter: a number, null when the grade is ignored, undefined when unknown. */
export function gradePoints(label: string): number | null | undefined {
  const found = SCALE.get(label);
  return found ? found.points : undefined;
}

/** The highest grade the scale offers — the ceiling a required GPA can be checked against. */
export const MAX_GRADE_POINTS = Math.max(...GRADED_LETTERS.map((g) => g.points as number));

/* ------------------------------------------------------------------ */
/* GPA from courses                                                     */
/* ------------------------------------------------------------------ */

export interface GpaCourse {
  /** Optional — the reference labels the column "Course (optional)". */
  name: string;
  credits: number;
  /** A letter from the scale. */
  grade: string;
}

export interface GpaCourseResult extends GpaCourse {
  /** Grade points for the letter, or null when the grade is ignored. */
  points: number | null;
  /** credits × points, or NaN when the course carries no grade points. */
  qualityPoints: number;
  /** False for P/NP/I/W and for an unknown grade — it does not reach the average. */
  counted: boolean;
}

export interface GpaResult {
  courses: GpaCourseResult[];
  /** Credits of the COUNTED courses only; an ignored grade contributes no credits. */
  totalCredits: number;
  totalQualityPoints: number;
  /** The credit-weighted average, or NaN when nothing counted. */
  gpa: number;
}

export function calculateGPA(courses: readonly GpaCourse[]): GpaResult {
  const rows: GpaCourseResult[] = courses.map((course) => {
    const points = gradePoints(course.grade);
    const counted = typeof points === 'number' && Number.isFinite(course.credits);
    return {
      ...course,
      points: points === undefined ? null : points,
      qualityPoints: counted ? course.credits * (points as number) : Number.NaN,
      counted,
    };
  });

  let totalCredits = 0;
  let totalQualityPoints = 0;
  for (const row of rows) {
    if (!row.counted) continue;
    totalCredits += row.credits;
    totalQualityPoints += row.qualityPoints;
  }

  return {
    courses: rows,
    totalCredits,
    totalQualityPoints,
    gpa: totalCredits > 0 ? totalQualityPoints / totalCredits : Number.NaN,
  };
}

/* ------------------------------------------------------------------ */
/* GPA planning                                                         */
/* ------------------------------------------------------------------ */

export interface GpaPlanInput {
  currentGpa: number;
  targetGpa: number;
  currentCredits: number;
  additionalCredits: number;
}

export interface GpaPlan extends GpaPlanInput {
  /** The average needed across the additional credits to land on the target. */
  required: number;
  /** False when the target cannot be reached even with the highest grade on the scale. */
  achievable: boolean;
  /** True when the target is already met without any further work. */
  alreadyMet: boolean;
}

/**
 * The average needed over the next `additionalCredits` to reach `targetGpa`.
 *
 * Total quality points needed is target × all credits; the courses already taken supply
 * currentGpa × currentCredits of them, and the rest has to come from the additional credits.
 */
export function planGpa(input: GpaPlanInput): GpaPlan {
  const { currentGpa, targetGpa, currentCredits, additionalCredits } = input;
  const needed = targetGpa * (currentCredits + additionalCredits) - currentGpa * currentCredits;
  const required = additionalCredits > 0 ? needed / additionalCredits : Number.NaN;
  return {
    ...input,
    required,
    achievable: Number.isFinite(required) && required <= MAX_GRADE_POINTS,
    alreadyMet: Number.isFinite(required) && required <= 0,
  };
}

/* ------------------------------------------------------------------ */
/* Presentation helpers (pure)                                          */
/* ------------------------------------------------------------------ */

/**
 * A GPA as the reference prints it: three decimals, trailing zeros dropped.
 *
 * Rounded half-up with the float correction, because 3 × 3.3 + 3 × 4 + 2 × 3.7 over 8 credits is
 * exactly 3.6625 but arrives as 3.6624999999999996 — which rounds to 3.662, one digit off the
 * reference and off every other GPA tool.
 */
export function formatGpa(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return String(roundHalfUp(value, 3));
}

/** A credit count or a quality-point total, without floating-point noise (9.9, never 9.8999…). */
export function formatPoints(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return String(Number(value.toPrecision(12)));
}

/** The reference's Grade Points cell: "3×4 = 12". */
export function gradePointsExpression(row: GpaCourseResult): string {
  if (!row.counted) return '—';
  return `${formatPoints(row.credits)}×${formatPoints(row.points as number)} = ${formatPoints(row.qualityPoints)}`;
}
