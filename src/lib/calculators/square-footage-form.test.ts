import { describe, it, expect } from 'vitest';
import {
  SHAPES,
  MSG,
  shapeByKey,
  convertDims,
  validateShape,
  computeShape,
  completeShapeValue,
  presentShape,
  describeShape,
  makeShapeBinding,
  shapeExampleValues,
  SQUARE_FOOTAGE_EXAMPLE_VALUES,
  squareFootageBinding,
  type ShapeSpec,
  type ShapeValues,
} from './square-footage-form';
import { formatExactArea, fromSqFt } from './square-footage';

/**
 * The form layer over the nine shapes.
 *
 * One binding serves all nine, so the tests that matter most are the ones that run over EVERY spec
 * rather than over a favourite one: if the shared binding only works for rectangles, the sweeps
 * below are what says so.
 */

const rect = shapeByKey('rectangle');

/** Values for a spec, its dimensions given in order. */
const vals = (spec: ShapeSpec, numbers: (string | number)[], over: Partial<ShapeValues> = {}): ShapeValues => {
  const dims: Record<string, string> = {};
  const units: Record<string, string> = {};
  spec.fields.forEach((f, i) => {
    dims[f.name] = String(numbers[i] ?? '');
    units[f.name] = f.kind === 'angle' ? 'deg' : 'ft';
  });
  return {
    ...{ quantity: '1', price: '', priceUnit: 'sqft' },
    ...over,
    dims: { ...dims, ...(over.dims ?? {}) },
    units: { ...units, ...(over.units ?? {}) },
  };
};

