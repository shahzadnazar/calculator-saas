import { describe, it, expect } from 'vitest';
import {
  MSG,
  DATING_METHODS,
  EMBRYO_AGES,
  CYCLE_MIN,
  CYCLE_MAX,
  REFERENCE_CYCLE_DAYS,
  SCAN_WEEKS_MAX,
  isStrictCalendarDate,
  cycleError,
  scanAgeError,
  validateDueDate,
  computeDueDate,
  completeDueDateValue,
  resolveLmp,
  presentDueDate,
  describeDueDate,
  longDate,
  shortDate,
  dueDateBinding,
  dueDateExampleValues,
  type DueDateValues,
} from './due-date-form';

/**
 * The binding's pure surface. The dating arithmetic lives in the reviewed pure
 * `due-date.ts`; here we pin that each method validates and reads ONLY its own fields, the
 * date precedence (required → real date → not future), and the presentation.
 */

const TODAY = '2026-06-01';
const base: DueDateValues = {
  method: 'lmp',
  dueDate: '',
  lmp: '2026-01-01',
  cycleDays: '',
  conception: '',
  scanDate: '',
  scanWeeks: '',
  scanDays: '',
  transferDate: '',
  embryoAge: '5',
  today: TODAY,
};
const v = (over: Partial<DueDateValues> = {}): DueDateValues => ({ ...base, ...over });
const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

describe('the four methods', () => {
  it('are the reference’s four, in its order', () => {
    expect(DATING_METHODS.map((m) => m.label)).toEqual([
      'Last Period',
      'Conception Date',
      'Ultrasound',
      'IVF Transfer Date',
    ]);
  });

  it('Last Period: 280 days on', () => {
    expect(iso(computeDueDate(v()).dueDate)).toBe('2026-10-08');
  });

  it('Conception Date: the same due date, entered two weeks later', () => {
    const byConception = computeDueDate(v({ method: 'conception', lmp: '', conception: '2026-01-15' }));
    expect(iso(byConception.dueDate)).toBe('2026-10-08');
    expect(byConception.lmpISO).toBe('2026-01-01');
  });

  it('Ultrasound: works the LMP backwards from the age the scan reported', () => {
    // 8 weeks 3 days is 59 days; 59 days before 1 March 2026 is 1 January 2026.
    const r = computeDueDate(v({ method: 'ultrasound', lmp: '', scanDate: '2026-03-01', scanWeeks: '8', scanDays: '3' }));
    expect(r.lmpISO).toBe('2026-01-01');
    expect(iso(r.dueDate)).toBe('2026-10-08');
  });

  it('IVF: a 5-day transfer is due sooner than a 3-day one, by two days', () => {
    const day5 = computeDueDate(v({ method: 'ivf', lmp: '', transferDate: '2026-01-20', embryoAge: '5' }));
    const day3 = computeDueDate(v({ method: 'ivf', lmp: '', transferDate: '2026-01-20', embryoAge: '3' }));
    expect(iso(day5.dueDate)).toBe('2026-10-08');
    expect(Math.round((day3.dueDate.getTime() - day5.dueDate.getTime()) / 86_400_000)).toBe(2);
  });

  it('each method reads ONLY its own fields', () => {
    // A stale date left under another method must never move the answer.
    const clean = computeDueDate(v({ method: 'conception', lmp: '', conception: '2026-01-15' }));
    const littered = computeDueDate(
      v({ method: 'conception', lmp: '2020-01-01', conception: '2026-01-15', scanDate: '2021-01-01', transferDate: '2019-01-01' }),
    );
    expect(iso(littered.dueDate)).toBe(iso(clean.dueDate));
  });
});

