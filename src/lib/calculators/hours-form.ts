/**
 * Hours form binding (R17B2 — bounded Everyday singleton; task-first).
 *
 * Wraps the UNCHANGED `parseTimeToMinutes` / `calculateHours` and layers the visitor-facing contract
 * they lack: required + strict time validation, a strict whole-minute break, and a complete-result
 * guard. Start / end are native `type="time"` fields (HH:MM); the break is in MINUTES.
 *
 * Own file — the standard-form runtime is UNCHANGED; there is NO `isUsableResult` (the complete-result
 * guard lives in `resultValue` as a NaN sentinel → the runtime's DEFAULT finite gate; a valid zero
 * duration — equal times, or a break at least as long as the interval — is a finite 0 that passes).
 * The frozen source keeps its behaviour: OVERNIGHT is supported (end earlier than start counts as the
 * next day); the binding never reproduces elapsed-time arithmetic — it calls the source and reconciles
 * via a recompute. Visitor validation is STRICTER than the source in two safe ways only: a negative
 * break is rejected (the source silently clamps it) and the break must be whole minutes (a fractional
 * break would make the source emit a fractional minute the result contract forbids).
 */
import { parseTimeToMinutes, calculateHours, type HoursResult } from './hours';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

const DAY = 24 * 60;

export interface HoursFormValues {
  start: string;
  end: string;
  breakMin: string;
}

export interface HoursComputed {
  startMin: number;
  endMin: number;
  breakMin: number;
  overnight: boolean;
  span: number; // overnight-adjusted elapsed BEFORE the break
  result: HoursResult;
}

