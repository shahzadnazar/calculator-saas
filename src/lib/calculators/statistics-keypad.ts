/**
 * The statistics keypad — the reference's accumulator panel, as a pure state machine.
 *
 * The reference puts a numeric keypad above its comma-separated box: you type a value, press ADD to
 * accumulate it, and then press one of x̄, x̄², Σx, Σx², σ, σ², s, s² or GM to read that statistic
 * back. It is a scientific calculator's "stat mode", and it is genuinely useful when the numbers are
 * arriving one at a time rather than already in a list.
 *
 * It is also the confusing part of that page, for one reason: nothing tells you that a number you
 * have typed is not in the data set until you press ADD. So this version keeps the arrangement and
 * the keys exactly, and fixes that one thing — a typed-but-unadded value blocks the statistic and
 * says so, rather than quietly answering a question about a different data set. Each function key
 * also carries its name under its symbol, because "Σx²" is not a label most people read fluently.
 *
 * Pure and unit-tested: no DOM, no timers, no module state. The island is a thin executor.
 */
import { calculateStats } from './statistics';

export type StatFunction =
  | 'mean'
  | 'meanOfSquares'
  | 'sum'
  | 'sumOfSquares'
  | 'popSD'
  | 'popVar'
  | 'sampleSD'
  | 'sampleVar'
  | 'gm';

export type KeypadKey =
  | { kind: 'digit'; value: string }
  | { kind: 'dot' }
  | { kind: 'exp' }
  | { kind: 'sign' }
  | { kind: 'backspace' }
  | { kind: 'clearEntry' }
  | { kind: 'clearAll' }
  | { kind: 'add' }
  | { kind: 'remove'; index: number }
  | { kind: 'stat'; fn: StatFunction };

export interface KeypadState {
  /** The number being typed. Empty when the display is showing a result instead. */
  entry: string;
  /** What the screen shows. */
  display: string;
  /** One short line under the screen: what just happened, or what to do next. */
  note: string;
  /** The accumulated data set, in the order it was entered. */
  data: number[];
}

export const INITIAL_KEYPAD: KeypadState = { entry: '', display: '0', note: '', data: [] };

/** Long enough for any real measurement, short enough that the display never has to scroll. */
const MAX_ENTRY = 18;

export const MSG = {
  typeFirst: 'Type a number, then press ADD.',
  addFirst: (entry: string) => `Press ADD to put ${entry} in the data set first.`,
  noData: 'Add at least one value first.',
  needTwo: 'Sample figures need at least two values.',
  needPositive: 'The geometric mean needs every value to be positive.',
  added: (value: string, n: number) => `Added ${value}. ${n} ${n === 1 ? 'value' : 'values'} in the set.`,
  removed: (value: string, n: number) => `Removed ${value}. ${n} ${n === 1 ? 'value' : 'values'} left.`,
  cleared: 'Data set cleared.',
} as const;

/* ------------------------------------------------------------------ */
/* The key catalog — the reference's arrangement, with names added     */
/* ------------------------------------------------------------------ */

export interface StatKeyDef {
  fn: StatFunction;
  /** The symbol the reference prints on the key. */
  symbol: string;
  /** The name we print under it, so the symbol does not have to be decoded. */
  name: string;
  /** The full description, for screen readers and the note line. */
  aria: string;
}

export const STAT_KEYS: StatKeyDef[] = [
  { fn: 'mean', symbol: 'x̄', name: 'Mean', aria: 'Mean' },
  { fn: 'meanOfSquares', symbol: 'x̄²', name: 'Mean of squares', aria: 'Mean of the squared values' },
  { fn: 'sum', symbol: 'Σx', name: 'Sum', aria: 'Sum of the values' },
  { fn: 'sumOfSquares', symbol: 'Σx²', name: 'Sum of squares', aria: 'Sum of the squared values' },
  { fn: 'popSD', symbol: 'σ', name: 'Population SD', aria: 'Population standard deviation' },
  { fn: 'popVar', symbol: 'σ²', name: 'Population variance', aria: 'Population variance' },
  { fn: 'sampleSD', symbol: 's', name: 'Sample SD', aria: 'Sample standard deviation' },
  { fn: 'sampleVar', symbol: 's²', name: 'Sample variance', aria: 'Sample variance' },
  { fn: 'gm', symbol: 'GM', name: 'Geometric mean', aria: 'Geometric mean' },
];

export const statKeyDef = (fn: StatFunction): StatKeyDef =>
  STAT_KEYS.find((k) => k.fn === fn) ?? STAT_KEYS[0];

/* ------------------------------------------------------------------ */
/* Entry parsing (pure)                                                */
/* ------------------------------------------------------------------ */

