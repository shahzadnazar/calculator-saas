import { describe, it, expect } from 'vitest';
import {
  validateHomeEquity,
  computeHomeEquity,
  completeHomeEquityValue,
  presentHomeEquity,
  describeHomeEquity,
  spokenUSD,
  homeEquityBinding,
  MAX_TERM_YEARS,
  MSG,
  type HomeEquityComputed,
  type HomeEquityFormValues,
} from './home-equity-loan-form';
import { calculateHomeEquity } from './home-equity';
import { pmt } from '@lib/finance';

/**
 * Home Equity Loan form-binding tests (R15B2 Commit 2 — Loan family follow-on,
 * 2 of 3). Exercise the VALIDATION / PRESENTATION boundary only — the pure engine
 * (calculateHomeEquity → @lib/finance `pmt`) is unchanged and separately frozen by
 * home-equity.test.ts + finance.test.ts. Covers: strict validation (home value > 0,
 * mortgage >= 0, LTV in (0,100], loan > 0, rate >= 0, whole term 1–30); the
 * requested loan exceeding the LTV cap is SHOWN, not rejected; pass-through
 * computation; the complete-result guard (reconciliation + NaN sentinel; NO
 * isUsableResult); presentation / announcement helpers; readValues / resetValues.
 */

const V = (over: Partial<HomeEquityFormValues> = {}): HomeEquityFormValues => ({
  homeValue: '400000',
  mortgageBalance: '250000',
  maxLtvPct: '85',
  loanAmount: '50000',
  annualRatePct: '8',
  termYears: '10',
  ...over,
});
const ok = (r: ReturnType<typeof validateHomeEquity>) => r.ok === true;
const err = (r: ReturnType<typeof validateHomeEquity>, field: string) =>
  (r as { fieldErrors: Record<string, string> }).fieldErrors[field];
const rejects = (c: HomeEquityComputed) => Number.isNaN(completeHomeEquityValue(c));

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe('home equity binding — contract', () => {
  it('does NOT define isUsableResult (the guard lives in resultValue)', () => {
    expect(homeEquityBinding.isUsableResult).toBeUndefined();
    expect(homeEquityBinding.resultValue).toBe(completeHomeEquityValue);
  });
});

/* ------------------------------------------------------------------ */
/* Validation (strict, never Number()||0)                              */
/* ------------------------------------------------------------------ */

