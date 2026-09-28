import { describe, it, expect } from 'vitest';
import {
  validateSd,
  computeSd,
  completeSdValue,
  describeSd,
  sdSteps,
  sdFormula,
  semLine,
  formatFigure,
  formatMargin,
  formatPercent,
  formatShare,
  firstInvalidToken,
  asMode,
  DEFAULT_MODE,
  MSG,
  SD_EXAMPLE_VALUES,
  type SdValues,
} from './standard-deviation-form';
import { standardDeviation } from './standard-deviation';

const DATA = '10, 12, 23, 23, 16, 23, 21, 16';
const values = (raw: string, mode = 'population'): SdValues => ({ raw, mode });
const errors = (v: SdValues) => {
  const r = validateSd(v);
  return r.ok ? {} : (r.fieldErrors ?? {});
};

/* ---- The three rounding rules ------------------------------------- */

describe('the reference uses three different rounding rules, and so do we', () => {
  it('gives a headline figure fourteen significant figures, trailing zeros dropped', () => {
    expect(formatFigure(4.898979485566356)).toBe('4.8989794855664');
    expect(formatFigure(1.7320508075688772)).toBe('1.7320508075689');
    expect(formatFigure(24)).toBe('24');
    expect(formatFigure(0)).toBe('0');
  });

  it('gives a margin of error three decimals, trailing zeros DROPPED', () => {
    expect(formatMargin(5.700180000000001)).toBe('5.7'); // not 5.700
    expect(formatMargin(7.650468)).toBe('7.65');
    expect(formatMargin(1.7320508075689)).toBe('1.732');
  });

  it('gives its percentage two decimals KEPT', () => {
    expect(formatPercent(42.5026)).toBe('42.50%'); // not 42.5%
    expect(formatPercent(9.6225)).toBe('9.62%');
  });

  it('gives a frequency share its trailing zeros dropped', () => {
    expect(formatShare(12.5)).toBe('12.5%');
    expect(formatShare(25)).toBe('25%');
    expect(formatShare((1 / 3) * 100)).toBe('33.3333%');
  });

  it('never puts a non-finite value on the page', () => {
    for (const format of [formatFigure, formatMargin, formatPercent, formatShare]) {
      expect(format(Number.NaN)).toMatch(/^—|—%$/);
      expect(format(Number.POSITIVE_INFINITY)).toMatch(/^—|—%$/);
    }
  });
});

/* ---- Validation ---------------------------------------------------- */

describe('validation', () => {
  it('asks for at least one number', () => {
    expect(errors(values('')).values).toBe(MSG.empty);
    expect(errors(values('   \n ')).values).toBe(MSG.empty);
  });

  it('names the first invalid token instead of silently dropping it', () => {
    expect(firstInvalidToken('1, oops, 3')).toBe('oops');
    expect(firstInvalidToken('1, 2, 3')).toBe(null);
    expect(errors(values('1, oops, 3')).values).toContain('oops');
  });

  it('bounds the token it quotes back', () => {
    expect(errors(values(`1, ${'x'.repeat(50)}`)).values).toContain('…');
  });

  it('refuses a sample of one, because n − 1 is zero', () => {
    expect(errors(values('5', 'sample')).values).toBe(MSG.needTwo);
    expect(validateSd(values('5', 'population')).ok).toBe(true);
    expect(validateSd(values('5, 7', 'sample')).ok).toBe(true);
  });

  it('treats an unknown mode as the default rather than failing', () => {
    expect(asMode('nonsense')).toBe(DEFAULT_MODE);
    expect(asMode('sample')).toBe('sample');
    expect(validateSd(values(DATA, 'nonsense')).ok).toBe(true);
  });
});

/* ---- The working --------------------------------------------------- */

