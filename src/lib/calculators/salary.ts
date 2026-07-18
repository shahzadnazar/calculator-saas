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
