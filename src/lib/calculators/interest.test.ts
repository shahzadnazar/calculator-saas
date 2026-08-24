import { describe, it, expect } from 'vitest';
import { calculateSimpleInterest } from './simple-interest';
import { calculateCompoundInterest } from './compound-interest';

/**
 * R20A1 Commit 1 — characterization of the Interest calculator's COMPOSITION contract.
 *
 * The Interest calculator owns NO formula module. It is a comparison layer that feeds the
 * SAME principal / annual rate / years to two frozen engines — calculateSimpleInterest and
 * calculateCompoundInterest — where only the COMPOUND side additionally receives the
 * compounding frequency, then reports the "compounding advantage" = compound.totalInterest −
 * simple.interest. This suite freezes that composition (and the legacy behaviour it inherits
 * from each engine) BEFORE the task-first migration; the R20A1 binding must reproduce it
 * exactly. The two engines are frozen this round and are NOT modified.
 *
 * `compareInterest` mirrors the current island's inline composition — deliberately a LOCAL
 * helper, not a production abstraction (none exists yet). It uses the same field roles the
 * migrated binding will expose (dominant compound interest + final balance; supporting simple
 * interest + simple final balance; the advantage delta).
 */
function compareInterest(
  principal: number,
  annualRatePct: number,
  years: number,
  compoundsPerYear: number,
) {
  const simple = calculateSimpleInterest({ principal, annualRatePct, years });
  const compound = calculateCompoundInterest({ principal, annualRatePct, years, compoundsPerYear });
  return {
    simpleInterest: simple.interest,
    simpleFinal: simple.total,
    compoundInterest: compound.totalInterest, // DOMINANT
    compoundFinal: compound.futureValue, // final balance
    advantage: compound.totalInterest - simple.interest,
  };
}

describe('interest comparison — legacy default sample (10000 / 5% / 10y / monthly)', () => {
  const r = compareInterest(10000, 5, 10, 12);

  it('simple interest is exact: I = P·r·t = 10000 × 0.05 × 10 = 5000, total 15000', () => {
    expect(r.simpleInterest).toBe(5000);
    expect(r.simpleFinal).toBe(15000);
  });

  it('compound interest earned (dominant) ≈ 6470.09 and final balance ≈ 16470.09 (monthly)', () => {
    expect(r.compoundInterest).toBeCloseTo(6470.09497690279, 6);
    expect(r.compoundFinal).toBeCloseTo(16470.09497690279, 6);
  });

  it('compounding advantage = compound.totalInterest − simple.interest ≈ 1470.09', () => {
    expect(r.advantage).toBeCloseTo(1470.0949769027902, 6);
    expect(r.advantage).toBeCloseTo(r.compoundInterest - r.simpleInterest, 10);
  });

  it('final balances reconcile: each equals principal + its interest', () => {
    expect(r.simpleFinal).toBeCloseTo(10000 + r.simpleInterest, 10);
    expect(r.compoundFinal).toBeCloseTo(10000 + r.compoundInterest, 10);
  });

  it('compound outgrows simple over this horizon (advantage strictly positive)', () => {
    expect(r.compoundInterest).toBeGreaterThan(r.simpleInterest);
    expect(r.advantage).toBeGreaterThan(0);
  });
});

describe('interest comparison — composition invariants', () => {
  it('the SAME principal/rate/years feed both engines (simple ignores frequency)', () => {
    // simple is independent of compoundsPerYear: identical across every frequency
    const freqs = [1, 4, 12, 365];
    const simples = freqs.map((n) => compareInterest(10000, 5, 10, n).simpleInterest);
    for (const s of simples) expect(s).toBe(5000);
    const totals = freqs.map((n) => compareInterest(10000, 5, 10, n).simpleFinal);
    for (const t of totals) expect(t).toBe(15000);
  });

  it('only the compound side responds to compounding frequency', () => {
    const a = compareInterest(10000, 5, 10, 1);
    const b = compareInterest(10000, 5, 10, 365);
    expect(a.simpleInterest).toBe(b.simpleInterest); // simple unchanged
    expect(a.compoundInterest).not.toBeCloseTo(b.compoundInterest, 2); // compound changes
  });
});

