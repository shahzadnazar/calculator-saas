import { describe, it, expect } from 'vitest';
import {
  CPI_DEFAULT_PERIODS,
  CPI_EXAMPLE_VALUES,
  FLAT_EXAMPLE_VALUES,
  backwardInflationBinding,
  backwardSentence,
  cpiBinding,
  cpiChartTitle,
  cpiHeadline,
  cpiIndexes,
  cpiRates,
  computeCpi,
  formatAmountEntered,
  formatIndex,
  formatPct2,
  formatRateEntered,
  forwardInflationBinding,
  forwardSentence,
  spokenUSD,
  toPeriod,
  validateCpi,
  validateFlat,
  yearsPhrase,
  type CpiOperands,
  type FlatOperands,
} from './inflation-form';

/**
 * The published reference cases:
 *   CPI      — $100 in 2016 (Average) is $139.13 in Jul. 2026.
 *   forward  — $100 at 3% after 10 years is $134.39.
 *   backward — $100 at 3%, 10 years ago, is $74.41.
 */

const cpiOps = (over: Partial<CpiOperands> = {}): CpiOperands => ({
  amount: '100',
  fromMonth: 'average',
  fromYear: '2016',
  toMonth: '7',
  toYear: '2026',
  ...over,
});

const flatOps = (over: Partial<FlatOperands> = {}): FlatOperands => ({
  amount: '100',
  annualRatePct: '3',
  years: '10',
  ...over,
});

/* ------------------------------------------------------------------ */
/* CPI calculator                                                      */
/* ------------------------------------------------------------------ */

describe('CPI — the published reference case', () => {
  const computed = computeCpi(cpiOps());
  const c = computed.comparison!;

  it('computes the published value', () => {
    expect(cpiBinding.resultValue(computed)).toBeCloseTo(139.1284, 4);
  });

  it('writes the reference sentences word for word', () => {
    expect(cpiHeadline(c)).toBe('$139.13 in Jul. 2026 equals $100 of buying power in 2016 (Average).');
    expect(cpiRates(c)).toBe(
      'The total inflation rate from 2016 (Average) to Jul. 2026 is 39.13%. The average inflation rate is 3.36% per year.',
    );
    expect(cpiIndexes(c)).toBe('The CPI of 2016 (Average) is 240.007 and the CPI of Jul. 2026 is 333.918.');
  });

  it('titles the chart with the span it covers', () => {
    expect(cpiChartTitle(c)).toBe(
      'Purchasing power of $100 in 2016 (Average) over time: 2016 (Average)–Jul. 2026',
    );
  });

  it('announces the value once, in words', () => {
    expect(cpiBinding.describeResult(computed)).toBe('139 dollars and 13 cents in Jul. 2026.');
  });

  it('omits the annual rate when there is no span to average over', () => {
    const same = computeCpi(cpiOps({ fromMonth: '7', fromYear: '2026' })).comparison!;
    expect(cpiRates(same)).toBe('The total inflation rate from Jul. 2026 to Jul. 2026 is 0.00%.');
    expect(cpiRates(same)).not.toContain('per year');
  });
});

describe('CPI — reading the selects', () => {
  it('turns select values into periods', () => {
    expect(toPeriod('average', '2016')).toEqual({ year: 2016, month: 'average' });
    expect(toPeriod('7', '2026')).toEqual({ year: 2026, month: 7 });
  });

  it('refuses a value no option can produce', () => {
    expect(toPeriod('13', '2020')).toBeNull();
    expect(toPeriod('7', 'nonsense')).toBeNull();
    expect(toPeriod('', '2020')).toBeNull();
  });
});

