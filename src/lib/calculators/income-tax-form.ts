/**
 * Income tax form binding — the reference's full 1040-style estimator on the UNCHANGED
 * standard-form runtime.
 *
 * Thirty-odd fields go in, an eleven-line return comes out. All of the tax logic lives in
 * `calculateTaxReturn` (income-tax.ts) over the published parameters in @data/tax-tables;
 * everything here is at the VALIDATION / PRESENTATION boundary.
 *
 * Product decisions:
 *   • Money fields start at "0" rather than empty, as the reference does — a blank income
 *     field on a tax return is not a neutral state, it is an unanswered question, and there
 *     are far too many of them to make the visitor clear each one. WAGES is the field that
 *     matters, and the structural zeros are ours, not the visitor's figures.
 *   • Strict parsing, never `Number(v) || 0`: a field containing "abc" is an error, not a
 *     zero. Blank is read as zero because that is what the reference's own $0 default means.
 *   • Negative money is rejected everywhere. Age must be a plausible human age.
 *   • The dominant figure is what the return comes to — owed or refunded — because that is
 *     the question people arrive with. The eleven-line table is the breakdown.
 *   • No isUsableResult: the complete-result guard is `resultValue`, which returns a
 *     non-finite sentinel unless every line of the table reconciles.
 */
import { DEFAULT_TAX_YEAR, FILING_STATUS_LABELS, SUPPORTED_TAX_YEARS, TAX_YEARS, type FilingStatus } from '@data/tax-tables';
import { calculateTaxReturn, type TaxReturnInput, type TaxReturnResult } from './income-tax';
import { formatCurrencyRounded } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export { FILING_STATUS_LABELS, SUPPORTED_TAX_YEARS };

const VALID_STATUS = new Set<FilingStatus>(FILING_STATUS_LABELS.map((f) => f.value));

/** Every money field, in the order the reference lays them out. */
export const MONEY_FIELDS = [
  'wages',
  'federalWithheld',
  'stateWithheld',
  'localWithheld',
  'selfEmploymentIncome',
  'socialSecurityIncome',
  'interestIncome',
  'ordinaryDividends',
  'qualifiedDividends',
  'passiveIncome',
  'shortTermGains',
  'longTermGains',
  'otherIncome',
  'tipsIncome',
  'overtimeIncome',
  'carLoanInterest',
  'iraContributions',
  'realEstateTax',
  'mortgageInterest',
  'charitableDonations',
  'studentLoanInterest',
  'childCareExpense',
  'college1',
  'college2',
  'college3',
  'college4',
  'otherDeductibles',
] as const;
export type MoneyField = (typeof MONEY_FIELDS)[number];

/** The eleven lines of the result table, in the reference's order. */
export const RESULT_ROWS: { key: keyof TaxReturnResult; label: string; strong: boolean; percent?: boolean }[] = [
  { key: 'totalIncome', label: 'Total Income', strong: true },
  { key: 'totalDeductions', label: 'Total Deductions', strong: false },
  { key: 'taxableIncome', label: 'Taxable Income', strong: false },
  { key: 'regularTax', label: 'Regular Taxes', strong: true },
  { key: 'alternativeMinimumTax', label: 'Alternative Minimum Tax', strong: false },
  { key: 'netInvestmentIncomeTax', label: 'Net Investment Income Tax', strong: false },
  { key: 'totalCredits', label: 'All Tax Credits', strong: false },
  { key: 'totalTaxWithCredits', label: 'Total Tax with Credits', strong: true },
  { key: 'marginalRate', label: 'Marginal Tax Rate', strong: false, percent: true },
  { key: 'prepayments', label: 'Tax Pre-payments', strong: false },
  { key: 'amountOwed', label: 'Tax Amount Owe', strong: true },
];

