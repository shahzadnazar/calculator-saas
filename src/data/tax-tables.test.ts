import { describe, it, expect } from 'vitest';
import { FILING_STATUS_LABELS, SUPPORTED_TAX_YEARS, TAX_YEARS, statusKey } from './tax-tables';

/**
 * Provenance tests. These are figures we did not compute, so they are checked against what
 * the IRS published — Rev. Proc. 2024-40 for 2025 and Rev. Proc. 2025-32 for 2026, both as
 * amended by the One Big Beautiful Bill Act. If a future edit fat-fingers a threshold,
 * these fail rather than the calculator quietly returning a wrong return.
 */

describe('published 2025 figures', () => {
  const t = TAX_YEARS[2025];

  it('standard deductions', () => {
    expect(t.standardDeduction).toEqual({ single: 15750, mfj: 31500, mfs: 15750, hoh: 23625 });
  });

  it('bracket floors', () => {
    expect(t.brackets.single.map((b) => b.upTo).slice(0, 6)).toEqual([11925, 48475, 103350, 197300, 250525, 626350]);
    expect(t.brackets.mfj.map((b) => b.upTo).slice(0, 6)).toEqual([23850, 96950, 206700, 394600, 501050, 751600]);
    expect(t.brackets.hoh.map((b) => b.upTo).slice(0, 6)).toEqual([17000, 64850, 103350, 197300, 250525, 626350]);
  });

  it('capital gains thresholds', () => {
    expect(t.capitalGains.single).toEqual({ zeroUpTo: 48350, fifteenUpTo: 533400 });
    expect(t.capitalGains.mfj).toEqual({ zeroUpTo: 96700, fifteenUpTo: 600050 });
    expect(t.capitalGains.hoh).toEqual({ zeroUpTo: 64750, fifteenUpTo: 566700 });
  });

  it('AMT exemptions', () => {
    expect(t.amt.exemption).toEqual({ single: 88100, mfj: 137000, mfs: 68650, hoh: 88100 });
  });

  it('the OBBBA deductions and their caps', () => {
    expect(t.temporaryDeductions.tipsMax).toBe(25000);
    expect(t.temporaryDeductions.overtimeMax.single).toBe(12500);
    expect(t.temporaryDeductions.overtimeMax.mfj).toBe(25000);
    expect(t.temporaryDeductions.carLoanInterestMax).toBe(10000);
    expect(t.temporaryDeductions.seniorDeduction).toBe(6000);
    expect(t.saltCap.cap).toBe(40000);
  });
});

describe('published 2026 figures', () => {
  const t = TAX_YEARS[2026];

  it('standard deductions', () => {
    expect(t.standardDeduction).toEqual({ single: 16100, mfj: 32200, mfs: 16100, hoh: 24150 });
  });

  it('bracket floors', () => {
    expect(t.brackets.single.map((b) => b.upTo).slice(0, 6)).toEqual([12400, 50400, 105700, 201775, 256225, 640600]);
    expect(t.brackets.mfj.map((b) => b.upTo).slice(0, 6)).toEqual([24800, 100800, 211400, 403550, 512450, 768700]);
  });

  it('capital gains thresholds', () => {
    expect(t.capitalGains.single).toEqual({ zeroUpTo: 49450, fifteenUpTo: 545500 });
    expect(t.capitalGains.hoh).toEqual({ zeroUpTo: 66200, fifteenUpTo: 579600 });
    expect(t.capitalGains.mfj).toEqual({ zeroUpTo: 98900, fifteenUpTo: 613700 });
    expect(t.capitalGains.mfs).toEqual({ zeroUpTo: 49450, fifteenUpTo: 306850 });
  });

  it('AMT exemptions and the extra deduction at 65', () => {
    expect(t.amt.exemption.single).toBe(90100);
    expect(t.amt.exemption.mfj).toBe(140200);
    expect(t.additionalOver65.single).toBe(2050);
    expect(t.additionalOver65.mfj).toBe(1650);
  });
});

describe('shape', () => {
  it('offers both supported years, newest first', () => {
    expect([...SUPPORTED_TAX_YEARS]).toEqual([2026, 2025]);
    for (const y of SUPPORTED_TAX_YEARS) expect(TAX_YEARS[y]).toBeDefined();
  });

  it('names the five filing statuses', () => {
    expect(FILING_STATUS_LABELS.map((f) => f.label)).toEqual([
      'Single', 'Married Filing Jointly', 'Married Filing Separately', 'Head of Household', 'Qualified Widow(er)',
    ]);
  });

  it('files a qualifying surviving spouse on the joint tables', () => {
    expect(statusKey('qss')).toBe('mfj');
    expect(statusKey('single')).toBe('single');
  });

  it('never indexed the net investment income thresholds', () => {
    expect(TAX_YEARS[2025].niitThreshold).toEqual(TAX_YEARS[2026].niitThreshold);
    expect(TAX_YEARS[2025].niitThreshold.single).toBe(200000);
  });

  it('inflation moved every 2026 bracket up, none down', () => {
    for (const key of ['single', 'mfj', 'mfs', 'hoh'] as const) {
      const a = TAX_YEARS[2025].brackets[key];
      const b = TAX_YEARS[2026].brackets[key];
      for (let i = 0; i < 6; i += 1) expect(b[i].upTo).toBeGreaterThan(a[i].upTo);
      expect(TAX_YEARS[2026].standardDeduction[key]).toBeGreaterThan(TAX_YEARS[2025].standardDeduction[key]);
    }
  });
});
