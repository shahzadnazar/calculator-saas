import { describe, it, expect } from 'vitest';
import {
  VAT_QUANTITIES,
  addVat,
  givenOf,
  removeVat,
  solveVat,
  type VatQuantity,
  type VatSolveInput,
} from './vat';

/**
 * The published reference case: a 20% rate on a net of 1,200 gives 240 of tax and a gross of
 * 1,440. Every pair drawn from those four numbers must reproduce the other two, which is the
 * real contract of a four-quantity solver.
 */
const REF = { ratePct: 20, net: 1200, gross: 1440, tax: 240 } as const;

const blank: VatSolveInput = { ratePct: null, net: null, gross: null, tax: null };

/** Supply exactly the named quantities from the reference case. */
const from = (...given: VatQuantity[]): VatSolveInput => {
  const input: VatSolveInput = { ...blank };
  for (const q of given) input[q] = REF[q];
  return input;
};

const round = (n: number) => Math.round(n * 1e6) / 1e6;

describe('givenOf', () => {
  it('reports the supplied quantities in canonical order, whatever order they arrived in', () => {
    expect(givenOf({ ...blank, tax: 240, ratePct: 20 })).toEqual(['ratePct', 'tax']);
    expect(givenOf({ ...blank, gross: 1440, net: 1200 })).toEqual(['net', 'gross']);
  });

  it('counts a zero as given — zero is a real VAT rate, not a blank', () => {
    expect(givenOf({ ...blank, ratePct: 0 })).toEqual(['ratePct']);
  });
});

describe('every pair reproduces the reference sale', () => {
  const pairs: VatQuantity[][] = [
    ['ratePct', 'net'],
    ['ratePct', 'gross'],
    ['ratePct', 'tax'],
    ['net', 'gross'],
    ['net', 'tax'],
    ['gross', 'tax'],
  ];

  for (const pair of pairs) {
    it(`${pair.join(' + ')} gives the other two`, () => {
      const r = solveVat(from(...pair));
      expect(r.unsolvable).toBe(false);
      expect(round(r.ratePct)).toBe(20);
      expect(round(r.net)).toBe(1200);
      expect(round(r.gross)).toBe(1440);
      expect(round(r.tax)).toBe(240);
    });
  }

  it('reports which two were given and which two were worked out', () => {
    const r = solveVat(from('ratePct', 'net'));
    expect(r.given).toEqual(['ratePct', 'net']);
    expect(r.solvedFor).toEqual(['gross', 'tax']);
  });

  it('covers all four quantities between given and solvedFor, with no overlap', () => {
    for (const pair of pairs) {
      const r = solveVat(from(...pair));
      expect([...r.given, ...r.solvedFor].sort()).toEqual([...VAT_QUANTITIES].sort());
      expect(r.given.some((q) => r.solvedFor.includes(q))).toBe(false);
    }
  });
});

describe('the two identities hold for every pair', () => {
  it('tax is always rate% of net, and gross is always net + tax', () => {
    const cases: VatSolveInput[] = [
      { ...blank, ratePct: 7.5, net: 89.99 },
      { ...blank, ratePct: 5, gross: 210 },
      { ...blank, ratePct: 23, tax: 46 },
      { ...blank, net: 80, gross: 96.8 },
      { ...blank, net: 250, tax: 52.5 },
      { ...blank, gross: 121, tax: 21 },
    ];
    for (const input of cases) {
      const r = solveVat(input);
      expect(r.unsolvable).toBe(false);
      expect(r.tax).toBeCloseTo(r.net * (r.ratePct / 100), 8);
      expect(r.gross).toBeCloseTo(r.net + r.tax, 8);
    }
  });
});

describe('a zero rate is a real answer, not an error', () => {
  it('zero-rated goods: 0% on a net of 500 is no tax and a gross of 500', () => {
    const r = solveVat({ ...blank, ratePct: 0, net: 500 });
    expect(r.unsolvable).toBe(false);
    expect(r.tax).toBe(0);
    expect(r.gross).toBe(500);
  });

  it('a gross equal to its net reads back as 0%', () => {
    const r = solveVat({ ...blank, net: 500, gross: 500 });
    expect(r.unsolvable).toBe(false);
    expect(r.ratePct).toBe(0);
    expect(r.tax).toBe(0);
  });
});

describe('unsolvable pairs return NaN throughout, never zero or Infinity', () => {
  const expectNoSolution = (input: VatSolveInput) => {
    const r = solveVat(input);
    expect(r.unsolvable).toBe(true);
    for (const q of VAT_QUANTITIES) expect(Number.isNaN(r[q])).toBe(true);
  };

  it('fewer than two given', () => {
    expectNoSolution(blank);
    expectNoSolution({ ...blank, net: 1200 });
  });

  it('more than two given', () => {
    expectNoSolution({ ...blank, ratePct: 20, net: 1200, gross: 1440 });
  });

  it('a rate asked for against a net of nothing — every rate at once', () => {
    expectNoSolution({ ...blank, net: 0, tax: 0 });
    expectNoSolution({ ...blank, net: 0, gross: 0 });
  });

  it('a net asked for from a tax amount at 0% — no rate can produce it', () => {
    expectNoSolution({ ...blank, ratePct: 0, tax: 100 });
    expectNoSolution({ ...blank, ratePct: 0, tax: 0 });
  });

  it('a gross below its own net, or below its own tax', () => {
    expectNoSolution({ ...blank, net: 1200, gross: 900 });
    expectNoSolution({ ...blank, gross: 100, tax: 240 });
  });

  it('a gross exactly equal to its tax, leaving nothing to charge tax on', () => {
    expectNoSolution({ ...blank, gross: 240, tax: 240 });
  });

  it('any negative figure', () => {
    expectNoSolution({ ...blank, ratePct: -20, net: 1200 });
    expectNoSolution({ ...blank, ratePct: 20, net: -1200 });
    expectNoSolution({ ...blank, gross: 1440, tax: -240 });
  });

  it('a non-finite figure', () => {
    expectNoSolution({ ...blank, ratePct: Number.NaN, net: 1200 });
    expectNoSolution({ ...blank, ratePct: 20, net: Number.POSITIVE_INFINITY });
  });
});

describe('addVat / removeVat are exact inverses', () => {
  it('adds VAT to a net price', () => {
    expect(addVat(1200, 20)).toEqual({ net: 1200, tax: 240, gross: 1440 });
  });

  it('takes VAT back out of a gross price', () => {
    const r = removeVat(1440, 20);
    expect(round(r.net)).toBe(1200);
    expect(round(r.tax)).toBe(240);
    expect(r.gross).toBe(1440);
  });

  it('round-trips at awkward rates', () => {
    for (const rate of [5, 7.7, 19, 20, 21, 23, 27]) {
      const there = addVat(837.41, rate);
      const back = removeVat(there.gross, rate);
      expect(back.net).toBeCloseTo(837.41, 9);
    }
  });

  it('removing VAT DIVIDES rather than subtracting — the classic error', () => {
    const wrong = 1440 - 1440 * 0.2; // 1152
    expect(round(removeVat(1440, 20).net)).toBe(1200);
    expect(removeVat(1440, 20).net).not.toBeCloseTo(wrong, 2);
  });
});
