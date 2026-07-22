import { describe, it, expect } from 'vitest';
import { formatCurrency } from './format';

/**
 * Currency formatter (relied on by payoff breakdowns and every finance calculator). The
 * payoff-duration presenter now lives in @lib/format-duration (R8C1.1) and is tested there.
 */
describe('formatCurrency — non-finite guard', () => {
  it('formats USD to two decimals and dashes a non-finite value', () => {
    expect(formatCurrency(1600)).toBe('$1,600.00');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(Infinity)).toBe('—');
    expect(formatCurrency(NaN)).toBe('—');
  });
});
