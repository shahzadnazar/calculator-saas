import { describe, it, expect } from 'vitest';
import { calculateCompoundInterest } from './compound-interest';

describe('compound interest', () => {
  it('compounds annually', () => {
    const r = calculateCompoundInterest({
      principal: 1000,
      annualRatePct: 10,
      years: 2,
      compoundsPerYear: 1,
    });
    expect(r.futureValue).toBeCloseTo(1210, 6);
    expect(r.totalInterest).toBeCloseTo(210, 6);
  });

  it('compounds monthly', () => {
    const r = calculateCompoundInterest({
      principal: 1000,
      annualRatePct: 12,
      years: 1,
      compoundsPerYear: 12,
    });
    expect(r.futureValue).toBeCloseTo(1126.83, 2);
  });

  it('adds regular contributions', () => {
    const r = calculateCompoundInterest({
      principal: 0,
      annualRatePct: 0,
      years: 1,
      compoundsPerYear: 12,
      contribution: 100,
    });
    expect(r.futureValue).toBeCloseTo(1200, 6);
    expect(r.totalContributions).toBeCloseTo(1200, 6);
    expect(r.totalInterest).toBeCloseTo(0, 6);
  });

  it('builds a yearly series', () => {
    const r = calculateCompoundInterest({
      principal: 500,
      annualRatePct: 5,
      years: 3,
      compoundsPerYear: 12,
    });
    expect(r.series[0].year).toBe(0);
    expect(r.series[r.series.length - 1].year).toBe(3);
    expect(r.series[r.series.length - 1].balance).toBeCloseTo(r.futureValue, 6);
  });
});

/**
 * Investment-relevant invariants (R11D1 characterization). Freezes the shared-engine behaviours the
 * Investment calculator depends on that were not previously covered — END-of-period contribution
 * timing, a negative rate producing negative interest, and the series length being years + 1 (a
 * leading year-0 seed row). Test-only: the engine is UNCHANGED and stays shared with Savings,
 * Retirement, Interest, Compound Interest and the reference tables.
 */
describe('compound interest — Investment-relevant invariants', () => {
  it('contributions are added at the END of each period (ordinary annuity)', () => {
    // 100/period at 12%/yr monthly for 1 year: an ordinary (end-of-period) annuity → 1268.25, not the
    // annuity-due 1280.93. Only 68.25 interest because the last deposit earns nothing in its period.
    const r = calculateCompoundInterest({ principal: 0, annualRatePct: 12, years: 1, compoundsPerYear: 12, contribution: 100 });
    expect(r.futureValue).toBeCloseTo(1268.2503, 2);
    expect(r.totalContributions).toBe(1200);
    expect(r.totalInterest).toBeCloseTo(68.2503, 2);
  });

  it('a negative rate produces a shrinking balance and NEGATIVE interest', () => {
    const r = calculateCompoundInterest({ principal: 1000, annualRatePct: -10, years: 5, compoundsPerYear: 12 });
    expect(r.futureValue).toBeCloseTo(605.2613, 2);
    expect(r.totalInterest).toBeCloseTo(-394.7387, 2);
    expect(r.futureValue).toBeGreaterThan(0);
  });

  it('the yearly series carries a year-0 seed row, so its length is years + 1', () => {
    for (const years of [1, 3, 25]) {
      const r = calculateCompoundInterest({ principal: 500, annualRatePct: 5, years, compoundsPerYear: 12 });
      expect(r.series.length).toBe(years + 1);
      expect(r.series[0].year).toBe(0);
      expect(r.series[years].year).toBe(years);
      expect(r.series[years].balance).toBeCloseTo(r.futureValue, 6);
    }
  });
});

/**
 * Compound Interest legacy UI contract (R21A1 — the FINAL legacy migration). Freezes the exact engine
 * outputs the legacy Compound Interest island renders, BEFORE the task-first migration, so the R21A1
 * binding can reproduce them and no migrated sibling (Investment / Savings / Retirement / Interest) or
 * reference table regresses. Test-only: the engine is UNCHANGED and byte-identical; contribution is
 * per COMPOUNDING PERIOD at END-of-period, so at a higher frequency the same "per period" figure buys
 * MORE deposits (a defining Compound-Interest behaviour that Interest's four-frequency UI never showed).
 */
const CI_DEFAULT = { principal: 10000, annualRatePct: 7, years: 20, compoundsPerYear: 12, contribution: 200 };

