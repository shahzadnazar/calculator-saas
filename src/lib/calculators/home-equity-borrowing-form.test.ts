import { describe, it, expect } from 'vitest';
import {
  BORROWING_EXAMPLE_VALUES,
  DEFAULT_LTV,
  LTV_OPTIONS,
  MSG,
  borrowingBinding,
  completeBorrowingValue,
  computeBorrowing,
  describeBorrowing,
  isUsableBorrowingResult,
  presentBorrowing,
  validateBorrowing,
  type BorrowingComputed,
  type BorrowingFormValues,
} from './home-equity-borrowing-form';

/**
 * The borrowing-power binding, pinned to the published reference case: a $600,000 home
 * with $250,000 owed and an 80% cap may borrow up to $230,000, at a current
 * loan-to-value of 41.7%.
 */

const REF: BorrowingFormValues = BORROWING_EXAMPLE_VALUES;
const at = (over: Partial<BorrowingFormValues> = {}): BorrowingFormValues => ({ ...REF, ...over });
const errs = (v: BorrowingFormValues): Record<string, string> => {
  const r = validateBorrowing(v);
  return r.ok ? {} : (r.fieldErrors ?? {});
};

describe('validation', () => {
  it('accepts the reference entry', () => {
    expect(validateBorrowing(REF)).toEqual({ ok: true });
  });

  it('requires a home value greater than zero', () => {
    expect(errs(at({ homeValue: '' })).homeValue).toBe(MSG.homeValueRequired);
    for (const bad of ['0', '-1', 'abc']) {
      expect(errs(at({ homeValue: bad })).homeValue).toBe(MSG.homeValuePositive);
    }
  });

  it('requires a mortgage balance but allows zero — an unmortgaged home is normal', () => {
    expect(errs(at({ mortgageBalance: '' })).mortgageBalance).toBe(MSG.mortgageRequired);
    expect(errs(at({ mortgageBalance: '-1' })).mortgageBalance).toBe(MSG.mortgageNonNeg);
    expect(validateBorrowing(at({ mortgageBalance: '0' }))).toEqual({ ok: true });
  });

  it('requires a loan-to-value in (0, 100]', () => {
    expect(errs(at({ maxLtvPct: '' })).maxLtvPct).toBe(MSG.ltvRequired);
    for (const bad of ['0', '-5', '101']) {
      expect(errs(at({ maxLtvPct: bad })).maxLtvPct).toBe(MSG.ltvRange);
    }
    expect(validateBorrowing(at({ maxLtvPct: '100' }))).toEqual({ ok: true });
  });

  it('every offered ratio is one the calculator accepts', () => {
    for (const ltv of LTV_OPTIONS) {
      expect(validateBorrowing(at({ maxLtvPct: String(ltv) }))).toEqual({ ok: true });
    }
    expect(LTV_OPTIONS.map(String)).toContain(DEFAULT_LTV);
  });
});

describe('the reference case', () => {
  const c = computeBorrowing(REF);
  const p = presentBorrowing(c);

  it('reports the room under the cap as the dominant answer', () => {
    expect(c.result.maxBorrow).toBe(230000);
    expect(p.headline).toBe('$230,000');
    // The summary label already says "You may borrow up to", so repeating it here
    // would be the same sentence twice.
    expect(p.summary).toBe('');
  });

  it('reports the current loan-to-value the reference prints', () => {
    expect(p.currentLtv).toBe('41.7%');
    expect(p.atCap).toBe(false);
  });

  it('shows the equity behind the figure', () => {
    expect(p.equity).toBe('$350,000.00');
  });

  it('announces both facts', () => {
    expect(describeBorrowing(c)).toBe(
      'You may borrow up to $230,000. Your current loan-to-value ratio is 41.7 percent.',
    );
  });
});

