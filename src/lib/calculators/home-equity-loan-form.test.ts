import { describe, it, expect } from 'vitest';
import {
  HOME_EQUITY_EXAMPLE_VALUES,
  MAX_CLOSING_PCT,
  MAX_TERM_YEARS,
  MSG,
  closingCostsInDollars,
  completeHomeEquityValue,
  computeHomeEquity,
  describeHomeEquity,
  homeEquityBinding,
  presentHomeEquity,
  spokenUSD,
  validateHomeEquity,
  type HomeEquityComputed,
  type HomeEquityFormValues,
} from './home-equity-loan-form';

/**
 * The home equity loan binding, pinned to the published reference case: $150,000 at
 * 8% over 15 years is $1,433.48 a month, $258,026.06 across 180 payments, $108,026.06
 * of it interest — a 58% / 42% split.
 *
 * Closing costs are the part with no formula of their own, so they carry the most
 * tests: what they do to the cash, what they do to the real rate, and — the thing a
 * borrower would be misled by — that both ways of paying them cost exactly the same.
 */

const REF: HomeEquityFormValues = HOME_EQUITY_EXAMPLE_VALUES;
const at = (over: Partial<HomeEquityFormValues> = {}): HomeEquityFormValues => ({ ...REF, ...over });
const errs = (v: HomeEquityFormValues): Record<string, string> => {
  const r = validateHomeEquity(v);
  return r.ok ? {} : (r.fieldErrors ?? {});
};
const money = (n: number) => Math.round(n * 100) / 100;

/** The reference case with its closing-costs disclosure opened. */
const WITH_COSTS = at({ includeClosingCosts: true, closingAmount: '7500' });

describe('validation — the three required fields', () => {
  it('accepts the reference entry', () => {
    expect(validateHomeEquity(REF)).toEqual({ ok: true });
  });

  it('requires a loan amount greater than zero', () => {
    expect(errs(at({ loanAmount: '' })).loanAmount).toBe(MSG.loanRequired);
    for (const bad of ['0', '-1000', 'abc']) {
      expect(errs(at({ loanAmount: bad })).loanAmount).toBe(MSG.loanPositive);
    }
  });

  it('requires a rate, allows 0%, and rejects an impossible one', () => {
    expect(errs(at({ annualRatePct: '' })).annualRatePct).toBe(MSG.rateRequired);
    expect(errs(at({ annualRatePct: '-1' })).annualRatePct).toBe(MSG.rateNonNeg);
    expect(errs(at({ annualRatePct: '101' })).annualRatePct).toBe(MSG.rateMax);
    expect(validateHomeEquity(at({ annualRatePct: '0' }))).toEqual({ ok: true });
  });

  it(`requires a whole term from 1 to ${MAX_TERM_YEARS} years`, () => {
    for (const bad of ['', '0', '31', '7.5', '-5']) {
      expect(errs(at({ termYears: bad })).termYears).toBe(MSG.term);
    }
    expect(validateHomeEquity(at({ termYears: '30' }))).toEqual({ ok: true });
  });
});

describe('validation — closing costs, only while the disclosure is open', () => {
  it('a stale amount behind a cleared checkbox never blocks a result', () => {
    // The visitor opened the disclosure, typed nonsense, then closed it again.
    expect(validateHomeEquity(at({ includeClosingCosts: false, closingAmount: '-999' }))).toEqual({
      ok: true,
    });
  });

  it('requires an amount once the box is checked', () => {
    expect(errs(at({ includeClosingCosts: true, closingAmount: '' })).closingAmount).toBe(
      MSG.closingRequired,
    );
    expect(errs(at({ includeClosingCosts: true, closingAmount: '-1' })).closingAmount).toBe(
      MSG.closingNonNeg,
    );
  });

  it('accepts zero closing costs — a lender that charges none is a real offer', () => {
    expect(validateHomeEquity(at({ includeClosingCosts: true, closingAmount: '0' }))).toEqual({
      ok: true,
    });
  });

  it('rejects costs at or above the loan, which would leave no proceeds', () => {
    expect(errs(at({ includeClosingCosts: true, closingAmount: '150000' })).closingAmount).toBe(
      MSG.closingTooBig,
    );
    expect(errs(at({ includeClosingCosts: true, closingAmount: '200000' })).closingAmount).toBe(
      MSG.closingTooBig,
    );
  });

  it(`caps a percentage entry at ${MAX_CLOSING_PCT}% of the loan`, () => {
    const pct = (v: string) => at({ includeClosingCosts: true, closingUnit: 'pct', closingAmount: v });
    expect(errs(pct('25')).closingAmount).toBe(MSG.closingPctMax);
    expect(validateHomeEquity(pct('5'))).toEqual({ ok: true });
  });
});

