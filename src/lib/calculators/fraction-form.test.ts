import { describe, it, expect } from 'vitest';
import {
  FRACTION_SPECS,
  getFractionSpec,
  parseInteger,
  parseMixed,
  parseDecimal,
  validateFraction,
  solveFraction,
  computeFraction,
  completeFractionValue,
  describeFraction,
  fractionExampleValues,
  MSG,
  type FractionKey,
  type FractionValues,
} from './fraction-form';
import type { StepLine, FracToken } from './fraction';
import type { ValidationResult } from '@lib/result/form-runtime';

/** The field errors of a failed validation, so a test can name the field it means. */
const errors = (r: ValidationResult): Record<string, string> => (r.ok ? {} : (r.fieldErrors ?? {}));

const spec = (key: FractionKey) => getFractionSpec(key);

const token = (t: FracToken): string =>
  t.t === 'text' ? t.v : t.t === 'frac' ? `${t.n}/${t.d}` : `${t.w} ${t.n}/${t.d}`;
const line = (l: StepLine | null): string =>
  l ? `${l.lead ? `${l.lead} ` : ''}${l.tokens.map(token).join(' ')}` : '';
const render = (lines: StepLine[]): string[] => lines.map((l) => line(l));

const solve = (key: FractionKey, values: FractionValues) => solveFraction(spec(key), values);

/* ------------------------------------------------------------------ */

describe('the six calculators', () => {
  it('are the reference six, separate and in order', () => {
    expect(FRACTION_SPECS.map((s) => s.key)).toEqual([
      'fraction',
      'mixed',
      'simplify',
      'decimal2fraction',
      'fraction2decimal',
      'bignumber',
    ]);
  });

  it('names every one of them as the reference names it', () => {
    expect(FRACTION_SPECS.map((s) => s.title)).toEqual([
      'Fraction Calculator',
      'Mixed Numbers Calculator',
      'Simplify Fractions Calculator',
      'Decimal to Fraction Calculator',
      'Fraction to Decimal Calculator',
      'Big Number Fraction Calculator',
    ]);
  });

  it('declares an example whose fields are exactly its own', () => {
    for (const s of FRACTION_SPECS) {
      const expected = [...s.fields, ...(s.hasOp ? ['op'] : [])].sort();
      expect(Object.keys(fractionExampleValues(s)).sort()).toEqual(expected);
    }
  });
});

/* ---- Parsing ----------------------------------------------------- */

describe('parseInteger', () => {
  it('tells empty, invalid and valid apart', () => {
    expect(parseInteger('', false)).toBe('empty');
    expect(parseInteger('  ', false)).toBe('empty');
    expect(parseInteger('2.5', false)).toBe('invalid');
    expect(parseInteger('1e3', false)).toBe('invalid');
    expect(parseInteger('-', false)).toBe('invalid');
    expect(parseInteger('abc', false)).toBe('invalid');
    expect(parseInteger('-12', false)).toBe(-12n);
    expect(parseInteger('+12', false)).toBe(12n);
  });

  it('sends long numbers to the big-number calculator, but never from it', () => {
    const long = '1234567890123456789';
    expect(parseInteger(long, false)).toBe('toolong');
    expect(parseInteger(long, true)).toBe(1234567890123456789n);
  });
});

describe('parseMixed', () => {
  it('reads whole numbers, fractions and mixed numbers', () => {
    expect(parseMixed('3')).toEqual({ n: 3n, d: 1n });
    expect(parseMixed('3/4')).toEqual({ n: 3n, d: 4n });
    expect(parseMixed('2 3/4')).toEqual({ n: 11n, d: 4n });
    expect(parseMixed('-2 3/4')).toEqual({ n: -11n, d: 4n });
    expect(parseMixed('6/12')).toEqual({ n: 6n, d: 12n }); // as written; only the answer reduces
  });

  it('applies the sign to the whole value, not just the whole part', () => {
    expect(parseMixed('-3/4')).toEqual({ n: -3n, d: 4n });
  });

  it('rejects what is not a mixed number', () => {
    expect(parseMixed('')).toBe('empty');
    expect(parseMixed('2.5')).toBe('invalid');
    expect(parseMixed('2 3')).toBe('invalid');
    expect(parseMixed('3/4/5')).toBe('invalid');
    expect(parseMixed('2 3/0')).toBe('invalid');
  });
});

