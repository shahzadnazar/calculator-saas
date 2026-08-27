import { describe, it, expect } from 'vitest';
import { STATE_SALES_TAX, STATE_TAX_REVIEWED, stateTaxRate } from './state-sales-tax';

/**
 * The table is a CONVENIENCE that pre-fills an editable field, never a figure the
 * maths reads, so these tests guard its shape and internal consistency rather than
 * asserting rates (which are reviewed against primary sources, not against a test).
 */
describe('state sales-tax table', () => {
  it('covers all 50 states plus DC, with unique codes', () => {
    expect(STATE_SALES_TAX.length).toBe(51);
    expect(new Set(STATE_SALES_TAX.map((s) => s.code)).size).toBe(51);
    expect(new Set(STATE_SALES_TAX.map((s) => s.name)).size).toBe(51);
  });
  it('uses two-letter uppercase codes and non-empty names', () => {
    for (const s of STATE_SALES_TAX) {
      expect(s.code).toMatch(/^[A-Z]{2}$/);
      expect(s.name.trim().length).toBeGreaterThan(0);
    }
  });
  it('every rate is finite and within a plausible 0–15%', () => {
    for (const s of STATE_SALES_TAX) {
      expect(Number.isFinite(s.ratePct)).toBe(true);
      expect(s.ratePct).toBeGreaterThanOrEqual(0);
      expect(s.ratePct).toBeLessThanOrEqual(15);
    }
  });
  it('names the five states with no statewide sales tax at 0%', () => {
    const zero = STATE_SALES_TAX.filter((s) => s.ratePct === 0).map((s) => s.code).sort();
    expect(zero).toEqual(['AK', 'DE', 'MT', 'NH', 'OR']);
  });
  it('is listed alphabetically by name, so the selector needs no sorting', () => {
    const names = STATE_SALES_TAX.map((s) => s.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });
  it('carries the review date the UI shows beside the selector', () => {
    expect(STATE_TAX_REVIEWED).toMatch(/^\d{4}-\d{2}$/);
  });
  it('looks a rate up by code, case-insensitively, and is null for anything unknown', () => {
    expect(stateTaxRate('CA')).toBe(stateTaxRate('ca'));
    expect(stateTaxRate('  tx  ')).toBe(stateTaxRate('TX'));
    expect(stateTaxRate('ZZ')).toBeNull();
    expect(stateTaxRate('')).toBeNull();
  });
});
