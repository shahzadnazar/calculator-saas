import { describe, it, expect } from 'vitest';
import {
  validateVolumeValues,
  computeVolume,
  completeResultValue,
  describeVolumeResult,
  interpretVolume,
  unitCubed,
  fieldName,
  volumeBinding,
  VOLUME_UNITS,
  DEFAULT_SHAPE,
  DEFAULT_UNIT,
  type VolumeValues,
  type VolumeComputed,
} from './volume-form';
import { VOLUME_SHAPES } from './volume';

/**
 * Volume form-binding tests (R12C1 Commit 2). Exercise the VALIDATION / PRESENTATION boundary only — the
 * pure calculateVolume underneath is unchanged and separately frozen by volume.test.ts. Volume is an
 * INDEPENDENT product following the Area interaction pattern; it imports nothing from area-form. Covers:
 * strict per-shape field parsing, active-shape-only validation with shape-scoped error keys, the
 * complete-result guard (finite > 0 volume reconciling with calculateVolume; NaN sentinel; no
 * isUsableResult), and the cubic-unit announcement / interpretation.
 */

const values = (shape: string, dims: Record<string, string>, unit = 'm'): VolumeValues => ({ shape, unit, dims });
const cube = () => computeVolume(values('cube', { side: '4' }));
const rejects = (r: VolumeComputed) => Number.isNaN(completeResultValue(r));

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe('volume binding — contract', () => {
  it('offers the five interpretive units and defaults to cube / m (NOT rectangle)', () => {
    expect(VOLUME_UNITS).toEqual(['cm', 'm', 'in', 'ft', 'yd']);
    expect(DEFAULT_SHAPE).toBe('cube');
    expect(DEFAULT_UNIT).toBe('m');
  });
  it('does NOT define isUsableResult (the guard lives in resultValue)', () => {
    expect(volumeBinding.isUsableResult).toBeUndefined();
    expect(volumeBinding.resultValue).toBe(completeResultValue);
  });
  it('scopes field names by shape', () => {
    expect(fieldName('box', 'length')).toBe('box.length');
    expect(fieldName('capsule', 'height')).toBe('capsule.height');
  });
});

/* ------------------------------------------------------------------ */
/* Validation — active shape only                                      */
/* ------------------------------------------------------------------ */