describe('parseDecimal', () => {
  it('keeps the digits the working quotes back', () => {
    expect(parseDecimal('1.375')).toEqual({
      text: '1.375',
      integerDigits: '1',
      decimalDigits: '375',
      value: { n: 11n, d: 8n },
    });
  });

  it('accepts a leading point and a bare integer', () => {
    expect(parseDecimal('.5')).toMatchObject({ value: { n: 1n, d: 2n } });
    expect(parseDecimal('4')).toMatchObject({ value: { n: 4n, d: 1n } });
  });

  it('rejects what is not a decimal', () => {
    expect(parseDecimal('')).toBe('empty');
    expect(parseDecimal('1/2')).toBe('invalid');
    expect(parseDecimal('1.2.3')).toBe('invalid');
    expect(parseDecimal('1e3')).toBe('invalid');
  });
});

/* ---- Validation -------------------------------------------------- */

describe('validation', () => {
  it('asks for what is missing, per field', () => {
    const r = validateFraction(spec('fraction'), { an: '', ad: '', bn: '2', bd: '3', op: 'add' });
    expect(r.ok).toBe(false);
    expect(errors(r)).toEqual({ an: MSG.numRequired, ad: MSG.denRequired });
  });

  it('rejects a zero denominator on the denominator itself', () => {
    const r = validateFraction(spec('fraction'), { an: '1', ad: '0', bn: '2', bd: '3', op: 'add' });
    expect(errors(r).ad).toBe(MSG.denZero);
  });

  it('rejects dividing by a fraction that equals zero', () => {
    const r = validateFraction(spec('fraction'), { an: '1', ad: '2', bn: '0', bd: '3', op: 'divide' });
    expect(errors(r).bn).toBe(MSG.divZero);
    // A zero numerator is perfectly fine for the other three operations.
    expect(validateFraction(spec('fraction'), { an: '1', ad: '2', bn: '0', bd: '3', op: 'add' }).ok).toBe(true);
  });

  it('rejects an unknown operation', () => {
    const r = validateFraction(spec('fraction'), { an: '1', ad: '2', bn: '1', bd: '3', op: 'power' });
    expect(errors(r).op).toBe(MSG.opInvalid);
  });

  it('treats the whole number as optional when simplifying', () => {
    expect(validateFraction(spec('simplify'), { whole: '', num: '6', den: '12' }).ok).toBe(true);
    const r = validateFraction(spec('simplify'), { whole: '', num: '', den: '12' });
    expect(errors(r).num).toBe(MSG.numRequired);
  });

  it('explains the mixed-number format rather than just refusing', () => {
    const r = validateFraction(spec('mixed'), { a: 'x', b: '1/2', op: 'add' });
    expect(errors(r).a).toBe(MSG.mixedFormat);
  });

  it('explains the decimal format', () => {
    const r = validateFraction(spec('decimal2fraction'), { value: '1/2' });
    expect(errors(r).value).toBe(MSG.decimalFormat);
  });

  it('points a too-long entry at the big-number calculator, which itself has no cap', () => {
    const long = '99999999999999999999';
    const r = validateFraction(spec('fraction'), { an: long, ad: '2', bn: '1', bd: '3', op: 'add' });
    expect(errors(r).an).toBe(MSG.tooLong);
    expect(validateFraction(spec('bignumber'), { an: long, ad: '2', bn: '1', bd: '3', op: 'add' }).ok).toBe(true);
  });
});

/* ---- The reference results -------------------------------------- */

