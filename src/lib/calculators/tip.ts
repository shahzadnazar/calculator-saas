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
