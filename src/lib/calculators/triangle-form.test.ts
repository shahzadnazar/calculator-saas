import { describe, it, expect } from 'vitest';
import {
  validateTriangleValues,
  computeTriangle,
  interpretTriangle,
  describeTriangleResult,
  isTriangleResultUsable,
  triangleBinding,
  TRIANGLE_DOMAIN_ERROR,
  type TriangleValues,
  type TriangleComputed,
} from './triangle-form';
import { solveTriangleSSS } from './triangle';

const vals = (over: Partial<TriangleValues> = {}): TriangleValues => ({ a: '3', b: '4', c: '5', ...over });

const fieldErrs = (r: ReturnType<typeof validateTriangleValues>) =>
  (r as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
const formErr = (r: ReturnType<typeof validateTriangleValues>) => (r as { formError?: string }).formError;

const result = (over: Partial<TriangleComputed> = {}): TriangleComputed => ({
  valid: true,
  angleA: 36.87,
  angleB: 53.13,
  angleC: 90,
  area: 6,
  perimeter: 12,
  sideType: 'Scalene',
  angleType: 'Right',
  ...over,
});

/** DOM-free stub modelling the three side inputs. */
function stubRoot(v: Record<string, string>) {
  const inputs: Record<string, { value: string }> = {};
  for (const [k, val] of Object.entries(v)) inputs[k] = { value: val };
  return {
    querySelector(sel: string) {
      const m = sel.match(/\[name="(.+?)"\]$/);
      return m ? (inputs[m[1]] ?? null) : null;
    },
  } as unknown as HTMLElement;
}

/* ------------------------------------------------------------------ */
/* Validation — field level                                            */
/* ------------------------------------------------------------------ */

describe('triangle-form — field validation', () => {
  it('accepts an ordinary valid triangle', () => {
    expect(validateTriangleValues(vals())).toEqual({ ok: true });
  });

  it('all sides empty → three field errors, no form error', () => {
    const r = validateTriangleValues(vals({ a: '', b: '', c: '' }));
    expect(fieldErrs(r)).toEqual({
      a: 'Enter Side A greater than zero.',
      b: 'Enter Side B greater than zero.',
      c: 'Enter Side C greater than zero.',
    });
    expect(formErr(r)).toBeUndefined();
  });

  it('each side individually: empty / zero / negative / non-finite is a field error', () => {
    expect(fieldErrs(validateTriangleValues(vals({ a: '' }))).a).toBe('Enter Side A greater than zero.');
    expect(fieldErrs(validateTriangleValues(vals({ b: '0' }))).b).toBe('Enter Side B greater than zero.');
    expect(fieldErrs(validateTriangleValues(vals({ c: '-5' }))).c).toBe('Enter Side C greater than zero.');
    expect(fieldErrs(validateTriangleValues(vals({ a: 'NaN' }))).a).toBe('Enter Side A greater than zero.');
    expect(fieldErrs(validateTriangleValues(vals({ b: 'Infinity' }))).b).toBe('Enter Side B greater than zero.');
  });

  it('a non-finite side is a FIELD error and the inequality is never reached', () => {
    const r = validateTriangleValues(vals({ a: 'Infinity' }));
    expect(fieldErrs(r).a).toBeDefined();
    expect(formErr(r)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Validation — cross-field triangle inequality (form-level)            */
/* ------------------------------------------------------------------ */

describe('triangle-form — triangle inequality (form-level)', () => {
  it('a degenerate equality is one FORM error, no side uniquely blamed', () => {
    const r = validateTriangleValues(vals({ a: '1', b: '1', c: '2' }));
    expect(fieldErrs(r)).toEqual({});
    expect(formErr(r)).toBe(TRIANGLE_DOMAIN_ERROR);
    expect(TRIANGLE_DOMAIN_ERROR).toBe('These side lengths cannot form a triangle.');
  });

  it('rejects every inequality permutation (equality and strict violation)', () => {
    for (const [a, b, c] of [
      ['1', '1', '2'], ['1', '1', '3'], // a+b <= c
      ['1', '2', '1'], ['1', '3', '1'], // a+c <= b
      ['2', '1', '1'], ['3', '1', '1'], // b+c <= a
    ] as const) {
      const r = validateTriangleValues(vals({ a, b, c }));
      expect(formErr(r)).toBe(TRIANGLE_DOMAIN_ERROR);
      expect(fieldErrs(r)).toEqual({});
    }
  });

  it('accepts a triangle just inside the boundary, rejects one just outside', () => {
    expect(validateTriangleValues(vals({ a: '1', b: '1', c: '1.999' }))).toEqual({ ok: true });
    expect(formErr(validateTriangleValues(vals({ a: '1', b: '1', c: '2.0001' })))).toBe(TRIANGLE_DOMAIN_ERROR);
    expect(validateTriangleValues(vals({ a: '5', b: '5', c: '8' }))).toEqual({ ok: true });
  });
});

/* ------------------------------------------------------------------ */
/* Computation — delegation + guard                                     */
/* ------------------------------------------------------------------ */

describe('triangle-form — compute', () => {
  it('preserves the pure formula output exactly (delegation)', () => {
    for (const c of [vals(), vals({ a: '5', b: '5', c: '5' }), vals({ a: '3.5', b: '4.5', c: '5.5' })]) {
      expect(computeTriangle(c)).toEqual(solveTriangleSSS(Number(c.a), Number(c.b), Number(c.c)));
    }
  });

  it('3-4-5 carries area 6, perimeter 12, right scalene', () => {
    expect(computeTriangle(vals())).toMatchObject({ area: 6, perimeter: 12, sideType: 'Scalene', angleType: 'Right' });
  });

  it('the validated domain always yields a usable complete result', () => {
    for (const c of [vals(), vals({ a: '5', b: '5', c: '5' }), vals({ a: '5', b: '5', c: '9' }), vals({ a: '1', b: '1', c: '1.999' })]) {
      expect(isTriangleResultUsable(computeTriangle(c))).toBe(true);
    }
  });

  it('the returned angles sum to ~180 for representative triangles', () => {
    for (const c of [vals(), vals({ a: '5', b: '5', c: '6' }), vals({ a: '6', b: '7', c: '8' })]) {
      const r = computeTriangle(c);
      expect(Math.abs(r.angleA + r.angleB + r.angleC - 180)).toBeLessThanOrEqual(0.05);
    }
  });

  it('classifications only ever take the documented enum values', () => {
    for (const c of [vals(), vals({ a: '5', b: '5', c: '5' }), vals({ a: '5', b: '5', c: '9' })]) {
      const r = computeTriangle(c);
      expect(['Equilateral', 'Isosceles', 'Scalene']).toContain(r.sideType);
      expect(['Acute', 'Right', 'Obtuse']).toContain(r.angleType);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Result guard                                                        */
/* ------------------------------------------------------------------ */

describe('triangle-form — resultValue guard', () => {
  it('returns the dominant area for a complete triangle', () => {
    expect(triangleBinding.resultValue(result({ area: 6 }))).toBe(6);
  });

  it('returns a NON-FINITE sentinel for a malformed / incomplete result → default gate rejects it', () => {
    expect(Number.isNaN(triangleBinding.resultValue(result({ valid: false })))).toBe(true);
    expect(Number.isNaN(triangleBinding.resultValue(result({ area: NaN })))).toBe(true);
    expect(Number.isNaN(triangleBinding.resultValue(result({ perimeter: NaN })))).toBe(true);
    expect(Number.isNaN(triangleBinding.resultValue(result({ angleC: NaN })))).toBe(true);
    expect(Number.isNaN(triangleBinding.resultValue(result({ angleC: 200 })))).toBe(true); // >= 180
    expect(Number.isNaN(triangleBinding.resultValue(result({ angleA: 10, angleB: 10, angleC: 10 })))).toBe(true); // sum ≠ 180
  });

  it('rejects the frozen valid:true all-NaN result a non-finite side would produce', () => {
    const nanResult = solveTriangleSSS(NaN, 4, 5); // valid:true, all-NaN geometry (frozen quirk)
    expect(nanResult.valid).toBe(true);
    expect(Number.isNaN(triangleBinding.resultValue(nanResult))).toBe(true);
  });

  it('does not implement isUsableResult (the guard lives in resultValue)', () => {
    expect(triangleBinding.isUsableResult).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('triangle-form — interpretation + announcement', () => {
  it('right scalene interpretation states the area', () => {
    expect(interpretTriangle(result())).toBe('This is a right scalene triangle with an area of 6 square units.');
  });

  it('acute equilateral interpretation notes equal angles (never invented)', () => {
    expect(interpretTriangle(result({ sideType: 'Equilateral', angleType: 'Acute', area: 10.825 }))).toBe(
      'This is an acute equilateral triangle. All three angles are equal.',
    );
  });

  it('obtuse isosceles interpretation notes two equal sides', () => {
    expect(interpretTriangle(result({ sideType: 'Isosceles', angleType: 'Obtuse', area: 9.808 }))).toBe(
      'This is an obtuse isosceles triangle with two equal sides.',
    );
  });

  it('announcement is the dominant area + classification only', () => {
    expect(describeTriangleResult(result())).toBe('The triangle area is 6 square units. It is a right scalene triangle.');
  });
});

/* ------------------------------------------------------------------ */
/* readValues + resetValues                                            */
/* ------------------------------------------------------------------ */

describe('triangle-form — readValues / resetValues', () => {
  it('reads the three side inputs', () => {
    expect(triangleBinding.readValues(stubRoot({ a: '3', b: '4', c: '5' }))).toEqual({ a: '3', b: '4', c: '5' });
  });

  it('reset clears all three sides', () => {
    const root = stubRoot({ a: '3', b: '4', c: '5' });
    triangleBinding.resetValues(root, 'personal');
    expect(triangleBinding.readValues(root)).toEqual({ a: '', b: '', c: '' });
  });
});
