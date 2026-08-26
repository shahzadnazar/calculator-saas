import { describe, it, expect } from 'vitest';
import { isResultUsable, type FormCalculatorBinding } from '@lib/result/form-runtime';

import { amortizationBinding, AMORTIZATION_EXAMPLE_VALUES } from './amortization-form';
import { areaBinding, AREA_EXAMPLE_VALUES } from './area-form';
import { autoLoanBinding, AUTO_LOAN_EXAMPLE_VALUES } from './auto-loan-form';
import { bmiBinding, BMI_EXAMPLE_VALUES } from './bmi-form';
import { bmrBinding, BMR_EXAMPLE_VALUES } from './bmr-form';
import { bodyFatBinding, BODY_FAT_EXAMPLE_VALUES } from './body-fat-form';
import { calorieBinding, CALORIE_EXAMPLE_VALUES } from './calorie-form';
import { compoundInterestBinding, COMPOUND_EXAMPLE_VALUES } from './compound-interest-form';
import { concreteBinding, CONCRETE_EXAMPLE_VALUES } from './concrete-form';
import { conversionBinding, CONVERSION_EXAMPLE_VALUES } from './conversion-form';
import { creditCardBinding, CREDIT_CARD_EXAMPLE_VALUES } from './credit-card-form';
import { fatIntakeBinding, FAT_INTAKE_EXAMPLE_VALUES } from './fat-intake-form';
import { fractionBinding, FRACTION_EXAMPLE_VALUES } from './fraction-form';
import { gpaBinding, GPA_EXAMPLE_VALUES } from './gpa-form';
import { gradeBinding, GRADE_EXAMPLE_VALUES } from './grade-form';
import { homeEquityBinding, HOME_EQUITY_EXAMPLE_VALUES } from './home-equity-loan-form';
import { hoursBinding, HOURS_EXAMPLE_VALUES } from './hours-form';
import { idealWeightBinding, IDEAL_WEIGHT_EXAMPLE_VALUES } from './ideal-weight-form';
import { incomeTaxBinding, INCOME_TAX_EXAMPLE_VALUES } from './income-tax-form';
import { inflationBinding, INFLATION_EXAMPLE_VALUES } from './inflation-form';
import { interestBinding, INTEREST_EXAMPLE_VALUES } from './interest-form';
import { interestRateBinding, INTEREST_RATE_EXAMPLE_VALUES } from './interest-rate-form';
import { investmentBinding, INVESTMENT_EXAMPLE_VALUES } from './investment-form';
import { loanBinding, LOAN_EXAMPLE_VALUES } from './loan-form';
import { mortgageBinding, MORTGAGE_EXAMPLE_VALUES } from './mortgage-form';
import { paceBinding, PACE_EXAMPLE_VALUES } from './pace-form';
import { paymentBinding, PAYMENT_EXAMPLE_VALUES } from './payment-form';
import { proteinBinding, PROTEIN_EXAMPLE_VALUES } from './protein-form';
import { retirementBinding, RETIREMENT_EXAMPLE_VALUES } from './retirement-form';
import { salaryBinding, SALARY_EXAMPLE_VALUES } from './salary-form';
import { salesTaxBinding, SALES_TAX_EXAMPLE_VALUES } from './sales-tax-form';
import { savingsBinding, SAVINGS_EXAMPLE_VALUES } from './savings-form';
import { simpleInterestBinding, SIMPLE_INTEREST_EXAMPLE_VALUES } from './simple-interest-form';
import { squareFootageBinding, SQUARE_FOOTAGE_EXAMPLE_VALUES } from './square-footage-form';
import { statisticsBinding, STATISTICS_EXAMPLE_VALUES } from './statistics-form';
import { targetHeartRateBinding, TARGET_HEART_RATE_EXAMPLE_VALUES } from './target-heart-rate-form';
import { timeBinding, TIME_EXAMPLE_VALUES } from './time-form';
import { tipBinding, TIP_EXAMPLE_VALUES } from './tip-form';
import { triangleBinding, TRIANGLE_EXAMPLE_VALUES } from './triangle-form';
import { volumeBinding, VOLUME_EXAMPLE_VALUES } from './volume-form';

import { ageBinding, ageExampleValues } from './age-form';
import { dateBinding, dateExampleValues } from './date-form';
import { dueDateBinding, dueDateExampleValues } from './due-date-form';
import { pregnancyBinding, pregnancyExampleValues } from './pregnancy-form';

/**
 * Every arrive-with-an-example calculator, in one table.
 *
 * The labelled example each calculator shows on first load is produced by the
 * shared runtime running exactly this sequence: the binding's own `validate`,
 * then `compute`, then the runtime's shared usability gate. If an example value
 * ever failed any of those, the live page would greet the visitor with a broken
 * or empty example — so the whole fleet is pinned here rather than page by page.
 *
 * Date-relative calculators contribute a FUNCTION (their example is relative to
 * today), which is why they are called at table-build time.
 */
// The bindings are deliberately heterogeneous — each has its own value/result
// types — so the table is typed at the erased boundary the runtime itself uses.
type AnyBinding = FormCalculatorBinding<unknown, unknown>;
const b = (x: unknown) => x as AnyBinding;

