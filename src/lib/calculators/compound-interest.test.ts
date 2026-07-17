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
