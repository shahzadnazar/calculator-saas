import { describe, it, expect } from 'vitest';
import {
  INITIAL_KEYPAD,
  pressKey,
  parseEntry,
  statFor,
  STAT_KEYS,
  statKeyDef,
  MSG,
  type KeypadKey,
  type KeypadState,
} from './statistics-keypad';
import { formatStat } from './statistics-form';

const press = (state: KeypadState, ...keys: KeypadKey[]): KeypadState =>
  keys.reduce((s, k) => pressKey(s, k, formatStat), state);

const digits = (text: string): KeypadKey[] =>
  [...text].map((c) => (c === '.' ? { kind: 'dot' } : { kind: 'digit', value: c }));

/** Type a list of numbers into the keypad, pressing ADD after each. */
const enter = (values: number[]): KeypadState =>
  values.reduce(
    (s, v) => press(s, ...digits(String(v)), { kind: 'add' }),
    INITIAL_KEYPAD,
  );

const REFERENCE = [10, 2, 38, 23, 38, 23, 21, 23];

/* ---- The key catalog ----------------------------------------------- */

describe('the keypad keys', () => {
  it('offers the reference nine statistics, with the reference symbols', () => {
    expect(STAT_KEYS.map((k) => k.symbol)).toEqual(['x̄', 'x̄²', 'Σx', 'Σx²', 'σ', 'σ²', 's', 's²', 'GM']);
  });

  it('names every symbol, so it does not have to be decoded', () => {
    for (const k of STAT_KEYS) {
      expect(k.name.length, k.symbol).toBeGreaterThan(0);
      expect(k.aria.length, k.symbol).toBeGreaterThan(0);
    }
    expect(statKeyDef('sumOfSquares').name).toBe('Sum of squares');
  });
});

/* ---- Entry -------------------------------------------------------- */

describe('parseEntry', () => {
  it('accepts a finished number', () => {
    expect(parseEntry('23')).toBe(23);
    expect(parseEntry('-2.5')).toBe(-2.5);
    expect(parseEntry('1.5e3')).toBe(1500);
    expect(parseEntry('1.5e-3')).toBe(0.0015);
  });

  it('refuses a half-typed one', () => {
    expect(parseEntry('')).toBe(null);
    expect(parseEntry('-')).toBe(null);
    expect(parseEntry('2e')).toBe(null);
    expect(parseEntry('1.2.3')).toBe(null);
  });
});

describe('typing', () => {
  it('replaces a leading zero rather than appending to it', () => {
    expect(press(INITIAL_KEYPAD, ...digits('07')).entry).toBe('7');
  });

  it('allows one decimal point, and starts one with a zero', () => {
    expect(press(INITIAL_KEYPAD, { kind: 'dot' }).entry).toBe('0.');
    expect(press(INITIAL_KEYPAD, ...digits('1.5'), { kind: 'dot' }).entry).toBe('1.5');
  });

  it('toggles the sign of the value, and of the exponent once one is open', () => {
    expect(press(INITIAL_KEYPAD, ...digits('15'), { kind: 'sign' }).entry).toBe('-15');
    expect(press(INITIAL_KEYPAD, ...digits('15'), { kind: 'sign' }, { kind: 'sign' }).entry).toBe('15');
    const exp = press(INITIAL_KEYPAD, ...digits('15'), { kind: 'exp' }, { kind: 'sign' }, ...digits('3'));
    expect(exp.entry).toBe('15e-3');
  });

  it('refuses an exponent with nothing to raise, or a second one', () => {
    expect(press(INITIAL_KEYPAD, { kind: 'exp' }).entry).toBe('');
    expect(press(INITIAL_KEYPAD, ...digits('2'), { kind: 'exp' }, { kind: 'exp' }).entry).toBe('2e');
  });

  it('backspaces a character and clears an entry, leaving the data alone', () => {
    const s = press(enter([4, 5]), ...digits('12'));
    expect(press(s, { kind: 'backspace' }).entry).toBe('1');
    const cleared = press(s, { kind: 'clearEntry' });
    expect(cleared.entry).toBe('');
    expect(cleared.display).toBe('0');
    expect(cleared.data).toEqual([4, 5]);
  });
});

/* ---- Accumulating ------------------------------------------------- */

