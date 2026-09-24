import { describe, it, expect } from 'vitest';
import {
  solvePace,
  splitSegments,
  projectFinish,
  equivalentTimes,
  timeForDistance,
  toSeconds,
  fromSeconds,
  formatDuration,
  lengthUnit,
  LENGTH_UNITS,
  RACE_DISTANCES,
  EQUIVALENT_DISTANCES,
  type PaceSolveInput,
} from './pace';

const solve = (over: Partial<PaceSolveInput> = {}) =>
  solvePace({ solveFor: 'pace', distanceUnit: 'mi', paceUnit: 'mi', ...over });

describe('the three-way solver', () => {
  it('finds the pace from a time and a distance', () => {
    // 6 miles in 48:00 is 8:00 per mile.
    const r = solve({ solveFor: 'pace', timeSeconds: toSeconds(0, 48, 0), distance: 6 });
    expect(formatDuration(r.paceSeconds)).toBe('8:00');
    expect(r.timeSeconds).toBe(2880);
    expect(r.distance).toBe(6);
  });

  it('finds the time from a distance and a pace', () => {
    const r = solve({ solveFor: 'time', distance: 6, paceSeconds: toSeconds(0, 8, 0) });
    expect(r.timeSeconds).toBe(2880);
    expect(formatDuration(r.timeSeconds)).toBe('48:00');
  });

  it('finds the distance from a time and a pace', () => {
    const r = solve({ solveFor: 'distance', timeSeconds: 2880, paceSeconds: toSeconds(0, 8, 0) });
    expect(r.distance).toBeCloseTo(6, 9);
  });

  it('round-trips: solving for each in turn reproduces the other two', () => {
    const base = { timeSeconds: 2880, distance: 6, paceSeconds: 480 };
    for (const solveFor of ['pace', 'time', 'distance'] as const) {
      const r = solve({ solveFor, ...base });
      expect(r.timeSeconds).toBeCloseTo(base.timeSeconds, 6);
      expect(r.distance).toBeCloseTo(base.distance, 6);
      expect(r.paceSeconds).toBeCloseTo(base.paceSeconds, 6);
    }
  });

  it('a marathon in 3:30:00 is 8:01 per mile', () => {
    const r = solve({
      solveFor: 'pace',
      timeSeconds: toSeconds(3, 30, 0),
      distance: 42.195,
      distanceUnit: 'km',
      paceUnit: 'mi',
    });
    // 12,600 s over 42.195 km is 298.61 s/km, which is 480.61 s/mile — 8:01, not 8:00.
    expect(formatDuration(r.paceSeconds)).toBe('8:01');
    expect(formatDuration(r.secPerKm)).toBe('4:59');
  });

  it('reports speed both ways round, and agrees with the pace', () => {
    const r = solve({ solveFor: 'pace', timeSeconds: 3600, distance: 10, distanceUnit: 'km' });
    expect(r.kmh).toBeCloseTo(10, 9);
    expect(r.mph).toBeCloseTo(6.2137, 4);
    expect(r.secPerKm).toBeCloseTo(360, 9);
    // Speed and pace are the same fact: km/h × sec/km must be 3600.
    expect(r.kmh * r.secPerKm).toBeCloseTo(3600, 6);
    expect(r.mph * r.secPerMi).toBeCloseTo(3600, 6);
  });
});

describe('the pace unit is independent of the distance unit', () => {
  it('a 10 km run can be paced per mile', () => {
    const r = solve({
      solveFor: 'pace',
      timeSeconds: 3600,
      distance: 10,
      distanceUnit: 'km',
      paceUnit: 'mi',
    });
    expect(r.paceSeconds).toBeCloseTo(579.36, 2); // 3600 × 1.609344 / 10
    expect(formatDuration(r.paceSeconds)).toBe('9:39');
  });

  it('and a 6-mile run paced per kilometre', () => {
    const r = solve({
      solveFor: 'pace',
      timeSeconds: 2880,
      distance: 6,
      distanceUnit: 'mi',
      paceUnit: 'km',
    });
    expect(r.paceSeconds).toBeCloseTo(298.26, 2); // 480 / 1.609344
  });

  it('every unit pair agrees on the underlying speed', () => {
    const speeds = new Set<string>();
    for (const d of LENGTH_UNITS) {
      for (const p of LENGTH_UNITS) {
        const r = solve({
          solveFor: 'pace',
          timeSeconds: 3600,
          distance: 10000 / d.metres,
          distanceUnit: d.key,
          paceUnit: p.key,
        });
        speeds.add(r.kmh.toFixed(6));
      }
    }
    expect(speeds.size).toBe(1); // 10 km in an hour, however it is expressed
  });
});

