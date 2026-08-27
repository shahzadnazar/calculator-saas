/**
 * Compound interest binding — converting a rate between compounding periods.
 *
 * WHAT THIS ANSWERS. Two rates that look different can grow money at exactly the same
 * speed: 6% compounded monthly and 6.16778% compounded annually are the same deal.
 * A lender quoting the first and a bank quoting the second are not offering different
 * things, and this converts between them so they can be compared honestly.
 *
 * This is deliberately NOT a growth projection. Working out what a balance becomes
 * over time is the Interest calculator's job, and doing it in two places would mean
 * two answers to maintain. The reference product draws the same line.
 *
 * THE MATHS lives in `@lib/result`-adjacent `./compounding`, alongside the frequency
 * list Savings and Interest already share: every frequency reduces to one effective
 * annual rate, and that shared ground is what lets any pair convert.
 *
 * THE COMPARISON. Converting one pair answers the question asked; seeing the whole
 * ladder answers the one behind it — how much compounding frequency is actually worth.
 * The chart plots the entered rate's effective annual value at every frequency, so the
 * curve flattening out toward continuous compounding is visible rather than asserted.
 *
 * The complete-result guard lives in `resultValue` as a NaN sentinel feeding the
 * runtime's DEFAULT finite gate; there is NO `isUsableResult`, because a valid 0%
 * conversion is a finite 0 the default gate already accepts.
 */
import {
  COMPOUND_FREQUENCIES,
  COMPOUND_PERIODS,
  convertCompoundRate,
  effectiveAnnualRate,
  isCompoundFrequency,
  type CompoundFrequency,
} from './compounding';
import { formatPercent } from '@lib/format';
import { drawFrequencyChart } from '@lib/result/rate-chart';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** A rate above this is a typo rather than an offer. */
export const MAX_RATE = 200;

/**
 * How each frequency is labelled in the selectors. Annually and Monthly carry the
 * names people actually meet on paperwork — APY on a savings account, APR on a card.
 */
export const FREQUENCY_LABELS: Readonly<Record<CompoundFrequency, string>> = {
  annually: 'Annually (APY)',
  semiannually: 'Semi-annually',
  quarterly: 'Quarterly',
  monthly: 'Monthly (APR)',
  semimonthly: 'Semi-monthly',
  biweekly: 'Biweekly',
  weekly: 'Weekly',
  daily: 'Daily',
  continuously: 'Continuously',
};

/** The same names in running prose, where the parenthetical would read oddly. */
export const FREQUENCY_PROSE: Readonly<Record<CompoundFrequency, string>> = {
  annually: 'annually',
  semiannually: 'semi-annually',
  quarterly: 'quarterly',
  monthly: 'monthly',
  semimonthly: 'semi-monthly',
  biweekly: 'biweekly',
  weekly: 'weekly',
  daily: 'daily',
  continuously: 'continuously',
};

/** The short tag a frequency is known by, where it has one. */
export const FREQUENCY_TAG: Partial<Record<CompoundFrequency, string>> = {
  annually: 'APY',
  monthly: 'APR',
};

/** The reference prints five decimals, which is where these conversions differ. */
export const RATE_DECIMALS = 5;

export interface CompoundValues {
  inputRate: string;
  inputCompound: CompoundFrequency;
  outputCompound: CompoundFrequency;
}

export interface CompoundComputed {
  inputRate: number;
  inputCompound: CompoundFrequency;
  outputCompound: CompoundFrequency;
  /** The equivalent nominal rate at `outputCompound`, as a percent. */
  outputRate: number;
  /** What the entered rate actually earns in a year, as a percent. */
  effectiveAnnualPct: number;
  /** The entered rate's effective annual value at EVERY frequency, for the chart. */
  ladder: readonly { compound: CompoundFrequency; effectiveAnnualPct: number }[];
}

export const MSG = {
  rateRequired: 'Enter an interest rate.',
  rateNonNegative: 'Enter an interest rate of zero or more.',
  rateMax: `Enter an interest rate of ${MAX_RATE}% or less.`,
} as const;

const FAIL = Number.NaN;
const TOL = 1e-9;

/* ------------------------------------------------------------------ */
/* Read / validate / compute                                           */
/* ------------------------------------------------------------------ */

