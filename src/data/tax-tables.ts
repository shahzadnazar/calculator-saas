/**
 * U.S. federal tax parameters for the 2025 and 2026 tax years.
 *
 * Sources: IRS Rev. Proc. 2024-40 (2025) and Rev. Proc. 2025-32 (2026), as amended by the
 * One Big Beautiful Bill Act of July 2025 — which raised the standard deduction, lifted the
 * SALT cap, and added the temporary tips, overtime, car-loan-interest and senior deductions
 * for 2025 through 2028.
 *
 * These are the numbers the whole calculator rests on, so they live in one place, are
 * frozen by tax-tables.test.ts against figures published independently of any one source,
 * and carry no logic. Anything derived belongs in income-tax.ts.
 */

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh' | 'qss';

/** Qualifying surviving spouse files on the joint tables. */
export const TABLE_STATUS: Record<FilingStatus, Exclude<FilingStatus, 'qss'>> = {
  single: 'single',
  mfj: 'mfj',
  mfs: 'mfs',
  hoh: 'hoh',
  qss: 'mfj',
};

export const FILING_STATUS_LABELS: { value: FilingStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married Filing Jointly' },
  { value: 'mfs', label: 'Married Filing Separately' },
  { value: 'hoh', label: 'Head of Household' },
  { value: 'qss', label: 'Qualified Widow(er)' },
];

/** A marginal rate and the taxable income it applies up to. */
export interface Bracket {
  upTo: number;
  rate: number;
}

type ByStatus<T> = Record<Exclude<FilingStatus, 'qss'>, T>;

export interface TaxYearTable {
  year: number;
  brackets: ByStatus<Bracket[]>;
  standardDeduction: ByStatus<number>;
  /** Extra standard deduction per person aged 65 or over. */
  additionalOver65: ByStatus<number>;
  /** Taxable-income ceilings for the 0% and 15% long-term gains rates; 20% above. */
  capitalGains: ByStatus<{ zeroUpTo: number; fifteenUpTo: number }>;
  amt: {
    exemption: ByStatus<number>;
    /** Exemption falls by 25c per dollar of AMTI above this. */
    phaseoutFrom: ByStatus<number>;
    /** AMTI above this is taxed at 28% rather than 26%. */
    rateBreak: ByStatus<number>;
  };
  /** Net investment income tax: 3.8% over a threshold that has never been indexed. */
  niitThreshold: ByStatus<number>;
  childTaxCredit: {
    perChild: number;
    perOtherDependent: number;
    /** Credit falls by $50 per $1,000 of MAGI above this. */
    phaseoutFrom: ByStatus<number>;
  };
  /** State and local taxes are deductible only up to this, itself phased down at high income. */
  saltCap: { cap: number; phaseoutFrom: ByStatus<number>; floor: number };
  /** Temporary OBBBA deductions, available whether or not the filer itemises. */
  temporaryDeductions: {
    tipsMax: number;
    overtimeMax: ByStatus<number>;
    carLoanInterestMax: number;
    carLoanPhaseoutFrom: ByStatus<number>;
    seniorDeduction: number;
    seniorPhaseoutFrom: ByStatus<number>;
  };
  studentLoanInterest: { max: number; phaseoutFrom: ByStatus<number>; phaseoutOver: ByStatus<number> };
  /** Child and dependent care: expense caps and the credit rate schedule. */
  dependentCare: { onePersonCap: number; twoPersonCap: number; maxRate: number; minRate: number; rateFloorAgi: number };
  /** American Opportunity Credit, per student. */
  educationCredit: { firstTier: number; secondTier: number; secondRate: number; phaseoutFrom: ByStatus<number>; phaseoutOver: ByStatus<number> };
  selfEmployment: { socialSecurityWageBase: number; socialSecurityRate: number; medicareRate: number; netEarningsFactor: number };
  /** Social security benefits become taxable above these provisional-income steps. */
  socialSecurity: { firstThreshold: ByStatus<number>; secondThreshold: ByStatus<number> };
}

const brackets = (bounds: number[]): Bracket[] => {
  const rates = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
  return rates.map((rate, i) => ({ upTo: bounds[i] ?? Number.POSITIVE_INFINITY, rate }));
};

