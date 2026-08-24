import { describe, it, expect } from 'vitest';
import {
  salaryBinding,
  validateSalaryValues,
  computeSalary,
  completeSalaryValue,
  describeSalaryResult,
  parseAmount,
  parsePositive,
  DEFAULT_UNIT,
  DEFAULT_HOURS_PER_WEEK,
  MSG,
  type SalaryValues,
  type SalaryComputed,
} from './salary-form';
import { convertSalary } from './salary';

/**
 * Salary binding unit tests (R19A1). Validation, computation (delegating to the FROZEN convertSalary —
 * whose full matrix stays salary.test.ts's authority), the complete-result guard (tamper + source
 * reconciliation), the announcement, and the DOM read/reset helpers via a mock root. No conversion
 * math is reimplemented here.
 */

const vals = (v: Partial<SalaryValues> = {}): SalaryValues => ({
  amount: '25',
  unit: 'hourly',
  hoursPerWeek: '40',
  daysPerWeek: '5',
  weeksPerYear: '52',
  ...v,
});

function mockRoot(v: Partial<Record<keyof SalaryValues, string>> = {}) {
  const store: Record<string, { value: string }> = {
    amount: { value: v.amount ?? '' },
    unit: { value: v.unit ?? DEFAULT_UNIT },
    hoursPerWeek: { value: v.hoursPerWeek ?? '' },
    daysPerWeek: { value: v.daysPerWeek ?? '' },
    weeksPerYear: { value: v.weeksPerYear ?? '' },
  };
  const root = {
    querySelector(sel: string) {
      const m = sel.match(/\[name="(\w+)"\]/);
      return m && store[m[1]] ? store[m[1]] : null;
    },
  } as unknown as HTMLElement;
  return { root, store };
}

describe('salary binding — contract', () => {
  it('does NOT implement isUsableResult (the guard lives in resultValue)', () => {
    expect(salaryBinding.isUsableResult).toBeUndefined();
  });

  it('the default unit is hourly and the default hours/week is 40', () => {
    expect(DEFAULT_UNIT).toBe('hourly');
    expect(DEFAULT_HOURS_PER_WEEK).toBe('40');
  });

  it('resultValue is the complete-result guard: the ANNUAL figure when coherent', () => {
    const c = computeSalary(vals());
    expect(salaryBinding.resultValue(c)).toBe(c.annual);
    expect(salaryBinding.resultValue(c)).toBeCloseTo(52000, 6);
  });
});

describe('salary binding — strict validation', () => {
  it('parseAmount: empty vs invalid vs a finite non-negative number (0 valid, negative invalid)', () => {
    expect(parseAmount('')).toBe('empty');
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('52000.50')).toBe(52000.5);
    expect(parseAmount('-1')).toBe('invalid');
    expect(parseAmount('abc')).toBe('invalid');
    expect(parseAmount('Infinity')).toBe('invalid');
  });

  it('parsePositive: assumptions must be finite and > 0 (decimals allowed)', () => {
    expect(parsePositive('')).toBe('empty');
    expect(parsePositive('37.5')).toBe(37.5);
    expect(parsePositive('0')).toBe('invalid');
    expect(parsePositive('-2')).toBe('invalid');
  });

  it('ordinary input is valid; a zero amount is valid; a negative amount is a field error', () => {
    expect(validateSalaryValues(vals()).ok).toBe(true);
    expect(validateSalaryValues(vals({ amount: '0' })).ok).toBe(true);
    const neg = validateSalaryValues(vals({ amount: '-5' }));
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.fieldErrors?.amount).toBe(MSG.amountInvalid);
  });

  it('requires the amount and each schedule assumption, keyed to the field', () => {
    const empty = validateSalaryValues({ amount: '', unit: 'hourly', hoursPerWeek: '', daysPerWeek: '', weeksPerYear: '' });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.fieldErrors?.amount).toBe(MSG.amountRequired);
      expect(empty.fieldErrors?.hoursPerWeek).toBe(MSG.hoursRequired);
      expect(empty.fieldErrors?.daysPerWeek).toBe(MSG.daysRequired);
      expect(empty.fieldErrors?.weeksPerYear).toBe(MSG.weeksRequired);
    }
  });

  it('rejects a zero or negative schedule assumption', () => {
    const zeroH = validateSalaryValues(vals({ hoursPerWeek: '0' }));
    if (!zeroH.ok) expect(zeroH.fieldErrors?.hoursPerWeek).toBe(MSG.hoursInvalid);
    const negW = validateSalaryValues(vals({ weeksPerYear: '-1' }));
    if (!negW.ok) expect(negW.fieldErrors?.weeksPerYear).toBe(MSG.weeksInvalid);
  });
});

