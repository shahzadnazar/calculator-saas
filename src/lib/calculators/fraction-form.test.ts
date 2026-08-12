import { describe, it, expect } from 'vitest';
import {
  fractionBinding,
  validateFraction,
  computeFractionForm,
  completeFractionValue,
  presentFraction,
  describeFraction,
  readFractionValues,
  resetFractionValues,
  MSG,
  type FractionFormValues,
} from './fraction-form';

/**
 * Fraction binding tests (R17B1). The binding wraps the UNCHANGED computeFraction / simplify; these
 * pin the visitor-facing layer it adds — strict integer parsing, validation precedence, the
 * complete-result guard (a NaN sentinel; NO isUsableResult), presentation and Reset.
 */

const V = (o: Partial<FractionFormValues> = {}): FractionFormValues => ({
  an: '1',
  ad: '2',
  bn: '1',
  bd: '3',
  op: 'add',
  ...o,
});

const errs = (v: FractionFormValues) => {
  const r = validateFraction(v);
  return r.ok ? {} : (r.fieldErrors ?? {});
};
const value = (v: FractionFormValues) => completeFractionValue(computeFractionForm(v));

/* ---- contract ---- */

describe('fraction binding — contract', () => {
  it('exposes no isUsableResult; resultValue is the complete-result guard', () => {
    expect('isUsableResult' in fractionBinding).toBe(false);
    expect(fractionBinding.resultValue).toBe(completeFractionValue);
  });
});

/* ---- validation ---- */

describe('fraction binding — validation', () => {
  it('an all-empty form reports all four required errors', () => {
    expect(errs(V({ an: '', ad: '', bn: '', bd: '' }))).toEqual({
      an: MSG.numRequired,
      ad: MSG.denRequired,
      bn: MSG.numRequired,
      bd: MSG.denRequired,
    });
  });

  it('each field is independently required', () => {
    expect(errs(V({ an: '' })).an).toBe(MSG.numRequired);
    expect(errs(V({ ad: '' })).ad).toBe(MSG.denRequired);
    expect(errs(V({ bn: '' })).bn).toBe(MSG.numRequired);
    expect(errs(V({ bd: '' })).bd).toBe(MSG.denRequired);
  });

  it('malformed / decimal / non-finite / partial numbers are whole-number errors', () => {
    expect(errs(V({ an: 'abc' })).an).toBe(MSG.integer);
    expect(errs(V({ an: '1.5' })).an).toBe(MSG.integer);
    expect(errs(V({ ad: '2.0' })).ad).toBe(MSG.integer);
    expect(errs(V({ bn: '3/4' })).bn).toBe(MSG.integer);
    expect(errs(V({ bd: '1e3' })).bd).toBe(MSG.integer);
    expect(errs(V({ an: 'Infinity' })).an).toBe(MSG.integer);
  });

  it('negative numerators and denominators are valid', () => {
    expect(validateFraction(V({ an: '-1', bd: '-3' })).ok).toBe(true);
  });

  it('a zero numerator is valid for add/subtract/multiply', () => {
    expect(validateFraction(V({ an: '0' })).ok).toBe(true);
    expect(validateFraction(V({ bn: '0', op: 'multiply' })).ok).toBe(true);
  });

  it('a zero denominator is a denominator error', () => {
    expect(errs(V({ ad: '0' })).ad).toBe(MSG.denZero);
    expect(errs(V({ bd: '0' })).bd).toBe(MSG.denZero);
  });

  it('an unsupported operation is an operation error', () => {
    expect(errs(V({ op: 'power' })).op).toBe(MSG.opInvalid);
    expect(errs(V({ op: '' })).op).toBe(MSG.opInvalid);
  });

  it('division by a second fraction equal to zero is rejected on the second numerator', () => {
    expect(errs(V({ op: 'divide', bn: '0' })).bn).toBe(MSG.divZero);
    // the same zero second numerator is fine for the other operations
    expect(validateFraction(V({ op: 'add', bn: '0' })).ok).toBe(true);
    // a malformed second numerator keeps its own error, not divZero
    expect(errs(V({ op: 'divide', bn: '1.5' })).bn).toBe(MSG.integer);
  });

  it('all four operations validate with well-formed input', () => {
    for (const op of ['add', 'subtract', 'multiply', 'divide']) {
      expect(validateFraction(V({ op })).ok).toBe(true);
    }
  });
});

/* ---- computation + complete-result guard ---- */