describe('compound interest — legacy UI default sample (10000 / 7% / 20y / monthly / $200 per period)', () => {
  const r = calculateCompoundInterest(CI_DEFAULT);

  it('future value ≈ 144,572.72; principal 10,000; contributions 48,000; interest ≈ 86,572.72', () => {
    expect(r.futureValue).toBeCloseTo(144572.72045492515, 6);
    expect(r.totalPrincipal).toBe(10000);
    expect(r.totalContributions).toBe(48000); // 200 × (20 × 12) periods
    expect(r.totalInterest).toBeCloseTo(86572.72045492515, 6);
  });

  it('the yearly series has 21 rows (year 0..20) with the exact seed, first and final rows', () => {
    expect(r.series.length).toBe(21);
    expect(r.series[0]).toEqual({ year: 0, balance: 10000, contributed: 0, interest: 0 });
    expect(r.series[1].year).toBe(1);
    expect(r.series[1].balance).toBeCloseTo(13201.41786649044, 6);
    expect(r.series[1].contributed).toBe(2400); // 200 × 12
    expect(r.series[1].interest).toBeCloseTo(801.4178664904393, 6);
    expect(r.series[20].year).toBe(20);
    expect(r.series[20].balance).toBeCloseTo(r.futureValue, 6);
    expect(r.series[20].contributed).toBe(48000);
    expect(r.series[20].interest).toBeCloseTo(r.totalInterest, 6);
  });

  it('the proportion split (the island bar) reconciles to the future value', () => {
    // principal / contributions / interest as fractions of the future value sum to 1
    const frac = (v: number) => v / r.futureValue;
    expect(frac(r.totalPrincipal) + frac(r.totalContributions) + frac(r.totalInterest)).toBeCloseTo(1, 10);
  });
});

describe('compound interest — every frequency exposed by the legacy UI (contribution is per period)', () => {
  // 10000 / 7% / 20y / $200-per-period at each of the FIVE UI frequencies. Because $200 is per period,
  // higher frequency = more deposits, so the future value climbs steeply (daily balloons).
  const anchors: Array<[number, number, string]> = [
    [1, 46895.94308910807, 'Annually'],
    [2, 56502.65276128522, 'Semi-annually'], // previously uncharacterized
    [4, 74422.68409105841, 'Quarterly'],
    [12, 144572.72045492515, 'Monthly'],
    [365, 3226116.0477207415, 'Daily'],
  ];
  for (const [n, fv, label] of anchors) {
    it(`${label} (n=${n}) → future value ≈ ${fv.toFixed(2)}`, () => {
      const r = calculateCompoundInterest({ ...CI_DEFAULT, compoundsPerYear: n });
      expect(r.futureValue).toBeCloseTo(fv, 4);
      // total contributions = 200 × (years × n): scales with frequency
      expect(r.totalContributions).toBeCloseTo(200 * 20 * n, 6);
    });
  }

  it('Semi-annually is a distinct, valid frequency between Annually and Quarterly', () => {
    const a = calculateCompoundInterest({ ...CI_DEFAULT, contribution: 0, compoundsPerYear: 1 }).futureValue;
    const s = calculateCompoundInterest({ ...CI_DEFAULT, contribution: 0, compoundsPerYear: 2 }).futureValue;
    const q = calculateCompoundInterest({ ...CI_DEFAULT, contribution: 0, compoundsPerYear: 4 }).futureValue;
    expect(s).toBeGreaterThan(a);
    expect(s).toBeLessThan(q);
  });
});

describe('compound interest — contribution semantics (per period, END timing)', () => {
  it('zero contribution → pure principal growth (no contributions counted)', () => {
    const r = calculateCompoundInterest({ ...CI_DEFAULT, contribution: 0 });
    expect(r.futureValue).toBeCloseTo(40387.38848982184, 6);
    expect(r.totalContributions).toBe(0);
  });

  it('a zero rate with contributions still accumulates the deposits (interest exactly 0)', () => {
    const r = calculateCompoundInterest({ principal: 5000, annualRatePct: 0, years: 10, compoundsPerYear: 12, contribution: 100 });
    expect(r.futureValue).toBe(17000); // 5000 + 100 × 120
    expect(r.totalContributions).toBe(12000);
    expect(r.totalInterest).toBe(0);
  });

  it('a negative contribution (a withdrawal) is permitted by the engine and lowers the totals', () => {
    const r = calculateCompoundInterest({ principal: 10000, annualRatePct: 5, years: 5, compoundsPerYear: 12, contribution: -100 });
    expect(r.totalContributions).toBe(-6000); // -100 × 60
    expect(r.futureValue).toBeCloseTo(6032.978500950809, 6);
  });

  it('future value always reconciles to principal + contributions + interest', () => {
    const cases = [
      CI_DEFAULT,
      { principal: 0, annualRatePct: 7, years: 20, compoundsPerYear: 12, contribution: 200 },
      { principal: 5000, annualRatePct: 0, years: 10, compoundsPerYear: 12, contribution: 100 },
      { principal: 25000, annualRatePct: 9, years: 30, compoundsPerYear: 4, contribution: 500 },
    ];
    for (const c of cases) {
      const r = calculateCompoundInterest(c);
      expect(r.totalPrincipal + r.totalContributions + r.totalInterest).toBeCloseTo(r.futureValue, 4);
    }
  });
});

