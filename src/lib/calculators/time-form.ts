/**
 * Time form binding (R17B3 — bounded Everyday singleton; task-first).
 *
 * Wraps the UNCHANGED `toSeconds` / `combineDurations` / `breakdownDuration` and layers the
 * visitor-facing contract they lack: required + strict component validation, a complete-result guard,
 * a SIGNED result presentation and Reset. Two operands (A, B) each in days / hours / minutes / seconds,
 * combined by Add or Subtract.
 *
 * Own file — the standard-form runtime is UNCHANGED; there is NO `isUsableResult` (the complete-result
 * guard lives in `resultValue` as a NaN sentinel → the runtime's DEFAULT finite gate). The result may
 * be NEGATIVE: the sentinel is the SIGNED total seconds, which is finite for a valid subtraction that
 * goes negative and for a valid zero, so the default gate accepts it without any runtime change.
 *
 * Visitor components are finite and NON-NEGATIVE — whole OR decimal, matching the frozen source
 * (`toSeconds` accepts decimals; many, like 0.5 days / 1.5 hours / 1.5 minutes, are EXACT whole
 * seconds). The source exposes TWO numeric representations the binding preserves transparently:
 *   A. the EXACT signed `totalSeconds` (from `toSeconds` / `combineDurations`; MAY be fractional), and
 *   B. the WHOLE-SECOND normalized `breakdownDuration`, which ROUNDS the magnitude (`Math.round`) and
 *      carries the sign SEPARATELY (a `negative` boolean).
 * The dominant duration is the rounded breakdown (B); the secondary total seconds is the EXACT value
 * (A); when a fractional total makes them differ, a rounding note makes the rounding explicit rather
 * than presenting the rounded breakdown as exact. The complete-result sentinel is the EXACT
 * `totalSeconds` (it is NOT required to be an integer). The SIGN is the job of the Add/Subtract
 * operation, never a negative component (the field's `min="0"`); oversized components are allowed (the
 * source normalises them). The `Math.round(-0.5) = -0` quirk (a negative flag with a zero magnitude,
 * e.g. a −0.5s subtraction) stays a VALID result — never a validation error and never a "−0s" leak.
 */
import { toSeconds, combineDurations, breakdownDuration, type Duration } from './time';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export type TimeOp = 'add' | 'subtract';
type SignedDuration = Duration & { negative: boolean };

const UNITS = ['days', 'hours', 'minutes', 'seconds'] as const;
type Unit = (typeof UNITS)[number];
/** The eight component field names, e.g. "a_days" … "b_seconds". */
export const COMPONENT_NAMES = (['a', 'b'] as const).flatMap((side) => UNITS.map((u) => `${side}_${u}` as const));

/** Read a component value by name (all TimeFormValues values are strings). */
const raw = (v: TimeFormValues, name: string): string => (v as unknown as Record<string, string>)[name] ?? '';

export interface TimeFormValues {
  op: string;
  a_days: string;
  a_hours: string;
  a_minutes: string;
  a_seconds: string;
  b_days: string;
  b_hours: string;
  b_minutes: string;
  b_seconds: string;
}

export interface TimeComputed {
  op: TimeOp;
  a: Duration; // parsed components (NaN for an invalid component)
  b: Duration;
  anyPresent: boolean;
  aSeconds: number;
  bSeconds: number;
  totalSeconds: number;
  result: SignedDuration;
}

export const MSG = {
  componentInvalid: 'Enter a number (0 or more).',
  componentNegative: 'Time values cannot be negative.',
  required: 'Enter at least one duration value.',
  opInvalid: 'Choose add or subtract.',
} as const;

const DAY = 86400;
const HOUR = 3600;
const MIN = 60;

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * '' → 0 (neutral); a finite non-negative number (whole OR decimal) → the number; else a reason.
 * The frozen `toSeconds` accepts decimal components, so the binding does too — WITHOUT `Number(v)||0`
 * / `parseInt` / truncation: a strict finite-decimal grammar (optional sign, digits with an optional
 * single fractional part — "30", "1.5", "0.5", ".5", "5."; no exponent, no junk) then a finiteness
 * guard (a digit run long enough to overflow to Infinity fails).
 */
function parseComponent(raw: string): number | 'invalid' | 'negative' {
  const s = raw.trim();
  if (s === '') return 0; // an empty component is the neutral 0 (legacy Number(v)||0 parity)
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(s)) return 'invalid'; // finite decimal only — rejects junk / partial / exponent
  const n = Number(s);
  if (!Number.isFinite(n)) return 'invalid';
  if (n < 0) return 'negative';
  return n;
}

/** For computation: a valid component → its number; an invalid/negative one → NaN. */
const comp = (raw: string): number => {
  const p = parseComponent(raw);
  return typeof p === 'number' ? p : Number.NaN;
};