describe('salary binding — computation + guard (delegating to the frozen convertSalary)', () => {
  const ref = (v: SalaryValues) =>
    convertSalary({ amount: Number(v.amount), unit: v.unit, hoursPerWeek: Number(v.hoursPerWeek), daysPerWeek: Number(v.daysPerWeek), weeksPerYear: Number(v.weeksPerYear) });

  it('delegates to convertSalary unchanged and echoes the parsed inputs', () => {
    const v = vals();
    const c = computeSalary(v);
    expect({ hourly: c.hourly, annual: c.annual, monthly: c.monthly }).toEqual({ hourly: ref(v).hourly, annual: ref(v).annual, monthly: ref(v).monthly });
    expect(c.unit).toBe('hourly');
    expect(c.amount).toBe(25);
    expect(completeSalaryValue(c)).toBe(c.annual);
  });

  it('every input unit produces a valid annual (the dominant sentinel)', () => {
    for (const [unit, amount] of [['hourly', '25'], ['daily', '200'], ['weekly', '1000'], ['biweekly', '2000'], ['monthly', '5000'], ['annual', '52000']] as const) {
      const c = computeSalary(vals({ unit, amount }));
      expect(Number.isNaN(completeSalaryValue(c))).toBe(false);
      expect(completeSalaryValue(c)).toBe(c.annual);
    }
  });

  it('a zero amount is a VALID $0 result: resultValue = 0, not NaN', () => {
    const c = computeSalary(vals({ amount: '0' }));
    expect(c.annual).toBe(0);
    expect(completeSalaryValue(c)).toBe(0);
    expect(Number.isNaN(completeSalaryValue(c))).toBe(false);
  });

  it('rejects tampered / inconsistent results (guard reconciles via a convertSalary recompute)', () => {
    const c = computeSalary(vals());
    expect(Number.isNaN(completeSalaryValue({ ...c, annual: c.annual + 1 }))).toBe(true); // wrong annual
    expect(Number.isNaN(completeSalaryValue({ ...c, hourly: c.hourly + 1 }))).toBe(true); // wrong equivalent
    expect(Number.isNaN(completeSalaryValue({ ...c, amount: -1 }))).toBe(true); // negative amount
    expect(Number.isNaN(completeSalaryValue({ ...c, hoursPerWeek: 0 }))).toBe(true); // non-positive assumption
    expect(Number.isNaN(completeSalaryValue({ ...c, unit: 'yearly' as unknown as SalaryComputed['unit'] }))).toBe(true); // unknown unit
    expect(Number.isNaN(completeSalaryValue({ ...c, annual: Number.POSITIVE_INFINITY }))).toBe(true); // non-finite
  });
});

describe('salary binding — description + DOM', () => {
  it('announces the dominant annual salary', () => {
    const c = computeSalary(vals());
    expect(describeSalaryResult(c)).toBe('Annual salary: $52,000.00.');
  });

  it('a zero salary announces normally', () => {
    const c = computeSalary(vals({ amount: '0' }));
    expect(describeSalaryResult(c)).toBe('Annual salary: $0.00.');
  });

  it('readValues reads the amount, unit and assumptions', () => {
    const { root } = mockRoot({ amount: '60000', unit: 'annual', hoursPerWeek: '40', daysPerWeek: '5', weeksPerYear: '52' });
    expect(salaryBinding.readValues(root)).toEqual({ amount: '60000', unit: 'annual', hoursPerWeek: '40', daysPerWeek: '5', weeksPerYear: '52' });
  });

  it('readValues defaults an absent/invalid unit to hourly', () => {
    const { root } = mockRoot({ unit: '' });
    expect(salaryBinding.readValues(root).unit).toBe('hourly');
  });

  it('resetValues clears the amount and restores the default unit + 40/5/52 assumptions', () => {
    const { root, store } = mockRoot({ amount: '99999', unit: 'annual', hoursPerWeek: '20', daysPerWeek: '3', weeksPerYear: '48' });
    salaryBinding.resetValues(root, 'personal');
    expect(store.amount.value).toBe('');
    expect(store.unit.value).toBe('hourly');
    expect(store.hoursPerWeek.value).toBe('40');
    expect(store.daysPerWeek.value).toBe('5');
    expect(store.weeksPerYear.value).toBe('52');
  });
});
