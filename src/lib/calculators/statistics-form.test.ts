import { describe, it, expect } from 'vitest';
import {
  validateStatValues,
  computeStats,
  completeResultValue,
  firstInvalidToken,
  statCells,
  modeText,
  interpretStats,
  describeStatsResult,
  statisticsBinding,
  DEFAULT_PRIMARY,
  type StatComputed,
} from './statistics-form';
import { calculateStats } from './statistics';

/**
 * Statistics form-binding tests (R13B1 Commit 2). Exercise the VALIDATION /
 * PRESENTATION boundary only — the pure parseNumberList / calculateStats
 * underneath are unchanged and separately frozen by statistics.test.ts. ONE
 * calculator-owned binding serves both routes via the `primary` config. Covers:
 * strict token rejection (unlike the lenient formula parse), the minimum-data
 * policy, the complete-result guard (reconciliation + malformed rejection + the
 * n = 1 non-finite allowances; NaN sentinel; no isUsableResult), and the
 * route-specific hero / interpretation / announcement.
 */

const cell = (s: ReturnType<typeof calculateStats>, key: string) =>
  statCells(s).find((c) => c.key === key)!.text;
const summary = (raw: string): StatComputed => computeStats({ primary: 'summary', raw });
const sd = (raw: string): StatComputed => computeStats({ primary: 'sd', raw });
const rejects = (r: StatComputed) => Number.isNaN(completeResultValue(r));

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe('statistics binding — contract', () => {
  it('defaults primary to summary', () => {
    expect(DEFAULT_PRIMARY).toBe('summary');
  });
  it('does NOT define isUsableResult (the guard lives in resultValue)', () => {
    expect(statisticsBinding.isUsableResult).toBeUndefined();
    expect(statisticsBinding.resultValue).toBe(completeResultValue);
  });
});

/* ------------------------------------------------------------------ */
/* Token validation — strict, unlike parseNumberList                   */
/* ------------------------------------------------------------------ */

