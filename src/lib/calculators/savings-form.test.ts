import { describe, it, expect } from 'vitest';
import {
  SAVINGS_EXAMPLE_VALUES,
  computeSavings,
  describeSavingsResult,
  savingsBinding,
  spokenUSD,
  validateSavingsValues,
  type SavingsComputed,
  type SavingsValues,
} from './savings-form';
import { projectSavingsPlan, type SavingsPlanResult } from './savings';

/**
 * Savings binding — validation, the mode split and the complete-result guard.
 *
 * The guard is the part worth the most tests: it is the only thing standing between
 * a reader and a projection whose four summary lines do not add up, so every way a
 * plan can be internally inconsistent is asserted to fail it.
 */

const FULL: SavingsValues = {
  mode: 'project',
  initialDeposit: '20000',
  annualContribution: '5000',
  annualIncreasePct: '3',
  monthlyContribution: '0',
  monthlyIncreasePct: '0',
  annualRatePct: '3',
  compound: 'annually',
  years: '10',
  taxRatePct: '0',
  goal: '',
};

const project = (over: Partial<SavingsValues> = {}): SavingsValues => ({ ...FULL, ...over });
const goalMode = (over: Partial<SavingsValues> = {}): SavingsValues => ({
  ...FULL,
  mode: 'goal',
  goal: '100000',
  ...over,
});

const errs = (r: ReturnType<typeof validateSavingsValues>): Record<string, string> =>
  r.ok ? {} : (r.fieldErrors ?? {});

describe('validation — the three required fields', () => {
  it('accepts the full reference entry', () => {
    expect(validateSavingsValues(FULL)).toEqual({ ok: true });
  });

  it('requires an initial deposit', () => {
    expect(errs(validateSavingsValues(project({ initialDeposit: '' }))).initialDeposit).toBe(
      'Enter an initial deposit.',
    );
    expect(errs(validateSavingsValues(project({ initialDeposit: 'abc' }))).initialDeposit).toBeTruthy();
  });

  it('requires an interest rate, and refuses a negative one', () => {
    expect(errs(validateSavingsValues(project({ annualRatePct: '' }))).annualRatePct).toBe(
      'Enter an interest rate.',
    );
    expect(errs(validateSavingsValues(project({ annualRatePct: '-1' }))).annualRatePct).toBeTruthy();
    expect(validateSavingsValues(project({ annualRatePct: '0' }))).toEqual({ ok: true });
  });

  it('requires a whole number of years from 1 to 100', () => {
    expect(errs(validateSavingsValues(project({ years: '' }))).years).toBe(
      'Enter the number of years to save.',
    );
    for (const bad of ['0', '-4', '10.5', '101', 'ten']) {
      expect(errs(validateSavingsValues(project({ years: bad }))).years).toBeTruthy();
    }
    for (const good of ['1', '10', '100']) {
      expect(validateSavingsValues(project({ years: good }))).toEqual({ ok: true });
    }
  });

  it('rejects a compound frequency that is not one of the nine', () => {
    expect(errs(validateSavingsValues(project({ compound: 'fortnightly' }))).compound).toBeTruthy();
    expect(errs(validateSavingsValues(project({ compound: '' }))).compound).toBeTruthy();
    expect(validateSavingsValues(project({ compound: 'continuously' }))).toEqual({ ok: true });
  });
});

