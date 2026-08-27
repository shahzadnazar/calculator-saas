import { describe, it, expect } from 'vitest';
import {
  COMPOUND_EXAMPLE_VALUES,
  FREQUENCY_LABELS,
  MAX_RATE,
  MSG,
  compoundInterestBinding,
  compoundPhrase,
  completeCompoundValue,
  computeCompound,
  describeCompound,
  formatRate,
  periodsPerYear,
  presentCompound,
  validateCompound,
  type CompoundComputed,
  type CompoundValues,
} from './compound-interest-form';
import { COMPOUND_FREQUENCIES, convertCompoundRate } from './compounding';

/**
 * The rate converter, frozen against the published reference case: 6% compounded
 * monthly is equivalent to 6.16778% compounded annually.
 *
 * The property that matters most here is not any single conversion but that every
 * pair is REVERSIBLE — two rates are only equivalent if each converts back to the
 * other. The guard enforces it, and these tests check it across all 81 pairings.
 */

const REF: CompoundValues = COMPOUND_EXAMPLE_VALUES;
const at = (over: Partial<CompoundValues> = {}): CompoundValues => ({ ...REF, ...over });
const errs = (v: CompoundValues): Record<string, string> => {
  const r = validateCompound(v);
  return r.ok ? {} : (r.fieldErrors ?? {});
};

describe('validation', () => {
  it('accepts the reference entry', () => {
    expect(validateCompound(REF)).toEqual({ ok: true });
  });

  it('requires a rate', () => {
    expect(errs(at({ inputRate: '' })).inputRate).toBe(MSG.rateRequired);
    expect(errs(at({ inputRate: '   ' })).inputRate).toBe(MSG.rateRequired);
  });

  it('accepts 0% — a rate that earns nothing is still a rate', () => {
    expect(validateCompound(at({ inputRate: '0' }))).toEqual({ ok: true });
  });

  it('rejects a negative or unparseable rate', () => {
    for (const bad of ['-1', 'abc', 'NaN']) {
      expect(errs(at({ inputRate: bad })).inputRate).toBe(MSG.rateNonNegative);
    }
  });

  it(`rejects a rate above ${MAX_RATE}% as a typo`, () => {
    expect(errs(at({ inputRate: '201' })).inputRate).toBe(MSG.rateMax);
    expect(validateCompound(at({ inputRate: String(MAX_RATE) }))).toEqual({ ok: true });
  });
});

describe('the reference case', () => {
  const c = computeCompound(REF);
  const p = presentCompound(c);

  it('converts 6% monthly to the rate the reference reports', () => {
    expect(c.outputRate).toBeCloseTo(6.167781186449828, 10);
    expect(p.outputRate).toBe('6.16778%');
  });

  it('says it in the reference’s own sentence', () => {
    expect(p.summary).toBe('6% compound monthly (APR) is equivalent to 6.16778% compound annually (APY).');
  });

  it('reports what the rate actually earns in a year', () => {
    expect(p.effectiveAnnual).toBe('6.16778%');
    expect(c.effectiveAnnualPct).toBeCloseTo(6.167781186449828, 10);
  });

  it('announces the conversion', () => {
    expect(describeCompound(c)).toBe(
      '6 percent compound monthly (APR) is equivalent to 6.16778 percent compound annually (APY).',
    );
  });

  it('carries the full ladder for the chart, in the selector’s order', () => {
    expect(c.ladder.map((s) => s.compound)).toEqual([...COMPOUND_FREQUENCIES]);
    expect(c.ladder).toHaveLength(9);
  });

  it('the ladder runs from annual to continuous, never falling', () => {
    const values = c.ladder.map((s) => s.effectiveAnnualPct);
    expect(values[0]).toBeCloseTo(6, 10); // annual compounding earns exactly the nominal rate
    expect(values[values.length - 1]).toBeCloseTo(6.183654654535962, 9); // continuous
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
  });

  it('monthly compounding is already most of the way to continuous', () => {
    const by = Object.fromEntries(c.ladder.map((s) => [s.compound, s.effectiveAnnualPct]));
    const gainToMonthly = by.monthly - by.annually;
    const gainTotal = by.continuously - by.annually;
    expect(gainToMonthly / gainTotal).toBeGreaterThan(0.9);
  });
});

describe('conversions in every direction', () => {
  it('every one of the 81 pairings converts back to where it started', () => {
    for (const from of COMPOUND_FREQUENCIES) {
      for (const to of COMPOUND_FREQUENCIES) {
        const there = convertCompoundRate(6, from, to);
        const back = convertCompoundRate(there, to, from);
        expect(back).toBeCloseTo(6, 9);
      }
    }
  });

  it('converting to the same period returns the rate untouched, to the last bit', () => {
    for (const f of COMPOUND_FREQUENCIES) {
      // Not merely close: routing through the effective rate and back would land on
      // 5.999999999999872, which must never be printed as an "equivalent" rate.
      expect(convertCompoundRate(6, f, f)).toBe(6);
    }
  });

  it('a 0% rate is 0% at every period', () => {
    for (const to of COMPOUND_FREQUENCIES) {
      expect(convertCompoundRate(0, 'monthly', to)).toBeCloseTo(0, 12);
    }
  });

  it('converting the other way gives a LOWER nominal rate', () => {
    // 6% annually needs only 5.84106% compounded monthly to match it.
    const c = computeCompound(at({ inputCompound: 'annually', outputCompound: 'monthly' }));
    expect(presentCompound(c).outputRate).toBe('5.84106%');
    expect(c.outputRate).toBeLessThan(6);
  });

  it('the equivalent of a same-period conversion is explained rather than shown as a change', () => {
    const p = presentCompound(computeCompound(at({ outputCompound: 'monthly' })));
    expect(p.outputRate).toBe('6%');
    expect(p.summary).toContain('already what you asked for');
  });
});

