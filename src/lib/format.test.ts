import { describe, it, expect } from 'vitest';
import { presentDuration, payoffParts, formatCurrency } from './format';

/**
 * Shared payoff-duration presenter (extracted from payment-form in R8C1 so both the
 * Payment and Credit-Card payoff calculators consume one neutral formatter). These
 * lock the normalized wording — the residual-12 carry, singular/plural, no trailing
 * "0 months", the sub-month and non-finite policies — independent of any calculator.
 */

describe('payoffParts — normalized whole-year / residual-month split', () => {
  it('carries a residual that rounds to 12 into the next year', () => {
    expect(payoffParts(56.3)).toEqual({ years: 4, months: 8 }); // ordinary, no carry
    expect(payoffParts(12)).toEqual({ years: 1, months: 0 });
    expect(payoffParts(11.4)).toEqual({ years: 0, months: 11 }); // rounds to 11 — no carry
    expect(payoffParts(11.6)).toEqual({ years: 1, months: 0 }); // residual 12 → carry
    expect(payoffParts(59.5)).toEqual({ years: 5, months: 0 }); // multi-year boundary carry
  });
});

describe('presentDuration — visible + accessible payoff wording', () => {
  it('reads naturally across the accepted shapes', () => {
    expect(presentDuration(0.25)).toEqual({ display: 'Less than 1 month', spoken: 'less than 1 month' });
    expect(presentDuration(1)).toEqual({ display: '1 month', spoken: '1 month' });
    expect(presentDuration(8)).toEqual({ display: '8 months', spoken: '8 months' });
    expect(presentDuration(12)).toEqual({ display: '1 year', spoken: '1 year' });
    expect(presentDuration(13)).toEqual({ display: '1 year, 1 month', spoken: '1 year and 1 month' });
    expect(presentDuration(30)).toEqual({ display: '2 years, 6 months', spoken: '2 years and 6 months' });
    expect(presentDuration(11.4)).toEqual({ display: '11 months', spoken: '11 months' }); // rounds to 11
  });

  it('carries a 12-residual into the next year (never "12 months" after a year)', () => {
    expect(presentDuration(11.6)).toEqual({ display: '1 year', spoken: '1 year' });
    expect(presentDuration(59.5)).toEqual({ display: '5 years', spoken: '5 years' });
    expect(presentDuration(23.6)).toEqual({ display: '2 years', spoken: '2 years' });
  });

  it('never emits "12 months", "0 years", a trailing "0 months", or terse text', () => {
    for (const m of [0.6, 11.5, 11.6, 12, 23.6, 24, 59.5, 120, 359.9]) {
      const { display, spoken } = presentDuration(m);
      for (const s of [display, spoken]) {
        expect(s).not.toMatch(/12 months/);
        expect(s).not.toMatch(/\b0 (years|months)\b/);
        expect(s).not.toMatch(/\d+y\b/); // no terse "4y"
        expect(s).not.toMatch(/\d+m\b/); // no terse "10m"
      }
    }
  });

  it('zero raw months uses the sub-month display policy', () => {
    expect(presentDuration(0)).toEqual({ display: 'Less than 1 month', spoken: 'less than 1 month' });
  });

  it('non-finite and negative inputs yield the neutral dash — never NaN/Infinity/undefined', () => {
    for (const bad of [NaN, Infinity, -Infinity, -5]) {
      const { display, spoken } = presentDuration(bad);
      expect(display).toBe('—');
      expect(spoken).toBe('');
      expect(display).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});

describe('formatCurrency — non-finite guard (relied on by payoff breakdowns)', () => {
  it('formats USD to two decimals and dashes a non-finite value', () => {
    expect(formatCurrency(1600)).toBe('$1,600.00');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(Infinity)).toBe('—');
    expect(formatCurrency(NaN)).toBe('—');
  });
});