export const TAX_YEARS: Record<number, TaxYearTable> = {
  2025: {
    year: 2025,
    brackets: {
      single: brackets([11925, 48475, 103350, 197300, 250525, 626350]),
      mfj: brackets([23850, 96950, 206700, 394600, 501050, 751600]),
      mfs: brackets([11925, 48475, 103350, 197300, 250525, 375800]),
      hoh: brackets([17000, 64850, 103350, 197300, 250525, 626350]),
    },
    standardDeduction: { single: 15750, mfj: 31500, mfs: 15750, hoh: 23625 },
    additionalOver65: { single: 2000, mfj: 1600, mfs: 1600, hoh: 2000 },
    capitalGains: {
      single: { zeroUpTo: 48350, fifteenUpTo: 533400 },
      mfj: { zeroUpTo: 96700, fifteenUpTo: 600050 },
      mfs: { zeroUpTo: 48350, fifteenUpTo: 300000 },
      hoh: { zeroUpTo: 64750, fifteenUpTo: 566700 },
    },
    amt: {
      exemption: { single: 88100, mfj: 137000, mfs: 68650, hoh: 88100 },
      phaseoutFrom: { single: 500000, mfj: 1000000, mfs: 500000, hoh: 500000 },
      rateBreak: { single: 239100, mfj: 239100, mfs: 119550, hoh: 239100 },
    },
    niitThreshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000 },
    childTaxCredit: {
      perChild: 2200,
      perOtherDependent: 500,
      phaseoutFrom: { single: 200000, mfj: 400000, mfs: 200000, hoh: 200000 },
    },
    saltCap: { cap: 40000, phaseoutFrom: { single: 500000, mfj: 500000, mfs: 250000, hoh: 500000 }, floor: 10000 },
    temporaryDeductions: {
      tipsMax: 25000,
      overtimeMax: { single: 12500, mfj: 25000, mfs: 12500, hoh: 12500 },
      carLoanInterestMax: 10000,
      carLoanPhaseoutFrom: { single: 100000, mfj: 200000, mfs: 100000, hoh: 100000 },
      seniorDeduction: 6000,
      seniorPhaseoutFrom: { single: 75000, mfj: 150000, mfs: 75000, hoh: 75000 },
    },
    studentLoanInterest: {
      max: 2500,
      phaseoutFrom: { single: 85000, mfj: 170000, mfs: 0, hoh: 85000 },
      phaseoutOver: { single: 15000, mfj: 30000, mfs: 1, hoh: 15000 },
    },
    dependentCare: { onePersonCap: 3000, twoPersonCap: 6000, maxRate: 0.35, minRate: 0.2, rateFloorAgi: 43000 },
    educationCredit: {
      firstTier: 2000,
      secondTier: 2000,
      secondRate: 0.25,
      phaseoutFrom: { single: 80000, mfj: 160000, mfs: 0, hoh: 80000 },
      phaseoutOver: { single: 10000, mfj: 20000, mfs: 1, hoh: 10000 },
    },
    selfEmployment: { socialSecurityWageBase: 176100, socialSecurityRate: 0.124, medicareRate: 0.029, netEarningsFactor: 0.9235 },
    socialSecurity: {
      firstThreshold: { single: 25000, mfj: 32000, mfs: 0, hoh: 25000 },
      secondThreshold: { single: 34000, mfj: 44000, mfs: 0, hoh: 34000 },
    },
  },

  2026: {
    year: 2026,
    brackets: {
      single: brackets([12400, 50400, 105700, 201775, 256225, 640600]),
      mfj: brackets([24800, 100800, 211400, 403550, 512450, 768700]),
      mfs: brackets([12400, 50400, 105700, 201775, 256225, 384350]),
      hoh: brackets([17700, 67450, 105700, 201775, 256225, 640600]),
    },
    standardDeduction: { single: 16100, mfj: 32200, mfs: 16100, hoh: 24150 },
    additionalOver65: { single: 2050, mfj: 1650, mfs: 1650, hoh: 2050 },
    capitalGains: {
      single: { zeroUpTo: 49450, fifteenUpTo: 545500 },
      mfj: { zeroUpTo: 98900, fifteenUpTo: 613700 },
      mfs: { zeroUpTo: 49450, fifteenUpTo: 306850 },
      hoh: { zeroUpTo: 66200, fifteenUpTo: 579600 },
    },
    amt: {
      exemption: { single: 90100, mfj: 140200, mfs: 70100, hoh: 90100 },
      phaseoutFrom: { single: 500000, mfj: 1000000, mfs: 500000, hoh: 500000 },
      rateBreak: { single: 244500, mfj: 244500, mfs: 122250, hoh: 244500 },
    },
    niitThreshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000 },
    childTaxCredit: {
      perChild: 2200,
      perOtherDependent: 500,
      phaseoutFrom: { single: 200000, mfj: 400000, mfs: 200000, hoh: 200000 },
    },
    saltCap: { cap: 40400, phaseoutFrom: { single: 505000, mfj: 505000, mfs: 252500, hoh: 505000 }, floor: 10000 },
    temporaryDeductions: {
      tipsMax: 25000,
      overtimeMax: { single: 12500, mfj: 25000, mfs: 12500, hoh: 12500 },
      carLoanInterestMax: 10000,
      carLoanPhaseoutFrom: { single: 100000, mfj: 200000, mfs: 100000, hoh: 100000 },
      seniorDeduction: 6000,
      seniorPhaseoutFrom: { single: 75000, mfj: 150000, mfs: 75000, hoh: 75000 },
    },
    studentLoanInterest: {
      max: 2500,
      phaseoutFrom: { single: 87000, mfj: 175000, mfs: 0, hoh: 87000 },
      phaseoutOver: { single: 15000, mfj: 30000, mfs: 1, hoh: 15000 },
    },
    dependentCare: { onePersonCap: 3000, twoPersonCap: 6000, maxRate: 0.35, minRate: 0.2, rateFloorAgi: 43000 },
    educationCredit: {
      firstTier: 2000,
      secondTier: 2000,
      secondRate: 0.25,
      phaseoutFrom: { single: 80000, mfj: 160000, mfs: 0, hoh: 80000 },
      phaseoutOver: { single: 10000, mfj: 20000, mfs: 1, hoh: 10000 },
    },
    selfEmployment: { socialSecurityWageBase: 184500, socialSecurityRate: 0.124, medicareRate: 0.029, netEarningsFactor: 0.9235 },
    socialSecurity: {
      firstThreshold: { single: 25000, mfj: 32000, mfs: 0, hoh: 25000 },
      secondThreshold: { single: 34000, mfj: 44000, mfs: 0, hoh: 34000 },
    },
  },
};

export const SUPPORTED_TAX_YEARS = [2026, 2025] as const;
export const DEFAULT_TAX_YEAR = 2025;

/** The table a status files on, resolving qualifying surviving spouse to the joint tables. */
export function tableFor(year: number, status: FilingStatus): TaxYearTable | null {
  return TAX_YEARS[year] ?? null;
}

export function statusKey(status: FilingStatus): Exclude<FilingStatus, 'qss'> {
  return TABLE_STATUS[status];
}
