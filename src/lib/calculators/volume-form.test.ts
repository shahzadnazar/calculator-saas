import { describe, it, expect } from 'vitest';
import {
  VOLUME_SHAPES,
  MSG,
  DEFAULT_UNIT,
  volumeShapeByKey,
  resultUnit,
  convertDims,
  validateVolume,
  computeVolume,
  completeVolumeValue,
  presentVolume,
  describeVolume,
  makeVolumeBinding,
  volumeExampleValues,
  VOLUME_EXAMPLE_VALUES,
  volumeBinding,
  type VolumeShapeSpec,
  type VolumeValues,
} from './volume-form';
import { formatVolume, volumeSphere, volumeCube } from './volume';

/**
 * The form layer over the eleven shapes.
 *
 * One binding serves all eleven, so the sweeps that run over EVERY spec matter more than any single
 * favourite case. The spherical cap gets its own block because it is the only shape that accepts a
 * blank field and the only one that can answer twice.
 */

const sphere = volumeShapeByKey('sphere');
const cap = volumeShapeByKey('spherical-cap');

/** Values for a spec; `null` leaves a field blank. */
const vals = (
  spec: VolumeShapeSpec,
  numbers: (string | number | null)[],
  over: Partial<VolumeValues> = {},
): VolumeValues => {
  const dims: Record<string, string> = {};
  const units: Record<string, string> = {};
  spec.fields.forEach((f, i) => {
    const raw = numbers[i];
    dims[f.name] = raw === null || raw === undefined ? '' : String(raw);
    units[f.name] = DEFAULT_UNIT;
  });
  return { dims: { ...dims, ...(over.dims ?? {}) }, units: { ...units, ...(over.units ?? {}) } };
};

