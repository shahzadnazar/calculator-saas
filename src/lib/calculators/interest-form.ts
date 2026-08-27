/**
 * Interest form binding — the accumulation calculator's validation, computation
 * guard and presentation. The pure model lives in `./interest`; nothing here does
 * arithmetic the engine could do instead, and the schedule table and chart come from
 * the shared accumulation helpers rather than a private copy.
 *
 * FIELDS. The set matches the reference calculator one for one, in its order:
 * initial investment · annual contribution · monthly contribution · contribute at the
 * beginning or end of each compounding period · interest rate · compound ·
 * investment length in years and months · tax rate · inflation rate.
 *
 * REQUIRED vs BLANK. Two inputs are always required — the initial investment and the
 * interest rate — plus a term of at least one month. The contributions and the tax
 * rate mean "none" when left blank, which is what an empty contribution box plainly
 * means. That is an explicit empty-string branch, NOT `Number(v) || 0`: "abc" is
 * still an error, and only a genuinely empty field reads as zero.
 *
 * TWO STRUCTURAL CONTROLS carry a default because a radio group and a select always
 * have a value: the contribution timing (beginning, matching the reference) and the
 * compounding frequency (annually). The inflation rate is the third, at 3% — an
 * assumption the product already ships on the retirement calculator, not the
 * visitor's own figure, and without it the buying-power line has nothing to say.
 *
 * THE GUARD. `resultValue` returns a NaN sentinel unless the ENTIRE result
 * reconciles: principal against its two parts, the balance against principal plus
 * interest, the interest split against the total, the yearly rows against the totals,
 * and each yearly balance against the month that closes it. The runtime's finite gate
 * then refuses to render a projection whose figures disagree.
 */
import {
  MAX_INTEREST_MONTHS,
  isCompoundFrequency,
  isContributionTiming,
  projectInterest,
  type CompoundFrequency,
  type ContributionTiming,
  type InterestPlanResult,
} from './interest';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
import {
  drawAccumulationChart,
  fillSchedule,
  percentLabel,
  share,
  type YearStack,
} from '@lib/result/accumulation';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export interface InterestValues {
  initialInvestment: string;
  annualContribution: string;
  monthlyContribution: string;
  contributeAt: string;
  annualRatePct: string;
  compound: string;
  years: string;
  months: string;
  taxRatePct: string;
  inflationRatePct: string;
}

export interface InterestComputed {
  plan: InterestPlanResult;
  /** Kept alongside the plan so the buying-power line knows whether it has anything to say. */
  inflationRatePct: number;
}

/** The default inflation assumption, matching the reference and our retirement tool. */
export const DEFAULT_INFLATION_PCT = '3';

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** Finite and at least zero. */
function parseNonNegative(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** Finite, within an inclusive band. */
function parseWithin(raw: string, min: number, max: number): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < min || n > max) return 'invalid';
  return n;
}

/** A whole count of zero or more. Fractions are rejected, never rounded. */
function parseWholeCount(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return 'invalid';
  return n;
}

/**
 * A field whose blank state means "none". Returns the fallback for an empty box and
 * still reports a real error for anything unparseable — the distinction
 * `Number(v) || 0` throws away.
 */
function optional(raw: string, parse: (s: string) => NumParse, fallback = 0): NumParse {
  const parsed = parse(raw);
  return parsed === 'empty' ? fallback : parsed;
}