describe('interest comparison — frequency sweep (10000 / 5% / 10y)', () => {
  // Frozen compound.totalInterest at each supported frequency; simple stays 5000 throughout.
  const cases: Array<[number, number, number]> = [
    // [compoundsPerYear, compoundInterest, compoundFinal]
    [1, 6288.946267774418, 16288.946267774418],
    [4, 6436.194634870109, 16436.19463487011],
    [12, 6470.09497690279, 16470.09497690279],
    [365, 6486.648137652352, 16486.64813765235],
  ];

  for (const [n, ci, cf] of cases) {
    it(`n=${n}: compound interest ≈ ${ci.toFixed(2)}, final ≈ ${cf.toFixed(2)}; simple stays 5000`, () => {
      const r = compareInterest(10000, 5, 10, n);
      expect(r.compoundInterest).toBeCloseTo(ci, 6);
      expect(r.compoundFinal).toBeCloseTo(cf, 6);
      expect(r.simpleInterest).toBe(5000);
      expect(r.advantage).toBeCloseTo(ci - 5000, 6);
    });
  }

  it('more frequent compounding earns strictly more (annually < quarterly < monthly < daily)', () => {
    const [i1, i4, i12, i365] = [1, 4, 12, 365].map((n) => compareInterest(10000, 5, 10, n).compoundInterest);
    expect(i1).toBeLessThan(i4);
    expect(i4).toBeLessThan(i12);
    expect(i12).toBeLessThan(i365);
  });
});

describe('interest comparison — zero cases (all valid, all finite)', () => {
  it('zero principal → every figure is zero', () => {
    const r = compareInterest(0, 5, 10, 12);
    expect(r).toEqual({ simpleInterest: 0, simpleFinal: 0, compoundInterest: 0, compoundFinal: 0, advantage: 0 });
  });

  it('zero rate → no interest either way; both finals equal the principal; advantage 0', () => {
    const r = compareInterest(10000, 0, 10, 12);
    expect(r.simpleInterest).toBe(0);
    expect(r.compoundInterest).toBe(0);
    expect(r.simpleFinal).toBe(10000);
    expect(r.compoundFinal).toBe(10000);
    expect(r.advantage).toBe(0);
  });

  it('zero years → no interest either way; both finals equal the principal; advantage 0', () => {
    const r = compareInterest(10000, 5, 0, 12);
    expect(r.simpleInterest).toBe(0);
    expect(r.compoundInterest).toBe(0);
    expect(r.simpleFinal).toBe(10000);
    expect(r.compoundFinal).toBe(10000);
    expect(r.advantage).toBe(0);
  });
});

describe('interest comparison — decimals and fractional years', () => {
  it('decimal principal/rate and a fractional duration keep full precision', () => {
    const r = compareInterest(2500.5, 3.75, 7.5, 12);
    expect(r.simpleInterest).toBeCloseTo(703.265625, 6);
    expect(r.simpleFinal).toBeCloseTo(3203.765625, 6);
    expect(r.compoundInterest).toBeCloseTo(810.671890304015, 6);
    expect(r.compoundFinal).toBeCloseTo(3311.171890304015, 6);
    expect(r.advantage).toBeCloseTo(107.40626530401505, 6);
  });

  it('a fractional year rounds to whole compounding periods (compound engine: round(years·n))', () => {
    // 0.5y at n=12 → round(6) = 6 periods; simple is exactly linear in time.
    const r = compareInterest(10000, 6, 0.5, 12);
    expect(r.simpleInterest).toBeCloseTo(10000 * 0.06 * 0.5, 6); // 300
    // compound: 6 monthly periods at 0.5% each
    expect(r.compoundFinal).toBeCloseTo(10000 * Math.pow(1 + 0.06 / 12, 6), 6);
  });
});