describe('cycle length', () => {
  it('is optional and defaults to the textbook cycle', () => {
    expect(cycleError('')).toBe(null);
    expect(iso(computeDueDate(v({ cycleDays: '' })).dueDate)).toBe(
      iso(computeDueDate(v({ cycleDays: String(REFERENCE_CYCLE_DAYS) })).dueDate),
    );
  });

  it('shifts the due date day for day when the cycle is not 28', () => {
    const base28 = computeDueDate(v()).dueDate;
    const long = computeDueDate(v({ cycleDays: '35' })).dueDate;
    expect(Math.round((long.getTime() - base28.getTime()) / 86_400_000)).toBe(7);
  });

  it('refuses a cycle that is not one', () => {
    expect(cycleError(String(CYCLE_MIN - 1))).toBe(MSG.cycleRange);
    expect(cycleError(String(CYCLE_MAX + 1))).toBe(MSG.cycleRange);
    expect(cycleError('28.5')).toBe(MSG.cycleRange);
    expect(cycleError('abc')).toBe(MSG.cycleRange);
    expect(cycleError('28')).toBe(null);
  });
});

describe('the scan’s gestational age', () => {
  it('accepts weeks, days, or both', () => {
    expect(scanAgeError('12', '3')).toBe(null);
    expect(scanAgeError('12', '')).toBe(null);
    expect(scanAgeError('', '3')).toBe(null);
  });
  it('needs at least something, and something greater than nothing', () => {
    expect(scanAgeError('', '')).toBe(MSG.scanAgeRequired);
    expect(scanAgeError('0', '0')).toBe(MSG.scanAgeRequired);
  });
  it('keeps days inside a week and weeks inside a pregnancy', () => {
    expect(scanAgeError('12', '7')).toBe(MSG.scanDaysRange);
    expect(scanAgeError(String(SCAN_WEEKS_MAX + 1), '0')).toBe(MSG.scanWeeksRange);
    expect(scanAgeError('-1', '0')).toBe(MSG.scanWeeksRange);
  });
});

