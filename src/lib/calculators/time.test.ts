import { describe, it, expect } from 'vitest';
import { toSeconds, combineDurations, breakdownDuration, type Duration } from './time';

/**
 * Time arithmetic characterization (R17B3 Commit 1). Freezes the exact behaviour of the UNCHANGED
 * `toSeconds` / `combineDurations` / `breakdownDuration` so the task-first migration's stricter
 * visitor validation is a visible binding-level decision, not a formula change. Consolidated out of
 * `batch-d.test.ts` (the Random Number Generator cases stay there).
 *
 * Contract pinned here:
 *  - toSeconds: (days|0)·86400 + (hours|0)·3600 + (minutes|0)·60 + (seconds|0); `||0` per key, so a
 *    missing / NaN component is 0 while Infinity PROPAGATES; decimals and oversized components pass
 *    through unnormalised; negative components subtract.
 *  - combineDurations: add → a+b, subtract → a−b; the total MAY be negative and MAY be fractional.
 *  - breakdownDuration: the SIGN is carried SEPARATELY (a `negative` boolean); the d/h/m/s components
 *    are always NON-NEGATIVE, taken from `Math.abs(Math.round(totalSeconds))` — i.e. the breakdown is
 *    WHOLE-SECOND and ROUNDS a fractional total (this is why the binding requires whole components).
 */

const secs = (d: Partial<Duration>) => toSeconds(d);

/* ------------------------------------------------------------------ */
/* toSeconds                                                          */
/* ------------------------------------------------------------------ */

describe('time — toSeconds', () => {
  it('an empty / zero duration is 0 seconds', () => {
    expect(toSeconds({})).toBe(0);
    expect(toSeconds({ days: 0, hours: 0, minutes: 0, seconds: 0 })).toBe(0);
  });

  it('converts each unit with the fixed factors', () => {
    expect(toSeconds({ seconds: 45 })).toBe(45);
    expect(toSeconds({ minutes: 1 })).toBe(60);
    expect(toSeconds({ hours: 1 })).toBe(3600);
    expect(toSeconds({ days: 1 })).toBe(86400);
  });

  it('sums mixed components', () => {
    expect(toSeconds({ days: 1, hours: 2, minutes: 3, seconds: 4 })).toBe(86400 + 7200 + 180 + 4);
    expect(toSeconds({ hours: 2, minutes: 30 })).toBe(9000);
    expect(toSeconds({ hours: 1, minutes: 45 })).toBe(6300);
  });

  it('does not normalise oversized components — they pass through as raw seconds', () => {
    expect(toSeconds({ minutes: 90 })).toBe(5400); // 1h30m worth, unnormalised
    expect(toSeconds({ seconds: 3661 })).toBe(3661); // 1h1m1s worth
    expect(toSeconds({ hours: 25 })).toBe(90000);
  });

  it('a missing / NaN key is 0 (|| 0), Infinity PROPAGATES, negatives subtract, decimals pass through', () => {
    expect(toSeconds({ hours: Number.NaN, minutes: 5 })).toBe(300); // NaN||0 → 0
    expect(toSeconds({ hours: Number.POSITIVE_INFINITY })).toBe(Number.POSITIVE_INFINITY);
    expect(toSeconds({ hours: -1 })).toBe(-3600); // negative component subtracts
    expect(toSeconds({ hours: 1.5 })).toBe(5400); // decimal → exact whole seconds here
    expect(toSeconds({ seconds: 0.5 })).toBe(0.5); // decimal → FRACTIONAL seconds
  });
});

/* ------------------------------------------------------------------ */
/* combineDurations                                                   */
/* ------------------------------------------------------------------ */

describe('time — combineDurations', () => {
  it('adds two totals', () => {
    expect(combineDurations(9000, 'add', 6300)).toBe(15300);
    expect(combineDurations(0, 'add', 45)).toBe(45);
  });

  it('subtracts two totals and MAY go negative', () => {
    expect(combineDurations(9000, 'subtract', 6300)).toBe(2700);
    expect(combineDurations(60, 'subtract', 150)).toBe(-90);
    expect(combineDurations(150, 'subtract', 150)).toBe(0); // equal → exact zero
  });

  it('propagates a fractional total', () => {
    expect(combineDurations(0.5, 'add', 0)).toBe(0.5);
    expect(combineDurations(10, 'subtract', 10.5)).toBe(-0.5);
  });
});

