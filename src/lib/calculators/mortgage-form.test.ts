import { describe, it, expect } from 'vitest';
import {
  validateMortgageValues,
  computeMortgage,
  completeResultValue,
  describeMortgageResult,
  interpretMortgage,
  proportionSegments,
  spokenUSD,
  mortgageBinding,
  TERM_OPTIONS,
  MAX_MONTHLY_ROWS,
  type MortgageValues,
  type MortgageComputed,
} from './mortgage-form';

/**
 * Mortgage form-binding tests (R11E1 Commit 2). Exercise the VALIDATION / PRESENTATION boundary only —
 * the dedicated calculateMortgage / toYearlySchedule engine underneath is unchanged and separately
 * frozen by mortgage.test.ts. Covers: strict field parsing, the down-payment ≤ price cross-field rule,
 * the two-shape complete-result guard (positive loan AND zero mortgage) with a NaN sentinel (no
 * isUsableResult), and the interpretation / announcement / breakdown presentation.
 */

const values = (over: Partial<MortgageValues> = {}): MortgageValues => ({
  homePrice: '360000',
  downPayment: '72000', // 20% → no PMI
  loanTermYears: '30',
  annualInterestRate: '6.5',
  propertyTaxAnnual: '3600',
  homeInsuranceAnnual: '1200',
  hoaMonthly: '0',
  pmiAnnualRate: '0.5',
  ...over,
});
const good = () => computeMortgage(values());
const rejects = (r: MortgageComputed) => Number.isNaN(completeResultValue(r));

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe('mortgage binding — contract', () => {
  it('offers the four supported terms, longest first, and a 360-row ceiling', () => {
    expect(TERM_OPTIONS).toEqual([30, 20, 15, 10]);
    expect(MAX_MONTHLY_ROWS).toBe(360);
  });
  it('does NOT define isUsableResult (the guard lives in resultValue)', () => {
    expect(mortgageBinding.isUsableResult).toBeUndefined();
    expect(mortgageBinding.resultValue).toBe(completeResultValue);
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('mortgage binding — validation', () => {
  it('accepts a well-formed set', () => {
    expect(validateMortgageValues(values())).toEqual({ ok: true });
  });

  it('home price is required and must be positive', () => {
    expect(validateMortgageValues(values({ homePrice: '' }))).toMatchObject({
      ok: false,
      fieldErrors: { homePrice: 'Enter a home price.' },
    });
    for (const bad of ['0', '-1', 'abc', 'Infinity']) {
      const v = validateMortgageValues(values({ homePrice: bad }));
      expect(v.ok).toBe(false);
      expect((v as { fieldErrors: Record<string, string> }).fieldErrors.homePrice).toMatch(/greater than zero|Enter a home price/);
    }
  });

  it('interest rate is required, 0% is valid, negatives rejected', () => {
    expect(validateMortgageValues(values({ annualInterestRate: '' }))).toMatchObject({
      ok: false,
      fieldErrors: { annualInterestRate: 'Enter an interest rate.' },
    });
    expect(validateMortgageValues(values({ annualInterestRate: '0' }))).toEqual({ ok: true });
    expect(validateMortgageValues(values({ annualInterestRate: '-2' }))).toMatchObject({
      ok: false,
      fieldErrors: { annualInterestRate: 'Enter an interest rate of zero or more.' },
    });
  });

  it('down payment is optional (empty → $0 down)', () => {
    expect(validateMortgageValues(values({ downPayment: '' }))).toEqual({ ok: true });
    expect(validateMortgageValues(values({ downPayment: '0' }))).toEqual({ ok: true });
  });

  it('a negative / non-finite down payment is a field error', () => {
    expect(validateMortgageValues(values({ downPayment: '-100' }))).toMatchObject({
      ok: false,
      fieldErrors: { downPayment: 'Enter a down payment of zero or more.' },
    });
  });

  it('a down payment ABOVE the home price is a field error on the down payment', () => {
    const v = validateMortgageValues(values({ homePrice: '300000', downPayment: '400000' }));
    expect(v).toMatchObject({
      ok: false,
      fieldErrors: { downPayment: 'Enter a down payment no greater than the home price.' },
    });
    // Down EQUAL to the price is allowed (a valid zero mortgage).
    expect(validateMortgageValues(values({ homePrice: '300000', downPayment: '300000' }))).toEqual({ ok: true });
  });

  it('the down-vs-price check is skipped when the price itself is invalid (no false blame)', () => {
    const v = validateMortgageValues(values({ homePrice: '', downPayment: '400000' }));
    expect(v.ok).toBe(false);
    expect((v as { fieldErrors: Record<string, string> }).fieldErrors.downPayment).toBeUndefined();
    expect((v as { fieldErrors: Record<string, string> }).fieldErrors.homePrice).toBeDefined();
  });

  it('the loan term must be one of the offered options', () => {
    expect(validateMortgageValues(values({ loanTermYears: '25' }))).toMatchObject({
      ok: false,
      fieldErrors: { loanTermYears: 'Choose a loan term.' },
    });
    for (const t of TERM_OPTIONS) expect(validateMortgageValues(values({ loanTermYears: String(t) }))).toEqual({ ok: true });
  });

  it('optional property costs each reject negatives but allow empty / zero', () => {
    for (const name of ['propertyTaxAnnual', 'homeInsuranceAnnual', 'hoaMonthly', 'pmiAnnualRate'] as const) {
      expect(validateMortgageValues(values({ [name]: '' }))).toEqual({ ok: true });
      expect(validateMortgageValues(values({ [name]: '0' }))).toEqual({ ok: true });
      expect(validateMortgageValues(values({ [name]: '-1' })).ok).toBe(false);
    }
  });

  it('reports every offending field at once', () => {
    const v = validateMortgageValues({
      homePrice: '',
      downPayment: '-1',
      loanTermYears: '7',
      annualInterestRate: '',
      propertyTaxAnnual: '-1',
      homeInsuranceAnnual: '-1',
      hoaMonthly: '-1',
      pmiAnnualRate: '-1',
    });
    expect(v.ok).toBe(false);
    expect(Object.keys((v as { fieldErrors: Record<string, string> }).fieldErrors).sort()).toEqual(
      [
        'annualInterestRate',
        'downPayment',
        'homeInsuranceAnnual',
        'homePrice',
        'hoaMonthly',
        'loanTermYears',
        'pmiAnnualRate',
        'propertyTaxAnnual',
      ].sort(),
    );
  });
});

/* ------------------------------------------------------------------ */
/* Computation (pass-through + derived context)                        */
/* ------------------------------------------------------------------ */

describe('mortgage binding — computation', () => {
  it('passes through to the engine and derives the down-payment share', () => {
    const r = good();
    expect(r.loanAmount).toBe(288000);
    expect(r.monthlyPrincipalInterest).toBeCloseTo(1820.36, 1);
    expect(r.monthlyTotal).toBeCloseTo(2220.36, 1);
    expect(r.downPaymentPct).toBeCloseTo(20, 6);
    expect(r.zeroMortgage).toBe(false);
    expect(r.hasPmi).toBe(false); // 20% down
    expect(r.yearlySchedule.length).toBe(30);
  });

  it('uses strict parsing — never Number(v) || 0 (a blank optional is 0, not a formula error)', () => {
    const r = computeMortgage(values({ propertyTaxAnnual: '', homeInsuranceAnnual: '', hoaMonthly: '', pmiAnnualRate: '' }));
    expect(r.monthlyPropertyTax).toBe(0);
    expect(r.monthlyInsurance).toBe(0);
    expect(r.monthlyHoa).toBe(0);
    expect(r.monthlyPmi).toBe(0);
    expect(r.monthlyTotal).toBeCloseTo(r.monthlyPrincipalInterest, 6);
  });

  it('flags PMI when the down payment is under 20%', () => {
    const r = computeMortgage(values({ homePrice: '400000', downPayment: '40000', pmiAnnualRate: '0.5' }));
    expect(r.hasPmi).toBe(true);
    expect(r.monthlyPmi).toBe(150);
    expect(r.downPaymentPct).toBeCloseTo(10, 6);
  });

  it('a down payment equal to the price is a zero mortgage with an empty schedule', () => {
    const r = computeMortgage(values({ homePrice: '300000', downPayment: '300000' }));
    expect(r.zeroMortgage).toBe(true);
    expect(r.loanAmount).toBe(0);
    expect(r.schedule.length).toBe(0);
    expect(r.yearlySchedule.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard (the resultValue sentinel)                    */
/* ------------------------------------------------------------------ */

describe('mortgage binding — complete-result guard', () => {
  it('returns the dominant monthly total for a well-formed positive loan', () => {
    const r = good();
    expect(completeResultValue(r)).toBeCloseTo(r.monthlyTotal, 6);
    expect(Number.isFinite(completeResultValue(r))).toBe(true);
  });

  it('accepts a zero mortgage, returning the ongoing carrying cost', () => {
    const r = computeMortgage(values({ homePrice: '300000', downPayment: '300000', hoaMonthly: '50' }));
    // 300 tax + 100 insurance + 50 HOA = 450, no P&I / PMI.
    expect(completeResultValue(r)).toBeCloseTo(450, 6);
  });

  it('accepts a fully-paid home with no ongoing cost (monthly total 0 is a finite, valid result)', () => {
    const r = computeMortgage({
      homePrice: '300000',
      downPayment: '300000',
      loanTermYears: '30',
      annualInterestRate: '6',
      propertyTaxAnnual: '',
      homeInsuranceAnnual: '',
      hoaMonthly: '',
      pmiAnnualRate: '',
    });
    expect(completeResultValue(r)).toBe(0);
    expect(Number.isNaN(completeResultValue(r))).toBe(false);
  });

  it('handles a 0% positive loan (principal-only schedule reconciles)', () => {
    const r = computeMortgage(values({ annualInterestRate: '0', propertyTaxAnnual: '', homeInsuranceAnnual: '', pmiAnnualRate: '' }));
    expect(Number.isFinite(completeResultValue(r))).toBe(true);
    expect(r.totalInterest).toBe(0);
  });

  it('rejects a tampered summary (monthly total not equal to the sum of its parts)', () => {
    expect(rejects({ ...good(), monthlyTotal: 9999 })).toBe(true);
  });

  it('rejects a non-finite or negative figure', () => {
    expect(rejects({ ...good(), monthlyTotal: Number.NaN })).toBe(true);
    expect(rejects({ ...good(), loanAmount: -1, monthlyTotal: Number.NaN })).toBe(true);
    expect(rejects({ ...good(), totalInterest: Infinity, monthlyTotal: Number.NaN })).toBe(true);
  });

  it('rejects a schedule whose length disagrees with payoffMonths', () => {
    const r = good();
    expect(rejects({ ...r, schedule: r.schedule.slice(0, -1) })).toBe(true);
  });

  it('rejects a non-reconciling schedule (a mutated principal)', () => {
    const r = good();
    const schedule = r.schedule.map((row, i) => (i === 0 ? { ...row, principal: row.principal + 10000 } : row));
    expect(rejects({ ...r, schedule })).toBe(true);
  });

  it('rejects a reordered schedule', () => {
    const r = good();
    const schedule = [...r.schedule];
    [schedule[0], schedule[1]] = [schedule[1], schedule[0]];
    expect(rejects({ ...r, schedule })).toBe(true);
  });

  it('rejects a positive loan whose final balance is not ~0', () => {
    const r = good();
    const schedule = r.schedule.map((row, i) => (i === r.schedule.length - 1 ? { ...row, balance: 5000 } : row));
    expect(rejects({ ...r, schedule })).toBe(true);
  });

  it('rejects a schedule exceeding the 360-row ceiling', () => {
    const r = good();
    const extra = { ...r.schedule[0] };
    expect(rejects({ ...r, schedule: [...r.schedule, extra, extra], payoffMonths: r.schedule.length + 2 })).toBe(true);
  });

  it('rejects a zero mortgage that carries a stray schedule or interest', () => {
    const z = computeMortgage(values({ homePrice: '300000', downPayment: '300000' }));
    expect(rejects({ ...z, totalInterest: 5, monthlyTotal: z.monthlyTotal })).toBe(true);
    expect(rejects({ ...z, schedule: good().schedule })).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('mortgage binding — announcement', () => {
  it('states the dominant monthly payment, count and total interest', () => {
    const s = describeMortgageResult(good());
    expect(s).toMatch(/estimated monthly payment is 2220 dollars and 36 cents/);
    expect(s).toMatch(/over 360 monthly payments/);
    expect(s).toMatch(/total interest/);
  });
  it('speaks the zero-mortgage case plainly', () => {
    const r = computeMortgage(values({ homePrice: '300000', downPayment: '300000', hoaMonthly: '50' }));
    expect(describeMortgageResult(r)).toMatch(/no mortgage.*estimated monthly cost is 450 dollars/);
  });
});

describe('mortgage binding — interpretation', () => {
  it('no-PMI case names the down-payment share and the absence of PMI', () => {
    const s = interpretMortgage(good());
    expect(s).toMatch(/20% down/);
    expect(s).toMatch(/no PMI/);
  });
  it('PMI case names the monthly PMI and the 20% threshold', () => {
    const r = computeMortgage(values({ homePrice: '400000', downPayment: '40000', pmiAnnualRate: '0.5' }));
    const s = interpretMortgage(r);
    expect(s).toMatch(/10% down/);
    expect(s).toMatch(/PMI/);
    expect(s).toMatch(/20% down removes it/);
  });
  it('zero-mortgage case explains no mortgage is needed', () => {
    const r = computeMortgage(values({ homePrice: '300000', downPayment: '300000', hoaMonthly: '50' }));
    expect(interpretMortgage(r)).toMatch(/no mortgage is needed/);
  });
});

describe('mortgage binding — breakdown segments', () => {
  it('the five parts of a positive loan sum to ~100%', () => {
    const seg = proportionSegments(computeMortgage(values({ homePrice: '400000', downPayment: '40000', hoaMonthly: '100' })));
    const total = seg.pi + seg.tax + seg.ins + seg.pmi + seg.hoa;
    expect(total).toBeCloseTo(100, 6);
  });
  it('every segment is a non-negative width', () => {
    const seg = proportionSegments(good());
    for (const v of Object.values(seg)) expect(v).toBeGreaterThanOrEqual(0);
  });
  it('a zero monthly total yields all-zero widths (the island hides the bar)', () => {
    const r = computeMortgage({
      homePrice: '300000',
      downPayment: '300000',
      loanTermYears: '30',
      annualInterestRate: '6',
      propertyTaxAnnual: '',
      homeInsuranceAnnual: '',
      hoaMonthly: '',
      pmiAnnualRate: '',
    });
    expect(proportionSegments(r)).toEqual({ pi: 0, tax: 0, ins: 0, pmi: 0, hoa: 0 });
  });
});

describe('spokenUSD', () => {
  it('speaks dollars and cents, singular where appropriate', () => {
    expect(spokenUSD(2220.36)).toBe('2220 dollars and 36 cents');
    expect(spokenUSD(1)).toBe('1 dollar');
    expect(spokenUSD(0)).toBe('0 dollars');
    expect(spokenUSD(1.01)).toBe('1 dollar and 1 cent');
  });
});

/* ------------------------------------------------------------------ */
/* readValues / resetValues (mock root — no DOM in node vitest)        */
/* ------------------------------------------------------------------ */

describe('mortgage binding — readValues / resetValues', () => {
  const fieldNames = [
    'homePrice',
    'downPayment',
    'loanTermYears',
    'annualInterestRate',
    'propertyTaxAnnual',
    'homeInsuranceAnnual',
    'hoaMonthly',
    'pmiAnnualRate',
  ];

  /** A minimal stand-in for the calculator root that maps `[name="X"]` to a field-like object; the
   *  select is tagged so resetValues restores it rather than blanking it. */
  const mockRoot = (initial: Record<string, string>, selects: string[] = ['loanTermYears']) => {
    const fields: Record<string, { value: string; __select?: boolean }> = {};
    for (const n of fieldNames) fields[n] = { value: initial[n] ?? '', __select: selects.includes(n) };
    return {
      querySelector: (sel: string) => {
        const m = sel.match(/^\[name="(.+)"\]$/);
        return m ? fields[m[1]] ?? null : null;
      },
      __fields: fields,
    } as unknown as HTMLElement & { __fields: typeof fields };
  };

  it('reads each named field', () => {
    const root = mockRoot({ homePrice: '360000', downPayment: '72000', loanTermYears: '30', annualInterestRate: '6.5' });
    const v = mortgageBinding.readValues(root);
    expect(v.homePrice).toBe('360000');
    expect(v.downPayment).toBe('72000');
    expect(v.loanTermYears).toBe('30');
    expect(v.annualInterestRate).toBe('6.5');
  });

  it('reset clears the text fields but restores the default (longest) term on the select', () => {
    // The binding keys the select restore off the field NAME, so a plain {value} stand-in suffices —
    // no DOM globals (the vitest environment is node).
    const fields: Record<string, { value: string }> = {
      homePrice: { value: '360000' },
      downPayment: { value: '72000' },
      loanTermYears: { value: '15' },
      annualInterestRate: { value: '6.5' },
      propertyTaxAnnual: { value: '3600' },
      homeInsuranceAnnual: { value: '1200' },
      hoaMonthly: { value: '25' },
      pmiAnnualRate: { value: '0.5' },
    };
    const root = {
      querySelector: (sel: string) => {
        const m = sel.match(/^\[name="(.+)"\]$/);
        return m ? fields[m[1]] ?? null : null;
      },
    } as unknown as HTMLElement;

    mortgageBinding.resetValues(root, 'personal');
    expect(fields.homePrice.value).toBe('');
    expect(fields.downPayment.value).toBe('');
    expect(fields.annualInterestRate.value).toBe('');
    expect(fields.propertyTaxAnnual.value).toBe('');
    expect(fields.hoaMonthly.value).toBe('');
    expect(fields.loanTermYears.value).toBe('30'); // default term restored, not blanked
  });
});
