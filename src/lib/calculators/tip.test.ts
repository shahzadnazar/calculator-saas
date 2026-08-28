import { describe, it, expect } from 'vitest';
import { calculateTip } from './tip';
import { formatCurrency } from '@lib/format';

/**
 * Tip formula characterization (R9B1 Commit 1) — consolidated out of the shared gaps.test.ts
 * into a dedicated file, ahead of the task-first migration.
 *
 * Freezes the EXACT current behaviour of `calculateTip`:
 *   bill    = Math.max(0, bill || 0)              (clamped to >= 0)
 *   tipPct  passed through `|| 0`                 (NOT clamped — a negative rate gives negative tip)
 *   people  = Math.max(1, Math.floor(people||1))  (0 / NaN / <1 / negative collapse to 1;
 *                                                   a fraction floors; Infinity stays Infinity)
 * returning { tipAmount, total, perPersonTip, perPersonTotal }.
 *
 * Three layers are kept separate and only the FIRST is frozen here:
 *   • frozen formula behaviour — this file (no production change in Commit 1),
 *   • binding validation — tip-form.ts (Commit 2) may REJECT negative / fractional / non-finite
 *     visitor inputs even though the pure formula tolerates them,
 *   • displayed USD rounding — presentation-only (`formatCurrency`), shown here to be independent
 *     of the full-precision math.
 *
 * Characterization only: no production code changes, no output changes.
 */

describe('calculateTip — ordinary cases', () => {
  it('representative bill, rate and people: exact tip, total and split', () => {
    expect(calculateTip({ bill: 50, tipPct: 20, people: 2 })).toEqual({
      tipAmount: 10,
      total: 60,
      perPersonTip: 5,
      perPersonTotal: 30,
    });
  });

  it('a single diner is the whole bill plus tip', () => {
    expect(calculateTip({ bill: 50, tipPct: 18, people: 1 })).toEqual({
      tipAmount: 9,
      total: 59,
      perPersonTip: 9,
      perPersonTotal: 59,
    });
  });

  it('a decimal bill keeps full precision', () => {
    const r = calculateTip({ bill: 85.75, tipPct: 18, people: 3 });
    expect(r.tipAmount).toBeCloseTo(15.435, 10);
    expect(r.total).toBeCloseTo(101.185, 10);
    expect(r.perPersonTip).toBeCloseTo(5.145, 10);
    expect(r.perPersonTotal).toBeCloseTo(33.728333, 5);
  });

  it('a decimal tip percentage and a four-way split', () => {
    expect(calculateTip({ bill: 100, tipPct: 15.5, people: 4 })).toEqual({
      tipAmount: 15.5,
      total: 115.5,
      perPersonTip: 3.875,
      perPersonTotal: 28.875,
    });
  });

  it('multiple split counts divide the same total evenly', () => {
    for (const people of [1, 2, 3, 5]) {
      const r = calculateTip({ bill: 120, tipPct: 20, people });
      expect(r.total).toBe(144);
      expect(r.perPersonTotal).toBeCloseTo(144 / people, 9);
      expect(r.perPersonTip).toBeCloseTo(24 / people, 9);
    }
  });
});

describe('calculateTip — zero cases', () => {
  it('a zero bill → every value is 0', () => {
    expect(calculateTip({ bill: 0, tipPct: 20, people: 2 })).toEqual({ tipAmount: 0, total: 0, perPersonTip: 0, perPersonTotal: 0 });
  });

  it('a zero tip rate → no tip, total = bill, split evenly', () => {
    expect(calculateTip({ bill: 50, tipPct: 0, people: 2 })).toEqual({ tipAmount: 0, total: 50, perPersonTip: 0, perPersonTotal: 25 });
  });

  it('zero bill AND zero rate → all zero', () => {
    expect(calculateTip({ bill: 0, tipPct: 0, people: 2 })).toEqual({ tipAmount: 0, total: 0, perPersonTip: 0, perPersonTotal: 0 });
  });

  it('people = 0 collapses to 1 (max(1, floor(0||1)))', () => {
    expect(calculateTip({ bill: 40, tipPct: 15, people: 0 })).toEqual({ tipAmount: 6, total: 46, perPersonTip: 6, perPersonTotal: 46 });
  });
});

