import { describe, it, expect } from 'vitest';
import {
  kilogramsToPounds,
  poundsToKilograms,
  centimetresToTotalInches,
  totalInchesToCentimetres,
  totalInchesToFeetAndInches,
  feetAndInchesToTotalInches,
  isNonNegativeInteger,
  isValidInches,
  classifyImperialHeight,
  round1,
  classifyAge,
} from './body-measurements';

/**
 * The shared body-measurement primitives underpin BMI + BMR conversion and
 * imperial-height validation. Pinned directly so a change surfaces here (and in
 * both calculators' behaviour) intentionally.
 */

describe('unit conversions', () => {
  it('kilograms ↔ pounds round-trip within tolerance', () => {
    expect(kilogramsToPounds(80)).toBeCloseTo(176.37, 1);
    expect(poundsToKilograms(176.37)).toBeCloseTo(80, 1);
    expect(poundsToKilograms(kilogramsToPounds(72.5))).toBeCloseTo(72.5, 6);
  });

  it('centimetres ↔ total inches round-trip within tolerance', () => {
    expect(centimetresToTotalInches(180)).toBeCloseTo(70.87, 2);
    expect(totalInchesToCentimetres(71)).toBeCloseTo(180.34, 2);
    expect(totalInchesToCentimetres(centimetresToTotalInches(165))).toBeCloseTo(165, 6);
  });

  it('total inches → feet & inches rounds to the nearest inch (BMI-stable)', () => {
    expect(totalInchesToFeetAndInches(centimetresToTotalInches(180))).toEqual({ feet: 5, inches: 11 });
    expect(totalInchesToFeetAndInches(60)).toEqual({ feet: 5, inches: 0 });
    expect(totalInchesToFeetAndInches(71.4)).toEqual({ feet: 5, inches: 11 }); // rounds 71.4 → 71
    expect(feetAndInchesToTotalInches(5, 11)).toBe(71);
  });

  it('round1 gives one-decimal display precision', () => {
    expect(round1(176.3692)).toBe(176.4);
    expect(round1(180)).toBe(180);
  });
});

describe('imperial-height validity primitives', () => {
  it('feet must be a finite non-negative integer', () => {
    expect(isNonNegativeInteger(5)).toBe(true);
    expect(isNonNegativeInteger(0)).toBe(true);
    expect(isNonNegativeInteger(5.5)).toBe(false);
    expect(isNonNegativeInteger(-1)).toBe(false);
    expect(isNonNegativeInteger(NaN)).toBe(false);
  });
  it('inches must be finite and 0 ≤ inches < 12', () => {
    expect(isValidInches(0)).toBe(true);
    expect(isValidInches(11)).toBe(true);
    expect(isValidInches(11.9)).toBe(true);
    expect(isValidInches(12)).toBe(false);
    expect(isValidInches(-1)).toBe(false);
    expect(isValidInches(NaN)).toBe(false);
  });
});

describe('classifyImperialHeight (message-free, BMI-accepted semantics)', () => {
  it('classifies each case in a stable order', () => {
    expect(classifyImperialHeight('', '')).toBe('empty');
    expect(classifyImperialHeight('5', '9')).toBe('ok');
    expect(classifyImperialHeight('0', '11')).toBe('ok'); // 0 ft 11 in is a valid positive height
    expect(classifyImperialHeight('5', '12')).toBe('inches-out-of-range');
    expect(classifyImperialHeight('5', '14')).toBe('inches-out-of-range');
    expect(classifyImperialHeight('5.5', '')).toBe('feet-not-integer');
    expect(classifyImperialHeight('-1', '')).toBe('feet-not-integer');
    expect(classifyImperialHeight('0', '0')).toBe('nonpositive');
  });
  it('checks inches before feet before total (order stability)', () => {
    // Both inches-bad and feet-bad → inches wins (checked first).
    expect(classifyImperialHeight('5.5', '12')).toBe('inches-out-of-range');
  });
});

describe('classifyAge (shared by every calculator that asks for one)', () => {
  it('accepts a whole number of years inside the span', () => {
    expect(classifyAge('25', 18, 80)).toBe('ok');
    expect(classifyAge(' 18 ', 18, 80)).toBe('ok');
    expect(classifyAge('80', 18, 80)).toBe('ok');
  });

  it('separates the three ways an age can be wrong', () => {
    expect(classifyAge('', 18, 80)).toBe('empty');
    expect(classifyAge('   ', 18, 80)).toBe('empty');
    expect(classifyAge('25.5', 18, 80)).toBe('not-whole');
    expect(classifyAge('x', 18, 80)).toBe('not-whole');
    expect(classifyAge('17', 18, 80)).toBe('out-of-range');
    expect(classifyAge('81', 18, 80)).toBe('out-of-range');
  });

  it('leaves the span to the caller, because the span is a product decision', () => {
    // 15 is fine for BMR and calories, and too young for protein.
    expect(classifyAge('15', 15, 80)).toBe('ok');
    expect(classifyAge('15', 18, 80)).toBe('out-of-range');
    expect(classifyAge('2', 2, 80)).toBe('ok');
  });
});
