import { describe, it, expect } from 'vitest';
import {
  AREA_SHAPES,
  MSG,
  DEFAULT_UNIT,
  areaShapeByKey,
  resultUnit,
  convertDims,
  validateArea,
  computeArea,
  completeAreaValue,
  presentArea,
  describeArea,
  makeAreaBinding,
  areaExampleValues,
  AREA_EXAMPLE_VALUES,
  areaBinding,
  type AreaShapeSpec,
  type AreaValues,
} from './area-form';
import { formatArea } from './area';
import { squaredUnitToSqFt, fromSqFt } from './area-units';

/**
 * The form layer over the seven shapes.
 *
 * One binding serves all seven, so the sweeps that run over EVERY spec matter more than any single
 * favourite case: a regression in the shared layer would otherwise be caught for rectangles and
 * missed for the other six.
 */

const rect = areaShapeByKey('rectangle');

/** Values for a spec, its dimensions given in order. */
const vals = (spec: AreaShapeSpec, numbers: (string | number)[], over: Partial<AreaValues> = {}): AreaValues => {
  const dims: Record<string, string> = {};
  const units: Record<string, string> = {};
  spec.fields.forEach((f, i) => {
    dims[f.name] = String(numbers[i] ?? '');
    units[f.name] = f.kind === 'angle' ? 'deg' : DEFAULT_UNIT;
  });
  return {
    dims: { ...dims, ...(over.dims ?? {}) },
    units: { ...units, ...(over.units ?? {}) },
  };
};

