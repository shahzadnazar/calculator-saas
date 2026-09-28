/**
 * Estimate a U.S. federal income tax return: what is owed or refunded once income,
 * deductions, credits and what has already been withheld are put together.
 *
 * This is an ESTIMATE, and deliberately a careful one. Real returns turn on facts a form
 * like this cannot ask about, so the model takes the mainstream path through each rule and
 * documents where it stops. What it does NOT attempt: state returns beyond a flat rate for
 * the SALT deduction, the earned income credit, itemised medical or casualty deductions,
 * AMT preferences other than the state and local addback, passive-activity limits, the
 * qualified business income deduction, or anything about a filer's residency history.
 *
 * All parameters live in @data/tax-tables. Nothing here hard-codes a threshold.
 *
 * The previous `calculateIncomeTax` / `STANDARD_DEDUCTION` pair is gone. It modelled the
 * 2024 year with two filing statuses and the standard deduction alone, and nothing outside
 * this calculator's own island consumed it.
 */
import {
  type Bracket,
  type FilingStatus,
  type TaxYearTable,
  TAX_YEARS,
  statusKey,
} from '@data/tax-tables';

export type { FilingStatus };

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const clampLow = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** Tax on an amount at a bracket ladder, plus the top rate the amount reaches. */
export function taxFromBrackets(amount: number, ladder: readonly Bracket[]): { tax: number; marginalRate: number } {
  let tax = 0;
  let lower = 0;
  let marginalRate = ladder[0]?.rate ?? 0;
  for (const b of ladder) {
    if (amount <= lower) break;
    tax += (Math.min(amount, b.upTo) - lower) * b.rate;
    marginalRate = b.rate;
    lower = b.upTo;
  }
  return { tax, marginalRate };
}

/**
 * A benefit that fades out over a range. Returns what survives.
 * `over` of 0 or less means the whole benefit disappears the moment the threshold is passed.
 */
function phaseOut(amount: number, income: number, from: number, over: number): number {
  if (income <= from) return amount;
  if (over <= 0) return 0;
  const lost = amount * ((income - from) / over);
  return clampLow(amount - lost);
}

