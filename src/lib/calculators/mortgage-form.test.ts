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
  downPaymentAmount,
  dollarsOf,
  pmiPercent,
  convertDownPayment,
  convertAgainstBase,
  yearRangeLabel,
  yearRangeLabels,
  mortgageExample,
  MORTGAGE_EXAMPLE,
  TERM_OPTIONS,
  MAX_MONTHLY_ROWS,
  emptyOneTimeList,
  monthOffset,
  monthsLabel,
  INCREASE_MESSAGE,
  EXTRA_AMOUNT_MESSAGE,
  EXTRA_YEAR_MESSAGE,
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

/** The optional extras, all blank/off — the state an untouched form is in. */
export const NO_EXTRAS = {
  propertyTaxIncreasePct: '',
  homeInsuranceIncreasePct: '',
  hoaIncreasePct: '',
  otherCostsIncreasePct: '',
  extraMonthlyAmount: '',
  extraMonthlyMonth: '',
  extraMonthlyYear: '',
  extraYearlyAmount: '',
  extraYearlyMonth: '',
  extraYearlyYear: '',
  extraOneTime: emptyOneTimeList(),
  showBiweekly: false,
} satisfies Partial<MortgageValues>;

const values = (over: Partial<MortgageValues> = {}): MortgageValues => ({
  ...NO_EXTRAS,
  homePrice: '360000',
  downPayment: '72000', // 20% → no PMI
  downPaymentUnit: 'amount', // dollars is the structural default; percent cases override it
  propertyTaxUnit: 'amount', // dollars/yr default; percent cases override it
  loanTermYears: '30',
  annualInterestRate: '6.5',
  propertyTaxAnnual: '3600',
  homeInsuranceAnnual: '1200',
  hoaMonthly: '0',
  pmiAnnualRate: '0.5',
  pmiUnit: 'percent', // percent-of-loan is engine-native and the default
  otherCostsAnnual: '',
  otherCostsUnit: 'amount',
  startMonth: '',
  startYear: '',
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
      ...NO_EXTRAS,
      homePrice: '',
      downPayment: '-1',
      downPaymentUnit: 'amount',
      propertyTaxUnit: 'amount',
      pmiUnit: 'percent',
      otherCostsAnnual: '',
      otherCostsUnit: 'amount',
      startMonth: '',
      startYear: '',
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
      ...NO_EXTRAS,
      homePrice: '300000',
      downPayment: '300000',
      downPaymentUnit: 'amount',
      propertyTaxUnit: 'amount',
      pmiUnit: 'percent',
      otherCostsAnnual: '',
      otherCostsUnit: 'amount',
      startMonth: '',
      startYear: '',
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
      ...NO_EXTRAS,
      homePrice: '300000',
      downPayment: '300000',
      downPaymentUnit: 'amount',
      propertyTaxUnit: 'amount',
      pmiUnit: 'percent',
      otherCostsAnnual: '',
      otherCostsUnit: 'amount',
      startMonth: '',
      startYear: '',
      loanTermYears: '30',
      annualInterestRate: '6',
      propertyTaxAnnual: '',
      homeInsuranceAnnual: '',
      hoaMonthly: '',
      pmiAnnualRate: '',
    });
    expect(proportionSegments(r)).toEqual({ pi: 0, tax: 0, ins: 0, pmi: 0, hoa: 0, other: 0 });
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

  it('reset puts the repayment start back to today, not to whatever was last picked', () => {
    // startMonth is a closed <select> with no blank option, so clearing it to '' was a silent
    // no-op that left the visitor's last choice in place after Reset. The page ships with the
    // visitor's own today in it, so that is the state Reset has to restore.
    const fields: Record<string, { value: string; dataset?: Record<string, string> }> = {
      homePrice: { value: '360000' },
      startMonth: { value: '3', dataset: { touched: '1' } },
      startYear: { value: '2031' },
    };
    const root = {
      querySelector: (sel: string) => {
        const m = sel.match(/^\[name="(.+)"\]$/);
        return m ? fields[m[1]] ?? null : null;
      },
    } as unknown as HTMLElement;

    const today = new Date();
    mortgageBinding.resetValues(root, 'personal');
    expect(fields.startMonth.value).toBe(String(today.getMonth() + 1));
    expect(fields.startYear.value).toBe(String(today.getFullYear()));
    // ...and the island's today-seeding gets the field back.
    expect(fields.startMonth.dataset?.touched).toBeUndefined();
  });
});