describe('the solver refuses rather than fabricates', () => {
  it('a missing input has no answer', () => {
    expect(Number.isNaN(solve({ solveFor: 'pace', timeSeconds: 2880 }).paceSeconds)).toBe(true);
    expect(Number.isNaN(solve({ solveFor: 'time', distance: 6 }).timeSeconds)).toBe(true);
    expect(Number.isNaN(solve({ solveFor: 'distance', timeSeconds: 2880 }).distance)).toBe(true);
  });

  it('a zero or negative input has no answer either', () => {
    for (const bad of [0, -1]) {
      expect(Number.isNaN(solve({ solveFor: 'pace', timeSeconds: bad, distance: 6 }).paceSeconds)).toBe(true);
      expect(Number.isNaN(solve({ solveFor: 'pace', timeSeconds: 2880, distance: bad }).paceSeconds)).toBe(true);
      expect(Number.isNaN(solve({ solveFor: 'time', distance: 6, paceSeconds: bad }).timeSeconds)).toBe(true);
    }
  });

  it('an unknown unit has no answer', () => {
    expect(Number.isNaN(solve({ timeSeconds: 2880, distance: 6, distanceUnit: 'furlong' }).paceSeconds)).toBe(true);
    expect(Number.isNaN(solve({ timeSeconds: 2880, distance: 6, paceUnit: 'furlong' }).paceSeconds)).toBe(true);
  });

  it('never returns a partial result — every field is finite or none is', () => {
    const bad = solve({ solveFor: 'pace', distance: 6 });
    for (const v of Object.values(bad)) expect(Number.isNaN(v)).toBe(true);
  });
});

