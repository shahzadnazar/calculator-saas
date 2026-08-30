import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VALUES,
  INCOME_TAX_EXAMPLE_VALUES,
  MONEY_FIELDS,
  MSG,
  RESULT_ROWS,
  completeIncomeTaxValue,
  computeIncomeTax,
  describeIncomeTaxResult,
  formatRow,
  headlineLabel,
  headlineValue,
  incomeTaxBinding,
  interpretIncomeTax,
  parseAge,
  parseCount,
  parseMoney,
  parseRate,
  toTaxReturnInput,
  validateIncomeTaxValues,
  type IncomeTaxValues,
} from './income-tax-form';

/** The reference return: single, 30, $80,000 wages, $9,000 withheld, 2025 → owes $49. */
const REF: IncomeTaxValues = { ...DEFAULT_VALUES, wages: '80000', federalWithheld: '9000' };
const vals = (over: Partial<IncomeTaxValues> = {}): IncomeTaxValues => ({ ...REF, ...over });
const errs = (v: IncomeTaxValues) =>
  (validateIncomeTaxValues(v) as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
const round = (n: number) => Math.round(n);

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

describe('parsing', () => {
  it('reads a blank money field as zero, because that is what the $0 default means', () => {
    expect(parseMoney('')).toBe(0);
    expect(parseMoney('   ')).toBe(0);
  });

  it('never turns a bad entry into zero', () => {
    // The mistake this guards: Number(v) || 0 reading "abc" as a valid $0 on a tax return.
    expect(parseMoney('abc')).toBe('invalid');
    expect(parseMoney('-1')).toBe('invalid');
    expect(parseMoney('abc')).not.toBe(0);
  });

  it('accepts a typed dollar sign or thousands separator', () => {
    expect(parseMoney('$80,000')).toBe(80000);
    expect(parseRate('5%')).toBe(5);
  });

  it('counts whole people only', () => {
    expect(parseCount('2')).toBe(2);
    expect(parseCount('')).toBe(0);
    expect(parseCount('1.5')).toBe('invalid');
    expect(parseCount('-1')).toBe('invalid');
  });

  it('treats a blank age as "not 65 or over" rather than an error', () => {
    expect(parseAge('30')).toBe(30);
    expect(parseAge('')).toBe(0);
    expect(parseAge('130')).toBe('invalid');
    expect(parseAge('-1')).toBe('invalid');
  });

  it('keeps a rate inside 0 to 100', () => {
    expect(parseRate('')).toBe(0);
    expect(parseRate('101')).toBe('invalid');
    expect(parseRate('-1')).toBe('invalid');
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('validation', () => {
  it('accepts the reference sheet', () => {
    expect(validateIncomeTaxValues(REF)).toEqual({ ok: true });
  });

  it('asks for an amount when the whole sheet is untouched', () => {
    expect(validateIncomeTaxValues(DEFAULT_VALUES)).toEqual({
      ok: false,
      fieldErrors: {},
      formError: MSG.nothingEntered,
    });
  });

  it('one amount anywhere is enough — an income line, or a withholding line alone', () => {
    expect(validateIncomeTaxValues(vals({ wages: '80000' }))).toEqual({ ok: true });
    // A refund claim: nothing earned on this sheet, but tax was withheld.
    expect(validateIncomeTaxValues(vals({ wages: '', federalWithheld: '500' }))).toEqual({ ok: true });
    // An explicit zero is an answer, not a blank.
    expect(validateIncomeTaxValues(vals({ wages: '0' }))).toEqual({ ok: true });
  });

  it('a filing status, year and age cannot stand in for an amount', () => {
    const noMoney = { ...DEFAULT_VALUES, filingStatus: 'single' as const, taxYear: '2025', age: '30' };
    expect(validateIncomeTaxValues(noMoney)).toMatchObject({ ok: false, formError: MSG.nothingEntered });
  });

  it('rejects a negative or unreadable amount on any money field', () => {
    for (const name of MONEY_FIELDS) {
      expect(errs(vals({ [name]: '-1' } as Partial<IncomeTaxValues>))[name]).toBe(MSG.money);
      expect(errs(vals({ [name]: 'abc' } as Partial<IncomeTaxValues>))[name]).toBe(MSG.money);
    }
  });

  it('rejects an impossible age but accepts a blank one', () => {
    expect(errs(vals({ age: '' })).age).toBeUndefined();
    expect(errs(vals({ age: '200' })).age).toBe(MSG.age);
  });

  it('rejects a fractional dependent and an out-of-range rate', () => {
    expect(errs(vals({ youngDependents: '1.5' })).youngDependents).toBe(MSG.dependents);
    expect(errs(vals({ stateLocalRatePct: '150' })).stateLocalRatePct).toBe(MSG.rate);
  });

  it('rejects an unknown filing status or tax year', () => {
    expect(errs(vals({ filingStatus: 'martian' as never })).filingStatus).toBe(MSG.status);
    expect(errs(vals({ taxYear: '1999' })).taxYear).toBe(MSG.year);
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('computation', () => {
  const r = computeIncomeTax(REF);

  it('reproduces every line of the published table', () => {
    expect(round(r.totalIncome)).toBe(80000);
    expect(round(r.totalDeductions)).toBe(15750);
    expect(round(r.taxableIncome)).toBe(64250);
    expect(round(r.regularTax)).toBe(9049);
    expect(round(r.alternativeMinimumTax)).toBe(0);
    expect(round(r.netInvestmentIncomeTax)).toBe(0);
    expect(round(r.totalCredits)).toBe(0);
    expect(round(r.totalTaxWithCredits)).toBe(9049);
    expect(r.marginalRate).toBe(22);
    expect(round(r.prepayments)).toBe(9000);
    expect(round(r.amountOwed)).toBe(49);
  });

  it('carries the year and status it was worked on', () => {
    expect(r.year).toBe(2025);
    expect(r.filingStatus).toBe('single');
  });

  it('maps the four college boxes into one list of students', () => {
    const input = toTaxReturnInput(vals({ college1: '1000', college3: '2000' }));
    expect(input.collegeExpenses).toEqual([1000, 0, 2000, 0]);
  });

  it('only counts business income when the filer says they have it', () => {
    expect(toTaxReturnInput(vals({ selfEmploymentIncome: '5000' })).hasSelfEmployment).toBe(false);
    expect(toTaxReturnInput(vals({ hasSelfEmployment: 'yes' })).hasSelfEmployment).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The complete-result guard                                           */
/* ------------------------------------------------------------------ */

describe('the complete-result guard', () => {
  const base = computeIncomeTax(REF);
  const broken = (mutate: (r: typeof base) => void) => {
    const copy = JSON.parse(JSON.stringify(base)) as typeof base;
    mutate(copy);
    return copy;
  };

  it('returns the amount owed when the whole return holds up', () => {
    expect(round(completeIncomeTaxValue(base))).toBe(49);
    expect(round(incomeTaxBinding.resultValue(base))).toBe(49);
  });

  it('rejects an unsolvable return', () => {
    expect(Number.isNaN(completeIncomeTaxValue(computeIncomeTax(vals({ taxYear: '1999' }))))).toBe(true);
  });

  it('rejects a single broken line anywhere in the table', () => {
    for (const { key } of RESULT_ROWS) {
      expect(Number.isNaN(completeIncomeTaxValue(broken((c) => ((c as unknown as Record<string, unknown>)[key] = Number.NaN))))).toBe(true);
    }
  });

  it('rejects a negative tax or income, but allows a negative amount owed', () => {
    expect(Number.isNaN(completeIncomeTaxValue(broken((c) => (c.regularTax = -1))))).toBe(true);
    expect(Number.isNaN(completeIncomeTaxValue(broken((c) => (c.totalIncome = -1))))).toBe(true);
    const refund = computeIncomeTax(vals({ federalWithheld: '20000' }));
    expect(completeIncomeTaxValue(refund)).toBeLessThan(0);
  });

  it('rejects a return whose bottom line does not follow from its own figures', () => {
    expect(Number.isNaN(completeIncomeTaxValue(broken((c) => (c.amountOwed = 1234))))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('presentation', () => {
  const owed = computeIncomeTax(REF);
  const refunded = computeIncomeTax(vals({ federalWithheld: '20000' }));

  it('lists the eleven lines the reference lists, in order', () => {
    expect(RESULT_ROWS.map((r) => r.label)).toEqual([
      'Total Income', 'Total Deductions', 'Taxable Income', 'Regular Taxes',
      'Alternative Minimum Tax', 'Net Investment Income Tax', 'All Tax Credits',
      'Total Tax with Credits', 'Marginal Tax Rate', 'Tax Pre-payments', 'Tax Amount Owe',
    ]);
  });

  it('heads the panel the way the reference does, and switches to a refund', () => {
    expect(headlineLabel(owed)).toBe('Tax Amount Owe for 2025');
    expect(headlineValue(owed)).toBe('$49');
    expect(headlineLabel(refunded)).toBe('Tax Refund for 2025');
    // A refund is shown as a positive amount under a refund heading, never as -$10,951.
    expect(headlineValue(refunded)).not.toContain('-');
  });

  it('prints whole dollars, and the marginal rate as a percentage', () => {
    expect(formatRow(owed, 'totalIncome')).toBe('$80,000');
    expect(formatRow(owed, 'marginalRate', true)).toBe('22%');
    expect(formatRow(owed, 'amountOwed')).toBe('$49');
  });

  it('explains the return in a sentence', () => {
    expect(interpretIncomeTax(owed)).toBe(
      'On $80,000 of income for 2025, taking the $15,750 standard deduction, the estimated federal tax is $9,049. Against $9,000 already withheld, that leaves $49 still to pay.',
    );
    expect(interpretIncomeTax(refunded)).toContain('a refund of');
  });

  it('names itemised deductions when they are the ones used', () => {
    const itemised = computeIncomeTax(vals({ mortgageInterest: '20000', charitableDonations: '5000' }));
    expect(interpretIncomeTax(itemised)).toContain('itemised deductions of');
  });

  it('announces the bottom line only', () => {
    expect(describeIncomeTaxResult(owed)).toBe('Estimated tax owed: $49.');
    expect(describeIncomeTaxResult(refunded)).toContain('Estimated refund:');
  });
});

/* ------------------------------------------------------------------ */
/* Defaults, example and the binding surface                           */
/* ------------------------------------------------------------------ */

describe('defaults and the worked example', () => {
  it('opens with every typed field blank, and only structural choices defaulted', () => {
    expect(DEFAULT_VALUES.filingStatus).toBe('single');
    expect(DEFAULT_VALUES.taxYear).toBe('2025');
    expect(DEFAULT_VALUES.hasSelfEmployment).toBe('no');
    expect(DEFAULT_VALUES.age).toBe('');
    expect(DEFAULT_VALUES.youngDependents).toBe('');
    for (const f of MONEY_FIELDS) expect(DEFAULT_VALUES[f]).toBe('');
  });

  it('a blank sheet is a prompt, not a $0 finding', () => {
    // "Tax Amount Owe for 2025: $0" over an untouched form reads as an answer to a question
    // nobody asked. The arithmetic underneath is still sound — it is the presentation of an
    // empty sheet as a result that is wrong.
    expect(validateIncomeTaxValues(DEFAULT_VALUES)).toMatchObject({ ok: false, formError: MSG.nothingEntered });
    const r = computeIncomeTax(DEFAULT_VALUES);
    expect(r.totalIncome).toBe(0);
    expect(r.amountOwed).toBe(0);
  });

  it('the example is the reference case and computes its published figure', () => {
    expect(INCOME_TAX_EXAMPLE_VALUES.wages).toBe('80000');
    expect(INCOME_TAX_EXAMPLE_VALUES.age).toBe('30');
    expect(validateIncomeTaxValues(INCOME_TAX_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(round(incomeTaxBinding.resultValue(computeIncomeTax(INCOME_TAX_EXAMPLE_VALUES)))).toBe(49);
  });

  it('has no isUsableResult — the guard is resultValue', () => {
    expect(incomeTaxBinding.isUsableResult).toBeUndefined();
  });
});

describe('the binding reads and resets its controls', () => {
  /** Vitest runs without a DOM, so the root is a stub answering the binding's selectors. */
  const stubRoot = (v: Record<string, string>) => {
    const controls: Record<string, { value: string }> = {};
    for (const [k, val] of Object.entries(v)) controls[k] = { value: val };
    const checked: Record<string, string> = {
      taxYear: v.taxYear ?? '2025',
      hasSelfEmployment: v.hasSelfEmployment ?? 'no',
    };
    return {
      querySelector(sel: string) {
        const c = sel.match(/^\[name="(.+?)"\]:checked$/);
        if (c) return checked[c[1]] !== undefined ? { value: checked[c[1]] } : null;
        const m = sel.match(/^\[name="(.+?)"\]$/);
        return m ? (controls[m[1]] ?? null) : null;
      },
    } as unknown as HTMLElement;
  };

  it('reads every control', () => {
    expect(incomeTaxBinding.readValues(stubRoot({ ...REF }))).toEqual(REF);
  });

  it('falls back to single when the status select says something unknown', () => {
    expect(incomeTaxBinding.readValues(stubRoot({ ...REF, filingStatus: 'martian' })).filingStatus).toBe('single');
  });

  it('reads a missing money control as blank', () => {
    expect(incomeTaxBinding.readValues(stubRoot({})).wages).toBe('');
  });

  it('reset empties every typed field and keeps the structural choices', () => {
    const root = stubRoot({ ...REF, wages: '999999' });
    incomeTaxBinding.resetValues(root, 'personal');
    expect(incomeTaxBinding.readValues(root).wages).toBe('');
    expect(incomeTaxBinding.readValues(root).age).toBe('');
    expect(incomeTaxBinding.readValues(root).filingStatus).toBe('single');
  });
});