export function validateInterestValues(values: InterestValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const initial = parseNonNegative(values.initialInvestment);
  if (initial === 'empty') fieldErrors.initialInvestment = 'Enter an initial investment.';
  else if (initial === 'invalid')
    fieldErrors.initialInvestment = 'Enter an initial investment of zero or more.';

  const rate = parseNonNegative(values.annualRatePct);
  if (rate === 'empty') fieldErrors.annualRatePct = 'Enter an interest rate.';
  else if (rate === 'invalid') fieldErrors.annualRatePct = 'Enter an interest rate of zero or more.';

  const annual = optional(values.annualContribution, parseNonNegative);
  if (annual === 'invalid')
    fieldErrors.annualContribution = 'Enter an annual contribution of zero or more.';

  const monthly = optional(values.monthlyContribution, parseNonNegative);
  if (monthly === 'invalid')
    fieldErrors.monthlyContribution = 'Enter a monthly contribution of zero or more.';

  const tax = optional(values.taxRatePct, (s) => parseWithin(s, 0, 100));
  if (tax === 'invalid') fieldErrors.taxRatePct = 'Enter a tax rate from 0 to 100.';

  const inflation = optional(values.inflationRatePct, (s) => parseWithin(s, 0, 100));
  if (inflation === 'invalid') fieldErrors.inflationRatePct = 'Enter an inflation rate from 0 to 100.';

  if (!isCompoundFrequency(values.compound)) {
    fieldErrors.compound = 'Choose how often interest compounds.';
  }
  if (!isContributionTiming(values.contributeAt)) {
    fieldErrors.contributeAt = 'Choose when contributions are made.';
  }

  // The term is two boxes but one quantity, so it is validated as one. Each box must
  // parse on its own; then the pair has to add up to a length worth projecting, and
  // that verdict is reported against the years box the reader fills in first.
  const years = optional(values.years, parseWholeCount);
  if (years === 'invalid') fieldErrors.years = 'Enter a whole number of years.';
  const months = optional(values.months, parseWholeCount);
  if (months === 'invalid') fieldErrors.months = 'Enter a whole number of months.';

  if (years !== 'invalid' && months !== 'invalid') {
    const total = (years as number) * 12 + (months as number);
    if (total < 1) fieldErrors.years = 'Enter an investment length of at least one month.';
    else if (total > MAX_INTEREST_MONTHS)
      fieldErrors.years = 'Enter an investment length of 100 years or less.';
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

/** Post-validation read: every branch here has already been proven parseable. */
const num = (raw: string, fallback = 0): number => {
  const t = raw.trim();
  return t === '' ? fallback : Number(t);
};

export function computeInterest(values: InterestValues): InterestComputed {
  const inflationRatePct = num(values.inflationRatePct);
  return {
    inflationRatePct,
    plan: projectInterest({
      initialInvestment: num(values.initialInvestment),
      annualContribution: num(values.annualContribution),
      monthlyContribution: num(values.monthlyContribution),
      contributeAt: values.contributeAt as ContributionTiming,
      annualRatePct: num(values.annualRatePct),
      compound: values.compound as CompoundFrequency,
      years: num(values.years),
      months: num(values.months),
      taxRatePct: num(values.taxRatePct),
      inflationRatePct,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* The complete-result guard                                           */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN;

/** Absolute tolerance that scales with the figure — cents on small sums, more on large. */
const reconTol = (value: number): number => Math.max(0.01, Math.abs(value) * 1e-9);

const allFinite = (...values: number[]): boolean => values.every((v) => Number.isFinite(v));

/**
 * True only when a plan is wholly self-consistent. Every identity the result panel
 * puts in front of a reader is checked here, so a set of figures that do not add up
 * is never rendered.
 */
function planReconciles(p: InterestPlanResult): boolean {
  if (
    !allFinite(
      p.endingBalance,
      p.initialInvestment,
      p.totalPrincipal,
      p.totalContributions,
      p.totalInterest,
      p.interestOfInitial,
      p.interestOfContributions,
      p.totalTax,
      p.buyingPower,
    )
  )
    return false;

  if (p.totalTax < 0 || p.interestOfInitial < 0 || p.initialInvestment < 0) return false;
  if (p.termMonths < 1 || p.termMonths > MAX_INTEREST_MONTHS) return false;
  if (p.months.length !== p.termMonths) return false;
  if (p.annual.length !== Math.ceil(p.termMonths / 12)) return false;

  // Principal is its two parts; the balance is principal plus interest.
  if (
    Math.abs(p.initialInvestment + p.totalContributions - p.totalPrincipal) >
    reconTol(p.totalPrincipal)
  )
    return false;
  if (Math.abs(p.totalPrincipal + p.totalInterest - p.endingBalance) > reconTol(p.endingBalance))
    return false;
  // The interest split has to re-sum, or the two lines under it are fiction.
  if (
    Math.abs(p.interestOfInitial + p.interestOfContributions - p.totalInterest) >
    reconTol(p.totalInterest)
  )
    return false;
  // Inflation never adds buying power; at 0% it leaves the balance untouched.
  if (p.buyingPower > p.endingBalance + reconTol(p.endingBalance)) return false;

  let deposits = 0;
  let interest = 0;
  let monthsCounted = 0;
  for (const y of p.annual) {
    if (!allFinite(y.deposit, y.interest, y.tax, y.balance)) return false;
    if (y.monthCount < 1 || y.monthCount > 12) return false;
    deposits += y.deposit;
    interest += y.interest;
    monthsCounted += y.monthCount;
    const closing = p.months[monthsCounted - 1];
    if (!closing || Math.abs(closing.balance - y.balance) > reconTol(y.balance)) return false;
  }
  if (monthsCounted !== p.termMonths) return false;
  // Every deposit in the schedule is the initial investment plus every contribution.
  if (Math.abs(deposits - p.totalPrincipal) > reconTol(deposits)) return false;
  if (Math.abs(interest - p.totalInterest) > reconTol(interest)) return false;
  if (Math.abs(p.annual[p.annual.length - 1].balance - p.endingBalance) > reconTol(p.endingBalance))
    return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** A USD amount in spoken form, e.g. "45320 dollars", "325 dollars and 50 cents". */
export function spokenUSD(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

export function describeInterestResult(result: InterestComputed): string {
  return `Your ending balance is ${spokenUSD(result.plan.endingBalance)}.`;
}

/**
 * Each year's cumulative composition, for the stacked chart.
 *
 * Year 1's deposit column carries the initial investment, so it is stripped back out
 * here — the chart separates what was put in from what the account earned, and
 * leaving the opening sum inside "contributions" would double-count it.
 */
function yearStacks(plan: InterestPlanResult): YearStack[] {
  const out: YearStack[] = [];
  let contributions = 0;
  let interest = 0;
  for (const y of plan.annual) {
    contributions += y.year === 1 ? y.deposit - plan.initialInvestment : y.deposit;
    interest += y.interest;
    out.push({
      year: y.year,
      initial: plan.initialInvestment,
      contributions,
      interest,
      total: plan.initialInvestment + contributions + interest,
    });
  }
  return out;
}

const SCHEDULE = { prefix: 'int', format: formatCurrency };

function fillSchedules(scope: HTMLElement, plan: InterestPlanResult): void {
  fillSchedule(
    scope.querySelector<HTMLElement>('[data-int-rows="yearly"]'),
    plan.annual.map((y) => ({
      period: y.year,
      deposit: y.deposit,
      interest: y.interest,
      balance: y.balance,
    })),
    SCHEDULE,
  );
  fillSchedule(
    scope.querySelector<HTMLElement>('[data-int-rows="monthly"]'),
    plan.months.map((m) => ({
      period: m.month,
      deposit: m.deposit,
      interest: m.interest,
      balance: m.balance,
    })),
    SCHEDULE,
    true,
  );
}

function chartLabel(plan: InterestPlanResult): string {
  const years = plan.annual.length;
  return (
    `Balance grows to ${formatCurrency(plan.endingBalance)} over ${years} ` +
    `year${years === 1 ? '' : 's'}, made up of ${formatCurrency(plan.initialInvestment)} ` +
    `initial investment, ${formatCurrency(plan.totalContributions)} contributions and ` +
    `${formatCurrency(plan.totalInterest)} interest. The same figures are in the schedule ` +
    `table below.`
  );
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

/** Fields cleared by Reset. The structural controls are restored, not cleared. */
const CLEARED_FIELDS = [
  'initialInvestment',
  'annualContribution',
  'monthlyContribution',
  'annualRatePct',
  'years',
  'months',
  'taxRatePct',
] as const;

export const interestBinding: FormCalculatorBinding<InterestValues, InterestComputed> = {
  readValues(root) {
    const read = (name: string) => field(root, name)?.value ?? '';
    return {
      initialInvestment: read('initialInvestment'),
      annualContribution: read('annualContribution'),
      monthlyContribution: read('monthlyContribution'),
      // Read by data attribute, not by name: the island renames radio group names per
      // instance so two copies on one page do not share a group, and a name lookup
      // would then find nothing.
      contributeAt: root.querySelector<HTMLInputElement>('[data-int-timing]:checked')?.value ?? '',
      annualRatePct: read('annualRatePct'),
      compound: read('compound'),
      years: read('years'),
      months: read('months'),
      taxRatePct: read('taxRatePct'),
      inflationRatePct: read('inflationRatePct'),
    };
  },

  validate: validateInterestValues,

  compute: computeInterest,

  /**
   * The ending balance — but only once the whole result reconciles. Returning the NaN
   * sentinel puts the shell in `invalid` rather than showing a projection whose parts
   * contradict each other.
   */
  resultValue(result) {
    return planReconciles(result.plan) ? result.plan.endingBalance : FAIL;
  },

  describeResult: describeInterestResult,

  renderResult(result, context: FormRenderContext) {
    const plan = result.plan;
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };
    const show = (sel: string, visible: boolean) => {
      const el = q(sel);
      if (el) el.hidden = !visible;
    };
    const setWidth = (sel: string, pct: number) => {
      const el = q(sel);
      if (el) el.style.width = `${pct}%`;
    };

    setText('[data-result-when~="valid"] [data-result-value]', formatCurrency(plan.endingBalance));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(plan.endingBalance));

    // The reference's seven lines, in its order.
    setText('[data-int-ending]', formatCurrency(plan.endingBalance));
    setText('[data-int-principal]', formatCurrency(plan.totalPrincipal));
    setText('[data-int-contrib]', formatCurrency(plan.totalContributions));
    setText('[data-int-interest]', formatCurrency(plan.totalInterest));
    setText('[data-int-interest-initial]', formatCurrency(plan.interestOfInitial));
    setText('[data-int-interest-contrib]', formatCurrency(plan.interestOfContributions));

    // Buying power only says something when there is inflation to adjust for; at 0%
    // it would restate the ending balance under a longer name.
    const adjusted = result.inflationRatePct > 0;
    show('[data-int-buying-row]', adjusted);
    if (adjusted) setText('[data-int-buying]', formatCurrency(plan.buyingPower));

    // Tax is an extra line that appears only when a tax rate was actually entered.
    const taxed = plan.totalTax > 0;
    show('[data-int-tax-row]', taxed);
    if (taxed) setText('[data-int-tax]', formatCurrency(plan.totalTax));

    // Proportion bar — three parts of one positive whole.
    const stackable = plan.endingBalance > 0 && plan.totalInterest >= 0;
    show('[data-int-split]', stackable);
    if (stackable) {
      const amounts: Record<string, number> = {
        initial: plan.initialInvestment,
        contrib: plan.totalContributions,
        interest: plan.totalInterest,
      };
      for (const key of ['initial', 'contrib', 'interest']) {
        const value = share(amounts[key], plan.endingBalance);
        setWidth(`[data-int-seg-${key}]`, value * 100);
        setText(`[data-int-share-${key}]`, percentLabel(value));
        setText(`[data-int-share-${key}-amt]`, formatCurrencyRounded(amounts[key]));
      }
    }

    const charted = drawAccumulationChart(q('[data-int-chart]'), yearStacks(plan), {
      prefix: 'int',
      format: formatCurrency,
      label: chartLabel(plan),
    });
    show('[data-int-chart-figure]', charted);

    fillSchedules(scope, plan);
    show('[data-int-schedule-block]', plan.annual.length > 0);
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of CLEARED_FIELDS) {
      const el = field(root, name);
      if (el) el.value = '';
    }
    const compound = field(root, 'compound');
    if (compound) compound.value = 'annually';
    const inflation = field(root, 'inflationRatePct');
    if (inflation) inflation.value = DEFAULT_INFLATION_PCT;
    const beginning = root.querySelector<HTMLInputElement>('[data-int-timing][value="beginning"]');
    if (beginning) beginning.checked = true;
  },
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * The labelled example shown on first load — the published worked case the engine
 * tests pin to the cent, so the example a visitor sees is provably the same
 * arithmetic the calculator will do with their own numbers.
 */
export const INTEREST_EXAMPLE_VALUES: InterestValues = {
  initialInvestment: '20000',
  annualContribution: '5000',
  monthlyContribution: '0',
  contributeAt: 'beginning',
  annualRatePct: '5',
  compound: 'annually',
  years: '5',
  months: '0',
  taxRatePct: '0',
  inflationRatePct: '3',
};