describe('time formatting', () => {
  it('keeps the hour when there is one and drops it when there is not', () => {
    expect(formatDuration(toSeconds(3, 5, 12))).toBe('3:05:12');
    expect(formatDuration(toSeconds(0, 8, 30))).toBe('8:30');
    expect(formatDuration(toSeconds(0, 0, 7))).toBe('0:07');
  });
  it('round-trips through h/m/s', () => {
    for (const total of [7, 90, 3600, 3661, 11112]) {
      const { h, m, s } = fromSeconds(total);
      expect(toSeconds(h, m, s)).toBe(total);
    }
  });
  it('never prints a non-number', () => {
    expect(formatDuration(Number.NaN)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('equivalent finish times', () => {
  it('reports every standard distance at the solved pace', () => {
    const r = solve({ solveFor: 'pace', timeSeconds: 2880, distance: 6 });
    const rows = equivalentTimes(r);
    expect(rows.map((x) => x.race.name)).toEqual(['1K', '1 Mile', '5K', '10K', 'Half Marathon', 'Marathon']);
    // 8:00/mile: a mile is 8:00 and a marathon 26.2188 × 8:00 ≈ 3:29:45.
    expect(formatDuration(rows[1].seconds)).toBe('8:00');
    expect(formatDuration(rows[5].seconds)).toBe('3:29:45');
  });

  it('rises with distance, always', () => {
    const rows = equivalentTimes(solve({ solveFor: 'pace', timeSeconds: 2880, distance: 6 }));
    for (let i = 1; i < rows.length; i++) expect(rows[i].seconds).toBeGreaterThan(rows[i - 1].seconds);
  });

  it('is empty rather than fabricated without a pace', () => {
    expect(equivalentTimes(solve({ solveFor: 'pace', distance: 6 }))).toEqual([]);
  });

  it('the race set is the standard one', () => {
    expect(RACE_DISTANCES.map((r) => r.name)).toEqual(['5K', '10K', 'Half Marathon', 'Marathon']);
    expect(EQUIVALENT_DISTANCES.find((r) => r.key === 'marathon')!.metres).toBe(42195);
    expect(lengthUnit('mi')!.metres).toBe(1609.344);
  });
});

describe('multipoint splits', () => {
  const points = [
    { metres: 1000, seconds: 300 }, // 5:00
    { metres: 2000, seconds: 620 }, // 5:20
    { metres: 5000, seconds: 1520 }, // 15:00 for 3 km → 5:00
  ];

  it('measures the first leg from the start line, not from the first point', () => {
    const s = splitSegments(points);
    expect(s[0].legMetres).toBe(1000);
    expect(s[0].legSeconds).toBe(300);
    expect(formatDuration(s[0].legSecPerKm)).toBe('5:00');
  });

  it('measures each later leg from the point before it', () => {
    const s = splitSegments(points);
    expect(s[1].legMetres).toBe(1000);
    expect(s[1].legSeconds).toBe(320);
    expect(formatDuration(s[1].legSecPerKm)).toBe('5:20');
    expect(s[2].legMetres).toBe(3000);
    expect(s[2].legSeconds).toBe(900);
    expect(formatDuration(s[2].legSecPerKm)).toBe('5:00');
  });

  it('tracks the cumulative pace alongside the leg pace', () => {
    const s = splitSegments(points);
    expect(s[2].cumulativeMetres).toBe(5000);
    expect(s[2].cumulativeSeconds).toBe(1520);
    expect(formatDuration(s[2].cumulativeSecPerKm)).toBe('5:04'); // 1520 / 5
  });

  it('the legs add back up to the cumulative totals', () => {
    const s = splitSegments(points);
    expect(s.reduce((a, x) => a + x.legMetres, 0)).toBe(s[s.length - 1].cumulativeMetres);
    expect(s.reduce((a, x) => a + x.legSeconds, 0)).toBe(s[s.length - 1].cumulativeSeconds);
  });

  it('a leg that covers no ground, or goes backwards, has no pace rather than a made-up one', () => {
    const s = splitSegments([
      { metres: 1000, seconds: 300 },
      { metres: 1000, seconds: 400 }, // stood still
      { metres: 500, seconds: 500 }, // the clock went forward, the distance back
    ]);
    expect(Number.isNaN(s[1].legSecPerKm)).toBe(true);
    expect(Number.isNaN(s[2].legSecPerKm)).toBe(true);
    // The cumulative pace at point 1 is still real.
    expect(Number.isFinite(s[1].cumulativeSecPerKm)).toBe(true);
  });

  it('handles no points at all', () => {
    expect(splitSegments([])).toEqual([]);
  });
});

describe('finish-time projection', () => {
  it('projects the whole race at the pace held so far', () => {
    // 10 km of a marathon in 50:00 → 5:00/km → 3:30:59 for 42.195 km.
    const p = projectFinish(10000, 3000, 42195)!;
    expect(formatDuration(p.secPerKm)).toBe('5:00');
    expect(formatDuration(p.finishSeconds)).toBe('3:30:59');
    expect(p.remainingMetres).toBe(32195);
    expect(formatDuration(p.remainingSeconds)).toBe('2:40:59');
  });

  it('the remaining time plus the elapsed time is the finish time', () => {
    const p = projectFinish(10000, 3000, 42195)!;
    expect(p.remainingSeconds + 3000).toBeCloseTo(p.finishSeconds, 6);
  });

  it('refuses when there is nothing left to project', () => {
    expect(projectFinish(10000, 3000, 10000)).toBe(null); // already there
    expect(projectFinish(10000, 3000, 5000)).toBe(null); // past the end
    expect(projectFinish(0, 3000, 42195)).toBe(null);
    expect(projectFinish(10000, 0, 42195)).toBe(null);
  });
});

describe('timeForDistance', () => {
  it('is the same arithmetic the solver uses', () => {
    expect(timeForDistance(0.3, 5000)).toBe(1500); // 5:00/km over 5 km
  });
});
