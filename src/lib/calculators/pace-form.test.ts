import { describe, it, expect } from 'vitest';
import {
  MSG,
  SOLVE_TARGETS,
  LENGTH_UNITS,
  parseTime,
  parsePace,
  parseDistance,
  validatePaceValues,
  computePaceValues,
  completePaceValue,
  describePaceResult,
  headlineValue,
  headlineUnit,
  headlineLabel,
  formatDistance,
  formatDuration,
  paceBinding,
  PACE_EXAMPLE_VALUES,
  type PaceValues,
} from './pace-form';

/**
 * The binding's pure surface. The solver lives in the reviewed pure `pace.ts`; here we pin
 * the h:m:s parsing, the rule that only the two boxes being READ are required, and the
 * headline that changes with the target.
 */

const base: PaceValues = {
  solveFor: 'pace',
  h: '0',
  m: '48',
  s: '0',
  distance: '6',
  distanceUnit: 'mi',
  paceMin: '',
  paceSec: '',
  paceUnit: 'mi',
};
const v = (over: Partial<PaceValues> = {}): PaceValues => ({ ...base, ...over });

describe('the three targets', () => {
  it('are the three the form offers', () => {
    expect(SOLVE_TARGETS.map((t) => t.label)).toEqual(['Pace', 'Time', 'Distance']);
  });

  it('pace, from a time and a distance', () => {
    const r = computePaceValues(v());
    expect(headlineValue(r)).toBe('8:00');
    expect(headlineUnit(r)).toBe('per Mile');
    expect(headlineLabel(r)).toBe('Pace');
  });

  it('time, from a distance and a pace', () => {
    const r = computePaceValues(v({ solveFor: 'time', h: '', m: '', s: '', paceMin: '8', paceSec: '0' }));
    expect(headlineValue(r)).toBe('48:00');
    expect(headlineUnit(r)).toBe('');
    expect(headlineLabel(r)).toBe('Time');
  });

  it('distance, from a time and a pace', () => {
    const r = computePaceValues(v({ solveFor: 'distance', distance: '', paceMin: '8', paceSec: '0' }));
    expect(headlineValue(r)).toBe('6');
    expect(headlineUnit(r)).toBe('Miles');
    expect(headlineLabel(r)).toBe('Distance');
  });

  it('all three agree, whichever was solved for', () => {
    const answers = [
      computePaceValues(v()),
      computePaceValues(v({ solveFor: 'time', h: '', m: '', s: '', paceMin: '8', paceSec: '0' })),
      computePaceValues(v({ solveFor: 'distance', distance: '', paceMin: '8', paceSec: '0' })),
    ];
    for (const a of answers) {
      expect(a.timeSeconds).toBeCloseTo(2880, 6);
      expect(a.distance).toBeCloseTo(6, 6);
      expect(a.paceSeconds).toBeCloseTo(480, 6);
    }
  });
});

