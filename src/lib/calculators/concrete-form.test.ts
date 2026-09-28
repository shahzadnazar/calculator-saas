import { describe, it, expect } from 'vitest';
import {
  CONCRETE_SHAPES,
  MSG,
  DEFAULT_UNIT,
  concreteShapeByKey,
  convertFields,
  validateConcrete,
  computeConcrete,
  completeConcreteValue,
  presentConcrete,
  describeConcrete,
  makeConcreteBinding,
  concreteExampleValues,
  CONCRETE_EXAMPLE_VALUES,
  concreteBinding,
  type ConcreteShapeSpec,
  type ConcreteValues,
} from './concrete-form';
import { toFeet, formatQuantity, concreteAmount } from './concrete';

/**
 * The form layer over the five pours.
 *
 * One binding serves all five, so the sweeps that run over EVERY spec matter more than any single
 * favourite case. The reference-figure block re-checks the published results through the FORM,
 * with units entered as a visitor would enter them.
 */

const slab = concreteShapeByKey('slab');
const tube = concreteShapeByKey('tube');
const stairs = concreteShapeByKey('stairs');

/** Values for a spec, its fields given in order, with one unit for every length. */
const vals = (
  spec: ConcreteShapeSpec,
  numbers: (string | number)[],
  unit = DEFAULT_UNIT,
  over: Partial<ConcreteValues> = {},
): ConcreteValues => {
  const dims: Record<string, string> = {};
  const units: Record<string, string> = {};
  spec.fields.forEach((f, i) => {
    dims[f.name] = String(numbers[i] ?? '');
    if (f.kind === 'length') units[f.name] = unit;
  });
  return { dims: { ...dims, ...(over.dims ?? {}) }, units: { ...units, ...(over.units ?? {}) } };
};