describe('calculateTip — current people behaviour (frozen; the binding rejects fractional / <1)', () => {
  it('a fractional people count FLOORS (2.5 → 2)', () => {
    const r = calculateTip({ bill: 60, tipPct: 20, people: 2.5 });
    expect(r.perPersonTotal).toBe(36); // 72 / 2
    expect(r.perPersonTip).toBe(6);
  });

  it('a people count below 1 collapses to 1 (0.5 → 1)', () => {
    expect(calculateTip({ bill: 60, tipPct: 20, people: 0.5 }).perPersonTotal).toBe(72);
  });

  it('a negative people count collapses to 1', () => {
    expect(calculateTip({ bill: 60, tipPct: 20, people: -3 }).perPersonTotal).toBe(72);
  });

  it('NaN people collapses to 1 (NaN || 1)', () => {
    expect(calculateTip({ bill: 60, tipPct: 20, people: NaN }).perPersonTotal).toBe(72);
  });

  it('Infinity people divides to 0 per person (finite, via total / Infinity)', () => {
    const r = calculateTip({ bill: 60, tipPct: 20, people: Infinity });
    expect(r.perPersonTotal).toBe(0);
    expect(r.perPersonTip).toBe(0);
    expect(r.total).toBe(72); // the whole-bill figures stay finite
  });
});

describe('calculateTip — current negative behaviour (frozen; the binding rejects these)', () => {
  it('a negative bill is CLAMPED to zero → all zero', () => {
    expect(calculateTip({ bill: -50, tipPct: 20, people: 2 })).toEqual({ tipAmount: 0, total: 0, perPersonTip: 0, perPersonTotal: 0 });
  });

  it('a negative tip rate is NOT clamped → negative tip, total below bill', () => {
    expect(calculateTip({ bill: 50, tipPct: -20, people: 2 })).toEqual({ tipAmount: -10, total: 40, perPersonTip: -5, perPersonTotal: 20 });
  });

  it('a positive bill with a negative tip yields a negative per-person tip', () => {
    const r = calculateTip({ bill: 50, tipPct: -10, people: 2 });
    expect(r.tipAmount).toBe(-5);
    expect(r.perPersonTip).toBe(-2.5);
    expect(r.perPersonTotal).toBe(22.5);
  });
});

describe('calculateTip — non-finite inputs (frozen; the binding rejects these)', () => {
  it('NaN bill collapses via `|| 0` to 0 → all zero (finite)', () => {
    const r = calculateTip({ bill: NaN, tipPct: 20, people: 2 });
    expect(r).toEqual({ tipAmount: 0, total: 0, perPersonTip: 0, perPersonTotal: 0 });
    expect(Number.isFinite(r.perPersonTotal)).toBe(true);
  });

  it('NaN tip rate collapses via `|| 0` → no tip, total = bill', () => {
    expect(calculateTip({ bill: 50, tipPct: NaN, people: 2 })).toEqual({ tipAmount: 0, total: 50, perPersonTip: 0, perPersonTotal: 25 });
  });

  it('Infinity bill with a positive rate → Infinity everywhere', () => {
    const r = calculateTip({ bill: Infinity, tipPct: 20, people: 2 });
    expect(r.tipAmount).toBe(Infinity);
    expect(r.total).toBe(Infinity);
    expect(r.perPersonTotal).toBe(Infinity);
  });

  it('Infinity bill with a ZERO rate produces NaN (Infinity × 0)', () => {
    const r = calculateTip({ bill: Infinity, tipPct: 0, people: 2 });
    expect(Number.isNaN(r.tipAmount)).toBe(true);
    expect(Number.isNaN(r.total)).toBe(true);
    expect(Number.isNaN(r.perPersonTotal)).toBe(true);
  });

  it('Infinity tip rate → Infinity tip and totals', () => {
    expect(calculateTip({ bill: 50, tipPct: Infinity, people: 2 }).tipAmount).toBe(Infinity);
  });

  it('-Infinity bill clamps to 0 (Math.max) → all zero', () => {
    expect(calculateTip({ bill: -Infinity, tipPct: 20, people: 2 })).toEqual({ tipAmount: 0, total: 0, perPersonTip: 0, perPersonTotal: 0 });
  });
});