describe('closing costs in dollars or percent', () => {
  it('converts a percentage of the loan', () => {
    expect(closingCostsInDollars(5, 'pct', 150000)).toBe(7500);
    expect(closingCostsInDollars(7500, 'usd', 150000)).toBe(7500);
  });

  it('5% and $7,500 are the same deal on a $150,000 loan', () => {
    const asPct = computeHomeEquity(
      at({ includeClosingCosts: true, closingUnit: 'pct', closingAmount: '5' }),
    );
    const asUsd = computeHomeEquity(WITH_COSTS);
    expect(asPct.closing!.costs).toBe(asUsd.closing!.costs);
    expect(asPct.closing!.realAprPct).toBeCloseTo(asUsd.closing!.realAprPct, 9);
  });
});

describe('the reference case', () => {
  const c = computeHomeEquity(REF);

  it('produces the payment the reference reports', () => {
    expect(money(c.plan.monthlyPayment)).toBe(1433.48);
    expect(c.months).toBe(180);
  });

  it('reports what the loan costs in total', () => {
    expect(money(c.plan.totalOfPayments)).toBe(258026.06);
    expect(money(c.plan.totalInterest)).toBe(108026.06);
  });

  it('carries a schedule that clears the loan', () => {
    expect(c.plan.schedule).toHaveLength(180);
    expect(c.plan.annual).toHaveLength(15);
    expect(c.plan.schedule[179].balance).toBeCloseTo(0, 4);
  });

  it('reproduces the published annual schedule to the cent', () => {
    const rows = c.plan.annual.slice(0, 7).map((y) => [money(y.interest), money(y.principal), money(y.balance)]);
    expect(rows).toEqual([
      [11804.97, 5396.77, 144603.23],
      [11357.04, 5844.7, 138758.53],
      [10871.93, 6329.81, 132428.72],
      [10346.56, 6855.18, 125573.54],
      [9777.58, 7424.15, 118149.39],
      [9161.38, 8040.36, 110109.03],
      [8494.04, 8707.7, 101401.33],
    ]);
  });

  it('has no closing costs unless they were asked for', () => {
    expect(c.closing).toBeNull();
  });
});

describe('closing costs and the real rate', () => {
  const c = computeHomeEquity(WITH_COSTS);

  it('leaves the payment and the schedule alone', () => {
    const plain = computeHomeEquity(REF);
    expect(c.plan.monthlyPayment).toBe(plain.plan.monthlyPayment);
    expect(c.plan.totalOfPayments).toBe(plain.plan.totalOfPayments);
  });

  it('takes the costs out of what you receive', () => {
    expect(c.closing!.costs).toBe(7500);
    expect(c.closing!.netProceeds).toBe(142500);
  });

  it('raises the real rate above the note rate', () => {
    expect(c.closing!.realAprPct).toBeCloseTo(8.8599, 3);
    expect(c.closing!.realAprPct).toBeGreaterThan(8);
  });

  it('deducted or paid upfront costs exactly the same', () => {
    // Both leave the borrower net $142,500 against the same payments, so the rate is
    // identical. Only the cash needed on the day differs.
    const upfront = computeHomeEquity(at({ ...WITH_COSTS, closingTreatment: 'upfront' }));
    expect(upfront.closing!.realAprPct).toBeCloseTo(c.closing!.realAprPct, 9);
    expect(upfront.closing!.netProceeds).toBe(c.closing!.netProceeds);
    expect(upfront.closing!.cashAtClosing).toBe(7500);
    expect(c.closing!.cashAtClosing).toBe(0);
  });

  it('zero closing costs leave the real rate at the note rate', () => {
    const free = computeHomeEquity(at({ includeClosingCosts: true, closingAmount: '0' }));
    expect(free.closing!.realAprPct).toBeCloseTo(8, 6);
    expect(free.closing!.netProceeds).toBe(150000);
  });

  it('bigger costs mean a higher real rate', () => {
    const worse = computeHomeEquity(at({ includeClosingCosts: true, closingAmount: '15000' }));
    expect(worse.closing!.realAprPct).toBeGreaterThan(c.closing!.realAprPct);
  });
});

describe('presentation', () => {
  const p = presentHomeEquity(computeHomeEquity(REF));

  it('prints the figures the reference prints', () => {
    expect(p.payment).toBe('$1,433.48');
    expect(p.paymentsLabel).toBe('Total of 180 loan payments');
    expect(p.totalOfPayments).toBe('$258,026.06');
    expect(p.totalInterest).toBe('$108,026.06');
  });

  it('splits the total 58% / 42%', () => {
    expect(p.principalShare).toBe('58%');
    expect(p.interestShare).toBe('42%');
  });

  it('says the whole thing in a sentence', () => {
    expect(p.interpretation).toBe(
      'Borrowing $150,000 at 8% over 15 years costs $1,433.48 a month and $108,026.06 in interest.',
    );
  });

  it('omits closing costs entirely when they were not asked for', () => {
    expect(p.closing).toBeNull();
  });

  it('says one payment, not one payments', () => {
    const one = presentHomeEquity(
      computeHomeEquity(at({ loanAmount: '1000', annualRatePct: '0', termYears: '1' })),
    );
    expect(one.paymentsLabel).toBe('Total of 12 loan payments');
  });

  it('announces the payment, and the real rate once costs are included', () => {
    expect(describeHomeEquity(computeHomeEquity(REF))).toBe(
      'Monthly payment: 1433 dollars and 48 cents.',
    );
    expect(describeHomeEquity(computeHomeEquity(WITH_COSTS))).toBe(
      'Monthly payment: 1433 dollars and 48 cents. Real APR with closing costs: 8.86 percent.',
    );
    expect(spokenUSD(1000)).toBe('1000 dollars');
    expect(spokenUSD(0.01)).toBe('0 dollars and 1 cent');
  });
});

