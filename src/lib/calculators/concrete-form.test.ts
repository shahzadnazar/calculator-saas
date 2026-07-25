import { describe, it, expect } from 'vitest';
import {
  validateConcreteValues,
  computeConcrete,
  describeConcreteResult,
  interpretConcrete,
  isConcreteResultUsable,
  convertDimension,
  concreteBinding,
  type ConcreteValues,
  type ConcreteComputed,
} from './concrete-form';
import { calculateConcrete } from './concrete';

const vals = (over: Partial<ConcreteValues> = {}): ConcreteValues => ({
  length: '10',
  width: '10',
  depth: '0.5',
  unit: 'ft',
  wastePct: '',
  ...over,
});

const errs = (r: ReturnType<typeof validateConcreteValues>) =>
  (r as { fieldErrors: Record<string, string> }).fieldErrors;

const result = (over: Partial<ConcreteComputed> = {}): ConcreteComputed => ({
  cubicFeet: 50,
  cubicYards: 1.852,
  cubicMeters: 1.416,
  bags40: 167,
  bags60: 112,
  bags80: 84,
  wastePct: 0,
  wasteProvided: false,
  unit: 'ft',
  ...over,
});

/** DOM-free stub modelling the dimension/waste inputs + the two native unit radios. */
function stubRoot(v: Record<string, string>) {
  const inputs: Record<string, { value: string }> = {};
  for (const [k, val] of Object.entries(v)) if (k !== 'unit') inputs[k] = { value: val };
  const ft = { value: 'ft', checked: v.unit !== 'm' };
  const m = { value: 'm', checked: v.unit === 'm' };
  return {
    querySelector(sel: string) {
      if (sel === '[name="unit"]:checked') return ft.checked ? ft : m;
      if (sel === '[name="unit"][value="ft"]') return ft;
      if (sel === '[name="unit"][value="m"]') return m;
      const mm = sel.match(/\[name="(.+?)"\]$/);
      return mm ? (inputs[mm[1]] ?? null) : null;
    },
  } as unknown as HTMLElement;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('concrete-form — validation', () => {
  it('accepts an ordinary calculation (waste optional, blank)', () => {
    expect(validateConcreteValues(vals())).toEqual({ ok: true });
  });

  it('empty dimensions are invalid', () => {
    const e = errs(validateConcreteValues(vals({ length: '', width: '', depth: '' })));
    expect(e.length).toBe('Enter a length greater than zero.');
    expect(e.width).toBe('Enter a width greater than zero.');
    expect(e.depth).toBe('Enter a depth greater than zero.');
  });

  it('length/width/depth: > 0 required — zero, negative and non-finite rejected', () => {
    expect(errs(validateConcreteValues(vals({ length: '0' }))).length).toBe('Enter a length greater than zero.');
    expect(errs(validateConcreteValues(vals({ width: '-2' }))).width).toBe('Enter a width greater than zero.');
    expect(errs(validateConcreteValues(vals({ depth: 'Infinity' }))).depth).toBe('Enter a depth greater than zero.');
  });

  it('both units are accepted', () => {
    expect(validateConcreteValues(vals({ unit: 'ft' }))).toEqual({ ok: true });
    expect(validateConcreteValues(vals({ unit: 'm' }))).toEqual({ ok: true });
  });

  it('waste: empty valid; 0 valid; positive valid; negative and non-finite invalid; no maximum', () => {
    expect(validateConcreteValues(vals({ wastePct: '' }))).toEqual({ ok: true });
    expect(validateConcreteValues(vals({ wastePct: '0' }))).toEqual({ ok: true });
    expect(validateConcreteValues(vals({ wastePct: '10' }))).toEqual({ ok: true });
    expect(validateConcreteValues(vals({ wastePct: '250' }))).toEqual({ ok: true });
    expect(errs(validateConcreteValues(vals({ wastePct: '-5' }))).wastePct).toBe('Enter a waste allowance of zero or more, or leave it blank.');
    expect(errs(validateConcreteValues(vals({ wastePct: 'NaN' }))).wastePct).toBe('Enter a waste allowance of zero or more, or leave it blank.');
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('concrete-form — compute', () => {
  it('ordinary feet slab carries volumes, bag counts and flags', () => {
    expect(computeConcrete(vals())).toMatchObject({ cubicFeet: 50, cubicYards: 1.852, bags80: 84, wasteProvided: false, unit: 'ft' });
  });

  it('metres slab converts', () => {
    expect(computeConcrete(vals({ length: '3', width: '3', depth: '0.15', unit: 'm' }))).toMatchObject({ cubicFeet: 47.675, cubicYards: 1.766, bags80: 80 });
  });

  it('a waste allowance scales the volume and marks provided', () => {
    const r = computeConcrete(vals({ wastePct: '10' }));
    expect(r).toMatchObject({ cubicFeet: 55, cubicYards: 2.037, bags80: 92, wasteProvided: true, wastePct: 10 });
  });

  it('an empty waste is 0% and not provided', () => {
    expect(computeConcrete(vals())).toMatchObject({ wasteProvided: false, wastePct: 0 });
  });

  it('preserves the pure formula output exactly (delegation, field remap)', () => {
    for (const c of [vals(), vals({ unit: 'm', length: '3', width: '3', depth: '0.15', wastePct: '5' })]) {
      const r = computeConcrete(c);
      const pure = calculateConcrete({ length: Number(c.length), width: Number(c.width), depth: Number(c.depth), unit: c.unit, wastePct: c.wastePct.trim() === '' ? 0 : Number(c.wastePct) });
      expect(r.cubicFeet).toBe(pure.cubicFeet);
      expect(r.cubicYards).toBe(pure.cubicYards);
      expect(r.bags40).toBe(pure.bags40lb);
      expect(r.bags80).toBe(pure.bags80lb);
    }
  });

  it('the validated domain is finite/≥0 with whole bag counts', () => {
    for (const c of [vals(), vals({ wastePct: '12' }), vals({ unit: 'm', length: '2.5', width: '2', depth: '0.1' })]) {
      const r = computeConcrete(c);
      expect(isConcreteResultUsable(r)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Result guard                                                        */
/* ------------------------------------------------------------------ */

describe('concrete-form — resultValue guard', () => {
  it('returns dominant cubic yards for a usable result', () => {
    expect(concreteBinding.resultValue(result({ cubicYards: 2.037 }))).toBe(2.037);
  });

  it('returns a NON-FINITE sentinel for a malformed output → default gate rejects it', () => {
    expect(Number.isNaN(concreteBinding.resultValue(result({ cubicFeet: Infinity })))).toBe(true);
    expect(Number.isNaN(concreteBinding.resultValue(result({ bags80: Infinity })))).toBe(true);
    expect(Number.isNaN(concreteBinding.resultValue(result({ bags40: 1.5 })))).toBe(true); // fractional bag
  });

  it('does not implement isUsableResult (the guard lives in resultValue)', () => {
    expect(concreteBinding.isUsableResult).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('concrete-form — announcement + interpretation', () => {
  it('announces the dominant cubic yards only', () => {
    expect(describeConcreteResult(result({ cubicYards: 1.852 }))).toBe('You need approximately 1.852 cubic yards of concrete.');
  });

  it('interpretation states no waste when none / zero was entered', () => {
    expect(interpretConcrete(result({ cubicYards: 1.852, wasteProvided: false, wastePct: 0 }))).toBe(
      'You need approximately 1.852 cubic yards of concrete with no additional waste allowance.',
    );
    expect(interpretConcrete(result({ cubicYards: 1.852, wasteProvided: true, wastePct: 0 }))).toContain('no additional waste allowance');
  });

  it('interpretation states the allowance for a positive waste', () => {
    expect(interpretConcrete(result({ cubicYards: 2.037, wasteProvided: true, wastePct: 10 }))).toBe(
      'You need approximately 2.037 cubic yards of concrete including a 10% waste allowance.',
    );
  });
});

/* ------------------------------------------------------------------ */
/* Unit conversion                                                     */
/* ------------------------------------------------------------------ */

describe('concrete-form — convertDimension', () => {
  it('converts ft ↔ m preserving the physical length', () => {
    expect(convertDimension('3.048', 'm', 'ft')).toBe('10'); // 3.048 m = 10 ft
    expect(convertDimension('10', 'ft', 'm')).toBe('3.048'); // 10 ft = 3.048 m
  });

  it('leaves empty / non-positive / non-finite / same-unit untouched', () => {
    expect(convertDimension('', 'ft', 'm')).toBeNull();
    expect(convertDimension('0', 'ft', 'm')).toBeNull();
    expect(convertDimension('-3', 'ft', 'm')).toBeNull();
    expect(convertDimension('abc', 'ft', 'm')).toBeNull();
    expect(convertDimension('10', 'ft', 'ft')).toBeNull();
  });

  it('a ft → m → ft round trip returns the original', () => {
    const m = convertDimension('10', 'ft', 'm')!;
    expect(Number(convertDimension(m, 'm', 'ft'))).toBeCloseTo(10, 6);
  });

  it('convertValues converts length + width + depth, leaving waste unchanged', () => {
    const root = stubRoot({ length: '10', width: '10', depth: '0.5', unit: 'ft', wastePct: '10' });
    concreteBinding.convertValues!(root, 'ft', 'm');
    expect(concreteBinding.readValues(root)).toMatchObject({ length: '3.048', width: '3.048', depth: '0.1524', wastePct: '10' });
  });
});

/* ------------------------------------------------------------------ */
/* readValues + resetValues                                            */
/* ------------------------------------------------------------------ */

describe('concrete-form — readValues / resetValues', () => {
  it('reads all fields incl. the checked unit radio', () => {
    const root = stubRoot({ length: '3', width: '3', depth: '0.15', unit: 'm', wastePct: '5' });
    expect(concreteBinding.readValues(root)).toEqual({ length: '3', width: '3', depth: '0.15', unit: 'm', wastePct: '5' });
  });

  it('reset clears dimensions + waste and restores unit=ft', () => {
    const root = stubRoot({ length: '3', width: '3', depth: '0.15', unit: 'm', wastePct: '5' });
    concreteBinding.resetValues(root, 'personal');
    expect(concreteBinding.readValues(root)).toEqual({ length: '', width: '', depth: '', unit: 'ft', wastePct: '' });
  });
});
