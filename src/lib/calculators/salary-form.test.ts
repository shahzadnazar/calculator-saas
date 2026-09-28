import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DAYS_PER_WEEK,
  DEFAULT_FREQUENCY,
  DEFAULT_HOLIDAYS,
  DEFAULT_HOURS_PER_WEEK,
  DEFAULT_VACATION_DAYS,
  MSG,
  PAY_FREQUENCIES,
  PAY_ROWS,
  SALARY_EXAMPLE_VALUES,
  completeSalaryValue,
  computeSalary,
  describeSalaryResult,
  formatPay,
  interpretSalary,
  parseNonNegative,
  parsePositive,
  salaryBinding,
  validateSalaryValues,
  type SalaryValues,
} from './salary-form';

/**
 * The published reference case: $50 an hour, 40 hours over 5 days, 10 holidays and 15
 * vacation days — $104,000 unadjusted, $94,000 adjusted.
 */
const REF: SalaryValues = {
  amount: '50',
  frequency: 'hourly',
  hoursPerWeek: '40',
  daysPerWeek: '5',
  holidaysPerYear: '10',
  vacationDaysPerYear: '15',
};
const vals = (over: Partial<SalaryValues> = {}): SalaryValues => ({ ...REF, ...over });
const errs = (v: SalaryValues) => (validateSalaryValues(v) as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
const money = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

describe('parsing', () => {
  it('tells an empty field from a bad one', () => {
    expect(parseNonNegative('')).toBe('empty');
    expect(parseNonNegative('   ')).toBe('empty');
    expect(parseNonNegative('abc')).toBe('invalid');
    expect(parseNonNegative('-1')).toBe('invalid');
    expect(parseNonNegative('0')).toBe(0);
    expect(parseNonNegative('50')).toBe(50);
  });

  it('never turns a bad entry into zero', () => {
    // The mistake this guards: Number(v) || 0 silently reading "abc" as a valid $0.
    expect(parseNonNegative('abc')).not.toBe(0);
    expect(parsePositive('abc')).toBe('invalid');
  });

  it('accepts a fractional schedule but caps the days in a week', () => {
    expect(parsePositive('37.5')).toBe(37.5);
    expect(parsePositive('7', 7)).toBe(7);
    expect(parsePositive('8', 7)).toBe('invalid');
    expect(parsePositive('0')).toBe('invalid');
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('validation', () => {
  it('accepts the reference entry', () => {
    expect(validateSalaryValues(REF)).toEqual({ ok: true });
  });

  it('accepts a zero salary and zero time off', () => {
    expect(validateSalaryValues(vals({ amount: '0' }))).toEqual({ ok: true });
    expect(validateSalaryValues(vals({ holidaysPerYear: '0', vacationDaysPerYear: '0' }))).toEqual({ ok: true });
  });

  it('names every missing field', () => {
    expect(
      errs({ amount: '', frequency: 'hourly', hoursPerWeek: '', daysPerWeek: '', holidaysPerYear: '', vacationDaysPerYear: '' }),
    ).toEqual({
      amount: MSG.amountRequired,
      hoursPerWeek: MSG.hoursRequired,
      daysPerWeek: MSG.daysRequired,
      holidaysPerYear: MSG.holidaysRequired,
      vacationDaysPerYear: MSG.vacationRequired,
    });
  });

  it('rejects a negative salary and negative time off', () => {
    expect(errs(vals({ amount: '-1' })).amount).toBe(MSG.amountInvalid);
    expect(errs(vals({ holidaysPerYear: '-1' })).holidaysPerYear).toBe(MSG.holidaysInvalid);
    expect(errs(vals({ vacationDaysPerYear: '-1' })).vacationDaysPerYear).toBe(MSG.vacationInvalid);
  });

  it('rejects a week with no hours, and more than seven days', () => {
    expect(errs(vals({ hoursPerWeek: '0' })).hoursPerWeek).toBe(MSG.hoursInvalid);
    expect(errs(vals({ daysPerWeek: '0' })).daysPerWeek).toBe(MSG.daysInvalid);
    expect(errs(vals({ daysPerWeek: '8' })).daysPerWeek).toBe(MSG.daysInvalid);
  });

  it('refuses time off that swallows the whole working year', () => {
    const r = validateSalaryValues(vals({ holidaysPerYear: '200', vacationDaysPerYear: '100' })) as {
      ok: false;
      formError?: string;
    };
    expect(r.ok).toBe(false);
    expect(r.formError).toBe(MSG.noDaysLeft);
    // Exactly all of them is still none left to work.
    expect((validateSalaryValues(vals({ holidaysPerYear: '260', vacationDaysPerYear: '0' })) as { formError?: string }).formError).toBe(MSG.noDaysLeft);
  });

  it('allows time off right up to the last working day', () => {
    expect(validateSalaryValues(vals({ holidaysPerYear: '259', vacationDaysPerYear: '0' }))).toEqual({ ok: true });
  });
});

/* ------------------------------------------------------------------ */
/* Computation + the complete-result guard                             */
/* ------------------------------------------------------------------ */

describe('computation', () => {
  const r = computeSalary(REF);

  it('reproduces the published reference figures', () => {
    expect(money(r.unadjusted.annual)).toBe(104000);
    expect(money(r.adjusted.annual)).toBe(94000);
    expect(money(r.adjusted.hourly)).toBe(45.19);
    expect(money(r.unadjusted.hourly)).toBe(50);
  });

  it('echoes the parsed inputs back', () => {
    expect(r.amount).toBe(50);
    expect(r.frequency).toBe('hourly');
    expect(r.hoursPerWeek).toBe(40);
    expect(r.daysPerWeek).toBe(5);
    expect(r.holidaysPerYear).toBe(10);
    expect(r.vacationDaysPerYear).toBe(15);
  });

  it('the guarded value is the adjusted annual salary', () => {
    expect(money(completeSalaryValue(r))).toBe(94000);
    expect(money(salaryBinding.resultValue(r))).toBe(94000);
  });

  it('a zero salary is a real, finite answer', () => {
    expect(completeSalaryValue(computeSalary(vals({ amount: '0' })))).toBe(0);
  });
});

describe('the complete-result guard', () => {
  const base = computeSalary(REF);
  const broken = (mutate: (r: typeof base) => void) => {
    const copy = JSON.parse(JSON.stringify(base)) as typeof base;
    mutate(copy);
    return copy;
  };

  it('rejects an unsolvable schedule', () => {
    expect(Number.isNaN(completeSalaryValue(computeSalary(vals({ daysPerWeek: '0' }))))).toBe(true);
    expect(Number.isNaN(completeSalaryValue(computeSalary(vals({ holidaysPerYear: '300' }))))).toBe(true);
  });

  it('rejects an unknown pay frequency', () => {
    expect(Number.isNaN(completeSalaryValue(broken((c) => ((c as { frequency: string }).frequency = 'fortnightly'))))).toBe(true);
  });

  it('rejects a single broken cell anywhere in the table', () => {
    // The whole point: the headline can look fine while one cell is NaN.
    expect(Number.isNaN(completeSalaryValue(broken((c) => (c.unadjusted.semimonthly = Number.NaN))))).toBe(true);
    expect(Number.isNaN(completeSalaryValue(broken((c) => (c.adjusted.quarterly = Number.POSITIVE_INFINITY))))).toBe(true);
    expect(Number.isNaN(completeSalaryValue(broken((c) => (c.unadjusted.hourly = -1))))).toBe(true);
  });

  it('rejects a table where time off somehow pays more', () => {
    expect(Number.isNaN(completeSalaryValue(broken((c) => (c.adjusted.annual = c.unadjusted.annual + 1))))).toBe(true);
  });

  it('rejects a negative amount that slipped past validation', () => {
    expect(Number.isNaN(completeSalaryValue(broken((c) => (c.amount = -5))))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('presentation', () => {
  it('prints rates with cents and longer periods whole, as the reference does', () => {
    expect(formatPay(45.1923, true)).toBe('$45.19');
    expect(formatPay(1807.69, false)).toBe('$1,808');
    expect(formatPay(104000, false)).toBe('$104,000');
    expect(formatPay(Number.NaN, false)).toBe('—');
  });

  it('lists the eight rows in the reference order, rates carrying cents', () => {
    expect(PAY_ROWS.map((r) => r.label)).toEqual([
      'Hourly', 'Daily', 'Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly', 'Quarterly', 'Annual',
    ]);
    expect(PAY_ROWS.filter((r) => r.cents).map((r) => r.key)).toEqual(['hourly', 'daily']);
  });

  it('offers the eight pay periods the reference offers', () => {
    expect(PAY_FREQUENCIES.map((f) => f.label)).toEqual([
      'Hour', 'Day', 'Week', 'Bi-week', 'Semi-month', 'Month', 'Quarter', 'Year',
    ]);
  });

  it('explains what the time off cost', () => {
    expect(interpretSalary(computeSalary(REF))).toBe(
      '25 days of holidays and vacation leave 235 days worked out of 260 days, so the year pays $94,000 rather than $104,000.',
    );
  });

  it('says so plainly when there is no time off', () => {
    const none = interpretSalary(computeSalary(vals({ holidaysPerYear: '0', vacationDaysPerYear: '0' })));
    expect(none).toContain('no holidays or vacation');
    expect(none).toContain('$104,000');
  });

  it('announces the adjusted annual figure only', () => {
    expect(describeSalaryResult(computeSalary(REF))).toBe('Adjusted annual salary: $94,000.');
  });
});

/* ------------------------------------------------------------------ */
/* Defaults, example and the binding surface                           */
/* ------------------------------------------------------------------ */

describe('defaults and the worked example', () => {
  it('ships the reference schedule as the structural defaults', () => {
    expect(DEFAULT_FREQUENCY).toBe('hourly');
    expect([DEFAULT_HOURS_PER_WEEK, DEFAULT_DAYS_PER_WEEK, DEFAULT_HOLIDAYS, DEFAULT_VACATION_DAYS]).toEqual([
      '40', '5', '10', '15',
    ]);
  });

  it('the example is the reference case and computes its published figure', () => {
    expect(SALARY_EXAMPLE_VALUES).toEqual(REF);
    expect(validateSalaryValues(SALARY_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(money(salaryBinding.resultValue(computeSalary(SALARY_EXAMPLE_VALUES)))).toBe(94000);
  });

  it('has no isUsableResult — the guard is resultValue', () => {
    expect(salaryBinding.isUsableResult).toBeUndefined();
  });
});

describe('the binding reads and resets its controls', () => {
  /** Vitest runs without a DOM, so the root is a stub answering the binding's selectors. */
  const stubRoot = (v: Record<string, string>) => {
    const controls: Record<string, { value: string }> = {};
    for (const [k, val] of Object.entries(v)) controls[k] = { value: val };
    return {
      querySelector(sel: string) {
        const m = sel.match(/\[name="(.+?)"\]$/);
        return m ? (controls[m[1]] ?? null) : null;
      },
    } as unknown as HTMLElement;
  };

  it('reads every control', () => {
    expect(salaryBinding.readValues(stubRoot({ ...REF }))).toEqual(REF);
  });

  it('falls back to the default frequency when the select says something unknown', () => {
    expect(salaryBinding.readValues(stubRoot({ ...REF, frequency: 'fortnightly' })).frequency).toBe('hourly');
  });

  it('reads a missing control as empty rather than guessing', () => {
    expect(salaryBinding.readValues(stubRoot({})).amount).toBe('');
  });

  it('reset empties the amount and restores the schedule', () => {
    const root = stubRoot({ ...REF, amount: '999', holidaysPerYear: '3' });
    salaryBinding.resetValues(root, 'personal');
    expect(salaryBinding.readValues(root)).toEqual({
      amount: '',
      frequency: 'hourly',
      hoursPerWeek: '40',
      daysPerWeek: '5',
      holidaysPerYear: '10',
      vacationDaysPerYear: '15',
    });
  });
});