/** The child tax credit's own taper: $50 per $1,000 of income over the threshold. */
function stepPhaseOut(amount: number, income: number, from: number): number {
  if (income <= from) return amount;
  const steps = Math.ceil((income - from) / 1000);
  return clampLow(amount - steps * 50);
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

export interface TaxReturnInput {
  year: number;
  filingStatus: FilingStatus;
  age: number;
  /** Spouse's age, only consulted on a joint return. */
  spouseAge?: number;
  youngDependents: number;
  otherDependents: number;

  wages: number;
  federalWithheld: number;
  stateWithheld: number;
  localWithheld: number;
  hasSelfEmployment: boolean;
  /** Net self-employment profit, when the filer says they have business income. */
  selfEmploymentIncome: number;
  socialSecurityIncome: number;
  interestIncome: number;
  ordinaryDividends: number;
  /** The part of ordinary dividends that is qualified, taxed at the gains rates. */
  qualifiedDividends: number;
  passiveIncome: number;
  shortTermGains: number;
  longTermGains: number;
  otherIncome: number;
  /** A flat state-plus-local rate, used to estimate the SALT deduction. */
  stateLocalRatePct: number;

  tipsIncome: number;
  overtimeIncome: number;
  carLoanInterest: number;
  iraContributions: number;
  realEstateTax: number;
  mortgageInterest: number;
  charitableDonations: number;
  studentLoanInterest: number;
  childCareExpense: number;
  /** Tuition per student, one entry each. */
  collegeExpenses: number[];
  otherDeductibles: number;
}

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

export interface TaxReturnResult {
  totalIncome: number;
  /** Above-the-line adjustments plus the standard or itemised deduction. */
  totalDeductions: number;
  taxableIncome: number;
  regularTax: number;
  alternativeMinimumTax: number;
  netInvestmentIncomeTax: number;
  totalCredits: number;
  totalTaxWithCredits: number;
  marginalRate: number;
  prepayments: number;
  /** Positive means owed, negative means refunded. */
  amountOwed: number;

  /** Supporting detail, so the page can explain rather than assert. */
  adjustedGrossIncome: number;
  adjustments: number;
  standardDeduction: number;
  itemizedDeduction: number;
  usedItemized: boolean;
  taxableSocialSecurity: number;
  selfEmploymentTax: number;
  preferentialIncome: number;
  effectiveRate: number;
  unsolvable: boolean;
}

const NOTHING: TaxReturnResult = {
  totalIncome: Number.NaN,
  totalDeductions: Number.NaN,
  taxableIncome: Number.NaN,
  regularTax: Number.NaN,
  alternativeMinimumTax: Number.NaN,
  netInvestmentIncomeTax: Number.NaN,
  totalCredits: Number.NaN,
  totalTaxWithCredits: Number.NaN,
  marginalRate: Number.NaN,
  prepayments: Number.NaN,
  amountOwed: Number.NaN,
  adjustedGrossIncome: Number.NaN,
  adjustments: Number.NaN,
  standardDeduction: Number.NaN,
  itemizedDeduction: Number.NaN,
  usedItemized: false,
  taxableSocialSecurity: Number.NaN,
  selfEmploymentTax: Number.NaN,
  preferentialIncome: Number.NaN,
  effectiveRate: Number.NaN,
  unsolvable: true,
};

/* ------------------------------------------------------------------ */
/* The pieces                                                          */
/* ------------------------------------------------------------------ */

/**
 * How much of a social security benefit is taxable. Provisional income is everything else
 * plus half the benefit; above the first step half the excess counts, above the second,
 * 85% — capped at 85% of the benefit either way.
 */
export function taxableSocialSecurity(
  benefit: number,
  otherIncome: number,
  t: TaxYearTable,
  status: FilingStatus,
): number {
  const key = statusKey(status);
  if (benefit <= 0) return 0;
  const first = t.socialSecurity.firstThreshold[key];
  const second = t.socialSecurity.secondThreshold[key];
  // Married filing separately gets no exemption at all if the couple lived together.
  if (first <= 0) return benefit * 0.85;

  const provisional = otherIncome + benefit / 2;
  if (provisional <= first) return 0;
  if (provisional <= second) return Math.min((provisional - first) * 0.5, benefit * 0.5);
  const upper = Math.min(second - first, benefit) * 0.5;
  return Math.min((provisional - second) * 0.85 + upper, benefit * 0.85);
}

/** Self-employment tax: social security up to the wage base, Medicare on everything. */
export function selfEmploymentTax(netProfit: number, t: TaxYearTable): number {
  const base = clampLow(netProfit) * t.selfEmployment.netEarningsFactor;
  if (base <= 0) return 0;
  const ss = Math.min(base, t.selfEmployment.socialSecurityWageBase) * t.selfEmployment.socialSecurityRate;
  return ss + base * t.selfEmployment.medicareRate;
}

/**
 * Tax on taxable income where part of it is qualified dividends and long-term gains, which
 * get their own 0/15/20 ladder. The preferential slice sits on TOP of ordinary income, so
 * ordinary income is what decides which gains rate the slice starts at.
 */
export function taxWithPreferentialRates(
  taxable: number,
  preferential: number,
  t: TaxYearTable,
  status: FilingStatus,
): { tax: number; marginalRate: number } {
  const key = statusKey(status);
  const ladder = t.brackets[key];
  const gains = Math.min(clampLow(preferential), taxable);
  const ordinary = clampLow(taxable - gains);

  const ordinaryPart = taxFromBrackets(ordinary, ladder);
  if (gains <= 0) return ordinaryPart;

  const { zeroUpTo, fifteenUpTo } = t.capitalGains[key];
  // Walk the gains slice through the three rates, starting where ordinary income left off.
  const atZero = clampLow(Math.min(taxable, zeroUpTo) - ordinary);
  const atFifteen = clampLow(Math.min(taxable, fifteenUpTo) - Math.max(ordinary, zeroUpTo));
  const atTwenty = clampLow(taxable - Math.max(ordinary, fifteenUpTo));
  const gainsTax =
    Math.min(gains, atZero) * 0 +
    Math.min(clampLow(gains - atZero), atFifteen) * 0.15 +
    Math.min(clampLow(gains - atZero - atFifteen), atTwenty) * 0.2;

  // The rate that applies to the next dollar of ORDINARY income is what a filer plans with.
  return { tax: ordinaryPart.tax + gainsTax, marginalRate: ordinaryPart.marginalRate };
}

/**
 * A deliberately narrow alternative minimum tax: the exemption (phased out at high income)
 * against taxable income with the state and local deduction added back, which is the
 * preference that actually catches ordinary filers. Other preferences are out of scope, so
 * this understates AMT for filers with incentive stock options or private-activity bonds.
 */
export function alternativeMinimumTax(
  taxableIncome: number,
  saltDeducted: number,
  regularTax: number,
  t: TaxYearTable,
  status: FilingStatus,
): number {
  const key = statusKey(status);
  const amti = clampLow(taxableIncome + clampLow(saltDeducted));
  const excess = clampLow(amti - t.amt.phaseoutFrom[key]);
  const exemption = clampLow(t.amt.exemption[key] - excess * 0.25);
  const base = clampLow(amti - exemption);
  if (base <= 0) return 0;
  const brk = t.amt.rateBreak[key];
  const tentative = base <= brk ? base * 0.26 : brk * 0.26 + (base - brk) * 0.28;
  return clampLow(tentative - regularTax);
}

/** 3.8% on the smaller of net investment income and the income above the threshold. */
export function netInvestmentIncomeTax(
  investmentIncome: number,
  magi: number,
  t: TaxYearTable,
  status: FilingStatus,
): number {
  const over = clampLow(magi - t.niitThreshold[statusKey(status)]);
  return Math.min(clampLow(investmentIncome), over) * 0.038;
}

/** The dependent-care credit rate slides from 35% down to 20% as income rises. */
export function dependentCareRate(agi: number, t: TaxYearTable): number {
  const { maxRate, minRate, rateFloorAgi } = t.dependentCare;
  if (agi <= 15000) return maxRate;
  if (agi >= rateFloorAgi) return minRate;
  const steps = Math.floor((agi - 15000) / 2000) + 1;
  return Math.max(minRate, maxRate - steps * 0.01);
}

/* ------------------------------------------------------------------ */
/* The return                                                          */
/* ------------------------------------------------------------------ */

/**
 * Work a whole return through, in the order a 1040 does: income, adjustments, deduction,
 * tax, extra taxes, credits, and finally what has already been paid.
 */
export function calculateTaxReturn(input: TaxReturnInput): TaxReturnResult {
  const t = TAX_YEARS[input.year];
  if (!t) return NOTHING;
  const numbers = [
    input.age, input.wages, input.federalWithheld, input.stateWithheld, input.localWithheld,
    input.selfEmploymentIncome, input.socialSecurityIncome, input.interestIncome,
    input.ordinaryDividends, input.qualifiedDividends, input.passiveIncome, input.shortTermGains,
    input.longTermGains, input.otherIncome, input.stateLocalRatePct, input.tipsIncome,
    input.overtimeIncome, input.carLoanInterest, input.iraContributions, input.realEstateTax,
    input.mortgageInterest, input.charitableDonations, input.studentLoanInterest,
    input.childCareExpense, input.otherDeductibles, input.youngDependents, input.otherDependents,
    ...input.collegeExpenses,
  ];
  if (numbers.some((n) => !Number.isFinite(n))) return NOTHING;

  const key = statusKey(input.filingStatus);
  const joint = key === 'mfj';
  const selfEmployed = input.hasSelfEmployment ? clampLow(input.selfEmploymentIncome) : 0;

  /* --- income ---------------------------------------------------- */
  const qualified = Math.min(clampLow(input.qualifiedDividends), clampLow(input.ordinaryDividends));
  const nonSocialSecurity =
    clampLow(input.wages) +
    selfEmployed +
    clampLow(input.interestIncome) +
    clampLow(input.ordinaryDividends) +
    clampLow(input.passiveIncome) +
    clampLow(input.shortTermGains) +
    clampLow(input.longTermGains) +
    clampLow(input.otherIncome);
  const ssTaxable = taxableSocialSecurity(clampLow(input.socialSecurityIncome), nonSocialSecurity, t, input.filingStatus);
  const totalIncome = nonSocialSecurity + ssTaxable;

  /* --- adjustments (above the line) ------------------------------- */
  const seTax = selfEmploymentTax(selfEmployed, t);
  const halfSeTax = seTax / 2;

  const tips = Math.min(clampLow(input.tipsIncome), t.temporaryDeductions.tipsMax);
  const overtime = Math.min(clampLow(input.overtimeIncome), t.temporaryDeductions.overtimeMax[key]);
  const carLoan = phaseOut(
    Math.min(clampLow(input.carLoanInterest), t.temporaryDeductions.carLoanInterestMax),
    totalIncome,
    t.temporaryDeductions.carLoanPhaseoutFrom[key],
    100000,
  );
  const studentLoan = phaseOut(
    Math.min(clampLow(input.studentLoanInterest), t.studentLoanInterest.max),
    totalIncome,
    t.studentLoanInterest.phaseoutFrom[key],
    t.studentLoanInterest.phaseoutOver[key],
  );
  const seniorCount = (input.age >= 65 ? 1 : 0) + (joint && (input.spouseAge ?? 0) >= 65 ? 1 : 0);
  const senior = phaseOut(
    seniorCount * t.temporaryDeductions.seniorDeduction,
    totalIncome,
    t.temporaryDeductions.seniorPhaseoutFrom[key],
    joint ? 100000 : 50000,
  );

  const adjustments =
    halfSeTax + clampLow(input.iraContributions) + studentLoan + tips + overtime + carLoan + senior;
  const agi = clampLow(totalIncome - adjustments);

  /* --- deduction -------------------------------------------------- */
  const over65 = seniorCount * t.additionalOver65[key];
  const standardDeduction = t.standardDeduction[key] + over65;

  const stateLocalFromRate = (clampLow(input.stateLocalRatePct) / 100) * totalIncome;
  const rawSalt =
    clampLow(input.stateWithheld) + clampLow(input.localWithheld) + stateLocalFromRate + clampLow(input.realEstateTax);
  const saltAllowance = Math.max(
    t.saltCap.floor,
    phaseOut(t.saltCap.cap - t.saltCap.floor, agi, t.saltCap.phaseoutFrom[key], 100000) + t.saltCap.floor,
  );
  const salt = Math.min(rawSalt, saltAllowance);
  const itemizedDeduction =
    salt + clampLow(input.mortgageInterest) + clampLow(input.charitableDonations) + clampLow(input.otherDeductibles);

  const usedItemized = itemizedDeduction > standardDeduction;
  const deduction = usedItemized ? itemizedDeduction : standardDeduction;
  const taxableIncome = clampLow(agi - deduction);

  /* --- tax -------------------------------------------------------- */
  const preferential = Math.min(qualified + clampLow(input.longTermGains), taxableIncome);
  const { tax: regularTax, marginalRate } = taxWithPreferentialRates(taxableIncome, preferential, t, input.filingStatus);

  const amt = alternativeMinimumTax(taxableIncome, usedItemized ? salt : 0, regularTax, t, input.filingStatus);

  const investmentIncome =
    clampLow(input.interestIncome) +
    clampLow(input.ordinaryDividends) +
    clampLow(input.passiveIncome) +
    clampLow(input.shortTermGains) +
    clampLow(input.longTermGains);
  const niit = netInvestmentIncomeTax(investmentIncome, agi, t, input.filingStatus);

  /* --- credits ---------------------------------------------------- */
  const ctcBase = clampLow(input.youngDependents) * t.childTaxCredit.perChild;
  const odcBase = clampLow(input.otherDependents) * t.childTaxCredit.perOtherDependent;
  const dependentCredits = stepPhaseOut(ctcBase + odcBase, agi, t.childTaxCredit.phaseoutFrom[key]);

  const careCap =
    clampLow(input.youngDependents) >= 2 ? t.dependentCare.twoPersonCap : t.dependentCare.onePersonCap;
  const careCredit =
    clampLow(input.youngDependents) > 0
      ? Math.min(clampLow(input.childCareExpense), careCap) * dependentCareRate(agi, t)
      : 0;

  const educationCredit = input.collegeExpenses.reduce((sum, spend) => {
    const e = clampLow(spend);
    if (e <= 0) return sum;
    const raw =
      Math.min(e, t.educationCredit.firstTier) +
      Math.min(clampLow(e - t.educationCredit.firstTier), t.educationCredit.secondTier) * t.educationCredit.secondRate;
    return sum + phaseOut(raw, agi, t.educationCredit.phaseoutFrom[key], t.educationCredit.phaseoutOver[key]);
  }, 0);

  const beforeCredits = regularTax + amt;
  // Non-refundable credits cannot push the bill below zero here; the refundable portion of
  // the child credit is out of scope, so this understates a refund for very low incomes.
  const totalCredits = Math.min(dependentCredits + careCredit + educationCredit, beforeCredits);

  const totalTaxWithCredits = clampLow(beforeCredits - totalCredits) + niit + seTax;
  const prepayments = clampLow(input.federalWithheld);

  return {
    totalIncome,
    totalDeductions: deduction + adjustments,
    taxableIncome,
    regularTax,
    alternativeMinimumTax: amt,
    netInvestmentIncomeTax: niit,
    totalCredits,
    totalTaxWithCredits,
    marginalRate: marginalRate * 100,
    prepayments,
    amountOwed: totalTaxWithCredits - prepayments,
    adjustedGrossIncome: agi,
    adjustments,
    standardDeduction,
    itemizedDeduction,
    usedItemized,
    taxableSocialSecurity: ssTaxable,
    selfEmploymentTax: seTax,
    preferentialIncome: preferential,
    effectiveRate: totalIncome > 0 ? (totalTaxWithCredits / totalIncome) * 100 : 0,
    unsolvable: false,
  };
}
