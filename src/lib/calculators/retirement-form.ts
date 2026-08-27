/**
 * Retirement form binding — the four retirement questions on one form.
 *
 * Wraps the pure engine in ./retirement: calculateRetirementPlan,
 * calculateSavingsPlan, calculateWithdrawalPlan and calculateMoneyLasts, each
 * frozen by retirement.test.ts. Nothing here computes; this file is the
 * VALIDATION / PRESENTATION boundary only. The original `calculateRetirement`
 * is untouched and still exported by the engine.
 *
 * FOUR MODES, one form:
 *   plan     — how much do you need to retire, and does the current plan reach it?
 *   save     — what does reaching a known target take from here?
 *   withdraw — what monthly income will the plan actually buy?
 *   lasts    — how long does a pot survive a given withdrawal?
 *
 * Mode is a native radio group INSIDE the form, so the shared runtime recomputes
 * on a mode change exactly as it does on any other input, and mode state stays
 * EPHEMERAL — never in the URL or storage (ratified decision 3). Fields that mean
 * the same thing in more than one mode SHARE a name, so a visitor who types their
 * age once keeps it when they switch questions; validation only ever looks at the
 * fields the selected mode actually uses.
 *
 * Product decisions:
 *   • Task-first: every personal field starts EMPTY behind a labelled worked
 *     example; the visitor presses Calculate for the first result, live-after-first
 *     thereafter. The assumption fields (return, inflation, income growth, the
 *     income-needed and savings percentages) carry the source's documented
 *     defaults — they are non-personal planning assumptions, not the visitor's
 *     figures, and they are the same defaults the reference product ships.
 *   • Two fields accept either a percent of income or a dollar amount, so a
 *     visitor who knows their target in dollars is not made to convert it. The
 *     unit is normalised to the percent the engine wants before it is called, so
 *     there is exactly one calculation.
 *   • The complete-result guard lives in the ordinary `resultValue` (a NaN
 *     sentinel the runtime's default finite gate rejects). There is NO
 *     `isUsableResult`. Never `Number(v) || 0`.
 */
import {
  calculateRetirement,
  calculateRetirementPlan,
  calculateSavingsPlan,
  calculateWithdrawalPlan,
  calculateMoneyLasts,
  MAX_LASTS_MONTHS,
  type BalanceYear,
  type RetirementPlanResult,
  type SavingsPlanResult,
  type WithdrawalPlanResult,
  type MoneyLastsResult,
} from './retirement';
import { formatCurrency, formatCurrencyRounded, formatNumber } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** `calculateRetirement` stays exported for anything still on the simple projection. */
export { calculateRetirement };

export const MIN_AGE = 0;
/** Ages above this are not a retirement plan; it also bounds every projection series. */
export const MAX_AGE = 120;

export const RETIREMENT_MODES = ['plan', 'save', 'withdraw', 'lasts'] as const;
export type RetirementMode = (typeof RETIREMENT_MODES)[number];

export const MODE_LABELS: Record<RetirementMode, string> = {
  plan: 'How much do you need to retire?',
  save: 'How can you save for retirement?',
  withdraw: 'How much can you withdraw after retirement?',
  lasts: 'How long can your money last?',
};

/** The short label the mode selector shows; the long one is the result's heading. */
export const MODE_SHORT: Record<RetirementMode, string> = {
  plan: 'What you need',
  save: 'How to save',
  withdraw: 'What you can withdraw',
  lasts: 'How long it lasts',
};

export const asMode = (raw: string): RetirementMode =>
  (RETIREMENT_MODES as readonly string[]).includes(raw) ? (raw as RetirementMode) : 'plan';

/** A percent of income, or a plain dollar amount — a presentation choice over one engine. */
export const AMOUNT_UNITS = ['percent', 'amount'] as const;
export type AmountUnit = (typeof AMOUNT_UNITS)[number];
export const asUnit = (raw: string): AmountUnit => (raw === 'amount' ? 'amount' : 'percent');

/** The planning assumptions the form ships with, matching the reference product. */
export const DEFAULTS = {
  incomeIncreasePct: '3',
  incomeNeededPct: '75',
  annualReturnPct: '6',
  inflationPct: '3',
  futureSavingsPct: '10',
} as const;

export interface RetirementValues {
  mode: string;

  /* shared across modes */
  currentAge: string;
  retirementAge: string;
  lifeExpectancy: string;
  currentSavings: string;
  annualReturnPct: string;
  inflationPct: string;

