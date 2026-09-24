import { describe, it, expect } from 'vitest';
import {
  validateRetirementValues,
  computeRetirement,
  completeResultValue,
  describeRetirementResult,
  interpretRetirement,
  percentOf,
  formatCompactUSD,
  durationLabel,
  spokenUSD,
  retirementBinding,
  MODE_FIELDS,
  RETIREMENT_MODES,
  RETIREMENT_EXAMPLE_VALUES,
  DEFAULTS,
  MSG,
  MAX_AGE,
  asMode,
  asUnit,
  type RetirementValues,
  type RetirementComputed,
} from './retirement-form';

/**
 * Retirement form-binding tests. The VALIDATION / PRESENTATION boundary only —
 * the four pure engines are separately frozen by retirement.test.ts, which pins
 * them against the published reference figures. Covers: mode-scoped validation
 * (a field another question owns can never block this one), the dual-unit
 * normalisation, the per-mode complete-result guard, and readValues / resetValues.
 */

const values = (over: Partial<RetirementValues> = {}): RetirementValues => ({
  ...RETIREMENT_EXAMPLE_VALUES,
  ...over,
});
const err = (r: ReturnType<typeof validateRetirementValues>, field: string): string | undefined =>
  (r as { fieldErrors?: Record<string, string> }).fieldErrors?.[field];
