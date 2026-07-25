import { describe, it, expect } from 'vitest';
import {
  validateAreaValues,
  computeArea,
  completeResultValue,
  describeAreaResult,
  interpretArea,
  unitSquared,
  fieldName,
  areaBinding,
  AREA_UNITS,
  DEFAULT_SHAPE,
  DEFAULT_UNIT,
  type AreaValues,
  type AreaComputed,
} from './area-form';
import { AREA_SHAPES } from './area';

/**
 * Area form-binding tests (R12B1 Commit 2). Exercise the VALIDATION / PRESENTATION boundary only — the
 * pure calculateArea underneath is unchanged and separately frozen by area.test.ts. Covers: strict
 * per-shape field parsing, active-shape-only validation with shape-scoped error keys, the complete-result
 * guard (finite > 0 area reconciling with calculateArea; NaN sentinel; no isUsableResult), and the
 * announcement / interpretation.
 */

const values = (shape: string, dims: Record<string, string>, unit = 'm'): AreaValues => ({ shape, unit, dims });
const rect = () => computeArea(values('rectangle', { length: '8', width: '5' }));
const rejects = (r: AreaComputed) => Number.isNaN(completeResultValue(r));

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe('area binding — contract', () => {
  it('offers the five interpretive units and defaults to rectangle / m', () => {
    expect(AREA_UNITS).toEqual(['cm', 'm', 'in', 'ft', 'yd']);
    expect(DEFAULT_SHAPE).toBe('rectangle');
    expect(DEFAULT_UNIT).toBe('m');
  });
  it('does NOT define isUsableResult (the guard lives in resultValue)', () => {
    expect(areaBinding.isUsableResult).toBeUndefined();
    expect(areaBinding.resultValue).toBe(completeResultValue);
  });
  it('scopes field names by shape', () => {
    expect(fieldName('rectangle', 'length')).toBe('rectangle.length');
    expect(fieldName('ellipse', 'a')).toBe('ellipse.a');
  });
});

/* ------------------------------------------------------------------ */
/* Validation — active shape only                                      */
/* ------------------------------------------------------------------ */

