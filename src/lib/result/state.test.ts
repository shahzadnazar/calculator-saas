import { describe, it, expect } from 'vitest';
import {
  reduceResult,
  isTransient,
  sanitizeResultNumber,
  presentResultValue,
  accessibleUnit,
  accessibleResultName,
  resultAnnouncement,
  INITIAL_STATUS,
  type ResultStatus,
  type ResultEvent,
} from './state';

/**
 * The result state machine is the shared contract every future calculator
 * runtime binds to, so its transitions must be total and its illegal moves must
 * be inert. These tests pin the two-axis model (content `state` × transient
 * `activity`), the no-op protection on impossible events, and the text helpers
 * that keep NaN/Infinity and screen-reader spam out of the UI.
 */

const status = (state: ResultStatus['state'], activity: ResultStatus['activity']): ResultStatus => ({
  state,
  activity,
});
const reduce = (s: ResultStatus, e: ResultEvent) => reduceResult(s, e);

/* ------------------------------------------------------------------ */
/* Initial status                                                      */
/* ------------------------------------------------------------------ */

describe('INITIAL_STATUS', () => {
  it('starts empty and idle — no sample result in the panel', () => {
    expect(INITIAL_STATUS).toEqual({ state: 'empty', activity: 'idle' });
  });
});

/* ------------------------------------------------------------------ */
/* Legal transitions                                                   */
/* ------------------------------------------------------------------ */

describe('reduceResult — legal transitions', () => {
  it('reset from any status returns to empty / idle', () => {
    expect(reduce(status('valid', 'just-updated'), { type: 'reset' })).toEqual({
      state: 'empty',
      activity: 'idle',
    });
    expect(reduce(status('invalid', 'idle'), { type: 'reset' })).toEqual({
      state: 'empty',
      activity: 'idle',
    });
    expect(reduce(status('example', 'idle'), { type: 'reset' })).toEqual({
      state: 'empty',
      activity: 'idle',
    });
  });

  it('showExample enters the example state, idle', () => {
    expect(reduce(INITIAL_STATUS, { type: 'showExample' })).toEqual({
      state: 'example',
      activity: 'idle',
    });
  });

  it('calculate(valid) yields valid + just-updated (a transient announcement)', () => {
    expect(reduce(INITIAL_STATUS, { type: 'calculate', valid: true })).toEqual({
      state: 'valid',
      activity: 'just-updated',
    });
  });

  it('calculate(invalid) yields invalid + idle (errors do not animate)', () => {
    expect(reduce(INITIAL_STATUS, { type: 'calculate', valid: false })).toEqual({
      state: 'invalid',
      activity: 'idle',
    });
  });

  it('invalid recovers to valid on the next successful calculate', () => {
    const invalid = reduce(INITIAL_STATUS, { type: 'calculate', valid: false });
    expect(reduce(invalid, { type: 'calculate', valid: true })).toEqual({
      state: 'valid',
      activity: 'just-updated',
    });
  });

  it('example transitions straight to valid on an explicit calculate', () => {
    const example = reduce(INITIAL_STATUS, { type: 'showExample' });
    expect(reduce(example, { type: 'calculate', valid: true })).toEqual({
      state: 'valid',
      activity: 'just-updated',
    });
  });
});

/* ------------------------------------------------------------------ */
/* Live-after-first updates                                            */
/* ------------------------------------------------------------------ */

describe('reduceResult — liveUpdate', () => {
  const valid = status('valid', 'idle');

  it('an imperceptible live update refreshes to just-updated (no calculating flash)', () => {
    expect(reduce(valid, { type: 'liveUpdate', valid: true })).toEqual({
      state: 'valid',
      activity: 'just-updated',
    });
  });

  it('a perceptible live update shows calculating first', () => {
    expect(reduce(valid, { type: 'liveUpdate', valid: true, perceptible: true })).toEqual({
      state: 'valid',
      activity: 'calculating',
    });
  });

  it('a live update that turns invalid drops to invalid / idle', () => {
    expect(reduce(valid, { type: 'liveUpdate', valid: false })).toEqual({
      state: 'invalid',
      activity: 'idle',
    });
  });

  it('is ignored before the first valid result (empty/example/invalid are inert)', () => {
    const empty = status('empty', 'idle');
    const example = status('example', 'idle');
    const invalid = status('invalid', 'idle');
    expect(reduce(empty, { type: 'liveUpdate', valid: true })).toBe(empty);
    expect(reduce(example, { type: 'liveUpdate', valid: true })).toBe(example);
    expect(reduce(invalid, { type: 'liveUpdate', valid: true })).toBe(invalid);
  });
});

