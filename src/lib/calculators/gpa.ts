/**
 * Weighted GPA from courses (grade points × credit hours). Pure and unit-tested.
 */
export interface GpaCourse {
  gradePoints: number; // e.g. 4.0 for an A
  credits: number;
}

export interface GpaResult {
  gpa: number;
  totalCredits: number;
  totalQualityPoints: number;
}

/** Standard 4.0-scale letter-grade to grade-point mapping. */
export const GRADE_POINTS: { label: string; value: number }[] = [
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
];

export function calculateGPA(courses: GpaCourse[]): GpaResult {
  let totalCredits = 0;
  let totalQualityPoints = 0;
  for (const c of courses) {
    const credits = Math.max(0, c.credits || 0);
    totalCredits += credits;
    totalQualityPoints += (c.gradePoints || 0) * credits;
  }
  return {
    gpa: totalCredits > 0 ? totalQualityPoints / totalCredits : NaN,
    totalCredits,
    totalQualityPoints,
  };
}
