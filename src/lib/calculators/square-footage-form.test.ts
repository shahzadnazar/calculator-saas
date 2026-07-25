import { describe, it, expect } from 'vitest';
import {
  validateSquareFootageValues,
  computeSquareFootage,
  describeSquareFootageResult,
  interpretSquareFootage,
  isSquareFootageResultUsable,
  convertDimension,
  spokenArea,
  squareFootageBinding,
  type SquareFootageValues,
  type SquareFootageComputed,
} from './square-footage-form';
import { calculateSquareFootage } from './square-footage';

const vals = (over: Partial<SquareFootageValues> = {}): SquareFootageValues => ({
  length: '10',
  width: '12',
  unit: 'ft',
  quantity: '1',
  pricePerSqFt: '',
  ...over,
});

const errs = (r: ReturnType<typeof validateSquareFootageValues>) =>
  (r as { fieldErrors: Record<string, string> }).fieldErrors;

const result = (over: Partial<SquareFootageComputed> = {}): SquareFootageComputed => ({
  areaSqFt: 120,
  totalSqFt: 120,
  totalSqM: 11.15,
  totalSqYd: 13.33,
  cost: 0,
  quantity: 1,
  pricePerSqFt: 0,
  priceProvided: false,
  unit: 'ft',
  ...over,
});