describe('home equity binding — validation', () => {
  it('accepts a well-formed set (incl. 0% rate, no mortgage, and the 30-year ceiling)', () => {
    expect(ok(validateHomeEquity(V()))).toBe(true);
    expect(ok(validateHomeEquity(V({ annualRatePct: '0' })))).toBe(true);
    expect(ok(validateHomeEquity(V({ mortgageBalance: '0' })))).toBe(true);
    expect(ok(validateHomeEquity(V({ maxLtvPct: '100' })))).toBe(true);
    expect(ok(validateHomeEquity(V({ termYears: String(MAX_TERM_YEARS) })))).toBe(true);
  });

  it('home value required and strictly greater than zero', () => {
    expect(err(validateHomeEquity(V({ homeValue: '' })), 'homeValue')).toBe(MSG.homeValueRequired);
    expect(err(validateHomeEquity(V({ homeValue: '   ' })), 'homeValue')).toBe(MSG.homeValueRequired);
    for (const bad of ['0', '-1', 'abc', 'Infinity']) {
      expect(err(validateHomeEquity(V({ homeValue: bad })), 'homeValue')).toBe(MSG.homeValuePositive);
    }
  });

  it('mortgage balance required and >= 0 (0 valid — no mortgage)', () => {
    expect(err(validateHomeEquity(V({ mortgageBalance: '' })), 'mortgageBalance')).toBe(MSG.mortgageRequired);
    for (const bad of ['-1', 'abc', 'Infinity']) {
      expect(err(validateHomeEquity(V({ mortgageBalance: bad })), 'mortgageBalance')).toBe(MSG.mortgageNonNeg);
    }
    expect(ok(validateHomeEquity(V({ mortgageBalance: '0' })))).toBe(true);
  });

  it('max LTV required and within (0, 100]', () => {
    expect(err(validateHomeEquity(V({ maxLtvPct: '' })), 'maxLtvPct')).toBe(MSG.ltvRequired);
    for (const bad of ['0', '-5', '101', '150', 'abc']) {
      expect(err(validateHomeEquity(V({ maxLtvPct: bad })), 'maxLtvPct')).toBe(MSG.ltvRange);
    }
    for (const good of ['1', '82.5', '85', '100']) expect(ok(validateHomeEquity(V({ maxLtvPct: good })))).toBe(true);
  });

  it('loan amount required and strictly greater than zero', () => {
    expect(err(validateHomeEquity(V({ loanAmount: '' })), 'loanAmount')).toBe(MSG.loanRequired);
    for (const bad of ['0', '-100', 'abc', 'Infinity']) {
      expect(err(validateHomeEquity(V({ loanAmount: bad })), 'loanAmount')).toBe(MSG.loanPositive);
    }
  });

  it('rate required and >= 0 (0% valid, negative / garbage invalid)', () => {
    expect(err(validateHomeEquity(V({ annualRatePct: '' })), 'annualRatePct')).toBe(MSG.rateRequired);
    expect(err(validateHomeEquity(V({ annualRatePct: '-1' })), 'annualRatePct')).toBe(MSG.rateNonNeg);
    expect(err(validateHomeEquity(V({ annualRatePct: 'x' })), 'annualRatePct')).toBe(MSG.rateNonNeg);
    expect(ok(validateHomeEquity(V({ annualRatePct: '0' })))).toBe(true);
  });

  it('term required whole 1..30 — fractional / zero / >30 rejected, never rounded', () => {
    for (const bad of ['', '0', '0.5', '2.5', '31', '-5', 'x']) {
      expect(err(validateHomeEquity(V({ termYears: bad })), 'termYears')).toBe(MSG.term);
    }
    for (const good of ['1', '15', '30']) expect(ok(validateHomeEquity(V({ termYears: good })))).toBe(true);
  });

  it('a requested loan ABOVE the LTV-capped maximum is NOT a validation error (shown, not rejected)', () => {
    // maxBorrow here is 90000; ask for far more — validation still passes.
    expect(ok(validateHomeEquity(V({ loanAmount: '200000' })))).toBe(true);
    // ...and it is only informational: exceedsMax is true on the computed result.
    expect(computeHomeEquity(V({ loanAmount: '200000' })).result.exceedsMax).toBe(true);
  });

  it('reports every field error together on an empty submission', () => {
    const r = validateHomeEquity({
      homeValue: '',
      mortgageBalance: '',
      maxLtvPct: '',
      loanAmount: '',
      annualRatePct: '',
      termYears: '',
    });
    for (const f of ['homeValue', 'mortgageBalance', 'maxLtvPct', 'loanAmount', 'annualRatePct', 'termYears']) {
      expect(err(r, f)).toBeDefined();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Computation (pass-through)                                          */
/* ------------------------------------------------------------------ */

describe('home equity binding — computation', () => {
  it('computes exactly as calculateHomeEquity on the parsed numbers', () => {
    const c = computeHomeEquity(V());
    expect(c.result).toEqual(
      calculateHomeEquity({ homeValue: 400000, mortgageBalance: 250000, maxLtvPct: 85, loanAmount: 50000, annualRatePct: 8, termYears: 10 }),
    );
    expect(c.result.equity).toBe(150000);
    expect(c.result.maxBorrow).toBe(90000);
    expect(c.result.exceedsMax).toBe(false);
    expect(c.result.monthlyPayment).toBe(pmt(50000, 8 / 100 / 12, 120));
  });

  it('carries the parsed numeric inputs alongside the result', () => {
    const c = computeHomeEquity(V({ maxLtvPct: '82.5' }));
    expect(c.homeValue).toBe(400000);
    expect(c.maxLtvPct).toBe(82.5);
    expect(c.termYears).toBe(10);
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

describe('home equity binding — complete-result guard', () => {
  const good = computeHomeEquity(V());

  it('returns the finite monthly payment for a well-formed result', () => {
    expect(completeHomeEquityValue(good)).toBe(good.result.monthlyPayment);
    expect(Number.isFinite(completeHomeEquityValue(good))).toBe(true);
  });

  it('accepts a 0% loan (payment = loan ÷ months)', () => {
    const c = computeHomeEquity(V({ annualRatePct: '0', termYears: '1', loanAmount: '12000' }));
    expect(completeHomeEquityValue(c)).toBe(1000);
  });

  it('accepts an over-limit result — the payment still shows (not rejected)', () => {
    const c = computeHomeEquity(V({ loanAmount: '200000' }));
    expect(c.result.exceedsMax).toBe(true);
    expect(Number.isFinite(completeHomeEquityValue(c))).toBe(true);
    expect(completeHomeEquityValue(c)).toBe(c.result.monthlyPayment);
  });

  it('accepts a zero-equity (underwater) result — payment shown, maxBorrow 0', () => {
    const c = computeHomeEquity(V({ homeValue: '300000', mortgageBalance: '350000' }));
    expect(c.result.equity).toBe(0);
    expect(c.result.maxBorrow).toBe(0);
    expect(Number.isFinite(completeHomeEquityValue(c))).toBe(true);
  });

  it('rejects a non-finite or negative equity / maxBorrow / monthlyPayment', () => {
    expect(rejects({ ...good, result: { ...good.result, equity: Number.NaN } })).toBe(true);
    expect(rejects({ ...good, result: { ...good.result, equity: -1 } })).toBe(true);
    expect(rejects({ ...good, result: { ...good.result, maxBorrow: Number.POSITIVE_INFINITY } })).toBe(true);
    expect(rejects({ ...good, result: { ...good.result, maxBorrow: -1 } })).toBe(true);
    expect(rejects({ ...good, result: { ...good.result, monthlyPayment: Number.NaN } })).toBe(true);
    expect(rejects({ ...good, result: { ...good.result, monthlyPayment: -1 } })).toBe(true);
  });

  it('rejects a result whose figures do not reconcile with a recompute (tampered)', () => {
    expect(rejects({ ...good, result: { ...good.result, equity: good.result.equity + 1000 } })).toBe(true);
    expect(rejects({ ...good, result: { ...good.result, maxBorrow: good.result.maxBorrow + 1000 } })).toBe(true);
    expect(rejects({ ...good, result: { ...good.result, monthlyPayment: good.result.monthlyPayment + 50 } })).toBe(true);
  });

  it('rejects a mismatched exceedsMax flag (tampered)', () => {
    expect(rejects({ ...good, result: { ...good.result, exceedsMax: true } })).toBe(true);
  });

  it('rejects a result built on a non-finite parsed input (frozen Infinity home value)', () => {
    // calculateHomeEquity propagates an infinite home value to a non-finite equity;
    // the guard rejects it (the binding never renders a non-finite figure).
    const c = computeHomeEquity(V({ homeValue: 'Infinity' }));
    expect(Number.isFinite(c.result.equity)).toBe(false);
    expect(rejects(c)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

describe('home equity binding — presentation', () => {
  it('presents the payment with cents and equity / max-borrow rounded', () => {
    const p = presentHomeEquity(computeHomeEquity(V()));
    expect(p.payment).toBe('$606.64'); // formatCurrency(pmt(50000, 8/100/12, 120))
    expect(p.equity).toBe('$150,000');
    expect(p.maxBorrow).toBe('$90,000');
    expect(p.overLimit).toBe(false);
    expect(p.interpretation).toBe('You hold $150,000 of equity; at a 85% loan-to-value cap you could borrow up to $90,000.');
  });

  it('flags the over-limit case and carries a specific warning note', () => {
    const p = presentHomeEquity(computeHomeEquity(V({ loanAmount: '200000' })));
    expect(p.overLimit).toBe(true);
    expect(p.overLimitNote).toContain('$200,000');
    expect(p.overLimitNote).toContain('$90,000');
    // The neutral secondary is unchanged by the flag — it never double-signals.
    expect(p.interpretation).toBe('You hold $150,000 of equity; at a 85% loan-to-value cap you could borrow up to $90,000.');
  });

  it('renders a decimal LTV cap verbatim', () => {
    const p = presentHomeEquity(computeHomeEquity(V({ maxLtvPct: '82.5' })));
    expect(p.interpretation).toContain('82.5% loan-to-value');
  });

  it('spokenUSD reads dollars and cents', () => {
    expect(spokenUSD(606.64)).toBe('606 dollars and 64 cents');
    expect(spokenUSD(1000)).toBe('1000 dollars');
    expect(spokenUSD(1)).toBe('1 dollar');
  });

  it('describeHomeEquity leads with the estimated monthly payment and the borrowing limit', () => {
    // Zero-interest for a clean, exact spoken announcement (payment = loan ÷ months).
    const c = computeHomeEquity(V({ loanAmount: '60000', annualRatePct: '0', termYears: '5' }));
    expect(c.result.exceedsMax).toBe(false); // 60000 <= 90000
    expect(describeHomeEquity(c)).toBe('Estimated monthly payment: 1000 dollars. You can borrow up to 90000 dollars.');
  });

  it('describeHomeEquity flags an over-limit request in the announcement', () => {
    const c = computeHomeEquity(V({ loanAmount: '120000', annualRatePct: '0', termYears: '10' }));
    expect(c.result.exceedsMax).toBe(true); // 120000 > 90000
    expect(describeHomeEquity(c)).toBe('Estimated monthly payment: 1000 dollars. The entered loan is above your 90000 dollars maximum.');
  });
});

/* ------------------------------------------------------------------ */
/* readValues / resetValues (mock root)                                */
/* ------------------------------------------------------------------ */

describe('home equity binding — readValues / resetValues', () => {
  const mockRoot = () => {
    const inputs: Record<string, { value: string }> = {
      homeValue: { value: '400000' },
      mortgageBalance: { value: '250000' },
      maxLtvPct: { value: '85' },
      loanAmount: { value: '50000' },
      annualRatePct: { value: '8' },
      termYears: { value: '10' },
    };
    return {
      querySelector: (sel: string) => {
        const m = /\[name="([^"]+)"\]/.exec(sel);
        return m ? inputs[m[1]] ?? null : null;
      },
      __inputs: inputs,
    } as unknown as HTMLElement & { __inputs: Record<string, { value: string }> };
  };

  it('reads all six fields', () => {
    expect(homeEquityBinding.readValues(mockRoot())).toEqual({
      homeValue: '400000',
      mortgageBalance: '250000',
      maxLtvPct: '85',
      loanAmount: '50000',
      annualRatePct: '8',
      termYears: '10',
    });
  });

  it('reset clears every field', () => {
    const root = mockRoot();
    homeEquityBinding.resetValues(root, 'personal');
    const inputs = (root as unknown as { __inputs: Record<string, { value: string }> }).__inputs;
    for (const k of Object.keys(inputs)) expect(inputs[k].value).toBe('');
  });
});
