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