const ok = (r: ReturnType<typeof validateRetirementValues>) => r.ok === true;
const rejects = (r: RetirementComputed) => Number.isNaN(completeResultValue(r));

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe('retirement binding — contract', () => {
  it('does NOT define isUsableResult (the guard lives in resultValue)', () => {
    expect(retirementBinding.isUsableResult).toBeUndefined();
    expect(retirementBinding.resultValue).toBe(completeResultValue);
  });
  it('offers the four retirement questions', () => {
    expect([...RETIREMENT_MODES]).toEqual(['plan', 'save', 'withdraw', 'lasts']);
  });
  it('an unknown mode or unit falls back rather than failing', () => {
    expect(asMode('nonsense')).toBe('plan');
    expect(asMode('lasts')).toBe('lasts');
    expect(asUnit('nonsense')).toBe('percent');
    expect(asUnit('amount')).toBe('amount');
  });
  it('the worked example is a complete, valid set of values', () => {
    expect(ok(validateRetirementValues(RETIREMENT_EXAMPLE_VALUES))).toBe(true);
    expect(Number.isFinite(completeResultValue(computeRetirement(RETIREMENT_EXAMPLE_VALUES)))).toBe(true);
  });
  it('every mode declares the fields it reads, and each is a real value key', () => {
    for (const mode of RETIREMENT_MODES) {
      expect(MODE_FIELDS[mode].length).toBeGreaterThan(0);
      for (const field of MODE_FIELDS[mode]) {
        expect(Object.keys(RETIREMENT_EXAMPLE_VALUES)).toContain(field);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Validation is scoped to the selected mode                           */
/* ------------------------------------------------------------------ */

describe('retirement binding — validation is scoped to the mode', () => {
  it('a field another question owns can never block this one', () => {
    // "How long can your money last?" needs a pot, a withdrawal and a return —
    // it must not care that the retirement-planning fields are blank or broken.
    const lasts = values({
      mode: 'lasts', potAmount: '600000', monthlyWithdrawal: '5000',
      currentAge: '', retirementAge: '', lifeExpectancy: '', currentIncome: 'nonsense',
    });
    expect(ok(validateRetirementValues(lasts))).toBe(true);
  });
  it('...and the same field IS required once a question reads it', () => {
    expect(err(validateRetirementValues(values({ mode: 'plan', currentAge: '' })), 'currentAge')).toBe(MSG.ageRequired);
    expect(err(validateRetirementValues(values({ mode: 'lasts', currentAge: '' })), 'currentAge')).toBeUndefined();
  });

  it('ages are required whole numbers within range, and must run forwards', () => {
    for (const bad of ['', '-1', '35.5', String(MAX_AGE + 1), 'x']) {
      expect(ok(validateRetirementValues(values({ currentAge: bad })))).toBe(false);
    }
    expect(err(validateRetirementValues(values({ currentAge: '67', retirementAge: '67' })), 'retirementAge')).toBe(MSG.retireOrder);
    expect(err(validateRetirementValues(values({ currentAge: '70', retirementAge: '67' })), 'retirementAge')).toBe(MSG.retireOrder);
    expect(err(validateRetirementValues(values({ retirementAge: '67', lifeExpectancy: '67' })), 'lifeExpectancy')).toBe(MSG.lifeOrder);
    expect(err(validateRetirementValues(values({ retirementAge: '67', lifeExpectancy: '60' })), 'lifeExpectancy')).toBe(MSG.lifeOrder);
  });

  it('income and return are required and non-negative; 0% return is valid', () => {
    expect(err(validateRetirementValues(values({ currentIncome: '' })), 'currentIncome')).toBe(MSG.incomeRequired);
    expect(err(validateRetirementValues(values({ currentIncome: '-1' })), 'currentIncome')).toBe(MSG.incomeInvalid);
    expect(err(validateRetirementValues(values({ annualReturnPct: '' })), 'annualReturnPct')).toBe(MSG.returnRequired);
    expect(err(validateRetirementValues(values({ annualReturnPct: '-1' })), 'annualReturnPct')).toBe(MSG.returnInvalid);
    expect(ok(validateRetirementValues(values({ annualReturnPct: '0' })))).toBe(true);
  });

  it('the optional fields accept blank and zero, and reject negatives', () => {
    for (const field of ['otherMonthlyIncome', 'currentSavings', 'inflationPct', 'incomeIncreasePct', 'futureSavingsPct'] as const) {
      expect(ok(validateRetirementValues(values({ [field]: '' })))).toBe(true);
      expect(ok(validateRetirementValues(values({ [field]: '0' })))).toBe(true);
      expect(ok(validateRetirementValues(values({ [field]: '-1' })))).toBe(false);
    }
  });

  it('"how to save" requires a positive target', () => {
    const base = values({ mode: 'save', amountNeeded: '600000' });
    expect(ok(validateRetirementValues(base))).toBe(true);
    expect(err(validateRetirementValues({ ...base, amountNeeded: '' }), 'amountNeeded')).toBe(MSG.amountNeededRequired);
    expect(err(validateRetirementValues({ ...base, amountNeeded: '0' }), 'amountNeeded')).toBe(MSG.amountNeededInvalid);
  });

  it('"how long does it last" requires a positive pot and a positive withdrawal', () => {
    const base = values({ mode: 'lasts', potAmount: '600000', monthlyWithdrawal: '5000' });
    expect(ok(validateRetirementValues(base))).toBe(true);
    expect(err(validateRetirementValues({ ...base, potAmount: '0' }), 'potAmount')).toBe(MSG.potInvalid);
    expect(err(validateRetirementValues({ ...base, monthlyWithdrawal: '' }), 'monthlyWithdrawal')).toBe(MSG.withdrawalRequired);
  });

  it('reports every offending field at once', () => {
    const r = validateRetirementValues(values({ currentAge: '', currentIncome: '', annualReturnPct: '' }));
    expect(err(r, 'currentAge')).toBeDefined();
    expect(err(r, 'currentIncome')).toBeDefined();
    expect(err(r, 'annualReturnPct')).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/* Dual-unit normalisation                                             */
/* ------------------------------------------------------------------ */

describe('retirement binding — percent or dollars reach the same calculation', () => {
  it('percentOf converts a dollar entry against its base and passes a percent through', () => {
    expect(percentOf(70000, 75, 'percent')).toBe(75);
    expect(percentOf(70000, 7000, 'amount')).toBeCloseTo(10, 9);
    expect(percentOf(0, 7000, 'amount')).toBe(0); // no base to divide by
  });
  it('10% of income and the equivalent dollar amount produce the identical plan', () => {
    const byPct = computeRetirement(values({ futureSavingsPct: '10', futureSavingsUnit: 'percent' }));
    const byAmt = computeRetirement(values({ futureSavingsPct: '7000', futureSavingsUnit: 'amount' }));
    if (byPct.mode !== 'plan' || byAmt.mode !== 'plan') throw new Error('expected plan mode');
    expect(byAmt.plan.amountProjected).toBeCloseTo(byPct.plan.amountProjected, 6);
  });
  it('a dollar income target is taken of the income at RETIREMENT, which is what it buys', () => {
    const plan = computeRetirement(values());
    if (plan.mode !== 'plan') throw new Error('expected plan mode');
    const atRetirement = plan.plan.incomeAtRetirement;
    const byAmt = computeRetirement(values({ incomeNeededPct: String(atRetirement * 0.75), incomeNeededUnit: 'amount' }));
    if (byAmt.mode !== 'plan') throw new Error('expected plan mode');
    expect(byAmt.plan.amountNeeded).toBeCloseTo(plan.plan.amountNeeded, 4);
  });
});

/* ------------------------------------------------------------------ */
/* Computation reaches the right engine                                */
/* ------------------------------------------------------------------ */

describe('retirement binding — each mode reaches its own engine', () => {
  it('carries the mode on the result, so the renderer never re-reads the form', () => {
    for (const mode of RETIREMENT_MODES) {
      expect(computeRetirement(values({ mode, amountNeeded: '600000', potAmount: '600000', monthlyWithdrawal: '5000' })).mode).toBe(mode);
    }
  });
  it('the plan reproduces the reference case the example is built from', () => {
    const r = computeRetirement(RETIREMENT_EXAMPLE_VALUES);
    if (r.mode !== 'plan') throw new Error('expected plan mode');
    expect(formatCompactUSD(r.plan.amountNeeded)).toBe('$1.88M');
    expect(formatCompactUSD(r.plan.amountProjected)).toBe('$1.10M');
    expect(Math.round(r.plan.readiness * 100)).toBe(58);
    expect(Math.round(r.plan.incomeFromNeeded)).toBe(11266);
    expect(Math.round(r.plan.incomeFromNeededToday)).toBe(4375);
  });
  it('other retirement income reduces what the pot has to fund', () => {
    const without = computeRetirement(values({ otherMonthlyIncome: '' }));
    const with2k = computeRetirement(values({ otherMonthlyIncome: '2000' }));
    if (without.mode !== 'plan' || with2k.mode !== 'plan') throw new Error('expected plan mode');
    expect(with2k.plan.amountNeeded).toBeLessThan(without.plan.amountNeeded);
    expect(with2k.plan.amountProjected).toBe(without.plan.amountProjected); // the plan itself is unchanged
  });
  it('a pension larger than the target leaves nothing for the pot to fund', () => {
    const r = computeRetirement(values({ otherMonthlyIncome: '999999' }));
    if (r.mode !== 'plan') throw new Error('expected plan mode');
    expect(r.plan.amountNeeded).toBe(0);
    expect(r.plan.onTrack).toBe(true);
    expect(Number.isFinite(completeResultValue(r))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard, per mode                                     */
/* ------------------------------------------------------------------ */

describe('retirement binding — the guard, per mode', () => {
  const plan = computeRetirement(values()) as Extract<RetirementComputed, { mode: 'plan' }>;
  const save = computeRetirement(values({ mode: 'save', amountNeeded: '600000' })) as Extract<RetirementComputed, { mode: 'save' }>;
  const withdraw = computeRetirement(values({ mode: 'withdraw', monthlyContribution: '500' })) as Extract<RetirementComputed, { mode: 'withdraw' }>;
  const lasts = computeRetirement(values({ mode: 'lasts', potAmount: '600000', monthlyWithdrawal: '5000' })) as Extract<RetirementComputed, { mode: 'lasts' }>;

  it('accepts a well-formed result in every mode', () => {
    for (const r of [plan, save, withdraw, lasts]) expect(Number.isFinite(completeResultValue(r))).toBe(true);
  });

  it('rejects a non-finite or negative figure anywhere in the plan', () => {
    expect(rejects({ ...plan, plan: { ...plan.plan, amountNeeded: Number.NaN } })).toBe(true);
    expect(rejects({ ...plan, plan: { ...plan.plan, amountProjected: -1 } })).toBe(true);
    expect(rejects({ ...plan, plan: { ...plan.plan, saveMonthly: Number.POSITIVE_INFINITY } })).toBe(true);
  });
  it('rejects an income that did not come from the pot it claims to be drawn from', () => {
    expect(rejects({ ...plan, plan: { ...plan.plan, incomeFromNeeded: plan.plan.incomeFromNeeded * 1.5 } })).toBe(true);
    expect(rejects({ ...plan, plan: { ...plan.plan, incomeFromProjected: plan.plan.incomeFromProjected + 500 } })).toBe(true);
  });
  it('rejects a mis-stated shortfall or on-track claim', () => {
    expect(rejects({ ...plan, plan: { ...plan.plan, shortfall: plan.plan.shortfall + 1000 } })).toBe(true);
    expect(rejects({ ...plan, plan: { ...plan.plan, onTrack: !plan.plan.onTrack } })).toBe(true);
  });
  it('rejects a projection series that is unordered, negative or absurdly long', () => {
    expect(rejects({ ...plan, plan: { ...plan.plan, projectedSeries: [...plan.plan.projectedSeries].reverse() } })).toBe(true);
    expect(rejects({ ...plan, plan: { ...plan.plan, neededSeries: plan.plan.neededSeries.map((p, i) => (i === 3 ? { ...p, balance: -1 } : p)) } })).toBe(true);
  });

  it('rejects a savings plan whose "already there" claim contradicts its gap', () => {
    expect(rejects({ ...save, save: { ...save.save, alreadyThere: !save.save.alreadyThere } })).toBe(true);
    expect(rejects({ ...save, save: { ...save.save, savingsAlone: Number.NaN } })).toBe(true);
  });

  it('rejects a withdrawal that does not reconcile with its pot or its yearly figure', () => {
    expect(rejects({ ...withdraw, withdraw: { ...withdraw.withdraw, monthlyWithdrawal: withdraw.withdraw.monthlyWithdrawal * 2 } })).toBe(true);
    expect(rejects({ ...withdraw, withdraw: { ...withdraw.withdraw, annualWithdrawal: withdraw.withdraw.annualWithdrawal + 100 } })).toBe(true);
  });

  it('rejects a duration whose parts do not add up', () => {
    expect(rejects({ ...lasts, lasts: { ...lasts.lasts, remainingMonths: 12 } })).toBe(true);
    expect(rejects({ ...lasts, lasts: { ...lasts.lasts, years: lasts.lasts.years + 1 } })).toBe(true);
    expect(rejects({ ...lasts, lasts: { ...lasts.lasts, months: 12.5 } })).toBe(true);
  });
  it('rejects a "never runs out" claim the projection does not support', () => {
    // The strictest claim the calculator makes: it may only be made when the
    // projection ran the full term AND the balance was still there at the end.
    expect(rejects({ ...lasts, lasts: { ...lasts.lasts, neverRunsOut: true } })).toBe(true);
    expect(rejects({ ...lasts, lasts: { ...lasts.lasts, neverRunsOut: true, reachedLimit: true, endingBalance: 0 } })).toBe(true);
  });
  it('rejects a mis-stated limit flag, or a finished projection with money left', () => {
    expect(rejects({ ...lasts, lasts: { ...lasts.lasts, reachedLimit: true } })).toBe(true);
    expect(rejects({ ...lasts, lasts: { ...lasts.lasts, endingBalance: 5000 } })).toBe(true);
  });
  it('accepts a pot that never runs out — an informational result, not an error', () => {
    const forever = computeRetirement(values({ mode: 'lasts', potAmount: '600000', monthlyWithdrawal: '2000' }));
    if (forever.mode !== 'lasts') throw new Error('expected lasts mode');
    expect(forever.lasts.neverRunsOut).toBe(true);
    expect(forever.lasts.reachedLimit).toBe(true);
    expect(Number.isFinite(completeResultValue(forever))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('retirement binding — presentation', () => {
  it('formatCompactUSD uses the reference shorthand', () => {
    expect(formatCompactUSD(1878183)).toBe('$1.88M');
    expect(formatCompactUSD(1098539)).toBe('$1.10M');
    expect(formatCompactUSD(600000)).toBe('$600K');
    expect(formatCompactUSD(850)).toBe('$850');
    expect(formatCompactUSD(Number.NaN)).toBe('—');
  });
  it('durationLabel reads whole years and months', () => {
    expect(durationLabel(183)).toBe('15 years 3 months');
    expect(durationLabel(12)).toBe('1 year');
    expect(durationLabel(1)).toBe('1 month');
    expect(durationLabel(0)).toBe('less than a month');
  });
  it('spokenUSD reads dollars and cents', () => {
    expect(spokenUSD(1580.17)).toBe('1580 dollars and 17 cents');
    expect(spokenUSD(1000)).toBe('1000 dollars');
  });
  it('every mode announces and interprets without leaking a broken number', () => {
    const cases: RetirementComputed[] = [
      computeRetirement(values()),
      computeRetirement(values({ mode: 'save', amountNeeded: '600000' })),
      computeRetirement(values({ mode: 'withdraw', monthlyContribution: '500' })),
      computeRetirement(values({ mode: 'lasts', potAmount: '600000', monthlyWithdrawal: '5000' })),
      computeRetirement(values({ mode: 'lasts', potAmount: '600000', monthlyWithdrawal: '2000' })),
    ];
    for (const c of cases) {
      for (const text of [describeRetirementResult(c), interpretRetirement(c)]) {
        expect(text).not.toMatch(/NaN|Infinity|undefined/);
        expect(text.length).toBeGreaterThan(10);
      }
    }
  });
  it('a plan that is on track says so rather than asking for more', () => {
    const onTrack = computeRetirement(values({ currentSavings: '3000000' }));
    if (onTrack.mode !== 'plan') throw new Error('expected plan mode');
    expect(onTrack.plan.onTrack).toBe(true);
    expect(describeRetirementResult(onTrack)).toContain('reaches');
  });
});

/* ------------------------------------------------------------------ */
/* readValues / resetValues (mock root)                                */
/* ------------------------------------------------------------------ */

describe('retirement binding — readValues / resetValues', () => {
  const mockRoot = () => {
    const inputs: Record<string, { value: string }> = {
      currentAge: { value: '35' }, retirementAge: { value: '67' }, lifeExpectancy: { value: '85' },
      currentSavings: { value: '30000' }, annualReturnPct: { value: '6' }, inflationPct: { value: '3' },
      currentIncome: { value: '70000' }, incomeIncreasePct: { value: '3' }, incomeNeededPct: { value: '75' },
      incomeNeededUnit: { value: 'amount' }, otherMonthlyIncome: { value: '100' },
      futureSavingsPct: { value: '10' }, futureSavingsUnit: { value: 'percent' },
      amountNeeded: { value: '600000' }, annualContribution: { value: '1000' },
      monthlyContribution: { value: '500' }, potAmount: { value: '600000' },
      monthlyWithdrawal: { value: '5000' },
    };
    const modes = RETIREMENT_MODES.map((m) => ({ value: m, checked: m === 'withdraw' }));
    const nameOf = (sel: string) => /\[name="([^"]+)"\]/.exec(sel)?.[1] ?? null;
    return {
      querySelector: (sel: string) => {
        const name = nameOf(sel);
        if (name === 'mode') return sel.includes(':checked') ? modes.find((m) => m.checked) ?? null : modes[0];
        return name ? inputs[name] ?? null : null;
      },
      querySelectorAll: (sel: string) => (nameOf(sel) === 'mode' ? modes : []),
      __inputs: inputs,
      __modes: modes,
    } as unknown as HTMLElement & {
      __inputs: Record<string, { value: string }>;
      __modes: { value: string; checked: boolean }[];
    };
  };

  it('reads every field, taking the CHECKED mode rather than the first radio', () => {
    const v = retirementBinding.readValues(mockRoot());
    expect(v.mode).toBe('withdraw');
    expect(v.currentAge).toBe('35');
    expect(v.monthlyWithdrawal).toBe('5000');
    expect(v.incomeNeededUnit).toBe('amount');
    expect(Object.keys(v).sort()).toEqual(Object.keys(RETIREMENT_EXAMPLE_VALUES).sort());
  });

  it('reset clears the personal fields but restores the planning assumptions', () => {
    const root = mockRoot();
    retirementBinding.resetValues(root, 'personal');
    const { __inputs: inputs, __modes: modes } = root;
    for (const name of ['currentAge', 'retirementAge', 'lifeExpectancy', 'currentSavings', 'currentIncome', 'otherMonthlyIncome', 'amountNeeded', 'annualContribution', 'monthlyContribution', 'potAmount', 'monthlyWithdrawal']) {
      expect(inputs[name].value).toBe('');
    }
    // An empty expected return is not a neutral state, it is an unanswerable one.
    for (const [name, value] of Object.entries(DEFAULTS)) expect(inputs[name].value).toBe(value);
    expect(inputs.incomeNeededUnit.value).toBe('percent');
    expect(inputs.futureSavingsUnit.value).toBe('percent');
    expect(modes.filter((m) => m.checked).map((m) => m.value)).toEqual(['plan']);
  });
});