export type IncomeTaxValues = Record<MoneyField, string> & {
  filingStatus: FilingStatus;
  taxYear: string;
  youngDependents: string;
  otherDependents: string;
  age: string;
  spouseAge: string;
  hasSelfEmployment: string;
  stateLocalRatePct: string;
};

export interface IncomeTaxComputed extends TaxReturnResult {
  year: number;
  filingStatus: FilingStatus;
}

export const MSG = {
  age: 'Enter an age between 0 and 120.',
  dependents: 'Enter a whole number of dependents, zero or more.',
  money: 'Enter an amount of zero or more.',
  rate: 'Enter a rate between 0 and 100%.',
  year: 'Choose a tax year.',
  status: 'Choose a filing status.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing (pure) — strict, never Number(v) || 0                       */
/* ------------------------------------------------------------------ */

type NumParse = 'invalid' | number;

/**
 * A money field. Blank counts as zero — that is what the reference's own "$0" default
 * means — but anything that is not a number is an error, never a silent zero.
 */
export function parseMoney(raw: string): NumParse {
  const t = (raw ?? '').trim().replace(/[$,]/g, '');
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** A whole count of people, zero or more. */
export function parseCount(raw: string): NumParse {
  const t = (raw ?? '').trim();
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 20) return 'invalid';
  return n;
}

/**
 * Age is optional. It only decides the extra deduction at 65, so a blank simply means "not
 * 65 or over" — far better than making every visitor answer a question most of them do not
 * need to. Anything actually typed still has to be a real age.
 */
export function parseAge(raw: string): NumParse {
  const t = (raw ?? '').trim();
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 120) return 'invalid';
  return n;
}