export const MSG = {
  startRequired: 'Enter a start time.',
  startInvalid: 'Enter a valid start time (HH:MM).',
  endRequired: 'Enter an end time.',
  endInvalid: 'Enter a valid end time (HH:MM).',
  breakInvalid: 'Enter the break as a whole number of minutes.',
  breakNegative: 'The break cannot be negative.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/** '' → 0 (the neutral "no break"); a whole non-negative integer → the number; else a reason. */
function parseBreak(raw: string): number | 'invalid' | 'negative' {
  const s = raw.trim();
  if (s === '') return 0; // an empty break means the verified neutral value (0)
  if (!/^-?\d+$/.test(s)) return 'invalid'; // whole minutes only — rejects decimals / junk
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return 'invalid';
  if (n < 0) return 'negative';
  return n;
}

const field = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? '';

export function readHoursValues(root: HTMLElement): HoursFormValues {
  return { start: field(root, 'start'), end: field(root, 'end'), breakMin: field(root, 'breakMin') };
}

/* ------------------------------------------------------------------ */
/* Validate                                                            */
/* ------------------------------------------------------------------ */

export function validateHours(v: HoursFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  if (v.start.trim() === '') fieldErrors.start = MSG.startRequired;
  else if (parseTimeToMinutes(v.start.trim()) === null) fieldErrors.start = MSG.startInvalid;

  if (v.end.trim() === '') fieldErrors.end = MSG.endRequired;
  else if (parseTimeToMinutes(v.end.trim()) === null) fieldErrors.end = MSG.endInvalid;

  const b = parseBreak(v.breakMin);
  if (b === 'invalid') fieldErrors.breakMin = MSG.breakInvalid;
  else if (b === 'negative') fieldErrors.breakMin = MSG.breakNegative;

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Compute                                                             */
/* ------------------------------------------------------------------ */

export function computeHours(v: HoursFormValues): HoursComputed {
  const startMin = parseTimeToMinutes(v.start.trim()) ?? Number.NaN;
  const endMin = parseTimeToMinutes(v.end.trim()) ?? Number.NaN;
  const b = parseBreak(v.breakMin);
  const breakMin = typeof b === 'number' ? b : Number.NaN;
  const overnight = Number.isFinite(startMin) && Number.isFinite(endMin) && endMin < startMin;
  const span = Number.isFinite(startMin) && Number.isFinite(endMin) ? (overnight ? endMin - startMin + DAY : endMin - startMin) : Number.NaN;
  return { startMin, endMin, breakMin, overnight, span, result: calculateHours(startMin, endMin, breakMin) };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (in resultValue — NO isUsableResult)          */
/* ------------------------------------------------------------------ */

const clockOk = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= DAY - 1;

export function completeHoursValue(c: HoursComputed): number {
  const { startMin, endMin, breakMin, result } = c;
  if (!clockOk(startMin) || !clockOk(endMin)) return Number.NaN;
  if (!Number.isInteger(breakMin) || breakMin < 0) return Number.NaN;

  const { totalMinutes, hours, minutes, decimalHours } = result;
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0) return Number.NaN;
  if (!Number.isInteger(hours) || hours < 0) return Number.NaN;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return Number.NaN;
  if (hours * 60 + minutes !== totalMinutes) return Number.NaN;
  if (!Number.isFinite(decimalHours) || decimalHours !== Math.round((totalMinutes / 60) * 100) / 100) return Number.NaN;

  const re = calculateHours(startMin, endMin, breakMin);
  if (re.totalMinutes !== totalMinutes || re.hours !== hours || re.minutes !== minutes || re.decimalHours !== decimalHours) {
    return Number.NaN;
  }
  return totalMinutes; // finite sentinel (a valid 0 duration passes the default gate)
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface HoursPresentation {
  primary: string;
  a11y: string;
  decimal: string;
  interpretation: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const clock = (min: number): string => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const hm = (h: number, m: number): string => `${h}h ${m}m`;
const spokenHm = (h: number, m: number): string => {
  if (h === 0 && m === 0) return '0 hours';
  const hp = `${h} hour${h === 1 ? '' : 's'}`;
  const mp = `${m} minute${m === 1 ? '' : 's'}`;
  if (m === 0) return hp;
  if (h === 0) return mp;
  return `${hp} ${mp}`;
};

export function presentHours(c: HoursComputed): HoursPresentation {
  const { hours, minutes, totalMinutes, decimalHours } = c.result;
  let interpretation = `${clock(c.startMin)} to ${clock(c.endMin)}${c.overnight ? ', crossing midnight' : ''}`;
  interpretation += c.breakMin > 0 ? `, minus a ${c.breakMin}-minute break` : '';
  interpretation += '.';
  if (totalMinutes === 0) {
    interpretation +=
      c.span === 0
        ? ' The start and end times are the same, so no time is counted.'
        : ' The break is at least as long as the interval, so the time worked is zero.';
  }
  return {
    primary: hm(hours, minutes),
    a11y: spokenHm(hours, minutes),
    decimal: String(decimalHours),
    interpretation,
  };
}

export function describeHours(c: HoursComputed): string {
  return `Total time: ${spokenHm(c.result.hours, c.result.minutes)}.`;
}

export function renderHoursResult(result: HoursComputed, context: FormRenderContext): void {
  const p = presentHours(result);
  const q = (sel: string) => context.result.querySelector<HTMLElement>(sel);
  const set = (sel: string, value: string) => {
    const el = q(sel);
    if (el) el.textContent = value;
  };
  const primary = q('[data-result-when~="valid"] [data-result-value]');
  if (primary) primary.textContent = p.primary;
  const a11y = q('[data-result-when~="valid"] [data-result-value-a11y]');
  if (a11y) a11y.textContent = p.a11y;
  set('[data-hr-decimal]', p.decimal);
  set('[data-hr-interpretation]', p.interpretation);
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

/** Clear the two time fields and the break (empty = the neutral "no break"). */
export function resetHoursValues(root: HTMLElement, _mode: ResetMode): void {
  for (const name of ['start', 'end', 'breakMin']) {
    const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (el) el.value = '';
  }
}

export const hoursBinding: FormCalculatorBinding<HoursFormValues, HoursComputed> = {
  readValues: readHoursValues,
  validate: validateHours,
  compute: computeHours,
  renderResult: renderHoursResult,
  describeResult: describeHours,
  resultValue: completeHoursValue,
  resetValues: resetHoursValues,
  // NO isUsableResult — the complete-result guard lives in resultValue (NaN sentinel).
};