describe('Fraction Calculator — the reference result for 2/7 + 3/8', () => {
  const s = solve('fraction', { an: '2', ad: '7', bn: '3', bd: '8', op: 'add' });

  it('writes the equation the reference writes', () => {
    expect(line(s.equation)).toBe('2/7 + 3/8 = 37/56');
  });

  it('prints the decimal to fourteen significant figures', () => {
    expect(s.decimal).toBe('0.66071428571429');
  });

  it('shows the reference working', () => {
    expect(render(s.steps)).toEqual([
      '2/7 + 3/8',
      '= 2 × 8/7 × 8 + 3 × 7/8 × 7',
      '= 16/56 + 21/56',
      '= 16+21/56',
      '= 37/56',
    ]);
  });

  it('illustrates the equation with one pie group per term', () => {
    expect(s.pies.map((g) => g.lead)).toEqual([undefined, '+', '=']);
    expect(s.pies[2].circles).toEqual([{ slices: 56, filled: 37 }]);
  });

  it('appends the mixed reading when the answer is improper', () => {
    const improper = solve('fraction', { an: '3', ad: '4', bn: '2', bd: '3', op: 'divide' });
    expect(line(improper.equation)).toBe('3/4 ÷ 2/3 = 9/8 = 1 1/8');
    expect(improper.answer).toBe('9/8 = 1 1/8');
  });

  it('quotes the fractions back as they were entered, and reduces only the answer', () => {
    const s2 = solve('fraction', { an: '2', ad: '4', bn: '1', bd: '2', op: 'add' });
    expect(line(s2.equation)).toBe('2/4 + 1/2 = 1');
    expect(render(s2.steps)[0]).toBe('2/4 + 1/2');
    // A zero numerator is still a fraction on the page, not a bare 0.
    expect(line(solve('fraction', { an: '1', ad: '2', bn: '0', bd: '3', op: 'add' }).equation)).toBe(
      '1/2 + 0/3 = 1/2',
    );
  });

  it('draws no pies for a negative answer rather than a misleading one', () => {
    expect(solve('fraction', { an: '1', ad: '4', bn: '1', bd: '2', op: 'subtract' }).pies).toEqual([]);
  });

  it('draws no pies when the slices would be unreadable', () => {
    expect(solve('fraction', { an: '1', ad: '997', bn: '1', bd: '2', op: 'add' }).pies).toEqual([]);
  });
});

describe('Mixed Numbers Calculator — the reference result for -2 3/4 + 3 5/7', () => {
  const s = solve('mixed', { a: '-2 3/4', b: '3 5/7', op: 'add' });

  it('writes the equation in the notation the visitor typed', () => {
    expect(line(s.equation)).toBe('-2 3/4 + 3 5/7 = 27/28');
  });

  it('prints the reference decimal', () => {
    expect(s.decimal).toBe('0.96428571428571');
  });

  it('converts to improper fractions first, then works as the fraction calculator does', () => {
    expect(render(s.steps)).toEqual([
      '-2 3/4 + 3 5/7',
      '= -11/4 + 26/7',
      '= -11 × 7/4 × 7 + 26 × 4/7 × 4',
      '= -77/28 + 104/28',
      '= -77+104/28',
      '= 27/28',
    ]);
  });

  it('skips the conversion line when nothing needed converting', () => {
    const proper = solve('mixed', { a: '1/2', b: '1/3', op: 'add' });
    expect(render(proper.steps)[0]).toBe('1/2 + 1/3');
    expect(render(proper.steps)[1]).toBe('= 1 × 3/2 × 3 + 1 × 2/3 × 2');
  });
});

describe('Simplify Fractions Calculator — the reference result for 2 21/98', () => {
  const s = solve('simplify', { whole: '2', num: '21', den: '98' });

  it('writes the equation the reference writes', () => {
    expect(line(s.equation)).toBe('2 21/98 = 31/14 = 2 3/14');
  });

  it('prints the reference decimal', () => {
    expect(s.decimal).toBe('2.2142857142857');
  });

  it('shows the reference working', () => {
    expect(render(s.steps)).toEqual([
      '2 21/98',
      '= 217/98',
      '= 217 ÷ 7/98 ÷ 7',
      '= 31/14',
      '= 2 3/14',
    ]);
  });

  it('simplifies a plain fraction when there is no whole part', () => {
    const plain = solve('simplify', { whole: '', num: '6', den: '12' });
    expect(line(plain.equation)).toBe('6/12 = 1/2');
  });
});

describe('Decimal to Fraction Calculator — the reference result for 1.375', () => {
  const s = solve('decimal2fraction', { value: '1.375' });

  it('writes the equation the reference writes', () => {
    expect(line(s.equation)).toBe('1.375 = 11/8 = 1 3/8');
  });

  it('shows the reference working', () => {
    expect(render(s.steps)).toEqual([
      '1.375',
      '= 1.375 × 1000/1 × 1000',
      '= 1375/1000',
      '= 1375 ÷ 125/1000 ÷ 125',
      '= 11/8',
      '= 1 3/8',
    ]);
  });

  it('does not repeat the decimal it was given as a "result in decimals"', () => {
    expect(s.decimal).toBe('');
  });
});