describe('fraction binding — computation + guard', () => {
  it('adds and returns a finite sentinel (1/2 + 1/3 = 5/6)', () => {
    const c = computeFractionForm(V());
    expect(c.result.fraction).toEqual({ num: 5, den: 6 });
    expect(completeFractionValue(c)).toBeCloseTo(5 / 6, 12);
  });

  it('each operation reconciles through the guard', () => {
    expect(value(V({ an: '2', ad: '3', op: 'multiply', bn: '3', bd: '4' }))).toBeCloseTo(0.5, 12); // 1/2
    expect(value(V({ an: '1', ad: '2', op: 'subtract', bn: '3', bd: '4' }))).toBeCloseTo(-0.25, 12); // -1/4
    expect(value(V({ an: '1', ad: '2', op: 'divide', bn: '1', bd: '4' }))).toBe(2); // 2/1
  });

  it('a reducible result is accepted (2/4 + 2/4 = 1)', () => {
    const c = computeFractionForm(V({ an: '2', ad: '4', op: 'add', bn: '2', bd: '4' }));
    expect(c.result.fraction).toEqual({ num: 1, den: 1 });
    expect(completeFractionValue(c)).toBe(1);
  });

  it('an irreducible result is accepted (1/3 + 1/4 = 7/12)', () => {
    expect(value(V({ an: '1', ad: '3', op: 'add', bn: '1', bd: '4' }))).toBeCloseTo(7 / 12, 12);
  });

  it('a zero result is a valid finite 0 the default gate accepts (-1/2 + 1/2)', () => {
    const c = computeFractionForm(V({ an: '-1', ad: '2', op: 'add', bn: '1', bd: '2' }));
    expect(c.result.fraction).toEqual({ num: 0, den: 1 });
    expect(completeFractionValue(c)).toBe(0);
    expect(Number.isFinite(completeFractionValue(c))).toBe(true);
  });

  it('a negative and a whole-number result are valid', () => {
    expect(value(V({ an: '-3', ad: '4', op: 'add', bn: '0', bd: '1' }))).toBeCloseTo(-0.75, 12);
    expect(value(V({ an: '3', ad: '4', op: 'divide', bn: '3', bd: '4' }))).toBe(1);
  });

  it('an improper result is valid (7/2 + 0)', () => {
    const c = computeFractionForm(V({ an: '7', ad: '2', op: 'add', bn: '0', bd: '1' }));
    expect(c.result.fraction).toEqual({ num: 7, den: 2 });
    expect(c.result.mixed).toBe('3 1/2');
    expect(completeFractionValue(c)).toBeCloseTo(3.5, 12);
  });

  it('the guard rejects a zero denominator and a divide-by-zero-fraction (NaN, not a value)', () => {
    expect(Number.isNaN(value(V({ ad: '0' })))).toBe(true);
    expect(Number.isNaN(value(V({ op: 'divide', bn: '0', bd: '5' })))).toBe(true);
  });

  it('the guard rejects a non-integer input path', () => {
    expect(Number.isNaN(value(V({ an: '1.5' })))).toBe(true);
  });

  it('the guard rejects a tampered / non-reduced result object', () => {
    const good = computeFractionForm(V());
    // den not sign-normalised
    expect(Number.isNaN(completeFractionValue({ ...good, result: { ...good.result, fraction: { num: -5, den: -6 } } }))).toBe(true);
    // not in lowest terms (simplify idempotence fails)
    expect(Number.isNaN(completeFractionValue({ ...good, result: { ...good.result, fraction: { num: 10, den: 12 } } }))).toBe(true);
    // fraction that does not reconcile with a recompute of the inputs
    expect(Number.isNaN(completeFractionValue({ ...good, result: { ...good.result, fraction: { num: 1, den: 4 } } }))).toBe(true);
    // decimal that does not match num/den
    expect(Number.isNaN(completeFractionValue({ ...good, result: { ...good.result, decimal: 0.99 } }))).toBe(true);
  });
});

/* ---- presentation ---- */

describe('fraction binding — presentation + announcement', () => {
  const compute = (o: Partial<FractionFormValues>) => computeFractionForm(V(o));

  it('a proper fraction shows the fraction, hides the redundant mixed row', () => {
    const p = presentFraction(compute({})); // 5/6
    expect(p.primary).toBe('5/6');
    expect(p.showMixed).toBe(false); // mixed "5/6" === fraction → omitted
    expect(p.decimal).toBe('0.8333');
    expect(p.interpretation).toBe('This is 1/2 + 1/3, reduced to lowest terms.');
  });

  it('an improper fraction shows a distinct mixed number', () => {
    const p = presentFraction(compute({ an: '7', ad: '2', op: 'add', bn: '0', bd: '1' }));
    expect(p.primary).toBe('7/2');
    expect(p.showMixed).toBe(true);
    expect(p.mixed).toBe('3 1/2');
  });

  it('a whole-number result shows n/1 primary and the whole "n" as the mixed/announced form', () => {
    const c = compute({ an: '1', ad: '2', op: 'divide', bn: '1', bd: '4' }); // 2/1
    const p = presentFraction(c);
    expect(p.primary).toBe('2/1');
    expect(p.showMixed).toBe(true);
    expect(p.mixed).toBe('2');
    expect(p.a11y).toBe('2');
    expect(describeFraction(c)).toBe('Result: 2.');
  });

  it('announces a proper fraction and a zero result in the source-confirmed form', () => {
    expect(describeFraction(compute({}))).toBe('Result: 5/6.');
    expect(describeFraction(compute({ an: '-1', ad: '2', op: 'add', bn: '1', bd: '2' }))).toBe('Result: 0.');
  });
});

/* ---- readValues / resetValues (mock DOM) ---- */

function mockRoot(values: Record<string, string>): HTMLElement {
  const store: Record<string, { value: string }> = {};
  for (const [k, v] of Object.entries(values)) store[k] = { value: v };
  return {
    querySelector(sel: string) {
      const m = sel.match(/\[name="([^"]+)"\]/);
      return m ? (store[m[1]] ?? null) : null;
    },
  } as unknown as HTMLElement;
}

describe('fraction binding — readValues / resetValues', () => {
  it('reads the four fields and the operation', () => {
    const root = mockRoot({ an: '5', ad: '8', bn: '1', bd: '4', op: 'multiply' });
    expect(readFractionValues(root)).toEqual({ an: '5', ad: '8', bn: '1', bd: '4', op: 'multiply' });
  });

  it('reset clears the four fields and restores the neutral (add) operation', () => {
    const root = mockRoot({ an: '5', ad: '8', bn: '1', bd: '4', op: 'divide' });
    resetFractionValues(root, 'all');
    expect(readFractionValues(root)).toEqual({ an: '', ad: '', bn: '', bd: '', op: 'add' });
  });
});
