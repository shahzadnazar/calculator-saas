import { describe, it, expect } from 'vitest';
import {
  AMORTIZATION_EXAMPLE_VALUES,
  MAX_TERM_YEARS,
  ONE_TIME_SLOTS,
  TERM_MAX_MESSAGE,
  TERM_MESSAGE,
  amortizationBinding,
  completeResultValue,
  computeAmortization,
  describeAmortizationResult,
  emptyOneTimeList,
  formatMonths,
  spokenUSD,
  validateAmortizationValues,
  type AmortComputed,
  type AmortValues,
} from './amortization-form';

/**
 * Amortization binding — validation, the optional extras and the complete-result
 * guard.
 *
 * The guard carries most of these tests: it is what stands between a reader and a
 * schedule whose rows do not add up to its totals, so every way a result can be
 * internally inconsistent is asserted to fail it.
 */

const FULL: AmortValues = {
  amount: '200000',
  annualInterestRate: '6',
  termYears: '15',
  termMonths: '0',
  startMonth: '',
  startYear: '',
  extraMonthlyAmount: '',
  extraMonthlyMonth: '',
  extraMonthlyYear: '',
  extraYearlyAmount: '',
  extraYearlyMonth: '',
  extraYearlyYear: '',
  extraOneTime: emptyOneTimeList(),
};

const at = (over: Partial<AmortValues> = {}): AmortValues => ({ ...FULL, ...over });
const errs = (r: ReturnType<typeof validateAmortizationValues>): Record<string, string> =>
  r.ok ? {} : (r.fieldErrors ?? {});
const cents = (n: number) => Math.round(n * 100) / 100;

describe('validation — the required fields', () => {
  it('accepts the reference entry', () => {
    expect(validateAmortizationValues(FULL)).toEqual({ ok: true });
  });

  it('requires a loan amount greater than zero', () => {
    expect(errs(validateAmortizationValues(at({ amount: '' }))).amount).toBe('Enter a loan amount.');
    for (const bad of ['0', '-5000', 'abc']) {
      expect(errs(validateAmortizationValues(at({ amount: bad }))).amount).toBeTruthy();
    }
  });

  it('requires an interest rate, and accepts zero', () => {
    expect(errs(validateAmortizationValues(at({ annualInterestRate: '' }))).annualInterestRate).toBe(
      'Enter an interest rate.',
    );
    expect(errs(validateAmortizationValues(at({ annualInterestRate: '-1' }))).annualInterestRate).toBeTruthy();
    expect(validateAmortizationValues(at({ annualInterestRate: '0' }))).toEqual({ ok: true });
  });
});

describe('validation — the term is two boxes but one quantity', () => {
  it('accepts years alone, months alone, or both', () => {
    expect(validateAmortizationValues(at({ termYears: '15', termMonths: '' }))).toEqual({ ok: true });
    expect(validateAmortizationValues(at({ termYears: '', termMonths: '18' }))).toEqual({ ok: true });
    expect(validateAmortizationValues(at({ termYears: '5', termMonths: '6' }))).toEqual({ ok: true });
  });

  it('rejects a term of nothing at all, against the years box', () => {
    expect(errs(validateAmortizationValues(at({ termYears: '', termMonths: '' }))).termYears).toBe(TERM_MESSAGE);
    expect(errs(validateAmortizationValues(at({ termYears: '0', termMonths: '0' }))).termYears).toBe(TERM_MESSAGE);
  });

  it(`rejects a term beyond ${MAX_TERM_YEARS} years`, () => {
    expect(errs(validateAmortizationValues(at({ termYears: '31' }))).termYears).toBe(TERM_MAX_MESSAGE);
    expect(errs(validateAmortizationValues(at({ termYears: '30', termMonths: '1' }))).termYears).toBe(
      TERM_MAX_MESSAGE,
    );
    expect(validateAmortizationValues(at({ termYears: '30', termMonths: '0' }))).toEqual({ ok: true });
  });

  it('rejects a fractional or negative box, never rounding it', () => {
    expect(errs(validateAmortizationValues(at({ termYears: '15.5' }))).termYears).toBeTruthy();
    expect(errs(validateAmortizationValues(at({ termMonths: '2.5' }))).termMonths).toBeTruthy();
    expect(errs(validateAmortizationValues(at({ termYears: '-3' }))).termYears).toBeTruthy();
  });
});

