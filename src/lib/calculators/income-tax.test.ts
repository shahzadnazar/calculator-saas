import { describe, it, expect } from 'vitest';
import { TAX_YEARS } from '@data/tax-tables';
import {
  alternativeMinimumTax,
  calculateTaxReturn,
  dependentCareRate,
  netInvestmentIncomeTax,
  selfEmploymentTax,
  taxFromBrackets,
  taxWithPreferentialRates,
  taxableSocialSecurity,
  type TaxReturnInput,
} from './income-tax';

/**
 * Frozen against the published reference return: a single filer aged 30 with $80,000 of
 * wages and $9,000 withheld, for 2025, owes $49.
 */
const REF: TaxReturnInput = {
  year: 2025,
  filingStatus: 'single',
  age: 30,
  youngDependents: 0,
  otherDependents: 0,
  wages: 80000,
  federalWithheld: 9000,
  stateWithheld: 0,
  localWithheld: 0,
  hasSelfEmployment: false,
  selfEmploymentIncome: 0,
  socialSecurityIncome: 0,
  interestIncome: 0,
  ordinaryDividends: 0,
  qualifiedDividends: 0,
  passiveIncome: 0,
  shortTermGains: 0,
  longTermGains: 0,
  otherIncome: 0,
  stateLocalRatePct: 0,
  tipsIncome: 0,
  overtimeIncome: 0,
  carLoanInterest: 0,
  iraContributions: 0,
  realEstateTax: 0,
  mortgageInterest: 0,
  charitableDonations: 0,
  studentLoanInterest: 0,
  childCareExpense: 0,
  collegeExpenses: [0, 0, 0, 0],
  otherDeductibles: 0,
};
const ret = (over: Partial<TaxReturnInput> = {}) => calculateTaxReturn({ ...REF, ...over });
const round = (n: number) => Math.round(n);
const T25 = TAX_YEARS[2025];