const freq = (raw: string | undefined, fallback: CompoundFrequency): CompoundFrequency =>
  raw && isCompoundFrequency(raw) ? raw : fallback;

export function readCompoundValues(root: HTMLElement): CompoundValues {
  const pick = (name: string) => root.querySelector<HTMLSelectElement>(`[name="${name}"]`)?.value;
  return {
    inputRate: root.querySelector<HTMLInputElement>('[name="inputRate"]')?.value ?? '',
    inputCompound: freq(pick('inputCompound'), 'monthly'),
    outputCompound: freq(pick('outputCompound'), 'annually'),
  };
}

export function validateCompound(v: CompoundValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const raw = v.inputRate.trim();
  if (raw === '') {
    fieldErrors.inputRate = MSG.rateRequired;
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) fieldErrors.inputRate = MSG.rateNonNegative;
    else if (n > MAX_RATE) fieldErrors.inputRate = MSG.rateMax;
  }
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function computeCompound(v: CompoundValues): CompoundComputed {
  const inputRate = Number(v.inputRate);
  return {
    inputRate,
    inputCompound: v.inputCompound,
    outputCompound: v.outputCompound,
    outputRate: convertCompoundRate(inputRate, v.inputCompound, v.outputCompound),
    effectiveAnnualPct: effectiveAnnualRate(inputRate, v.inputCompound) * 100,
    ladder: COMPOUND_FREQUENCIES.map((compound) => ({
      compound,
      effectiveAnnualPct: effectiveAnnualRate(inputRate, compound) * 100,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (in resultValue — NO isUsableResult)          */
/* ------------------------------------------------------------------ */

/**
 * Returns the converted rate ONLY when the whole result reconciles: a finite,
 * in-range input, a finite conversion that round-trips back to the rate it came
 * from, an effective annual rate consistent with both ends, and a full ladder.
 *
 * The round trip is the check that matters. Converting back has to return the
 * original rate, because the two rates are supposed to describe the same growth —
 * if they do not, the pair is not equivalent and must not be shown as such.
 */
export function completeCompoundValue(c: CompoundComputed): number {
  const { inputRate, inputCompound, outputCompound, outputRate, effectiveAnnualPct, ladder } = c;
  if (!Number.isFinite(inputRate) || inputRate < 0 || inputRate > MAX_RATE) return FAIL;
  if (!Number.isFinite(outputRate) || outputRate < 0) return FAIL;
  if (!Number.isFinite(effectiveAnnualPct) || effectiveAnnualPct < 0) return FAIL;

  // The pair must be equivalent in both directions.
  const back = convertCompoundRate(outputRate, outputCompound, inputCompound);
  if (!Number.isFinite(back) || Math.abs(back - inputRate) > 1e-6) return FAIL;

  // Both ends must agree on what a year actually earns.
  const fromOutput = effectiveAnnualRate(outputRate, outputCompound) * 100;
  if (Math.abs(fromOutput - effectiveAnnualPct) > 1e-6) return FAIL;

  // More frequent compounding can never earn less. The ladder is in that order.
  if (ladder.length !== COMPOUND_FREQUENCIES.length) return FAIL;
  let previous = -Infinity;
  for (const step of ladder) {
    if (!Number.isFinite(step.effectiveAnnualPct) || step.effectiveAnnualPct < 0) return FAIL;
    if (step.effectiveAnnualPct + TOL < previous) return FAIL;
    previous = step.effectiveAnnualPct;
  }

  return outputRate;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface CompoundPresentation {
  /** "6.16778%" — the dominant answer. */
  outputRate: string;
  inputRate: string;
  /** "6% compound monthly (APR) is equivalent to 6.16778% compound annually (APY)." */
  summary: string;
  effectiveAnnual: string;
  /** What the two frequencies are called, for the labels beside each selector. */
  inputLabel: string;
  outputLabel: string;
}

/** A rate as the reference prints it: five decimals, trailing zeros trimmed. */
export function formatRate(pct: number): string {
  if (!Number.isFinite(pct)) return '—';
  return formatPercent(pct, RATE_DECIMALS);
}

/** "monthly (APR)", or just "quarterly" where there is no tag. */
export function compoundPhrase(compound: CompoundFrequency): string {
  const tag = FREQUENCY_TAG[compound];
  return tag ? `${FREQUENCY_PROSE[compound]} (${tag})` : FREQUENCY_PROSE[compound];
}

export function presentCompound(c: CompoundComputed): CompoundPresentation {
  const inputRate = formatRate(c.inputRate);
  const outputRate = formatRate(c.outputRate);
  const from = compoundPhrase(c.inputCompound);
  const to = compoundPhrase(c.outputCompound);
  return {
    outputRate,
    inputRate,
    summary:
      c.inputCompound === c.outputCompound
        ? `${inputRate} compound ${from} is already what you asked for — choose a different output period to convert it.`
        : `${inputRate} compound ${from} is equivalent to ${outputRate} compound ${to}.`,
    effectiveAnnual: formatRate(c.effectiveAnnualPct),
    inputLabel: FREQUENCY_LABELS[c.inputCompound],
    outputLabel: FREQUENCY_LABELS[c.outputCompound],
  };
}

export function describeCompound(c: CompoundComputed): string {
  const trim = (pct: number) => Number(pct.toFixed(RATE_DECIMALS));
  return (
    `${trim(c.inputRate)} percent compound ${compoundPhrase(c.inputCompound)} ` +
    `is equivalent to ${trim(c.outputRate)} percent compound ${compoundPhrase(c.outputCompound)}.`
  );
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

export function renderCompoundResult(result: CompoundComputed, context: FormRenderContext): void {
  const p = presentCompound(result);
  const scope = context.result;
  const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
  const setText = (sel: string, value: string) => {
    const el = q(sel);
    if (el) el.textContent = value;
  };

  setText('[data-result-when~="valid"] [data-result-value]', p.outputRate);
  setText('[data-result-when~="valid"] [data-result-value-a11y]', describeCompound(result));
  setText('[data-ci-summary]', p.summary);
  setText('[data-ci-effective]', p.effectiveAnnual);
  setText('[data-ci-input-label]', p.inputLabel);
  setText('[data-ci-output-label]', p.outputLabel);

  const charted = drawFrequencyChart(
    q('[data-ci-chart]'),
    result.ladder.map((step) => ({
      label: FREQUENCY_PROSE[step.compound],
      value: step.effectiveAnnualPct,
      highlight: step.compound === result.inputCompound || step.compound === result.outputCompound,
    })),
    {
      prefix: 'ci',
      format: (v) => formatPercent(v, 3),
      label:
        `What ${p.inputRate} earns in a year at each compounding period, from ` +
        `${formatRate(result.ladder[0].effectiveAnnualPct)} compounded annually to ` +
        `${formatRate(result.ladder[result.ladder.length - 1].effectiveAnnualPct)} compounded continuously.`,
    },
  );
  const figure = q('[data-ci-chart-figure]');
  if (figure) figure.hidden = !charted;
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

/** Clear the rate; the two periods are structural defaults, like the reference's. */
export function resetCompoundValues(root: HTMLElement, _mode: ResetMode): void {
  const rate = root.querySelector<HTMLInputElement>('[name="inputRate"]');
  if (rate) rate.value = '';
  const input = root.querySelector<HTMLSelectElement>('[name="inputCompound"]');
  if (input) input.value = 'monthly';
  const output = root.querySelector<HTMLSelectElement>('[name="outputCompound"]');
  if (output) output.value = 'annually';
}

export const compoundInterestBinding: FormCalculatorBinding<CompoundValues, CompoundComputed> = {
  readValues: readCompoundValues,
  validate: validateCompound,
  compute: computeCompound,
  describeResult: describeCompound,
  renderResult: renderCompoundResult,
  resetValues: resetCompoundValues,
  resultValue: completeCompoundValue,
  // NO isUsableResult — a valid 0% conversion is a finite 0 the default gate accepts.
};

/** Periods per year, for the copy that explains a frequency. */
export const periodsPerYear = (compound: CompoundFrequency): number | null =>
  compound === 'continuously' ? null : COMPOUND_PERIODS[compound];

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's field stays EMPTY)          */
/* ------------------------------------------------------------------ */

/** The published reference case: 6% monthly is 6.16778% annually. */
export const COMPOUND_EXAMPLE_VALUES: CompoundValues = {
  inputRate: '6',
  inputCompound: 'monthly',
  outputCompound: 'annually',
};