describe('presentation', () => {
  it('prints five decimals, trimming what is not needed', () => {
    expect(formatRate(6.167781186449828)).toBe('6.16778%');
    expect(formatRate(6)).toBe('6%');
    expect(formatRate(0)).toBe('0%');
    expect(formatRate(Number.NaN)).toBe('—');
  });

  it('names each period the way its paperwork does', () => {
    expect(compoundPhrase('monthly')).toBe('monthly (APR)');
    expect(compoundPhrase('annually')).toBe('annually (APY)');
    expect(compoundPhrase('quarterly')).toBe('quarterly');
    expect(FREQUENCY_LABELS.monthly).toBe('Monthly (APR)');
    expect(FREQUENCY_LABELS.annually).toBe('Annually (APY)');
  });

  it('labels every frequency the selector offers', () => {
    for (const f of COMPOUND_FREQUENCIES) {
      expect(FREQUENCY_LABELS[f]).toBeTruthy();
      expect(compoundPhrase(f)).toBeTruthy();
    }
  });

  it('reports periods per year, and that continuous has none', () => {
    expect(periodsPerYear('monthly')).toBe(12);
    expect(periodsPerYear('daily')).toBe(365);
    expect(periodsPerYear('continuously')).toBeNull();
  });

  it('never leaks a NaN, an Infinity or an undefined into the words', () => {
    const p = presentCompound(computeCompound(at({ inputRate: '0' })));
    const text = [p.summary, p.outputRate, p.effectiveAnnual, p.inputLabel, p.outputLabel].join(' ');
    expect(text).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe('the complete-result guard', () => {
  const good = computeCompound(REF);
  const broken = (mutate: (c: CompoundComputed) => void): CompoundComputed => {
    const copy = JSON.parse(JSON.stringify(good)) as CompoundComputed;
    mutate(copy);
    return copy;
  };

  it('accepts a result that reconciles, returning the converted rate', () => {
    expect(completeCompoundValue(good)).toBeCloseTo(6.16778, 4);
  });

  it('rejects a pair that does not convert back — the whole claim of equivalence', () => {
    expect(completeCompoundValue(broken((c) => (c.outputRate += 0.5)))).toBeNaN();
    expect(completeCompoundValue(broken((c) => (c.inputRate = 7)))).toBeNaN();
    expect(completeCompoundValue(broken((c) => (c.outputCompound = 'daily')))).toBeNaN();
  });

  it('rejects an effective annual rate the two ends disagree about', () => {
    expect(completeCompoundValue(broken((c) => (c.effectiveAnnualPct += 0.5)))).toBeNaN();
  });

  it('rejects a ladder that is short, non-finite, or out of order', () => {
    expect(completeCompoundValue(broken((c) => (c.ladder = c.ladder.slice(1))))).toBeNaN();
    expect(
      completeCompoundValue(
        broken((c) => {
          (c.ladder as { effectiveAnnualPct: number }[])[3].effectiveAnnualPct = Number.NaN;
        }),
      ),
    ).toBeNaN();
    // More frequent compounding can never earn less.
    expect(
      completeCompoundValue(
        broken((c) => {
          (c.ladder as { effectiveAnnualPct: number }[])[8].effectiveAnnualPct = 0;
        }),
      ),
    ).toBeNaN();
  });

  it('rejects a non-finite or out-of-range figure', () => {
    expect(completeCompoundValue(broken((c) => (c.inputRate = Number.NaN)))).toBeNaN();
    expect(completeCompoundValue(broken((c) => (c.inputRate = -1)))).toBeNaN();
    expect(completeCompoundValue(broken((c) => (c.inputRate = MAX_RATE + 1)))).toBeNaN();
    expect(completeCompoundValue(broken((c) => (c.outputRate = Number.NaN)))).toBeNaN();
  });

  it('a 0% conversion is a finite 0 the default gate accepts — no isUsableResult', () => {
    const zero = computeCompound(at({ inputRate: '0' }));
    expect(completeCompoundValue(zero)).toBe(0);
    expect(compoundInterestBinding.isUsableResult).toBeUndefined();
  });
});

describe('the worked example', () => {
  it('validates, so the example a visitor sees is a real calculation', () => {
    expect(validateCompound(COMPOUND_EXAMPLE_VALUES)).toEqual({ ok: true });
  });

  it('is the published reference case and passes the same guard as any other result', () => {
    const c = computeCompound(COMPOUND_EXAMPLE_VALUES);
    expect(compoundInterestBinding.resultValue(c)).toBeCloseTo(6.16778, 4);
    expect(presentCompound(c).outputRate).toBe('6.16778%');
  });
});
