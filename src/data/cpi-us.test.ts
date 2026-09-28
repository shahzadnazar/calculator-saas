import { describe, it, expect } from 'vitest';
import { CPI_FIRST_YEAR, CPI_MONTHLY } from './cpi-us';

/**
 * Provenance tests for the CPI-U series. This file is data we did not compute, so the
 * tests check it against figures BLS published independently of the series itself: the
 * annual averages it prints, and the 12-month changes it announced each month of 2026.
 * If a regeneration ever pulls in a bad series, these fail.
 */

const at = (year: number, month: number) => CPI_MONTHLY[year - CPI_FIRST_YEAR][month - 1];
const annualAverage = (year: number) => {
  const row = CPI_MONTHLY[year - CPI_FIRST_YEAR] as number[];
  return Math.round((row.reduce((a, b) => a + b, 0) / 12) * 1000) / 1000;
};

describe('shape', () => {
  it('starts in 1913 and runs to the present with twelve slots a year', () => {
    expect(CPI_FIRST_YEAR).toBe(1913);
    for (const row of CPI_MONTHLY) expect(row).toHaveLength(12);
  });

  it('opens on the first index BLS ever published', () => {
    expect(at(1913, 1)).toBe(9.8);
  });

  it('every present value is a positive number', () => {
    for (const row of CPI_MONTHLY) {
      for (const v of row) {
        if (v === null) continue;
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
    }
  });
});

describe('the values match what BLS published', () => {
  it('reproduces published annual averages', () => {
    expect(annualAverage(2016)).toBe(240.007);
    expect(annualAverage(2020)).toBe(258.811);
    expect(annualAverage(2024)).toBe(313.689);
  });

  it('reproduces each 2026 month from its announced 12-month change', () => {
    // The rate BLS headlined with each release, against the same month a year earlier.
    const announced: [number, number][] = [
      [1, 2.4], [2, 2.4], [3, 3.3], [4, 3.8], [5, 4.2], [6, 3.5], [7, 3.4],
    ];
    for (const [month, pct] of announced) {
      const now = at(2026, month) as number;
      const before = at(2025, month) as number;
      expect(Number(((now / before - 1) * 100).toFixed(1))).toBe(pct);
    }
  });

  it('holds the September 2025 and July 2026 index levels', () => {
    expect(at(2025, 9)).toBe(324.8);
    expect(at(2026, 7)).toBe(333.918);
  });
});

describe('gaps stay gaps', () => {
  it('has no October 2025 — prices were never collected that month', () => {
    expect(at(2025, 10)).toBeNull();
  });

  it('does not interpolate the hole from its neighbours', () => {
    const midpoint = ((at(2025, 9) as number) + (at(2025, 11) as number)) / 2;
    expect(at(2025, 10)).not.toBe(Math.round(midpoint * 1000) / 1000);
  });

  it('leaves only future months missing after that', () => {
    const missing: string[] = [];
    CPI_MONTHLY.forEach((row, i) => {
      row.forEach((v, j) => {
        if (v === null) missing.push(`${CPI_FIRST_YEAR + i}-${String(j + 1).padStart(2, '0')}`);
      });
    });
    expect(missing).toEqual(['2025-10', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
  });

  it('carries no linear-interpolation artefact in the three-decimal era', () => {
    // A published index landing exactly on the midpoint of its neighbours to three
    // decimals is the signature of a filled-in hole, not of real data.
    const flat: (number | null)[] = CPI_MONTHLY.flatMap((r) => [...r]);
    const start = flat.length - 12 * 20; // the modern, three-decimal stretch
    for (let k = start + 1; k < flat.length - 1; k += 1) {
      const [a, b, c] = [flat[k - 1], flat[k], flat[k + 1]];
      if (a === null || b === null || c === null || a === c) continue;
      expect(Math.abs(b - (a + c) / 2)).toBeGreaterThan(1e-9);
    }
  });
});
