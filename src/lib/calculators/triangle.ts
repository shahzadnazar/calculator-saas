/**
 * Solve a triangle from its three sides (SSS): angles (law of cosines), area
 * (Heron's formula), perimeter and classification. Pure and unit-tested.
 */
export interface TriangleResult {
  valid: boolean;
  angleA: number; // degrees, opposite side a
  angleB: number;
  angleC: number;
  area: number;
  perimeter: number;
  sideType: 'Equilateral' | 'Isosceles' | 'Scalene';
  angleType: 'Right' | 'Acute' | 'Obtuse';
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;

const INVALID: TriangleResult = {
  valid: false, angleA: NaN, angleB: NaN, angleC: NaN, area: NaN,
  perimeter: NaN, sideType: 'Scalene', angleType: 'Acute',
};

/** Solve from three side lengths a, b, c. */
export function solveTriangleSSS(a: number, b: number, c: number): TriangleResult {
  if (a <= 0 || b <= 0 || c <= 0) return INVALID;
  // Triangle inequality: each side must be less than the sum of the other two.
  if (a + b <= c || a + c <= b || b + c <= a) return INVALID;

  const angleA = toDeg(Math.acos((b * b + c * c - a * a) / (2 * b * c)));
  const angleB = toDeg(Math.acos((a * a + c * c - b * b) / (2 * a * c)));
  const angleC = 180 - angleA - angleB;

  const s = (a + b + c) / 2;
  const area = Math.sqrt(s * (s - a) * (s - b) * (s - c));

  const eq = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  const sideType: TriangleResult['sideType'] =
    eq(a, b) && eq(b, c) ? 'Equilateral' : eq(a, b) || eq(b, c) || eq(a, c) ? 'Isosceles' : 'Scalene';

  const maxAngle = Math.max(angleA, angleB, angleC);
  const angleType: TriangleResult['angleType'] =
    Math.abs(maxAngle - 90) < 1e-6 ? 'Right' : maxAngle > 90 ? 'Obtuse' : 'Acute';

  return {
    valid: true,
    angleA: Math.round(angleA * 100) / 100,
    angleB: Math.round(angleB * 100) / 100,
    angleC: Math.round(angleC * 100) / 100,
    area: Math.round(area * 1000) / 1000,
    perimeter: a + b + c,
    sideType,
    angleType,
  };
}