describe('the closing-cost explanation', () => {
  it('explains a deducted fee by what you receive against what you owe', () => {
    const p = presentHomeEquity(computeHomeEquity(WITH_COSTS));
    expect(p.closing!.costs).toBe('$7,500.00');
    expect(p.closing!.netProceeds).toBe('$142,500.00');
    expect(p.closing!.realApr).toBe('8.86%');
    expect(p.closing!.note).toContain('comes out of the loan');
    expect(p.closing!.note).toContain('$142,500.00');
  });

  it('explains an upfront fee as the same cost with cash due on the day', () => {
    const p = presentHomeEquity(computeHomeEquity(at({ ...WITH_COSTS, closingTreatment: 'upfront' })));
    expect(p.closing!.cashAtClosing).toBe('$7,500.00');
    expect(p.closing!.note).toContain('out the same money either way');
    expect(p.closing!.realApr).toBe('8.86%');
  });
});

describe('the complete-result guard', () => {
  const good = computeHomeEquity(WITH_COSTS);
  const broken = (mutate: (c: HomeEquityComputed) => void): HomeEquityComputed => {
    const copy = JSON.parse(JSON.stringify(good)) as HomeEquityComputed;
    mutate(copy);
    return copy;
  };

  it('accepts a result that reconciles, returning the payment', () => {
    expect(completeHomeEquityValue(good)).toBeCloseTo(1433.478, 3);
  });

  it('rejects totals that do not follow from the loan', () => {
    expect(completeHomeEquityValue(broken((c) => (c.plan.totalOfPayments += 100)))).toBeNaN();
    expect(completeHomeEquityValue(broken((c) => (c.plan.totalInterest += 100)))).toBeNaN();
    expect(completeHomeEquityValue(broken((c) => (c.plan.loanAmount += 500)))).toBeNaN();
  });

  it('rejects a schedule that does not describe the same loan', () => {
    expect(completeHomeEquityValue(broken((c) => c.plan.schedule.pop()))).toBeNaN();
    expect(completeHomeEquityValue(broken((c) => (c.plan.schedule[179].balance = 400)))).toBeNaN();
    expect(completeHomeEquityValue(broken((c) => (c.plan.schedule[4].interest += 200)))).toBeNaN();
  });

  it('rejects a term that is not whole, in range, and matched by the months', () => {
    expect(completeHomeEquityValue(broken((c) => (c.termYears = 15.5)))).toBeNaN();
    expect(completeHomeEquityValue(broken((c) => (c.termYears = 31)))).toBeNaN();
    expect(completeHomeEquityValue(broken((c) => (c.months = 200)))).toBeNaN();
  });

  it('rejects a non-finite or impossible figure', () => {
    expect(completeHomeEquityValue(broken((c) => (c.loanAmount = 0)))).toBeNaN();
    expect(completeHomeEquityValue(broken((c) => (c.annualRatePct = -1)))).toBeNaN();
    expect(completeHomeEquityValue(broken((c) => (c.plan.monthlyPayment = Number.NaN)))).toBeNaN();
  });

  it('rejects closing costs that do not reconcile', () => {
    expect(completeHomeEquityValue(broken((c) => (c.closing!.netProceeds += 100)))).toBeNaN();
    expect(completeHomeEquityValue(broken((c) => (c.closing!.costs = 150000)))).toBeNaN();
    expect(completeHomeEquityValue(broken((c) => (c.closing!.cashAtClosing = -1)))).toBeNaN();
  });

  it('rejects a real rate BELOW the note rate — paying a fee can only cost more', () => {
    expect(completeHomeEquityValue(broken((c) => (c.closing!.realAprPct = 7)))).toBeNaN();
    expect(completeHomeEquityValue(broken((c) => (c.closing!.realAprPct = Number.NaN)))).toBeNaN();
  });
});

describe('the worked example', () => {
  it('validates, so the example a visitor sees is a real calculation', () => {
    expect(validateHomeEquity(HOME_EQUITY_EXAMPLE_VALUES)).toEqual({ ok: true });
  });

  it('is the published reference case and passes the same guard as any other result', () => {
    const c = computeHomeEquity(HOME_EQUITY_EXAMPLE_VALUES);
    expect(homeEquityBinding.resultValue(c)).toBeCloseTo(1433.478, 3);
    expect(presentHomeEquity(c).payment).toBe('$1,433.48');
  });

  it('opens with the closing-costs disclosure closed', () => {
    expect(HOME_EQUITY_EXAMPLE_VALUES.includeClosingCosts).toBe(false);
  });
});
