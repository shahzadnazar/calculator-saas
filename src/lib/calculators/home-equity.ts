/**
 * Home equity: how much a lender's loan-to-value cap leaves you room to borrow.
 * Pure and unit-tested.
 *
 * This is the SECOND of the two questions a home-equity borrower has. The first —
 * what a given loan costs — is an ordinary amortizing loan, so it runs on the shared
 * `calculateAmortization` rather than on a formula of its own. What is specific to
 * home equity is this: a lender will let the mortgage and the new loan TOGETHER reach
 * some fraction of the home's value, and what is left under that ceiling is what you
 * can borrow.
 */

export interface BorrowingPowerInput {
  homeValue: number;
  mortgageBalance: number;
  /** The combined loan-to-value the lender will go up to, e.g. 80. */
  maxLtvPct: number;
}

export interface BorrowingPowerResult {
  /** Value minus what is still owed — never negative. */
  equity: number;
  /** Room left under the lender's cap. Zero when the mortgage already fills it. */
  maxBorrow: number;
  /** What the existing mortgage alone is, as a percentage of the home's value. */
  currentLtvPct: number;
  /** The mortgage already meets or exceeds the cap, so there is nothing to lend. */
  atCap: boolean;
}

export function calculateBorrowingPower(input: BorrowingPowerInput): BorrowingPowerResult {
  const value = Math.max(0, input.homeValue);
  const owed = Math.max(0, input.mortgageBalance);
  const cap = Math.max(0, input.maxLtvPct);

  const ceiling = value * (cap / 100);
  const maxBorrow = Math.max(0, ceiling - owed);
  return {
    equity: Math.max(0, value - owed),
    maxBorrow,
    currentLtvPct: value > 0 ? (owed / value) * 100 : 0,
    // A hair of tolerance so a cap the mortgage lands exactly on reads as full
    // rather than as a fraction of a cent of headroom.
    atCap: maxBorrow <= 0.005,
  };
}