const normOp = (op: string): TimeOp => (op === 'subtract' ? 'subtract' : 'add');

const field = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? '';

export function readTimeValues(root: HTMLElement): TimeFormValues {
  const op = root.querySelector<HTMLInputElement>('[name="tc_op"]:checked')?.value ?? 'add';
  const built: Record<string, string> = { op };
  for (const name of COMPONENT_NAMES) built[name] = field(root, name);
  return built as unknown as TimeFormValues;
}

/* ------------------------------------------------------------------ */
/* Validate                                                            */
/* ------------------------------------------------------------------ */

export function validateTime(v: TimeFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  let anyPresent = false;
  for (const name of COMPONENT_NAMES) {
    const val = raw(v, name);
    if (val.trim() !== '') anyPresent = true;
    const p = parseComponent(val);
    if (p === 'invalid') fieldErrors[name] = MSG.componentInvalid;
    else if (p === 'negative') fieldErrors[name] = MSG.componentNegative;
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  if (v.op !== 'add' && v.op !== 'subtract') return { ok: false, formError: MSG.opInvalid };
  if (!anyPresent) return { ok: false, formError: MSG.required };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Compute (calls the UNCHANGED source only)                           */
/* ------------------------------------------------------------------ */

const parseSide = (v: TimeFormValues, side: 'a' | 'b'): Duration => ({
  days: comp(raw(v, `${side}_days`)),
  hours: comp(raw(v, `${side}_hours`)),
  minutes: comp(raw(v, `${side}_minutes`)),
  seconds: comp(raw(v, `${side}_seconds`)),
});

export function computeTime(v: TimeFormValues): TimeComputed {
  const op = normOp(v.op);
  const a = parseSide(v, 'a');
  const b = parseSide(v, 'b');
  const anyPresent = COMPONENT_NAMES.some((n) => raw(v, n).trim() !== '');
  const aSeconds = toSeconds(a);
  const bSeconds = toSeconds(b);
  const totalSeconds = combineDurations(aSeconds, op, bSeconds);
  return { op, a, b, anyPresent, aSeconds, bSeconds, totalSeconds, result: breakdownDuration(totalSeconds) };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (in resultValue — NO isUsableResult)          */
/* ------------------------------------------------------------------ */

const finiteNonNeg = (n: number): boolean => Number.isFinite(n) && n >= 0;

export function completeTimeValue(c: TimeComputed): number {
  if (c.op !== 'add' && c.op !== 'subtract') return Number.NaN;
  if (!c.anyPresent) return Number.NaN;
  // every parsed component must be a finite non-negative number (whole OR decimal, matching the source)
  for (const side of [c.a, c.b]) {
    if (!finiteNonNeg(side.days) || !finiteNonNeg(side.hours) || !finiteNonNeg(side.minutes) || !finiteNonNeg(side.seconds)) {
      return Number.NaN;
    }
  }
  // A. the EXACT signed total (and each operand's seconds) may be fractional — require only finiteness
  if (!Number.isFinite(c.aSeconds) || !Number.isFinite(c.bSeconds) || !Number.isFinite(c.totalSeconds)) return Number.NaN;

  // B. the WHOLE-SECOND normalized breakdown: non-negative integers in their normalized ranges
  const r = c.result;
  if (![r.days, r.hours, r.minutes, r.seconds].every(Number.isInteger)) return Number.NaN;
  if (r.days < 0 || r.hours < 0 || r.minutes < 0 || r.seconds < 0) return Number.NaN;
  if (r.hours >= 24 || r.minutes >= 60 || r.seconds >= 60) return Number.NaN;

  // the SIGN reconciles with the EXACT total; the MAGNITUDE reconciles with the ROUNDED total. A
  // fractional total that rounds to a zero magnitude (e.g. −0.5s → −0) stays VALID — the `negative`
  // flag is honoured while the presentation shows an unsigned zero (never "−0s").
  if (r.negative !== c.totalSeconds < 0) return Number.NaN;
  const mag = r.days * DAY + r.hours * HOUR + r.minutes * MIN + r.seconds;
  if (mag !== Math.abs(Math.round(c.totalSeconds))) return Number.NaN;

  // a complete source recomputation reproduces the EXACT total AND the breakdown
  const reTotal = combineDurations(c.aSeconds, c.op, c.bSeconds);
  if (reTotal !== c.totalSeconds) return Number.NaN;
  const re = breakdownDuration(reTotal);
  if (re.days !== r.days || re.hours !== r.hours || re.minutes !== r.minutes || re.seconds !== r.seconds || re.negative !== r.negative) {
    return Number.NaN;
  }
  return c.totalSeconds; // EXACT signed finite sentinel (may be fractional; negative & zero both pass the gate)
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface TimePresentation {
  primary: string;
  a11y: string;
  totalSeconds: string;
  interpretation: string;
  rounded: string; // '' when the exact total is a whole number; else the rounding note
}

// The secondary total keeps the EXACT value (up to 6 fractional digits — enough for any sub-second
// duration while hiding floating-point noise), with thousands separators for whole seconds.
const nfTotal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
const SUFFIX: Record<Unit, string> = { days: 'd', hours: 'h', minutes: 'm', seconds: 's' };
const WORD: Record<Unit, string> = { days: 'day', hours: 'hour', minutes: 'minute', seconds: 'second' };

const isZeroMagnitude = (r: SignedDuration): boolean => UNITS.every((u) => r[u] === 0);
const ROUNDING_NOTE = 'The duration is rounded to the nearest whole second; the exact total is shown below.';

/** Compact signed form: from the highest non-zero unit through seconds; an all-zero magnitude → "0s" (unsigned). */
export function compactDuration(r: SignedDuration): string {
  if (isZeroMagnitude(r)) return '0s'; // never "−0s" — a rounded-to-zero magnitude is unsigned
  const vals: Array<[Unit, number]> = UNITS.map((u) => [u, r[u]]);
  const start = vals.findIndex(([, v]) => v !== 0);
  const body = vals.slice(start).map(([u, v]) => `${v}${SUFFIX[u]}`).join(' ');
  return `${r.negative ? '−' : ''}${body}`;
}

/** Spoken signed form: non-zero units only; an all-zero magnitude → "0 seconds" (unsigned — never "minus 0 seconds"). */
export function spokenDuration(r: SignedDuration): string {
  if (isZeroMagnitude(r)) return '0 seconds';
  const words = UNITS.map((u) => [u, r[u]] as [Unit, number])
    .filter(([, v]) => v !== 0)
    .map(([u, v]) => `${v} ${WORD[u]}${v === 1 ? '' : 's'}`)
    .join(', ');
  return `${r.negative ? 'minus ' : ''}${words}`;
}

export function presentTime(c: TimeComputed): TimePresentation {
  const r = c.result;
  const fractional = !Number.isInteger(c.totalSeconds);
  const signedTotal = `${c.totalSeconds < 0 ? '−' : ''}${nfTotal.format(Math.abs(c.totalSeconds))}`;
  let interpretation =
    c.op === 'add'
      ? 'The two durations were added together.'
      : 'The second duration was subtracted from the first.';
  if (c.op === 'subtract') {
    if (c.totalSeconds === 0) interpretation += ' The two durations are equal.';
    else if (r.negative) interpretation += ' The result is negative because the second duration is longer than the first.';
  }
  return {
    primary: compactDuration(r),
    a11y: spokenDuration(r),
    totalSeconds: signedTotal,
    interpretation,
    rounded: fractional ? ROUNDING_NOTE : '',
  };
}

export function describeTime(c: TimeComputed): string {
  const base = `Calculated time: ${spokenDuration(c.result)}.`;
  return Number.isInteger(c.totalSeconds) ? base : `${base} Rounded to the nearest whole second.`;
}

export function renderTimeResult(result: TimeComputed, context: FormRenderContext): void {
  const p = presentTime(result);
  const q = (sel: string) => context.result.querySelector<HTMLElement>(sel);
  const set = (sel: string, value: string) => {
    const el = q(sel);
    if (el) el.textContent = value;
  };
  const primary = q('[data-result-when~="valid"] [data-result-value]');
  if (primary) primary.textContent = p.primary;
  const a11y = q('[data-result-when~="valid"] [data-result-value-a11y]');
  if (a11y) a11y.textContent = p.a11y;
  set('[data-tc-total]', p.totalSeconds);
  set('[data-tc-interpretation]', p.interpretation);
  const roundedEl = q('[data-tc-rounded]');
  if (roundedEl) {
    roundedEl.textContent = p.rounded;
    roundedEl.hidden = p.rounded === '';
  }
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

/** Clear all eight components and restore the default Add operation. */
export function resetTimeValues(root: HTMLElement, _mode: ResetMode): void {
  for (const name of COMPONENT_NAMES) {
    const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (el) el.value = '';
  }
  const add = root.querySelector<HTMLInputElement>('[name="tc_op"][value="add"]');
  if (add) add.checked = true;
  const sub = root.querySelector<HTMLInputElement>('[name="tc_op"][value="subtract"]');
  if (sub) sub.checked = false;
}

export const timeBinding: FormCalculatorBinding<TimeFormValues, TimeComputed> = {
  readValues: readTimeValues,
  validate: validateTime,
  compute: computeTime,
  renderResult: renderTimeResult,
  describeResult: describeTime,
  resultValue: completeTimeValue,
  resetValues: resetTimeValues,
  // NO isUsableResult — the complete-result guard lives in resultValue (a signed finite sentinel).
};