describe('interest comparison — negative inputs (frozen engine behaviour; the binding rejects these)', () => {
  it('negative principal is CLAMPED to zero by BOTH engines → all-zero result', () => {
    const r = compareInterest(-10000, 5, 10, 12);
    expect(r.simpleInterest).toBe(0);
    expect(r.simpleFinal).toBe(0);
    expect(r.compoundInterest).toBe(0);
    expect(r.compoundFinal).toBe(0);
    expect(r.advantage).toBe(0);
  });

  it('a negative rate: simple goes linearly negative; compound shrinks below principal', () => {
    const r = compareInterest(10000, -5, 10, 12);
    expect(r.simpleInterest).toBeCloseTo(10000 * -0.05 * 10, 6); // -5000
    expect(r.simpleFinal).toBeCloseTo(5000, 6);
    expect(r.compoundInterest).toBeLessThan(0); // shrinking balance
    expect(r.compoundFinal).toBeLessThan(10000);
  });

  it('a negative duration: simple is unclamped negative; compound treats it as zero periods', () => {
    const r = compareInterest(10000, 5, -10, 12);
    expect(r.simpleInterest).toBeCloseTo(-5000, 6); // simple: P·r·t with t negative
    // compound: totalPeriods = round(-10·12) is negative → loop body never runs → futureValue = principal
    expect(r.compoundFinal).toBe(10000);
    expect(r.compoundInterest).toBe(0);
  });
});

describe('interest comparison — non-finite inputs relevant to the composed result', () => {
  it('NaN principal collapses to 0 via each engine`s `|| 0` / Math.max → an all-zero, finite result', () => {
    const r = compareInterest(NaN, 5, 10, 12);
    expect(Number.isFinite(r.simpleInterest)).toBe(true);
    expect(r.simpleInterest).toBe(0);
    expect(r.compoundInterest).toBe(0);
    expect(r.advantage).toBe(0);
  });

  it('NaN rate → no interest either side; finals equal the principal (finite)', () => {
    const r = compareInterest(10000, NaN, 10, 12);
    expect(r.simpleInterest).toBe(0);
    expect(r.simpleFinal).toBe(10000);
    expect(r.compoundInterest).toBeCloseTo(0, 6);
    expect(r.compoundFinal).toBeCloseTo(10000, 6);
  });

  it('Infinity principal propagates to non-finite figures (documents why the binding rejects it)', () => {
    const r = compareInterest(Infinity, 5, 10, 12);
    expect(Number.isFinite(r.simpleInterest)).toBe(false);
  });
});

describe('interest comparison — compound frequency normalization (inherited from the compound engine)', () => {
  it('compoundsPerYear is coerced to max(1, round(n)): 0 → 1 (annual), fractional rounds', () => {
    const zero = compareInterest(10000, 5, 10, 0);
    const one = compareInterest(10000, 5, 10, 1);
    expect(zero.compoundFinal).toBeCloseTo(one.compoundFinal, 6); // n=0 behaves as n=1
    const twoish = compareInterest(10000, 5, 10, 2.7);
    const three = compareInterest(10000, 5, 10, 3);
    expect(twoish.compoundFinal).toBeCloseTo(three.compoundFinal, 6); // 2.7 → round → 3
  });

  it('a negative frequency is clamped to 1 (annual) by the compound engine', () => {
    const neg = compareInterest(10000, 5, 10, -12);
    const one = compareInterest(10000, 5, 10, 1);
    expect(neg.compoundFinal).toBeCloseTo(one.compoundFinal, 6);
  });
});

describe('interest comparison — finite-result reconciliation over the binding-validated domain', () => {
  it('every finite, non-negative input (rate/years ≥ 0, freq ∈ {1,4,12,365}) yields five finite figures', () => {
    const principals = [0, 1000, 250000.75];
    const rates = [0, 2.5, 12];
    const yearsList = [0, 1, 30];
    const freqs = [1, 4, 12, 365];
    for (const P of principals)
      for (const rate of rates)
        for (const t of yearsList)
          for (const n of freqs) {
            const r = compareInterest(P, rate, t, n);
            for (const v of [r.simpleInterest, r.simpleFinal, r.compoundInterest, r.compoundFinal, r.advantage]) {
              expect(Number.isFinite(v)).toBe(true);
            }
            // advantage always reconciles with its definition
            expect(r.advantage).toBeCloseTo(r.compoundInterest - r.simpleInterest, 6);
          }
  });
});