function stubRoot(v: Record<string, string>) {
  const inputs: Record<string, { value: string }> = {};
  for (const [k, val] of Object.entries(v)) inputs[k] = { value: val };
  return {
    querySelector(sel: string) {
      const m = sel.match(/\[name="(.+?)"\]/);
      return m ? (inputs[m[1]] ?? null) : null;
    },
  } as unknown as HTMLElement;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('square-footage-form — validation', () => {
  it('accepts an ordinary calculation (price optional, left blank)', () => {
    expect(validateSquareFootageValues(vals())).toEqual({ ok: true });
  });

  it('empty length/width are invalid (only neutral defaults present)', () => {
    const e = errs(validateSquareFootageValues(vals({ length: '', width: '' })));
    expect(e.length).toBe('Enter a length greater than zero.');
    expect(e.width).toBe('Enter a width greater than zero.');
  });

  it('length/width: > 0 required — zero, negative and non-finite rejected', () => {
    expect(errs(validateSquareFootageValues(vals({ length: '0' }))).length).toBe('Enter a length greater than zero.');
    expect(errs(validateSquareFootageValues(vals({ width: '-4' }))).width).toBe('Enter a width greater than zero.');
    expect(errs(validateSquareFootageValues(vals({ length: 'Infinity' }))).length).toBe('Enter a length greater than zero.');
  });

  it('every supported unit is accepted', () => {
    for (const unit of ['ft', 'in', 'yd', 'm'] as const) expect(validateSquareFootageValues(vals({ unit }))).toEqual({ ok: true });
  });

  it('quantity: whole ≥ 1 — zero, fractional, negative and non-finite rejected', () => {
    expect(validateSquareFootageValues(vals({ quantity: '1' }))).toEqual({ ok: true });
    expect(validateSquareFootageValues(vals({ quantity: '3' }))).toEqual({ ok: true });
    for (const q of ['0', '2.5', '-1', 'NaN']) {
      expect(errs(validateSquareFootageValues(vals({ quantity: q }))).quantity).toBe('Enter a whole number of at least 1.');
    }
  });

  it('price: empty valid; 0 valid; positive valid; negative and non-finite invalid', () => {
    expect(validateSquareFootageValues(vals({ pricePerSqFt: '' }))).toEqual({ ok: true });
    expect(validateSquareFootageValues(vals({ pricePerSqFt: '0' }))).toEqual({ ok: true });
    expect(validateSquareFootageValues(vals({ pricePerSqFt: '5.5' }))).toEqual({ ok: true });
    expect(errs(validateSquareFootageValues(vals({ pricePerSqFt: '-1' }))).pricePerSqFt).toBe('Enter a price of zero or more, or leave it blank.');
    expect(errs(validateSquareFootageValues(vals({ pricePerSqFt: 'Infinity' }))).pricePerSqFt).toBe('Enter a price of zero or more, or leave it blank.');
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('square-footage-form — compute', () => {
  it('ordinary feet calculation carries the outputs, quantity and price flags', () => {
    expect(computeSquareFootage(vals())).toMatchObject({ areaSqFt: 120, totalSqFt: 120, quantity: 1, priceProvided: false, unit: 'ft' });
  });

  it('every input unit computes (inches / yards / metres)', () => {
    expect(computeSquareFootage(vals({ length: '120', width: '144', unit: 'in' })).totalSqFt).toBeCloseTo(120, 6);
    expect(computeSquareFootage(vals({ length: '3.3333333', width: '4', unit: 'yd' })).totalSqFt).toBeCloseTo(120, 3);
    expect(computeSquareFootage(vals({ length: '3.048', width: '3.6576', unit: 'm' })).totalSqFt).toBeCloseTo(120, 6);
  });

  it('multiple quantity multiplies; price marks provided and gives a cost', () => {
    const r = computeSquareFootage(vals({ quantity: '2', pricePerSqFt: '5' }));
    expect(r.totalSqFt).toBe(240);
    expect(r.priceProvided).toBe(true);
    expect(r.cost).toBe(1200);
  });

  it('an entered price of 0 is provided (cost row will show $0.00)', () => {
    const r = computeSquareFootage(vals({ pricePerSqFt: '0' }));
    expect(r.priceProvided).toBe(true);
    expect(r.cost).toBe(0);
  });

  it('preserves the pure formula output exactly (delegation)', () => {
    for (const c of [vals(), vals({ unit: 'm', quantity: '2', pricePerSqFt: '8' })]) {
      const r = computeSquareFootage(c);
      const pure = calculateSquareFootage({ length: Number(c.length), width: Number(c.width), unit: c.unit, quantity: Number(c.quantity), pricePerSqFt: c.pricePerSqFt.trim() === '' ? 0 : Number(c.pricePerSqFt) });
      expect(r.totalSqFt).toBe(pure.totalSqFt);
      expect(r.totalSqM).toBe(pure.totalSqM);
      expect(r.cost).toBe(pure.cost);
    }
  });

  it('output relationships and finiteness hold across the validated domain', () => {
    for (const c of [vals(), vals({ quantity: '3', pricePerSqFt: '4.2' }), vals({ unit: 'm', length: '5', width: '4' })]) {
      const r = computeSquareFootage(c);
      expect(r.totalSqM).toBeCloseTo(r.totalSqFt / 10.7639104, 9);
      expect(r.totalSqYd).toBeCloseTo(r.totalSqFt / 9, 9);
      expect(r.totalSqFt).toBeCloseTo(r.areaSqFt * r.quantity, 9);
      if (r.priceProvided) expect(r.cost).toBeCloseTo(r.totalSqFt * r.pricePerSqFt, 9);
      expect(isSquareFootageResultUsable(r)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Result guard (default finite gate via resultValue; no isUsableResult) */
/* ------------------------------------------------------------------ */

describe('square-footage-form — resultValue guard', () => {
  it('returns the dominant total sq ft for a usable result', () => {
    expect(squareFootageBinding.resultValue(result({ totalSqFt: 240 }))).toBe(240);
  });

  it('returns a NON-FINITE sentinel for a malformed output → default gate rejects it', () => {
    expect(Number.isNaN(squareFootageBinding.resultValue(result({ totalSqFt: Infinity })))).toBe(true);
    expect(Number.isNaN(squareFootageBinding.resultValue(result({ totalSqM: NaN })))).toBe(true);
    expect(Number.isNaN(squareFootageBinding.resultValue(result({ priceProvided: true, cost: NaN })))).toBe(true);
    // A NaN cost is ignored when no price was provided (cost isn't rendered).
    expect(squareFootageBinding.resultValue(result({ priceProvided: false, cost: NaN, totalSqFt: 120 }))).toBe(120);
  });

  it('does not implement isUsableResult (the guard lives in resultValue)', () => {
    expect(squareFootageBinding.isUsableResult).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('square-footage-form — announcement + interpretation', () => {
  it('announces the dominant total area only (singular vs multi-section)', () => {
    expect(describeSquareFootageResult(result({ totalSqFt: 120, quantity: 1 }))).toBe('The total area is 120 square feet.');
    expect(describeSquareFootageResult(result({ totalSqFt: 360, quantity: 3 }))).toBe('The total area across 3 sections is 360 square feet.');
  });

  it('interpretation: single area', () => {
    expect(interpretSquareFootage(result({ totalSqFt: 120, quantity: 1 }))).toBe('The area is 120 square feet.');
  });

  it('interpretation: multi-section states each area + the total', () => {
    expect(interpretSquareFootage(result({ areaSqFt: 120, totalSqFt: 360, quantity: 3 }))).toBe(
      'Each area is 120 square feet. Across 3 identical areas, the total is 360 square feet.',
    );
  });

  it('interpretation: appends the estimated cost when a price was provided', () => {
    const s = interpretSquareFootage(result({ totalSqFt: 360, quantity: 3, areaSqFt: 120, priceProvided: true, pricePerSqFt: 5, cost: 1800 }));
    expect(s).toContain('At $5.00 per square foot, the estimated cost is $1,800.00.');
  });

  it('spokenArea reads square feet', () => {
    expect(spokenArea(120)).toBe('120 square feet');
    expect(spokenArea(1200)).toBe('1,200 square feet');
  });
});

/* ------------------------------------------------------------------ */
/* Unit conversion                                                     */
/* ------------------------------------------------------------------ */

describe('square-footage-form — convertDimension', () => {
  it('converts between every unit, preserving the physical length', () => {
    expect(convertDimension('12', 'ft', 'in')).toBe('144');
    expect(convertDimension('12', 'ft', 'yd')).toBe('4');
    expect(convertDimension('12', 'ft', 'm')).toBe('3.6576');
    expect(convertDimension('144', 'in', 'ft')).toBe('12');
    expect(convertDimension('4', 'yd', 'ft')).toBe('12');
    expect(convertDimension('3.6576', 'm', 'ft')).toBe('12');
  });

  it('leaves empty, non-positive, non-finite and same-unit values untouched (null)', () => {
    expect(convertDimension('', 'ft', 'm')).toBeNull();
    expect(convertDimension('0', 'ft', 'm')).toBeNull();
    expect(convertDimension('-5', 'ft', 'm')).toBeNull();
    expect(convertDimension('abc', 'ft', 'm')).toBeNull();
    expect(convertDimension('12', 'ft', 'ft')).toBeNull();
  });

  it('a full ft → in → yd → m → ft round trip returns the original', () => {
    let v = '12';
    v = convertDimension(v, 'ft', 'in')!;
    v = convertDimension(v, 'in', 'yd')!;
    v = convertDimension(v, 'yd', 'm')!;
    v = convertDimension(v, 'm', 'ft')!;
    expect(Number(v)).toBeCloseTo(12, 6);
  });

  it('convertValues converts length + width and leaves quantity + price unchanged', () => {
    const root = stubRoot({ length: '12', width: '6', unit: 'ft', quantity: '2', pricePerSqFt: '5' });
    squareFootageBinding.convertValues!(root, 'ft', 'in');
    expect(squareFootageBinding.readValues(root)).toMatchObject({ length: '144', width: '72', quantity: '2', pricePerSqFt: '5' });
  });

  it('convertValues leaves an empty dimension empty', () => {
    const root = stubRoot({ length: '12', width: '', unit: 'ft', quantity: '1', pricePerSqFt: '' });
    squareFootageBinding.convertValues!(root, 'ft', 'yd');
    expect(squareFootageBinding.readValues(root)).toMatchObject({ length: '4', width: '' });
  });
});

/* ------------------------------------------------------------------ */
/* readValues + resetValues (DOM-free stub)                            */
/* ------------------------------------------------------------------ */

describe('square-footage-form — readValues / resetValues', () => {
  it('reads all fields incl. the unit select', () => {
    const root = stubRoot({ length: '10', width: '12', unit: 'yd', quantity: '2', pricePerSqFt: '5' });
    expect(squareFootageBinding.readValues(root)).toEqual({ length: '10', width: '12', unit: 'yd', quantity: '2', pricePerSqFt: '5' });
  });

  it('reset clears dimensions + price, restores unit=ft and quantity=1', () => {
    const root = stubRoot({ length: '10', width: '12', unit: 'm', quantity: '4', pricePerSqFt: '5' });
    squareFootageBinding.resetValues(root, 'personal');
    expect(squareFootageBinding.readValues(root)).toEqual({ length: '', width: '', unit: 'ft', quantity: '1', pricePerSqFt: '' });
  });
});
