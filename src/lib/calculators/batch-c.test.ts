import { describe, it, expect } from 'vitest';
import { pregnancyInfo } from './pregnancy';
import { toISODateUTC } from './date-duration';

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

// Fat-intake coverage now lives in the dedicated characterization suite
// `fat-intake.test.ts` (R7C-2D).

// Target-heart-rate coverage now lives in the dedicated characterization suite
// `target-heart-rate.test.ts` (R7C-2C).

// Pace coverage now lives in the dedicated characterization suite `pace.test.ts` (R7C-2E1).

// Due-date coverage now lives in the dedicated characterization suite
// `due-date.test.ts` (R14B1). Pregnancy stays here (shared batch).

describe('pregnancy', () => {
  it('reports conception, due date and trimester', () => {
    const p = pregnancyInfo(utc(2024, 1, 1), utc(2024, 4, 1));
    expect(toISODateUTC(p.conceptionDate)).toBe('2024-01-15');
    expect(toISODateUTC(p.dueDate)).toBe('2024-10-07');
    expect(p.age.trimester).toBe(2); // ~13 weeks
  });
});