describe('the derivation the reference prints', () => {
  const population = standardDeviation([10, 12, 23, 23, 16, 23, 21, 16], 'population');

  it('states the formula above the steps', () => {
    expect(sdFormula(population)).toBe('σ = √( (1 / N) × Σ(xᵢ - μ)² )');
  });

  it('walks the population derivation line for line', () => {
    expect(sdSteps(population).map((s) => [s.lead, s.body])).toEqual([
      ['σ²', 'Σ(xᵢ - μ)² / N'],
      ['=', '((10 - 18)² + … + (16 - 18)²) / 8'],
      ['=', '192 / 8'],
      ['=', '24'],
      ['σ', '√24'],
      ['=', '4.8989794855664'],
    ]);
  });

  it('parenthesises the sample divisor, which would otherwise read as a different formula', () => {
    const sample = standardDeviation([10, 12, 23, 23, 16, 23, 21, 16], 'sample');
    expect(sdFormula(sample)).toBe('s = √( (1 / (n - 1)) × Σ(xᵢ - x̄)² )');
    expect(sdSteps(sample)[0]).toEqual({ lead: 's²', body: 'Σ(xᵢ - x̄)² / (n - 1)' });
    expect(sdSteps(sample)[1].body).toBe('((10 - 18)² + … + (16 - 18)²) / 7');
  });

  it('shows both terms of a pair, and the single term of a set of one, with no ellipsis', () => {
    expect(sdSteps(standardDeviation([4, 6], 'population'))[1].body).toBe('((4 - 5)² + (6 - 5)²) / 2');
    expect(sdSteps(standardDeviation([4], 'population'))[1].body).toBe('((4 - 4)²) / 1');
  });

  it('quotes the first and last value AS ENTERED, not sorted', () => {
    expect(sdSteps(standardDeviation([9, 1, 5], 'population'))[1].body).toBe('((9 - 5)² + … + (5 - 5)²) / 3');
  });

  it('has no working to show when there is no standard deviation', () => {
    expect(sdSteps(standardDeviation([5], 'sample'))).toEqual([]);
  });

  it('writes the standard-error line with the mode’s own symbols', () => {
    expect(semLine(population)).toBe('σx̄ = σ / √N = 1.7320508075689');
    expect(semLine(standardDeviation([10, 12, 23, 23, 16, 23, 21, 16], 'sample'))).toBe(
      'sx̄ = s / √n = 1.8516401995451',
    );
  });
});

/* ---- The complete-result guard -------------------------------------- */

describe('completeSdValue', () => {
  it('returns the standard deviation when everything reconciles', () => {
    expect(completeSdValue(computeSd(values(DATA)))).toBeCloseTo(4.898979485566356, 12);
  });

  it('accepts a legitimate zero', () => {
    expect(completeSdValue(computeSd(values('3, 3, 3')))).toBe(0);
  });

  it('rejects an empty set', () => {
    expect(completeSdValue(computeSd(values('')))).toBeNaN();
  });

  it('rejects a sample of one', () => {
    expect(completeSdValue(computeSd(values('5', 'sample')))).toBeNaN();
  });

  it('rejects a result whose values no longer produce it', () => {
    const computed = computeSd(values(DATA));
    expect(completeSdValue({ ...computed, values: [1, 2, 3] })).toBeNaN();
  });

  it('rejects a result computed in the other mode', () => {
    const computed = computeSd(values(DATA));
    expect(completeSdValue({ ...computed, mode: 'sample' })).toBeNaN();
  });

  it('rejects a frequency table that does not account for every value', () => {
    const computed = computeSd(values(DATA));
    const result = { ...computed.result, frequency: computed.result.frequency.slice(1) };
    expect(completeSdValue({ ...computed, result })).toBeNaN();
  });
});

/* ---- Announcement --------------------------------------------------- */

describe('announcement', () => {
  it('names which standard deviation it is', () => {
    expect(describeSd(computeSd(values(DATA)))).toBe('Population standard deviation: 4.8989794855664.');
    expect(describeSd(computeSd(values(DATA, 'sample')))).toBe('Sample standard deviation: 5.2372293656638.');
  });

  it('says nothing when there is no result', () => {
    expect(describeSd(computeSd(values('')))).toBe('');
    expect(describeSd(computeSd(values('5', 'sample')))).toBe('');
  });
});

describe('the worked example', () => {
  it('is the reference data set, and it solves', () => {
    expect(SD_EXAMPLE_VALUES.raw).toBe(DATA);
    expect(validateSd(SD_EXAMPLE_VALUES).ok).toBe(true);
    expect(formatFigure(completeSdValue(computeSd(SD_EXAMPLE_VALUES)))).toBe('4.8989794855664');
  });
});