describe('validation — the optional extras', () => {
  it('an untouched form reaches none of the extras branches', () => {
    expect(validateAmortizationValues(FULL)).toEqual({ ok: true });
  });

  it('accepts extras with no date at all — blank means from the first payment', () => {
    expect(
      validateAmortizationValues(at({ extraMonthlyAmount: '200', extraYearlyAmount: '1000' })),
    ).toEqual({ ok: true });
  });

  it('rejects a negative or unparseable extra amount', () => {
    expect(errs(validateAmortizationValues(at({ extraMonthlyAmount: '-50' }))).extraMonthlyAmount).toBeTruthy();
    expect(errs(validateAmortizationValues(at({ extraYearlyAmount: 'lots' }))).extraYearlyAmount).toBeTruthy();
  });

  it('rejects an out-of-range year on any dated field', () => {
    expect(errs(validateAmortizationValues(at({ startYear: '1800' }))).startYear).toBeTruthy();
    expect(errs(validateAmortizationValues(at({ extraMonthlyYear: '9999' }))).extraMonthlyYear).toBeTruthy();
    expect(errs(validateAmortizationValues(at({ extraYearlyYear: '12.5' }))).extraYearlyYear).toBeTruthy();
  });

  it('validates every one-time row by its own key', () => {
    const rows = emptyOneTimeList();
    rows[2] = { amount: '-100', month: '', year: '' };
    rows[4] = { amount: '500', month: '', year: '1700' };
    const e = errs(validateAmortizationValues(at({ extraOneTime: rows })));
    expect(e.extraOneTime3Amount).toBeTruthy();
    expect(e.extraOneTime5Year).toBeTruthy();
    expect(e.extraOneTime1Amount).toBeUndefined();
  });

  it('offers five one-time rows', () => {
    expect(ONE_TIME_SLOTS).toBe(5);
    expect(emptyOneTimeList()).toHaveLength(5);
  });
});

describe('computeAmortization', () => {
  it('reproduces the reference case', () => {
    const r = computeAmortization(FULL);
    expect(cents(r.monthlyPayment)).toBe(1687.71);
    expect(cents(r.totalOfPayments)).toBe(303788.46);
    expect(cents(r.totalInterest)).toBe(103788.46);
    expect(r.payoffMonths).toBe(180);
    expect(r.hasExtras).toBe(false);
    expect(r.annual).toHaveLength(15);
  });

  it('reads the term from both boxes', () => {
    expect(computeAmortization(at({ termYears: '5', termMonths: '6' })).scheduledMonths).toBe(66);
    expect(computeAmortization(at({ termYears: '', termMonths: '18' })).scheduledMonths).toBe(18);
  });

  it('flags extras only when one actually applies', () => {
    expect(computeAmortization(at({ extraMonthlyAmount: '0' })).hasExtras).toBe(false);
    expect(computeAmortization(at({ extraMonthlyAmount: '200' })).hasExtras).toBe(true);
  });

  it('an extra with no date applies from the first payment', () => {
    const r = computeAmortization(at({ extraMonthlyAmount: '200' }));
    expect(r.schedule[0].extra).toBe(200);
  });

  it('dates an extra relative to the loan start', () => {
    const r = computeAmortization(
      at({
        startMonth: '1',
        startYear: '2026',
        extraOneTime: [
          { amount: '10000', month: '7', year: '2026' },
          ...emptyOneTimeList().slice(1),
        ],
      }),
    );
    // July 2026 is six months after January 2026, so the seventh payment.
    expect(r.schedule[6].extra).toBe(10000);
    expect(r.totalExtra).toBe(10000);
  });

  it('clamps a date before the loan start to the first payment', () => {
    const r = computeAmortization(
      at({
        startMonth: '6',
        startYear: '2026',
        extraMonthlyAmount: '150',
        extraMonthlyMonth: '1',
        extraMonthlyYear: '2020',
      }),
    );
    expect(r.schedule[0].extra).toBe(150);
  });

  it('shortens the loan and reports what was saved', () => {
    const r = computeAmortization(at({ extraMonthlyAmount: '300' }));
    expect(r.payoffMonths).toBeLessThan(180);
    expect(r.interestSaved).toBeGreaterThan(0);
    expect(r.monthsSaved).toBe(180 - r.payoffMonths);
    expect(cents((r.withoutExtras as { totalInterest: number }).totalInterest)).toBe(103788.46);
  });

  it('ignores blank one-time rows', () => {
    const rows = emptyOneTimeList();
    rows[1] = { amount: '2500', month: '', year: '' };
    const r = computeAmortization(at({ extraOneTime: rows }));
    expect(r.totalExtra).toBe(2500);
  });
});

