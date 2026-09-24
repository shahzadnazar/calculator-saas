import { describe, it, expect } from 'vitest';
import {
  frac,
  reduce,
  gcdBig,
  applyOp,
  applyOpRaw,
  decimalString,
  fractionText,
  mixedText,
  mixedParts,
  isImproper,
  combineSteps,
  simplifySteps,
  decimalSteps,
  OP_SYMBOL,
  type StepLine,
  type FracToken,
} from './fraction';

/** Steps flattened to text, so a whole working can be asserted line by line. */
const token = (t: FracToken): string =>
  t.t === 'text' ? t.v : t.t === 'frac' ? `${t.n}/${t.d}` : `${t.w} ${t.n}/${t.d}`;
const line = (l: StepLine): string => `${l.lead ? `${l.lead} ` : ''}${l.tokens.map(token).join(' ')}`;
const render = (lines: StepLine[]): string[] => lines.map(line);

describe('gcdBig / reduce', () => {
  it('reduces to lowest terms', () => {
    expect(reduce({ n: 6n, d: 12n })).toEqual({ n: 1n, d: 2n });
    expect(reduce({ n: 217n, d: 98n })).toEqual({ n: 31n, d: 14n });
  });

  it('carries the sign on the numerator', () => {
    expect(reduce({ n: 3n, d: -4n })).toEqual({ n: -3n, d: 4n });
    expect(reduce({ n: -3n, d: -4n })).toEqual({ n: 3n, d: 4n });
  });

  it('reduces zero to 0/1 and never divides by a zero gcd', () => {
    expect(reduce({ n: 0n, d: 5n })).toEqual({ n: 0n, d: 1n });
    expect(gcdBig(0n, 0n)).toBe(1n);
  });

  it('reports a zero denominator rather than producing a fraction', () => {
    expect(reduce({ n: 1n, d: 0n })).toEqual({ n: 0n, d: 0n });
    expect(fractionText({ n: 0n, d: 0n })).toBe('—');
  });
});

describe('the four operations', () => {
  it('adds, subtracts, multiplies and divides', () => {
    expect(applyOp(frac(2n, 7n), 'add', frac(3n, 8n))).toEqual({ n: 37n, d: 56n });
    expect(applyOp(frac(3n, 4n), 'subtract', frac(1n, 6n))).toEqual({ n: 7n, d: 12n });
    expect(applyOp(frac(2n, 3n), 'multiply', frac(3n, 4n))).toEqual({ n: 1n, d: 2n });
    expect(applyOp(frac(3n, 4n), 'divide', frac(2n, 3n))).toEqual({ n: 9n, d: 8n });
  });

  it('keeps a shared denominator instead of inventing a bigger one', () => {
    expect(applyOpRaw(frac(1n, 8n), 'add', frac(3n, 8n))).toEqual({ n: 4n, d: 8n });
  });

  it('handles negatives and a zero result', () => {
    expect(applyOp(frac(-1n, 2n), 'add', frac(1n, 2n))).toEqual({ n: 0n, d: 1n });
    expect(applyOp(frac(-11n, 4n), 'add', frac(26n, 7n))).toEqual({ n: 27n, d: 28n });
  });

  /**
   * The reason this engine is BigInt. The true denominator here is 999999830000006800, past
   * Number.MAX_SAFE_INTEGER, and floating-point arithmetic returned a plausible wrong answer.
   */
  it('is exact past Number.MAX_SAFE_INTEGER', () => {
    const sum = applyOp(frac(1n, 999999937n), 'add', frac(1n, 999999893n));
    expect(sum).toEqual({ n: 1999999830n, d: 999999830000006741n });
    expect(sum.d).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
  });

  /** The reference's own big-number example, digit for digit. */
  it('reproduces the reference big-number sum', () => {
    const result = applyOp(frac(1234n, 748892928829n), 'add', frac(33434421132232234333n, 8877277388288288288n));
    expect(result.n.toString()).toBe('25038801576374168561390767033449');
    expect(result.d.toString()).toBe('6648130263342672078999418254752');
    expect(mixedText(result)).toBe('3 5094410786346152324392512269193/6648130263342672078999418254752');
  });
});

describe('text forms', () => {
  it('writes a whole number without a denominator', () => {
    expect(fractionText(frac(4n, 2n))).toBe('2');
    expect(fractionText(frac(37n, 56n))).toBe('37/56');
  });

  it('gives a mixed reading only when there is one to give', () => {
    expect(mixedText(frac(37n, 56n))).toBe('');
    expect(mixedText(frac(11n, 8n))).toBe('1 3/8');
    expect(mixedText(frac(-11n, 4n))).toBe('-2 3/4');
    expect(mixedText(frac(4n, 2n))).toBe(''); // a whole number already reads as itself
  });

  it('splits a mixed number into parts with the sign on the reading', () => {
    expect(mixedParts(frac(-11n, 4n))).toEqual({ negative: true, whole: 2n, n: 3n, d: 4n });
    expect(isImproper(frac(11n, 8n))).toBe(true);
    expect(isImproper(frac(3n, 8n))).toBe(false);
  });
});