describe('volume binding — validation', () => {
  it('accepts a well-formed active shape', () => {
    expect(validateVolumeValues(values('cube', { side: '4' }))).toEqual({ ok: true });
    expect(validateVolumeValues(values('box', { length: '8', width: '5', height: '2' }))).toEqual({ ok: true });
    expect(validateVolumeValues(values('capsule', { radius: '3', height: '6' }))).toEqual({ ok: true });
  });

  it('requires every active dimension (> 0, finite); empty / 0 / negative / non-finite rejected', () => {
    for (const bad of ['', '0', '-5', 'abc', 'Infinity']) {
      const v = validateVolumeValues(values('box', { length: bad, width: '5', height: '2' }));
      expect(v.ok).toBe(false);
      expect((v as { fieldErrors: Record<string, string> }).fieldErrors['box.length']).toMatch(/greater than zero/);
    }
  });

  it('keys errors by the SHAPE-SCOPED name and uses the shape visible label', () => {
    const v = validateVolumeValues(values('pyramid', { length: '', width: '4', height: '0' }));
    expect(v.ok).toBe(false);
    const fe = (v as { fieldErrors: Record<string, string> }).fieldErrors;
    expect(fe['pyramid.length']).toBe('Enter a base length greater than zero.'); // label "Base length"
    expect(fe['pyramid.height']).toBe('Enter a height greater than zero.');
    expect(fe['pyramid.width']).toBeUndefined(); // width was valid
  });

  it('capsule uses its "Cylinder height" label in the error', () => {
    const v = validateVolumeValues(values('capsule', { radius: '3', height: '' }));
    expect((v as { fieldErrors: Record<string, string> }).fieldErrors['capsule.height']).toBe('Enter a cylinder height greater than zero.');
  });

  it('validates ONLY the active shape — extra/inactive dim keys are ignored', () => {
    expect(validateVolumeValues(values('cube', { side: '4', radius: '-99' }))).toEqual({ ok: true });
  });

  it('reports every offending active dimension at once', () => {
    const v = validateVolumeValues(values('box', { length: '', width: '', height: '' }));
    expect(Object.keys((v as { fieldErrors: Record<string, string> }).fieldErrors).sort()).toEqual(
      ['box.height', 'box.length', 'box.width'].sort(),
    );
  });

  it('an unknown shape is a defensive field error (the select is closed)', () => {
    expect(validateVolumeValues(values('tetrahedron', {}))).toMatchObject({ ok: false, fieldErrors: { shape: 'Choose a shape.' } });
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('volume binding — computation', () => {
  it('computes each shape through the unchanged formula', () => {
    expect(computeVolume(values('cube', { side: '4' })).volume).toBe(64);
    expect(computeVolume(values('box', { length: '8', width: '5', height: '2' })).volume).toBe(80);
    expect(computeVolume(values('sphere', { radius: '3' })).volume).toBeCloseTo(113.097336, 5);
    expect(computeVolume(values('cylinder', { radius: '2', height: '5' })).volume).toBeCloseTo(62.831853, 5);
    expect(computeVolume(values('cone', { radius: '3', height: '6' })).volume).toBeCloseTo(56.548668, 5);
    expect(computeVolume(values('pyramid', { length: '6', width: '4', height: '9' })).volume).toBe(72);
    expect(computeVolume(values('capsule', { radius: '3', height: '6' })).volume).toBeCloseTo(90 * Math.PI, 6);
  });
  it('carries the shape identity + parsed dims + unit', () => {
    const r = computeVolume(values('capsule', { radius: '2.5', height: '4' }, 'ft'));
    expect(r.shape).toBe('capsule');
    expect(r.shapeLabel).toBe('Capsule');
    expect(r.unit).toBe('ft');
    expect(r.dims).toEqual({ radius: 2.5, height: 4 });
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

describe('volume binding — complete-result guard', () => {
  it('returns the dominant volume for a well-formed result (every shape)', () => {
    for (const s of VOLUME_SHAPES) {
      const dims = Object.fromEntries(s.inputs.map((i) => [i.key, '3']));
      const r = computeVolume(values(s.key, dims));
      expect(completeResultValue(r)).toBeCloseTo(r.volume, 6);
      expect(Number.isFinite(completeResultValue(r))).toBe(true);
    }
  });

  it('rejects a non-finite or non-positive volume', () => {
    expect(rejects({ ...cube(), volume: Number.NaN })).toBe(true);
    expect(rejects({ ...cube(), volume: 0 })).toBe(true);
    expect(rejects({ ...cube(), volume: -5 })).toBe(true);
    expect(rejects({ ...cube(), volume: Infinity })).toBe(true);
  });

  it('rejects a non-positive or non-finite active dimension', () => {
    expect(rejects({ ...cube(), dims: { side: 0 }, volume: 0 })).toBe(true);
    expect(rejects({ ...cube(), dims: { side: -4 }, volume: 0 })).toBe(true);
    expect(rejects({ ...cube(), dims: { side: Infinity }, volume: Infinity })).toBe(true);
  });

  it('rejects an unknown shape', () => {
    expect(rejects({ ...cube(), shape: 'tetrahedron' as VolumeComputed['shape'] })).toBe(true);
  });

  it('rejects a volume that does not reconcile with calculateVolume (shape identity)', () => {
    expect(rejects({ ...cube(), volume: 999 })).toBe(true); // dims say 64, volume claims 999
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('volume binding — presentation', () => {
  it('announces the dominant volume with the spoken cubic-unit word', () => {
    expect(describeVolumeResult(computeVolume(values('cube', { side: '4' })))).toBe('The calculated volume is 64 cubic metres.');
    expect(describeVolumeResult(computeVolume(values('box', { length: '8', width: '5', height: '2' }, 'ft')))).toBe(
      'The calculated volume is 80 cubic feet.',
    );
  });
  it('interprets with the shape name and cubed unit', () => {
    expect(interpretVolume(computeVolume(values('cube', { side: '4' })))).toBe('The volume of the selected cube is 64 m³.');
  });
  it('renders the cubed unit label', () => {
    expect(unitCubed('cm')).toBe('cm³');
    expect(unitCubed('yd')).toBe('yd³');
  });
});

/* ------------------------------------------------------------------ */
/* readValues / resetValues (mock root — no DOM in node vitest)         */
/* ------------------------------------------------------------------ */

describe('volume binding — readValues / resetValues', () => {
  const allNames = ['shape', 'unit', ...VOLUME_SHAPES.flatMap((s) => s.inputs.map((i) => fieldName(s.key, i.key)))];
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
    const root = mockRoot({ shape: 'capsule', unit: 'ft', 'capsule.radius': '3', 'capsule.height': '6', 'box.length': '99' });
    const v = volumeBinding.readValues(root);
    expect(v).toEqual({ shape: 'capsule', unit: 'ft', dims: { radius: '3', height: '6' } }); // box.length not read
  });

  it('reset restores cube + m and clears every dimension field across all shapes', () => {
    const root = mockRoot({ shape: 'box', unit: 'in', 'box.length': '8', 'box.width': '5', 'box.height': '2', 'cube.side': '4' });
    volumeBinding.resetValues(root, 'personal');
    const f = (root as unknown as { __fields: Record<string, { value: string }> }).__fields;
    expect(f['shape'].value).toBe('cube');
    expect(f['unit'].value).toBe('m');
    expect(f['box.length'].value).toBe('');
    expect(f['box.height'].value).toBe('');
    expect(f['cube.side'].value).toBe('');
  });
});