describe('validation — blank means none, but nonsense is still an error', () => {
  it('accepts every optional field left blank', () => {
    expect(
      validateSavingsValues(
        project({
          annualContribution: '',
          annualIncreasePct: '',
          monthlyContribution: '',
          monthlyIncreasePct: '',
          taxRatePct: '',
        }),
      ),
    ).toEqual({ ok: true });
  });

  it('treats a blank optional field as zero rather than dropping the calculation', () => {
    const blank = computeSavings(
      project({ annualContribution: '', monthlyContribution: '', taxRatePct: '' }),
    );
    const zeroed = computeSavings(
      project({ annualContribution: '0', monthlyContribution: '0', taxRatePct: '0' }),
    );
    expect(blank.status).toBe('projected');
    if (blank.status !== 'projected' || zeroed.status !== 'projected') throw new Error('unreachable');
    expect(blank.plan.endBalance).toBeCloseTo(zeroed.plan.endBalance, 8);
  });

  it('still rejects an unparseable optional field — blank is not the same as invalid', () => {
    expect(errs(validateSavingsValues(project({ annualContribution: 'abc' }))).annualContribution).toBeTruthy();
    expect(errs(validateSavingsValues(project({ monthlyContribution: 'x' }))).monthlyContribution).toBeTruthy();
    expect(errs(validateSavingsValues(project({ taxRatePct: 'lots' }))).taxRatePct).toBeTruthy();
  });

  it('bounds the tax rate to 0–100', () => {
    expect(errs(validateSavingsValues(project({ taxRatePct: '-1' }))).taxRatePct).toBeTruthy();
    expect(errs(validateSavingsValues(project({ taxRatePct: '101' }))).taxRatePct).toBeTruthy();
    expect(validateSavingsValues(project({ taxRatePct: '100' }))).toEqual({ ok: true });
  });

  it('refuses a negative increase, which the label does not offer', () => {
    expect(errs(validateSavingsValues(project({ annualIncreasePct: '-2' }))).annualIncreasePct).toBeTruthy();
    expect(errs(validateSavingsValues(project({ monthlyIncreasePct: '-2' }))).monthlyIncreasePct).toBeTruthy();
  });
});

describe('validation — negatives are real inputs', () => {
  it('accepts a negative initial deposit and negative contributions', () => {
    expect(validateSavingsValues(project({ initialDeposit: '-5000' }))).toEqual({ ok: true });
    expect(validateSavingsValues(project({ annualContribution: '-1200' }))).toEqual({ ok: true });
    expect(validateSavingsValues(project({ monthlyContribution: '-100' }))).toEqual({ ok: true });
  });
});

describe('validation — only the active mode is required', () => {
  it('project mode ignores a blank goal', () => {
    expect(validateSavingsValues(project({ goal: '' }))).toEqual({ ok: true });
  });

  it('goal mode requires a positive goal and ignores the monthly contribution', () => {
    expect(errs(validateSavingsValues(goalMode({ goal: '' }))).goal).toBe('Enter a savings goal.');
    expect(errs(validateSavingsValues(goalMode({ goal: '0' }))).goal).toBeTruthy();
    expect(errs(validateSavingsValues(goalMode({ goal: '-100' }))).goal).toBeTruthy();
    // The monthly contribution is hidden and disabled in this mode — junk in it is not an error.
    expect(validateSavingsValues(goalMode({ monthlyContribution: 'abc' }))).toEqual({ ok: true });
  });
});

describe('computeSavings — project mode', () => {
  it('reproduces the reference case', () => {
    const r = computeSavings(FULL);
    expect(r.status).toBe('projected');
    if (r.status !== 'projected') throw new Error('unreachable');
    expect(r.plan.endBalance).toBeCloseTo(92116.99, 2);
    expect(r.plan.totalContributions).toBeCloseTo(57319.4, 2);
    expect(r.plan.totalInterest).toBeCloseTo(14797.59, 2);
    expect(r.plan.annual).toHaveLength(10);
    expect(r.plan.months).toHaveLength(120);
  });

  it('passes the compound frequency through', () => {
    const annually = computeSavings(project({ compound: 'annually' }));
    const daily = computeSavings(project({ compound: 'daily' }));
    if (annually.status !== 'projected' || daily.status !== 'projected') throw new Error('unreachable');
    expect(daily.plan.endBalance).toBeGreaterThan(annually.plan.endBalance);
  });
});

