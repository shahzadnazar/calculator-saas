import { describe, it, expect } from 'vitest';
import { calculateFatIntake } from './fat-intake';
import { calculateTargetHeartRate } from './target-heart-rate';
import { computePace, predictTime, formatDuration } from './pace';
import { dueDateFromLMP, gestationalAge } from './due-date';
import { pregnancyInfo } from './pregnancy';
import { toISODateUTC } from './date-duration';

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe('fat intake', () => {
  it('computes the AMDR range from calories', () => {
    const r = calculateFatIntake(2000);
    expect(r.minGrams).toBe(44); // 20% of 2000 / 9
    expect(r.maxGrams).toBe(78); // 35% of 2000 / 9
    expect(r.moderateGrams).toBeGreaterThan(r.minGrams);
    expect(r.moderateGrams).toBeLessThan(r.maxGrams);
  });
});

describe('target heart rate', () => {
  it('computes max HR and simple-percentage zones', () => {
    const r = calculateTargetHeartRate(30);
    expect(r.maxHr).toBe(190);
    expect(r.zones[0].low).toBe(95); // 50% of 190
  });
  it('uses Karvonen when a resting HR is given', () => {
    const r = calculateTargetHeartRate(30, 60);
    // 50% zone: (190-60)*0.5 + 60 = 125
    expect(r.zones[0].low).toBe(125);
  });
});

describe('pace', () => {
  it('computes pace and speed from distance and time', () => {
    const r = computePace({ distance: 10, unit: 'km', timeSeconds: 3000 }); // 50:00 for 10K
    expect(r.secPerKm).toBeCloseTo(300, 6); // 5:00/km
    expect(r.kmh).toBeCloseTo(12, 6);
  });
  it('predicts race times and formats durations', () => {
    expect(predictTime(300, 5)).toBe(1500);
    expect(formatDuration(1500)).toBe('25:00');
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});

describe('due date', () => {
  it('applies Naegele\'s rule (LMP + 280 days)', () => {
    expect(toISODateUTC(dueDateFromLMP(utc(2024, 1, 1)))).toBe('2024-10-07');
  });
  it('computes gestational age and trimester', () => {
    const g = gestationalAge(utc(2024, 1, 1), utc(2024, 3, 11)); // 70 days
    expect(g.weeks).toBe(10);
    expect(g.days).toBe(0);
    expect(g.trimester).toBe(1);
    expect(g.progressPct).toBeCloseTo(25, 0);
  });
});

describe('pregnancy', () => {
  it('reports conception, due date and trimester', () => {
    const p = pregnancyInfo(utc(2024, 1, 1), utc(2024, 4, 1));
    expect(toISODateUTC(p.conceptionDate)).toBe('2024-01-15');
    expect(toISODateUTC(p.dueDate)).toBe('2024-10-07');
    expect(p.age.trimester).toBe(2); // ~13 weeks
  });
});