const fieldErrors = (r: ReturnType<typeof validateShape>) =>
  (r as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
const formError = (r: ReturnType<typeof validateShape>) => (r as { formError?: string }).formError;

describe('the specs', () => {
  it('offers the nine shapes the reference has, in its order', () => {
    expect(SHAPES.map((s) => s.key)).toEqual([
      'rectangle',
      'rectangle-border',
      'circle',
      'ring',
      'triangle-edges',
      'triangle-base',
      'trapezoid',
      'sector',
      'parallelogram',
    ]);
  });

  it('gives every shape a title, a lede and at least one field', () => {
    for (const s of SHAPES) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.lede.length).toBeGreaterThan(0);
      expect(s.fields.length).toBeGreaterThan(0);
    }
  });

  it('keeps every field name unique within its own shape', () => {
    for (const s of SHAPES) {
      const names = s.fields.map((f) => f.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('never names a dimension field after a shared control', () => {
    for (const s of SHAPES) {
      for (const f of s.fields) {
        expect(['quantity', 'price', 'priceUnit']).not.toContain(f.name);
      }
    }
  });

  it('uses an angle only where the shape needs one', () => {
    const withAngle = SHAPES.filter((s) => s.fields.some((f) => f.kind === 'angle'));
    expect(withAngle.map((s) => s.key)).toEqual(['sector']);
  });
});

describe('validation', () => {
  it('asks for a value before complaining about it', () => {
    const r = validateShape(rect, vals(rect, ['', '']));
    expect(fieldErrors(r).d1).toBe(MSG.required);
    expect(fieldErrors(r).d2).toBe(MSG.required);
  });

  it('rejects zero, a negative and junk', () => {
    expect(fieldErrors(validateShape(rect, vals(rect, ['0', '10']))).d1).toBe(MSG.invalid);
    expect(fieldErrors(validateShape(rect, vals(rect, ['-3', '10']))).d1).toBe(MSG.invalid);
    expect(fieldErrors(validateShape(rect, vals(rect, ['abc', '10']))).d1).toBe(MSG.invalid);
    expect(fieldErrors(validateShape(rect, vals(rect, ['1e5', '10']))).d1).toBe(MSG.invalid);
  });

  it('accepts a bare decimal', () => {
    expect(validateShape(rect, vals(rect, ['.5', '10'])).ok).toBe(true);
  });

  it('accepts a sound rectangle', () => {
    expect(validateShape(rect, vals(rect, ['30', '20'])).ok).toBe(true);
  });

  it('takes a blank quantity as one area and a blank price as no estimate', () => {
    const r = validateShape(rect, vals(rect, ['30', '20'], { quantity: '', price: '' }));
    expect(r.ok).toBe(true);
    const c = computeShape(rect, vals(rect, ['30', '20'], { quantity: '', price: '' }));
    expect(c.quantity).toBe(1);
    expect(c.price).toBe(0);
  });

  it('rejects a fractional or zero quantity', () => {
    expect(fieldErrors(validateShape(rect, vals(rect, ['3', '4'], { quantity: '1.5' }))).quantity).toBe(MSG.quantityInvalid);
    expect(fieldErrors(validateShape(rect, vals(rect, ['3', '4'], { quantity: '0' }))).quantity).toBe(MSG.quantityInvalid);
    expect(fieldErrors(validateShape(rect, vals(rect, ['3', '4'], { quantity: '-2' }))).quantity).toBe(MSG.quantityInvalid);
  });

  it('accepts a zero price but not a negative one', () => {
    expect(validateShape(rect, vals(rect, ['3', '4'], { price: '0' })).ok).toBe(true);
    expect(fieldErrors(validateShape(rect, vals(rect, ['3', '4'], { price: '-1' }))).price).toBe(MSG.priceInvalid);
  });

  it('judges a cross-field impossibility only once every field is sound', () => {
    const border = shapeByKey('rectangle-border');
    // A blank third field is a field error, not a border complaint.
    const blank = validateShape(border, vals(border, ['10', '10', '']));
    expect(fieldErrors(blank).d3).toBe(MSG.required);
    expect(formError(blank)).toBeUndefined();
  });

  it('rejects a border that swallows the rectangle', () => {
    const border = shapeByKey('rectangle-border');
    expect(formError(validateShape(border, vals(border, ['10', '10', '5'])))).toBe(MSG.borderTooBig);
    expect(validateShape(border, vals(border, ['10', '10', '4.9'])).ok).toBe(true);
  });

  it('rejects a ring border past the centre', () => {
    const ring = shapeByKey('ring');
    expect(formError(validateShape(ring, vals(ring, ['30', '15'])))).toBe(MSG.ringTooBig);
    expect(validateShape(ring, vals(ring, ['30', '14.9'])).ok).toBe(true);
  });

  it('rejects three edges that cannot meet', () => {
    const tri = shapeByKey('triangle-edges');
    expect(formError(validateShape(tri, vals(tri, ['1', '2', '10'])))).toBe(MSG.triangleImpossible);
    expect(formError(validateShape(tri, vals(tri, ['1', '2', '3'])))).toBe(MSG.triangleImpossible);
    expect(validateShape(tri, vals(tri, ['3', '4', '5'])).ok).toBe(true);
  });

  it('rejects an angle past a full turn', () => {
    const sector = shapeByKey('sector');
    expect(formError(validateShape(sector, vals(sector, ['10', '361'])))).toBe(MSG.angleRange);
    expect(validateShape(sector, vals(sector, ['10', '360'])).ok).toBe(true);
    expect(validateShape(sector, vals(sector, ['10', '90'])).ok).toBe(true);
  });

  it('catches an impossible triangle whatever units its edges were measured in', () => {
    const tri = shapeByKey('triangle-edges');
    // 1 ft, 2 ft, 30 in: in feet that is 1, 2, 2.5 — a perfectly good triangle.
    const mixed = vals(tri, ['1', '2', '30'], { units: { d3: 'in' } });
    expect(validateShape(tri, mixed).ok).toBe(true);
    // The same numbers all in feet cannot meet.
    expect(formError(validateShape(tri, vals(tri, ['1', '2', '10'])))).toBe(MSG.triangleImpossible);
  });
});

describe('conversion and computation', () => {
  it('converts each dimension by its OWN unit', () => {
    const mixed = vals(rect, ['1', '12'], { units: { d1: 'yd', d2: 'in' } });
    const [a, b] = convertDims(rect, mixed);
    expect(a).toBeCloseTo(3, 12);
    expect(b).toBeCloseTo(1, 12);
    expect(computeShape(rect, mixed).areaSqFt).toBeCloseTo(3, 12);
  });

  it('converts an angle to radians', () => {
    const sector = shapeByKey('sector');
    const [, rad] = convertDims(sector, vals(sector, ['10', '180']));
    expect(rad).toBeCloseTo(Math.PI, 12);
  });

  it('reads a radian entry as radians', () => {
    const sector = shapeByKey('sector');
    const [, rad] = convertDims(sector, vals(sector, ['10', '2'], { units: { d2: 'rad' } }));
    expect(rad).toBe(2);
  });

  it('multiplies by the quantity', () => {
    const c = computeShape(rect, vals(rect, ['30', '20'], { quantity: '3' }));
    expect(c.areaSqFt).toBe(600);
    expect(c.totalSqFt).toBe(1800);
  });

  it('prices the total in the chosen area unit', () => {
    // 900 sq ft = 100 sq yd; at $12 a square yard that is $1,200.
    const c = computeShape(rect, vals(rect, ['30', '30'], { price: '12', priceUnit: 'sqyd' }));
    expect(c.totalSqFt).toBe(900);
    expect(c.cost).toBeCloseTo(1200, 8);
  });

  it('falls back to square feet for an unknown price unit', () => {
    const c = computeShape(rect, vals(rect, ['10', '10'], { price: '2', priceUnit: 'nonsense' }));
    expect(c.priceUnit).toBe('sqft');
    expect(c.cost).toBe(200);
  });

  it('yields NaN rather than a number from an unusable entry', () => {
    expect(computeShape(rect, vals(rect, ['', '20'])).areaSqFt).toBeNaN();
    expect(computeShape(rect, vals(rect, ['abc', '20'])).totalSqFt).toBeNaN();
  });
});

describe('the complete-result guard', () => {
  const good = () => computeShape(rect, vals(rect, ['30', '20']));

  it('passes a result that reconciles with a recompute', () => {
    expect(completeShapeValue(rect, good())).toBe(600);
  });

  it('refuses a result belonging to another shape', () => {
    expect(completeShapeValue(shapeByKey('circle'), good())).toBeNaN();
  });

  it('refuses a tampered area, total, quantity, price or cost', () => {
    expect(completeShapeValue(rect, { ...good(), areaSqFt: 999 })).toBeNaN();
    expect(completeShapeValue(rect, { ...good(), totalSqFt: 999 })).toBeNaN();
    expect(completeShapeValue(rect, { ...good(), quantity: 2 })).toBeNaN();
    expect(completeShapeValue(rect, { ...good(), price: 5 })).toBeNaN();
    expect(completeShapeValue(rect, { ...good(), cost: 5 })).toBeNaN();
  });

  it('refuses a result whose values no longer produce it', () => {
    const r = good();
    expect(completeShapeValue(rect, { ...r, values: vals(rect, ['30', '21']) })).toBeNaN();
  });

  it('refuses a cross-field impossibility that slipped through', () => {
    const tri = shapeByKey('triangle-edges');
    const r = computeShape(tri, vals(tri, ['1', '2', '10']));
    expect(completeShapeValue(tri, r)).toBeNaN();
  });

  it('refuses an incomplete entry', () => {
    expect(completeShapeValue(rect, computeShape(rect, vals(rect, ['', '20'])))).toBeNaN();
    expect(completeShapeValue(rect, computeShape(rect, vals(rect, ['30', '0'])))).toBeNaN();
  });
});

describe('presentation', () => {
  it('prints the area exactly, in square feet', () => {
    const p = presentShape(computeShape(rect, vals(rect, ['30', '20'])));
    expect(p.area).toBe('600');
    expect(p.areaUnit).toBe('Square Feet');
    expect(p.a11y).toBe('600 square feet');
  });

  it('stays silent about the quantity when there is only one area', () => {
    expect(presentShape(computeShape(rect, vals(rect, ['30', '20']))).quantityNote).toBe('');
  });

  it('says the per-area figure once there is more than one', () => {
    const p = presentShape(computeShape(rect, vals(rect, ['30', '20'], { quantity: '3' })));
    expect(p.area).toBe('1800');
    expect(p.quantityNote).toBe('600 square feet each, for 3 areas.');
  });

  it('shows a cost only when a price was given', () => {
    expect(presentShape(computeShape(rect, vals(rect, ['10', '10']))).cost).toBe('');
    const priced = presentShape(computeShape(rect, vals(rect, ['10', '10'], { price: '3.5' })));
    expect(priced.cost).toBe('$350.00');
    expect(priced.costLabel).toBe('Cost at $3.50 per square foot');
  });

  it('offers the other four area units, never square feet twice', () => {
    const p = presentShape(computeShape(rect, vals(rect, ['30', '30'])));
    expect(p.others.map((o) => o.key)).toEqual(['sqin', 'sqyd', 'sqm', 'acre']);
    expect(p.others.find((o) => o.key === 'sqyd')!.value).toBe('100');
  });

  it('never renders NaN, Infinity or undefined', () => {
    const broken = computeShape(rect, vals(rect, ['', '']));
    const p = presentShape(broken);
    const printed = [p.area, p.areaUnit, p.a11y, p.quantityNote, p.cost, p.costLabel, ...p.others.map((o) => o.value)];
    for (const s of printed) {
      expect(typeof s).toBe('string');
      expect(s).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('describes the result in one sentence', () => {
    expect(describeShape(rect, computeShape(rect, vals(rect, ['30', '20'])))).toBe(
      'Rectangle area: 600 square feet.',
    );
  });
});

describe('the shared binding, over every shape', () => {
  it('computes, guards and describes each shape from its own example', () => {
    for (const spec of SHAPES) {
      const binding = makeShapeBinding(spec);
      const values = shapeExampleValues(spec);
      expect(binding.validate(values).ok).toBe(true);
      const computed = binding.compute(values);
      const value = binding.resultValue(computed);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
      expect(binding.describeResult(computed, { phase: 'first-result' })).toContain(spec.title);
    }
  });

  it('rejects an all-empty form for every shape', () => {
    for (const spec of SHAPES) {
      const empty = vals(spec, spec.fields.map(() => ''));
      const r = validateShape(spec, empty);
      expect(r.ok).toBe(false);
      for (const f of spec.fields) expect(fieldErrors(r)[f.name]).toBe(MSG.required);
    }
  });

  it('agrees with an independent recompute for every shape and unit', () => {
    for (const spec of SHAPES) {
      for (const unit of ['ft', 'in', 'yd', 'cm', 'm']) {
        const units: Record<string, string> = {};
        spec.fields.forEach((f) => (units[f.name] = f.kind === 'angle' ? 'deg' : unit));
        const values = { ...shapeExampleValues(spec), units };
        if (!validateShape(spec, values).ok) continue;
        const c = computeShape(spec, values);
        const expected = spec.area(convertDims(spec, values)) * 1;
        expect(c.totalSqFt).toBe(expected);
        expect(completeShapeValue(spec, c)).toBe(expected);
      }
    }
  });

  it('prices every shape consistently in every area unit', () => {
    for (const spec of SHAPES) {
      for (const priceUnit of ['sqft', 'sqin', 'sqyd', 'sqm', 'acre']) {
        const values = { ...shapeExampleValues(spec), price: '2.5', priceUnit };
        const c = computeShape(spec, values);
        expect(c.cost).toBe(fromSqFt(c.totalSqFt, c.priceUnit) * 2.5);
        expect(presentShape(c).cost).toMatch(/^\$[\d,]+\.\d\d$/);
      }
    }
  });
});

describe('example values', () => {
  it('gives every shape a sound, positive example', () => {
    for (const spec of SHAPES) {
      const v = shapeExampleValues(spec);
      expect(validateShape(spec, v).ok).toBe(true);
      expect(v.quantity).toBe('1');
      expect(v.price).toBe('');
      expect(v.priceUnit).toBe('sqft');
      for (const f of spec.fields) expect(v.dims[f.name]).not.toBe('');
    }
  });

  it('exports the rectangle example for the fleet-wide check', () => {
    expect(SQUARE_FOOTAGE_EXAMPLE_VALUES).toEqual(shapeExampleValues(SHAPES[0]));
    expect(Number.isFinite(squareFootageBinding.resultValue(squareFootageBinding.compute(SQUARE_FOOTAGE_EXAMPLE_VALUES)))).toBe(true);
  });

  it('formats every example area without a placeholder', () => {
    for (const spec of SHAPES) {
      const c = computeShape(spec, shapeExampleValues(spec));
      expect(formatExactArea(c.totalSqFt)).not.toBe('—');
    }
  });
});