describe('down payment: dollar and percent units feed ONE engine', () => {
  /* -- normalisation (pure) -------------------------------------------- */

  it('dollar mode passes the amount through untouched', () => {
    expect(downPaymentAmount(400_000, 80_000, 'amount')).toBe(80_000);
    expect(downPaymentAmount(400_000, 0, 'amount')).toBe(0);
  });

  it('percent mode takes the percent OF the home price', () => {
    expect(downPaymentAmount(400_000, 20, 'percent')).toBe(80_000);
    expect(downPaymentAmount(400_000, 0, 'percent')).toBe(0);
    expect(downPaymentAmount(400_000, 100, 'percent')).toBe(400_000);
    expect(downPaymentAmount(400_000, 12.5, 'percent')).toBe(50_000);
  });

  /* -- the equivalence that matters ------------------------------------ */

  it('$80,000 on $400,000 === 20% on $400,000 — same loan amount', () => {
    const dollar = computeMortgage(
      values({ homePrice: '400000', downPayment: '80000', downPaymentUnit: 'amount' }),
    );
    const percent = computeMortgage(
      values({ homePrice: '400000', downPayment: '20', downPaymentUnit: 'percent' }),
    );
    expect(dollar.loanAmount).toBe(320_000);
    expect(percent.loanAmount).toBe(dollar.loanAmount);
  });

  it('equivalent inputs agree on EVERY headline figure, not just the loan', () => {
    const base = { homePrice: '400000', annualInterestRate: '6.5', loanTermYears: '30' };
    const dollar = computeMortgage(values({ ...base, downPayment: '80000', downPaymentUnit: 'amount' }));
    const percent = computeMortgage(values({ ...base, downPayment: '20', downPaymentUnit: 'percent' }));
    expect(percent.monthlyPrincipalInterest).toBe(dollar.monthlyPrincipalInterest);
    expect(percent.totalInterest).toBe(dollar.totalInterest);
    expect(percent.monthlyTotal).toBe(dollar.monthlyTotal);
    expect(percent.downPayment).toBe(dollar.downPayment);
    expect(percent.downPaymentPct).toBeCloseTo(dollar.downPaymentPct, 12);
    expect(percent.hasPmi).toBe(dollar.hasPmi);
  });

  it('a percent below 20 still triggers PMI, exactly as the dollar equivalent does', () => {
    const pct = computeMortgage(
      values({ homePrice: '400000', downPayment: '10', downPaymentUnit: 'percent', pmiAnnualRate: '0.5' }),
    );
    const amt = computeMortgage(
      values({ homePrice: '400000', downPayment: '40000', downPaymentUnit: 'amount', pmiAnnualRate: '0.5' }),
    );
    expect(pct.hasPmi).toBe(true);
    expect(pct.monthlyPmi).toBe(amt.monthlyPmi);
  });

  it('100% down is a valid zero mortgage in percent mode', () => {
    const r = computeMortgage(
      values({ homePrice: '400000', downPayment: '100', downPaymentUnit: 'percent' }),
    );
    expect(r.loanAmount).toBe(0);
    expect(r.zeroMortgage).toBe(true);
    expect(Number.isFinite(completeResultValue(r))).toBe(true);
  });

  /* -- validation ranges ----------------------------------------------- */

  it('percent mode rejects above 100% and accepts the 0–100 boundaries', () => {
    const bad = validateMortgageValues(
      values({ homePrice: '400000', downPayment: '101', downPaymentUnit: 'percent' }),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.fieldErrors?.downPayment).toBe('Enter a down payment of 100% or less.');

    for (const v of ['0', '20', '100']) {
      expect(
        validateMortgageValues(values({ homePrice: '400000', downPayment: v, downPaymentUnit: 'percent' })).ok,
      ).toBe(true);
    }
  });

  it('percent mode rejects a negative percent', () => {
    const r = validateMortgageValues(
      values({ homePrice: '400000', downPayment: '-5', downPaymentUnit: 'percent' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.downPayment).toBe('Enter a down payment percent of zero or more.');
  });

  it('percent mode does NOT apply the dollar ceiling — 50 is 50%, not $50 vs the price', () => {
    // In dollar mode 500000 on a 400000 home is an error; as a percent, 50 is perfectly valid.
    expect(
      validateMortgageValues(values({ homePrice: '400000', downPayment: '50', downPaymentUnit: 'percent' })).ok,
    ).toBe(true);
  });

  it('dollar mode keeps its existing ceiling and message', () => {
    const r = validateMortgageValues(
      values({ homePrice: '400000', downPayment: '500000', downPaymentUnit: 'amount' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.downPayment).toBe('Enter a down payment no greater than the home price.');
  });
});

describe('switching the down-payment unit re-expresses the entered value', () => {
  // The pure arithmetic; the DOM wiring in convertValues is covered end-to-end (the BMI precedent —
  // vitest runs in a node environment with no DOM).

  it('$ → % converts $80,000 on a $400,000 home to 20', () => {
    expect(convertDownPayment('80000', '400000', 'amount', 'percent')).toBe('20');
  });

  it('% → $ converts 20 on a $400,000 home to 80000', () => {
    expect(convertDownPayment('20', '400000', 'percent', 'amount')).toBe('80000');
  });

  it('round-trips $ → % → $ without drift', () => {
    const pct = convertDownPayment('80000', '400000', 'amount', 'percent')!;
    expect(convertDownPayment(pct, '400000', 'percent', 'amount')).toBe('80000');
  });

  it('handles fractional shares cleanly, with no float noise', () => {
    expect(convertDownPayment('50000', '400000', 'amount', 'percent')).toBe('12.5');
    expect(convertDownPayment('12.5', '400000', 'percent', 'amount')).toBe('50000');
    expect(convertDownPayment('33333', '99999', 'amount', 'percent')).toBe('33.3333');
  });

  it('converts the 0 and 100% boundaries', () => {
    expect(convertDownPayment('0', '400000', 'amount', 'percent')).toBe('0');
    expect(convertDownPayment('400000', '400000', 'amount', 'percent')).toBe('100');
    expect(convertDownPayment('100', '400000', 'percent', 'amount')).toBe('400000');
  });

  it('returns null (leave the entry alone) when there is nothing to re-express', () => {
    expect(convertDownPayment('', '400000', 'amount', 'percent')).toBeNull(); // empty stays empty
    expect(convertDownPayment('   ', '400000', 'amount', 'percent')).toBeNull();
    expect(convertDownPayment('80000', '400000', 'amount', 'amount')).toBeNull(); // unit unchanged
  });

  it('returns null when the home price cannot anchor a conversion', () => {
    for (const price of ['', '0', '-1', 'abc']) {
      expect(convertDownPayment('80000', price, 'amount', 'percent')).toBeNull();
    }
  });

  it('returns null for a non-numeric down payment rather than corrupting it', () => {
    expect(convertDownPayment('abc', '400000', 'amount', 'percent')).toBeNull();
  });

  it('a percent down payment follows a CHANGED base price rather than freezing its dollars', () => {
    const base = { downPayment: '20', downPaymentUnit: 'percent' as const };
    const at400 = computeMortgage(values({ ...base, homePrice: '400000' }));
    const at500 = computeMortgage(values({ ...base, homePrice: '500000' }));
    expect(at400.downPayment).toBe(80_000); // 20% of 400k
    expect(at500.downPayment).toBe(100_000); // 20% of 500k — the SHARE is what the visitor entered
    expect(at400.loanAmount).toBe(320_000);
    expect(at500.loanAmount).toBe(400_000);
  });

  it('a DOLLAR down payment holds its amount when the base price changes', () => {
    const base = { downPayment: '80000', downPaymentUnit: 'amount' as const };
    const at400 = computeMortgage(values({ ...base, homePrice: '400000' }));
    const at500 = computeMortgage(values({ ...base, homePrice: '500000' }));
    expect(at400.downPayment).toBe(80_000);
    expect(at500.downPayment).toBe(80_000); // the CASH is what the visitor entered
    expect(at400.downPaymentPct).toBeCloseTo(20, 10);
    expect(at500.downPaymentPct).toBeCloseTo(16, 10);
  });

  it('a converted value round-trips to the SAME loan amount through the engine', () => {
    const asPct = convertDownPayment('80000', '400000', 'amount', 'percent')!;
    const before = computeMortgage(values({ homePrice: '400000', downPayment: '80000', downPaymentUnit: 'amount' }));
    const after = computeMortgage(values({ homePrice: '400000', downPayment: asPct, downPaymentUnit: 'percent' }));
    expect(after.loanAmount).toBe(before.loanAmount);
  });
});

describe('worked example (below the tool) is computed by the engine', () => {
  it('uses the documented scenario as its INPUTS', () => {
    expect(MORTGAGE_EXAMPLE).toEqual({
      homePrice: 400_000,
      downPaymentPct: 20,
      annualInterestRate: 6.5,
      loanTermYears: 30,
    });
  });

  it('derives the down payment and loan amount rather than hardcoding them', () => {
    const ex = mortgageExample();
    expect(ex.downPayment).toBe(80_000);
    expect(ex.loanAmount).toBe(320_000);
  });

  it('matches what the calculator itself produces for the same inputs', () => {
    const ex = mortgageExample();
    const viaForm = computeMortgage(
      values({
        homePrice: '400000',
        downPayment: '20',
        downPaymentUnit: 'percent',
        annualInterestRate: '6.5',
        loanTermYears: '30',
        propertyTaxAnnual: '',
        homeInsuranceAnnual: '',
        hoaMonthly: '',
        pmiAnnualRate: '',
      }),
    );
    expect(ex.loanAmount).toBe(viaForm.loanAmount);
    expect(ex.monthlyPrincipalInterest).toBe(viaForm.monthlyPrincipalInterest);
    expect(ex.totalInterest).toBe(viaForm.totalInterest);
    expect(ex.totalOfPayments).toBe(viaForm.totalOfPayments);
  });

  it('produces finite, self-consistent figures', () => {
    const ex = mortgageExample();
    for (const v of [ex.monthlyPrincipalInterest, ex.totalInterest, ex.totalOfPayments]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(ex.homePrice - ex.downPayment).toBe(ex.loanAmount);
    expect(ex.totalOfPayments).toBeCloseTo(ex.loanAmount + ex.totalInterest, 6);
  });
});

describe('property tax: dollars/year or a percent of the home price', () => {
  it('normalises a percent against the HOME PRICE', () => {
    expect(dollarsOf(400_000, 1.2, 'percent')).toBe(4_800);
    expect(dollarsOf(400_000, 4_800, 'amount')).toBe(4_800);
  });

  it('$4,800 and 1.2% on a $400,000 home reach the engine identically', () => {
    const base = { homePrice: '400000', downPayment: '80000', downPaymentUnit: 'amount' as const };
    const asDollars = computeMortgage(values({ ...base, propertyTaxAnnual: '4800', propertyTaxUnit: 'amount' }));
    const asPercent = computeMortgage(values({ ...base, propertyTaxAnnual: '1.2', propertyTaxUnit: 'percent' }));
    expect(asDollars.monthlyPropertyTax).toBeCloseTo(400, 10);
    expect(asPercent.monthlyPropertyTax).toBe(asDollars.monthlyPropertyTax);
    expect(asPercent.monthlyTotal).toBe(asDollars.monthlyTotal);
  });

  it('converts $ ↔ % against the home price, round-tripping cleanly', () => {
    expect(convertAgainstBase('4800', 400_000, 'amount', 'percent')).toBe('1.2');
    expect(convertAgainstBase('1.2', 400_000, 'percent', 'amount')).toBe('4800');
    const pct = convertAgainstBase('4800', 400_000, 'amount', 'percent')!;
    expect(convertAgainstBase(pct, 400_000, 'percent', 'amount')).toBe('4800');
  });

  it('a percent entry follows a CHANGED base price rather than freezing its dollars', () => {
    const at400 = computeMortgage(values({ homePrice: '400000', propertyTaxAnnual: '1.2', propertyTaxUnit: 'percent' }));
    const at500 = computeMortgage(values({ homePrice: '500000', propertyTaxAnnual: '1.2', propertyTaxUnit: 'percent' }));
    expect(at400.monthlyPropertyTax).toBeCloseTo(400, 10); // 1.2% of 400k / 12
    expect(at500.monthlyPropertyTax).toBeCloseTo(500, 10); // 1.2% of 500k / 12
  });

  it('rejects above 100% and a negative percent, and keeps the dollar message', () => {
    const over = validateMortgageValues(values({ propertyTaxAnnual: '101', propertyTaxUnit: 'percent' }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.fieldErrors?.propertyTaxAnnual).toBe('Enter a property tax of 100% or less.');

    const neg = validateMortgageValues(values({ propertyTaxAnnual: '-1', propertyTaxUnit: 'percent' }));
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.fieldErrors?.propertyTaxAnnual).toBe('Enter a property tax percent of zero or more.');

    const badDollars = validateMortgageValues(values({ propertyTaxAnnual: '-1', propertyTaxUnit: 'amount' }));
    expect(badDollars.ok).toBe(false);
    if (!badDollars.ok) {
      expect(badDollars.fieldErrors?.propertyTaxAnnual).toBe('Enter a property tax amount of zero or more.');
    }
  });
});

describe('PMI: percent of the LOAN (engine-native) or dollars/year', () => {
  it('passes a percent through and converts dollars against the loan', () => {
    expect(pmiPercent(320_000, 1, 'percent')).toBe(1);
    expect(pmiPercent(320_000, 3_200, 'amount')).toBeCloseTo(1, 12);
  });

  it('yields 0 rather than dividing by zero when there is no loan', () => {
    expect(pmiPercent(0, 3_200, 'amount')).toBe(0);
  });

  it('1% and $3,200/yr on a $320,000 loan reach the engine identically', () => {
    const base = {
      homePrice: '400000', downPayment: '80000', downPaymentUnit: 'amount' as const,
      annualInterestRate: '6.5', loanTermYears: '30',
    };
    const asPercent = computeMortgage(values({ ...base, pmiAnnualRate: '1', pmiUnit: 'percent' }));
    const asDollars = computeMortgage(values({ ...base, pmiAnnualRate: '3200', pmiUnit: 'amount' }));
    expect(asPercent.loanAmount).toBe(320_000);
    expect(asDollars.monthlyPmi).toBeCloseTo(asPercent.monthlyPmi, 10);
    expect(asDollars.monthlyTotal).toBeCloseTo(asPercent.monthlyTotal, 10);
  });

  it('converts % ↔ $ against the loan, round-tripping cleanly', () => {
    expect(convertAgainstBase('1', 320_000, 'percent', 'amount')).toBe('3200');
    expect(convertAgainstBase('3200', 320_000, 'amount', 'percent')).toBe('1');
    const dollars = convertAgainstBase('1', 320_000, 'percent', 'amount')!;
    expect(convertAgainstBase(dollars, 320_000, 'amount', 'percent')).toBe('1');
  });

  it('has NO defined conversion when the loan amount cannot be resolved', () => {
    for (const loan of [0, -1, Number.NaN]) {
      expect(convertAgainstBase('1', loan, 'percent', 'amount')).toBeNull();
    }
  });

  it('a dollar premium follows a CHANGED loan amount (via the down payment)', () => {
    const base = { homePrice: '400000', annualInterestRate: '6.5', loanTermYears: '30',
                   pmiAnnualRate: '3200', pmiUnit: 'amount' as const };
    // Both down payments stay UNDER 20%, so PMI applies in each case (at exactly 20% the loan hits
    // the engine's 80% LTV threshold and PMI correctly drops to zero — see the engine's own tests).
    const small = computeMortgage(values({ ...base, downPayment: '40000', downPaymentUnit: 'amount' }));
    const smaller = computeMortgage(values({ ...base, downPayment: '60000', downPaymentUnit: 'amount' }));
    expect(small.loanAmount).toBe(360_000);
    expect(smaller.loanAmount).toBe(340_000);
    // The premium is a fixed $3,200/yr, so the monthly figure is the same against either loan —
    // the RATE the engine receives is what changes (0.889% vs 0.941%).
    expect(small.monthlyPmi).toBeCloseTo(3_200 / 12, 8);
    expect(smaller.monthlyPmi).toBeCloseTo(3_200 / 12, 8);
    expect(small.monthlyPmi).toBeCloseTo(smaller.monthlyPmi, 8);
  });

  it('rejects above 100% and keeps the original percent message', () => {
    const over = validateMortgageValues(values({ pmiAnnualRate: '101', pmiUnit: 'percent' }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.fieldErrors?.pmiAnnualRate).toBe('Enter a PMI rate of 100% or less.');

    const neg = validateMortgageValues(values({ pmiAnnualRate: '-1', pmiUnit: 'percent' }));
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.fieldErrors?.pmiAnnualRate).toBe('Enter a PMI rate of zero or more.');

    const negDollars = validateMortgageValues(values({ pmiAnnualRate: '-1', pmiUnit: 'amount' }));
    expect(negDollars.ok).toBe(false);
    if (!negDollars.ok) expect(negDollars.fieldErrors?.pmiAnnualRate).toBe('Enter a PMI amount of zero or more.');
  });
});

describe('the three unit groups are independent in the data model', () => {
  it('each field converts against its OWN base', () => {
    // Same entered number, three different bases → three different conversions.
    expect(convertAgainstBase('4800', 400_000, 'amount', 'percent')).toBe('1.2'); // of price
    expect(convertAgainstBase('4800', 320_000, 'amount', 'percent')).toBe('1.5'); // of loan
  });

  it('changing one field\'s unit leaves the others\' normalisation untouched', () => {
    const common = {
      homePrice: '400000', downPayment: '80000', annualInterestRate: '6.5', loanTermYears: '30',
      propertyTaxAnnual: '4800', pmiAnnualRate: '1',
    };
    const allDefault = computeMortgage(
      values({ ...common, downPaymentUnit: 'amount', propertyTaxUnit: 'amount', pmiUnit: 'percent' }),
    );
    // Express ONLY the down payment differently — tax and PMI must be unaffected.
    const downAsPct = computeMortgage(
      values({ ...common, downPayment: '20', downPaymentUnit: 'percent', propertyTaxUnit: 'amount', pmiUnit: 'percent' }),
    );
    expect(downAsPct.loanAmount).toBe(allDefault.loanAmount);
    expect(downAsPct.monthlyPropertyTax).toBe(allDefault.monthlyPropertyTax);
    expect(downAsPct.monthlyPmi).toBeCloseTo(allDefault.monthlyPmi, 10);
    expect(downAsPct.monthlyTotal).toBeCloseTo(allDefault.monthlyTotal, 10);
  });

  it('all three expressed in their alternate units still produce the identical result', () => {
    const native = computeMortgage(values({
      homePrice: '400000', downPayment: '80000', downPaymentUnit: 'amount',
      propertyTaxAnnual: '4800', propertyTaxUnit: 'amount',
      pmiAnnualRate: '1', pmiUnit: 'percent',
      annualInterestRate: '6.5', loanTermYears: '30', homeInsuranceAnnual: '1200', hoaMonthly: '0',
    }));
    const alternate = computeMortgage(values({
      homePrice: '400000', downPayment: '20', downPaymentUnit: 'percent',
      propertyTaxAnnual: '1.2', propertyTaxUnit: 'percent',
      pmiAnnualRate: '3200', pmiUnit: 'amount',
      annualInterestRate: '6.5', loanTermYears: '30', homeInsuranceAnnual: '1200', hoaMonthly: '0',
    }));
    expect(alternate.loanAmount).toBe(native.loanAmount);
    expect(alternate.monthlyPrincipalInterest).toBe(native.monthlyPrincipalInterest);
    expect(alternate.monthlyPropertyTax).toBe(native.monthlyPropertyTax);
    expect(alternate.monthlyPmi).toBeCloseTo(native.monthlyPmi, 10);
    expect(alternate.monthlyTotal).toBeCloseTo(native.monthlyTotal, 10);
    expect(alternate.totalInterest).toBe(native.totalInterest);
  });
});

describe('start date labels the yearly schedule', () => {
  it('dates the first year from the entered month and year', () => {
    expect(yearRangeLabel(8, 2026, 1)).toBe('8/26\u20137/27');
  });

  it('advances a full 12 months per schedule year', () => {
    expect(yearRangeLabel(8, 2026, 2)).toBe('8/27\u20137/28');
    expect(yearRangeLabel(8, 2026, 30)).toBe('8/55\u20137/56');
  });

  it('handles a January start without rolling the year early', () => {
    expect(yearRangeLabel(1, 2026, 1)).toBe('1/26\u201312/26');
    expect(yearRangeLabel(12, 2026, 1)).toBe('12/26\u201311/27');
  });

  it('returns an empty label for an unusable date rather than guessing', () => {
    for (const [m, y] of [[0, 2026], [13, 2026], [8, 12], [Number.NaN, 2026]] as const) {
      expect(yearRangeLabel(m as number, y as number, 1)).toBe('');
    }
  });

  it('builds one label per schedule row, or none at all when the date is unset', () => {
    expect(yearRangeLabels(8, 2026, 3)).toEqual(['8/26\u20137/27', '8/27\u20137/28', '8/28\u20137/29']);
    expect(yearRangeLabels(0, 2026, 3)).toEqual([]);
  });

  it('the computed result carries a label per yearly row', () => {
    const r = computeMortgage(values({ startMonth: '8', startYear: '2026', loanTermYears: '30' }));
    expect(r.yearLabels).toHaveLength(r.yearlySchedule.length);
    expect(r.yearLabels[0]).toBe('8/26\u20137/27');
  });

  it('never changes the mortgage maths', () => {
    const withDate = computeMortgage(values({ startMonth: '8', startYear: '2026' }));
    const without = computeMortgage(values({ startMonth: '', startYear: '' }));
    expect(withDate.monthlyTotal).toBe(without.monthlyTotal);
    expect(withDate.loanAmount).toBe(without.loanAmount);
    expect(withDate.totalInterest).toBe(without.totalInterest);
    expect(without.yearLabels).toEqual([]);
  });
});

describe('other costs: dollars/year or a percent of the home price', () => {
  it('adds to the monthly total', () => {
    const none = computeMortgage(values({ otherCostsAnnual: '', otherCostsUnit: 'amount' }));
    const some = computeMortgage(values({ otherCostsAnnual: '1200', otherCostsUnit: 'amount' }));
    expect(some.monthlyOther).toBeCloseTo(100, 10);
    expect(some.monthlyTotal).toBeCloseTo(none.monthlyTotal + 100, 8);
  });

  it('$4,000 and 1% on a $400,000 home reach the engine identically', () => {
    const base = { homePrice: '400000', downPayment: '80000', downPaymentUnit: 'amount' as const };
    const asDollars = computeMortgage(values({ ...base, otherCostsAnnual: '4000', otherCostsUnit: 'amount' }));
    const asPercent = computeMortgage(values({ ...base, otherCostsAnnual: '1', otherCostsUnit: 'percent' }));
    expect(asPercent.monthlyOther).toBe(asDollars.monthlyOther);
    expect(asPercent.monthlyTotal).toBe(asDollars.monthlyTotal);
  });

  it('converts $ ↔ % against the home price', () => {
    expect(convertAgainstBase('4000', 400_000, 'amount', 'percent')).toBe('1');
    expect(convertAgainstBase('1', 400_000, 'percent', 'amount')).toBe('4000');
  });

  it('rejects above 100% and a negative entry, per unit', () => {
    const over = validateMortgageValues(values({ otherCostsAnnual: '101', otherCostsUnit: 'percent' }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.fieldErrors?.otherCostsAnnual).toBe('Enter other costs of 100% or less.');

    const neg = validateMortgageValues(values({ otherCostsAnnual: '-1', otherCostsUnit: 'amount' }));
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.fieldErrors?.otherCostsAnnual).toBe('Enter an other-costs amount of zero or more.');
  });

  it('is included in the complete-result guard, so the total still reconciles', () => {
    const r = computeMortgage(values({ otherCostsAnnual: '1200', otherCostsUnit: 'amount' }));
    expect(Number.isFinite(completeResultValue(r))).toBe(true);
    expect(r.monthlyTotal).toBeCloseTo(
      r.monthlyPrincipalInterest + r.monthlyPropertyTax + r.monthlyInsurance +
        r.monthlyHoa + r.monthlyOther + r.monthlyPmi,
      8,
    );
  });
});

/* ------------------------------------------------------------------ */
/* The optional extras — validation, date offsets, compute, guard      */
/* ------------------------------------------------------------------ */

/** The message a validation result blames on one field, or undefined when it passed. */
const err = (r: ReturnType<typeof validateMortgageValues>, field: string): string | undefined =>
  (r as { fieldErrors?: Record<string, string> }).fieldErrors?.[field];

describe('mortgage binding — optional extras are optional', () => {
  it('an untouched form reaches none of the new rules and computes as before', () => {
    const plain = computeMortgage(values());
    expect(plain.hasExtras).toBe(false);
    expect(plain.hasCostIncrease).toBe(false);
    expect(plain.biweekly).toBeNull();
    expect(plain.withoutExtra).toBeNull();
    expect(Number.isFinite(completeResultValue(plain))).toBe(true);
    expect(validateMortgageValues(values()).ok).toBe(true);
  });
});

describe('mortgage binding — annual increase validation', () => {
  const INCREASE_FIELDS = [
    'propertyTaxIncreasePct',
    'homeInsuranceIncreasePct',
    'hoaIncreasePct',
    'otherCostsIncreasePct',
  ] as const;

  it('accepts blank, zero and any percent up to the ceiling', () => {
    for (const f of INCREASE_FIELDS) {
      for (const good of ['', '0', '2.5', '100']) {
        expect(validateMortgageValues(values({ [f]: good })).ok).toBe(true);
      }
    }
  });
  it('rejects negative, over-ceiling and non-numeric increases, per field', () => {
    for (const f of INCREASE_FIELDS) {
      for (const bad of ['-1', '101', 'x']) {
        expect(err(validateMortgageValues(values({ [f]: bad })), f)).toBe(INCREASE_MESSAGE);
      }
    }
  });
});

describe('mortgage binding — extra payment validation', () => {
  it('accepts a blank amount with any date, and a real amount with a real date', () => {
    expect(validateMortgageValues(values({ extraMonthlyAmount: '' })).ok).toBe(true);
    expect(
      validateMortgageValues(values({ extraMonthlyAmount: '250', extraMonthlyMonth: '3', extraMonthlyYear: '2027' })).ok,
    ).toBe(true);
  });
  it('rejects a negative or non-numeric extra amount', () => {
    for (const bad of ['-1', 'x']) {
      expect(err(validateMortgageValues(values({ extraMonthlyAmount: bad })), 'extraMonthlyAmount')).toBe(
        EXTRA_AMOUNT_MESSAGE,
      );
      expect(err(validateMortgageValues(values({ extraYearlyAmount: bad })), 'extraYearlyAmount')).toBe(
        EXTRA_AMOUNT_MESSAGE,
      );
    }
  });
  it('a blank date is VALID — it means "from the first payment", not a missing answer', () => {
    expect(validateMortgageValues(values({ extraMonthlyAmount: '250', extraMonthlyYear: '', extraMonthlyMonth: '' })).ok).toBe(true);
    expect(validateMortgageValues(values({ extraMonthlyAmount: '', extraMonthlyYear: '' })).ok).toBe(true);
  });
  it('rejects an out-of-range or fractional year even when the amount is blank', () => {
    for (const bad of ['1899', '2201', '20.5', 'x']) {
      expect(err(validateMortgageValues(values({ extraYearlyYear: bad })), 'extraYearlyYear')).toBe(
        EXTRA_YEAR_MESSAGE,
      );
    }
  });
  it('validates every one-time slot by its own field name', () => {
    const rows = emptyOneTimeList();
    rows[2] = { amount: '-5', month: '1', year: '2026' };
    expect(err(validateMortgageValues(values({ extraOneTime: rows })), 'extraOneTime3Amount')).toBe(
      EXTRA_AMOUNT_MESSAGE,
    );
    const badYear = emptyOneTimeList();
    badYear[0] = { amount: '5000', month: '1', year: '1899' };
    expect(err(validateMortgageValues(values({ extraOneTime: badYear })), 'extraOneTime1Year')).toBe(
      EXTRA_YEAR_MESSAGE,
    );
  });
});

describe('mortgage binding — monthOffset', () => {
  it('counts whole months forward from the repayment start', () => {
    expect(monthOffset(1, 2026, 1, 2026)).toBe(0);
    expect(monthOffset(1, 2026, 2, 2026)).toBe(1);
    expect(monthOffset(1, 2026, 1, 2027)).toBe(12);
    expect(monthOffset(8, 2026, 2, 2027)).toBe(6);
  });
  it('clamps a date at or before the start to the first payment', () => {
    expect(monthOffset(8, 2026, 1, 2026)).toBe(0);
    expect(monthOffset(1, 2026, 6, 2020)).toBe(0);
  });
  it('is 0 rather than NaN when a date is missing', () => {
    expect(monthOffset(NaN, 2026, 1, 2026)).toBe(0);
    expect(monthOffset(1, 2026, 1, NaN)).toBe(0);
  });
});

describe('mortgage binding — extras reach the engine', () => {
  const withStart = (over = {}) => values({ startMonth: '1', startYear: '2026', ...over });

  it('an extra monthly payment shortens the loan and reports the saving', () => {
    const plain = computeMortgage(withStart());
    const extra = computeMortgage(withStart({ extraMonthlyAmount: '300', extraMonthlyMonth: '1', extraMonthlyYear: '2026' }));
    expect(extra.hasExtras).toBe(true);
    expect(extra.payoffMonths).toBeLessThan(plain.payoffMonths);
    expect(extra.interestSaved).toBeGreaterThan(0);
    expect(extra.monthsSaved).toBe(plain.payoffMonths - extra.payoffMonths);
    expect(Number.isFinite(completeResultValue(extra))).toBe(true);
  });

  it('a dated extra payment starts in the month the visitor picked', () => {
    const r = computeMortgage(withStart({ extraMonthlyAmount: '500', extraMonthlyMonth: '1', extraMonthlyYear: '2028' }));
    expect(r.schedule.slice(0, 24).every((row) => row.extra === 0)).toBe(true);
    expect(r.schedule[24].extra).toBe(500);
  });

  it('a blank extra-payment date means "from the first payment"', () => {
    const dated = computeMortgage(withStart({ extraMonthlyAmount: '300', extraMonthlyMonth: '1', extraMonthlyYear: '2026' }));
    const blank = computeMortgage(withStart({ extraMonthlyAmount: '300', extraMonthlyMonth: '', extraMonthlyYear: '' }));
    expect(blank.payoffMonths).toBe(dated.payoffMonths);
    expect(blank.totalExtraPrincipal).toBeCloseTo(dated.totalExtraPrincipal, 6);
  });

  it('only one-time rows with an amount are sent to the engine', () => {
    const rows = emptyOneTimeList();
    rows[0] = { amount: '10000', month: '6', year: '2026' };
    rows[3] = { amount: '', month: '1', year: '2030' }; // no amount → ignored
    const r = computeMortgage(withStart({ extraOneTime: rows }));
    expect(r.totalExtraPrincipal).toBe(10000);
    expect(r.schedule[5].extra).toBe(10000);
  });

  it('an annual increase is reported without touching the loan', () => {
    const plain = computeMortgage(withStart({ propertyTaxAnnual: '3600' }));
    const rising = computeMortgage(withStart({ propertyTaxAnnual: '3600', propertyTaxIncreasePct: '3' }));
    expect(rising.hasCostIncrease).toBe(true);
    expect(rising.totalPropertyTax).toBeGreaterThan(plain.totalPropertyTax);
    expect(rising.totalInterest).toBeCloseTo(plain.totalInterest, 6);
    expect(rising.monthlyTotal).toBeCloseTo(plain.monthlyTotal, 9);
    expect(Number.isFinite(completeResultValue(rising))).toBe(true);
  });

  it('the biweekly plan appears only when the box is ticked', () => {
    expect(computeMortgage(withStart({ showBiweekly: false })).biweekly).toBeNull();
    const r = computeMortgage(withStart({ showBiweekly: true }));
    expect(r.biweekly).not.toBeNull();
    expect(r.biweekly!.payment).toBeCloseTo(r.monthlyPrincipalInterest / 2, 6);
    expect(Number.isFinite(completeResultValue(r))).toBe(true);
  });
});

describe('mortgage binding — the guard covers the extras', () => {
  const good = computeMortgage(
    values({ startMonth: '1', startYear: '2026', extraMonthlyAmount: '300', extraMonthlyYear: '2026', showBiweekly: true }),
  );

  it('accepts the well-formed extended result', () => {
    expect(Number.isFinite(completeResultValue(good))).toBe(true);
  });
  it('rejects a schedule whose principal + extra no longer discharges the loan', () => {
    const broken = { ...good, schedule: good.schedule.map((r, i) => (i === 0 ? { ...r, extra: r.extra + 5000 } : r)) };
    expect(Number.isNaN(completeResultValue(broken))).toBe(true);
  });
  it('rejects a negative or non-finite extra or cost on any row', () => {
    for (const patch of [{ extra: -1 }, { extra: Number.NaN }, { costs: -1 }]) {
      const broken = { ...good, schedule: good.schedule.map((r, i) => (i === 2 ? { ...r, ...patch } : r)) };
      expect(Number.isNaN(completeResultValue(broken))).toBe(true);
    }
  });
  it('rejects savings claimed with nothing to compare against', () => {
    expect(Number.isNaN(completeResultValue({ ...good, withoutExtra: null }))).toBe(true);
  });
  it('rejects a comparison where paying MORE somehow took longer', () => {
    const broken = { ...good, withoutExtra: { ...good.withoutExtra!, payoffMonths: good.payoffMonths - 1 } };
    expect(Number.isNaN(completeResultValue(broken))).toBe(true);
  });
  it('rejects a mis-stated extra total or cost-of-ownership', () => {
    expect(Number.isNaN(completeResultValue({ ...good, totalExtraPrincipal: good.totalExtraPrincipal + 100 }))).toBe(true);
    expect(Number.isNaN(completeResultValue({ ...good, totalCostOfOwnership: good.totalCostOfOwnership + 100 }))).toBe(true);
  });
  it('rejects a non-finite or negative biweekly figure', () => {
    expect(Number.isNaN(completeResultValue({ ...good, biweekly: { ...good.biweekly!, totalInterest: Number.NaN } }))).toBe(true);
    expect(Number.isNaN(completeResultValue({ ...good, biweekly: { ...good.biweekly!, payoffPeriods: 0 } }))).toBe(true);
  });
});

describe('mortgage binding — monthsLabel', () => {
  it('reads whole years and months, and names an empty saving', () => {
    expect(monthsLabel(360)).toBe('30 years');
    expect(monthsLabel(254)).toBe('21 years 2 months');
    expect(monthsLabel(1)).toBe('1 month');
    expect(monthsLabel(12)).toBe('1 year');
    expect(monthsLabel(0)).toBe('none');
  });
});