describe('CPI — validation', () => {
  it('accepts the reference entry', () => {
    expect(validateCpi(cpiOps())).toEqual({ ok: true });
  });

  it('requires an amount and rejects a negative one', () => {
    expect(validateCpi(cpiOps({ amount: '' }))).toMatchObject({
      ok: false,
      fieldErrors: { amount: 'Enter an amount.' },
    });
    expect(validateCpi(cpiOps({ amount: '-5' }))).toMatchObject({
      ok: false,
      fieldErrors: { amount: 'Enter an amount of zero or more.' },
    });
  });

  it('accepts a zero amount', () => {
    expect(validateCpi(cpiOps({ amount: '0' }))).toEqual({ ok: true });
  });

  it('explains that a year in progress has no annual average', () => {
    const r = validateCpi(cpiOps({ toMonth: 'average', toYear: '2026' }));
    expect(r).toMatchObject({ ok: false });
    expect((r as { fieldErrors: Record<string, string> }).fieldErrors.toMonth).toBe(
      '2026 has no annual average yet. Choose a month.',
    );
  });

  it('explains that 2025 has no annual average either', () => {
    // October 2025 was never collected, so the year has no average at all.
    const r = validateCpi(cpiOps({ fromMonth: 'average', fromYear: '2025' }));
    expect((r as { fieldErrors: Record<string, string> }).fieldErrors.fromMonth).toBe(
      '2025 has no annual average yet. Choose a month.',
    );
  });

  it('names the missing month, and says why, when one is picked', () => {
    const r = validateCpi(cpiOps({ fromMonth: '10', fromYear: '2025' })) as {
      ok: false;
      fieldErrors: Record<string, string>;
      formError?: string;
    };
    expect(r.fieldErrors.fromMonth).toBe('No index was published for Oct. 2025.');
    expect(r.formError).toContain('never collected');
  });

  it('rejects a month past the last release', () => {
    const r = validateCpi(cpiOps({ toMonth: '12', toYear: '2026' })) as {
      fieldErrors: Record<string, string>;
    };
    expect(r.fieldErrors.toMonth).toBe('No index was published for Dec. 2026.');
  });
});