const fieldErrors = (r: ReturnType<typeof validateArea>) =>
  (r as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
const formError = (r: ReturnType<typeof validateArea>) => (r as { formError?: string }).formError;

describe('the specs', () => {
  it('offers the seven shapes the reference has, in its order', () => {
    expect(AREA_SHAPES.map((s) => s.key)).toEqual([
      'rectangle',
      'triangle',
      'trapezoid',
      'circle',
      'sector',
      'ellipse',
      'parallelogram',
    ]);
  });

  it('labels the fields as the reference labels them', () => {
    expect(rect.fields.map((f) => f.label)).toEqual(['Length (l)', 'Width (w)']);
    expect(areaShapeByKey('triangle').fields.map((f) => f.label)).toEqual([
      'Edge 1 (a)',
      'Edge 2 (b)',
      'Edge 3 (c)',
    ]);
    expect(areaShapeByKey('trapezoid').fields.map((f) => f.label)).toEqual([
      'Base 1 (b₁)',
      'Base 2 (b₂)',
      'Height (h)',
    ]);
    expect(areaShapeByKey('circle').fields.map((f) => f.label)).toEqual(['Radius (r)']);
    expect(areaShapeByKey('sector').fields.map((f) => f.label)).toEqual(['Radius (r)', 'Angle (A)']);
    expect(areaShapeByKey('ellipse').fields.map((f) => f.label)).toEqual([
      'Semi-major Axes (a)',
      'Semi-minor Axes (b)',
    ]);
    expect(areaShapeByKey('parallelogram').fields.map((f) => f.label)).toEqual([
      'Base (b)',
      'Height (h)',
    ]);
  });

  it('gives every shape a title, a lede and at least one field', () => {
    for (const s of AREA_SHAPES) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.lede.length).toBeGreaterThan(0);
      expect(s.fields.length).toBeGreaterThan(0);
    }
  });

  it('keeps every field name unique within its own shape', () => {
    for (const s of AREA_SHAPES) {
      const names = s.fields.map((f) => f.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('uses an angle only where the shape needs one, and never as the first field', () => {
    const withAngle = AREA_SHAPES.filter((s) => s.fields.some((f) => f.kind === 'angle'));
    expect(withAngle.map((s) => s.key)).toEqual(['sector']);
    for (const s of AREA_SHAPES) expect(s.fields[0].kind).toBe('length');
  });

  it('points the triangle at the triangle calculator, as the reference does', () => {
    expect(areaShapeByKey('triangle').note?.href).toBe('/math/triangle-calculator');
  });
});

describe('validation', () => {
  it('asks for a value before complaining about it', () => {
    const r = validateArea(rect, vals(rect, ['', '']));
    expect(fieldErrors(r).d1).toBe(MSG.required);
    expect(fieldErrors(r).d2).toBe(MSG.required);
  });

  it('rejects zero, a negative and junk', () => {
    expect(fieldErrors(validateArea(rect, vals(rect, ['0', '10']))).d1).toBe(MSG.invalid);
    expect(fieldErrors(validateArea(rect, vals(rect, ['-3', '10']))).d1).toBe(MSG.invalid);
    expect(fieldErrors(validateArea(rect, vals(rect, ['abc', '10']))).d1).toBe(MSG.invalid);
    expect(fieldErrors(validateArea(rect, vals(rect, ['1e5', '10']))).d1).toBe(MSG.invalid);
  });

  it('accepts a bare decimal and a sound rectangle', () => {
    expect(validateArea(rect, vals(rect, ['.5', '10'])).ok).toBe(true);
    expect(validateArea(rect, vals(rect, ['30', '20'])).ok).toBe(true);
  });

  it('judges a cross-field impossibility only once every field is sound', () => {
    const tri = areaShapeByKey('triangle');
    const blank = validateArea(tri, vals(tri, ['10', '10', '']));
    expect(fieldErrors(blank).d3).toBe(MSG.required);
    expect(formError(blank)).toBeUndefined();
  });

  it('rejects three edges that cannot meet', () => {
    const tri = areaShapeByKey('triangle');
    expect(formError(validateArea(tri, vals(tri, ['1', '2', '10'])))).toBe(MSG.triangleImpossible);
    expect(formError(validateArea(tri, vals(tri, ['1', '2', '3'])))).toBe(MSG.triangleImpossible);
    expect(validateArea(tri, vals(tri, ['3', '4', '5'])).ok).toBe(true);
  });

  it('judges the triangle inequality AFTER converting, not on the raw numbers', () => {
    const tri = areaShapeByKey('triangle');
    // 1 m, 2 m, 250 cm is 1, 2, 2.5 m — a good triangle.
    expect(validateArea(tri, vals(tri, ['1', '2', '250'], { units: { d3: 'cm' } })).ok).toBe(true);
    // The same numbers all in metres cannot meet.
    expect(formError(validateArea(tri, vals(tri, ['1', '2', '250'])))).toBe(MSG.triangleImpossible);
  });

  it('rejects an angle past a full turn', () => {
    const sector = areaShapeByKey('sector');
    expect(formError(validateArea(sector, vals(sector, ['10', '361'])))).toBe(MSG.angleRange);
    expect(validateArea(sector, vals(sector, ['10', '360'])).ok).toBe(true);
    expect(validateArea(sector, vals(sector, ['10', '90'])).ok).toBe(true);
  });

  it('rejects a radian angle past a full turn', () => {
    const sector = areaShapeByKey('sector');
    const over = vals(sector, ['10', '7'], { units: { d2: 'rad' } });
    expect(formError(validateArea(sector, over))).toBe(MSG.angleRange);
    const ok = vals(sector, ['10', '6'], { units: { d2: 'rad' } });
    expect(validateArea(sector, ok).ok).toBe(true);
  });
});

describe('units and computation', () => {
  it('reports in the FIRST field unit, squared', () => {
    expect(resultUnit(rect, vals(rect, ['1', '1']))).toBe('m');
    expect(resultUnit(rect, vals(rect, ['1', '1'], { units: { d1: 'ft' } }))).toBe('ft');
    // The second field's unit does not decide the answer's unit.
    expect(resultUnit(rect, vals(rect, ['1', '1'], { units: { d2: 'in' } }))).toBe('m');
  });

  it('falls back to the default for an unknown unit', () => {
    expect(resultUnit(rect, vals(rect, ['1', '1'], { units: { d1: 'furlong' } }))).toBe(DEFAULT_UNIT);
  });

  it('converts each measurement into the answer unit', () => {
    // 1 m by 50 cm is 1 m by 0.5 m = 0.5 m².
    const mixed = vals(rect, ['1', '50'], { units: { d2: 'cm' } });
    const [a, b] = convertDims(rect, mixed);
    expect(a).toBe(1);
    expect(b).toBeCloseTo(0.5, 12);
    expect(computeArea(rect, mixed).area).toBeCloseTo(0.5, 12);
    expect(computeArea(rect, mixed).unit).toBe('m');
  });

  it('brings a radian angle to degrees, since the formula is stated in degrees', () => {
    const sector = areaShapeByKey('sector');
    const [, deg] = convertDims(sector, vals(sector, ['10', String(Math.PI / 2)], { units: { d2: 'rad' } }));
    expect(deg).toBeCloseTo(90, 10);
  });

  it('leaves the angle out of the unit conversion entirely', () => {
    const sector = areaShapeByKey('sector');
    // Changing the RADIUS unit must not touch the angle.
    const inFeet = vals(sector, ['30', '90'], { units: { d1: 'ft' } });
    expect(convertDims(sector, inFeet)[1]).toBe(90);
    expect(computeArea(sector, inFeet).unit).toBe('ft');
  });

  it('yields NaN rather than a number from an unusable entry', () => {
    expect(computeArea(rect, vals(rect, ['', '20'])).area).toBeNaN();
    expect(computeArea(rect, vals(rect, ['abc', '20'])).area).toBeNaN();
  });
});

describe('the complete-result guard', () => {
  const good = () => computeArea(rect, vals(rect, ['30', '20']));

  it('passes a result that reconciles with a recompute', () => {
    expect(completeAreaValue(rect, good())).toBe(600);
  });

  it('refuses a result belonging to another shape', () => {
    expect(completeAreaValue(areaShapeByKey('circle'), good())).toBeNaN();
  });

  it('refuses a tampered area or unit', () => {
    expect(completeAreaValue(rect, { ...good(), area: 999 })).toBeNaN();
    expect(completeAreaValue(rect, { ...good(), unit: 'ft' })).toBeNaN();
  });

  it('refuses a result whose values no longer produce it', () => {
    expect(completeAreaValue(rect, { ...good(), values: vals(rect, ['30', '21']) })).toBeNaN();
  });

  it('refuses a cross-field impossibility that slipped through', () => {
    const tri = areaShapeByKey('triangle');
    expect(completeAreaValue(tri, computeArea(tri, vals(tri, ['1', '2', '10'])))).toBeNaN();
  });

  it('refuses an incomplete entry', () => {
    expect(completeAreaValue(rect, computeArea(rect, vals(rect, ['', '20'])))).toBeNaN();
    expect(completeAreaValue(rect, computeArea(rect, vals(rect, ['30', '0'])))).toBeNaN();
  });
});

describe('presentation', () => {
  it('prints the answer and the unit it is in', () => {
    const p = presentArea(rect, computeArea(rect, vals(rect, ['30', '20'])));
    expect(p.answer).toBe('600');
    expect(p.answerUnit).toBe('meters²');
    expect(p.a11y).toBe('600 square meters');
  });

  it('carries the working, ending on the answer', () => {
    const p = presentArea(rect, computeArea(rect, vals(rect, ['30', '20'])));
    expect(p.steps[0]).toMatchObject({ label: 'Area', expression: 'l × w' });
    expect(p.steps[p.steps.length - 1]).toMatchObject({ expression: '600', unit: 'meters²', final: true });
  });

  it('says nothing about mixed units when every unit matches', () => {
    expect(presentArea(rect, computeArea(rect, vals(rect, ['30', '20']))).mixedUnits).toBe(false);
  });

  it('flags mixed units so the answer unit is not a surprise', () => {
    const mixed = vals(rect, ['1', '50'], { units: { d2: 'cm' } });
    expect(presentArea(rect, computeArea(rect, mixed)).mixedUnits).toBe(true);
  });

  it('does not call a sector mixed just because it has an angle', () => {
    const sector = areaShapeByKey('sector');
    expect(presentArea(sector, computeArea(sector, vals(sector, ['30', '90']))).mixedUnits).toBe(false);
  });

  it('offers all five area units, converted from the answer', () => {
    const c = computeArea(rect, vals(rect, ['30', '20'], { units: { d1: 'ft', d2: 'ft' } }));
    const p = presentArea(rect, c);
    expect(p.others.map((o) => o.key)).toEqual(['sqft', 'sqin', 'sqyd', 'sqm', 'acre']);
    expect(p.others.find((o) => o.key === 'sqft')!.value).toBe('600');
    expect(p.others.find((o) => o.key === 'sqyd')!.value).toBe(formatArea(600 / 9));
  });

  it('never renders NaN, Infinity or undefined', () => {
    const p = presentArea(rect, computeArea(rect, vals(rect, ['', ''])));
    const printed = [p.answer, p.answerUnit, p.a11y, ...p.others.map((o) => o.value), ...p.steps.map((s) => s.expression)];
    for (const s of printed) {
      expect(typeof s).toBe('string');
      expect(s).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('describes the result in one sentence', () => {
    expect(describeArea(rect, computeArea(rect, vals(rect, ['30', '20'])))).toBe(
      'Rectangle area: 600 square meters.',
    );
  });
});

describe('the shared binding, over every shape', () => {
  it('computes, guards and describes each shape from its own example', () => {
    for (const spec of AREA_SHAPES) {
      const binding = makeAreaBinding(spec);
      const values = areaExampleValues(spec);
      expect(binding.validate(values).ok).toBe(true);
      const computed = binding.compute(values);
      const value = binding.resultValue(computed);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
      expect(binding.describeResult(computed, { phase: 'first-result' })).toContain(spec.title);
    }
  });

  it('rejects an all-empty form for every shape', () => {
    for (const spec of AREA_SHAPES) {
      const empty = vals(spec, spec.fields.map(() => ''));
      const r = validateArea(spec, empty);
      expect(r.ok).toBe(false);
      for (const f of spec.fields) expect(fieldErrors(r)[f.name]).toBe(MSG.required);
    }
  });

  it('agrees with an independent recompute for every shape and unit', () => {
    for (const spec of AREA_SHAPES) {
      for (const unit of ['m', 'cm', 'in', 'ft', 'yd']) {
        const units: Record<string, string> = {};
        spec.fields.forEach((f) => (units[f.name] = f.kind === 'angle' ? 'deg' : unit));
        const values = { ...areaExampleValues(spec), units };
        if (!validateArea(spec, values).ok) continue;
        const c = computeArea(spec, values);
        expect(c.unit).toBe(unit);
        expect(c.area).toBe(spec.area(convertDims(spec, values)));
        expect(completeAreaValue(spec, c)).toBe(c.area);
      }
    }
  });

  it('gives the SAME physical area whatever unit it was measured in', () => {
    for (const spec of AREA_SHAPES) {
      const inSqFt = ['m', 'cm', 'in', 'ft', 'yd'].map((unit) => {
        const units: Record<string, string> = {};
        spec.fields.forEach((f) => (units[f.name] = f.kind === 'angle' ? 'deg' : unit));
        // One metre's worth of every dimension, expressed in each unit.
        const dims: Record<string, string> = {};
        spec.fields.forEach((f, i) => {
          const metres = [2, 3, 4][i % 3];
          dims[f.name] =
            f.kind === 'angle'
              ? '90'
              : String(metres / { m: 1, cm: 0.01, in: 0.0254, ft: 0.3048, yd: 0.9144 }[unit as 'm']);
        });
        const c = computeArea(spec, { dims, units });
        return squaredUnitToSqFt(c.area, c.unit);
      });
      for (const v of inSqFt) expect(v).toBeCloseTo(inSqFt[0], 6);
    }
  });

  it('converts every shape into every area unit consistently', () => {
    for (const spec of AREA_SHAPES) {
      const c = computeArea(spec, areaExampleValues(spec));
      const sqft = squaredUnitToSqFt(c.area, c.unit);
      for (const row of presentArea(spec, c).others) {
        expect(row.value).toBe(formatArea(fromSqFt(sqft, row.key as 'sqft')));
        expect(row.value).not.toMatch(/NaN|Infinity|—/);
      }
    }
  });
});

describe('example values', () => {
  it('gives every shape a sound, positive example in the default unit', () => {
    for (const spec of AREA_SHAPES) {
      const v = areaExampleValues(spec);
      expect(validateArea(spec, v).ok).toBe(true);
      for (const f of spec.fields) {
        expect(v.dims[f.name]).not.toBe('');
        expect(v.units[f.name]).toBe(f.kind === 'angle' ? 'deg' : DEFAULT_UNIT);
      }
    }
  });

  it('reproduces the reference figures from the example values', () => {
    const expected: Record<string, string> = {
      rectangle: '600',
      triangle: '666.58528149067',
      trapezoid: '750',
      circle: '2827.4333882308',
      sector: '706.8583470577',
      ellipse: '1884.9555921539',
      parallelogram: '600',
    };
    for (const spec of AREA_SHAPES) {
      const p = presentArea(spec, computeArea(spec, areaExampleValues(spec)));
      expect(p.answer).toBe(expected[spec.key]);
      expect(p.answerUnit).toBe('meters²');
    }
  });

  it('exports the rectangle example for the fleet-wide check', () => {
    expect(AREA_EXAMPLE_VALUES).toEqual(areaExampleValues(AREA_SHAPES[0]));
    expect(Number.isFinite(areaBinding.resultValue(areaBinding.compute(AREA_EXAMPLE_VALUES)))).toBe(true);
  });
});