describe('the published reference return', () => {
  const r = ret();

  it('prints every line of the published table', () => {
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

  it('takes the standard deduction when nothing is itemised', () => {
    expect(r.usedItemized).toBe(false);
    expect(r.standardDeduction).toBe(15750);
  });

  it('is reproducible by hand from the brackets on screen', () => {
    // 10% of 11,925 + 12% to 48,475 + 22% of the rest.
    const byHand = 11925 * 0.1 + (48475 - 11925) * 0.12 + (64250 - 48475) * 0.22;
    expect(round(byHand)).toBe(9049);
  });
});

describe('brackets', () => {
  it('walks the ladder and reports the rate reached', () => {
    const ladder = T25.brackets.single;
    expect(round(taxFromBrackets(64250, ladder).tax)).toBe(9049);
    expect(taxFromBrackets(64250, ladder).marginalRate).toBe(0.22);
    expect(taxFromBrackets(0, ladder).tax).toBe(0);
    expect(taxFromBrackets(10000, ladder).marginalRate).toBe(0.1);
  });

  it('a dollar into a bracket is taxed only on that dollar', () => {
    const ladder = T25.brackets.single;
    const at = taxFromBrackets(11925, ladder).tax;
    const justOver = taxFromBrackets(11926, ladder).tax;
    expect(round((justOver - at) * 100) / 100).toBe(0.12);
  });

  it('every year and status has a rising, seven-step ladder', () => {
    for (const t of Object.values(TAX_YEARS)) {
      for (const ladder of Object.values(t.brackets)) {
        expect(ladder).toHaveLength(7);
        for (let i = 1; i < ladder.length; i += 1) {
          expect(ladder[i].upTo).toBeGreaterThan(ladder[i - 1].upTo);
          expect(ladder[i].rate).toBeGreaterThan(ladder[i - 1].rate);
        }
      }
    }
  });
});

describe('the two tax years differ', () => {
  it('2026 taxes the same income slightly less', () => {
    const a = ret();
    const b = ret({ year: 2026 });
    expect(b.standardDeduction).toBe(16100);
    expect(b.taxableIncome).toBeLessThan(a.taxableIncome);
    expect(b.regularTax).toBeLessThan(a.regularTax);
  });

  it('refuses a year it has no table for', () => {
    expect(ret({ year: 2019 }).unsolvable).toBe(true);
    expect(Number.isNaN(ret({ year: 2019 }).totalTaxWithCredits)).toBe(true);
  });
});

describe('filing status', () => {
  it('a joint filer on the same income pays less', () => {
    expect(ret({ filingStatus: 'mfj' }).regularTax).toBeLessThan(ret().regularTax);
  });

  it('a qualifying surviving spouse files on the joint tables', () => {
    expect(ret({ filingStatus: 'qss' }).regularTax).toBe(ret({ filingStatus: 'mfj' }).regularTax);
  });

  it('head of household sits between single and joint', () => {
    const single = ret().regularTax;
    const hoh = ret({ filingStatus: 'hoh' }).regularTax;
    const mfj = ret({ filingStatus: 'mfj' }).regularTax;
    expect(hoh).toBeLessThan(single);
    expect(hoh).toBeGreaterThan(mfj);
  });
});

describe('preferential rates on gains and qualified dividends', () => {
  it('long-term gains inside the 0% band are not taxed', () => {
    const r = taxWithPreferentialRates(40000, 40000, T25, 'single');
    expect(r.tax).toBe(0);
  });

  it('gains stack on top of ordinary income, not underneath it', () => {
    // Ordinary income fills the 0% gains band, so the gains start at 15%.
    const r = taxWithPreferentialRates(148350, 100000, T25, 'single');
    const ordinaryOnly = taxFromBrackets(48350, T25.brackets.single).tax;
    expect(round(r.tax)).toBe(round(ordinaryOnly + 100000 * 0.15));
  });

  it('reports the ordinary marginal rate, which is what a filer plans with', () => {
    // $20,000 of the $64,250 is gains, so only $44,250 is ordinary — the 12% bracket.
    expect(taxWithPreferentialRates(64250, 20000, T25, 'single').marginalRate).toBe(0.12);
    // All ordinary, and the same income reaches 22%.
    expect(taxWithPreferentialRates(64250, 0, T25, 'single').marginalRate).toBe(0.22);
  });

  it('a return with long-term gains pays less than the same money in wages', () => {
    const wages = ret({ wages: 120000 });
    const gains = ret({ wages: 80000, longTermGains: 40000 });
    expect(gains.regularTax).toBeLessThan(wages.regularTax);
  });

  it('qualified dividends can never exceed ordinary dividends', () => {
    const r = ret({ ordinaryDividends: 1000, qualifiedDividends: 5000 });
    expect(r.preferentialIncome).toBeLessThanOrEqual(1000);
  });
});

describe('social security', () => {
  it('is untaxed when there is little other income', () => {
    expect(taxableSocialSecurity(20000, 5000, T25, 'single')).toBe(0);
  });

  it('is at most 85% taxable however high the other income', () => {
    expect(taxableSocialSecurity(30000, 500000, T25, 'single')).toBeCloseTo(25500, 6);
  });

  it('phases in through the two steps', () => {
    const mid = taxableSocialSecurity(20000, 30000, T25, 'single');
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(20000 * 0.85);
  });

  it('a benefit of nothing is taxable on nothing', () => {
    expect(taxableSocialSecurity(0, 100000, T25, 'single')).toBe(0);
  });
});

describe('self employment', () => {
  it('charges both halves of social security and Medicare', () => {
    const tax = selfEmploymentTax(100000, T25);
    const base = 100000 * 0.9235;
    expect(round(tax)).toBe(round(base * 0.124 + base * 0.029));
  });

  it('stops charging social security above the wage base', () => {
    const a = selfEmploymentTax(400000, T25);
    const b = selfEmploymentTax(500000, T25);
    // Only Medicare applies to the extra $100,000.
    expect(round(b - a)).toBe(round(100000 * 0.9235 * 0.029));
  });

  it('is only charged when the filer says they have business income', () => {
    expect(ret({ selfEmploymentIncome: 50000 }).selfEmploymentTax).toBe(0);
    expect(ret({ hasSelfEmployment: true, selfEmploymentIncome: 50000 }).selfEmploymentTax).toBeGreaterThan(0);
  });

  it('deducts half of it above the line', () => {
    const r = ret({ wages: 0, hasSelfEmployment: true, selfEmploymentIncome: 100000 });
    expect(round(r.adjustments)).toBe(round(r.selfEmploymentTax / 2));
  });
});

describe('deductions', () => {
  it('itemises only when itemising beats the standard deduction', () => {
    const small = ret({ charitableDonations: 1000 });
    expect(small.usedItemized).toBe(false);
    expect(small.totalDeductions).toBe(15750);

    const big = ret({ mortgageInterest: 20000, charitableDonations: 5000 });
    expect(big.usedItemized).toBe(true);
    expect(round(big.totalDeductions)).toBe(25000);
  });

  it('caps state and local tax at the year allowance', () => {
    const r = ret({ stateWithheld: 60000, mortgageInterest: 1 });
    expect(r.itemizedDeduction).toBeLessThanOrEqual(T25.saltCap.cap + 1);
  });

  it('adds the extra standard deduction at 65', () => {
    const younger = ret({ age: 64 });
    const older = ret({ age: 65 });
    expect(older.standardDeduction - younger.standardDeduction).toBe(T25.additionalOver65.single);
  });

  it('gives a senior the temporary extra deduction above the line', () => {
    expect(ret({ age: 70 }).adjustments).toBeGreaterThan(ret({ age: 40 }).adjustments);
  });

  it('caps tips, overtime and car loan interest at their limits', () => {
    const r = ret({ tipsIncome: 90000, overtimeIncome: 90000, carLoanInterest: 90000 });
    // $80,000 of income is under the car-loan phaseout, so all three cap out in full.
    expect(round(r.adjustments)).toBe(25000 + 12500 + 10000);
  });

  it('phases the car loan deduction out above its threshold', () => {
    expect(ret({ wages: 250000, carLoanInterest: 10000 }).adjustments).toBe(0);
  });

  it('phases out student loan interest as income rises', () => {
    expect(ret({ studentLoanInterest: 2500 }).adjustments).toBe(2500);
    expect(ret({ wages: 200000, studentLoanInterest: 2500 }).adjustments).toBe(0);
  });
});

describe('credits', () => {
  it('gives the child credit for young dependents and the smaller one for others', () => {
    expect(round(ret({ youngDependents: 2 }).totalCredits)).toBe(4400);
    expect(round(ret({ otherDependents: 2 }).totalCredits)).toBe(1000);
  });

  it('phases the child credit out at high income', () => {
    expect(round(ret({ wages: 500000, youngDependents: 2 }).totalCredits)).toBe(0);
  });

  it('never refunds more than the tax owed', () => {
    const r = ret({ wages: 20000, youngDependents: 4 });
    expect(r.totalCredits).toBeLessThanOrEqual(r.regularTax + r.alternativeMinimumTax);
    expect(r.totalTaxWithCredits).toBeGreaterThanOrEqual(0);
  });

  it('credits child care only when there is a young dependent to care for', () => {
    expect(ret({ childCareExpense: 3000 }).totalCredits).toBe(0);
    expect(ret({ youngDependents: 1, childCareExpense: 3000 }).totalCredits).toBeGreaterThan(2200);
  });

  it('slides the dependent-care rate down as income rises', () => {
    expect(dependentCareRate(10000, T25)).toBe(0.35);
    expect(dependentCareRate(200000, T25)).toBe(0.2);
    expect(dependentCareRate(25000, T25)).toBeGreaterThan(0.2);
  });

  it('gives an education credit per student, up to $2,500 each', () => {
    const one = ret({ collegeExpenses: [4000, 0, 0, 0] });
    expect(round(one.totalCredits)).toBe(2500);
    const two = ret({ collegeExpenses: [4000, 4000, 0, 0] });
    expect(round(two.totalCredits)).toBe(5000);
  });
});

describe('the extra taxes', () => {
  it('charges net investment income tax only above the threshold', () => {
    expect(netInvestmentIncomeTax(50000, 150000, T25, 'single')).toBe(0);
    expect(round(netInvestmentIncomeTax(50000, 300000, T25, 'single'))).toBe(round(50000 * 0.038));
  });

  it('charges it on the smaller of the investment income and the excess', () => {
    expect(round(netInvestmentIncomeTax(50000, 210000, T25, 'single'))).toBe(round(10000 * 0.038));
  });

  it('leaves an ordinary return with no AMT', () => {
    expect(alternativeMinimumTax(64250, 0, 9049, T25, 'single')).toBe(0);
    expect(ret().alternativeMinimumTax).toBe(0);
  });

  it('reports AMT only as the excess over the regular tax', () => {
    expect(alternativeMinimumTax(400000, 40000, 200000, T25, 'single')).toBe(0);
  });
});

describe('refunds and edges', () => {
  it('reports a refund as a negative amount owed', () => {
    expect(ret({ federalWithheld: 15000 }).amountOwed).toBeLessThan(0);
  });

  it('a return with no income owes nothing and refunds what was withheld', () => {
    const r = ret({ wages: 0, federalWithheld: 500 });
    expect(r.taxableIncome).toBe(0);
    expect(r.totalTaxWithCredits).toBe(0);
    expect(round(r.amountOwed)).toBe(-500);
  });

  it('never lets a negative entry create income or a deduction', () => {
    const r = ret({ wages: -5000, charitableDonations: -1000 });
    expect(r.totalIncome).toBe(0);
    expect(r.totalDeductions).toBe(15750);
  });

  it('refuses a non-finite entry outright', () => {
    expect(ret({ wages: Number.NaN }).unsolvable).toBe(true);
    expect(ret({ collegeExpenses: [Number.POSITIVE_INFINITY, 0, 0, 0] }).unsolvable).toBe(true);
  });

  it('carries no figures to print when unsolvable', () => {
    const r = ret({ wages: Number.NaN });
    for (const v of [r.totalIncome, r.taxableIncome, r.regularTax, r.amountOwed]) {
      expect(Number.isNaN(v)).toBe(true);
    }
  });

  it('an effective rate is never more than the marginal one on a simple return', () => {
    const r = ret();
    expect(r.effectiveRate).toBeLessThan(r.marginalRate);
  });
});
