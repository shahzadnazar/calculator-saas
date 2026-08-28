import { describe, it, expect } from 'vitest';
import {
  FOOD_ENERGY_UNITS,
  DEFAULT_FOOD_ENERGY_FROM,
  DEFAULT_FOOD_ENERGY_TO,
  foodEnergyUnit,
  convertFoodEnergy,
  formatFoodEnergy,
} from './food-energy';

describe('the reference conversion reproduces exactly', () => {
  it('1 Calorie [Nutritional, kcal] = 4.1868 Kilojoules [kJ]', () => {
    expect(formatFoodEnergy(convertFoodEnergy(1, 'kcal', 'kj'))).toBe('4.1868');
  });

  it('opens on that pair', () => {
    expect(DEFAULT_FOOD_ENERGY_FROM).toBe('kcal');
    expect(DEFAULT_FOOD_ENERGY_TO).toBe('kj');
    expect(foodEnergyUnit(DEFAULT_FOOD_ENERGY_FROM)?.label).toBe('Calorie [Nutritional, kcal]');
  });
});

describe('the two calorie definitions are named, not merged', () => {
  it('a dietary Calorie is a thousand International Table calories', () => {
    expect(convertFoodEnergy(1, 'kcal', 'cal-it')).toBeCloseTo(1000, 6);
  });

  it('the thermochemical calorie is a different number, and says so', () => {
    expect(foodEnergyUnit('cal-th')!.toJoules).toBe(4.184);
    expect(foodEnergyUnit('cal-it')!.toJoules).toBe(4.1868);
    // 0.07% apart — small, but not the same unit.
    const ratio = foodEnergyUnit('cal-it')!.toJoules / foodEnergyUnit('cal-th')!.toJoules;
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(1.001);
  });

  it('every unit is labelled with its symbol, as the reference labels them', () => {
    for (const u of FOOD_ENERGY_UNITS) expect(u.label).toMatch(/\[.+\]$/);
  });
});

describe('conversion', () => {
  it('round-trips', () => {
    for (const u of FOOD_ENERGY_UNITS) {
      expect(convertFoodEnergy(convertFoodEnergy(7, 'kcal', u.key), u.key, 'kcal')).toBeCloseTo(7, 6);
    }
  });

  it('is the identity for the same unit', () => {
    for (const u of FOOD_ENERGY_UNITS) expect(convertFoodEnergy(3.5, u.key, u.key)).toBeCloseTo(3.5, 9);
  });

  it('knows the standard energy equivalences', () => {
    expect(convertFoodEnergy(1, 'kj', 'j')).toBe(1000);
    expect(convertFoodEnergy(1, 'kwh', 'j')).toBe(3_600_000);
    expect(convertFoodEnergy(1, 'btu', 'j')).toBeCloseTo(1055.05585262, 6);
    // A 2,000 Calorie day is about 8.37 megajoules.
    expect(convertFoodEnergy(2000, 'kcal', 'kj')).toBeCloseTo(8373.6, 3);
  });

  it('refuses an unknown unit or a non-finite value rather than inventing a number', () => {
    expect(Number.isNaN(convertFoodEnergy(1, 'kcal', 'nope'))).toBe(true);
    expect(Number.isNaN(convertFoodEnergy(1, 'nope', 'kj'))).toBe(true);
    expect(Number.isNaN(convertFoodEnergy(Number.NaN, 'kcal', 'kj'))).toBe(true);
    expect(foodEnergyUnit('nope')).toBeUndefined();
  });
});

describe('formatting', () => {
  it('drops trailing zeros and caps at six decimals', () => {
    expect(formatFoodEnergy(4.1868)).toBe('4.1868');
    expect(formatFoodEnergy(1000)).toBe('1,000');
    expect(formatFoodEnergy(1 / 3)).toBe('0.333333');
  });
  it('never prints a non-number', () => {
    expect(formatFoodEnergy(Number.NaN)).toBe('—');
    expect(formatFoodEnergy(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
