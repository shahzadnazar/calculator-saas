/**
 * US state-level general sales-tax rates, for the Auto Loan calculator's
 * "Your State" convenience selector.
 *
 * WHAT THIS IS: each state's STATEWIDE BASE sales-tax rate, as a percent. Picking a
 * state writes its rate into the Sales Tax field, which stays editable and remains
 * the figure the calculation actually uses. The selector is a starting point, never
 * an authority.
 *
 * WHAT THIS IS NOT: it is not a vehicle-tax lookup. Two things routinely make the
 * real number different, and the UI says so:
 *   • LOCAL taxes. County/city rates stack on top in most states, and in several
 *     (LA, AL, CO, OK) the local portion is larger than the state portion.
 *   • VEHICLE-SPECIFIC rules. Some states tax cars under a separate regime entirely
 *     — North Carolina charges a Highway Use Tax rather than sales tax, Virginia has
 *     its own motor-vehicle rate, and several states cap or exempt part of the price.
 *     A few also credit trade-in value against the taxable amount; this calculator
 *     deliberately does not model that (see the tax note in the island).
 *
 * Because of both, a visitor who knows their real rate should type it. The states
 * with a 0% base rate are the five with no statewide sales tax at all.
 *
 * REVIEW: rates are the statewide base as commonly published for 2026 and should be
 * re-checked against a primary source (each state's revenue department) before
 * launch, and annually after that.
 */

export interface StateTaxRate {
  /** USPS code — the option value, and a stable key. */
  readonly code: string;
  readonly name: string;
  /** Statewide base sales-tax rate, percent. */
  readonly ratePct: number;
}

/** The date the table above was last reviewed, shown beside the selector. */
export const STATE_TAX_REVIEWED = '2026-08';

/** Alphabetical by name — the order the selector renders. */
export const STATE_SALES_TAX: readonly StateTaxRate[] = [
  { code: 'AL', name: 'Alabama', ratePct: 4 },
  { code: 'AK', name: 'Alaska', ratePct: 0 },
  { code: 'AZ', name: 'Arizona', ratePct: 5.6 },
  { code: 'AR', name: 'Arkansas', ratePct: 6.5 },
  { code: 'CA', name: 'California', ratePct: 7.25 },
  { code: 'CO', name: 'Colorado', ratePct: 2.9 },
  { code: 'CT', name: 'Connecticut', ratePct: 6.35 },
  { code: 'DE', name: 'Delaware', ratePct: 0 },
  { code: 'DC', name: 'District of Columbia', ratePct: 6 },
  { code: 'FL', name: 'Florida', ratePct: 6 },
  { code: 'GA', name: 'Georgia', ratePct: 4 },
  { code: 'HI', name: 'Hawaii', ratePct: 4 },
  { code: 'ID', name: 'Idaho', ratePct: 6 },
  { code: 'IL', name: 'Illinois', ratePct: 6.25 },
  { code: 'IN', name: 'Indiana', ratePct: 7 },
  { code: 'IA', name: 'Iowa', ratePct: 6 },
  { code: 'KS', name: 'Kansas', ratePct: 6.5 },
  { code: 'KY', name: 'Kentucky', ratePct: 6 },
  { code: 'LA', name: 'Louisiana', ratePct: 5 },
  { code: 'ME', name: 'Maine', ratePct: 5.5 },
  { code: 'MD', name: 'Maryland', ratePct: 6 },
  { code: 'MA', name: 'Massachusetts', ratePct: 6.25 },
  { code: 'MI', name: 'Michigan', ratePct: 6 },
  { code: 'MN', name: 'Minnesota', ratePct: 6.875 },
  { code: 'MS', name: 'Mississippi', ratePct: 7 },
  { code: 'MO', name: 'Missouri', ratePct: 4.225 },
  { code: 'MT', name: 'Montana', ratePct: 0 },
  { code: 'NE', name: 'Nebraska', ratePct: 5.5 },
  { code: 'NV', name: 'Nevada', ratePct: 6.85 },
  { code: 'NH', name: 'New Hampshire', ratePct: 0 },
  { code: 'NJ', name: 'New Jersey', ratePct: 6.625 },
  { code: 'NM', name: 'New Mexico', ratePct: 4.875 },
  { code: 'NY', name: 'New York', ratePct: 4 },
  { code: 'NC', name: 'North Carolina', ratePct: 4.75 },
  { code: 'ND', name: 'North Dakota', ratePct: 5 },
  { code: 'OH', name: 'Ohio', ratePct: 5.75 },
  { code: 'OK', name: 'Oklahoma', ratePct: 4.5 },
  { code: 'OR', name: 'Oregon', ratePct: 0 },
  { code: 'PA', name: 'Pennsylvania', ratePct: 6 },
  { code: 'RI', name: 'Rhode Island', ratePct: 7 },
  { code: 'SC', name: 'South Carolina', ratePct: 6 },
  { code: 'SD', name: 'South Dakota', ratePct: 4.2 },
  { code: 'TN', name: 'Tennessee', ratePct: 7 },
  { code: 'TX', name: 'Texas', ratePct: 6.25 },
  { code: 'UT', name: 'Utah', ratePct: 6.1 },
  { code: 'VT', name: 'Vermont', ratePct: 6 },
  { code: 'VA', name: 'Virginia', ratePct: 5.3 },
  { code: 'WA', name: 'Washington', ratePct: 6.5 },
  { code: 'WV', name: 'West Virginia', ratePct: 6 },
  { code: 'WI', name: 'Wisconsin', ratePct: 5 },
  { code: 'WY', name: 'Wyoming', ratePct: 4 },
] as const;

/** The rate for a USPS code, or null when the code is unknown or blank. */
export function stateTaxRate(code: string): number | null {
  const found = STATE_SALES_TAX.find((s) => s.code === code.trim().toUpperCase());
  return found ? found.ratePct : null;
}