export function parseRate(raw: string): NumParse {
  const t = (raw ?? '').trim().replace(/%/g, '');
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'invalid';
  return n;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export function validateIncomeTaxValues(v: IncomeTaxValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  if (!VALID_STATUS.has(v.filingStatus)) fieldErrors.filingStatus = MSG.status;
  if (!TAX_YEARS[Number(v.taxYear)]) fieldErrors.taxYear = MSG.year;
  if (parseAge(v.age) === 'invalid') fieldErrors.age = MSG.age;
  for (const name of ['youngDependents', 'otherDependents'] as const) {
    if (parseCount(v[name]) === 'invalid') fieldErrors[name] = MSG.dependents;
  }
  if (parseRate(v.stateLocalRatePct) === 'invalid') fieldErrors.stateLocalRatePct = MSG.rate;
  for (const name of MONEY_FIELDS) {
    if (parseMoney(v[name]) === 'invalid') fieldErrors[name] = MSG.money;
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

const money = (raw: string): number => {
  const p = parseMoney(raw);
  return p === 'invalid' ? Number.NaN : p;
};
const count = (raw: string): number => {
  const p = parseCount(raw);
  return p === 'invalid' ? Number.NaN : p;
};

export function toTaxReturnInput(v: IncomeTaxValues): TaxReturnInput {
  const age = parseAge(v.age);
  const spouseAge = parseAge(v.spouseAge);
  const rate = parseRate(v.stateLocalRatePct);
  return {
    year: Number(v.taxYear),
    filingStatus: v.filingStatus,
    age: age === 'invalid' ? Number.NaN : age,
    spouseAge: spouseAge === 'invalid' ? 0 : spouseAge,
    youngDependents: count(v.youngDependents),
    otherDependents: count(v.otherDependents),
    wages: money(v.wages),
    federalWithheld: money(v.federalWithheld),
    stateWithheld: money(v.stateWithheld),
    localWithheld: money(v.localWithheld),
    hasSelfEmployment: v.hasSelfEmployment === 'yes',
    selfEmploymentIncome: money(v.selfEmploymentIncome),
    socialSecurityIncome: money(v.socialSecurityIncome),
    interestIncome: money(v.interestIncome),
    ordinaryDividends: money(v.ordinaryDividends),
    qualifiedDividends: money(v.qualifiedDividends),
    passiveIncome: money(v.passiveIncome),
    shortTermGains: money(v.shortTermGains),
    longTermGains: money(v.longTermGains),
    otherIncome: money(v.otherIncome),
    stateLocalRatePct: rate === 'invalid' ? Number.NaN : rate,
    tipsIncome: money(v.tipsIncome),
    overtimeIncome: money(v.overtimeIncome),
    carLoanInterest: money(v.carLoanInterest),
    iraContributions: money(v.iraContributions),
    realEstateTax: money(v.realEstateTax),
    mortgageInterest: money(v.mortgageInterest),
    charitableDonations: money(v.charitableDonations),
    studentLoanInterest: money(v.studentLoanInterest),
    childCareExpense: money(v.childCareExpense),
    collegeExpenses: [money(v.college1), money(v.college2), money(v.college3), money(v.college4)],
    otherDeductibles: money(v.otherDeductibles),
  };
}

export function computeIncomeTax(v: IncomeTaxValues): IncomeTaxComputed {
  const input = toTaxReturnInput(v);
  return { ...calculateTaxReturn(input), year: input.year, filingStatus: input.filingStatus };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN;

/**
 * The amount owed — but only when every line of the table is a real number and the return
 * adds up. Eleven figures are about to be printed as a tax estimate; one of them being NaN
 * behind a plausible headline is exactly what this stops.
 */
export function completeIncomeTaxValue(r: IncomeTaxComputed): number {
  if (r.unsolvable) return FAIL;
  if (!VALID_STATUS.has(r.filingStatus) || !TAX_YEARS[r.year]) return FAIL;
  for (const { key } of RESULT_ROWS) {
    if (!Number.isFinite(r[key] as number)) return FAIL;
  }
  // Only the amount owed may go negative; a negative tax or income is nonsense.
  const nonNegative: (keyof TaxReturnResult)[] = [
    'totalIncome', 'totalDeductions', 'taxableIncome', 'regularTax', 'alternativeMinimumTax',
    'netInvestmentIncomeTax', 'totalCredits', 'totalTaxWithCredits', 'prepayments',
  ];
  for (const key of nonNegative) {
    if ((r[key] as number) < 0) return FAIL;
  }
  if (Math.abs(r.amountOwed - (r.totalTaxWithCredits - r.prepayments)) > 0.01) return FAIL;
  return r.amountOwed;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

/** The reference prints whole dollars throughout. */
export function formatTaxMoney(value: number): string {
  return Number.isFinite(value) ? formatCurrencyRounded(value) : '—';
}

export function formatRow(r: IncomeTaxComputed, key: keyof TaxReturnResult, percent?: boolean): string {
  const v = r[key] as number;
  if (!Number.isFinite(v)) return '—';
  return percent ? `${Math.round(v)}%` : formatTaxMoney(v);
}

/** "Tax Amount Owe for 2025" or "Tax Refund for 2025" — the reference switches the word. */
export function headlineLabel(r: IncomeTaxComputed): string {
  return r.amountOwed >= 0 ? `Tax Amount Owe for ${r.year}` : `Tax Refund for ${r.year}`;
}

export function headlineValue(r: IncomeTaxComputed): string {
  return formatTaxMoney(Math.abs(r.amountOwed));
}

export function interpretIncomeTax(r: IncomeTaxComputed): string {
  const deduction = r.usedItemized
    ? `itemised deductions of ${formatTaxMoney(r.itemizedDeduction)}`
    : `the ${formatTaxMoney(r.standardDeduction)} standard deduction`;
  const owed =
    r.amountOwed >= 0
      ? `${formatTaxMoney(r.amountOwed)} still to pay`
      : `a refund of ${formatTaxMoney(-r.amountOwed)}`;
  return `On ${formatTaxMoney(r.totalIncome)} of income for ${r.year}, taking ${deduction}, the estimated federal tax is ${formatTaxMoney(r.totalTaxWithCredits)}. Against ${formatTaxMoney(r.prepayments)} already withheld, that leaves ${owed}.`;
}

export function describeIncomeTaxResult(r: IncomeTaxComputed): string {
  return r.amountOwed >= 0
    ? `Estimated tax owed: ${formatTaxMoney(r.amountOwed)}.`
    : `Estimated refund: ${formatTaxMoney(-r.amountOwed)}.`;
}

/* ------------------------------------------------------------------ */
/* Defaults + the binding                                              */
/* ------------------------------------------------------------------ */

/**
 * The starting sheet. Every box the visitor types their own figure into loads EMPTY behind
 * a `0` placeholder, and a blank reads as zero — so the sheet looks like the reference's
 * grid of zeros without any of those zeros actually being the visitor's data. Only the
 * structural choices (status, year, the business-income question) carry a default.
 */
export const DEFAULT_VALUES: IncomeTaxValues = {
  ...(Object.fromEntries(MONEY_FIELDS.map((f) => [f, ''])) as Record<MoneyField, string>),
  filingStatus: 'single',
  taxYear: String(DEFAULT_TAX_YEAR),
  youngDependents: '',
  otherDependents: '',
  age: '',
  spouseAge: '',
  hasSelfEmployment: 'no',
  stateLocalRatePct: '',
};

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

const readValue = (root: HTMLElement, name: string, fallback: string): string =>
  control(root, name)?.value ?? fallback;

const readChecked = (root: HTMLElement, name: string, fallback: string): string =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value ?? fallback;

export const incomeTaxBinding: FormCalculatorBinding<IncomeTaxValues, IncomeTaxComputed> = {
  readValues(root) {
    const money = Object.fromEntries(
      MONEY_FIELDS.map((f) => [f, readValue(root, f, '')]),
    ) as Record<MoneyField, string>;
    const status = readValue(root, 'filingStatus', 'single') as FilingStatus;
    return {
      ...money,
      filingStatus: VALID_STATUS.has(status) ? status : 'single',
      taxYear: readChecked(root, 'taxYear', String(DEFAULT_TAX_YEAR)),
      youngDependents: readValue(root, 'youngDependents', ''),
      otherDependents: readValue(root, 'otherDependents', ''),
      age: readValue(root, 'age', ''),
      spouseAge: readValue(root, 'spouseAge', ''),
      hasSelfEmployment: readChecked(root, 'hasSelfEmployment', 'no'),
      stateLocalRatePct: readValue(root, 'stateLocalRatePct', ''),
    };
  },

  validate: validateIncomeTaxValues,

  compute: computeIncomeTax,

  resultValue: completeIncomeTaxValue,

  describeResult: describeIncomeTaxResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };

    set('[data-result-when~="valid"] [data-result-summary-label]', headlineLabel(result));
    set('[data-result-when~="valid"] [data-result-value]', headlineValue(result));
    set('[data-result-when~="valid"] [data-result-value-a11y]', describeIncomeTaxResult(result));
    set('[data-it-interpretation]', interpretIncomeTax(result));
    for (const { key, percent } of RESULT_ROWS) {
      set(`[data-it-row="${key}"]`, formatRow(result, key, percent));
    }
  },

  resetValues(root, _mode: ResetMode) {
    for (const [name, value] of Object.entries(DEFAULT_VALUES)) {
      if (name === 'taxYear' || name === 'hasSelfEmployment') {
        const radio = root.querySelector<HTMLInputElement>(`[name="${name}"][value="${value}"]`);
        if (radio) radio.checked = true;
        continue;
      }
      const el = control(root, name);
      if (el) el.value = value;
    }
  },
};

/** The reference's own worked case, so the panel opens on a return anyone can check. */
export const INCOME_TAX_EXAMPLE_VALUES: IncomeTaxValues = {
  ...DEFAULT_VALUES,
  age: '30',
  wages: '80000',
  federalWithheld: '9000',
};
