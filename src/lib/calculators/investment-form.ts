/**
 * Investment form binding — what a starting amount plus regular contributions grows to.
 *
 * Wraps the pure `calculateInvestment` (frozen by investment.test.ts against the
 * published reference case) and layers the visitor-facing contract: strict parsing of
 * every field, range validation, a complete-result guard, and the presentation.
 *
 * WHAT THE RESULT SHOWS. An end balance on its own says nothing about where it came
 * from, and the answer people actually want is how much of it they put in versus how
 * much the market did. So the result splits it three ways — starting amount,
 * contributions, interest — shows that split as a ring, and then the accumulation
 * schedule year by year and month by month with the stacked chart beside it.
 *
 * The schedule table, the stacked chart and the money formatting all come from
 * `@lib/result/accumulation`, which Savings and Interest already share: three
 * calculators answering the same shape of question should not own three copies of
 * the same table.
 *
 * The complete-result guard lives in `resultValue` as a NaN sentinel feeding the
 * runtime's DEFAULT finite gate; there is NO `isUsableResult`.
 */
import {
  calculateInvestment,
  type ContributeAt,
  type ContributeEvery,
  type InvestmentResult,
} from './investment';
import { isCompoundFrequency, type CompoundFrequency } from './compounding';
import { formatCurrency, formatCurrencyRounded, formatPercent } from '@lib/format';
import {
  drawAccumulationChart,
  fillSchedule,
  percentLabel,
  share,
  type YearStack,
} from '@lib/result/accumulation';
import { drawDonut } from '@lib/result/loan-schedule';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** A century is longer than any real plan and bounds the schedule. */
export const MAX_YEARS = 100;
/** Beyond this a return rate is a typo, not a forecast. */
export const MAX_RETURN = 100;
/** A loss worse than this is not a plan anyone is modelling. */
export const MIN_RETURN = -100;

export interface InvestmentValues {
  startingAmount: string;
  years: string;
  annualReturnPct: string;
  compound: CompoundFrequency;
  contribution: string;
  contributeAt: ContributeAt;
  contributeEvery: ContributeEvery;
}

export interface InvestmentComputed {
  startingAmount: number;
  years: number;
  annualReturnPct: number;
  compound: CompoundFrequency;
  contribution: number;
  contributeAt: ContributeAt;
  contributeEvery: ContributeEvery;
  result: InvestmentResult;
}

export const MSG = {
  startRequired: 'Enter a starting amount.',
  startNonNegative: 'Enter a starting amount of zero or more.',
  yearsRequired: 'Enter how many years you will invest for.',
  yearsRange: `Enter an investment length from 1 to ${MAX_YEARS} years.`,
  returnRequired: 'Enter a return rate.',
  returnRange: `Enter a return rate between ${MIN_RETURN}% and ${MAX_RETURN}%.`,
  contributionNonNegative: 'Enter a contribution of zero or more.',
  nothingInvested: 'Enter a starting amount or a contribution — there is nothing to invest otherwise.',
} as const;

const FAIL = Number.NaN;
const MONEY_TOL = 0.01;

/* ------------------------------------------------------------------ */
/* Strict parsing                                                      */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

const parseNonNegative = (raw: string): NumParse => {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
};
/** A return rate may be negative — a losing year is a real scenario. */
const parseRate = (raw: string): NumParse => {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  return Number.isFinite(n) ? n : 'invalid';
};
const parseYears = (raw: string): NumParse => {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  return Number.isFinite(n) && n >= 1 && n <= MAX_YEARS ? n : 'invalid';
};

/* ------------------------------------------------------------------ */
/* Read / validate / compute                                           */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const checked = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value;