describe('area binding — validation', () => {
  it('accepts a well-formed active shape', () => {
    expect(validateAreaValues(values('rectangle', { length: '8', width: '5' }))).toEqual({ ok: true });
    expect(validateAreaValues(values('circle', { radius: '5' }))).toEqual({ ok: true });
    expect(validateAreaValues(values('trapezoid', { a: '6', b: '4', height: '3' }))).toEqual({ ok: true });
  });

  it('requires every active dimension (> 0, finite); empty / 0 / negative / non-finite rejected', () => {
    for (const bad of ['', '0', '-5', 'abc', 'Infinity']) {
      const v = validateAreaValues(values('rectangle', { length: bad, width: '5' }));
      expect(v.ok).toBe(false);
      expect((v as { fieldErrors: Record<string, string> }).fieldErrors['rectangle.length']).toMatch(/greater than zero/);
    }
  });

  it('keys errors by the SHAPE-SCOPED name and uses the shape visible label', () => {
    const v = validateAreaValues(values('trapezoid', { a: '', b: '4', height: '0' }));
    expect(v.ok).toBe(false);
    const fe = (v as { fieldErrors: Record<string, string> }).fieldErrors;
    expect(fe['trapezoid.a']).toBe('Enter a base a greater than zero.'); // label "Base a"
    expect(fe['trapezoid.height']).toBe('Enter a height greater than zero.');
    expect(fe['trapezoid.b']).toBeUndefined(); // b was valid
  });

  it('validates ONLY the active shape — extra/inactive dim keys are ignored', () => {
    // A stray key not in the rectangle's input set is never inspected.
    expect(validateAreaValues(values('rectangle', { length: '8', width: '5', radius: '-99' }))).toEqual({ ok: true });
  });

  it('reports every offending active dimension at once', () => {
    const v = validateAreaValues(values('trapezoid', { a: '', b: '', height: '' }));
    expect(Object.keys((v as { fieldErrors: Record<string, string> }).fieldErrors).sort()).toEqual(
      ['trapezoid.a', 'trapezoid.b', 'trapezoid.height'].sort(),
    );
  });

  it('an unknown shape is a defensive field error (the select is closed)', () => {
    expect(validateAreaValues(values('hexagon', {}))).toMatchObject({ ok: false, fieldErrors: { shape: 'Choose a shape.' } });
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('area binding — computation', () => {
  it('computes each shape through the unchanged formula', () => {
    expect(computeArea(values('rectangle', { length: '8', width: '5' })).area).toBe(40);
    expect(computeArea(values('square', { side: '4' })).area).toBe(16);
    expect(computeArea(values('triangle', { base: '6', height: '4' })).area).toBe(12);
    expect(computeArea(values('circle', { radius: '5' })).area).toBeCloseTo(78.539816, 5);
    expect(computeArea(values('trapezoid', { a: '6', b: '4', height: '3' })).area).toBe(15);
    expect(computeArea(values('parallelogram', { base: '6', height: '4' })).area).toBe(24);
    expect(computeArea(values('ellipse', { a: '5', b: '3' })).area).toBeCloseTo(47.123890, 5);
  });
  it('carries the shape identity + parsed dims + unit', () => {
    const r = computeArea(values('circle', { radius: '2.5' }, 'ft'));
    expect(r.shape).toBe('circle');
    expect(r.shapeLabel).toBe('Circle');
    expect(r.unit).toBe('ft');
    expect(r.dims).toEqual({ radius: 2.5 });
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

describe('area binding — complete-result guard', () => {
  it('returns the dominant area for a well-formed result (every shape)', () => {
    for (const s of AREA_SHAPES) {
      const dims = Object.fromEntries(s.inputs.map((i) => [i.key, '3']));
      const r = computeArea(values(s.key, dims));
      expect(completeResultValue(r)).toBeCloseTo(r.area, 9);
      expect(Number.isFinite(completeResultValue(r))).toBe(true);
    }
  });

  it('rejects a non-finite or non-positive area', () => {
    expect(rejects({ ...rect(), area: Number.NaN })).toBe(true);
    expect(rejects({ ...rect(), area: 0 })).toBe(true);
    expect(rejects({ ...rect(), area: -5 })).toBe(true);
    expect(rejects({ ...rect(), area: Infinity })).toBe(true);
  });

  it('rejects a non-positive or non-finite active dimension', () => {
    expect(rejects({ ...rect(), dims: { length: 0, width: 5 }, area: 0 })).toBe(true);
    expect(rejects({ ...rect(), dims: { length: -8, width: 5 }, area: 0 })).toBe(true);
    expect(rejects({ ...rect(), dims: { length: Infinity, width: 5 }, area: Infinity })).toBe(true);
  });

  it('rejects an unknown shape', () => {
    expect(rejects({ ...rect(), shape: 'hexagon' as AreaComputed['shape'] })).toBe(true);
  });

  it('rejects an area that does not reconcile with calculateArea (shape identity)', () => {
    expect(rejects({ ...rect(), area: 999 })).toBe(true); // dims say 40, area claims 999
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('area binding — presentation', () => {
  it('announces the dominant area with the spoken unit word', () => {
    expect(describeAreaResult(computeArea(values('rectangle', { length: '8', width: '5' })))).toBe(
      'The calculated area is 40 square metres.',
    );
    expect(describeAreaResult(computeArea(values('square', { side: '4' }, 'ft')))).toBe('The calculated area is 16 square feet.');
  });
  it('interprets with the shape name and squared unit', () => {
    expect(interpretArea(computeArea(values('rectangle', { length: '8', width: '5' })))).toBe(
      'The area of the selected rectangle is 40 m².',
    );
  });
  it('renders the squared unit label', () => {
    expect(unitSquared('cm')).toBe('cm²');
    expect(unitSquared('yd')).toBe('yd²');
  });
});

/* ------------------------------------------------------------------ */
/* readValues / resetValues (mock root — no DOM in node vitest)         */
/* ------------------------------------------------------------------ */

describe('area binding — readValues / resetValues', () => {
  const allNames = ['shape', 'unit', ...AREA_SHAPES.flatMap((s) => s.inputs.map((i) => fieldName(s.key, i.key)))];
  const mockRoot = (initial: Record<string, string>) => {
    const fields: Record<string, { value: string }> = {};
    for (const n of allNames) fields[n] = { value: initial[n] ?? '' };
    return {
      querySelector: (sel: string) => {
        const m = sel.match(/^\[name="(.+)"\]$/);
        return m ? fields[m[1]] ?? null : null;
      },
      __fields: fields,
    } as unknown as HTMLElement & { __fields: Record<string, { value: string }> };
  };

  it('reads the selected shape, unit and ONLY the active shape dims', () => {
    const root = mockRoot({ shape: 'circle', unit: 'ft', 'circle.radius': '5', 'rectangle.length': '99' });
    const v = areaBinding.readValues(root);
    expect(v).toEqual({ shape: 'circle', unit: 'ft', dims: { radius: '5' } }); // rectangle.length not read
  });

  it('reset restores rectangle + m and clears every dimension field across all shapes', () => {
    const root = mockRoot({ shape: 'ellipse', unit: 'in', 'ellipse.a': '5', 'ellipse.b': '3', 'rectangle.length': '8', 'trapezoid.height': '2' });
    areaBinding.resetValues(root, 'personal');
    const f = (root as unknown as { __fields: Record<string, { value: string }> }).__fields;
    expect(f['shape'].value).toBe('rectangle');
    expect(f['unit'].value).toBe('m');
    expect(f['ellipse.a'].value).toBe('');
    expect(f['ellipse.b'].value).toBe('');
    expect(f['rectangle.length'].value).toBe('');
    expect(f['trapezoid.height'].value).toBe('');
  });
});
