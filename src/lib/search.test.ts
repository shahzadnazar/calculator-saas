import { describe, it, expect } from 'vitest';
import {
  buildSearchRecords,
  rankCalculators,
  findClosestSuggestion,
  normalizeSearchText,
  tokenizeSearchText,
  boundedEditDistance,
  searchIndexVersion,
} from './search';
import { getLiveCalculators, CALCULATORS } from '@data/calculators';

const RECORDS = buildSearchRecords();
const results = (q: string) => rankCalculators(q, RECORDS);
const titles = (q: string) => results(q).map((r) => r.record.title);
const top = (q: string) => results(q)[0]?.record.title;
const rankOf = (q: string, title: string) => titles(q).indexOf(title);

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */

describe('normalizeSearchText', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalizeSearchText('  BMI  ')).toBe('bmi');
    expect(normalizeSearchText('a   b    c')).toBe('a b c');
  });
  it('treats hyphens like spaces', () => {
    expect(normalizeSearchText('body-mass index')).toBe('body mass index');
    expect(normalizeSearchText('compound-interest')).toBe('compound interest');
  });
  it('preserves the meaningful symbols % / +', () => {
    expect(normalizeSearchText('1/x')).toBe('1/x');
    expect(normalizeSearchText('kg/lb')).toBe('kg/lb');
    expect(normalizeSearchText('percentage %')).toBe('percentage %');
    expect(normalizeSearchText('2 + 2')).toBe('2 + 2');
  });
  it('strips quotes and stray punctuation', () => {
    expect(normalizeSearchText('"mortgage"')).toBe('mortgage');
    expect(normalizeSearchText('how old am i?')).toBe('how old am i');
  });
  it('is Unicode-safe', () => {
    expect(normalizeSearchText('Café')).toBe('café');
    expect(normalizeSearchText('ＢＭＩ')).toBe('bmi'); // fullwidth → NFKC
  });
  it('tokenizes into non-empty tokens', () => {
    expect(tokenizeSearchText('body-mass  index')).toEqual(['body', 'mass', 'index']);
    expect(tokenizeSearchText('   ')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Bounded edit distance                                               */
/* ------------------------------------------------------------------ */

describe('boundedEditDistance', () => {
  it('measures small edits', () => {
    expect(boundedEditDistance('mortgage', 'mortage', 2)).toBe(1);
    expect(boundedEditDistance('scientific', 'scientfic', 2)).toBe(1);
  });
  it('counts an adjacent transposition as one edit', () => {
    expect(boundedEditDistance('ab', 'ba', 1)).toBe(1);
  });
  it('returns max+1 once the bound is exceeded', () => {
    expect(boundedEditDistance('abc', 'xyz', 1)).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* Index integrity                                                     */
/* ------------------------------------------------------------------ */

describe('search index', () => {
  it('contains only live calculators', () => {
    expect(RECORDS.length).toBe(getLiveCalculators().length);
    const liveIds = new Set(
      CALCULATORS.filter((c) => c.status === 'live').map((c) => `${c.category}/${c.slug}`),
    );
    for (const r of RECORDS) expect(liveIds.has(r.id)).toBe(true);
  });
  it('excludes coming-soon calculators', () => {
    const planned = CALCULATORS.filter((c) => c.status !== 'live').map((c) => `${c.category}/${c.slug}`);
    for (const id of planned) expect(RECORDS.some((r) => r.id === id)).toBe(false);
  });
  it('has no duplicate hrefs', () => {
    const hrefs = RECORDS.map((r) => r.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
  it('carries task-group membership as the secondary signal', () => {
    const bmi = RECORDS.find((r) => r.id === 'health/bmi-calculator')!;
    expect(bmi.taskGroups).toContain('Health & Fitness');
  });
  it('has a stable, content-derived version', () => {
    expect(searchIndexVersion(RECORDS)).toBe(searchIndexVersion(buildSearchRecords()));
  });
  it('makes every live calculator discoverable through its own title', () => {
    for (const r of RECORDS) {
      expect(top(r.title)).toBe(r.title);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Ranking signals                                                     */
/* ------------------------------------------------------------------ */

describe('ranking signals', () => {
  it('ranks an exact title first', () => {
    expect(top('Mortgage Calculator')).toBe('Mortgage Calculator');
  });
  it('ranks a title prefix', () => {
    expect(top('mort')).toBe('Mortgage Calculator');
    expect(top('percent')).toBe('Percentage Calculator');
  });
  it('matches a title substring', () => {
    expect(titles('loan')).toContain('Loan Calculator');
    expect(titles('loan')).toContain('Auto Loan Calculator');
    expect(top('loan')).toBe('Loan Calculator'); // prefix beats contains
  });
  it('matches an alias', () => {
    expect(top('heloc')).toBe('Home Equity Loan Calculator');
    expect(top('rng')).toBe('Random Number Generator');
  });
  it('matches a natural-language phrase', () => {
    expect(top('can i retire')).toBe('Retirement Calculator');
    expect(top('what should i weigh')).toBe('Ideal Weight Calculator');
  });
  it('matches a category', () => {
    expect(titles('finance')).toContain('Mortgage Calculator');
    expect(titles('finance')).not.toContain('BMI Calculator');
  });
  it('matches a task group', () => {
    expect(titles('borrow')).toContain('Mortgage Calculator');
    expect(titles('borrow')).not.toContain('BMI Calculator');
  });
  it('rewards multi-token coverage (car loan payment → Auto Loan)', () => {
    expect(top('car loan payment')).toBe('Auto Loan Calculator');
    expect(rankOf('car loan payment', 'Auto Loan Calculator')).toBeLessThan(
      rankOf('car loan payment', 'Loan Calculator'),
    );
  });
});

/* ------------------------------------------------------------------ */
/* Fuzzy typo matching                                                 */
/* ------------------------------------------------------------------ */

describe('fuzzy matching', () => {
  it('tolerates typos on titles and aliases', () => {
    expect(top('scientfic')).toBe('Scientific Calculator');
    expect(top('mortage')).toBe('Mortgage Calculator');
  });
  it('does no fuzzy matching for a one-character query', () => {
    // Only title-prefix matches; every result must start with "b".
    for (const t of titles('b')) expect(normalizeSearchText(t).startsWith('b')).toBe(true);
  });
  it('does prefix-only matching for a two-character query', () => {
    for (const t of titles('bm')) expect(normalizeSearchText(t).startsWith('bm')).toBe(true);
    expect(titles('bm')).toContain('BMI Calculator');
  });
});

/* ------------------------------------------------------------------ */
/* Tie-breaking & determinism                                          */
/* ------------------------------------------------------------------ */

describe('tie-breaking', () => {
  it('is deterministic across calls', () => {
    expect(titles('calculator')).toEqual(titles('calculator'));
  });
  it('uses searchPriority to break an otherwise exact tie', () => {
    // Every "X Calculator" title contains "calculator" → same band; priority wins.
    expect(top('calculator')).toBe('Scientific Calculator');
    // Fuzzy variant resolves the same way.
    expect(top('calclator')).toBe('Scientific Calculator');
  });
});

/* ------------------------------------------------------------------ */
/* Empty / degenerate queries                                          */
/* ------------------------------------------------------------------ */

describe('degenerate queries', () => {
  it('returns nothing for an empty query', () => {
    expect(results('')).toEqual([]);
    expect(results('   ')).toEqual([]);
  });
  it('preserves the full result count (UI caps at 10, ranking does not)', () => {
    const all = results('calculator');
    expect(all.length).toBeGreaterThan(10);
    // A future UI slices to 10 without losing the underlying count.
    expect(all.slice(0, 10).length).toBe(10);
  });
});

/* ------------------------------------------------------------------ */
/* Suggestions                                                         */
/* ------------------------------------------------------------------ */

describe('findClosestSuggestion', () => {
  it('suggests the closest calculator for a typo', () => {
    expect(findClosestSuggestion('mortage', RECORDS)?.title).toBe('Mortgage Calculator');
  });
  it('returns null for a too-short query', () => {
    expect(findClosestSuggestion('mo', RECORDS)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Required example queries                                            */
/* ------------------------------------------------------------------ */

describe('required example queries', () => {
  const cases: Array<[string, string]> = [
    ['body mass', 'BMI Calculator'],
    ['house loan', 'Mortgage Calculator'],
    ['car payment', 'Auto Loan Calculator'],
    ['how old am i', 'Age Calculator'],
    ['kg to pounds', 'Unit Conversion Calculator'],
    ['scientfic', 'Scientific Calculator'],
    ['mortage', 'Mortgage Calculator'],
    ['investment growth', 'Investment Calculator'],
    ['tip split', 'Tip Calculator'],
  ];
  for (const [query, expected] of cases) {
    it(`"${query}" → ${expected}`, () => {
      expect(top(query)).toBe(expected);
    });
  }
});
