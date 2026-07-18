/**
 * Estimate U.S. federal income tax (2024 tax year) using progressive brackets
 * and the standard deduction. An ESTIMATE only — it ignores credits, other
 * deductions, state tax and payroll taxes. Pure and unit-tested.
 */

export type FilingStatus = 'single' | 'married';

interface Bracket {
  upTo: number; // upper bound of the bracket (Infinity for the top)
  rate: number; // marginal rate as a decimal
}

// 2024 tax-year brackets.
const BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { upTo: 11600, rate: 0.1 },
    { upTo: 47150, rate: 0.12 },
    { upTo: 100525, rate: 0.22 },
    { upTo: 191950, rate: 0.24 },
    { upTo: 243725, rate: 0.32 },
    { upTo: 609350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  married: [
    { upTo: 23200, rate: 0.1 },
    { upTo: 94300, rate: 0.12 },
    { upTo: 201050, rate: 0.22 },
    { upTo: 383900, rate: 0.24 },
    { upTo: 487450, rate: 0.32 },
    { upTo: 731200, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
};

export const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 14600,
  married: 29200,
};

export interface IncomeTaxInput {
  grossIncome: number;
  filingStatus: FilingStatus;
  /** Extra pre-tax deductions on top of the standard deduction (e.g. 401k). */
  additionalDeductions?: number;
}

export interface IncomeTaxResult {
  taxableIncome: number;
  tax: number;
  afterTax: number;
  effectiveRate: number; // % of gross
  marginalRate: number; // % top bracket reached
}

export function calculateIncomeTax(input: IncomeTaxInput): IncomeTaxResult {
  const gross = Math.max(0, input.grossIncome || 0);
  const deduction = STANDARD_DEDUCTION[input.filingStatus] + Math.max(0, input.additionalDeductions || 0);
  const taxable = Math.max(0, gross - deduction);

  const brackets = BRACKETS[input.filingStatus];
  let tax = 0;
  let lower = 0;
  let marginalRate = 0;
  for (const b of brackets) {
    if (taxable > lower) {
      const chunk = Math.min(taxable, b.upTo) - lower;
      tax += chunk * b.rate;
      marginalRate = b.rate;
      lower = b.upTo;
    } else {
      break;
    }
  }

  return {
    taxableIncome: taxable,
    tax,
    afterTax: gross - tax,
    effectiveRate: gross > 0 ? (tax / gross) * 100 : 0,
    marginalRate: marginalRate * 100,
  };
}
