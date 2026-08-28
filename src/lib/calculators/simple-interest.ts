/**
 * Simple interest — I = P · r · t, solved for whichever term you are missing.
 * Pure and unit-tested.
 *
 * Simple interest is the one formula where every variable is as easy to solve for as
 * any other, because nothing compounds: the relationship is linear. So rather than
 * four calculators, this is one formula rearranged four ways, and the mode says which
 * of the four is the unknown.
 *
 * UNITS are the part that actually goes wrong. A rate quoted per month against a term
 * given in years is a real combination, and multiplying them as they stand is off by a
 * factor of twelve. Both are normalised to years before anything is computed, and the
 * answer is converted back into whatever unit the visitor asked for.
 */

/** Which of the four variables the calculator is solving for. */
export type SimpleSolveFor = 'balance' | 'principal' | 'term' | 'rate';
/** The period a rate is quoted per, and the period a term is counted in. */
export type TimeUnit = 'year' | 'month' | 'week' | 'day';

/** How many of each unit make a year. Weeks are the conventional 52, days 365. */
export const UNITS_PER_YEAR: Readonly<Record<TimeUnit, number>> = {
  year: 1,
  month: 12,
  week: 52,
  day: 365,
};

export const TIME_UNITS: readonly TimeUnit[] = ['year', 'month', 'week', 'day'];

export function isTimeUnit(value: string): value is TimeUnit {
  return (TIME_UNITS as readonly string[]).includes(value);
}

/** A term this long is not a plan, and it bounds the schedule. */
export const MAX_TERM_YEARS = 100;

export interface SimpleInterestInput {
  solveFor: SimpleSolveFor;
  /** Ignored when solving for it. */
  principal: number;
  /** Ignored when solving for it. */
  endBalance: number;
  /** The rate as quoted, per `rateUnit`. Ignored when solving for it. */
  ratePerUnitPct: number;
  rateUnit: TimeUnit;
  /** The term as entered, counted in `termUnit`. Ignored when solving for it. */
  term: number;
  termUnit: TimeUnit;
}

/** One year of the schedule. A short final year covers only the months it has. */
export interface SimpleInterestYear {
  year: number;
  interest: number;
  balance: number;
}

export interface SimpleInterestResult {
  principal: number;
  endBalance: number;
  interest: number;
  /** The rate normalised to a year, as a percent. */
  annualRatePct: number;
  /** The term normalised to years. */
  termYears: number;
  /**
   * The value solved for, expressed in the visitor's own unit — a term in months if
   * that is what they chose, a rate per month if that is how they quoted it.
   */
  solved: number;
  /** Year by year. Empty when the term rounds to nothing. */
  schedule: SimpleInterestYear[];
  /** True when the inputs describe no answer at all (see `solve`). */
  unsolvable: boolean;
}

const FAIL: Omit<SimpleInterestResult, 'schedule'> & { schedule: SimpleInterestYear[] } = {
  principal: Number.NaN,
  endBalance: Number.NaN,
  interest: Number.NaN,
  annualRatePct: Number.NaN,
  termYears: Number.NaN,
  solved: Number.NaN,
  schedule: [],
  unsolvable: true,
};

/**
 * The schedule: one row per whole year, plus a short final row when the term does not
 * land on a year boundary. Interest accrues at a flat P · r per year — that is what
 * makes it simple — so the balance climbs in a straight line.
 */
function buildSchedule(principal: number, annualRatePct: number, termYears: number): SimpleInterestYear[] {
  const perYear = principal * (annualRatePct / 100);
  const whole = Math.floor(termYears + 1e-9);
  const rows: SimpleInterestYear[] = [];
  for (let y = 1; y <= whole; y++) {
    rows.push({ year: y, interest: perYear, balance: principal + perYear * y });
  }
  const remainder = termYears - whole;
  if (remainder > 1e-9) {
    rows.push({
      year: whole + 1,
      interest: perYear * remainder,
      balance: principal + perYear * termYears,
    });
  }
  return rows;
}

/**
 * Solve for whichever variable the mode names.
 *
 * Returns `unsolvable` rather than a misleading number when the inputs describe no
 * answer: a term or rate solved from an end balance below the principal would be
 * negative, and a zero rate or zero term leaves the other one undetermined — every
 * value would satisfy it.
 */
export function solveSimpleInterest(input: SimpleInterestInput): SimpleInterestResult {
  const rateUnits = UNITS_PER_YEAR[input.rateUnit] ?? 1;
  const termUnits = UNITS_PER_YEAR[input.termUnit] ?? 1;

  let principal = input.principal;
  let endBalance = input.endBalance;
  let annualRatePct = input.ratePerUnitPct * rateUnits;
  let termYears = input.term / termUnits;
  let solved: number;

  switch (input.solveFor) {
    case 'balance': {
      if (![principal, annualRatePct, termYears].every(Number.isFinite)) return { ...FAIL };
      if (principal < 0 || termYears < 0) return { ...FAIL };
      endBalance = principal * (1 + (annualRatePct / 100) * termYears);
      solved = endBalance;
      break;
    }
    case 'principal': {
      if (![endBalance, annualRatePct, termYears].every(Number.isFinite)) return { ...FAIL };
      const growth = 1 + (annualRatePct / 100) * termYears;
      // A growth factor of zero or less means no positive principal reaches the balance.
      if (!(growth > 0) || endBalance < 0 || termYears < 0) return { ...FAIL };
      principal = endBalance / growth;
      solved = principal;
      break;
    }
    case 'term': {
      if (![principal, endBalance, annualRatePct].every(Number.isFinite)) return { ...FAIL };
      // With no rate, no term ever reaches a higher balance — and if the balance
      // already equals the principal, EVERY term does.
      if (!(principal > 0) || annualRatePct === 0) return { ...FAIL };
      termYears = (endBalance / principal - 1) / (annualRatePct / 100);
      if (!Number.isFinite(termYears) || termYears < 0 || termYears > MAX_TERM_YEARS) {
        return { ...FAIL };
      }
      solved = termYears * termUnits;
      break;
    }
    case 'rate': {
      if (![principal, endBalance, termYears].every(Number.isFinite)) return { ...FAIL };
      // With no term, no rate gets anywhere — and at the principal, every rate does.
      if (!(principal > 0) || !(termYears > 0)) return { ...FAIL };
      annualRatePct = (endBalance / principal - 1) / termYears * 100;
      if (!Number.isFinite(annualRatePct) || annualRatePct < 0) return { ...FAIL };
      solved = annualRatePct / rateUnits;
      break;
    }
  }

  if (!Number.isFinite(principal) || !Number.isFinite(endBalance)) return { ...FAIL };
  if (termYears > MAX_TERM_YEARS) return { ...FAIL };

  return {
    principal,
    endBalance,
    interest: endBalance - principal,
    annualRatePct,
    termYears,
    solved,
    schedule: buildSchedule(principal, annualRatePct, termYears),
    unsolvable: false,
  };
}

/**
 * The classic form, kept for callers that only ever want the forward calculation.
 * `I = P · r · t` with the rate and term already in years.
 */
export function calculateSimpleInterest(principal: number, annualRatePct: number, years: number) {
  const p = Math.max(0, principal);
  const interest = p * (annualRatePct / 100) * years;
  return { interest, total: p + interest };
}
