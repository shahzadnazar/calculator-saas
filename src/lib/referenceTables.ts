/**
 * Single source of truth for the reference-table DATA (headers + formatted
 * rows), computed from this site's unit-tested calculator functions.
 *
 * Both the full /reference/<slug> pages and the chrome-less /embed/reference/
 * <slug> pages render from this, so an embedded table can never drift from the
 * canonical one. Presentation lives in components/DataTable.astro.
 */
import { loanPayment } from '@lib/calculators/payment';
import { calculateCompoundInterest } from '@lib/calculators/compound-interest';
import { classifyBmi } from '@lib/calculators/bmi';
import { convertSalary } from '@lib/calculators/salary';
import { adjustForInflation } from '@lib/calculators/inflation';
import { calculateIdealWeight } from '@lib/calculators/ideal-weight';
import { calculateTargetHeartRate } from '@lib/calculators/target-heart-rate';
import { calculateTip } from '@lib/calculators/tip';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';

export interface ReferenceTableData {
  headers: string[];
  /** Pre-formatted cell strings, row by row. */
  rows: string[][];
  /** Max width for the table block (wide tables scroll on mobile). */
  maxWidth: string;
}

const CM_PER_IN = 2.54;
const LB_PER_KG = 2.2046226218;

export function getReferenceTable(slug: string): ReferenceTableData | null {
  switch (slug) {
    case 'mortgage-payment-table': {
      const rates = Array.from({ length: 21 }, (_, i) => 3 + i * 0.25);
      const terms = [10, 15, 20, 30];
      return {
        maxWidth: '62rem',
        headers: ['Interest rate', ...terms.map((y) => `${y}-year`)],
        rows: rates.map((rate) => [
          `${rate.toFixed(2)}%`,
          ...terms.map((y) => formatCurrency(loanPayment(100_000, rate, y * 12))),
        ]),
      };
    }
    case 'loan-payment-table': {
      const rates = Array.from({ length: 12 }, (_, i) => 4 + i);
      const months = [12, 24, 36, 48, 60, 72];
      return {
        maxWidth: '62rem',
        headers: ['Interest rate', ...months.map((m) => `${m} mo`)],
        rows: rates.map((rate) => [`${rate}%`, ...months.map((m) => formatCurrency(loanPayment(1_000, rate, m)))]),
      };
    }
    case 'savings-growth-table': {
      const yearsList = [5, 10, 15, 20, 25, 30, 40];
      const rates = [2, 4, 6, 8, 10];
      return {
        maxWidth: '60rem',
        headers: ['Years', ...rates.map((r) => `${r}% return`)],
        rows: yearsList.map((years) => [
          String(years),
          ...rates.map((rate) =>
            formatCurrencyRounded(
              calculateCompoundInterest({ principal: 10_000, annualRatePct: rate, years, compoundsPerYear: 1 })
                .futureValue,
            ),
          ),
        ]),
      };
    }
    case 'monthly-investment-table': {
      const monthly = [100, 200, 300, 500, 1000, 2000];
      const yearsList = [10, 20, 30, 40];
      return {
        maxWidth: '56rem',
        headers: ['Invested / month', ...yearsList.map((y) => `${y} years`)],
        rows: monthly.map((m) => [
          formatCurrencyRounded(m),
          ...yearsList.map((years) =>
            formatCurrencyRounded(
              calculateCompoundInterest({ principal: 0, annualRatePct: 7, years, compoundsPerYear: 12, contribution: m })
                .futureValue,
            ),
          ),
        ]),
      };
    }
    case 'salary-conversion-table': {
      const salaries = [20_000, 30_000, 40_000, 50_000, 60_000, 75_000, 100_000, 150_000, 200_000];
      return {
        maxWidth: '60rem',
        headers: ['Annual', 'Hourly', 'Weekly', 'Biweekly', 'Monthly'],
        rows: salaries.map((annual) => {
          const r = convertSalary({ amount: annual, unit: 'annual', hoursPerWeek: 40, daysPerWeek: 5, weeksPerYear: 52 });
          return [
            formatCurrencyRounded(annual),
            formatCurrency(r.hourly),
            formatCurrency(r.weekly),
            formatCurrency(r.biweekly),
            formatCurrency(r.monthly),
          ];
        }),
      };
    }
    case 'inflation-purchasing-power-table': {
      const yearsList = [5, 10, 15, 20, 25, 30, 40, 50];
      const rates = [2, 3, 4, 5];
      return {
        maxWidth: '52rem',
        headers: ['Years', ...rates.map((r) => `${r}% inflation`)],
        rows: yearsList.map((years) => [
          String(years),
          ...rates.map((rate) => formatCurrency(adjustForInflation({ amount: 100, annualRatePct: rate, years }).buyingPower)),
        ]),
      };
    }
    case 'ideal-weight-table': {
      const range = (sex: 'male' | 'female', ft: number, inch: number) => {
        const r = calculateIdealWeight({ sex, system: 'imperial', heightFt: ft, heightIn: inch });
        const vals = [r.robinson, r.miller, r.devine, r.hamwi];
        return `${Math.round(Math.min(...vals))}–${Math.round(Math.max(...vals))} lb`;
      };
      return {
        maxWidth: '48rem',
        headers: ['Height', 'Men', 'Women'],
        rows: Array.from({ length: 19 }, (_, i) => {
          const inches = 60 + i;
          const ft = Math.floor(inches / 12);
          const inch = inches % 12;
          const cm = Math.round(inches * CM_PER_IN);
          return [`${ft}′${inch}″ (${cm} cm)`, range('male', ft, inch), range('female', ft, inch)];
        }),
      };
    }
    case 'bmi-chart': {
      const weightLbAtBmi = (bmi: number, heightM: number) => Math.round(bmi * heightM * heightM * LB_PER_KG);
      return {
        maxWidth: '56rem',
        headers: ['Height', 'Healthy (18.5–24.9)', 'Overweight (25–29.9)', 'Obese (30+)'],
        rows: Array.from({ length: 21 }, (_, i) => {
          const inches = 58 + i;
          const ft = Math.floor(inches / 12);
          const inch = inches % 12;
          const cm = Math.round(inches * CM_PER_IN);
          const heightM = (inches * CM_PER_IN) / 100;
          const low = weightLbAtBmi(18.5, heightM);
          const mid = weightLbAtBmi(25, heightM);
          const high = weightLbAtBmi(30, heightM);
          return [`${ft}′${inch}″ (${cm} cm)`, `${low}–${mid} lb`, `${mid}–${high} lb`, `${high}+ lb`];
        }),
      };
    }
    case 'target-heart-rate-table': {
      const ages = Array.from({ length: 11 }, (_, i) => 20 + i * 5);
      return {
        maxWidth: '56rem',
        headers: ['Age', 'Max HR', 'Fat burn (60–70%)', 'Aerobic (70–80%)', 'Anaerobic (80–90%)'],
        rows: ages.map((age) => {
          const r = calculateTargetHeartRate(age);
          const z = (i: number) => `${r.zones[i].low}–${r.zones[i].high}`;
          return [String(age), `${r.maxHr} bpm`, z(1), z(2), z(3)];
        }),
      };
    }
    case 'tip-table': {
      const bills = [10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200];
      const pcts = [15, 18, 20, 25];
      return {
        maxWidth: '48rem',
        headers: ['Bill', ...pcts.map((p) => `${p}%`)],
        rows: bills.map((bill) => [
          formatCurrencyRounded(bill),
          ...pcts.map((tipPct) => formatCurrency(calculateTip({ bill, tipPct, people: 1 }).tipAmount)),
        ]),
      };
    }
    default:
      return null;
  }
}

// Build-time sanity: the BMI chart thresholds must match the site's classifier.
export const BMI_THRESHOLDS_CONSISTENT =
  classifyBmi(18.5).category === 'Normal weight' &&
  classifyBmi(25).category === 'Overweight' &&
  classifyBmi(30).category === 'Obesity';
