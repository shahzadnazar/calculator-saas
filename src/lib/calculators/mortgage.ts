/**
 * Mortgage math: monthly payment (PITI), amortization schedule and PMI.
 * Pure and unit-tested. Uses the standard fixed-rate amortization formula.
 */

export interface MortgageInput {
  homePrice: number;
  downPayment: number; // absolute currency amount
  loanTermYears: number;
  annualInterestRate: number; // percent, e.g. 6.5
  propertyTaxAnnual?: number;
  homeInsuranceAnnual?: number;
  hoaMonthly?: number;
  /** Annual PMI as a percent of the loan, charged while LTV > 80%. */
  pmiAnnualRate?: number;
}

export interface AmortizationRow {
  period: number; // 1-based month
  payment: number;
  principal: number;
  interest: number;
  pmi: number;
  balance: number;
}

export interface MortgageResult {
  loanAmount: number;
  monthlyPrincipalInterest: number;
  monthlyPropertyTax: number;
  monthlyInsurance: number;
  monthlyHoa: number;
  monthlyPmi: number; // initial PMI
  monthlyTotal: number; // first-month PITI + HOA
  totalInterest: number;
  totalPmi: number;
  totalOfPayments: number; // principal + interest over the life of the loan
  payoffMonths: number;
  schedule: AmortizationRow[];
}

function monthlyPayment(principal: number, monthlyRate: number, months: number): number {
  if (months <= 0) return 0;
  if (monthlyRate === 0) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * factor) / (factor - 1);
}

export function calculateMortgage(input: MortgageInput): MortgageResult {
  const homePrice = Math.max(0, input.homePrice || 0);
  const downPayment = Math.min(Math.max(0, input.downPayment || 0), homePrice);
  const loanAmount = Math.max(0, homePrice - downPayment);
  const months = Math.max(0, Math.round((input.loanTermYears || 0) * 12));
  const monthlyRate = (input.annualInterestRate || 0) / 100 / 12;

  const pi = monthlyPayment(loanAmount, monthlyRate, months);
  const monthlyPropertyTax = (input.propertyTaxAnnual || 0) / 12;
  const monthlyInsurance = (input.homeInsuranceAnnual || 0) / 12;
  const monthlyHoa = input.hoaMonthly || 0;
  const pmiMonthlyFull = ((input.pmiAnnualRate || 0) / 100) * loanAmount / 12;
  const pmiThreshold = homePrice * 0.8; // stop PMI when balance drops to 80% LTV

  const schedule: AmortizationRow[] = [];
  let balance = loanAmount;
  let totalInterest = 0;
  let totalPmi = 0;

  for (let period = 1; period <= months && balance > 0.005; period++) {
    const interest = balance * monthlyRate;
    let principal = pi - interest;
    if (principal > balance) principal = balance; // final payment
    const pmi = balance > pmiThreshold ? pmiMonthlyFull : 0;
    balance -= principal;
    totalInterest += interest;
    totalPmi += pmi;
    schedule.push({
      period,
      payment: principal + interest,
      principal,
      interest,
      pmi,
      balance: Math.max(0, balance),
    });
  }

  const initialPmi = loanAmount > pmiThreshold ? pmiMonthlyFull : 0;

  return {
    loanAmount,
    monthlyPrincipalInterest: pi,
    monthlyPropertyTax,
    monthlyInsurance,
    monthlyHoa,
    monthlyPmi: initialPmi,
    monthlyTotal: pi + monthlyPropertyTax + monthlyInsurance + monthlyHoa + initialPmi,
    totalInterest,
    totalPmi,
    totalOfPayments: loanAmount + totalInterest,
    payoffMonths: schedule.length,
    schedule,
  };
}

/** Collapse a monthly schedule into yearly rows for compact display. */
export function toYearlySchedule(schedule: AmortizationRow[]): AmortizationRow[] {
  const yearly: AmortizationRow[] = [];
  for (let i = 0; i < schedule.length; i += 12) {
    const chunk = schedule.slice(i, i + 12);
    const last = chunk[chunk.length - 1];
    yearly.push({
      period: Math.ceil((i + 1) / 12),
      payment: chunk.reduce((s, r) => s + r.payment, 0),
      principal: chunk.reduce((s, r) => s + r.principal, 0),
      interest: chunk.reduce((s, r) => s + r.interest, 0),
      pmi: chunk.reduce((s, r) => s + r.pmi, 0),
      balance: last.balance,
    });
  }
  return yearly;
}