/* ------------------------------------------------------------------ */
/* computed + settle (transient lifecycle)                             */
/* ------------------------------------------------------------------ */

describe('reduceResult — computed', () => {
  it('advances calculating to just-updated', () => {
    const calculating = status('valid', 'calculating');
    expect(reduce(calculating, { type: 'computed' })).toEqual({
      state: 'valid',
      activity: 'just-updated',
    });
  });

  it('is a no-op when not calculating', () => {
    const idle = status('valid', 'idle');
    const justUpdated = status('valid', 'just-updated');
    expect(reduce(idle, { type: 'computed' })).toBe(idle);
    expect(reduce(justUpdated, { type: 'computed' })).toBe(justUpdated);
  });
});

describe('reduceResult — settle', () => {
  it('settles any transient activity back to idle, preserving content state', () => {
    expect(reduce(status('valid', 'just-updated'), { type: 'settle' })).toEqual({
      state: 'valid',
      activity: 'idle',
    });
    expect(reduce(status('valid', 'calculating'), { type: 'settle' })).toEqual({
      state: 'valid',
      activity: 'idle',
    });
  });

  it('is a no-op when already idle', () => {
    const idle = status('valid', 'idle');
    expect(reduce(idle, { type: 'settle' })).toBe(idle);
  });
});

/* ------------------------------------------------------------------ */
/* Illegal-transition protection                                       */
/* ------------------------------------------------------------------ */

describe('reduceResult — illegal-transition protection', () => {
  it('never throws and never invents a state for an unknown event', () => {
    const s = status('valid', 'idle');
    // deliberately malformed event — the reducer must return the same value
    expect(reduce(s, { type: 'nonsense' } as unknown as ResultEvent)).toBe(s);
  });

  it('computed cannot fabricate a just-updated out of an empty result', () => {
    const empty = status('empty', 'idle');
    expect(reduce(empty, { type: 'computed' })).toBe(empty);
  });

  it('liveUpdate cannot resurrect a result that was never calculated', () => {
    const empty = status('empty', 'idle');
    expect(reduce(empty, { type: 'liveUpdate', valid: true, perceptible: true })).toBe(empty);
  });

  it('there is no permanent reset/updated/completed content state', () => {
    // The only content states reachable are the four in the union.
    const reachable = new Set<string>();
    const seeds: ResultStatus[] = [
      status('empty', 'idle'),
      status('example', 'idle'),
      status('valid', 'idle'),
      status('valid', 'calculating'),
      status('valid', 'just-updated'),
      status('invalid', 'idle'),
    ];
    const events: ResultEvent[] = [
      { type: 'reset' },
      { type: 'showExample' },
      { type: 'calculate', valid: true },
      { type: 'calculate', valid: false },
      { type: 'liveUpdate', valid: true },
      { type: 'liveUpdate', valid: true, perceptible: true },
      { type: 'liveUpdate', valid: false },
      { type: 'computed' },
      { type: 'settle' },
    ];
    for (const seed of seeds)
      for (const ev of events) reachable.add(reduce(seed, ev).state);
    expect([...reachable].sort()).toEqual(['empty', 'example', 'invalid', 'valid']);
  });
});

/* ------------------------------------------------------------------ */
/* isTransient                                                         */
/* ------------------------------------------------------------------ */