describe('when the cap leaves nothing', () => {
  const c = computeBorrowing({ homeValue: '500000', mortgageBalance: '400000', maxLtvPct: '80' });

  it('is a valid informational result, not an input error', () => {
    expect(validateBorrowing({ homeValue: '500000', mortgageBalance: '400000', maxLtvPct: '80' })).toEqual({
      ok: true,
    });
    expect(isUsableBorrowingResult(c)).toBe(true);
  });

  it('says so plainly, and still reports the equity that exists', () => {
    const p = presentBorrowing(c);
    expect(p.headline).toBe('Nothing');
    expect(p.atCap).toBe(true);
    expect(p.summary).toContain('nothing left to borrow');
    expect(p.summary).toContain('$100,000'); // the equity is real, just not borrowable
    expect(p.currentLtv).toBe('80%');
  });

  it('announces without a dollar figure', () => {
    expect(describeBorrowing(c)).toBe(
      'There is nothing left to borrow at this loan-to-value cap. Your current loan-to-value ratio is 80 percent.',
    );
  });

  it('never shows a negative maximum for a home worth less than its mortgage', () => {
    const under = computeBorrowing({ homeValue: '300000', mortgageBalance: '340000', maxLtvPct: '80' });
    expect(under.result.maxBorrow).toBe(0);
    expect(presentBorrowing(under).headline).toBe('Nothing');
    expect(presentBorrowing(under).summary).not.toMatch(/-\$|NaN|Infinity/);
  });
});

describe('the complete-result guard', () => {
  const good = computeBorrowing(REF);
  const broken = (mutate: (c: BorrowingComputed) => void): BorrowingComputed => {
    const copy = JSON.parse(JSON.stringify(good)) as BorrowingComputed;
    mutate(copy);
    return copy;
  };

  it('accepts a result that reconciles, returning the maximum', () => {
    expect(completeBorrowingValue(good)).toBe(230000);
  });

  it('rejects figures that do not follow from the inputs', () => {
    expect(completeBorrowingValue(broken((c) => (c.result.maxBorrow += 1000)))).toBeNaN();
    expect(completeBorrowingValue(broken((c) => (c.result.equity += 1000)))).toBeNaN();
    expect(completeBorrowingValue(broken((c) => (c.result.currentLtvPct += 5)))).toBeNaN();
    expect(completeBorrowingValue(broken((c) => (c.result.atCap = true)))).toBeNaN();
  });

  it('rejects a maximum larger than the equity behind it', () => {
    expect(
      completeBorrowingValue(
        broken((c) => {
          c.result.maxBorrow = 400000;
          c.result.equity = 350000;
        }),
      ),
    ).toBeNaN();
  });

  it('rejects a non-finite or impossible input', () => {
    expect(completeBorrowingValue(broken((c) => (c.homeValue = 0)))).toBeNaN();
    expect(completeBorrowingValue(broken((c) => (c.mortgageBalance = -1)))).toBeNaN();
    expect(completeBorrowingValue(broken((c) => (c.maxLtvPct = 0)))).toBeNaN();
    expect(completeBorrowingValue(broken((c) => (c.maxLtvPct = 120)))).toBeNaN();
    expect(completeBorrowingValue(broken((c) => (c.result.maxBorrow = Number.NaN)))).toBeNaN();
  });

  it('a malformed result is unusable even though zero maxima are allowed', () => {
    expect(isUsableBorrowingResult(broken((c) => (c.result.equity += 1000)))).toBe(false);
  });
});

describe('the worked example', () => {
  it('validates, so the example a visitor sees is a real calculation', () => {
    expect(validateBorrowing(BORROWING_EXAMPLE_VALUES)).toEqual({ ok: true });
  });

  it('is the published reference case and passes the same guard as any other result', () => {
    const c = computeBorrowing(BORROWING_EXAMPLE_VALUES);
    expect(borrowingBinding.resultValue(c)).toBe(230000);
    expect(borrowingBinding.isUsableResult!(c)).toBe(true);
  });
});