describe('validation asks only what the chosen method needs', () => {
  it('Last Period needs an LMP and nothing else', () => {
    expect(validateDueDate(v())).toEqual({ ok: true });
    const missing = validateDueDate(v({ lmp: '' }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.fieldErrors!.lmp).toBe(MSG.lmpRequired);
      expect(missing.fieldErrors!.conception).toBeUndefined();
    }
  });

  it('Conception needs a conception date, not an LMP', () => {
    expect(validateDueDate(v({ method: 'conception', lmp: '', conception: '2026-01-15' }))).toEqual({ ok: true });
    const r = validateDueDate(v({ method: 'conception', lmp: '', conception: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors!.conception).toBe(MSG.conceptionRequired);
  });

  it('Ultrasound needs both the date and the age it reported', () => {
    expect(
      validateDueDate(v({ method: 'ultrasound', lmp: '', scanDate: '2026-03-01', scanWeeks: '12', scanDays: '0' })),
    ).toEqual({ ok: true });
    const r = validateDueDate(v({ method: 'ultrasound', lmp: '', scanDate: '2026-03-01' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors!.scanAge).toBe(MSG.scanAgeRequired);
  });

  it('IVF needs a transfer date', () => {
    expect(validateDueDate(v({ method: 'ivf', lmp: '', transferDate: '2026-01-20' }))).toEqual({ ok: true });
    const r = validateDueDate(v({ method: 'ivf', lmp: '', transferDate: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors!.transferDate).toBe(MSG.transferRequired);
  });

  it('applies required → a real calendar date → not in the future, in that order', () => {
    const invalid = validateDueDate(v({ lmp: '2026-02-30' }));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.fieldErrors!.lmp).toBe(MSG.lmpInvalid);

    const future = validateDueDate(v({ lmp: '2026-07-01' }));
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.fieldErrors!.lmp).toBe(MSG.lmpFuture);
  });

  it('rejects a rolled-over or non-canonical date rather than reinterpreting it', () => {
    expect(isStrictCalendarDate('2026-02-30')).toBe(false);
    expect(isStrictCalendarDate('2026-13-01')).toBe(false);
    expect(isStrictCalendarDate('2026-1-2')).toBe(false);
    expect(isStrictCalendarDate('2026-01-02')).toBe(true);
  });

  it('no method is ever in the future', () => {
    for (const [method, field, value] of [
      ['conception', 'conception', '2026-07-01'],
      ['ultrasound', 'scanDate', '2026-07-01'],
      ['ivf', 'transferDate', '2026-07-01'],
    ] as const) {
      const r = validateDueDate(v({ method, lmp: '', [field]: value, scanWeeks: '12' } as Partial<DueDateValues>));
      expect(r.ok).toBe(false);
    }
  });
});

describe('completeDueDateValue — the whole timeline or nothing', () => {
  it('is finite for a complete entry in every method', () => {
    const complete = [
      v(),
      v({ method: 'conception', lmp: '', conception: '2026-01-15' }),
      v({ method: 'ultrasound', lmp: '', scanDate: '2026-03-01', scanWeeks: '12', scanDays: '0' }),
      v({ method: 'ivf', lmp: '', transferDate: '2026-01-20' }),
    ];
    for (const values of complete) {
      expect(Number.isFinite(completeDueDateValue(computeDueDate(values)))).toBe(true);
      expect(computeDueDate(values).milestones).toHaveLength(6);
    }
  });

  it('is NaN when the method cannot resolve an LMP', () => {
    expect(Number.isNaN(completeDueDateValue(computeDueDate(v({ lmp: '' }))))).toBe(true);
    expect(Number.isNaN(resolveLmp(v({ lmp: '' })).getTime())).toBe(true);
    expect(
      Number.isNaN(completeDueDateValue(computeDueDate(v({ method: 'ivf', lmp: '', transferDate: '' })))),
    ).toBe(true);
  });
});

describe('presentation', () => {
  it('reports how far along and which trimester while the pregnancy is ongoing', () => {
    const r = computeDueDate(v({ lmp: '2026-01-01', today: '2026-03-01' })); // 59 days
    const view = presentDueDate(r);
    expect(view.along).toBe('8w 3d');
    expect(view.trimester).toBe('1st');
    expect(view.interpretation).toContain('8 weeks and 3 days');
  });

  it('says plainly when the date has passed, without an unbounded progress figure', () => {
    const r = computeDueDate(v({ lmp: '2025-01-01', today: '2026-06-01' }));
    const view = presentDueDate(r);
    expect(r.pastDue).toBe(true);
    expect(view.along).toBe('—');
    expect(view.trimester).toBe('—');
    expect(view.interpretation).toContain('has passed');
  });

  it('announces the due date only, never the timeline', () => {
    const s = describeDueDate(computeDueDate(v()));
    expect(s).toBe('Estimated due date: Thursday, October 8, 2026.');
    expect(s).not.toMatch(/trimester|conception/i);
  });

  it('announces that a past due date has passed — the one fact the em dashes hide', () => {
    const s = describeDueDate(computeDueDate(v({ lmp: '2025-01-01', today: '2026-06-01' })));
    expect(s).toContain('This estimated date has passed');
  });

  it('formats dates stably in UTC, long and short', () => {
    const d = new Date(Date.UTC(2026, 9, 8));
    expect(longDate(d)).toBe('Thursday, October 8, 2026');
    expect(shortDate(d)).toBe('Oct 8, 2026');
  });
});

describe('the labelled example', () => {
  it('is always a live pregnancy, never one that has quietly gone past due', () => {
    const ex = dueDateExampleValues();
    expect(ex.method).toBe('lmp');
    const r = computeDueDate(ex);
    expect(r.pastDue).toBe(false);
    expect(r.age.weeks).toBe(10);
    expect(Number.isFinite(completeDueDateValue(r))).toBe(true);
  });
  it('leaves every other method’s fields empty', () => {
    const ex = dueDateExampleValues();
    expect([ex.conception, ex.scanDate, ex.scanWeeks, ex.scanDays, ex.transferDate, ex.cycleDays]).toEqual([
      '', '', '', '', '', '',
    ]);
  });
});

describe('the binding wires the pure parts together', () => {
  it('gates the result on the complete-timeline guard', () => {
    expect(dueDateBinding.resultValue).toBe(completeDueDateValue);
    expect(dueDateBinding.validate).toBe(validateDueDate);
    expect(dueDateBinding.compute).toBe(computeDueDate);
  });
  it('offers both embryo ages', () => {
    expect(EMBRYO_AGES.map((e) => e.label)).toEqual(['3-day embryo', '5-day embryo']);
  });
});