/** A finished entry as a number, or null when it is empty or half-typed ("1.", "2e", "-"). */
export function parseEntry(entry: string): number | null {
  const t = entry.trim();
  if (t === '') return null;
  if (!/^-?\d*\.?\d+(?:e-?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const mantissaAndExponent = (entry: string): [string, string | null] => {
  const i = entry.indexOf('e');
  return i === -1 ? [entry, null] : [entry.slice(0, i), entry.slice(i + 1)];
};

const toggleSign = (part: string): string => (part.startsWith('-') ? part.slice(1) : `-${part}`);

/* ------------------------------------------------------------------ */
/* The statistic behind each key (pure)                                */
/* ------------------------------------------------------------------ */

export type StatOutcome = { ok: true; value: number } | { ok: false; note: string };

/** The value a function key reports for a data set, or why it cannot report one. */
export function statFor(fn: StatFunction, data: readonly number[]): StatOutcome {
  if (data.length === 0) return { ok: false, note: MSG.noData };
  const s = calculateStats([...data]);

  switch (fn) {
    case 'mean':
      return { ok: true, value: s.mean };
    case 'meanOfSquares':
      return { ok: true, value: s.sumOfSquaredValues / s.count };
    case 'sum':
      return { ok: true, value: s.sum };
    case 'sumOfSquares':
      return { ok: true, value: s.sumOfSquaredValues };
    case 'popSD':
      return { ok: true, value: s.populationSD };
    case 'popVar':
      return { ok: true, value: s.populationVariance };
    case 'sampleSD':
      return data.length < 2 ? { ok: false, note: MSG.needTwo } : { ok: true, value: s.sampleSD };
    case 'sampleVar':
      return data.length < 2 ? { ok: false, note: MSG.needTwo } : { ok: true, value: s.sampleVariance };
    case 'gm':
      return Number.isFinite(s.geometricMean)
        ? { ok: true, value: s.geometricMean }
        : { ok: false, note: MSG.needPositive };
  }
}

/* ------------------------------------------------------------------ */
/* The state machine (pure)                                            */
/* ------------------------------------------------------------------ */

/**
 * One key press.
 *
 * `format` renders a computed statistic — passed in rather than imported so the presentation layer
 * owns precision and this module owns only behaviour.
 */
export function pressKey(
  state: KeypadState,
  key: KeypadKey,
  format: (value: number) => string,
): KeypadState {
  const withEntry = (entry: string): KeypadState => ({
    ...state,
    entry,
    display: entry === '' ? '0' : entry,
    note: '',
  });

  switch (key.kind) {
    case 'digit': {
      if (state.entry.length >= MAX_ENTRY) return state;
      // A leading zero is replaced, not appended to: "07" is not a number anyone means to type.
      const next = state.entry === '0' ? key.value : state.entry + key.value;
      return withEntry(next);
    }

    case 'dot': {
      const [mantissa, exponent] = mantissaAndExponent(state.entry);
      if (exponent !== null || mantissa.includes('.')) return state; // one point, and none in an exponent
      if (state.entry.length >= MAX_ENTRY) return state;
      return withEntry(state.entry === '' ? '0.' : `${state.entry}.`);
    }

    case 'exp': {
      if (state.entry === '' || state.entry.includes('e')) return state;
      if (!/\d$/.test(state.entry)) return state; // needs a digit to raise
      return withEntry(`${state.entry}e`);
    }

    case 'sign': {
      if (state.entry === '') return state;
      const [mantissa, exponent] = mantissaAndExponent(state.entry);
      // With an exponent open, the sign belongs to the exponent — that is what the key is for there.
      return withEntry(
        exponent === null ? toggleSign(mantissa) : `${mantissa}e${toggleSign(exponent)}`,
      );
    }

    case 'backspace':
      return state.entry === '' ? state : withEntry(state.entry.slice(0, -1));

    case 'clearEntry':
      return { ...state, entry: '', display: '0', note: '' };

    case 'clearAll':
      return { ...INITIAL_KEYPAD, note: MSG.cleared };

    case 'add': {
      const value = parseEntry(state.entry);
      if (value === null) return { ...state, note: MSG.typeFirst };
      const data = [...state.data, value];
      return { entry: '', display: format(value), note: MSG.added(format(value), data.length), data };
    }

    case 'remove': {
      if (!Number.isInteger(key.index) || key.index < 0 || key.index >= state.data.length) return state;
      const removed = state.data[key.index];
      const data = state.data.filter((_, i) => i !== key.index);
      return { ...state, entry: '', display: '0', note: MSG.removed(format(removed), data.length), data };
    }

    case 'stat': {
      /*
       * The reference's one real trap: a number typed but never ADDed is not in the data set, and
       * answering anyway would report a statistic for a set the visitor does not think they have.
       * So say what is missing instead.
       */
      if (state.entry !== '') return { ...state, note: MSG.addFirst(state.entry) };
      const outcome = statFor(key.fn, state.data);
      const def = statKeyDef(key.fn);
      if (!outcome.ok) return { ...state, display: '—', note: outcome.note };
      const n = state.data.length;
    return { ...state, display: format(outcome.value), note: `${def.name} — ${n} ${n === 1 ? 'value' : 'values'}` };
    }
  }
}
