/**
 * Savings form binding — the accumulation calculator's validation, computation
 * guard and presentation. The pure model lives in `./savings`; nothing here does
 * arithmetic that the engine could do instead.
 *
 * FIELDS. The set matches the reference calculator one for one, in its order:
 * initial deposit · annual contribution (+ its yearly increase) · monthly
 * contribution (+ its yearly increase) · interest rate · compound · years to
 * save · tax rate.
 *
 * REQUIRED vs BLANK. Only three inputs have no sensible default and are always
 * required — the initial deposit, the interest rate and the term. The two
 * contributions, their two increases and the tax rate mean "none" when left
 * blank, which is what a blank contribution box plainly means. That is an
 * explicit empty-string branch, NOT `Number(v) || 0`: "abc" is still an error,
 * and only a genuinely empty field reads as zero.
 *
 * NEGATIVES ARE REAL INPUTS. A negative opening balance or contribution is
 * accepted, because drawing an account down is a question this calculator can
 * answer. Only the parts of the UI that would be nonsense on a negative balance
 * (the proportion bar and the stacked chart) stand down; the numbers and the
 * schedule are shown regardless.
 *
 * THE GUARD. `resultValue` returns a NaN sentinel unless the ENTIRE result
 * reconciles — the four summary lines against each other, the yearly rows against
 * the totals, and the yearly balances against the months they close. The runtime's
 * finite gate then refuses to render a partial or self-contradictory projection,
 * so a reader never sees four figures that do not add up.
 */
import {
  MAX_SAVINGS_YEARS,
  isCompoundFrequency,
  projectSavingsPlan,
  requiredMonthlyForGoal,
  type CompoundFrequency,
  type SavingsPlanResult,
} from './savings';
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

export type SavingsMode = 'project' | 'goal';

export interface SavingsValues {
  mode: SavingsMode;
  initialDeposit: string;
  annualContribution: string;
  annualIncreasePct: string;
  monthlyContribution: string;
  monthlyIncreasePct: string;
  annualRatePct: string;
  compound: string;
  years: string;
  taxRatePct: string;
  goal: string;
}

export type SavingsComputed =
  | { status: 'projected'; mode: 'project'; plan: SavingsPlanResult }
  | {
      status: 'required-deposit';
      mode: 'goal';
      goal: number;
      /** null when no finite deposit reaches the goal. */
      monthlyDeposit: number | null;
      goalAlreadyReached: boolean;
      /** The projection the solved deposit produces — null alongside an unreachable goal. */
      plan: SavingsPlanResult | null;
    };

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** Any finite number, sign included — a deposit or contribution may be negative. */
function parseSigned(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  return Number.isFinite(n) ? n : 'invalid';
}

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

/** A whole number of years, 1 … MAX_SAVINGS_YEARS. Fractions are rejected, not rounded. */
function parseYears(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_SAVINGS_YEARS) return 'invalid';
  return n;
}