describe('CPI — defaults and the worked example', () => {
  it('defaults to the latest month against the average ten years earlier', () => {
    expect(CPI_DEFAULT_PERIODS).toEqual({
      fromMonth: 'average',
      fromYear: '2016',
      toMonth: '7',
      toYear: '2026',
    });
  });

  it('the worked example is the reference span and computes the published figure', () => {
    expect(CPI_EXAMPLE_VALUES).toEqual({ amount: '100', ...CPI_DEFAULT_PERIODS });
    expect(validateCpi(CPI_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(cpiBinding.resultValue(computeCpi(CPI_EXAMPLE_VALUES))).toBeCloseTo(139.1284, 4);
  });

  it('never returns a figure when the periods cannot be compared', () => {
    const bad = computeCpi(cpiOps({ fromMonth: '10', fromYear: '2025' }));
    expect(Number.isNaN(cpiBinding.resultValue(bad))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Flat-rate calculators                                               */
/* ------------------------------------------------------------------ */

describe('the flat-rate pair', () => {
  const fwd = forwardInflationBinding.compute(flatOps());
  const bwd = backwardInflationBinding.compute(flatOps());

  it('runs the published forward case', () => {
    expect(forwardInflationBinding.resultValue(fwd)).toBeCloseTo(134.3916, 4);
  });

  it('runs the published backward case', () => {
    expect(backwardInflationBinding.resultValue(bwd)).toBeCloseTo(74.4094, 4);
  });

  it('is one engine read in opposite directions', () => {
    expect(fwd.value * bwd.value).toBeCloseTo(100 * 100, 6);
    expect(fwd.totalPct).toBeCloseTo(bwd.totalPct, 9);
  });

  it('writes a sentence for each direction', () => {
    expect(forwardSentence(fwd)).toBe(
      '$100 today, at 3% inflation a year, has the same buying power as $134.39 in 10 years. Prices rise 34.39% in total over the period.',
    );
    expect(backwardSentence(bwd)).toBe(
      '$100 today had the same buying power as $74.41 10 years ago, at 3% inflation a year. Prices rose 34.39% in total over the period.',
    );
  });

  it('handles deflation without calling it a rise', () => {
    const d = forwardInflationBinding.compute(flatOps({ annualRatePct: '-2' }));
    expect(d.value).toBeLessThan(100);
    expect(d.totalPct).toBeLessThan(0);
    expect(forwardInflationBinding.resultValue(d)).toBeGreaterThan(0);
  });

  it('the worked example validates and computes for both directions', () => {
    expect(validateFlat(FLAT_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(forwardInflationBinding.resultValue(forwardInflationBinding.compute(FLAT_EXAMPLE_VALUES))).toBeCloseTo(134.3916, 4);
    expect(backwardInflationBinding.resultValue(backwardInflationBinding.compute(FLAT_EXAMPLE_VALUES))).toBeCloseTo(74.4094, 4);
  });

  it('a zero term leaves the amount exactly where it started', () => {
    const r = forwardInflationBinding.compute(flatOps({ years: '0' }));
    expect(r.value).toBe(100);
    expect(r.totalPct).toBe(0);
  });
});

describe('flat-rate validation', () => {
  it('accepts the reference entry and a zero amount or term', () => {
    expect(validateFlat(flatOps())).toEqual({ ok: true });
    expect(validateFlat(flatOps({ amount: '0' }))).toEqual({ ok: true });
    expect(validateFlat(flatOps({ years: '0' }))).toEqual({ ok: true });
  });

  it('requires every field', () => {
    const r = validateFlat({ amount: '', annualRatePct: '', years: '' }) as {
      fieldErrors: Record<string, string>;
    };
    expect(r.fieldErrors).toEqual({
      amount: 'Enter an amount.',
      annualRatePct: 'Enter an inflation rate.',
      years: 'Enter a number of years.',
    });
  });

  it('treats a negative rate as valid deflation but stops at the cliff', () => {
    expect(validateFlat(flatOps({ annualRatePct: '-2' }))).toEqual({ ok: true });
    expect(validateFlat(flatOps({ annualRatePct: '-100' }))).toMatchObject({
      ok: false,
      fieldErrors: { annualRatePct: 'Enter a rate greater than -100%.' },
    });
  });

  it('rejects negative amounts and negative terms', () => {
    expect(validateFlat(flatOps({ amount: '-1' }))).toMatchObject({ ok: false });
    expect(validateFlat(flatOps({ years: '-1' }))).toMatchObject({ ok: false });
  });

  it('never lets a non-finite figure reach the panel', () => {
    const overflow = forwardInflationBinding.compute(flatOps({ annualRatePct: '500', years: '5000' }));
    expect(Number.isNaN(forwardInflationBinding.resultValue(overflow))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

describe('presentation helpers', () => {
  it('formats percentages to exactly two decimals', () => {
    expect(formatPct2(39.1284)).toBe('39.13%');
    expect(formatPct2(3.3574)).toBe('3.36%');
    expect(formatPct2(0)).toBe('0.00%');
    expect(formatPct2(Number.NaN)).toBe('—');
  });

  it('prints an index the way BLS prints it', () => {
    expect(formatIndex(333.918)).toBe('333.918');
    expect(formatIndex(240.007)).toBe('240.007');
    expect(formatIndex(9.8)).toBe('9.8');
  });

  it('echoes an entered figure without trailing zeros', () => {
    expect(formatAmountEntered(100)).toBe('$100');
    expect(formatAmountEntered(1234.5)).toBe('$1,234.50');
    expect(formatRateEntered(3)).toBe('3%');
    expect(formatRateEntered(2.5)).toBe('2.5%');
  });

  it('speaks an amount', () => {
    expect(spokenUSD(139.13)).toBe('139 dollars and 13 cents');
    expect(spokenUSD(100)).toBe('100 dollars');
    expect(spokenUSD(1.01)).toBe('1 dollar and 1 cent');
  });

  it('counts years', () => {
    expect(yearsPhrase(10)).toBe('10 years');
    expect(yearsPhrase(1)).toBe('1 year');
    expect(yearsPhrase(1.5)).toBe('1.5 years');
  });
});