describe('compound interest — edge / domain behaviour (frozen; the binding validates the UI)', () => {
  it('zero principal → contributions-only growth (a valid result)', () => {
    expect(calculateCompoundInterest({ ...CI_DEFAULT, principal: 0 }).futureValue).toBeCloseTo(104185.33196510308, 6);
  });

  it('zero years → future value equals the principal; the series is just the seed row', () => {
    const r = calculateCompoundInterest({ ...CI_DEFAULT, years: 0 });
    expect(r.futureValue).toBe(10000);
    expect(r.series.length).toBe(1);
    expect(r.series[0]).toEqual({ year: 0, balance: 10000, contributed: 0, interest: 0 });
  });

  it('compoundsPerYear is normalized to max(1, round(n)): 0 and 2.7 behave as 1 and 3', () => {
    const zero = calculateCompoundInterest({ principal: 10000, annualRatePct: 7, years: 5, compoundsPerYear: 0, contribution: 0 });
    const one = calculateCompoundInterest({ principal: 10000, annualRatePct: 7, years: 5, compoundsPerYear: 1, contribution: 0 });
    expect(zero.futureValue).toBeCloseTo(one.futureValue, 6);
    const twoish = calculateCompoundInterest({ principal: 10000, annualRatePct: 7, years: 5, compoundsPerYear: 2.7, contribution: 0 });
    const three = calculateCompoundInterest({ principal: 10000, annualRatePct: 7, years: 5, compoundsPerYear: 3, contribution: 0 });
    expect(twoish.futureValue).toBeCloseTo(three.futureValue, 6);
  });

  it('a NaN principal collapses to 0 (Math.max(0, NaN||0)) → a finite contributions-only result', () => {
    const r = calculateCompoundInterest({ ...CI_DEFAULT, principal: NaN });
    expect(Number.isFinite(r.futureValue)).toBe(true);
    expect(r.futureValue).toBeCloseTo(104185.33196510308, 6); // equals the zero-principal case
  });

  it('an Infinity principal propagates to a non-finite future value (the binding rejects it)', () => {
    expect(Number.isFinite(calculateCompoundInterest({ ...CI_DEFAULT, principal: Infinity, contribution: 0 }).futureValue)).toBe(false);
  });

  it('a fractional year rounds to whole compounding periods; series rows only at full years', () => {
    const r = calculateCompoundInterest({ principal: 10000, annualRatePct: 7, years: 2.5, compoundsPerYear: 12, contribution: 0 });
    expect(r.futureValue).toBeCloseTo(11906.406929103301, 6); // round(2.5×12) = 30 periods
    expect(r.series.length).toBe(3); // seed + year 1 + year 2 (the half-year tail adds no row)
    expect(r.series.map((s) => s.year)).toEqual([0, 1, 2]);
  });
});

describe('compound interest — series cumulative fields (frozen)', () => {
  it('contributed and interest are cumulative, and each row balance = principal + contributed + interest', () => {
    const r = calculateCompoundInterest({ principal: 1000, annualRatePct: 6, years: 5, compoundsPerYear: 12, contribution: 50 });
    let prevContrib = -1;
    for (const row of r.series) {
      expect(row.contributed).toBeGreaterThanOrEqual(prevContrib); // non-decreasing cumulative
      prevContrib = row.contributed;
      expect(row.balance).toBeCloseTo(1000 + row.contributed + row.interest, 6);
    }
    expect(r.series[5].contributed).toBe(50 * 60); // 3000 over 60 periods
  });
});
