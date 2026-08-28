/**
 * Convert a pay figure between hourly, daily, weekly, biweekly, monthly and
 * annual. Pure and unit-tested.
 */

export type PayUnit = 'hourly' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annual';

export interface SalaryInput {
  amount: number;
  unit: PayUnit;
  hoursPerWeek: number;
  daysPerWeek: number;
  weeksPerYear: number;
}

export interface SalaryResult {
  hourly: number;
  daily: number;
  weekly: number;
  biweekly: number;
  monthly: number;
  annual: number;
}

export function convertSalary(input: SalaryInput): SalaryResult {
  const amt = input.amount || 0;
  const hpw = input.hoursPerWeek || 0;
  const dpw = input.daysPerWeek || 0;
  const wpy = input.weeksPerYear || 0;

  // Normalise everything to an annual figure first.
  let annual: number;
  switch (input.unit) {
    case 'hourly': annual = amt * hpw * wpy; break;
    case 'daily': annual = amt * dpw * wpy; break;
    case 'weekly': annual = amt * wpy; break;
    case 'biweekly': annual = amt * 26; break;
    case 'monthly': annual = amt * 12; break;
    case 'annual': annual = amt; break;
  }

  const weekly = wpy > 0 ? annual / wpy : 0;
  return {
    annual,
    monthly: annual / 12,
    biweekly: annual / 26,
    weekly,
    daily: dpw > 0 ? weekly / dpw : 0,
    hourly: hpw > 0 ? weekly / hpw : 0,
  };
}

/* ------------------------------------------------------------------ */
/* The pay-schedule table: every frequency, unadjusted and adjusted    */
/* ------------------------------------------------------------------ */

/**
 * The eight pay frequencies the schedule table reports, and the two ways to read each:
 * ignoring time off, and spreading the same work over the year's paid days.
 *
 * The model has one asymmetry worth stating plainly, because it is the whole point of the
 * two columns. An hourly or daily figure is what you are paid for time actually worked, so
 * it is UNADJUSTED — taking a day off simply means no pay for it. Every longer frequency
 * (a weekly wage, a monthly salary) is what you receive whether or not that period
 * contained a holiday, so it is ADJUSTED — the time off is already priced in.
 *
 * `convertSalary` above is a different, simpler question and is left alone: it is frozen by
 * salary.test.ts and feeds the salary-conversion reference table.
 */
export type PayFrequency =
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'
  | 'quarterly'
  | 'annual';

/** Working weeks in a year, the convention this table is built on. */
export const WEEKS_PER_YEAR = 52;

/** How many times a year each frequency pays out. Hourly and daily depend on the schedule. */
export const PERIODS_PER_YEAR = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  quarterly: 4,
  annual: 1,
} as const;

/** Frequencies paid for time actually worked. */
export type RateFrequency = 'hourly' | 'daily';
/** Frequencies that pay out a fixed number of times a year regardless of time off. */
export type SalaryFrequency = keyof typeof PERIODS_PER_YEAR;

/** True when the entered figure is pay for time worked rather than a salary covering time off. */
export function isUnadjustedFrequency(f: PayFrequency): f is RateFrequency {
  return f === 'hourly' || f === 'daily';
}

export interface PayScheduleInput {
  amount: number;
  frequency: PayFrequency;
  hoursPerWeek: number;
  daysPerWeek: number;
  holidaysPerYear: number;
  vacationDaysPerYear: number;
}

/** One column of the table: the same pay read at all eight frequencies. */
export interface PayColumn {
  hourly: number;
  daily: number;
  weekly: number;
  biweekly: number;
  semimonthly: number;
  monthly: number;
  quarterly: number;
  annual: number;
}

export interface PayScheduleResult {
  unadjusted: PayColumn;
  adjusted: PayColumn;
  /** Weekdays in the year: weeks × days per week. */
  workDaysPerYear: number;
  /** Those weekdays less holidays and vacation — the days actually worked. */
  paidDaysPerYear: number;
  hoursPerDay: number;
  /** True when the inputs describe no workable year at all, so there is nothing to report. */
  unsolvable: boolean;
}

