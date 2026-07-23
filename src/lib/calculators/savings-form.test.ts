import { describe, it, expect } from 'vitest';
import {
  validateSavingsValues,
  computeSavings,
  describeSavingsResult,
  spokenUSD,
  savingsBinding,
  type SavingsValues,
  type SavingsComputed,
} from './savings-form';

const project = (over: Partial<SavingsValues> = {}): SavingsValues => ({
  mode: 'project',
  startingAmount: '10000',
  annualRatePct: '5',
  years: '10',
  monthlyContribution: '300',
  goal: '',
  ...over,
});

const goal = (over: Partial<SavingsValues> = {}): SavingsValues => ({
  mode: 'goal',
  startingAmount: '0',
  annualRatePct: '0',
  years: '1',
  monthlyContribution: '',
  goal: '12000',
  ...over,
});

const errs = (r: ReturnType<typeof validateSavingsValues>) =>
  (r as { fieldErrors: Record<string, string> }).fieldErrors;

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('savings-form — validation', () => {
  it('accepts a valid Project and a valid Goal calculation', () => {
    expect(validateSavingsValues(project())).toEqual({ ok: true });
    expect(validateSavingsValues(goal())).toEqual({ ok: true });
  });

  it('starting balance: required, 0 valid, negative/non-finite invalid', () => {
    expect(errs(validateSavingsValues(project({ startingAmount: '' }))).startingAmount).toBe('Enter a starting balance.');
    expect(validateSavingsValues(project({ startingAmount: '0' }))).toEqual({ ok: true });
    expect(errs(validateSavingsValues(project({ startingAmount: '-5' }))).startingAmount).toBe(
      'Enter a starting balance of zero or more.',
    );
  });

  it('annual return: required, 0 valid, negative invalid, no maximum', () => {
    expect(errs(validateSavingsValues(project({ annualRatePct: '' }))).annualRatePct).toBe('Enter an annual return.');
    expect(validateSavingsValues(project({ annualRatePct: '0' }))).toEqual({ ok: true });
    expect(validateSavingsValues(project({ annualRatePct: '12.5' }))).toEqual({ ok: true });
    expect(errs(validateSavingsValues(project({ annualRatePct: '-1' }))).annualRatePct).toBe(
      'Enter an annual return of zero or more.',
    );
  });

  it('years: required whole number >= 1 (fractional / zero / negative rejected)', () => {
    expect(errs(validateSavingsValues(project({ years: '' }))).years).toBe('Enter a number of years.');
    expect(errs(validateSavingsValues(project({ years: '0' }))).years).toBe('Enter a whole number of years (1 or more).');
    expect(errs(validateSavingsValues(project({ years: '2.5' }))).years).toBe(
      'Enter a whole number of years (1 or more).',
    );
    expect(errs(validateSavingsValues(project({ years: '-3' }))).years).toBe('Enter a whole number of years (1 or more).');
    expect(validateSavingsValues(project({ years: '1' }))).toEqual({ ok: true });
  });

  it('Project requires the monthly deposit (0 valid) and IGNORES the goal field', () => {
    expect(errs(validateSavingsValues(project({ monthlyContribution: '' }))).monthlyContribution).toBe(
      'Enter a monthly deposit.',
    );
    expect(validateSavingsValues(project({ monthlyContribution: '0' }))).toEqual({ ok: true }); // 0 deposit valid
    expect(errs(validateSavingsValues(project({ monthlyContribution: '-50' }))).monthlyContribution).toBe(
      'Enter a monthly deposit of zero or more.',
    );
    expect(validateSavingsValues(project({ goal: 'abc' }))).toEqual({ ok: true }); // goal ignored in project
  });

  it('Goal requires a goal > 0 and IGNORES the monthly-deposit field', () => {
    expect(errs(validateSavingsValues(goal({ goal: '' }))).goal).toBe('Enter a savings goal.');
    expect(errs(validateSavingsValues(goal({ goal: '0' }))).goal).toBe('Enter a savings goal greater than zero.');
    expect(errs(validateSavingsValues(goal({ goal: '-100' }))).goal).toBe('Enter a savings goal greater than zero.');
    expect(validateSavingsValues(goal({ monthlyContribution: '-9' }))).toEqual({ ok: true }); // deposit ignored in goal
  });

  it('a zero start AND zero monthly deposit is a VALID project', () => {
    expect(validateSavingsValues(project({ startingAmount: '0', monthlyContribution: '0' }))).toEqual({ ok: true });
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('savings-form — compute', () => {
  it('Project → a projection with the enriched breakdown', () => {
    const r = computeSavings(project({ startingAmount: '10000', annualRatePct: '5', years: '10', monthlyContribution: '300' }));
    if (r.status !== 'projected') throw new Error('expected projected');
    expect(r.futureValue).toBeCloseTo(63054.78, 1);
    expect(r.totalContributions).toBe(46000);
    expect(r.totalInterest).toBeCloseTo(r.futureValue - 46000, 6);
  });

  it('an all-zero project is a valid $0 projection', () => {
    const r = computeSavings(project({ startingAmount: '0', monthlyContribution: '0', annualRatePct: '5', years: '10' }));
    expect(r).toMatchObject({ status: 'projected', futureValue: 0, totalContributions: 0, totalInterest: 0 });
  });

  it('Goal → the required monthly deposit', () => {
    const r = computeSavings(goal({ goal: '12000', startingAmount: '0', annualRatePct: '0', years: '1' }));
    if (r.status !== 'required-deposit') throw new Error('expected required-deposit');
    expect(r.monthlyDeposit).toBeCloseTo(1000, 6);
    expect(r.goalAlreadyReached).toBe(false);
  });

  it('Goal already reached → a valid $0 deposit flagged as already reached', () => {
    const r = computeSavings(goal({ goal: '1000', startingAmount: '5000', annualRatePct: '5', years: '5' }));
    if (r.status !== 'required-deposit') throw new Error('expected required-deposit');
    expect(r.monthlyDeposit).toBe(0);
    expect(r.goalAlreadyReached).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Guarded magnitude (default finite gate; no isUsableResult)          */
/* ------------------------------------------------------------------ */

describe('savings-form — resultValue (default finite gate)', () => {
  it('exposes the projected balance and the required deposit; 0 is a real finite value', () => {
    expect(savingsBinding.resultValue({ status: 'projected', mode: 'project', futureValue: 63054.78, totalContributions: 46000, totalInterest: 17054.78 })).toBeCloseTo(63054.78, 2);
    expect(savingsBinding.resultValue({ status: 'projected', mode: 'project', futureValue: 0, totalContributions: 0, totalInterest: 0 })).toBe(0);
    expect(savingsBinding.resultValue({ status: 'required-deposit', mode: 'goal', monthlyDeposit: 325, goalAlreadyReached: false })).toBe(325);
    expect(savingsBinding.resultValue({ status: 'required-deposit', mode: 'goal', monthlyDeposit: 0, goalAlreadyReached: true })).toBe(0);
  });

  it('does not implement isUsableResult (Savings has no non-finite outcome)', () => {
    expect(savingsBinding.isUsableResult).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Announcement                                                        */
/* ------------------------------------------------------------------ */

describe('savings-form — announcement (dominant only)', () => {
  it('Project announces the projected balance', () => {
    const r: SavingsComputed = { status: 'projected', mode: 'project', futureValue: 45320, totalContributions: 30000, totalInterest: 15320 };
    expect(describeSavingsResult(r)).toBe('Your projected savings balance is 45320 dollars.');
  });

  it('Goal announces the required monthly deposit', () => {
    const r: SavingsComputed = { status: 'required-deposit', mode: 'goal', monthlyDeposit: 325, goalAlreadyReached: false };
    expect(describeSavingsResult(r)).toBe('You need to deposit 325 dollars per month to reach your goal.');
  });

  it('Already reached announces the informational outcome', () => {
    const r: SavingsComputed = { status: 'required-deposit', mode: 'goal', monthlyDeposit: 0, goalAlreadyReached: true };
    expect(describeSavingsResult(r)).toBe(
      'No monthly deposit is required because your starting balance is projected to reach the goal within the selected period.',
    );
  });

  it('spokenUSD reads dollars and cents with correct singular/plural', () => {
    expect(spokenUSD(325.5)).toBe('325 dollars and 50 cents');
    expect(spokenUSD(45320)).toBe('45320 dollars');
    expect(spokenUSD(1)).toBe('1 dollar');
    expect(spokenUSD(0)).toBe('0 dollars');
  });
});
