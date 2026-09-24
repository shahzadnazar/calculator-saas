/**
 * Tip calculator: tip amount, grand total, and per-person split.
 * Pure and unit-tested.
 */
export interface TipInput {
  bill: number;
  tipPct: number;
  people: number;
}

export interface TipResult {
  tipAmount: number;
  total: number;
  perPersonTip: number;
  perPersonTotal: number;
}

export function calculateTip(input: TipInput): TipResult {
  const bill = Math.max(0, input.bill || 0);
  const tipAmount = bill * ((input.tipPct || 0) / 100);
  const total = bill + tipAmount;
  const people = Math.max(1, Math.floor(input.people || 1));
  return {
    tipAmount,
    total,
    perPersonTip: tipAmount / people,
    perPersonTotal: total / people,
  };
}

/* ------------------------------------------------------------------ */
/* The tip table                                                       */
/* ------------------------------------------------------------------ */

/**
 * The percentages the reference lays out, from a token tip to a generous one. They are not
 * evenly spaced on purpose: the cluster from 12% to 20% is where nearly every real decision
 * happens, so it gets the resolution, while 5% and 50% mark the ends of the range.
 */
export const TIP_PERCENTAGES = [5, 10, 12, 14, 15, 18, 20, 25, 30, 50] as const;

/** The rate customarily expected in the U.S. on a before-tax bill. */
export const CUSTOMARY_TIP_PCT = 15;

export interface TipTableRow {
  tipPct: number;
  tipAmount: number;
  total: number;
  /** True for the customary rate, which the table calls out. */
  customary: boolean;
}

/**
 * Every percentage against one price, so the whole decision is on screen at once rather than
 * being retyped one rate at a time. Returns an empty table for a price that is not a real,
 * non-negative number, so a caller never renders a row of NaN.
 */
export function tipTable(price: number): TipTableRow[] {
  if (!Number.isFinite(price) || price < 0) return [];
  return TIP_PERCENTAGES.map((tipPct) => {
    const tipAmount = price * (tipPct / 100);
    return { tipPct, tipAmount, total: price + tipAmount, customary: tipPct === CUSTOMARY_TIP_PCT };
  });
}