describe('only the two boxes being READ are required', () => {
  it('solving for pace does not ask for a pace', () => {
    expect(validatePaceValues(v({ solveFor: 'pace', paceMin: '', paceSec: '' }))).toEqual({ ok: true });
  });
  it('solving for time does not ask for a time', () => {
    expect(
      validatePaceValues(v({ solveFor: 'time', h: '', m: '', s: '', paceMin: '8', paceSec: '0' })),
    ).toEqual({ ok: true });
  });
  it('solving for distance does not ask for a distance', () => {
    expect(
      validatePaceValues(v({ solveFor: 'distance', distance: '', paceMin: '8', paceSec: '0' })),
    ).toEqual({ ok: true });
  });
  it('but it does ask for the other two', () => {
    const r = validatePaceValues(v({ solveFor: 'pace', h: '', m: '', s: '', distance: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors!.time).toBe(MSG.timeMissing);
      expect(r.fieldErrors!.distance).toBe(MSG.distanceMissing);
      expect(r.fieldErrors!.pace).toBeUndefined();
    }
  });
});

describe('parsing the time boxes', () => {
  it('adds up whole hours, minutes and seconds', () => {
    expect(parseTime({ h: '1', m: '30', s: '15' })).toEqual({ seconds: 5415 });
    expect(parseTime({ h: '', m: '48', s: '' })).toEqual({ seconds: 2880 });
  });
  it('treats a wholly empty time as missing, not as zero', () => {
    expect(parseTime({ h: '', m: '', s: '' })).toEqual({ error: MSG.timeMissing });
  });
  it('rejects an all-zero time, which is not a duration', () => {
    expect(parseTime({ h: '0', m: '0', s: '0' })).toEqual({ error: MSG.timeZero });
  });
  it('never normalises 60 into the next unit — it says so', () => {
    expect(parseTime({ h: '0', m: '60', s: '0' })).toEqual({ error: MSG.timeMinutes });
    expect(parseTime({ h: '0', m: '0', s: '60' })).toEqual({ error: MSG.timeSeconds });
  });
  it('rejects fractions and negatives', () => {
    expect(parseTime({ h: '1.5', m: '', s: '' })).toEqual({ error: MSG.timeParts });
    expect(parseTime({ h: '-1', m: '', s: '' })).toEqual({ error: MSG.timeParts });
    expect(parseTime({ h: '', m: '', s: 'x' })).toEqual({ error: MSG.timeSeconds });
  });
});

describe('parsing the pace boxes', () => {
  it('adds up minutes and seconds', () => {
    expect(parsePace({ paceMin: '8', paceSec: '30' })).toEqual({ seconds: 510 });
    expect(parsePace({ paceMin: '', paceSec: '45' })).toEqual({ seconds: 45 });
  });
  it('treats a wholly empty pace as missing and an all-zero one as impossible', () => {
    expect(parsePace({ paceMin: '', paceSec: '' })).toEqual({ error: MSG.paceMissing });
    expect(parsePace({ paceMin: '0', paceSec: '0' })).toEqual({ error: MSG.paceZero });
  });
  it('rejects 60 seconds rather than rolling it over', () => {
    expect(parsePace({ paceMin: '8', paceSec: '60' })).toEqual({ error: MSG.paceSeconds });
  });
});

describe('parsing the distance box', () => {
  it('accepts a positive number, including a fractional one', () => {
    expect(parseDistance('42.195')).toEqual({ value: 42.195 });
  });
  it('refuses empty, zero, negative and nonsense', () => {
    expect(parseDistance('')).toEqual({ error: MSG.distanceMissing });
    expect(parseDistance('0')).toEqual({ error: MSG.distancePositive });
    expect(parseDistance('-3')).toEqual({ error: MSG.distancePositive });
    expect(parseDistance('abc')).toEqual({ error: MSG.distancePositive });
  });
});

describe('units', () => {
  it('offers the five length units', () => {
    expect(LENGTH_UNITS.map((u) => u.label)).toEqual(['Miles', 'Kilometers', 'Meters', 'Yards', 'Feet']);
  });

  it('the pace unit is independent of the distance unit', () => {
    const r = computePaceValues(v({ distance: '10', distanceUnit: 'km', paceUnit: 'mi' }));
    expect(formatDuration(r.paceSeconds)).toBe('7:43'); // 288 s/km × 1.609344 = 463.5 s/mile
    expect(formatDuration(r.secPerKm)).toBe('4:48');
  });

  it('an unknown unit yields nothing rather than a wrong number', () => {
    expect(Number.isNaN(completePaceValue(computePaceValues(v({ distanceUnit: 'furlong' }))))).toBe(true);
  });
});

describe('completePaceValue — all three or nothing', () => {
  it('is finite for a complete entry in each mode', () => {
    expect(Number.isFinite(completePaceValue(computePaceValues(v())))).toBe(true);
    expect(
      Number.isFinite(
        completePaceValue(computePaceValues(v({ solveFor: 'time', h: '', m: '', s: '', paceMin: '8', paceSec: '0' }))),
      ),
    ).toBe(true);
  });
  it('is NaN when a box the solver reads is missing', () => {
    expect(Number.isNaN(completePaceValue(computePaceValues(v({ distance: '' }))))).toBe(true);
    expect(Number.isNaN(completePaceValue(computePaceValues(v({ h: '', m: '', s: '' }))))).toBe(true);
  });
});

describe('formatting and speech', () => {
  it('never prints a non-number', () => {
    expect(formatDistance(Number.NaN)).toBe('—');
    expect(formatDistance(0)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
  it('trims a distance to two decimals rather than printing float noise', () => {
    expect(formatDistance(6.000000000001)).toBe('6');
    expect(formatDistance(26.21875)).toBe('26.22');
  });
  it('announces the figure that was asked for, and nothing else', () => {
    expect(describePaceResult(computePaceValues(v()))).toBe('Your pace is 8:00 per Mile.');
    expect(
      describePaceResult(computePaceValues(v({ solveFor: 'time', h: '', m: '', s: '', paceMin: '8', paceSec: '0' }))),
    ).toBe('That distance at that pace takes 48:00.');
    expect(
      describePaceResult(computePaceValues(v({ solveFor: 'distance', distance: '', paceMin: '8', paceSec: '0' }))),
    ).toBe('At that pace you cover 6 Miles.');
  });
});

describe('the labelled example', () => {
  it('is a round 10K, and solves', () => {
    expect(PACE_EXAMPLE_VALUES).toMatchObject({ solveFor: 'pace', m: '50', distance: '10', distanceUnit: 'km' });
    expect(validatePaceValues(PACE_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(formatDuration(computePaceValues(PACE_EXAMPLE_VALUES).paceSeconds)).toBe('5:00');
  });
});

describe('the binding wires the pure parts together', () => {
  it('gates the result on the complete-report guard', () => {
    expect(paceBinding.resultValue).toBe(completePaceValue);
    expect(paceBinding.validate).toBe(validatePaceValues);
    expect(paceBinding.compute).toBe(computePaceValues);
  });
});