  /* plan */
  currentIncome: string;
  incomeIncreasePct: string;
  incomeNeededPct: string;
  incomeNeededUnit: AmountUnit;
  otherMonthlyIncome: string;
  futureSavingsPct: string;
  futureSavingsUnit: AmountUnit;

  /* save */
  amountNeeded: string;

  /* withdraw */
  annualContribution: string;
  monthlyContribution: string;

  /* lasts */
  potAmount: string;
  monthlyWithdrawal: string;
}

/** The computed result carries its mode, so the renderer never has to re-read the form. */
export type RetirementComputed =
  | { mode: 'plan'; plan: RetirementPlanResult }
  | { mode: 'save'; save: SavingsPlanResult }
  | { mode: 'withdraw'; withdraw: WithdrawalPlanResult }
  | { mode: 'lasts'; lasts: MoneyLastsResult };

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure) — strict, never Number(v) || 0          */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** Required whole age in [MIN_AGE, MAX_AGE]. */
function parseAge(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < MIN_AGE || n > MAX_AGE) return 'invalid';
  return n;
}

/** Required, finite, >= 0. */
function parseRequiredNonNegative(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** Optional, finite, >= 0 — empty means zero, an entered 0 is valid. */
function parseOptionalNonNegative(raw: string): 'invalid' | number {
  const t = raw.trim();
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** Required, finite, > 0. */
function parseRequiredPositive(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

export const MSG = {
  ageRequired: 'Enter your current age.',
  ageInvalid: `Enter a current age as a whole number from ${MIN_AGE} to ${MAX_AGE}.`,
  retireRequired: 'Enter your planned retirement age.',
  retireInvalid: `Enter a retirement age as a whole number from ${MIN_AGE} to ${MAX_AGE}.`,
  retireOrder: 'Retirement age must be greater than your current age.',
  lifeRequired: 'Enter your life expectancy.',
  lifeInvalid: `Enter a life expectancy as a whole number from ${MIN_AGE} to ${MAX_AGE}.`,
  lifeOrder: 'Life expectancy must be greater than your retirement age.',
  incomeRequired: 'Enter your current pre-tax income.',
  incomeInvalid: 'Enter a pre-tax income of zero or more.',
  incomeIncrease: 'Enter a yearly income increase of zero or more.',
  incomeNeeded: 'Enter the income you need after retirement, as zero or more.',
  returnRequired: 'Enter an expected annual return.',
  returnInvalid: 'Enter an annual return of zero or more.',
  inflationInvalid: 'Enter an inflation rate of zero or more.',
  otherIncome: 'Enter other retirement income of zero or more.',
  savingsInvalid: 'Enter current savings of zero or more.',
  futureSavings: 'Enter future retirement savings of zero or more.',
  amountNeededRequired: 'Enter the amount you need at retirement.',
  amountNeededInvalid: 'Enter an amount needed greater than zero.',
  annualContribution: 'Enter an annual contribution of zero or more.',
  monthlyContribution: 'Enter a monthly contribution of zero or more.',
  potRequired: 'Enter the amount you have.',
  potInvalid: 'Enter an amount greater than zero.',
  withdrawalRequired: 'Enter how much you plan to withdraw.',
  withdrawalInvalid: 'Enter a withdrawal greater than zero.',
} as const;

/** Which fields each mode actually reads — validation and rendering both key off this. */
export const MODE_FIELDS: Record<RetirementMode, readonly (keyof RetirementValues)[]> = {
  plan: [
    'currentAge', 'retirementAge', 'lifeExpectancy', 'currentIncome', 'incomeIncreasePct',
    'incomeNeededPct', 'annualReturnPct', 'inflationPct', 'otherMonthlyIncome',
    'currentSavings', 'futureSavingsPct',
  ],
  save: ['currentAge', 'retirementAge', 'amountNeeded', 'currentSavings', 'annualReturnPct'],
  withdraw: [
    'currentAge', 'retirementAge', 'lifeExpectancy', 'currentSavings', 'annualContribution',
    'monthlyContribution', 'annualReturnPct', 'inflationPct',
  ],
  lasts: ['potAmount', 'monthlyWithdrawal', 'annualReturnPct'],
};

/**
 * Validate only the fields the SELECTED mode uses. A value left over from another
 * question can never block this one, which is what lets the shared fields stay
 * shared without a mode change dragging in someone else's error.
 */
export function validateRetirementValues(values: RetirementValues): ValidationResult {
  const e: Record<string, string> = {};
  const mode = asMode(values.mode);
  const uses = (f: keyof RetirementValues) => MODE_FIELDS[mode].includes(f);

  let age: NumParse = 'empty';
  let retire: NumParse = 'empty';

  if (uses('currentAge')) {
    age = parseAge(values.currentAge);
    if (age === 'empty') e.currentAge = MSG.ageRequired;
    else if (age === 'invalid') e.currentAge = MSG.ageInvalid;
  }
  if (uses('retirementAge')) {
    retire = parseAge(values.retirementAge);
    if (retire === 'empty') e.retirementAge = MSG.retireRequired;
    else if (retire === 'invalid') e.retirementAge = MSG.retireInvalid;
    else if (typeof age === 'number' && retire <= age) e.retirementAge = MSG.retireOrder;
  }
  if (uses('lifeExpectancy')) {
    const life = parseAge(values.lifeExpectancy);
    if (life === 'empty') e.lifeExpectancy = MSG.lifeRequired;
    else if (life === 'invalid') e.lifeExpectancy = MSG.lifeInvalid;
    else if (typeof retire === 'number' && life <= retire) e.lifeExpectancy = MSG.lifeOrder;
  }
  if (uses('currentIncome')) {
    const income = parseRequiredNonNegative(values.currentIncome);
    if (income === 'empty') e.currentIncome = MSG.incomeRequired;
    else if (income === 'invalid') e.currentIncome = MSG.incomeInvalid;
  }
  if (uses('annualReturnPct')) {
    const ret = parseRequiredNonNegative(values.annualReturnPct);
    if (ret === 'empty') e.annualReturnPct = MSG.returnRequired;
    else if (ret === 'invalid') e.annualReturnPct = MSG.returnInvalid;
  }
  if (uses('amountNeeded')) {
    const need = parseRequiredPositive(values.amountNeeded);
    if (need === 'empty') e.amountNeeded = MSG.amountNeededRequired;
    else if (need === 'invalid') e.amountNeeded = MSG.amountNeededInvalid;
  }
  if (uses('potAmount')) {
    const pot = parseRequiredPositive(values.potAmount);
    if (pot === 'empty') e.potAmount = MSG.potRequired;
    else if (pot === 'invalid') e.potAmount = MSG.potInvalid;
  }
  if (uses('monthlyWithdrawal')) {
    const draw = parseRequiredPositive(values.monthlyWithdrawal);
    if (draw === 'empty') e.monthlyWithdrawal = MSG.withdrawalRequired;
    else if (draw === 'invalid') e.monthlyWithdrawal = MSG.withdrawalInvalid;
  }

  const optional: [keyof RetirementValues, string][] = [
    ['incomeIncreasePct', MSG.incomeIncrease],
    ['incomeNeededPct', MSG.incomeNeeded],
    ['inflationPct', MSG.inflationInvalid],
    ['otherMonthlyIncome', MSG.otherIncome],
    ['currentSavings', MSG.savingsInvalid],
    ['futureSavingsPct', MSG.futureSavings],
    ['annualContribution', MSG.annualContribution],
    ['monthlyContribution', MSG.monthlyContribution],
  ];
  for (const [field, message] of optional) {
    if (uses(field) && parseOptionalNonNegative(values[field] as string) === 'invalid') {
      e[field] = message;
    }
  }

  return Object.keys(e).length ? { ok: false, fieldErrors: e } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — a strict pass-through to the frozen engine     */
/* ------------------------------------------------------------------ */

const num = (raw: string): number => (raw.trim() === '' ? 0 : Number(raw));

/**
 * A dual-unit field → the PERCENT the engine wants. A dollar entry is expressed
 * against the base it belongs to (annual income), so both units reach exactly the
 * same calculation. A zero base cannot be divided by, so it yields 0.
 */
export function percentOf(base: number, value: number, unit: AmountUnit): number {
  if (unit === 'percent') return value;
  return base > 0 ? (value / base) * 100 : 0;
}

export function computeRetirement(values: RetirementValues): RetirementComputed {
  const mode = asMode(values.mode);
  const annualReturnPct = num(values.annualReturnPct);

  if (mode === 'save') {
    return {
      mode,
      save: calculateSavingsPlan({
        currentAge: num(values.currentAge),
        retirementAge: num(values.retirementAge),
        amountNeeded: num(values.amountNeeded),
        currentSavings: num(values.currentSavings),
        annualReturnPct,
      }),
    };
  }
  if (mode === 'withdraw') {
    return {
      mode,
      withdraw: calculateWithdrawalPlan({
        currentAge: num(values.currentAge),
        retirementAge: num(values.retirementAge),
        lifeExpectancy: num(values.lifeExpectancy),
        currentSavings: num(values.currentSavings),
        annualContribution: num(values.annualContribution),
        monthlyContribution: num(values.monthlyContribution),
        annualReturnPct,
        inflationPct: num(values.inflationPct),
      }),
    };
  }
  if (mode === 'lasts') {
    return {
      mode,
      lasts: calculateMoneyLasts({
        amount: num(values.potAmount),
        monthlyWithdrawal: num(values.monthlyWithdrawal),
        annualReturnPct,
      }),
    };
  }

  // The two dual-unit fields rejoin the single calculation here: a dollar target
  // is expressed against the income it is a share of before the engine sees it.
  const currentIncome = num(values.currentIncome);
  const incomeIncreasePct = num(values.incomeIncreasePct);
  const yearsToRetirement = Math.max(0, num(values.retirementAge) - num(values.currentAge));
  const incomeAtRetirement = currentIncome * Math.pow(1 + incomeIncreasePct / 100, yearsToRetirement);
  return {
    mode: 'plan',
    plan: calculateRetirementPlan({
      currentAge: num(values.currentAge),
      retirementAge: num(values.retirementAge),
      lifeExpectancy: num(values.lifeExpectancy),
      currentIncome,
      incomeIncreasePct,
      // A dollar figure here is what the visitor wants to LIVE ON, so it is a share
      // of the income at retirement — the same base the percent is taken of.
      incomeNeededPct: percentOf(incomeAtRetirement, num(values.incomeNeededPct), values.incomeNeededUnit),
      annualReturnPct,
      inflationPct: num(values.inflationPct),
      otherMonthlyIncome: num(values.otherMonthlyIncome),
      currentSavings: num(values.currentSavings),
      // ...whereas a dollar saving is a share of income TODAY, which is what it is paid from.
      futureSavingsPct: percentOf(currentIncome, num(values.futureSavingsPct), values.futureSavingsUnit),
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN;
const reconTol = (magnitude: number) => Math.max(1, Math.abs(magnitude) * 1e-6);

const finiteNonNegative = (...values: number[]): boolean =>
  values.every((v) => Number.isFinite(v) && v >= 0);

/** A projection series must be ordered by age, finite, non-negative and bounded. */
function seriesOk(series: readonly BalanceYear[]): boolean {
  if (!Array.isArray(series)) return false;
  if (series.length > MAX_AGE) return false;
  for (let i = 0; i < series.length; i++) {
    const row = series[i];
    if (!Number.isFinite(row.age) || !Number.isFinite(row.balance) || row.balance < 0) return false;
    if (i > 0 && row.age <= series[i - 1].age) return false;
  }
  return true;
}

/**
 * The dominant figure for the mode — but only when the WHOLE result is well-formed.
 * Each mode has its own reconciliation, because each answers a different question:
 * a plan's income figures must come from its own annuity factor, a savings target
 * must actually close its gap, and a pot that lasts must have been drawn down.
 * Any failure returns the NaN sentinel the runtime's default finite gate rejects —
 * there is deliberately NO `isUsableResult`.
 */
export function completeResultValue(result: RetirementComputed): number {
  if (result.mode === 'plan') {
    const p = result.plan;
    if (!finiteNonNegative(p.amountNeeded, p.amountProjected, p.incomeAtRetirement, p.factor, p.shortfall, p.saveMonthly, p.saveAnnually, p.savePctOfIncome, p.readiness)) return FAIL;
    if (!finiteNonNegative(p.incomeFromProjected, p.incomeFromProjectedToday, p.incomeFromNeeded, p.incomeFromNeededToday)) return FAIL;
    if (!Number.isInteger(p.yearsToRetirement) || p.yearsToRetirement < 0) return FAIL;
    if (!Number.isInteger(p.retirementYears) || p.retirementYears < 0) return FAIL;
    // Both incomes must come from the SAME factor as the pots they are drawn from.
    if (p.factor > 0) {
      if (Math.abs(p.incomeFromNeeded * p.factor - p.amountNeeded) > reconTol(p.amountNeeded)) return FAIL;
      if (Math.abs(p.incomeFromProjected * p.factor - p.amountProjected) > reconTol(p.amountProjected)) return FAIL;
    }
    if (Math.abs(p.shortfall - Math.max(0, p.amountNeeded - p.amountProjected)) > reconTol(p.shortfall)) return FAIL;
    if (p.onTrack !== p.amountProjected >= p.amountNeeded) return FAIL;
    if (!seriesOk(p.projectedSeries) || !seriesOk(p.neededSeries)) return FAIL;
    return p.amountNeeded;
  }

  if (result.mode === 'save') {
    const s = result.save;
    if (!finiteNonNegative(s.savingsAlone, s.gap, s.saveMonthly, s.saveAnnually)) return FAIL;
    if (!Number.isInteger(s.years) || s.years < 0) return FAIL;
    if (s.alreadyThere !== s.gap <= 0) return FAIL;
    return s.saveMonthly;
  }

  if (result.mode === 'withdraw') {
    const w = result.withdraw;
    if (!finiteNonNegative(w.amountAtRetirement, w.monthlyWithdrawal, w.monthlyWithdrawalToday, w.annualWithdrawal, w.factor)) return FAIL;
    if (!Number.isInteger(w.yearsToRetirement) || !Number.isInteger(w.retirementYears)) return FAIL;
    if (w.factor > 0 && Math.abs(w.monthlyWithdrawal * w.factor - w.amountAtRetirement) > reconTol(w.amountAtRetirement)) return FAIL;
    if (Math.abs(w.annualWithdrawal - w.monthlyWithdrawal * 12) > reconTol(w.annualWithdrawal)) return FAIL;
    if (!seriesOk(w.series)) return FAIL;
    return w.monthlyWithdrawal;
  }

  const l = result.lasts;
  if (!finiteNonNegative(l.months, l.years, l.remainingMonths, l.totalWithdrawn, l.endingBalance)) return FAIL;
  if (!Number.isInteger(l.months) || l.months > MAX_LASTS_MONTHS) return FAIL;
  if (l.remainingMonths > 11) return FAIL;
  if (l.years * 12 + l.remainingMonths !== l.months) return FAIL;
  if (l.reachedLimit !== l.months >= MAX_LASTS_MONTHS) return FAIL;
  // "Never runs out" is a promise, so it is the strictest claim here: it may only
  // be made when the projection ran the full term AND the balance did not fall.
  if (l.neverRunsOut && !l.reachedLimit) return FAIL;
  if (l.neverRunsOut && l.endingBalance <= 0) return FAIL;
  // A projection that ENDED must have emptied the account; one that was cut off
  // at the cap must still have something left.
  if (!l.reachedLimit && l.months > 0 && l.endingBalance > 0.01) return FAIL;
  // A pot that ran down must have paid something out on the way.
  if (!l.reachedLimit && l.months > 0 && l.totalWithdrawn <= 0) return FAIL;
  return l.months;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** Big money in the reference's own shorthand: 1878183 → "$1.88M". */
export function formatCompactUSD(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${Math.round(value / 1e3)}K`;
  return formatCurrencyRounded(value);
}

/**
 * The headline for "how long can your money last". Three distinct outcomes, and
 * only the first may promise that the money lasts forever.
 */
export function lastsHeadline(l: MoneyLastsResult): string {
  if (l.neverRunsOut) return 'Indefinitely';
  if (l.reachedLimit) return 'Over 100 years';
  return durationLabel(l.months);
}

/** Whole months as words: 183 → "15 years 3 months". */
export function durationLabel(months: number): string {
  if (!Number.isFinite(months) || months <= 0) return 'less than a month';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (rest > 0) parts.push(`${rest} month${rest === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** A USD amount in spoken form, for the single restrained announcement. */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

export function describeRetirementResult(result: RetirementComputed): string {
  if (result.mode === 'plan') {
    const p = result.plan;
    const need = spokenUSD(Math.round(p.amountNeeded));
    const have = spokenUSD(Math.round(p.amountProjected));
    return p.onTrack
      ? `You need about ${need} at retirement, and your plan reaches about ${have}.`
      : `You need about ${need} at retirement, but your plan reaches about ${have}.`;
  }
  if (result.mode === 'save') {
    const s = result.save;
    return s.alreadyThere
      ? 'Your current savings already grow to the amount you need, with nothing more to add.'
      : `To reach your target you would save about ${spokenUSD(Math.round(s.saveMonthly))} a month.`;
  }
  if (result.mode === 'withdraw') {
    const w = result.withdraw;
    return `Your plan supports about ${spokenUSD(Math.round(w.monthlyWithdrawal))} a month in retirement.`;
  }
  const l = result.lasts;
  if (l.neverRunsOut) return 'At this withdrawal your money is not projected to run out.';
  if (l.reachedLimit) return 'Your money is projected to last more than 100 years.';
  return `Your money is projected to last ${durationLabel(l.months)}.`;
}

/** The one-sentence reading of the result, shown under the dominant figure. */
export function interpretRetirement(result: RetirementComputed): string {
  if (result.mode === 'plan') {
    const p = result.plan;
    if (p.onTrack) {
      return `Based on your current plan you will have about ${formatCompactUSD(p.amountProjected)} at age ${p.yearsToRetirement > 0 ? '' : ''}retirement — enough to cover what you need.`.replace('age retirement', 'retirement');
    }
    return `Based on your current plan, you will have about ${formatCompactUSD(p.amountProjected)} at retirement, which is ${Math.round(p.readiness * 100)}% of what you need.`;
  }
  if (result.mode === 'save') {
    const s = result.save;
    return s.alreadyThere
      ? `Your savings alone grow to ${formatCompactUSD(s.savingsAlone)} over ${s.years} years, which already covers the target.`
      : `Your savings alone grow to ${formatCompactUSD(s.savingsAlone)} over ${s.years} years, leaving ${formatCompactUSD(s.gap)} to save.`;
  }
  if (result.mode === 'withdraw') {
    const w = result.withdraw;
    return `Your plan reaches ${formatCompactUSD(w.amountAtRetirement)} at retirement, which supports ${formatCurrencyRounded(w.monthlyWithdrawal)} a month for ${w.retirementYears} years, rising with inflation.`;
  }
  const l = result.lasts;
  if (l.neverRunsOut) {
    return 'The return on the remaining balance covers each withdrawal, so the balance holds and is not projected to run out.';
  }
  if (l.reachedLimit) {
    return 'The balance is still falling after 100 years, so it does eventually run out — just beyond any horizon worth planning to.';
  }
  return `Each withdrawal takes more than the balance earns, so the money runs out after ${durationLabel(l.months)}.`;
}

/* ------------------------------------------------------------------ */
/* DOM rendering (safe — no innerHTML)                                 */
/* ------------------------------------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/** The next round number at or above `value` — 1, 2, 2.5 or 5 × a power of ten. */
function niceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * magnitude) return step * magnitude;
  return 10 * magnitude;
}

const compactAxis = (value: number): string => {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `$${Math.round(value / 1e3)}K`;
  return `$${Math.round(value)}`;
};

/**
 * Balance by age: the year-end balance of each plan, rising to retirement and
 * drawn down to nothing at life expectancy. Two series in the same unit on ONE
 * axis, drawn as 2px round-joined polylines with a hairline grid — no per-point
 * labels, and the legend beside the chart carries identity so nothing depends on
 * colour alone. Plain SVG built with the DOM API: no library, no innerHTML.
 */
export function drawBalanceChart(
  host: HTMLElement | null,
  series: { points: readonly BalanceYear[]; key: string }[],
  label: string,
): void {
  if (!host) return;
  host.replaceChildren();
  const usable = series.filter((s) => s.points.length > 1);
  if (!usable.length) return;

  const W = 340;
  const H = 190;
  const PAD = { top: 8, right: 10, bottom: 22, left: 48 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const allAges = usable.flatMap((s) => s.points.map((p) => p.age));
  const minAge = Math.min(...allAges);
  const maxAge = Math.max(...allAges);
  const peak = niceCeiling(Math.max(...usable.flatMap((s) => s.points.map((p) => p.balance)), 1));
  const spanAge = Math.max(1, maxAge - minAge);
  const x = (age: number) => PAD.left + ((age - minAge) / spanAge) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / peak) * plotH;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ret-chart__svg', role: 'img', 'aria-label': label });

  for (const t of [0, 0.5, 1]) {
    const gy = PAD.top + plotH * t;
    svg.append(svgEl('line', { x1: PAD.left, y1: gy, x2: W - PAD.right, y2: gy, class: 'ret-chart__grid' }));
    const tick = svgEl('text', { x: PAD.left - 6, y: gy + 3.5, class: 'ret-chart__tick', 'text-anchor': 'end' });
    tick.textContent = compactAxis(peak * (1 - t));
    svg.append(tick);
  }
  for (const [i, age] of [minAge, maxAge].entries()) {
    const tx = svgEl('text', { x: x(age), y: H - 6, class: 'ret-chart__tick', 'text-anchor': i === 0 ? 'start' : 'end' });
    tx.textContent = `Age ${age}`;
    svg.append(tx);
  }
  for (const s of usable) {
    const points = s.points.map((p) => `${x(p.age).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
    svg.append(svgEl('polyline', { points, class: `ret-chart__line ret-chart__line--${s.key}` }));
  }
  host.append(svg);
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
const checkedControl = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]:checked`);

export const retirementBinding: FormCalculatorBinding<RetirementValues, RetirementComputed> = {
  readValues(root) {
    const val = (n: string) => control(root, n)?.value ?? '';
    return {
      mode: checkedControl(root, 'mode')?.value ?? 'plan',
      currentAge: val('currentAge'),
      retirementAge: val('retirementAge'),
      lifeExpectancy: val('lifeExpectancy'),
      currentSavings: val('currentSavings'),
      annualReturnPct: val('annualReturnPct'),
      inflationPct: val('inflationPct'),
      currentIncome: val('currentIncome'),
      incomeIncreasePct: val('incomeIncreasePct'),
      incomeNeededPct: val('incomeNeededPct'),
      incomeNeededUnit: asUnit(val('incomeNeededUnit')),
      otherMonthlyIncome: val('otherMonthlyIncome'),
      futureSavingsPct: val('futureSavingsPct'),
      futureSavingsUnit: asUnit(val('futureSavingsUnit')),
      amountNeeded: val('amountNeeded'),
      annualContribution: val('annualContribution'),
      monthlyContribution: val('monthlyContribution'),
      potAmount: val('potAmount'),
      monthlyWithdrawal: val('monthlyWithdrawal'),
    };
  },

  validate: validateRetirementValues,

  compute: computeRetirement,

  /** The complete-result guard as the ordinary result value — no isUsableResult. */
  resultValue: completeResultValue,

  describeResult: describeRetirementResult,

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

    // Only the selected mode's panel is shown; the rest are removed from the page,
    // so a stale figure from another question can never be read as this one's answer.
    for (const m of RETIREMENT_MODES) show(`[data-ret-panel="${m}"]`, m === result.mode);
    setText('[data-ret-question]', MODE_LABELS[result.mode]);
    setText('[data-ret-interpretation]', interpretRetirement(result));

    if (result.mode === 'plan') {
      const p = result.plan;
      setText('[data-result-when~="valid"] [data-result-summary-label]', `You will need at age ${p.yearsToRetirement + numAge(scope)}`);
      setText('[data-result-when~="valid"] [data-result-value]', formatCompactUSD(p.amountNeeded));
      setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(Math.round(p.amountNeeded)));
      setText('[data-ret-need]', formatCompactUSD(p.amountNeeded));
      setText('[data-ret-have]', formatCompactUSD(p.amountProjected));
      setText('[data-ret-readiness]', `${Math.round(p.readiness * 100)}%`);
      setW(q('[data-ret-bar-have]'), Math.min(100, p.readiness * 100));
      setText('[data-ret-have-income]', formatCurrencyRounded(p.incomeFromProjected));
      setText('[data-ret-have-income-today]', formatCurrencyRounded(p.incomeFromProjectedToday));
      setText('[data-ret-need-income]', formatCurrencyRounded(p.incomeFromNeeded));
      setText('[data-ret-need-income-today]', formatCurrencyRounded(p.incomeFromNeededToday));
      setText('[data-ret-save-heading]', `How can you save ${formatCompactUSD(p.amountNeeded)}?`);
      setText('[data-ret-save-monthly]', formatCurrencyRounded(p.saveMonthly));
      setText('[data-ret-save-annual]', formatCurrencyRounded(p.saveAnnually));
      setText('[data-ret-save-pct]', `${formatNumber(p.savePctOfIncome, 2)}%`);
      show('[data-ret-ontrack]', p.onTrack);
      show('[data-ret-save-block]', !p.onTrack);
      drawBalanceChart(
        q('[data-ret-chart]'),
        [
          { points: p.projectedSeries, key: 'have' },
          { points: p.neededSeries, key: 'need' },
        ],
        `Year-end balance by age on each plan: the current plan peaks at ${formatCompactUSD(p.amountProjected)} at retirement, the required plan at ${formatCompactUSD(p.amountNeeded)}, both drawn down to zero by age ${p.projectedSeries.length ? p.projectedSeries[p.projectedSeries.length - 1].age : 0}.`,
      );
      return;
    }

    if (result.mode === 'save') {
      const s = result.save;
      setText('[data-result-when~="valid"] [data-result-summary-label]', 'Save every month');
      setText('[data-result-when~="valid"] [data-result-value]', formatCurrencyRounded(s.saveMonthly));
      setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(Math.round(s.saveMonthly)));
      setText('[data-ret-save2-monthly]', formatCurrencyRounded(s.saveMonthly));
      setText('[data-ret-save2-annual]', formatCurrencyRounded(s.saveAnnually));
      setText('[data-ret-save2-alone]', formatCompactUSD(s.savingsAlone));
      setText('[data-ret-save2-gap]', formatCompactUSD(s.gap));
      setText('[data-ret-save2-years]', String(s.years));
      return;
    }

    if (result.mode === 'withdraw') {
      const w = result.withdraw;
      setText('[data-result-when~="valid"] [data-result-summary-label]', 'You can withdraw every month');
      setText('[data-result-when~="valid"] [data-result-value]', formatCurrencyRounded(w.monthlyWithdrawal));
      setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(Math.round(w.monthlyWithdrawal)));
      setText('[data-ret-w-monthly]', formatCurrencyRounded(w.monthlyWithdrawal));
      setText('[data-ret-w-today]', formatCurrencyRounded(w.monthlyWithdrawalToday));
      setText('[data-ret-w-annual]', formatCurrencyRounded(w.annualWithdrawal));
      setText('[data-ret-w-pot]', formatCompactUSD(w.amountAtRetirement));
      setText('[data-ret-w-years]', String(w.retirementYears));
      drawBalanceChart(
        q('[data-ret-chart-w]'),
        [{ points: w.series, key: 'have' }],
        `Year-end balance by age: the plan peaks at ${formatCompactUSD(w.amountAtRetirement)} at retirement and is drawn down to zero by age ${w.series.length ? w.series[w.series.length - 1].age : 0}.`,
      );
      return;
    }

    const l = result.lasts;
    const headline = lastsHeadline(l);
    setText('[data-result-when~="valid"] [data-result-summary-label]', 'Your money lasts');
    setText('[data-result-when~="valid"] [data-result-value]', headline);
    setText('[data-result-when~="valid"] [data-result-value-a11y]', headline.toLowerCase());
    setText('[data-ret-l-duration]', l.neverRunsOut ? 'Not projected to run out' : headline);
    // The withdrawn total is real in every case, so it is always shown; only the
    // month count stops meaning anything once the projection was cut off at the cap.
    setText('[data-ret-l-months]', l.reachedLimit ? 'Over 1,200' : String(l.months));
    setText('[data-ret-l-total]', formatCurrency(l.totalWithdrawn));
    show('[data-ret-l-never]', l.neverRunsOut);
    show('[data-ret-l-limit]', l.reachedLimit && !l.neverRunsOut);
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of [
      'currentAge', 'retirementAge', 'lifeExpectancy', 'currentSavings', 'currentIncome',
      'otherMonthlyIncome', 'amountNeeded', 'annualContribution', 'monthlyContribution',
      'potAmount', 'monthlyWithdrawal',
    ]) {
      const el = control(root, name);
      if (el) el.value = '';
    }
    // The planning assumptions go back to their documented defaults, not to blank —
    // an empty expected return is not a neutral state, it is an unanswerable one.
    for (const [name, value] of Object.entries(DEFAULTS)) {
      const el = control(root, name);
      if (el) el.value = value;
    }
    for (const radio of root.querySelectorAll<HTMLInputElement>('[name="mode"]')) {
      radio.checked = radio.value === 'plan';
    }
    for (const name of ['incomeNeededUnit', 'futureSavingsUnit']) {
      const el = control(root, name);
      if (el) el.value = 'percent';
    }
  },
};

const setW = (el: HTMLElement | null, pct: number): void => {
  if (el) el.style.width = `${pct}%`;
};

/** The current age as entered, so the result can name the retirement age in words. */
function numAge(scope: HTMLElement): number {
  const root = scope.closest('[data-retirement]') ?? document;
  const el = root.querySelector<HTMLInputElement>('[name="currentAge"]');
  const n = Number(el?.value ?? '');
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * The example the result panel shows on first load — ours, not the visitor's. The
 * shared runtime computes these and calls this binding's own `renderResult`, so
 * the example reuses the real result markup and can never drift from the engine.
 */
export const RETIREMENT_EXAMPLE_VALUES: RetirementValues = {
  mode: 'plan',
  currentAge: '35',
  retirementAge: '67',
  lifeExpectancy: '85',
  currentSavings: '30000',
  annualReturnPct: '6',
  inflationPct: '3',
  currentIncome: '70000',
  incomeIncreasePct: '3',
  incomeNeededPct: '75',
  incomeNeededUnit: 'percent',
  otherMonthlyIncome: '',
  futureSavingsPct: '10',
  futureSavingsUnit: 'percent',
  amountNeeded: '',
  annualContribution: '',
  monthlyContribution: '',
  potAmount: '',
  monthlyWithdrawal: '',
};