describe('the complete-result guard', () => {
  const good = computeAmortization(FULL);
  const withExtras = computeAmortization(at({ extraMonthlyAmount: '250' }));
  const clone = (r: AmortComputed): AmortComputed => ({
    ...r,
    schedule: r.schedule.map((x) => ({ ...x })),
    annual: r.annual.map((x) => ({ ...x })),
    withoutExtras: r.withoutExtras ? { ...r.withoutExtras } : null,
  });
  const broken = (base: AmortComputed, mutate: (r: AmortComputed) => void): AmortComputed => {
    const copy = clone(base);
    mutate(copy);
    return copy;
  };

  it('accepts a result that reconciles, with and without extras', () => {
    expect(cents(completeResultValue(good))).toBe(1687.71);
    expect(cents(completeResultValue(withExtras))).toBe(1687.71);
  });

  it('rejects a summary that does not add up', () => {
    expect(completeResultValue(broken(good, (r) => (r.totalInterest += 100)))).toBeNaN();
    expect(completeResultValue(broken(good, (r) => (r.totalOfPayments *= 2)))).toBeNaN();
    expect(completeResultValue(broken(good, (r) => (r.loanAmount -= 1000)))).toBeNaN();
  });

  it('rejects a non-finite or negative figure', () => {
    expect(completeResultValue(broken(good, (r) => (r.monthlyPayment = Number.NaN)))).toBeNaN();
    expect(completeResultValue(broken(good, (r) => (r.totalInterest = -1)))).toBeNaN();
  });

  it('rejects a row whose payment is not its principal plus interest', () => {
    expect(completeResultValue(broken(good, (r) => (r.schedule[10].payment += 5)))).toBeNaN();
  });

  it('rejects rows that are reordered or have a gap', () => {
    expect(completeResultValue(broken(good, (r) => (r.schedule[5].period = 99)))).toBeNaN();
    expect(completeResultValue(broken(good, (r) => r.schedule.splice(5, 1)))).toBeNaN();
  });

  it('rejects a schedule that does not repay the loan', () => {
    expect(completeResultValue(broken(good, (r) => (r.schedule[3].principal += 500)))).toBeNaN();
  });

  it('rejects a final balance that is not zero', () => {
    expect(completeResultValue(broken(good, (r) => (r.schedule[179].balance = 250)))).toBeNaN();
  });

  it('rejects yearly rows that disagree with the monthly ones', () => {
    expect(completeResultValue(broken(good, (r) => (r.annual[4].interest += 50)))).toBeNaN();
    expect(completeResultValue(broken(good, (r) => (r.annual[4].balance += 50)))).toBeNaN();
    expect(completeResultValue(broken(good, (r) => r.annual.pop()))).toBeNaN();
  });

  it('rejects a payoff longer than the scheduled term', () => {
    expect(completeResultValue(broken(good, (r) => (r.scheduledMonths = 12)))).toBeNaN();
  });

  it('rejects an extras flag that disagrees with the extras paid', () => {
    expect(completeResultValue(broken(good, (r) => (r.hasExtras = true)))).toBeNaN();
    expect(completeResultValue(broken(withExtras, (r) => (r.hasExtras = false)))).toBeNaN();
  });

  it('rejects a comparison missing from a result that claims extras', () => {
    expect(completeResultValue(broken(withExtras, (r) => (r.withoutExtras = null)))).toBeNaN();
  });

  it('rejects savings that contradict the comparison', () => {
    expect(completeResultValue(broken(withExtras, (r) => (r.interestSaved += 1000)))).toBeNaN();
    expect(completeResultValue(broken(withExtras, (r) => (r.monthsSaved += 3)))).toBeNaN();
    // Paying extra can never cost more interest or take longer.
    expect(completeResultValue(broken(withExtras, (r) => (r.interestSaved = -50)))).toBeNaN();
    expect(completeResultValue(broken(withExtras, (r) => (r.monthsSaved = -1)))).toBeNaN();
  });

  it('rejects stray savings on a result with no extras', () => {
    expect(completeResultValue(broken(good, (r) => (r.interestSaved = 500)))).toBeNaN();
  });

  it('rejects an extra column that does not sum to the reported total', () => {
    expect(completeResultValue(broken(withExtras, (r) => (r.schedule[2].extra += 100)))).toBeNaN();
  });
});

describe('presentation helpers', () => {
  it('announces the monthly payment', () => {
    expect(describeAmortizationResult(computeAmortization(FULL))).toBe(
      'Your monthly payment is 1687 dollars and 71 cents.',
    );
  });

  it('speaks dollars and cents', () => {
    expect(spokenUSD(0)).toBe('0 dollars');
    expect(spokenUSD(1)).toBe('1 dollar');
    expect(spokenUSD(1687.71)).toBe('1687 dollars and 71 cents');
  });

  it('formats a duration in years and months, dropping the empty half', () => {
    expect(formatMonths(0)).toBe('0 months');
    expect(formatMonths(1)).toBe('1 month');
    expect(formatMonths(7)).toBe('7 months');
    expect(formatMonths(12)).toBe('1 year');
    expect(formatMonths(24)).toBe('2 years');
    expect(formatMonths(38)).toBe('3 years 2 months');
  });
});

describe('the worked example', () => {
  it('validates, so the example a visitor sees is a real calculation', () => {
    expect(validateAmortizationValues(AMORTIZATION_EXAMPLE_VALUES)).toEqual({ ok: true });
  });

  it('is the published reference case and passes the same guard as any other result', () => {
    const r = computeAmortization(AMORTIZATION_EXAMPLE_VALUES);
    expect(cents(amortizationBinding.resultValue(r) as number)).toBe(1687.71);
  });

  it('carries no extras, matching what an untouched form produces', () => {
    expect(computeAmortization(AMORTIZATION_EXAMPLE_VALUES).hasExtras).toBe(false);
  });
});
