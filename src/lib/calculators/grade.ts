/**
 * Grade math: the weighted average of graded items, and the score needed on a
 * final to reach a target grade. Pure and unit-tested.
 */
export interface GradeItem {
  score: number; // percent achieved
  weight: number; // relative weight
}

export interface WeightedGradeResult {
  grade: number; // weighted average percent
  totalWeight: number;
}

export function weightedGrade(items: GradeItem[]): WeightedGradeResult {
  let weightSum = 0;
  let weighted = 0;
  for (const it of items) {
    const w = Math.max(0, it.weight || 0);
    weightSum += w;
    weighted += (it.score || 0) * w;
  }
  return {
    grade: weightSum > 0 ? weighted / weightSum : NaN,
    totalWeight: weightSum,
  };
}

/**
 * Score needed on the final to reach `targetGrade`, where the final is worth
 * `finalWeightPct`% of the overall grade and `currentGrade` is your average on
 * everything so far. Can exceed 100 (target unreachable) or be ≤ 0 (already met).
 */
export function finalScoreNeeded(
  currentGrade: number,
  finalWeightPct: number,
  targetGrade: number,
): number {
  const w = Math.min(1, Math.max(0, (finalWeightPct || 0) / 100));
  if (w === 0) return NaN;
  return (targetGrade - (1 - w) * currentGrade) / w;
}