describe('computeSavings — goal mode', () => {
  it('solves for a monthly contribution that reaches the goal', () => {
    const r = computeSavings(goalMode({ goal: '100000' }));
    expect(r.status).toBe('required-deposit');
    if (r.status !== 'required-deposit') throw new Error('unreachable');
    expect(r.monthlyDeposit).toBeGreaterThan(0);
    expect(r.plan).not.toBeNull();
    expect((r.plan as SavingsPlanResult).endBalance).toBeCloseTo(100000, 4);
  });

  it('reports zero when the plan already reaches the goal', () => {
    const r = computeSavings(goalMode({ goal: '1000' }));
    if (r.status !== 'required-deposit') throw new Error('unreachable');
    expect(r.monthlyDeposit).toBe(0);
    expect(r.goalAlreadyReached).toBe(true);
  });

  it('ignores the hidden monthly-increase field so the answer is a flat figure', () => {
    const flat = computeSavings(goalMode({ monthlyIncreasePct: '0' }));
    const rising = computeSavings(goalMode({ monthlyIncreasePct: '25' }));
    if (flat.status !== 'required-deposit' || rising.status !== 'required-deposit')
      throw new Error('unreachable');
    expect(rising.monthlyDeposit).toBe(flat.monthlyDeposit);
    // ...and the plan it reports uses that same flat contribution every month.
    const months = (rising.plan as SavingsPlanResult).months;
    expect(months[0].deposit - 20000).toBeCloseTo(months[60].deposit, 6);
  });

  it('carries the rest of the plan into the solve', () => {
    const plain = computeSavings(goalMode());
    const taxed = computeSavings(goalMode({ taxRatePct: '30' }));
    if (plain.status !== 'required-deposit' || taxed.status !== 'required-deposit')
      throw new Error('unreachable');
    expect(taxed.monthlyDeposit as number).toBeGreaterThan(plain.monthlyDeposit as number);
  });
});

