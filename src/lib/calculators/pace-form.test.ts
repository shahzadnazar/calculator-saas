import { describe, it, expect } from 'vitest';
import {
  validatePaceValues,
  computePaceForm,
  describePaceResult,
  convertDistance,
  isUsablePace,
  spokenPace,
  paceBinding,
  type PaceValues,
} from './pace-form';

const v = (over: Partial<PaceValues> = {}): PaceValues => ({
  distance: '10',
  unit: 'km',
  h: '',
  m: '50',
  s: '',
  ...over,
});

describe('pace-form — validation', () => {
  it('accepts a valid distance + elapsed time', () => {
    expect(validatePaceValues(v())).toEqual({ ok: true });
    expect(validatePaceValues(v({ h: '1', m: '0', s: '0' })).ok).toBe(true);
  });

  it('requires a distance', () => {
    const r = validatePaceValues(v({ distance: '' }));
    expect(!r.ok && r.fieldErrors?.distance).toBe('Enter a distance.');
  });

  it('rejects zero / negative / non-finite distance', () => {
    for (const bad of ['0', '-5', 'abc']) {
      const r = validatePaceValues(v({ distance: bad }));
      expect(!r.ok && r.fieldErrors?.distance).toBe('Enter a distance greater than zero.');
    }
  });

  it('rejects minutes / seconds of 60 (never normalised) and negative / non-integer components', () => {
    expect(!validatePaceValues(v({ m: '60' })).ok).toBe(true);
    expect((validatePaceValues(v({ m: '60' })) as any).fieldErrors.m).toBe('Enter whole minutes from 0 to 59.');
    expect((validatePaceValues(v({ s: '60' })) as any).fieldErrors.s).toBe('Enter whole seconds from 0 to 59.');
    expect(!validatePaceValues(v({ m: '-5' })).ok).toBe(true);
    expect(!validatePaceValues(v({ s: '30.5' })).ok).toBe(true);
  });

  it('accepts hours with no upper bound but requires whole hours', () => {
    expect(validatePaceValues(v({ h: '2', m: '0', s: '0' })).ok).toBe(true);
    expect((validatePaceValues(v({ h: '1.5' })) as any).fieldErrors.h).toBe('Enter whole hours (0 or more).');
  });

  it('rejects a total elapsed time of zero (all empty or all zero)', () => {
    expect((validatePaceValues(v({ h: '', m: '', s: '' })) as any).fieldErrors.time).toBe(
      'Enter an elapsed time greater than zero.',
    );
    expect((validatePaceValues(v({ h: '0', m: '0', s: '0' })) as any).fieldErrors.time).toBe(
      'Enter an elapsed time greater than zero.',
    );
  });

  it('does not raise the total-time error when a component is itself invalid', () => {
    const r = validatePaceValues(v({ m: '75', s: '' }));
    expect(!r.ok && r.fieldErrors?.m).toBeTruthy();
    expect(!r.ok && r.fieldErrors?.time).toBeUndefined();
  });
});

describe('pace-form — compute + selected-unit result', () => {
  it('computes pace/speed from a kilometre distance (10 km in 50:00)', () => {
    const r = computePaceForm(v());
    expect(r.unit).toBe('km');
    expect(r.timeSeconds).toBe(3000);
    expect(r.secPerKm).toBe(300); // 5:00 /km
    expect(r.kmh).toBeCloseTo(12, 9);
  });

  it('treats a mile distance as the same physical distance', () => {
    const r = computePaceForm(v({ distance: String(10 / 1.609344), unit: 'mi' }));
    expect(r.unit).toBe('mi');
    expect(r.secPerKm).toBeCloseTo(300, 6);
    expect(r.secPerMi).toBeCloseTo(482.8032, 4);
  });

  it('combines h/m/s into total seconds', () => {
    expect(computePaceForm(v({ h: '1', m: '1', s: '1' })).timeSeconds).toBe(3661);
  });

  it('resultValue guards the pace per km; NaN when unusable', () => {
    expect(paceBinding.resultValue(computePaceForm(v()))).toBe(300);
    expect(Number.isNaN(paceBinding.resultValue(computePaceForm(v({ distance: '0' }))))).toBe(true);
  });

  it('isUsablePace requires every metric finite and positive', () => {
    expect(isUsablePace(computePaceForm(v()))).toBe(true);
    expect(isUsablePace(computePaceForm(v({ h: '0', m: '0', s: '0' })))).toBe(false);
  });

  it('preserves the reviewed formula outputs verbatim (no re-derivation)', () => {
    const r = computePaceForm(v());
    expect(r.secPerMi).toBeCloseTo(r.secPerKm * 1.609344, 9);
    expect(r.mph).toBeCloseTo(r.kmh / 1.609344, 9);
  });
});

describe('pace-form — distance-unit conversion (converts the value, not a reinterpretation)', () => {
  it('converts km → mi and mi → km with KM_PER_MI', () => {
    expect(convertDistance(5, 'km', 'mi')).toBe('3.107'); // 5 / 1.609344
    expect(convertDistance(3.107, 'mi', 'km')).toBe('5'); // 3.107 · 1.609344 ≈ 5
  });

  it('round-trips a value stably (5 km → mi → km)', () => {
    const toMi = convertDistance(5, 'km', 'mi')!;
    expect(convertDistance(Number(toMi), 'mi', 'km')).toBe('5');
  });

  it('leaves empty / non-positive / same-unit values untouched (null)', () => {
    expect(convertDistance(null, 'km', 'mi')).toBeNull();
    expect(convertDistance(0, 'km', 'mi')).toBeNull();
    expect(convertDistance(5, 'km', 'km')).toBeNull();
  });
});

describe('pace-form — announcement (dominant selected-unit pace only)', () => {
  it('speaks the kilometre pace when km is selected', () => {
    expect(describePaceResult(computePaceForm(v()))).toBe('Your pace is 5 minutes per kilometre.');
  });

  it('speaks the mile pace when miles are selected', () => {
    const r = computePaceForm(v({ distance: String(10 / 1.609344), unit: 'mi' }));
    expect(describePaceResult(r)).toBe('Your pace is 8 minutes and 3 seconds per mile.');
  });

  it('spokenPace formats minutes/seconds and singular/plural correctly', () => {
    expect(spokenPace(300)).toBe('5 minutes');
    expect(spokenPace(483)).toBe('8 minutes and 3 seconds');
    expect(spokenPace(61)).toBe('1 minute and 1 second');
    expect(spokenPace(45)).toBe('45 seconds');
  });

  it('never announces speed, the finish-time table or input values', () => {
    const text = describePaceResult(computePaceForm(v()));
    expect(text).not.toMatch(/km\/h|mph|5K|10K|Marathon|10 /);
  });
});