/* ------------------------------------------------------------------ */
/* breakdownDuration                                                  */
/* ------------------------------------------------------------------ */

describe('time — breakdownDuration', () => {
  it('breaks a positive total into non-negative d/h/m/s with negative=false', () => {
    expect(breakdownDuration(15300)).toEqual({ days: 0, hours: 4, minutes: 15, seconds: 0, negative: false });
    expect(breakdownDuration(90061)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1, negative: false });
  });

  it('an exact zero total is all-zero, negative=false', () => {
    expect(breakdownDuration(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, negative: false });
  });

  it('a NEGATIVE total sets negative=true with non-negative components (sign carried separately)', () => {
    expect(breakdownDuration(-90)).toEqual({ days: 0, hours: 0, minutes: 1, seconds: 30, negative: true });
    expect(breakdownDuration(-90061)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1, negative: true });
  });

  it('carries seconds→minutes→hours→days by flooring', () => {
    expect(breakdownDuration(60)).toMatchObject({ minutes: 1, seconds: 0 });
    expect(breakdownDuration(3600)).toMatchObject({ hours: 1, minutes: 0 });
    expect(breakdownDuration(86400)).toMatchObject({ days: 1, hours: 0 });
    expect(breakdownDuration(5400)).toMatchObject({ hours: 1, minutes: 30, seconds: 0 }); // 90 minutes normalised
  });

  it('ROUNDS a fractional total to whole seconds (why the binding requires whole components)', () => {
    expect(breakdownDuration(0.5)).toMatchObject({ seconds: 1, negative: false }); // Math.round(0.5)=1 — DISAGREES with a 0.5 total
    expect(breakdownDuration(1.4)).toMatchObject({ seconds: 1 });
    expect(breakdownDuration(1.5)).toMatchObject({ seconds: 2 });
    // Math.round(-0.5) = -0 (half rounds toward +∞), so |round| = 0 → a QUIRK: negative flag true but a
    // zero magnitude. A whole-component visitor input never reaches this; the binding guard rejects a
    // non-integer total so this "negative zero-magnitude" is never presented.
    expect(breakdownDuration(-0.5)).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 0, negative: true });
  });

  it('does not leak negative zero (−0 is not < 0)', () => {
    const d = breakdownDuration(-0);
    expect(d.negative).toBe(false);
    expect(d).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('the magnitude decomposition reconciles with Math.round(|total|)', () => {
    for (const t of [15300, -90, 90061, 0, 3661]) {
      const d = breakdownDuration(t);
      expect(d.days * 86400 + d.hours * 3600 + d.minutes * 60 + d.seconds).toBe(Math.abs(Math.round(t)));
    }
  });

  it('is deterministic', () => {
    expect(breakdownDuration(15300)).toEqual(breakdownDuration(15300));
  });
});

/* ------------------------------------------------------------------ */
/* decimal components (R17B3.1) — the source accepts them; many are    */
/* exact whole seconds, and the breakdown rounds a fractional total    */
/* ------------------------------------------------------------------ */