describe('ADD and the data set', () => {
  it('accumulates values in the order they are entered', () => {
    expect(enter(REFERENCE).data).toEqual(REFERENCE);
  });

  it('confirms each addition and reports the running count', () => {
    const s = enter([4]);
    expect(s.note).toBe(MSG.added('4', 1));
    expect(s.display).toBe('4');
    expect(s.entry).toBe('');
  });

  it('asks for a number rather than adding nothing', () => {
    const s = press(INITIAL_KEYPAD, { kind: 'add' });
    expect(s.note).toBe(MSG.typeFirst);
    expect(s.data).toEqual([]);
  });

  it('removes one value by position and leaves the rest in order', () => {
    const s = press(enter([1, 2, 3]), { kind: 'remove', index: 1 });
    expect(s.data).toEqual([1, 3]);
    expect(s.note).toBe(MSG.removed('2', 2));
  });

  it('ignores a removal that is not in the set', () => {
    const s = enter([1, 2]);
    expect(press(s, { kind: 'remove', index: 5 })).toBe(s);
    expect(press(s, { kind: 'remove', index: -1 })).toBe(s);
  });

  it('CAD clears everything back to the start', () => {
    const s = press(enter([1, 2, 3]), { kind: 'clearAll' });
    expect(s.data).toEqual([]);
    expect(s.display).toBe('0');
    expect(s.note).toBe(MSG.cleared);
  });
});

/* ---- The statistics ------------------------------------------------ */

describe('the function keys, on the reference data set', () => {
  const base = enter(REFERENCE);
  const read = (fn: Parameters<typeof statFor>[0]) => press(base, { kind: 'stat', fn }).display;

  it('reports every statistic exactly as the reference table prints it', () => {
    expect(read('mean')).toBe('22.25');
    expect(read('sum')).toBe('178');
    expect(read('popSD')).toBe('11.508149286484');
    expect(read('popVar')).toBe('132.4375');
    expect(read('sampleSD')).toBe('12.302729081677');
    expect(read('sampleVar')).toBe('151.35714285714');
    expect(read('gm')).toBe('17.119851726053');
  });

  it('reports Σx² as the sum of the SQUARED values, not the squared sum', () => {
    expect(read('sumOfSquares')).toBe('5020'); // 10² + 2² + … = 5020, not 178² = 31684
  });

  it('reports x̄² as the mean of those squares', () => {
    expect(read('meanOfSquares')).toBe('627.5'); // 5020 / 8
  });

  it('names what it just reported', () => {
    expect(press(base, { kind: 'stat', fn: 'mean' }).note).toBe('Mean — 8 values');
  });
});

/**
 * The reference's one real trap: a number typed but never ADDed is not in the data set, and the
 * reference answers anyway — for a set the visitor does not think they have.
 */
describe('a pending entry blocks a statistic instead of answering the wrong question', () => {
  it('says what to press, and does not compute', () => {
    const s = press(enter([2, 4]), ...digits('99'), { kind: 'stat', fn: 'mean' });
    expect(s.note).toBe(MSG.addFirst('99'));
    expect(s.display).toBe('99'); // still the entry, not a mean of 2 and 4
    expect(s.data).toEqual([2, 4]);
  });

  it('answers once the value is added', () => {
    const s = press(enter([2, 4]), ...digits('6'), { kind: 'add' }, { kind: 'stat', fn: 'mean' });
    expect(s.display).toBe('4');
  });
});

describe('statistics that are not defined say so', () => {
  it('needs data at all', () => {
    const s = press(INITIAL_KEYPAD, { kind: 'stat', fn: 'mean' });
    expect(s.display).toBe('—');
    expect(s.note).toBe(MSG.noData);
  });

  it('needs two values for a sample figure', () => {
    for (const fn of ['sampleSD', 'sampleVar'] as const) {
      const s = press(enter([5]), { kind: 'stat', fn });
      expect(s.display, fn).toBe('—');
      expect(s.note, fn).toBe(MSG.needTwo);
    }
  });

  it('needs every value positive for a geometric mean', () => {
    for (const data of [[0, 4, 9], [-2, 4, 9]]) {
      const s = press(enter(data), { kind: 'stat', fn: 'gm' });
      expect(s.display).toBe('—');
      expect(s.note).toBe(MSG.needPositive);
    }
  });

  it('never shows NaN, Infinity or undefined for any key, on any of these sets', () => {
    for (const data of [[], [5], [0, 4, 9], [-2, -4], REFERENCE]) {
      for (const k of STAT_KEYS) {
        const s = press(enter(data), { kind: 'stat', fn: k.fn });
        expect(s.display, `${k.symbol} on ${JSON.stringify(data)}`).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });
});

describe('statFor', () => {
  it('refuses an empty set rather than dividing by zero', () => {
    expect(statFor('mean', [])).toEqual({ ok: false, note: MSG.noData });
  });

  it('returns a finite value for every key on a positive set of two or more', () => {
    for (const k of STAT_KEYS) {
      const outcome = statFor(k.fn, REFERENCE);
      expect(outcome.ok, k.symbol).toBe(true);
      if (outcome.ok) expect(Number.isFinite(outcome.value), k.symbol).toBe(true);
    }
  });
});