const FLEET: Array<[string, AnyBinding, unknown]> = [
  ['amortization', b(amortizationBinding), AMORTIZATION_EXAMPLE_VALUES],
  ['area', b(areaBinding), AREA_EXAMPLE_VALUES],
  ['auto-loan', b(autoLoanBinding), AUTO_LOAN_EXAMPLE_VALUES],
  ['bmi', b(bmiBinding), BMI_EXAMPLE_VALUES],
  ['bmr', b(bmrBinding), BMR_EXAMPLE_VALUES],
  ['body-fat', b(bodyFatBinding), BODY_FAT_EXAMPLE_VALUES],
  ['calorie', b(calorieBinding), CALORIE_EXAMPLE_VALUES],
  ['compound-interest', b(compoundInterestBinding), COMPOUND_EXAMPLE_VALUES],
  ['concrete', b(concreteBinding), CONCRETE_EXAMPLE_VALUES],
  ['conversion', b(conversionBinding), CONVERSION_EXAMPLE_VALUES],
  ['credit-card', b(creditCardBinding), CREDIT_CARD_EXAMPLE_VALUES],
  ['fat-intake', b(fatIntakeBinding), FAT_INTAKE_EXAMPLE_VALUES],
  ['fraction', b(fractionBinding), FRACTION_EXAMPLE_VALUES],
  ['gpa', b(gpaBinding), GPA_EXAMPLE_VALUES],
  ['grade', b(gradeBinding), GRADE_EXAMPLE_VALUES],
  ['home-equity', b(homeEquityBinding), HOME_EQUITY_EXAMPLE_VALUES],
  ['hours', b(hoursBinding), HOURS_EXAMPLE_VALUES],
  ['ideal-weight', b(idealWeightBinding), IDEAL_WEIGHT_EXAMPLE_VALUES],
  ['income-tax', b(incomeTaxBinding), INCOME_TAX_EXAMPLE_VALUES],
  ['inflation', b(inflationBinding), INFLATION_EXAMPLE_VALUES],
  ['interest', b(interestBinding), INTEREST_EXAMPLE_VALUES],
  ['interest-rate', b(interestRateBinding), INTEREST_RATE_EXAMPLE_VALUES],
  ['investment', b(investmentBinding), INVESTMENT_EXAMPLE_VALUES],
  ['loan', b(loanBinding), LOAN_EXAMPLE_VALUES],
  ['mortgage', b(mortgageBinding), MORTGAGE_EXAMPLE_VALUES],
  ['pace', b(paceBinding), PACE_EXAMPLE_VALUES],
  ['payment', b(paymentBinding), PAYMENT_EXAMPLE_VALUES],
  ['protein', b(proteinBinding), PROTEIN_EXAMPLE_VALUES],
  ['retirement', b(retirementBinding), RETIREMENT_EXAMPLE_VALUES],
  ['salary', b(salaryBinding), SALARY_EXAMPLE_VALUES],
  ['sales-tax', b(salesTaxBinding), SALES_TAX_EXAMPLE_VALUES],
  ['savings', b(savingsBinding), SAVINGS_EXAMPLE_VALUES],
  ['simple-interest', b(simpleInterestBinding), SIMPLE_INTEREST_EXAMPLE_VALUES],
  ['square-footage', b(squareFootageBinding), SQUARE_FOOTAGE_EXAMPLE_VALUES],
  ['statistics', b(statisticsBinding), STATISTICS_EXAMPLE_VALUES],
  ['target-heart-rate', b(targetHeartRateBinding), TARGET_HEART_RATE_EXAMPLE_VALUES],
  ['time', b(timeBinding), TIME_EXAMPLE_VALUES],
  ['tip', b(tipBinding), TIP_EXAMPLE_VALUES],
  ['triangle', b(triangleBinding), TRIANGLE_EXAMPLE_VALUES],
  ['volume', b(volumeBinding), VOLUME_EXAMPLE_VALUES],
  // Date-relative: computed against today, exactly as the island does at mount.
  ['age', b(ageBinding), ageExampleValues()],
  ['date', b(dateBinding), dateExampleValues()],
  ['due-date', b(dueDateBinding), dueDateExampleValues()],
  ['pregnancy', b(pregnancyBinding), pregnancyExampleValues()],
];

describe('fleet-wide example values', () => {
  it.each(FLEET)('%s: passes its own validation', (_name, binding, values) => {
    expect(binding.validate(values)).toEqual({ ok: true });
  });

  it.each(FLEET)('%s: computes a result the runtime gate accepts', (_name, binding, values) => {
    const result = binding.compute(values);
    expect(isResultUsable(binding, result)).toBe(true);
  });

  it.each(FLEET)('%s: never yields NaN or Infinity as its primary value', (_name, binding, values) => {
    const value = binding.resultValue(binding.compute(values));
    // A binding may deliberately widen the gate to a non-numeric informational
    // result (Payment's "Never"); those are covered by the gate test above.
    if (!binding.isUsableResult) expect(Number.isFinite(value)).toBe(true);
  });

  it('covers every calculator that opts into an example', () => {
    expect(FLEET).toHaveLength(44);
    expect(new Set(FLEET.map(([n]) => n)).size).toBe(FLEET.length); // no duplicates
  });
});