describe('calculateTip — reconciliation relationships', () => {
  it('total = bill + tipAmount, and per-person = whole / normalized people, across cases', () => {
    const cases = [
      { bill: 50, tipPct: 20, people: 2, np: 2 },
      { bill: 85.75, tipPct: 18, people: 3, np: 3 },
      { bill: 40, tipPct: 15, people: 0, np: 1 }, // people clamps to 1
      { bill: 60, tipPct: 20, people: 2.5, np: 2 }, // floors to 2
    ];
    for (const { bill, tipPct, people, np } of cases) {
      const r = calculateTip({ bill, tipPct, people });
      const clampedBill = Math.max(0, bill);
      expect(r.total).toBeCloseTo(clampedBill + r.tipAmount, 9);
      expect(r.perPersonTotal).toBeCloseTo(r.total / np, 9);
      expect(r.perPersonTip).toBeCloseTo(r.tipAmount / np, 9);
    }
  });
});

describe('calculateTip — precision vs. displayed USD rounding', () => {
  it('retains full binary precision internally, including float dust', () => {
    const r = calculateTip({ bill: 85.75, tipPct: 18, people: 3 });
    expect(r.tipAmount).not.toBe(15.435); // 15.434999999999999 — dust preserved, not pre-rounded
    expect(r.tipAmount).toBeCloseTo(15.435, 10);
  });

  it('currency rounding is presentation-only: `formatCurrency` rounds to the cent, the math does not', () => {
    const r = calculateTip({ bill: 85.75, tipPct: 18, people: 3 });
    expect(formatCurrency(r.tipAmount)).toBe('$15.43'); // display rounds
    expect(formatCurrency(r.perPersonTotal)).toBe('$33.73'); // 33.72833… → $33.73
    expect(formatCurrency(r.total)).toBe('$101.19'); // 101.185 → $101.19
  });

  it('every finite, non-negative validated input (bill>=0, tip>=0, whole people>=1) yields finite, >=0 outputs', () => {
    for (const c of [
      { bill: 0, tipPct: 0, people: 1 },
      { bill: 50, tipPct: 18, people: 1 },
      { bill: 250.5, tipPct: 22, people: 6 },
      { bill: 0.01, tipPct: 0.01, people: 3 },
    ]) {
      const r = calculateTip(c);
      for (const v of [r.tipAmount, r.total, r.perPersonTip, r.perPersonTotal]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* The tip table                                                       */
/* ------------------------------------------------------------------ */

import { CUSTOMARY_TIP_PCT, TIP_PERCENTAGES, tipTable } from './tip';

/** Frozen against the published reference table for a $55 bill. */
describe('the published tip table', () => {
  const rows = tipTable(55);

  it('offers the ten percentages the reference offers', () => {
    expect(rows.map((r) => r.tipPct)).toEqual([5, 10, 12, 14, 15, 18, 20, 25, 30, 50]);
    expect([...TIP_PERCENTAGES]).toEqual(rows.map((r) => r.tipPct));
  });

  it('reproduces every published tip amount and total', () => {
    const published: [number, number, number][] = [
      [5, 2.75, 57.75],
      [10, 5.5, 60.5],
      [12, 6.6, 61.6],
      [14, 7.7, 62.7],
      [15, 8.25, 63.25],
      [18, 9.9, 64.9],
      [20, 11, 66],
      [25, 13.75, 68.75],
      [30, 16.5, 71.5],
      [50, 27.5, 82.5],
    ];
    for (const [pct, tip, total] of published) {
      const row = rows.find((r) => r.tipPct === pct)!;
      expect(Math.round(row.tipAmount * 100) / 100).toBe(tip);
      expect(Math.round(row.total * 100) / 100).toBe(total);
    }
  });

  it('marks 15% as the customary rate, and only that one', () => {
    expect(CUSTOMARY_TIP_PCT).toBe(15);
    expect(rows.filter((r) => r.customary).map((r) => r.tipPct)).toEqual([15]);
  });

  it('every row adds up', () => {
    for (const r of rows) expect(Math.round((55 + r.tipAmount) * 100) / 100).toBe(Math.round(r.total * 100) / 100);
  });

  it('rises with the percentage', () => {
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].tipAmount).toBeGreaterThan(rows[i - 1].tipAmount);
      expect(rows[i].total).toBeGreaterThan(rows[i - 1].total);
    }
  });
});

describe('tip table edges', () => {
  it('a zero price tips nothing at every rate', () => {
    const rows = tipTable(0);
    expect(rows).toHaveLength(10);
    for (const r of rows) expect(r.tipAmount).toBe(0);
  });

  it('returns no table at all rather than rows of NaN', () => {
    expect(tipTable(Number.NaN)).toEqual([]);
    expect(tipTable(Number.POSITIVE_INFINITY)).toEqual([]);
    expect(tipTable(-1)).toEqual([]);
  });
});