describe('isTransient', () => {
  it('is true only while an activity is in flight', () => {
    expect(isTransient(status('valid', 'idle'))).toBe(false);
    expect(isTransient(status('valid', 'calculating'))).toBe(true);
    expect(isTransient(status('valid', 'just-updated'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Value sanitization                                                  */
/* ------------------------------------------------------------------ */

describe('sanitizeResultNumber', () => {
  it('passes finite numbers through, including zero and negatives', () => {
    expect(sanitizeResultNumber(0)).toBe(0);
    expect(sanitizeResultNumber(-12.5)).toBe(-12.5);
    expect(sanitizeResultNumber(42)).toBe(42);
  });
  it('maps every non-finite value to null (never NaN/Infinity)', () => {
    expect(sanitizeResultNumber(NaN)).toBeNull();
    expect(sanitizeResultNumber(Infinity)).toBeNull();
    expect(sanitizeResultNumber(-Infinity)).toBeNull();
    expect(sanitizeResultNumber(1 / 0)).toBeNull();
  });
});

describe('presentResultValue', () => {
  it('renders a dash for null, undefined and non-finite numbers', () => {
    expect(presentResultValue(null)).toBe('—');
    expect(presentResultValue(undefined)).toBe('—');
    expect(presentResultValue(NaN)).toBe('—');
    expect(presentResultValue(Infinity)).toBe('—');
  });
  it('accepts a custom dash', () => {
    expect(presentResultValue(null, '--')).toBe('--');
  });
  it('stringifies a finite number and preserves a pre-formatted string', () => {
    expect(presentResultValue(0)).toBe('0');
    expect(presentResultValue(3.14)).toBe('3.14');
    expect(presentResultValue('1,234.50')).toBe('1,234.50');
    expect(presentResultValue('$1,234.50')).toBe('$1,234.50');
  });
});

/* ------------------------------------------------------------------ */
/* Accessible units + result name                                      */
/* ------------------------------------------------------------------ */

describe('accessibleUnit', () => {
  it('expands abbreviated notation to spoken words', () => {
    expect(accessibleUnit('%')).toBe('percent');
    expect(accessibleUnit('kg/m²')).toBe('kilograms per square metre');
    expect(accessibleUnit('kg')).toBe('kilograms');
    expect(accessibleUnit('bpm')).toBe('beats per minute');
    expect(accessibleUnit('/mo')).toBe('per month');
  });
  it('is case- and whitespace-insensitive for known units', () => {
    expect(accessibleUnit('  KG  ')).toBe('kilograms');
    expect(accessibleUnit('Lbs')).toBe('pounds');
  });
  it('returns an unknown unit unchanged so it is still spoken', () => {
    expect(accessibleUnit('widgets')).toBe('widgets');
    expect(accessibleUnit('₿')).toBe('₿');
  });
});

describe('accessibleResultName', () => {
  it('combines value and spoken unit', () => {
    expect(accessibleResultName('22.4', 'kg/m²')).toBe('22.4 kilograms per square metre');
    expect(accessibleResultName('35', '%')).toBe('35 percent');
  });
  it('returns just the value when there is no unit', () => {
    expect(accessibleResultName('1,234.50')).toBe('1,234.50');
    expect(accessibleResultName('  42  ')).toBe('42');
  });
});

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

describe('resultAnnouncement', () => {
  it('announces a completed valid result exactly once (valid + just-updated)', () => {
    expect(
      resultAnnouncement(status('valid', 'just-updated'), { valueLabel: '22.4 kilograms per square metre' }),
    ).toBe('22.4 kilograms per square metre');
  });

  it('announces an error whenever the result is invalid', () => {
    expect(resultAnnouncement(status('invalid', 'idle'), { errorLabel: 'Enter a weight above zero.' })).toBe(
      'Enter a weight above zero.',
    );
    expect(resultAnnouncement(status('invalid', 'idle'))).toBe('The values entered are not valid.');
  });

  it('is silent for empty and example — no announcement before a real result', () => {
    expect(resultAnnouncement(status('empty', 'idle'))).toBeNull();
    expect(resultAnnouncement(status('example', 'idle'), { valueLabel: 'ignored' })).toBeNull();
  });

  it('is silent while calculating and once a valid result has settled to idle', () => {
    // Not spammed on every animation frame or keystroke.
    expect(resultAnnouncement(status('valid', 'calculating'), { valueLabel: 'x' })).toBeNull();
    expect(resultAnnouncement(status('valid', 'idle'), { valueLabel: 'x' })).toBeNull();
  });

  it('announces at most once across a full calculate → settle cycle', () => {
    const seq: ResultStatus[] = [];
    let s = INITIAL_STATUS;
    seq.push(s);
    s = reduce(s, { type: 'calculate', valid: true }); // valid + just-updated → announce
    seq.push(s);
    s = reduce(s, { type: 'settle' }); // valid + idle → silent
    seq.push(s);
    const spoken = seq.map((st) => resultAnnouncement(st, { valueLabel: '22.4' })).filter(Boolean);
    expect(spoken).toEqual(['22.4']);
  });
});