const fieldErrors = (r: ReturnType<typeof validateVolume>) =>
  (r as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
const formError = (r: ReturnType<typeof validateVolume>) => (r as { formError?: string }).formError;

describe('the specs', () => {
  it('offers the eleven shapes the reference has, in its order', () => {
    expect(VOLUME_SHAPES.map((s) => s.key)).toEqual([
      'sphere',
      'cone',
      'cube',
      'cylinder',
      'rectangular-tank',
      'capsule',
      'spherical-cap',
      'conical-frustum',
      'ellipsoid',
      'square-pyramid',
      'tube',
    ]);
  });

  it('labels the fields as the reference labels them', () => {
    const labels = (k: string) => volumeShapeByKey(k as 'sphere').fields.map((f) => f.label);
    expect(labels('sphere')).toEqual(['Radius (r)']);
    expect(labels('cone')).toEqual(['Base Radius (r)', 'Height (h)']);
    expect(labels('cube')).toEqual(['Edge Length (a)']);
    expect(labels('cylinder')).toEqual(['Base Radius (r)', 'Height (h)']);
    expect(labels('rectangular-tank')).toEqual(['Length (l)', 'Width (w)', 'Height (h)']);
    expect(labels('capsule')).toEqual(['Base Radius (r)', 'Height (h)']);
    expect(labels('spherical-cap')).toEqual(['Base Radius (r)', 'Ball Radius (R)', 'Height (h)']);
    expect(labels('conical-frustum')).toEqual(['Top Radius (r)', 'Bottom Radius (R)', 'Height (h)']);
    expect(labels('ellipsoid')).toEqual(['Axis 1 (a)', 'Axis 2 (b)', 'Axis 3 (c)']);
    expect(labels('square-pyramid')).toEqual(['Base Edge (a)', 'Height (h)']);
    expect(labels('tube')).toEqual(['Outer Diameter (d1)', 'Inner Diameter (d2)', 'Length (l)']);
  });

  it('asks for every field except on the spherical cap', () => {
    const anyTwo = VOLUME_SHAPES.filter((s) => s.requires === 'any-two');
    expect(anyTwo.map((s) => s.key)).toEqual(['spherical-cap']);
    expect(cap.note).toBe('Please provide any two values below to calculate.');
  });

  it('gives every shape a title, a lede and unique field names', () => {
    for (const s of VOLUME_SHAPES) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.lede.length).toBeGreaterThan(0);
      expect(s.fields.length).toBeGreaterThan(0);
      const names = s.fields.map((f) => f.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe('validation', () => {
  it('asks for a value before complaining about it', () => {
    const r = validateVolume(sphere, vals(sphere, ['']));
    expect(fieldErrors(r).d1).toBe(MSG.required);
  });

  it('rejects zero, a negative and junk', () => {
    expect(fieldErrors(validateVolume(sphere, vals(sphere, ['0']))).d1).toBe(MSG.invalid);
    expect(fieldErrors(validateVolume(sphere, vals(sphere, ['-3']))).d1).toBe(MSG.invalid);
    expect(fieldErrors(validateVolume(sphere, vals(sphere, ['abc']))).d1).toBe(MSG.invalid);
    expect(fieldErrors(validateVolume(sphere, vals(sphere, ['1e5']))).d1).toBe(MSG.invalid);
  });

  it('accepts a bare decimal', () => {
    expect(validateVolume(sphere, vals(sphere, ['.5'])).ok).toBe(true);
  });

  it('rejects an inner tube diameter that is not smaller than the outer', () => {
    const tube = volumeShapeByKey('tube');
    expect(formError(validateVolume(tube, vals(tube, [4, 4, 6])))).toBe(MSG.tubeBore);
    expect(formError(validateVolume(tube, vals(tube, [4, 5, 6])))).toBe(MSG.tubeBore);
    expect(validateVolume(tube, vals(tube, [4, 1, 6])).ok).toBe(true);
  });

  it('rejects a ball smaller than the cap it is supposed to carry', () => {
    expect(formError(validateVolume(cap, vals(cap, [10, 9, null])))).toBe(MSG.capRadii);
    expect(validateVolume(cap, vals(cap, [7, 9, null])).ok).toBe(true);
    // A base exactly on the equator is a hemisphere, which is fine.
    expect(validateVolume(cap, vals(cap, [9, 9, null])).ok).toBe(true);
  });

  it('rejects a cap taller than the ball is wide', () => {
    expect(formError(validateVolume(cap, vals(cap, [null, 9, 19])))).toBe(MSG.capHeight);
    expect(validateVolume(cap, vals(cap, [null, 9, 18])).ok).toBe(true);
  });
});

describe('the spherical cap takes any two', () => {
  it('accepts each of the three pairings', () => {
    expect(validateVolume(cap, vals(cap, [7, 9, null])).ok).toBe(true);
    expect(validateVolume(cap, vals(cap, [7, null, 4])).ok).toBe(true);
    expect(validateVolume(cap, vals(cap, [null, 9, 4])).ok).toBe(true);
  });

  it('refuses fewer than two', () => {
    expect(formError(validateVolume(cap, vals(cap, [7, null, null])))).toBe(MSG.needTwo);
    expect(formError(validateVolume(cap, vals(cap, [null, null, null])))).toBe(MSG.needTwo);
  });

  it('still rejects a junk entry in an optional field', () => {
    expect(fieldErrors(validateVolume(cap, vals(cap, [7, 9, '0']))).d3).toBe(MSG.invalid);
  });

  it('gives TWO volumes from the two radii and one from any other pair', () => {
    expect(computeVolume(cap, vals(cap, [7, 9, null])).solution.volumes).toHaveLength(2);
    expect(computeVolume(cap, vals(cap, [7, null, 4])).solution.volumes).toHaveLength(1);
    expect(computeVolume(cap, vals(cap, [null, 9, 4])).solution.volumes).toHaveLength(1);
  });

  it('uses the two radii when all three are given, and says so', () => {
    const r = computeVolume(cap, vals(cap, [7, 9, 5]));
    expect(r.solution.volumes).toHaveLength(2);
    expect(r.solution.steps[0].expression).toContain('only needs two values');
  });

  it('reproduces the reference figures for the two-radii case', () => {
    const r = computeVolume(cap, vals(cap, [7, 9, null]));
    expect(r.solution.volumes.map(formatVolume)).toEqual([
      '276.88296304275',
      '2776.7450962465',
    ]);
  });

  it('announces both answers', () => {
    const p = presentVolume(cap, computeVolume(cap, vals(cap, [7, 9, null])));
    expect(p.a11y).toBe(
      'Two possible results: 276.88296304275 cubic meters, or 2776.7450962465 cubic meters',
    );
  });

  it('guards both volumes, not just the first', () => {
    const r = computeVolume(cap, vals(cap, [7, 9, null]));
    expect(completeVolumeValue(cap, r)).toBe(r.solution.volumes[0]);
    const tampered = {
      ...r,
      solution: { ...r.solution, volumes: [r.solution.volumes[0], 999] },
    };
    expect(completeVolumeValue(cap, tampered)).toBeNaN();
  });
});

describe('units and computation', () => {
  it('reports in the FIRST field unit, cubed', () => {
    const tank = volumeShapeByKey('rectangular-tank');
    expect(resultUnit(tank, vals(tank, [1, 1, 1]))).toBe('m');
    expect(resultUnit(tank, vals(tank, [1, 1, 1], { units: { d1: 'ft' } }))).toBe('ft');
    // A later field's unit does not decide the answer's unit.
    expect(resultUnit(tank, vals(tank, [1, 1, 1], { units: { d2: 'in' } }))).toBe('m');
  });

  it('falls back to the default for an unknown unit', () => {
    expect(resultUnit(sphere, vals(sphere, [1], { units: { d1: 'furlong' } }))).toBe(DEFAULT_UNIT);
  });

  it('converts each measurement into the answer unit', () => {
    const tank = volumeShapeByKey('rectangular-tank');
    // 1 m by 50 cm by 200 cm is 1 × 0.5 × 2 = 1 m³.
    const mixed = vals(tank, [1, 50, 200], { units: { d2: 'cm', d3: 'cm' } });
    expect(computeVolume(tank, mixed).solution.volumes[0]).toBeCloseTo(1, 12);
    expect(computeVolume(tank, mixed).unit).toBe('m');
  });

  it('keeps a blank field blank rather than treating it as zero', () => {
    expect(convertDims(cap, vals(cap, [7, 9, null]))[2]).toBeNull();
  });

  it('yields no volume from an unusable entry', () => {
    expect(computeVolume(sphere, vals(sphere, ['abc'])).solution.volumes).toEqual([]);
  });
});

describe('the complete-result guard', () => {
  const good = () => computeVolume(sphere, vals(sphere, [33]));

  it('passes a result that reconciles with a recompute', () => {
    expect(completeVolumeValue(sphere, good())).toBeCloseTo(volumeSphere(33), 6);
  });

  it('refuses a result belonging to another shape', () => {
    expect(completeVolumeValue(volumeShapeByKey('cube'), good())).toBeNaN();
  });

  it('refuses a tampered volume or unit', () => {
    const r = good();
    expect(completeVolumeValue(sphere, { ...r, solution: { ...r.solution, volumes: [999] } })).toBeNaN();
    expect(completeVolumeValue(sphere, { ...r, unit: 'ft' })).toBeNaN();
  });

  it('refuses a result whose values no longer produce it', () => {
    expect(completeVolumeValue(sphere, { ...good(), values: vals(sphere, [34]) })).toBeNaN();
  });

  it('refuses a missing field on a shape that needs them all', () => {
    expect(completeVolumeValue(sphere, computeVolume(sphere, vals(sphere, [null])))).toBeNaN();
    const tank = volumeShapeByKey('rectangular-tank');
    expect(completeVolumeValue(tank, computeVolume(tank, vals(tank, [8, null, 66])))).toBeNaN();
  });

  it('refuses a cross-field impossibility that slipped through', () => {
    const tube = volumeShapeByKey('tube');
    expect(completeVolumeValue(tube, computeVolume(tube, vals(tube, [4, 5, 6])))).toBeNaN();
    expect(completeVolumeValue(cap, computeVolume(cap, vals(cap, [10, 9, null])))).toBeNaN();
  });
});

describe('presentation', () => {
  it('carries the working, ending on a headline answer', () => {
    const p = presentVolume(sphere, computeVolume(sphere, vals(sphere, [33])));
    expect(p.steps[0]).toMatchObject({ label: 'Volume', expression: '4/3 πr³' });
    expect(p.steps[p.steps.length - 1]).toMatchObject({ unit: 'meters³', final: true });
  });

  it('speaks the single answer plainly', () => {
    expect(presentVolume(volumeShapeByKey('cube'), computeVolume(volumeShapeByKey('cube'), vals(volumeShapeByKey('cube'), [5]))).a11y)
      .toBe('125 cubic meters');
  });

  it('says nothing about mixed units when every unit matches', () => {
    expect(presentVolume(sphere, computeVolume(sphere, vals(sphere, [33]))).mixedUnits).toBe(false);
  });

  it('flags mixed units so the answer unit is not a surprise', () => {
    const tank = volumeShapeByKey('rectangular-tank');
    const mixed = vals(tank, [1, 50, 200], { units: { d2: 'cm' } });
    expect(presentVolume(tank, computeVolume(tank, mixed)).mixedUnits).toBe(true);
  });

  it('ignores a BLANK field when judging mixed units', () => {
    // The cap's unused third field must not make an otherwise-consistent entry look mixed.
    const v = vals(cap, [7, 9, null], { units: { d3: 'ft' } });
    expect(presentVolume(cap, computeVolume(cap, v)).mixedUnits).toBe(false);
  });

  it('never renders NaN, Infinity or undefined', () => {
    const p = presentVolume(sphere, computeVolume(sphere, vals(sphere, [''])));
    for (const s of [p.a11y, ...p.steps.map((x) => x.expression)]) {
      expect(s).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('describes the result in one sentence', () => {
    const cube = volumeShapeByKey('cube');
    expect(describeVolume(cube, computeVolume(cube, vals(cube, [5])))).toBe(
      'Cube volume: 125 cubic meters.',
    );
  });
});

describe('the shared binding, over every shape', () => {
  it('computes, guards and describes each shape from its own example', () => {
    for (const spec of VOLUME_SHAPES) {
      const binding = makeVolumeBinding(spec);
      const values = volumeExampleValues(spec);
      expect(binding.validate(values).ok).toBe(true);
      const computed = binding.compute(values);
      const value = binding.resultValue(computed);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
      expect(binding.describeResult(computed, { phase: 'first-result' })).toContain(spec.title);
    }
  });

  it('rejects an all-empty form for every shape', () => {
    for (const spec of VOLUME_SHAPES) {
      const empty = vals(spec, spec.fields.map(() => null));
      const r = validateVolume(spec, empty);
      expect(r.ok).toBe(false);
    }
  });

  it('agrees with an independent recompute for every shape and unit', () => {
    for (const spec of VOLUME_SHAPES) {
      for (const unit of ['m', 'cm', 'in', 'ft', 'yd']) {
        const units: Record<string, string> = {};
        spec.fields.forEach((f) => (units[f.name] = unit));
        const values = { ...volumeExampleValues(spec), units };
        if (!validateVolume(spec, values).ok) continue;
        const c = computeVolume(spec, values);
        expect(c.unit).toBe(unit);
        expect(completeVolumeValue(spec, c)).toBe(c.solution.volumes[0]);
        for (const v of c.solution.volumes) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThan(0);
        }
      }
    }
  });

  it('scales as a cube when every dimension doubles', () => {
    for (const spec of VOLUME_SHAPES) {
      if (spec.key === 'spherical-cap') continue; // solves for a third value, so it does not scale simply
      const base = volumeExampleValues(spec);
      const doubled: VolumeValues = { dims: {}, units: base.units };
      for (const [k, v] of Object.entries(base.dims)) doubled.dims[k] = String(Number(v) * 2);
      const one = computeVolume(spec, base).solution.volumes[0];
      const two = computeVolume(spec, doubled).solution.volumes[0];
      expect(two / one).toBeCloseTo(8, 6);
    }
  });
});

describe('example values', () => {
  it("uses the reference's own numbers, in the default unit", () => {
    for (const spec of VOLUME_SHAPES) {
      const v = volumeExampleValues(spec);
      expect(validateVolume(spec, v).ok).toBe(true);
      for (const f of spec.fields) expect(v.units[f.name]).toBe(DEFAULT_UNIT);
    }
    expect(volumeExampleValues(sphere).dims.d1).toBe('33');
    // The cap's example leaves the height blank, which is the point of that shape.
    expect(volumeExampleValues(cap).dims.d3).toBe('');
  });

  it('reproduces the reference figures from the example values', () => {
    const expected: Record<string, string[]> = {
      sphere: ['150532.55358941'],
      cone: ['2787.6398812853'],
      cube: ['125'],
      cylinder: ['10643.715910362'],
      'rectangular-tank': ['17952'],
      capsule: ['1151.9173063163'],
      'spherical-cap': ['276.88296304275', '2776.7450962465'],
      'conical-frustum': ['146.60765716752'],
      ellipsoid: ['502.65482457437'],
      'square-pyramid': ['15'],
      tube: ['70.68583470577'],
    };
    for (const spec of VOLUME_SHAPES) {
      const c = computeVolume(spec, volumeExampleValues(spec));
      expect(c.solution.volumes.map(formatVolume)).toEqual(expected[spec.key]);
    }
  });

  it('exports the sphere example for the fleet-wide check', () => {
    expect(VOLUME_EXAMPLE_VALUES).toEqual(volumeExampleValues(VOLUME_SHAPES[0]));
    expect(Number.isFinite(volumeBinding.resultValue(volumeBinding.compute(VOLUME_EXAMPLE_VALUES)))).toBe(true);
    expect(volumeCube(5)).toBe(125);
  });
});
