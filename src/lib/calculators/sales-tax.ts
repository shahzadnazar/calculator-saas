/**
 * Sales tax — add tax to a net amount, or extract tax from a gross amount.
 * Pure and unit-tested.
 */
export interface AddTaxResult {
  net: number;
  tax: number;
  gross: number;
}

/** Add tax to a pre-tax amount. */
export function addSalesTax(amount: number, ratePct: number): AddTaxResult {
  const net = Math.max(0, amount || 0);
  const tax = net * ((ratePct || 0) / 100);
  return { net, tax, gross: net + tax };
}

/** Extract the tax already included in a tax-inclusive total. */
export function removeSalesTax(gross: number, ratePct: number): AddTaxResult {
  const g = Math.max(0, gross || 0);
  const rate = (ratePct || 0) / 100;
  const net = g / (1 + rate);
  return { net, tax: g - net, gross: g };
}

/* ------------------------------------------------------------------ */
/* Solving for whichever of the three is missing                       */
/* ------------------------------------------------------------------ */

/**
 * The three quantities are one equation — `after = before x (1 + rate)` — so knowing any
 * two gives the third. Which one is missing IS the mode; there is no separate selector to
 * get out of step with the fields.
 */
export type SalesTaxUnknown = 'beforeTax' | 'ratePct' | 'afterTax';

export interface SalesTaxSolveInput {
  /** `null` marks the one to solve for. Exactly one of the three must be null. */
  beforeTax: number | null;
  ratePct: number | null;
  afterTax: number | null;
}

export interface SalesTaxSolution {
  beforeTax: number;
  ratePct: number;
  taxAmount: number;
  afterTax: number;
  solvedFor: SalesTaxUnknown;
  /** True when the two given values do not determine a third; every figure is NaN. */
  unsolvable: boolean;
}

const NO_SOLUTION = (solvedFor: SalesTaxUnknown): SalesTaxSolution => ({
  beforeTax: Number.NaN,
  ratePct: Number.NaN,
  taxAmount: Number.NaN,
  afterTax: Number.NaN,
  solvedFor,
  unsolvable: true,
});

/** Which of the three was left blank, or null when it is not exactly one. */
export function unknownOf(input: SalesTaxSolveInput): SalesTaxUnknown | null {
  const missing: SalesTaxUnknown[] = [];
  if (input.beforeTax === null) missing.push('beforeTax');
  if (input.ratePct === null) missing.push('ratePct');
  if (input.afterTax === null) missing.push('afterTax');
  return missing.length === 1 ? missing[0] : null;
}

/**
 * Fill in the missing one.
 *
 * Returns `unsolvable` — with every figure NaN rather than a zero or an Infinity — when the
 * two given values cannot determine a third: a rate at or below -100% (where the factor
 * collapses), a negative price, or a rate asked for against a before-tax price of nothing,
 * which no percentage can turn into anything.
 */
export function solveSalesTax(input: SalesTaxSolveInput): SalesTaxSolution {
  const unknown = unknownOf(input);
  if (!unknown) return NO_SOLUTION('afterTax');

  const given = [input.beforeTax, input.ratePct, input.afterTax].filter((v): v is number => v !== null);
  if (given.some((v) => !Number.isFinite(v))) return NO_SOLUTION(unknown);

  switch (unknown) {
    case 'afterTax': {
      const beforeTax = input.beforeTax as number;
      const ratePct = input.ratePct as number;
      if (beforeTax < 0 || ratePct <= -100) return NO_SOLUTION(unknown);
      const r = addSalesTax(beforeTax, ratePct);
      return { beforeTax, ratePct, taxAmount: r.tax, afterTax: r.gross, solvedFor: unknown, unsolvable: false };
    }
    case 'beforeTax': {
      const afterTax = input.afterTax as number;
      const ratePct = input.ratePct as number;
      if (afterTax < 0 || ratePct <= -100) return NO_SOLUTION(unknown);
      const r = removeSalesTax(afterTax, ratePct);
      return { beforeTax: r.net, ratePct, taxAmount: r.tax, afterTax, solvedFor: unknown, unsolvable: false };
    }
    case 'ratePct': {
      const beforeTax = input.beforeTax as number;
      const afterTax = input.afterTax as number;
      // A rate is a proportion OF the before-tax price, so there has to be one.
      if (beforeTax <= 0 || afterTax < 0) return NO_SOLUTION(unknown);
      const taxAmount = afterTax - beforeTax;
      return {
        beforeTax,
        ratePct: (taxAmount / beforeTax) * 100,
        taxAmount,
        afterTax,
        solvedFor: unknown,
        unsolvable: false,
      };
    }
  }
}