export function readInvestmentValues(root: HTMLElement): InvestmentValues {
  const compound = root.querySelector<HTMLSelectElement>('[name="compound"]')?.value;
  return {
    startingAmount: field(root, 'startingAmount')?.value ?? '',
    years: field(root, 'years')?.value ?? '',
    annualReturnPct: field(root, 'annualReturnPct')?.value ?? '',
    compound: compound && isCompoundFrequency(compound) ? compound : 'annually',
    contribution: field(root, 'contribution')?.value ?? '',
    contributeAt: checked(root, 'contributeAt') === 'beginning' ? 'beginning' : 'end',
    contributeEvery: checked(root, 'contributeEvery') === 'year' ? 'year' : 'month',
  };
}

export function validateInvestment(v: InvestmentValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const start = parseNonNegative(v.startingAmount);
  if (start === 'empty') fieldErrors.startingAmount = MSG.startRequired;
  else if (start === 'invalid') fieldErrors.startingAmount = MSG.startNonNegative;

  const years = parseYears(v.years);
  if (years === 'empty') fieldErrors.years = MSG.yearsRequired;
  else if (years === 'invalid') fieldErrors.years = MSG.yearsRange;

  const rate = parseRate(v.annualReturnPct);
  if (rate === 'empty') fieldErrors.annualReturnPct = MSG.returnRequired;
  else if (rate === 'invalid' || rate < MIN_RETURN || rate > MAX_RETURN) {
    fieldErrors.annualReturnPct = MSG.returnRange;
  }

  // The contribution is optional — a lump sum left alone is a real plan. Blank
  // counts as zero; a negative is a withdrawal this calculator does not model.
  const contribution = v.contribution.trim() === '' ? 0 : parseNonNegative(v.contribution);
  if (contribution === 'invalid') fieldErrors.contribution = MSG.contributionNonNegative;

  // But something has to be invested.
  if (
    typeof start === 'number' &&
    typeof contribution === 'number' &&
    start === 0 &&
    contribution === 0
  ) {
    fieldErrors.startingAmount = MSG.nothingInvested;
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function computeInvestment(v: InvestmentValues): InvestmentComputed {
  const parsed = {
    startingAmount: Number(v.startingAmount),
    years: Number(v.years),
    annualReturnPct: Number(v.annualReturnPct),
    compound: v.compound,
    contribution: v.contribution.trim() === '' ? 0 : Number(v.contribution),
    contributeAt: v.contributeAt,
    contributeEvery: v.contributeEvery,
  };
  return { ...parsed, result: calculateInvestment(parsed) };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (in resultValue — NO isUsableResult)          */
/* ------------------------------------------------------------------ */

/**
 * Returns the end balance ONLY when the whole projection reconciles: finite
 * in-range inputs, a schedule of the right length in both views, the three parts
 * summing exactly to the balance, and each year summing the months inside it.
 */
export function completeInvestmentValue(c: InvestmentComputed): number {
  const { startingAmount, years, annualReturnPct, contribution, result } = c;
  if (!Number.isFinite(startingAmount) || startingAmount < 0) return FAIL;
  if (!Number.isFinite(years) || years < 1 || years > MAX_YEARS) return FAIL;
  if (!Number.isFinite(annualReturnPct) || annualReturnPct < MIN_RETURN || annualReturnPct > MAX_RETURN) {
    return FAIL;
  }
  if (!Number.isFinite(contribution) || contribution < 0) return FAIL;
  if (startingAmount === 0 && contribution === 0) return FAIL;

  const { endBalance, totalContributions, totalInterest, monthly, annual } = result;
  if (![endBalance, totalContributions, totalInterest].every(Number.isFinite)) return FAIL;
  if (endBalance < 0 || totalContributions < 0) return FAIL;
  if (Math.abs(result.startingAmount - startingAmount) > MONEY_TOL) return FAIL;

  // The identity that makes the split trustworthy.
  if (Math.abs(startingAmount + totalContributions + totalInterest - endBalance) > MONEY_TOL) {
    return FAIL;
  }

  const months = Math.round(years * 12);
  if (monthly.length !== months) return FAIL;
  if (annual.length !== Math.ceil(months / 12)) return FAIL;
  if (!monthly.length || !annual.length) return FAIL;
  if (Math.abs(monthly[monthly.length - 1].balance - endBalance) > MONEY_TOL) return FAIL;
  if (Math.abs(annual[annual.length - 1].balance - endBalance) > MONEY_TOL) return FAIL;

  let paidIn = 0;
  for (const row of monthly) {
    if (![row.deposit, row.interest, row.balance].every(Number.isFinite)) return FAIL;
    if (row.deposit < 0) return FAIL;
    paidIn += row.deposit;
  }
  // Every deposit row together is the starting amount plus the contributions.
  if (Math.abs(paidIn - (startingAmount + totalContributions)) > MONEY_TOL) return FAIL;

  for (const [i, year] of annual.entries()) {
    const slice = monthly.slice(i * 12, i * 12 + 12);
    const summed = slice.reduce((s, m) => s + m.interest, 0);
    if (Math.abs(year.interest - summed) > MONEY_TOL) return FAIL;
  }

  return endBalance;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface InvestmentPresentation {
  endBalance: string;
  startingAmount: string;
  totalContributions: string;
  totalInterest: string;
  startingShare: string;
  contributionShare: string;
  interestShare: string;
  interpretation: string;
}

/** "$1,000 a month", or "$12,000 a year". */
export function contributionPhrase(amount: number, every: ContributeEvery): string {
  return `${formatCurrencyRounded(amount)} a ${every}`;
}

export function presentInvestment(c: InvestmentComputed): InvestmentPresentation {
  const r = c.result;
  const total = r.endBalance;
  const years = `${c.years} year${c.years === 1 ? '' : 's'}`;
  const contributing =
    c.contribution > 0
      ? ` and adding ${contributionPhrase(c.contribution, c.contributeEvery)}`
      : '';

  return {
    endBalance: formatCurrency(r.endBalance),
    startingAmount: formatCurrency(r.startingAmount),
    totalContributions: formatCurrency(r.totalContributions),
    totalInterest: formatCurrency(r.totalInterest),
    startingShare: percentLabel(share(r.startingAmount, total)),
    contributionShare: percentLabel(share(r.totalContributions, total)),
    interestShare: percentLabel(share(Math.max(0, r.totalInterest), total)),
    interpretation:
      `Starting with ${formatCurrencyRounded(c.startingAmount)}${contributing} at ` +
      `${formatPercent(c.annualReturnPct, 2)} a year, after ${years} you would have ` +
      `${formatCurrency(r.endBalance)} — of which ${formatCurrency(r.totalInterest)} is return.`,
  };
}

/** A USD amount in spoken form, for the announcement. */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

export function describeInvestment(c: InvestmentComputed): string {
  return `End balance: ${spokenUSD(c.result.endBalance)}.`;
}

/**
 * The cumulative split behind each year's column: what was there at the start, what
 * has been paid in by then, and what has been earned. The three sum to that year's
 * ending balance, so the column height IS the balance.
 */
export function yearStacks(c: InvestmentComputed): YearStack[] {
  const stacks: YearStack[] = [];
  let contributions = 0;
  for (const [i, year] of c.result.annual.entries()) {
    // The starting amount is folded into year one's deposit, so take it back out to
    // get the contributions alone.
    contributions += year.deposit - (i === 0 ? c.startingAmount : 0);
    stacks.push({
      year: year.period,
      initial: c.startingAmount,
      contributions,
      interest: Math.max(0, year.balance - c.startingAmount - contributions),
      total: year.balance,
    });
  }
  return stacks;
}

function donutLabel(c: InvestmentComputed): string {
  const r = c.result;
  return (
    `Of ${formatCurrency(r.endBalance)} at the end, ${formatCurrency(r.startingAmount)} is the ` +
    `starting amount, ${formatCurrency(r.totalContributions)} is what was contributed and ` +
    `${formatCurrency(r.totalInterest)} is interest earned.`
  );
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

export function renderInvestmentResult(result: InvestmentComputed, context: FormRenderContext): void {
  const p = presentInvestment(result);
  const scope = context.result;
  const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
  const setText = (sel: string, value: string) => {
    const el = q(sel);
    if (el) el.textContent = value;
  };
  const show = (sel: string, visible: boolean) => {
    const el = q(sel);
    if (el) el.hidden = !visible;
  };

  setText('[data-result-when~="valid"] [data-result-value]', p.endBalance);
  setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(result.result.endBalance));
  setText('[data-inv-start]', p.startingAmount);
  setText('[data-inv-contributions]', p.totalContributions);
  setText('[data-inv-interest]', p.totalInterest);
  setText('[data-inv-interpretation]', p.interpretation);

  // A losing projection has no honest part-to-whole split — negative interest is not
  // a slice — so the ring stands down rather than misrepresenting it.
  const charted =
    result.result.totalInterest >= 0 &&
    drawDonut(
      q('[data-inv-donut]'),
      [
        { key: 'start', value: result.result.startingAmount },
        { key: 'contributions', value: result.result.totalContributions },
        { key: 'interest', value: result.result.totalInterest },
      ],
      { prefix: 'inv', label: donutLabel(result) },
    );
  show('[data-inv-donut-figure]', charted === true);
  if (charted) {
    setText('[data-inv-share-start]', p.startingShare);
    setText('[data-inv-share-contributions]', p.contributionShare);
    setText('[data-inv-share-interest]', p.interestShare);
  }

  const stacks = yearStacks(result);
  const graphed =
    result.result.totalInterest >= 0 &&
    drawAccumulationChart(q('[data-inv-chart]'), stacks, {
      prefix: 'inv',
      format: formatCurrency,
      label:
        `Balance by year, from ${formatCurrency(stacks[0]?.total ?? 0)} after year one to ` +
        `${formatCurrency(result.result.endBalance)} after ${result.years} years, each column ` +
        `split into the starting amount, contributions so far and interest so far.`,
    });
  show('[data-inv-chart-figure]', graphed === true);

  fillSchedule(q('[data-inv-rows-yearly]'), result.result.annual, {
    prefix: 'inv',
    format: formatCurrency,
  });
  fillSchedule(
    q('[data-inv-rows-monthly]'),
    result.result.monthly,
    { prefix: 'inv', format: formatCurrency },
    true,
  );
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

/** Clear the money and the term; the structural choices go back to their defaults. */
export function resetInvestmentValues(root: HTMLElement, _mode: ResetMode): void {
  for (const name of ['startingAmount', 'years', 'annualReturnPct', 'contribution'] as const) {
    const el = field(root, name);
    if (el) el.value = '';
  }
  const compound = root.querySelector<HTMLSelectElement>('[name="compound"]');
  if (compound) compound.value = 'annually';
  const end = root.querySelector<HTMLInputElement>('[name="contributeAt"][value="end"]');
  if (end) end.checked = true;
  const month = root.querySelector<HTMLInputElement>('[name="contributeEvery"][value="month"]');
  if (month) month.checked = true;
}

export const investmentBinding: FormCalculatorBinding<InvestmentValues, InvestmentComputed> = {
  readValues: readInvestmentValues,
  validate: validateInvestment,
  compute: computeInvestment,
  describeResult: describeInvestment,
  renderResult: renderInvestmentResult,
  resetValues: resetInvestmentValues,
  resultValue: completeInvestmentValue,
  // NO isUsableResult — the complete-result guard lives in resultValue.
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/** The published reference case, pinned to the cent by the tests. */
export const INVESTMENT_EXAMPLE_VALUES: InvestmentValues = {
  startingAmount: '20000',
  years: '10',
  annualReturnPct: '6',
  compound: 'annually',
  contribution: '1000',
  contributeAt: 'end',
  contributeEvery: 'month',
};