describe('statistics binding — token validation', () => {
  it('accepts every separator style and numeric form', () => {
    for (const raw of ['1,2,3', '1 2 3', '1\t2\t3', '1\n2\n3', '2, 4 6\n8\t10', '1,,,2, ,3', '-2, -3.5, 4', '0.5, 1.25', '1e3, 2.5e-1']) {
      expect(validateStatValues({ primary: 'summary', raw })).toEqual({ ok: true });
    }
  });

  it('REJECTS any non-empty token that is not a finite number (does not silently drop it)', () => {
    for (const [raw, bad] of [
      ['abc', 'abc'],
      ['1, abc, 3', 'abc'],
      ['12px, 5', '12px'],
      ['4.5.6, 7', '4.5.6'],
      ['1, NaN, 3', 'NaN'],
      ['1, Infinity, 3', 'Infinity'],
      ['1, -Infinity, 3', '-Infinity'],
    ] as const) {
      expect(firstInvalidToken(raw)).toBe(bad);
      const v = validateStatValues({ primary: 'summary', raw });
      expect(v.ok).toBe(false);
      expect((v as { fieldErrors: Record<string, string> }).fieldErrors.values).toMatch(/Remove invalid values/);
    }
  });

  it('identifies the first invalid token, truncated, without echoing unbounded text', () => {
    const long = 'abcdefghijklmnopqrstuvwxyz';
    const v = validateStatValues({ primary: 'summary', raw: `1 ${long} 3` });
    const msg = (v as { fieldErrors: Record<string, string> }).fieldErrors.values;
    expect(msg).toContain('abcdefghijkl…'); // 12 chars + ellipsis
    expect(msg).not.toContain(long);
  });

  it('requires at least one number (empty / whitespace-only is a min-data error, not a token error)', () => {
    for (const raw of ['', '   \n\t ']) {
      const v = validateStatValues({ primary: 'summary', raw });
      expect(v).toEqual({ ok: false, fieldErrors: { values: 'Enter at least one number.' } });
    }
  });

  it('keys the error to the textarea field name `values`', () => {
    const v = validateStatValues({ primary: 'sd', raw: 'x' });
    expect(Object.keys((v as { fieldErrors: Record<string, string> }).fieldErrors)).toEqual(['values']);
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('statistics binding — computation', () => {
  it('parses through the unchanged formula and carries count + accepted values', () => {
    const r = summary('2, 4 6\n8');
    expect(r.count).toBe(4);
    expect(r.values).toEqual([2, 4, 6, 8]);
    expect(r.stats.mean).toBe(5);
    expect(r.primary).toBe('summary');
  });
  it('handles one value', () => {
    const r = sd('5');
    expect(r.count).toBe(1);
    expect(r.stats.populationSD).toBe(0);
    expect(Number.isNaN(r.stats.sampleSD)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

describe('statistics binding — complete-result guard', () => {
  it('returns the finite dominant mean for a well-formed result', () => {
    expect(completeResultValue(summary('2,4,6,8'))).toBe(5);
    expect(completeResultValue(summary('1,1,2,2,3'))).toBeCloseTo(1.8, 9); // multimodal
    expect(completeResultValue(summary('4,4,4'))).toBe(4); // all equal
    expect(Number.isFinite(completeResultValue(summary('2,4,6,8')))).toBe(true);
  });

  it('accepts a ONE-value result (population 0, sample/quartiles Not available)', () => {
    expect(completeResultValue(sd('7'))).toBe(7); // mean sentinel, finite → valid
    expect(rejects(sd('7'))).toBe(false);
  });

  it('rejects an empty data set', () => {
    expect(rejects(summary(''))).toBe(true);
  });

  it('rejects a count that does not match the accepted input length', () => {
    const base = summary('2,4,6,8');
    expect(rejects({ ...base, count: 3 })).toBe(true);
    expect(rejects({ ...base, stats: { ...base.stats, count: 3 } })).toBe(true);
  });

  it('rejects a non-finite accepted value', () => {
    const base = summary('2,4,6,8');
    expect(rejects({ ...base, values: [2, 4, Infinity, 8] })).toBe(true);
  });

  it('rejects malformed sorted output (wrong order / values)', () => {
    const base = summary('2,4,6,8');
    expect(rejects({ ...base, stats: { ...base.stats, sorted: [8, 6, 4, 2] } })).toBe(true);
    expect(rejects({ ...base, stats: { ...base.stats, sorted: [2, 4, 6] } })).toBe(true);
  });

  it('rejects a mode that is not the true max-frequency set', () => {
    const base = summary('2,4,6,8'); // all unique → mode []
    expect(rejects({ ...base, stats: { ...base.stats, mode: [99] } })).toBe(true);
    const bi = summary('1,1,2,2,3'); // mode [1,2]
    expect(rejects({ ...bi, stats: { ...bi.stats, mode: [1] } })).toBe(true);
  });

  it('rejects malformed population output (negative / non-finite)', () => {
    const base = summary('2,4,6,8');
    expect(rejects({ ...base, stats: { ...base.stats, populationSD: -1 } })).toBe(true);
    expect(rejects({ ...base, stats: { ...base.stats, populationVariance: Number.NaN } })).toBe(true);
  });

  it('rejects malformed sample output for n >= 2 (non-finite / wrong value)', () => {
    const base = summary('2,4,6,8');
    expect(rejects({ ...base, stats: { ...base.stats, sampleSD: Number.NaN } })).toBe(true);
    expect(rejects({ ...base, stats: { ...base.stats, sampleSD: 999 } })).toBe(true);
    expect(rejects({ ...base, stats: { ...base.stats, q1: Number.NaN } })).toBe(true);
  });

  it('rejects a one-value result whose sample fields were (wrongly) coerced to finite numbers', () => {
    const one = sd('7');
    expect(rejects({ ...one, stats: { ...one.stats, sampleSD: 0 } })).toBe(true); // must stay "Not available"
  });
});

/* ------------------------------------------------------------------ */
/* Presentation — cells, interpretation, announcement                  */
/* ------------------------------------------------------------------ */

describe('statistics binding — result cells', () => {
  it('formats an ordinary set and shows "No mode" when all unique', () => {
    const s = calculateStats([2, 4, 6, 8]);
    expect(cell(s, 'mean')).toBe('5');
    expect(cell(s, 'median')).toBe('5');
    expect(cell(s, 'mode')).toBe('No mode');
    expect(cell(s, 'min')).toBe('2');
    expect(cell(s, 'max')).toBe('8');
    expect(cell(s, 'range')).toBe('6');
    expect(cell(s, 'count')).toBe('4');
    expect(cell(s, 'sum')).toBe('20');
    expect(cell(s, 'sampleSD')).not.toBe('Not available');
  });

  it('shows "Not available" for sample dispersion + quartiles at n = 1, but population 0', () => {
    const s = calculateStats([7]);
    expect(cell(s, 'popSD')).toBe('0');
    expect(cell(s, 'popVar')).toBe('0');
    expect(cell(s, 'sampleSD')).toBe('Not available');
    expect(cell(s, 'sampleVar')).toBe('Not available');
    expect(cell(s, 'q1')).toBe('Not available');
    expect(cell(s, 'q3')).toBe('Not available');
    expect(cell(s, 'iqr')).toBe('Not available');
    expect(cell(s, 'mean')).toBe('7');
  });

  it('renders mode as a value, a list, or No mode', () => {
    expect(modeText([4])).toBe('4');
    expect(modeText([1, 2])).toBe('1, 2');
    expect(modeText([])).toBe('No mode');
  });
});

describe('statistics binding — interpretation (route-aware)', () => {
  it('summary route names mean, median and mode', () => {
    expect(interpretStats(summary('2,4,4,4,5,5,7,9'))).toBe(
      'Across 8 values, the mean is 5, the median is 4.5 and the mode is 4.',
    );
  });
  it('sd route names sample and population SD for n >= 2', () => {
    expect(interpretStats(sd('2,4,6,8'))).toBe(
      'Across 4 values, the sample standard deviation is 2.582 and the population standard deviation is 2.2361.',
    );
  });
  it('sd route explains the one-value case', () => {
    expect(interpretStats(sd('7'))).toBe(
      'Across 1 value, the population standard deviation is 0. Sample standard deviation needs at least two values.',
    );
  });
});

describe('statistics binding — announcement (concise, route-specific)', () => {
  it('summary route announces count + mean', () => {
    expect(describeStatsResult(summary('2,4,4,4,5,5,7,9'))).toBe('Statistics calculated for 8 values. The mean is 5.');
  });
  it('sd route announces the sample SD for n >= 2', () => {
    expect(describeStatsResult(sd('2,4,6,8'))).toBe('The sample standard deviation is 2.582.');
  });
  it('sd route announces the one-value case', () => {
    expect(describeStatsResult(sd('7'))).toBe(
      'The population standard deviation is 0. Sample standard deviation is not available for one value.',
    );
  });
});

/* ------------------------------------------------------------------ */
/* readValues / resetValues (mock root — no DOM in node vitest)         */
/* ------------------------------------------------------------------ */

describe('statistics binding — readValues / resetValues', () => {
  const mockRoot = (raw: string, primary?: string) => {
    const ta = { value: raw };
    return {
      getAttribute: (name: string) => (name === 'data-primary' ? primary ?? null : null),
      querySelector: (sel: string) => (sel === '[name="values"]' ? ta : null),
      __ta: ta,
    } as unknown as HTMLElement & { __ta: { value: string } };
  };

  it('reads the raw textarea and the route primary from data-primary', () => {
    expect(statisticsBinding.readValues(mockRoot('1, 2, 3', 'sd'))).toEqual({ primary: 'sd', raw: '1, 2, 3' });
  });
  it('defaults primary to summary when data-primary is absent or unknown', () => {
    expect(statisticsBinding.readValues(mockRoot('4 5 6')).primary).toBe('summary');
    expect(statisticsBinding.readValues(mockRoot('4 5 6', 'weird')).primary).toBe('summary');
  });
  it('reset clears the textarea (personal values), leaving structure untouched', () => {
    const root = mockRoot('1, 2, 3, 4', 'sd');
    statisticsBinding.resetValues(root, 'personal');
    expect((root as unknown as { __ta: { value: string } }).__ta.value).toBe('');
  });
});