describe('Fraction to Decimal Calculator — the reference result for 2/7', () => {
  const s = solve('fraction2decimal', { num: '2', den: '7' });

  it('writes the equation the reference writes', () => {
    expect(line(s.equation)).toBe('2/7 = 0.28571428571429');
  });

  it('shows no working, because there is none to show', () => {
    expect(s.steps).toEqual([]);
    expect(s.decimal).toBe('');
  });
});

describe('Big Number Fraction Calculator — the reference result', () => {
  const s = solve('bignumber', {
    an: '1234',
    ad: '748892928829',
    bn: '33434421132232234333',
    bd: '8877277388288288288',
    op: 'add',
  });

  it('reproduces the reference answer digit for digit', () => {
    expect(render(s.steps)).toEqual([
      '1234/748892928829 + 33434421132232234333/8877277388288288288',
      '= 3 5094410786346152324392512269193/6648130263342672078999418254752',
    ]);
  });

  it('leaves the headline to the working, and prints no decimal or pies', () => {
    expect(s.equation).toBe(null);
    expect(s.decimal).toBe('');
    expect(s.pies).toEqual([]);
  });
});

/* ---- The complete-result guard ----------------------------------- */

describe('completeFractionValue', () => {
  it('accepts a result that reconciles with a fresh solve', () => {
    const values = { an: '2', ad: '7', bn: '3', bd: '8', op: 'add' };
    expect(completeFractionValue(spec('fraction'), computeFraction(spec('fraction'), values))).toBe(1);
  });

  it('accepts a legitimate zero answer', () => {
    const values = { an: '1', ad: '2', bn: '1', bd: '2', op: 'subtract' };
    const computed = computeFraction(spec('fraction'), values);
    expect(computed.solution.answer).toBe('0');
    expect(completeFractionValue(spec('fraction'), computed)).toBe(1);
  });

  it('rejects an invalid entry', () => {
    const computed = computeFraction(spec('fraction'), { an: '1', ad: '0', bn: '1', bd: '2', op: 'add' });
    expect(completeFractionValue(spec('fraction'), computed)).toBeNaN();
  });

  it('rejects a result whose values no longer produce it', () => {
    const computed = computeFraction(spec('fraction'), { an: '2', ad: '7', bn: '3', bd: '8', op: 'add' });
    const tampered = { ...computed, values: { ...computed.values, an: '5' } };
    expect(completeFractionValue(spec('fraction'), tampered)).toBeNaN();
  });

  it('rejects a result from another calculator', () => {
    const computed = computeFraction(spec('fraction'), { an: '2', ad: '7', bn: '3', bd: '8', op: 'add' });
    expect(completeFractionValue(spec('simplify'), computed)).toBeNaN();
  });

  it('gates on reconciliation, not on a number the answer does not have', () => {
    // The big-number answer has no representable decimal, and is still an exact, correct result.
    const computed = computeFraction(spec('bignumber'), fractionExampleValues(spec('bignumber')));
    expect(completeFractionValue(spec('bignumber'), computed)).toBe(1);
  });
});

describe('announcements', () => {
  it('says the answer once, without formula internals', () => {
    const computed = computeFraction(spec('fraction'), { an: '2', ad: '7', bn: '3', bd: '8', op: 'add' });
    expect(describeFraction(spec('fraction'), computed)).toBe('Fraction Calculator: 2/7 + 3/8 = 37/56');
  });

  it('says nothing at all when there is no result', () => {
    const computed = computeFraction(spec('fraction'), { an: '', ad: '', bn: '', bd: '', op: 'add' });
    expect(describeFraction(spec('fraction'), computed)).toBe('');
  });
});

describe('every example solves', () => {
  it('produces a complete result for each of the six', () => {
    for (const s of FRACTION_SPECS) {
      const computed = computeFraction(s, fractionExampleValues(s));
      expect(completeFractionValue(s, computed), s.key).toBe(1);
      expect(computed.solution.answer).not.toMatch(/NaN|Infinity|undefined|—/);
    }
  });
});