const fieldErrors = (r: ReturnType<typeof validateConcrete>) =>
  (r as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
const formError = (r: ReturnType<typeof validateConcrete>) => (r as { formError?: string }).formError;

describe('the specs', () => {
  it('offers the five pours the reference has, in its order', () => {
    expect(CONCRETE_SHAPES.map((s) => s.key)).toEqual([
      'slab',
      'footing',
      'tube',
      'curb',
      'stairs',
    ]);
  });

  it('titles them as the reference titles them', () => {
    expect(CONCRETE_SHAPES.map((s) => s.title)).toEqual([
      'Slabs, Square Footings, or Walls',
      'Hole, Column, or Round Footings',
      'Circular Slab or Tube',
      'Curb and Gutter Barrier',
      'Stairs',
    ]);
  });

  it('labels the fields as the reference labels them', () => {
    const labels = (k: string) => concreteShapeByKey(k as 'slab').fields.map((f) => f.label);
    expect(labels('slab')).toEqual(['Length (l)', 'Width (w)', 'Thickness or Height (h)', 'Quantity']);
    expect(labels('footing')).toEqual(['Diameter (d)', 'Depth or Height (h)', 'Quantity']);
    expect(labels('tube')).toEqual([
      'Outer Diameter (d₁)',
      'Inner Diameter (d₂)',
      'Length or Height (h)',
      'Quantity',
    ]);
    expect(labels('curb')).toEqual([
      'Curb Depth',
      'Gutter Width',
      'Curb Height',
      'Flag Thickness',
      'Length',
      'Quantity',
    ]);
    expect(labels('stairs')).toEqual(['Run', 'Rise', 'Width', 'Platform Depth', 'Number of Risers']);
  });

  it('gives a quantity to every pour except the stairs, which counts risers instead', () => {
    for (const s of CONCRETE_SHAPES) {
      const hasQuantity = s.fields.some((f) => f.name === 'quantity');
      expect(hasQuantity).toBe(s.key !== 'stairs');
    }
    expect(stairs.fields.at(-1)).toMatchObject({ label: 'Number of Risers', kind: 'count' });
  });

  it('treats counts as counts, so they never get a unit dropdown', () => {
    for (const s of CONCRETE_SHAPES) {
      for (const f of s.fields) {
        const isCount = f.name === 'quantity' || f.label === 'Number of Risers';
        expect(f.kind).toBe(isCount ? 'count' : 'length');
      }
    }
  });

  it('keeps every field name unique within its own pour', () => {
    for (const s of CONCRETE_SHAPES) {
      const names = s.fields.map((f) => f.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe('validation', () => {
  it('asks for a value before complaining about it', () => {
    const r = validateConcrete(slab, vals(slab, ['', '', '', '1']));
    expect(fieldErrors(r).d1).toBe(MSG.required);
    expect(fieldErrors(r).d2).toBe(MSG.required);
  });

  it('rejects zero, a negative and junk in a length', () => {
    expect(fieldErrors(validateConcrete(slab, vals(slab, ['0', '4', '0.5', '1']))).d1).toBe(MSG.invalid);
    expect(fieldErrors(validateConcrete(slab, vals(slab, ['-3', '4', '0.5', '1']))).d1).toBe(MSG.invalid);
    expect(fieldErrors(validateConcrete(slab, vals(slab, ['abc', '4', '0.5', '1']))).d1).toBe(MSG.invalid);
  });

  it('demands a whole number for a count', () => {
    expect(fieldErrors(validateConcrete(slab, vals(slab, ['10', '4', '0.5', '1.5']))).quantity).toBe(
      MSG.countInvalid,
    );
    expect(fieldErrors(validateConcrete(slab, vals(slab, ['10', '4', '0.5', '0']))).quantity).toBe(
      MSG.countInvalid,
    );
    expect(fieldErrors(validateConcrete(stairs, vals(stairs, ['1', '0.5', '3', '1', '2.5']))).d5).toBe(
      MSG.countInvalid,
    );
  });

  it('accepts a sound pour', () => {
    expect(validateConcrete(slab, vals(slab, ['16', '10', '0.33', '1'])).ok).toBe(true);
    expect(validateConcrete(stairs, vals(stairs, ['1', '0.6', '4', '1', '6'])).ok).toBe(true);
  });

  it('rejects a bore that is not smaller than the outer diameter', () => {
    expect(formError(validateConcrete(tube, vals(tube, ['4', '4', '1', '1'])))).toBe(MSG.tubeBore);
    expect(formError(validateConcrete(tube, vals(tube, ['4', '5', '1', '1'])))).toBe(MSG.tubeBore);
    expect(validateConcrete(tube, vals(tube, ['6', '4', '0.33', '1'])).ok).toBe(true);
  });

  it('judges the bore AFTER converting, not on the raw numbers', () => {
    // 6 ft outer against 60 in inner is 6 ft against 5 ft — a real ring.
    const mixed = vals(tube, ['6', '60', '4', '1'], 'ft', { units: { d2: 'in', d3: 'in' } });
    expect(validateConcrete(tube, mixed).ok).toBe(true);
    // The same numbers all in feet cannot work.
    expect(formError(validateConcrete(tube, vals(tube, ['6', '60', '4', '1'])))).toBe(MSG.tubeBore);
  });
});

describe('units and computation', () => {
  it('converts each measurement by its own unit', () => {
    // 12 in by 12 in by 12 in is one cubic foot.
    const inches = vals(slab, ['12', '12', '12', '1'], 'in');
    expect(computeConcrete(slab, inches).cubicFeet).toBeCloseTo(1, 9);
  });

  it('leaves a count alone when converting', () => {
    const v = vals(slab, ['12', '12', '12', '5'], 'in');
    expect(convertFields(slab, v).at(-1)).toBe(5);
  });

  it('multiplies by the quantity', () => {
    const one = computeConcrete(slab, vals(slab, ['10', '4', '0.5', '1']));
    const three = computeConcrete(slab, vals(slab, ['10', '4', '0.5', '3']));
    expect(three.cubicFeet).toBeCloseTo(one.cubicFeet * 3, 9);
  });

  it('has no quantity to multiply on the stairs', () => {
    const r = computeConcrete(stairs, vals(stairs, ['1', '0.5', '3', '0.5', '2']));
    expect(r.cubicFeet).toBeGreaterThan(0);
    expect(stairs.fields.some((f) => f.name === 'quantity')).toBe(false);
  });

  it('yields NaN rather than a number from an unusable entry', () => {
    expect(computeConcrete(slab, vals(slab, ['', '4', '0.5', '1'])).cubicFeet).toBeNaN();
    expect(computeConcrete(slab, vals(slab, ['abc', '4', '0.5', '1'])).cubicFeet).toBeNaN();
  });
});

describe('the complete-result guard', () => {
  const good = () => computeConcrete(slab, vals(slab, ['10', '4', '0.5', '1']));

  it('passes a result that reconciles with a recompute', () => {
    expect(completeConcreteValue(slab, good())).toBeCloseTo(20, 9);
  });

  it('refuses a result belonging to another pour', () => {
    expect(completeConcreteValue(tube, good())).toBeNaN();
  });

  it('refuses a tampered volume or amount', () => {
    const r = good();
    expect(completeConcreteValue(slab, { ...r, cubicFeet: 999 })).toBeNaN();
    expect(
      completeConcreteValue(slab, { ...r, amount: { ...r.amount, kilograms: Number.NaN } }),
    ).toBeNaN();
  });

  it('refuses a result whose values no longer produce it', () => {
    expect(completeConcreteValue(slab, { ...good(), values: vals(slab, ['11', '4', '0.5', '1']) })).toBeNaN();
  });

  it('refuses a cross-field impossibility that slipped through', () => {
    expect(completeConcreteValue(tube, computeConcrete(tube, vals(tube, ['4', '5', '1', '1'])))).toBeNaN();
  });

  it('refuses an incomplete entry', () => {
    expect(completeConcreteValue(slab, computeConcrete(slab, vals(slab, ['', '4', '0.5', '1'])))).toBeNaN();
  });
});

describe('presentation', () => {
  it('prints the volume in three units and the weight in two', () => {
    const p = presentConcrete(computeConcrete(slab, vals(slab, ['27', '1', '1', '1'])));
    expect(p.cubicFeet).toBe('27');
    expect(p.cubicYards).toBe('1');
    expect(p.pounds).toBe('3,591');
    expect(p.bags).toHaveLength(2);
    expect(p.bags[0].label).toBe('Using 60-lb bags');
    expect(p.bags[1].label).toBe('Using 80-lb bags');
  });

  it('states the density the estimate assumes', () => {
    const p = presentConcrete(computeConcrete(slab, vals(slab, ['10', '4', '0.5', '1'])));
    expect(p.densityNote).toBe(
      'If using pre-mixed concrete with density of 2,130 kg/m³ or 133 lbs/ft³:',
    );
  });

  it('never renders NaN, Infinity or undefined', () => {
    const p = presentConcrete(computeConcrete(slab, vals(slab, ['', '', '', ''])));
    for (const text of [
      p.cubicFeet, p.cubicYards, p.cubicMeters, p.pounds, p.kilograms, p.a11y,
      ...p.bags.map((b) => b.value),
    ]) {
      expect(text).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('describes the result in one sentence naming the pour', () => {
    expect(describeConcrete(slab, computeConcrete(slab, vals(slab, ['10', '4', '0.5', '1'])))).toContain(
      'Slabs, Square Footings, or Walls',
    );
  });
});

describe('the reference figures, through the form', () => {
  const report = (spec: ConcreteShapeSpec, v: ConcreteValues) => {
    const p = presentConcrete(computeConcrete(spec, v));
    return {
      ft3: p.cubicFeet, yd3: p.cubicYards, m3: p.cubicMeters,
      lbs: p.pounds, kg: p.kilograms, b60: p.bags[0].value, b80: p.bags[1].value,
    };
  };

  it('slab: 5 m by 2.5 m by 5 cm', () => {
    const v = vals(slab, ['5', '2.5', '5', '1'], 'm', { units: { d3: 'cm' } });
    expect(report(slab, v)).toEqual({
      ft3: '22.07', yd3: '0.82', m3: '0.63',
      lbs: '2,935.53', kg: '1,331.25', b60: '48.93', b80: '36.69',
    });
  });

  it('circular slab or tube: outer 5 m, inner 4 m, 6 cm thick', () => {
    const v = vals(tube, ['5', '4', '6', '1'], 'm', { units: { d3: 'cm' } });
    expect(report(tube, v)).toEqual({
      ft3: '14.98', yd3: '0.55', m3: '0.42',
      lbs: '1,992', kg: '903.36', b60: '33.2', b80: '24.9',
    });
  });

  it('curb and gutter: 4 cm, 10 cm, 4 cm, 5 cm, 10 m', () => {
    const curb = concreteShapeByKey('curb');
    const v = vals(curb, ['4', '10', '4', '5', '10', '1'], 'cm', { units: { d5: 'm' } });
    expect(report(curb, v)).toEqual({
      ft3: '3.04', yd3: '0.11', m3: '0.086',
      lbs: '403.93', kg: '183.18', b60: '6.73', b80: '5.05',
    });
  });

  it('stairs: 12 cm run, 6 cm rise, 50 cm wide, 5 cm platform, 5 risers', () => {
    const v = vals(stairs, ['12', '6', '50', '5', '5'], 'cm');
    expect(report(stairs, v)).toEqual({
      ft3: '1.54', yd3: '0.057', m3: '0.044',
      lbs: '204.31', kg: '92.66', b60: '3.41', b80: '2.55',
    });
  });

  it('hole or column: 2.5 m across, 6 m deep', () => {
    const footing = concreteShapeByKey('footing');
    expect(report(footing, vals(footing, ['2.5', '6', '1'], 'm'))).toEqual({
      ft3: '1,040.1', yd3: '38.52', m3: '29.45',
      lbs: '138,333.55', kg: '62,733.63', b60: '2,305.56', b80: '1,729.17',
    });
  });
});

describe('the shared binding, over every pour', () => {
  it('computes, guards and describes each pour from its own example', () => {
    for (const spec of CONCRETE_SHAPES) {
      const binding = makeConcreteBinding(spec);
      const values = concreteExampleValues(spec);
      expect(binding.validate(values).ok).toBe(true);
      const computed = binding.compute(values);
      const value = binding.resultValue(computed);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
      expect(binding.describeResult(computed, { phase: 'first-result' })).toContain(spec.title);
    }
  });

  it('rejects an all-empty form for every pour', () => {
    for (const spec of CONCRETE_SHAPES) {
      const empty = vals(spec, spec.fields.map(() => ''));
      const r = validateConcrete(spec, empty);
      expect(r.ok).toBe(false);
      for (const f of spec.fields) expect(fieldErrors(r)[f.name]).toBe(MSG.required);
    }
  });

  it('gives the SAME pour whatever unit it was measured in', () => {
    for (const spec of CONCRETE_SHAPES) {
      const base = concreteExampleValues(spec);
      // Re-express every length in inches and check the volume is unchanged.
      const dims: Record<string, string> = {};
      const units: Record<string, string> = {};
      spec.fields.forEach((f) => {
        if (f.kind === 'count') {
          dims[f.name] = base.dims[f.name];
          return;
        }
        const feet = toFeet(Number(base.dims[f.name]), base.units[f.name] as 'ft');
        dims[f.name] = String(feet * 12);
        units[f.name] = 'in';
      });
      const a = computeConcrete(spec, base).cubicFeet;
      const b = computeConcrete(spec, { dims, units }).cubicFeet;
      expect(b).toBeCloseTo(a, 6);
    }
  });

  it('agrees with an independent recompute for every pour', () => {
    for (const spec of CONCRETE_SHAPES) {
      const values = concreteExampleValues(spec);
      const c = computeConcrete(spec, values);
      expect(c.cubicFeet).toBe(spec.volume(convertFields(spec, values)));
      expect(completeConcreteValue(spec, c)).toBe(c.cubicFeet);
      const expected = concreteAmount(c.cubicFeet);
      expect(c.amount.kilograms).toBe(expected.kilograms);
      expect(c.amount.bags.map((b) => b.bags)).toEqual(expected.bags.map((b) => b.bags));
    }
  });
});

describe('example values', () => {
  it('gives every pour a sound, positive example', () => {
    for (const spec of CONCRETE_SHAPES) {
      const v = concreteExampleValues(spec);
      expect(validateConcrete(spec, v).ok).toBe(true);
      for (const f of spec.fields) expect(v.dims[f.name]).not.toBe('');
    }
  });

  it('formats every example without a placeholder', () => {
    for (const spec of CONCRETE_SHAPES) {
      const p = presentConcrete(computeConcrete(spec, concreteExampleValues(spec)));
      expect(p.cubicFeet).not.toBe('—');
      expect(formatQuantity(computeConcrete(spec, concreteExampleValues(spec)).cubicFeet)).not.toBe('—');
    }
  });

  it('exports the slab example for the fleet-wide check', () => {
    expect(CONCRETE_EXAMPLE_VALUES).toEqual(concreteExampleValues(CONCRETE_SHAPES[0]));
    expect(
      Number.isFinite(concreteBinding.resultValue(concreteBinding.compute(CONCRETE_EXAMPLE_VALUES))),
    ).toBe(true);
  });
});