describe('the complete-result guard', () => {
  const good = computeSavings(FULL) as Extract<SavingsComputed, { status: 'projected' }>;
  const value = (r: SavingsComputed) => savingsBinding.resultValue(r);
  /** A deep-enough copy that a mutated row does not corrupt the shared fixture. */
  const clone = (p: SavingsPlanResult): SavingsPlanResult => ({
    ...p,
    annual: p.annual.map((y) => ({ ...y })),
    months: p.months.map((m) => ({ ...m })),
  });
  const broken = (mutate: (p: SavingsPlanResult) => void): SavingsComputed => {
    const plan = clone(good.plan);
    mutate(plan);
    return { status: 'projected', mode: 'project', plan };
  };

  it('accepts a plan that reconciles', () => {
    expect(value(good)).toBeCloseTo(92116.99, 2);
  });

  it('rejects a summary that does not add up', () => {
    expect(value(broken((p) => (p.totalInterest += 1)))).toBeNaN();
    expect(value(broken((p) => (p.totalContributions -= 500)))).toBeNaN();
    expect(value(broken((p) => (p.endBalance *= 2)))).toBeNaN();
  });

  it('rejects a non-finite figure', () => {
    expect(value(broken((p) => (p.endBalance = Number.NaN)))).toBeNaN();
    expect(value(broken((p) => (p.totalInterest = Number.POSITIVE_INFINITY)))).toBeNaN();
  });

  it('rejects yearly rows that disagree with the totals', () => {
    expect(value(broken((p) => (p.annual[3].interest += 100)))).toBeNaN();
    expect(value(broken((p) => (p.annual[0].deposit -= 1000)))).toBeNaN();
  });

  it('rejects a yearly balance that is not the balance of the month closing it', () => {
    expect(value(broken((p) => (p.annual[5].balance += 250)))).toBeNaN();
  });

  it('rejects a final yearly balance that is not the end balance', () => {
    expect(
      value(
        broken((p) => {
          // Shift the last row and the month it closes together, so only the
          // end-balance identity is left broken.
          p.annual[9].balance += 10;
          p.months[119].balance += 10;
        }),
      ),
    ).toBeNaN();
  });

  it('rejects a truncated schedule', () => {
    expect(value(broken((p) => p.annual.pop()))).toBeNaN();
    expect(value(broken((p) => p.months.splice(0, 12)))).toBeNaN();
  });

  it('rejects an empty projection', () => {
    expect(
      value({ status: 'projected', mode: 'project', plan: projectSavingsPlan({
        initialDeposit: 0, annualContribution: 0, annualIncreasePct: 0, monthlyContribution: 0,
        monthlyIncreasePct: 0, annualRatePct: 0, compound: 'annually', years: 0, taxRatePct: 0,
      }) }),
    ).toBeNaN();
  });

  it('rejects negative tax, which no plan can legitimately produce', () => {
    expect(value(broken((p) => (p.totalTax = -1)))).toBeNaN();
  });

  it('accepts a valid all-zero projection', () => {
    const zero = computeSavings(
      project({ initialDeposit: '0', annualContribution: '0', monthlyContribution: '0', annualRatePct: '0' }),
    );
    expect(value(zero)).toBe(0);
  });

  it('accepts a negative end balance — a drawn-down account is a real answer', () => {
    const drawn = computeSavings(
      project({ initialDeposit: '1000', annualContribution: '0', monthlyContribution: '-500', annualRatePct: '0', years: '1' }),
    );
    expect(value(drawn)).toBeCloseTo(-5000, 6);
  });

  describe('goal mode', () => {
    const solved = computeSavings(goalMode()) as Extract<
      SavingsComputed,
      { status: 'required-deposit' }
    >;

    it('accepts a solved deposit', () => {
      expect(value(solved)).toBeCloseTo(solved.monthlyDeposit as number, 6);
    });

    it('rejects an unreachable goal', () => {
      expect(value({ ...solved, monthlyDeposit: null, plan: null })).toBeNaN();
    });

    it('rejects a deposit that does not actually reach the goal', () => {
      expect(value({ ...solved, goal: solved.goal * 3 })).toBeNaN();
    });

    it('rejects a negative deposit', () => {
      expect(value({ ...solved, monthlyDeposit: -5 })).toBeNaN();
    });

    it('rejects an already-reached flag that disagrees with the deposit', () => {
      expect(value({ ...solved, goalAlreadyReached: true })).toBeNaN();
      const reached = computeSavings(goalMode({ goal: '1000' })) as Extract<
        SavingsComputed,
        { status: 'required-deposit' }
      >;
      expect(value({ ...reached, goalAlreadyReached: false })).toBeNaN();
    });
  });
});

describe('announcements', () => {
  it('announces the end balance in project mode', () => {
    expect(describeSavingsResult(computeSavings(FULL))).toBe(
      'Your end balance is 92116 dollars and 99 cents.',
    );
  });

  it('announces the required contribution in goal mode', () => {
    const said = describeSavingsResult(computeSavings(goalMode({ goal: '100000' })));
    expect(said).toMatch(/^You need to contribute .* a month to reach your goal\.$/);
  });

  it('announces an already-reached goal without a number', () => {
    expect(describeSavingsResult(computeSavings(goalMode({ goal: '1000' })))).toBe(
      'No monthly contribution is required — your plan already reaches the goal.',
    );
  });

  it('speaks dollars and cents, including negatives', () => {
    expect(spokenUSD(0)).toBe('0 dollars');
    expect(spokenUSD(1)).toBe('1 dollar');
    expect(spokenUSD(325.5)).toBe('325 dollars and 50 cents');
    expect(spokenUSD(-1200)).toBe('minus 1200 dollars');
  });
});

describe('the worked example', () => {
  it('validates, so the example a visitor sees is a real calculation', () => {
    expect(validateSavingsValues(SAVINGS_EXAMPLE_VALUES)).toEqual({ ok: true });
  });

  it('is the published reference case, and passes the same guard as any other result', () => {
    const r = computeSavings(SAVINGS_EXAMPLE_VALUES);
    expect(savingsBinding.resultValue(r)).toBeCloseTo(92116.99, 2);
  });
});