const NO_COLUMN: PayColumn = {
  hourly: Number.NaN,
  daily: Number.NaN,
  weekly: Number.NaN,
  biweekly: Number.NaN,
  semimonthly: Number.NaN,
  monthly: Number.NaN,
  quarterly: Number.NaN,
  annual: Number.NaN,
};

/**
 * Spread an annual total across the frequencies.
 *
 * Both columns divide by the SAME weekday count for the daily and hourly rows. That is
 * deliberate: the adjusted daily rate answers "what does a day of the year earn me on
 * average", which only means something spread over every weekday, not only the worked
 * ones. Dividing by the worked days instead would just hand back the unadjusted rate.
 */
function spread(annual: number, workDaysPerYear: number, hoursPerDay: number): PayColumn {
  const daily = annual / workDaysPerYear;
  return {
    annual,
    quarterly: annual / PERIODS_PER_YEAR.quarterly,
    monthly: annual / PERIODS_PER_YEAR.monthly,
    semimonthly: annual / PERIODS_PER_YEAR.semimonthly,
    biweekly: annual / PERIODS_PER_YEAR.biweekly,
    weekly: annual / PERIODS_PER_YEAR.weekly,
    daily,
    hourly: daily / hoursPerDay,
  };
}

/**
 * Build the whole table from any one entered figure.
 *
 * Returns `unsolvable` with no figures rather than a zero or an Infinity when the inputs
 * describe an impossible year — a non-finite entry, a schedule with no hours or days in
 * it, or more holidays and vacation than there are weekdays to take them from.
 */
export function computePaySchedule(input: PayScheduleInput): PayScheduleResult {
  const { amount, frequency, hoursPerWeek, daysPerWeek, holidaysPerYear, vacationDaysPerYear } = input;
  const nothing = (workDays: number, paidDays: number, hoursPerDay: number): PayScheduleResult => ({
    unadjusted: NO_COLUMN,
    adjusted: NO_COLUMN,
    workDaysPerYear: workDays,
    paidDaysPerYear: paidDays,
    hoursPerDay,
    unsolvable: true,
  });

  const finite = [amount, hoursPerWeek, daysPerWeek, holidaysPerYear, vacationDaysPerYear].every((n) =>
    Number.isFinite(n),
  );
  if (!finite || !(hoursPerWeek > 0) || !(daysPerWeek > 0)) {
    return nothing(Number.NaN, Number.NaN, Number.NaN);
  }

  const workDaysPerYear = WEEKS_PER_YEAR * daysPerWeek;
  const hoursPerDay = hoursPerWeek / daysPerWeek;
  const paidDaysPerYear = workDaysPerYear - holidaysPerYear - vacationDaysPerYear;

  // A year with nothing left to work cannot price an adjusted salary back into a rate.
  if (!(paidDaysPerYear > 0)) return nothing(workDaysPerYear, paidDaysPerYear, hoursPerDay);

  let annualUnadjusted: number;
  let annualAdjusted: number;
  if (isUnadjustedFrequency(frequency)) {
    const dailyRate = frequency === 'hourly' ? amount * hoursPerDay : amount;
    annualUnadjusted = dailyRate * workDaysPerYear;
    annualAdjusted = dailyRate * paidDaysPerYear;
  } else {
    annualAdjusted = amount * PERIODS_PER_YEAR[frequency];
    const dailyRate = annualAdjusted / paidDaysPerYear;
    annualUnadjusted = dailyRate * workDaysPerYear;
  }

  return {
    unadjusted: spread(annualUnadjusted, workDaysPerYear, hoursPerDay),
    adjusted: spread(annualAdjusted, workDaysPerYear, hoursPerDay),
    workDaysPerYear,
    paidDaysPerYear,
    hoursPerDay,
    unsolvable: false,
  };
}