describe('decimalString — fourteen significant figures, as the reference prints them', () => {
  it('matches the reference figures exactly', () => {
    expect(decimalString(frac(37n, 56n))).toBe('0.66071428571429');
    expect(decimalString(frac(27n, 28n))).toBe('0.96428571428571');
    expect(decimalString(frac(31n, 14n))).toBe('2.2142857142857');
    expect(decimalString(frac(2n, 7n))).toBe('0.28571428571429');
  });

  it('drops trailing zeros rather than padding to fourteen', () => {
    expect(decimalString(frac(1n, 2n))).toBe('0.5');
    expect(decimalString(frac(4n, 2n))).toBe('2');
    expect(decimalString(frac(0n, 5n))).toBe('0');
  });

  it('keeps fourteen figures for a value far below one', () => {
    expect(decimalString(frac(1n, 700000n))).toBe('0.0000014285714285714');
  });

  it('carries the sign', () => {
    expect(decimalString(frac(-1n, 8n))).toBe('-0.125');
  });

  it('stays exact for a fraction no float could hold', () => {
    expect(decimalString(frac(1n, 999999830000006741n))).toBe('0.00000000000000000100000017');
  });

  it('never renders a zero denominator as a number', () => {
    expect(decimalString({ n: 1n, d: 0n })).toBe('—');
  });
});

describe('combineSteps — the working the reference shows', () => {
  it('reproduces 2/7 + 3/8 line for line', () => {
    expect(render(combineSteps(frac(2n, 7n), 'add', frac(3n, 8n)))).toEqual([
      '2/7 + 3/8',
      '= 2 × 8/7 × 8 + 3 × 7/8 × 7',
      '= 16/56 + 21/56',
      '= 16+21/56',
      '= 37/56',
    ]);
  });

  it('reproduces the mixed-number sum after conversion', () => {
    expect(render(combineSteps(frac(-11n, 4n), 'add', frac(26n, 7n)))).toEqual([
      '-11/4 + 26/7',
      '= -11 × 7/4 × 7 + 26 × 4/7 × 4',
      '= -77/28 + 104/28',
      '= -77+104/28',
      '= 27/28',
    ]);
  });

  it('skips the common-denominator step when the denominators already match', () => {
    expect(render(combineSteps(frac(1n, 8n), 'add', frac(3n, 8n)))).toEqual([
      '1/8 + 3/8',
      '= 1+3/8',
      '= 4/8',
      '= 4 ÷ 4/8 ÷ 4',
      '= 1/2',
    ]);
  });

  it('multiplies straight across and then reduces', () => {
    expect(render(combineSteps(frac(2n, 3n), 'multiply', frac(3n, 4n)))).toEqual([
      '2/3 × 3/4',
      '= 2 × 3/3 × 4',
      '= 6/12',
      '= 6 ÷ 6/12 ÷ 6',
      '= 1/2',
    ]);
  });

  it('shows division as multiplication by the reciprocal, then the mixed reading', () => {
    expect(render(combineSteps(frac(3n, 4n), 'divide', frac(2n, 3n)))).toEqual([
      '3/4 ÷ 2/3',
      '= 3/4 × 3/2',
      '= 3 × 3/4 × 2',
      '= 9/8',
      '= 1 1/8',
    ]);
  });

  it('compacts the working for big numbers, as the reference does', () => {
    const steps = render(combineSteps(frac(1234n, 748892928829n), 'add', frac(33434421132232234333n, 8877277388288288288n), true));
    expect(steps).toEqual([
      '1234/748892928829 + 33434421132232234333/8877277388288288288',
      '= 3 5094410786346152324392512269193/6648130263342672078999418254752',
    ]);
  });

  it('uses the operation symbols the reference uses', () => {
    expect(OP_SYMBOL).toEqual({ add: '+', subtract: '−', multiply: '×', divide: '÷' });
  });
});

describe('simplifySteps — the working the reference shows', () => {
  it('reproduces 2 21/98 line for line', () => {
    expect(render(simplifySteps(2n, 21n, 98n))).toEqual([
      '2 21/98',
      '= 217/98',
      '= 217 ÷ 7/98 ÷ 7',
      '= 31/14',
      '= 2 3/14',
    ]);
  });

  it('starts from the fraction when there is no whole part', () => {
    expect(render(simplifySteps(0n, 6n, 12n))).toEqual(['6/12', '= 6 ÷ 6/12 ÷ 6', '= 1/2']);
  });

  it('says nothing more when the fraction is already in lowest terms', () => {
    expect(render(simplifySteps(0n, 3n, 8n))).toEqual(['3/8']);
  });

  it('keeps the sign on the whole reading', () => {
    expect(render(simplifySteps(-2n, 3n, 4n))).toEqual(['-2 3/4', '= -11/4', '= -2 3/4']);
  });
});

describe('decimalSteps — the working the reference shows', () => {
  it('reproduces 1.375 line for line', () => {
    expect(render(decimalSteps('1.375', '1', '375'))).toEqual([
      '1.375',
      '= 1.375 × 1000/1 × 1000',
      '= 1375/1000',
      '= 1375 ÷ 125/1000 ÷ 125',
      '= 11/8',
      '= 1 3/8',
    ]);
  });

  it('handles a whole number with no decimal part', () => {
    expect(render(decimalSteps('4', '4', ''))).toEqual(['4', '= 4/1']);
  });

  it('handles a negative decimal', () => {
    expect(render(decimalSteps('-0.25', '0', '25'))).toEqual([
      '-0.25',
      '= -0.25 × 100/1 × 100',
      '= -25/100',
      '= -25 ÷ 25/100 ÷ 25',
      '= -1/4',
    ]);
  });
});