describe('time — decimal source behaviour', () => {
  it('decimal components convert exactly (many land on whole seconds)', () => {
    expect(toSeconds({ days: 0.5 })).toBe(43200); // exact whole seconds
    expect(toSeconds({ hours: 1.5 })).toBe(5400); // exact
    expect(toSeconds({ minutes: 1.5 })).toBe(90); // exact
    expect(toSeconds({ seconds: 1.5 })).toBe(1.5); // fractional seconds
  });

  it('mixed decimal components can still sum to an exact whole-second total', () => {
    expect(toSeconds({ hours: 1.5, minutes: 1.5, seconds: 30 })).toBe(5400 + 90 + 30); // 5520
    expect(combineDurations(toSeconds({ hours: 0.5 }), 'add', toSeconds({ minutes: 30 }))).toBe(3600); // 30m + 30m
  });

  it('breakdownDuration on whole-second totals is exact', () => {
    expect(breakdownDuration(90)).toMatchObject({ minutes: 1, seconds: 30, negative: false });
    expect(breakdownDuration(5400)).toMatchObject({ hours: 1, minutes: 30, seconds: 0, negative: false });
    expect(breakdownDuration(43200)).toMatchObject({ hours: 12, minutes: 0, seconds: 0, negative: false });
  });

  it('breakdownDuration ROUNDS a fractional total (half rounds toward +∞)', () => {
    expect(breakdownDuration(1.4)).toMatchObject({ seconds: 1, negative: false });
    expect(breakdownDuration(1.5)).toMatchObject({ seconds: 2, negative: false });
    expect(breakdownDuration(1.6)).toMatchObject({ seconds: 2, negative: false });
  });

  it('a fractional NEGATIVE total sets negative from `< 0` and rounds the magnitude', () => {
    // Math.round(-0.4) = -0 → magnitude 0; negative flag from -0.4 < 0
    expect(breakdownDuration(-0.4)).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 0, negative: true });
    // Math.round(-0.5) = -0 (half toward +∞) → magnitude 0; the -0 quirk
    expect(breakdownDuration(-0.5)).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 0, negative: true });
    expect(Object.is(Math.round(-0.5), -0)).toBe(true);
    // Math.round(-0.6) = -1 → magnitude 1 second
    expect(breakdownDuration(-0.6)).toMatchObject({ seconds: 1, negative: true });
  });

  it('the magnitude reconciles with Math.abs(Math.round(total)) for fractional totals', () => {
    for (const t of [1.4, 1.5, 1.6, -0.4, -0.5, -0.6, 90.5]) {
      const d = breakdownDuration(t);
      expect(d.days * 86400 + d.hours * 3600 + d.minutes * 60 + d.seconds).toBe(Math.abs(Math.round(t)));
      expect(d.negative).toBe(t < 0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* end-to-end pipeline (the two operations, whole-second inputs)       */
/* ------------------------------------------------------------------ */

describe('time — add / subtract pipeline', () => {
  it('adds durations (2h30m + 1h45m = 4h15m)', () => {
    const d = breakdownDuration(combineDurations(secs({ hours: 2, minutes: 30 }), 'add', secs({ hours: 1, minutes: 45 })));
    expect(d).toMatchObject({ hours: 4, minutes: 15, negative: false });
  });

  it('subtracts to a positive difference (2h30m − 1h45m = 45m)', () => {
    const d = breakdownDuration(combineDurations(secs({ hours: 2, minutes: 30 }), 'subtract', secs({ hours: 1, minutes: 45 })));
    expect(d).toMatchObject({ days: 0, hours: 0, minutes: 45, seconds: 0, negative: false });
  });

  it('subtracts to a negative difference (1m − 2m30s = −1m30s)', () => {
    const d = breakdownDuration(combineDurations(secs({ minutes: 1 }), 'subtract', secs({ minutes: 2, seconds: 30 })));
    expect(d.negative).toBe(true);
    expect(d).toMatchObject({ minutes: 1, seconds: 30 });
  });

  it('equal operands subtract to an exact zero', () => {
    const d = breakdownDuration(combineDurations(secs({ hours: 1 }), 'subtract', secs({ hours: 1 })));
    expect(d).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, negative: false });
  });

  it('borrows across units (1d − 1s = 23h 59m 59s)', () => {
    const d = breakdownDuration(combineDurations(secs({ days: 1 }), 'subtract', secs({ seconds: 1 })));
    expect(d).toEqual({ days: 0, hours: 23, minutes: 59, seconds: 59, negative: false });
  });

  it('normalises oversized inputs through the pipeline (90m + 90m = 3h)', () => {
    const d = breakdownDuration(combineDurations(secs({ minutes: 90 }), 'add', secs({ minutes: 90 })));
    expect(d).toMatchObject({ hours: 3, minutes: 0, seconds: 0 });
  });
});