/** Finite and strictly positive — a savings goal. */
function parsePositive(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

/**
 * A field whose blank state means "none". Returns the fallback for an empty box and
 * still reports a real error for anything unparseable — the distinction `Number(v) || 0`
 * throws away.
 */
function optional(raw: string, parse: (s: string) => NumParse, fallback = 0): NumParse {
  const parsed = parse(raw);
  return parsed === 'empty' ? fallback : parsed;
}

export function validateSavingsValues(values: SavingsValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const initial = parseSigned(values.initialDeposit);
  if (initial === 'empty') fieldErrors.initialDeposit = 'Enter an initial deposit.';
  else if (initial === 'invalid') fieldErrors.initialDeposit = 'Enter an initial deposit as a number.';

  const rate = parseNonNegative(values.annualRatePct);
  if (rate === 'empty') fieldErrors.annualRatePct = 'Enter an interest rate.';
  else if (rate === 'invalid') fieldErrors.annualRatePct = 'Enter an interest rate of zero or more.';

  const years = parseYears(values.years);
  if (years === 'empty') fieldErrors.years = 'Enter the number of years to save.';
  else if (years === 'invalid')
    fieldErrors.years = `Enter a whole number of years from 1 to ${MAX_SAVINGS_YEARS}.`;

  if (!isCompoundFrequency(values.compound)) {
    fieldErrors.compound = 'Choose how often interest compounds.';
  }

  const annual = optional(values.annualContribution, parseSigned);
  if (annual === 'invalid') fieldErrors.annualContribution = 'Enter an annual contribution as a number.';

  const annualInc = optional(values.annualIncreasePct, parseNonNegative);
  if (annualInc === 'invalid')
    fieldErrors.annualIncreasePct = 'Enter a yearly increase of zero or more.';

  const monthlyInc = optional(values.monthlyIncreasePct, parseNonNegative);
  if (monthlyInc === 'invalid')
    fieldErrors.monthlyIncreasePct = 'Enter a yearly increase of zero or more.';

  const tax = optional(values.taxRatePct, (s) => parseWithin(s, 0, 100));
  if (tax === 'invalid') fieldErrors.taxRatePct = 'Enter a tax rate from 0 to 100.';

  // Only the active mode's own field is required; the other is hidden and disabled.
  if (values.mode === 'project') {
    const monthly = optional(values.monthlyContribution, parseSigned);
    if (monthly === 'invalid')
      fieldErrors.monthlyContribution = 'Enter a monthly contribution as a number.';
  } else {
    const goal = parsePositive(values.goal);
    if (goal === 'empty') fieldErrors.goal = 'Enter a savings goal.';
    else if (goal === 'invalid') fieldErrors.goal = 'Enter a savings goal greater than zero.';
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

export function computeSavings(values: SavingsValues): SavingsComputed {
  const shared = {
    initialDeposit: num(values.initialDeposit),
    annualContribution: num(values.annualContribution),
    annualIncreasePct: num(values.annualIncreasePct),
    monthlyIncreasePct: num(values.monthlyIncreasePct),
    annualRatePct: num(values.annualRatePct),
    compound: values.compound as CompoundFrequency,
    years: num(values.years),
    taxRatePct: num(values.taxRatePct),
  };

  if (values.mode === 'project') {
    return {
      status: 'projected',
      mode: 'project',
      plan: projectSavingsPlan({ ...shared, monthlyContribution: num(values.monthlyContribution) }),
    };
  }

  // Reach-a-goal hides the monthly contribution AND its increase, because the answer
  // is a flat monthly figure: "contribute this much every month". Solving with a
  // rising contribution would make the headline mean something the label does not say.
  const goalBase = { ...shared, monthlyIncreasePct: 0 };
  const goal = num(values.goal);
  const monthlyDeposit = requiredMonthlyForGoal(goalBase, goal);
  return {
    status: 'required-deposit',
    mode: 'goal',
    goal,
    monthlyDeposit,
    goalAlreadyReached: monthlyDeposit === 0,
    // The plan the solved deposit produces, so the schedule and chart show the
    // route to the goal rather than leaving the reader with a bare number.
    plan:
      monthlyDeposit === null
        ? null
        : projectSavingsPlan({ ...goalBase, monthlyContribution: monthlyDeposit }),
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
 * True only when a plan is wholly self-consistent: the summary adds up, the yearly
 * rows sum to the totals, and each yearly balance is the balance of the month that
 * closes it. Anything less is a projection we refuse to show.
 */
function planReconciles(p: SavingsPlanResult, years: number): boolean {
  if (!allFinite(p.endBalance, p.initialDeposit, p.totalContributions, p.totalInterest, p.totalTax))
    return false;
  if (p.totalTax < 0) return false;
  if (p.annual.length !== years || p.months.length !== years * 12) return false;
  if (
    Math.abs(p.initialDeposit + p.totalContributions + p.totalInterest - p.endBalance) >
    reconTol(p.endBalance)
  )
    return false;

  let deposits = 0;
  let interest = 0;
  for (const y of p.annual) {
    if (!allFinite(y.deposit, y.interest, y.tax, y.balance)) return false;
    deposits += y.deposit;
    interest += y.interest;
    // The yearly balance must be the balance the twelfth month of that year ended on.
    const closing = p.months[y.year * 12 - 1];
    if (!closing || Math.abs(closing.balance - y.balance) > reconTol(y.balance)) return false;
  }
  // Every deposit shown in the schedule is the opening balance plus every contribution.
  if (Math.abs(deposits - (p.initialDeposit + p.totalContributions)) > reconTol(deposits))
    return false;
  if (Math.abs(interest - p.totalInterest) > reconTol(interest)) return false;
  if (p.annual.length > 0 && Math.abs(p.annual[p.annual.length - 1].balance - p.endBalance) > reconTol(p.endBalance))
    return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** A USD amount in spoken form, e.g. "45320 dollars", "325 dollars and 50 cents". */
export function spokenUSD(value: number): string {
  const negative = value < 0;
  const cents = Math.round(Math.abs(value) * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${negative ? 'minus ' : ''}${dollars} dollar${dollars === 1 && !negative ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

const ALREADY_REACHED =
  'Your initial deposit and annual contribution already reach this goal within the term, so no monthly contribution is required.';
const UNREACHABLE = 'This goal cannot be reached within the term you entered.';

export function describeSavingsResult(result: SavingsComputed): string {
  if (result.status === 'projected') {
    return `Your end balance is ${spokenUSD(result.plan.endBalance)}.`;
  }
  if (result.monthlyDeposit === null) return UNREACHABLE;
  if (result.goalAlreadyReached) {
    return 'No monthly contribution is required — your plan already reaches the goal.';
  }
  return `You need to contribute ${spokenUSD(result.monthlyDeposit)} a month to reach your goal.`;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

function yearStacks(plan: SavingsPlanResult): YearStack[] | null {
  if (plan.initialDeposit < 0) return null;
  const out: YearStack[] = [];
  let contributions = 0;
  let interest = 0;
  for (const y of plan.annual) {
    // The year's deposit column carries the opening balance in year 1; strip it back
    // out so the stack separates what was put in from what the account earned.
    contributions += y.year === 1 ? y.deposit - plan.initialDeposit : y.deposit;
    interest += y.interest;
    if (contributions < 0 || interest < 0) return null;
    out.push({
      year: y.year,
      initial: plan.initialDeposit,
      contributions,
      interest,
      total: plan.initialDeposit + contributions + interest,
    });
  }
  return out.length ? out : null;
}

const SCHEDULE = { prefix: 'sv', format: formatCurrency };

/** Both views of one computed plan. Only the monthly view carries year dividers. */
function fillSchedules(scope: HTMLElement, plan: SavingsPlanResult): void {
  fillSchedule(
    scope.querySelector<HTMLElement>('[data-sv-rows="yearly"]'),
    plan.annual.map((y) => ({ period: y.year, deposit: y.deposit, interest: y.interest, balance: y.balance })),
    SCHEDULE,
  );
  fillSchedule(
    scope.querySelector<HTMLElement>('[data-sv-rows="monthly"]'),
    plan.months.map((m) => ({ period: m.month, deposit: m.deposit, interest: m.interest, balance: m.balance })),
    SCHEDULE,
    true,
  );
}

/** The chart's spoken description — what a reader who cannot see it needs told. */
function chartLabel(plan: SavingsPlanResult): string {
  const years = plan.annual.length;
  return (
    `Balance grows to ${formatCurrency(plan.endBalance)} over ${years} ` +
    `year${years === 1 ? '' : 's'}, made up of ${formatCurrency(plan.initialDeposit)} ` +
    `initial deposit, ${formatCurrency(plan.totalContributions)} contributions and ` +
    `${formatCurrency(plan.totalInterest)} interest. The same figures are in the schedule table below.`
  );
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

const readMode = (root: HTMLElement): SavingsMode =>
  root.querySelector<HTMLInputElement>('[name="mode"]:checked')?.value === 'goal' ? 'goal' : 'project';

/** Fields cleared by Reset. `compound` keeps its structural default and is not listed. */
const CLEARED_FIELDS = [
  'initialDeposit',
  'annualContribution',
  'annualIncreasePct',
  'monthlyContribution',
  'monthlyIncreasePct',
  'annualRatePct',
  'years',
  'taxRatePct',
  'goal',
] as const;

export const savingsBinding: FormCalculatorBinding<SavingsValues, SavingsComputed> = {
  readValues(root) {
    const read = (name: string) => field(root, name)?.value ?? '';
    return {
      mode: readMode(root),
      initialDeposit: read('initialDeposit'),
      annualContribution: read('annualContribution'),
      annualIncreasePct: read('annualIncreasePct'),
      monthlyContribution: read('monthlyContribution'),
      monthlyIncreasePct: read('monthlyIncreasePct'),
      annualRatePct: read('annualRatePct'),
      compound: read('compound'),
      years: read('years'),
      taxRatePct: read('taxRatePct'),
      goal: read('goal'),
    };
  },

  validate: validateSavingsValues,

  compute: computeSavings,

  /**
   * The dominant figure — but only once the whole result reconciles. Returning the
   * NaN sentinel puts the shell in `invalid` rather than showing a projection whose
   * parts disagree.
   */
  resultValue(result) {
    if (result.status === 'projected') {
      const p = result.plan;
      if (!planReconciles(p, p.annual.length)) return FAIL;
      if (p.annual.length < 1) return FAIL;
      return p.endBalance;
    }
    if (result.monthlyDeposit === null || result.plan === null) return FAIL;
    if (!Number.isFinite(result.monthlyDeposit) || result.monthlyDeposit < 0) return FAIL;
    if (!planReconciles(result.plan, result.plan.annual.length)) return FAIL;
    if (result.plan.annual.length < 1) return FAIL;
    // The solved deposit must actually reach the goal when put back through the model.
    if (!result.goalAlreadyReached && result.plan.endBalance < result.goal - reconTol(result.goal))
      return FAIL;
    if (result.goalAlreadyReached !== (result.monthlyDeposit === 0)) return FAIL;
    return result.monthlyDeposit;
  },

  describeResult: describeSavingsResult,

  renderResult(result, context: FormRenderContext) {
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
    const setValue = (shown: string, spoken: string) => {
      setText('[data-result-when~="valid"] [data-result-value]', shown);
      setText('[data-result-when~="valid"] [data-result-value-a11y]', spoken);
    };
    const setLabel = (text: string) => setText('[data-result-when~="valid"] [data-result-summary-label]', text);

    const plan = result.plan;

    if (result.status === 'projected') {
      setLabel('End balance');
      setValue(formatCurrency(result.plan.endBalance), spokenUSD(result.plan.endBalance));
      show('[data-sv-goal-block]', false);
      show('[data-sv-interpretation]', result.plan.endBalance === 0);
      if (result.plan.endBalance === 0) {
        setText(
          '[data-sv-interpretation]',
          'With no deposit, no contributions and no interest, the end balance stays at $0.',
        );
      }
    } else {
      setLabel('Monthly contribution needed');
      const deposit = result.monthlyDeposit ?? 0;
      setValue(formatCurrency(deposit), spokenUSD(deposit));
      show('[data-sv-goal-block]', true);
      setText('[data-sv-goal-amount]', formatCurrency(result.goal));
      show('[data-sv-interpretation]', result.goalAlreadyReached);
      if (result.goalAlreadyReached) setText('[data-sv-interpretation]', ALREADY_REACHED);
    }

    if (!plan) return;

    // The four summary lines, in the reference's order. They add up by construction.
    setText('[data-sv-end]', formatCurrency(plan.endBalance));
    setText('[data-sv-initial]', formatCurrency(plan.initialDeposit));
    setText('[data-sv-contrib]', formatCurrency(plan.totalContributions));
    setText('[data-sv-interest]', formatCurrency(plan.totalInterest));

    // Tax is a fifth line that appears only when a tax rate was actually entered.
    const taxed = plan.totalTax > 0;
    show('[data-sv-tax-row]', taxed);
    if (taxed) setText('[data-sv-tax]', formatCurrency(plan.totalTax));

    // Proportion bar — only meaningful when all three parts are positive shares of a
    // positive balance. A drawn-down or overdrawn account gets the numbers instead.
    const stackable =
      plan.endBalance > 0 &&
      plan.initialDeposit >= 0 &&
      plan.totalContributions >= 0 &&
      plan.totalInterest >= 0;
    show('[data-sv-split]', stackable);
    if (stackable) {
      const parts: [string, number][] = [
        ['initial', share(plan.initialDeposit, plan.endBalance)],
        ['contrib', share(plan.totalContributions, plan.endBalance)],
        ['interest', share(plan.totalInterest, plan.endBalance)],
      ];
      const amounts: Record<string, number> = {
        initial: plan.initialDeposit,
        contrib: plan.totalContributions,
        interest: plan.totalInterest,
      };
      for (const [key, value] of parts) {
        setWidth(`[data-sv-seg-${key}]`, value * 100);
        setText(`[data-sv-share-${key}]`, percentLabel(value));
        setText(`[data-sv-share-${key}-amt]`, formatCurrencyRounded(amounts[key]));
      }
    }

    const charted = drawAccumulationChart(q('[data-sv-chart]'), yearStacks(plan) ?? [], {
      prefix: 'sv',
      format: formatCurrency,
      label: chartLabel(plan),
    });
    show('[data-sv-chart-figure]', charted);

    fillSchedules(scope, plan);
    show('[data-sv-schedule-block]', plan.annual.length > 0);
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of CLEARED_FIELDS) {
      const el = field(root, name);
      if (el) el.value = '';
    }
    const compound = field(root, 'compound');
    if (compound) compound.value = 'annually';
  },
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * The labelled example shown on first load. These values are the published worked
 * case the engine tests pin to the cent, so the example a visitor sees is provably
 * the same arithmetic the calculator will do with their own numbers.
 */
export const SAVINGS_EXAMPLE_VALUES: SavingsValues = {
  mode: 'project',
  initialDeposit: '20000',
  annualContribution: '5000',
  annualIncreasePct: '3',
  monthlyContribution: '0',
  monthlyIncreasePct: '0',
  annualRatePct: '3',
  compound: 'annually',
  years: '10',
  taxRatePct: '0',
  goal: '',
};
