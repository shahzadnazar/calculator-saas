import { describe, it, expect } from 'vitest';
import {
  MSG,
  DEFAULT_ANGLE_UNIT,
  EMPTY_VALUES,
  parseSide,
  parseAngle,
  readInput,
  validateTriangle,
  computeTriangle,
  completeTriangleValue,
  presentSolution,
  presentTriangle,
  describeTriangle,
  triangleBinding,
  TRIANGLE_EXAMPLE_VALUES,
  type TriangleValues,
} from './triangle-form';
import { solveTriangle, toRadians } from './triangle';

/**
 * The form layer over the solver.
 *
 * The parsing tests carry most of the weight here: this is the only calculator on the site that
 * accepts an expression rather than a plain number, and "pi/2" must be read without ever evaluating
 * a visitor's string.
 */

const vals = (over: Partial<TriangleValues> = {}): TriangleValues => ({ ...EMPTY_VALUES, ...over });
const fieldErrors = (r: ReturnType<typeof validateTriangle>) =>
  (r as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
const formError = (r: ReturnType<typeof validateTriangle>) => (r as { formError?: string }).formError;

describe('parsing a side', () => {
  it('takes a positive number and tells empty from junk', () => {
    expect(parseSide('5')).toBe(5);
    expect(parseSide('0.5')).toBe(0.5);
    expect(parseSide('.5')).toBe(0.5);
    expect(parseSide('')).toBe('empty');
    expect(parseSide('   ')).toBe('empty');
    expect(parseSide('abc')).toBe('invalid');
    expect(parseSide('0')).toBe('invalid');
    expect(parseSide('-3')).toBe('invalid');
    expect(parseSide('1e5')).toBe('invalid');
  });
});

describe('parsing an angle', () => {
  it('reads degrees', () => {
    expect(parseAngle('60', 'deg')).toBeCloseTo(Math.PI / 3, 12);
    expect(parseAngle('90', 'deg')).toBeCloseTo(Math.PI / 2, 12);
    expect(parseAngle('', 'deg')).toBe('empty');
  });

  it('rejects a degree angle outside a triangle', () => {
    expect(parseAngle('0', 'deg')).toBe('invalid');
    expect(parseAngle('180', 'deg')).toBe('invalid');
    expect(parseAngle('200', 'deg')).toBe('invalid');
    expect(parseAngle('-30', 'deg')).toBe('invalid');
  });

  it('reads a plain radian value', () => {
    expect(parseAngle('1.5', 'rad')).toBe(1.5);
    expect(parseAngle('3', 'rad')).toBe(3);
  });

  it('reads pi expressions, as the reference invites', () => {
    expect(parseAngle('pi/2', 'rad')).toBeCloseTo(Math.PI / 2, 12);
    expect(parseAngle('pi/4', 'rad')).toBeCloseTo(Math.PI / 4, 12);
    expect(parseAngle('2pi/3', 'rad')).toBeCloseTo((2 * Math.PI) / 3, 12);
    expect(parseAngle('PI/6', 'rad')).toBeCloseTo(Math.PI / 6, 12);
    expect(parseAngle('π/3', 'rad')).toBeCloseTo(Math.PI / 3, 12);
    expect(parseAngle(' pi / 2 ', 'rad')).toBeCloseTo(Math.PI / 2, 12);
  });

  it('rejects a pi expression that is not a triangle angle', () => {
    // pi itself is a straight line, not an angle in a triangle.
    expect(parseAngle('pi', 'rad')).toBe('invalid');
    expect(parseAngle('2pi', 'rad')).toBe('invalid');
    expect(parseAngle('pi/0', 'rad')).toBe('invalid');
  });

  it('never evaluates a visitor string', () => {
    // Anything that is not a plain number or a pi fraction is refused outright.
    for (const hostile of ['1+1', 'alert(1)', '2*pi/3', 'Math.PI', '1;2', '(1)']) {
      expect(parseAngle(hostile, 'rad')).toBe('invalid');
    }
  });

  it('reads a degree entry as degrees even if it looks like pi', () => {
    expect(parseAngle('pi/2', 'deg')).toBe('invalid');
  });
});

describe('validation', () => {
  it('accepts the reference example', () => {
    expect(validateTriangle(TRIANGLE_EXAMPLE_VALUES).ok).toBe(true);
  });

  it('asks for exactly three values', () => {
    expect(formError(validateTriangle(vals({ a: '3', b: '4' })))).toBe(
      MSG.needThree.replace('{n}', '2'),
    );
    expect(formError(validateTriangle(vals({ a: '3', b: '4', c: '5', angleA: '60' })))).toBe(
      MSG.needThree.replace('{n}', '4'),
    );
    expect(formError(validateTriangle(EMPTY_VALUES))).toBe(MSG.needThree.replace('{n}', '0'));
  });

  it('asks for at least one side', () => {
    expect(formError(validateTriangle(vals({ angleA: '60', angleB: '60', angleC: '60' })))).toBe(
      MSG.needASide,
    );
  });

  it('reports a bad field before counting the three', () => {
    const r = validateTriangle(vals({ a: 'abc', b: '4', c: '5' }));
    expect(fieldErrors(r).a).toBe(MSG.sideInvalid);
    expect(formError(r)).toBeUndefined();
  });

  it('uses the right angle message for the chosen unit', () => {
    expect(fieldErrors(validateTriangle(vals({ angleA: '200', a: '3', b: '4' }))).angleA).toBe(
      MSG.angleInvalidDeg,
    );
    expect(
      fieldErrors(validateTriangle(vals({ angleA: 'nope', a: '3', b: '4', angleUnit: 'rad' })))
        .angleA,
    ).toBe(MSG.angleInvalidRad);
  });

  it('refuses angles that cannot fit', () => {
    expect(formError(validateTriangle(vals({ a: '5', angleA: '120', angleB: '70' })))).toBe(
      MSG.anglesTooBig,
    );
  });

  it('refuses three sides that cannot meet', () => {
    expect(formError(validateTriangle(vals({ a: '1', b: '2', c: '10' })))).toBe(
      MSG.noSuchTriangle,
    );
    expect(formError(validateTriangle(vals({ a: '1', b: '2', c: '3' })))).toBe(
      MSG.noSuchTriangle,
    );
  });

  it('refuses two sides and an angle that reach nothing', () => {
    expect(formError(validateTriangle(vals({ a: '2', b: '8', angleA: '30' })))).toBe(
      MSG.noSuchTriangle,
    );
  });
});

describe('the reference example, end to end', () => {
  const r = computeTriangle(TRIANGLE_EXAMPLE_VALUES);
  const p = presentTriangle(r);
  const s = p.solutions[0];

  it('solves one triangle by SAS', () => {
    expect(r.method).toBe('SAS');
    expect(p.solutions).toHaveLength(1);
    expect(p.ambiguous).toBe(false);
  });

  it('prints every line the reference prints', () => {
    expect(s.kind).toBe('Equilateral Triangle');
    expect(s.sides.map((x) => `${x.label} = ${x.value}`)).toEqual([
      'Side a = 1',
      'Side b = 1',
      'Side c = 1',
    ]);
    expect(s.angles.map((x) => `${x.label} = ${x.degrees} = ${x.radians} = ${x.pi}`)).toEqual([
      'Angle ∠A = 60° = 1.0472 rad = π/3',
      'Angle ∠B = 60° = 1.0472 rad = π/3',
      'Angle ∠C = 60° = 1.0472 rad = π/3',
    ]);
    expect(s.area).toBe('0.43301');
    expect(s.perimeter).toBe('3');
    expect(s.semiperimeter).toBe('1.5');
    expect(s.heights.map((x) => x.value)).toEqual(['0.86603', '0.86603', '0.86603']);
    expect(s.medians.map((x) => x.value)).toEqual(['0.86603', '0.86603', '0.86603']);
    expect(s.inradius).toBe('0.28868');
    expect(s.circumradius).toBe('0.57735');
    expect(s.vertices).toBe('A[0, 0] B[1, 0] C[0.5, 0.86603]');
    expect(s.centroid).toBe('[0.5, 0.28868]');
    expect(s.incenter).toBe('[0.5, 0.28868]');
    expect(s.circumcenter).toBe('[0.5, 0.28868]');
  });

  it('labels the heights and medians the way the reference does', () => {
    expect(s.heights.map((x) => x.label)).toEqual(['Height ha', 'Height hb', 'Height hc']);
    expect(s.medians.map((x) => x.label)).toEqual(['Median ma', 'Median mb', 'Median mc']);
  });
});

describe('the ambiguous case reaches the form', () => {
  const ambiguous = vals({ a: '5', b: '8', angleA: '30' });

  it('accepts it and presents two solutions', () => {
    expect(validateTriangle(ambiguous).ok).toBe(true);
    const p = presentTriangle(computeTriangle(ambiguous));
    expect(p.ambiguous).toBe(true);
    expect(p.solutions).toHaveLength(2);
    // Both happen to be obtuse scalene here — sin B = 0.8 gives B = 53.13° (so C = 96.87°) or
    // B = 126.87° — so what must differ is the triangle, not its name.
    expect(p.solutions[0].sides[2].value).not.toBe(p.solutions[1].sides[2].value);
    expect(p.solutions[0].area).not.toBe(p.solutions[1].area);
  });

  it('announces both', () => {
    expect(describeTriangle(computeTriangle(ambiguous))).toContain('Two possible triangles');
  });

  it('guards both, not just the first', () => {
    const r = computeTriangle(ambiguous);
    expect(Number.isFinite(completeTriangleValue(r))).toBe(true);
    const tampered = {
      ...r,
      triangles: [r.triangles[0], { ...r.triangles[1], sides: [1, 1, 1] as [number, number, number] }],
    };
    expect(completeTriangleValue(tampered)).toBeNaN();
  });
});

describe('the complete-result guard', () => {
  const good = () => computeTriangle(vals({ a: '3', b: '4', c: '5' }));

  it('passes a result that reconciles with a re-solve', () => {
    expect(completeTriangleValue(good())).toBeCloseTo(6, 9);
  });

  it('refuses a result whose values no longer produce it', () => {
    expect(completeTriangleValue({ ...good(), values: vals({ a: '3', b: '4', c: '6' }) })).toBeNaN();
  });

  it('refuses a tampered side or angle', () => {
    const r = good();
    expect(
      completeTriangleValue({
        ...r,
        triangles: [{ ...r.triangles[0], sides: [3, 4, 9] as [number, number, number] }],
      }),
    ).toBeNaN();
    expect(
      completeTriangleValue({
        ...r,
        triangles: [{ ...r.triangles[0], angles: [1, 1, 1] as [number, number, number] }],
      }),
    ).toBeNaN();
  });

  it('refuses an unsolved or failed input', () => {
    expect(completeTriangleValue(computeTriangle(vals({ a: '3', b: '4' })))).toBeNaN();
    expect(completeTriangleValue(computeTriangle(vals({ a: '1', b: '2', c: '10' })))).toBeNaN();
    expect(completeTriangleValue(computeTriangle(EMPTY_VALUES))).toBeNaN();
  });
});

describe('presentation', () => {
  it('never renders NaN, Infinity or undefined', () => {
    for (const v of [EMPTY_VALUES, vals({ a: '3', b: '4' }), vals({ a: '1', b: '2', c: '10' })]) {
      const p = presentTriangle(computeTriangle(v));
      const printed = [p.a11y, ...p.solutions.flatMap((s) => [
        s.kind, s.area, s.perimeter, s.semiperimeter, s.inradius, s.circumradius,
        s.vertices, s.centroid, s.incenter, s.circumcenter,
        ...s.sides.map((x) => x.value), ...s.heights.map((x) => x.value),
        ...s.medians.map((x) => x.value), ...s.angles.map((x) => `${x.degrees}${x.radians}${x.pi}`),
      ])];
      for (const text of printed) expect(text).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('omits the pi form when an angle is not a neat fraction', () => {
    const p = presentTriangle(computeTriangle(vals({ a: '4', b: '5', c: '6' })));
    expect(p.solutions[0].angles.every((x) => x.pi === '')).toBe(true);
  });

  it('gives three corners for drawing, with A at the origin', () => {
    const s = presentSolution(solveTriangle(readInput(vals({ a: '3', b: '4', c: '5' })).input).triangles[0]);
    expect(s.points).toHaveLength(3);
    expect(s.points[0]).toEqual([0, 0]);
  });
});

describe('the binding', () => {
  it('computes, guards and describes the example', () => {
    const computed = triangleBinding.compute(TRIANGLE_EXAMPLE_VALUES);
    expect(triangleBinding.validate(TRIANGLE_EXAMPLE_VALUES).ok).toBe(true);
    expect(Number.isFinite(triangleBinding.resultValue(computed))).toBe(true);
    expect(triangleBinding.describeResult(computed, { phase: 'first-result' })).toContain(
      'Equilateral',
    );
  });

  it('starts from the empty form with degrees selected', () => {
    expect(EMPTY_VALUES.angleUnit).toBe(DEFAULT_ANGLE_UNIT);
    for (const name of ['a', 'b', 'c', 'angleA', 'angleB', 'angleC'] as const) {
      expect(EMPTY_VALUES[name]).toBe('');
    }
  });

  it('reads the same input whichever unit spells the angle', () => {
    const deg = readInput(vals({ a: '1', b: '1', angleC: '60' })).input;
    const rad = readInput(vals({ a: '1', b: '1', angleC: 'pi/3', angleUnit: 'rad' })).input;
    expect(rad.angles[2]!).toBeCloseTo(deg.angles[2]!, 12);
    expect(toRadians(60)).toBeCloseTo(rad.angles[2]!, 12);
  });
});
