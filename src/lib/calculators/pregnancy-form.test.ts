import { describe, it, expect } from 'vitest';
import {
  validatePregnancy,
  isStrictCalendarDate,
  computePregnancy,
  completePregnancyValue,
  presentPregnancy,
  describePregnancy,
  longDate,
  shortDate,
  todayISO,
  pregnancyBinding,
  type PregnancyComputed,
  type PregnancyValues,
} from './pregnancy-form';

/**
 * Pregnancy form-binding tests (R14B2 Commit 2). Exercise the VALIDATION /
 * PRESENTATION boundary only — the pure gestational engine underneath is
 * unchanged and separately frozen by pregnancy.test.ts. `today` is injected so
 * every case is deterministic (the binding's only clock read is isolated in
 * readValues via todayISO). Covers: required + strict-calendar + future-LMP
 * validation, ordinary vs past-due computation and presentation (the DOMINANT
 * figure swaps: gestational age while ongoing, due date once passed), the
 * complete-result guard (reconciliation incl. the two milestones + malformed
 * rejection; NaN sentinel; no isUsableResult), announcements, and
 * readValues/resetValues.
 */

const TODAY = '2024-06-01';
const BASE: PregnancyValues = {
  method: 'lmp',
  dueDate: '',
  lmp: '',
  cycleDays: '',
  conception: '',
  scanDate: '',
  scanWeeks: '',
  scanDays: '',
  transferDate: '',
  embryoAge: '5',
  today: TODAY,
};
/** The LMP route, which most of these cases exercise. */
const v = (lmp: string, today = TODAY): PregnancyValues => ({ ...BASE, lmp, today });
/** Any route, for the five-method cases. */
const vv = (over: Partial<PregnancyValues>): PregnancyValues => ({ ...BASE, ...over });
const ok = (r: ReturnType<typeof validatePregnancy>) => r.ok === true;
const err = (r: ReturnType<typeof validatePregnancy>) =>
  (r as { fieldErrors: Record<string, string> }).fieldErrors.lmp;
const rejects = (r: PregnancyComputed) => Number.isNaN(completePregnancyValue(r));
const withInfo = (r: PregnancyComputed, patch: Partial<PregnancyComputed['info']>): PregnancyComputed => ({
  ...r,
  info: { ...r.info, ...patch },
});
const withAge = (r: PregnancyComputed, patch: Partial<PregnancyComputed['info']['age']>): PregnancyComputed => ({
  ...r,
  info: { ...r.info, age: { ...r.info.age, ...patch } },
});

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe('pregnancy binding — contract', () => {
  it('does NOT define isUsableResult (the guard lives in resultValue)', () => {
    expect(pregnancyBinding.isUsableResult).toBeUndefined();
    expect(pregnancyBinding.resultValue).toBe(completePregnancyValue);
  });
});

/* ------------------------------------------------------------------ */
/* Validation — required → strict calendar → not future                */
/* ------------------------------------------------------------------ */

describe('pregnancy binding — validation (required → strict calendar → not future)', () => {
  it('accepts ordinary + leap + leading-zero + today dates', () => {
    for (const d of ['2024-01-01', '2024-02-29', '2024-06-01', TODAY]) {
      expect(ok(validatePregnancy(v(d)))).toBe(true);
    }
  });
  it('rejects empty input with the required message', () => {
    expect(err(validatePregnancy(v('')))).toBe('Enter the first day of your last menstrual period.');
    expect(err(validatePregnancy(v('   ')))).toBe('Enter the first day of your last menstrual period.');
  });
  it('rejects impossible / malformed / non-canonical dates with the invalid-calendar message', () => {
    for (const bad of ['not-a-date', '2023-02-29', '2023-02-30', '2026-04-31', '2026-00-10', '2026-13-01', '2026-05-00', '2026-1-2', '20240101']) {
      expect(err(validatePregnancy(v(bad)))).toBe('Enter a valid last menstrual period date.');
    }
  });
  it('rejects a future LMP with the future message', () => {
    expect(err(validatePregnancy(v('2024-07-01')))).toBe('Enter a last menstrual period date that is not in the future.');
    expect(err(validatePregnancy(v('2024-06-02')))).toMatch(/not in the future/);
  });
  it('accepts a historical LMP (no lower bound)', () => {
    expect(ok(validatePregnancy(v('2000-01-01')))).toBe(true);
  });
  it('applies precedence: required → invalid-calendar → future', () => {
    expect(err(validatePregnancy(v('')))).toMatch(/Enter the first day of your last menstrual period/); // required wins
    expect(err(validatePregnancy(v('2027-02-30')))).toBe('Enter a valid last menstrual period date.'); // impossible wins over future-year
    expect(err(validatePregnancy(v('2024-07-01')))).toMatch(/not in the future/); // valid-but-future
  });
});

describe('pregnancy binding — strict calendar round-trip (isStrictCalendarDate)', () => {
  it('accepts canonical valid dates (incl. leap day)', () => {
    for (const d of ['2024-01-01', '2024-02-29', '2000-12-31']) expect(isStrictCalendarDate(d)).toBe(true);
  });
  it('rejects rollover / malformed input (the frozen primitive still rolls over)', () => {
    for (const bad of ['2023-02-30', '2023-02-29', '2026-04-31', '2026-13-01', '2026-1-2', '', 'x']) {
      expect(isStrictCalendarDate(bad)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('pregnancy binding — computation', () => {
  it('ordinary LMP → gestational age, milestones, not past-due', () => {
    const r = computePregnancy(v('2024-01-01'));
    expect(r.info.age.totalDays).toBe(152); // 2024-01-01 → 2024-06-01
    expect(r.info.age.weeks).toBe(21);
    expect(r.info.age.days).toBe(5);
    expect(r.info.age.trimester).toBe(2);
    expect(shortDate(r.info.conceptionDate)).toBe('Jan 15, 2024');
    expect(shortDate(r.info.firstTrimesterEnd)).toBe('Apr 1, 2024'); // LMP+91 = T2 begins
    expect(shortDate(r.info.secondTrimesterEnd)).toBe('Jul 8, 2024'); // LMP+189 = T3 begins
    expect(longDate(r.info.dueDate)).toBe('Monday, October 7, 2024');
    expect(r.pastDue).toBe(false);
  });
  it('same-day LMP → 0w 0d, not past-due', () => {
    const r = computePregnancy(v('2024-06-01'));
    expect(r.info.age.totalDays).toBe(0);
    expect(r.pastDue).toBe(false);
  });
  it('historical LMP whose due date has passed → pastDue', () => {
    const r = computePregnancy(v('2023-01-01'));
    expect(longDate(r.info.dueDate)).toBe('Sunday, October 8, 2023');
    expect(r.pastDue).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

describe('pregnancy binding — complete-result guard', () => {
  it('returns the finite due-date timestamp for a well-formed ongoing result', () => {
    const r = computePregnancy(v('2024-01-01'));
    expect(completePregnancyValue(r)).toBe(r.info.dueDate.getTime());
    expect(Number.isFinite(completePregnancyValue(r))).toBe(true);
  });
  it('returns finite for a well-formed past-due result', () => {
    const r = computePregnancy(v('2023-01-01'));
    expect(Number.isFinite(completePregnancyValue(r))).toBe(true);
  });
  it('rejects an unparseable LMP', () => {
    const r = computePregnancy(v('2024-01-01'));
    expect(rejects({ ...r, lmpISO: '' })).toBe(true);
  });
  it('rejects a due date that does not reconcile with LMP+280', () => {
    const r = computePregnancy(v('2024-01-01'));
    expect(rejects(withInfo(r, { dueDate: new Date(Number.NaN) }))).toBe(true);
    expect(rejects(withInfo(r, { dueDate: new Date(Date.UTC(2099, 0, 1)) }))).toBe(true);
  });
  it('rejects a conception date that does not reconcile with LMP+14', () => {
    const r = computePregnancy(v('2024-01-01'));
    expect(rejects(withInfo(r, { conceptionDate: new Date(Date.UTC(2099, 0, 1)) }))).toBe(true);
  });
  it('rejects a trimester milestone that does not reconcile with LMP+91 / LMP+189', () => {
    const r = computePregnancy(v('2024-01-01'));
    expect(rejects(withInfo(r, { firstTrimesterEnd: new Date(Date.UTC(2099, 0, 1)) }))).toBe(true);
    expect(rejects(withInfo(r, { secondTrimesterEnd: new Date(Date.UTC(2099, 0, 1)) }))).toBe(true);
    expect(rejects(withInfo(r, { firstTrimesterEnd: new Date(Number.NaN) }))).toBe(true);
  });
  it('rejects an ongoing result whose gestational block is out of range', () => {
    const r = computePregnancy(v('2024-01-01'));
    expect(rejects(withAge(r, { weeks: -1 }))).toBe(true);
    expect(rejects(withAge(r, { days: 9 }))).toBe(true);
    expect(rejects(withAge(r, { trimester: 5 as 1 }))).toBe(true);
    expect(rejects(withAge(r, { progressPct: 150 }))).toBe(true);
    expect(rejects(withAge(r, { totalDays: 300 }))).toBe(true); // > 280 but flagged ongoing
  });
  it('rejects an ongoing result whose gestational block does not reconcile with the engine', () => {
    const r = computePregnancy(v('2024-01-01'));
    expect(rejects(withAge(r, { weeks: 99 }))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Presentation + announcement                                         */
/* ------------------------------------------------------------------ */

describe('pregnancy binding — presentation', () => {
  it('ongoing: "Pregnancy progress" hero + trimester/due-date prominent secondary + time-to-go supporting', () => {
    const p = presentPregnancy(computePregnancy(v('2024-01-01')));
    expect(p.pastDue).toBe(false);
    expect(p.headlineLabel).toBe('Pregnancy progress');
    expect(p.headline).toBe('21 weeks, 5 days');
    expect(p.trimester).toBe('2nd'); // prominent secondary
    expect(p.dueSecondary).toBe('Oct 7, 2024'); // prominent secondary — the due date is elevated, not only in the timeline
    expect(p.remaining).toBe('19 weeks to go'); // supporting
    expect(p.progressPct).toBeGreaterThan(0);
    expect(p.conception).toBe('Jan 15, 2024');
    expect(p.secondTrimester).toBe('Apr 1, 2024');
    expect(p.thirdTrimester).toBe('Jul 8, 2024');
    expect(p.dueDate).toBe('Oct 7, 2024');
    expect(p.interpretation).toBe('Based on the entered last menstrual period, you are 21 weeks and 5 days along — the 2nd trimester — with an estimated due date of Monday, October 7, 2024.');
  });
  it('names the route the visitor actually took, not always the last period', () => {
    const at = (over: Partial<PregnancyValues>) =>
      presentPregnancy(computePregnancy(vv({ ...over, today: TODAY }))).interpretation;
    expect(at({ method: 'due', dueDate: '2024-10-07' })).toMatch(/^From the due date you entered,/);
    expect(at({ method: 'due', dueDate: '2024-10-07' })).toContain('with a due date of'); // theirs, not an estimate
    expect(at({ method: 'lmp', lmp: '2024-01-01' })).toMatch(/^Based on the entered last menstrual period,/);
    expect(at({ method: 'conception', conception: '2024-01-15' })).toMatch(/^Based on the conception date you entered,/);
    expect(at({ method: 'ultrasound', scanDate: '2024-03-01', scanWeeks: '8', scanDays: '4' })).toMatch(
      /^Based on the ultrasound you entered,/,
    );
    expect(at({ method: 'ivf', transferDate: '2024-01-20', embryoAge: '5' })).toMatch(
      /^Based on the IVF transfer date you entered,/,
    );
    // Every route still lands on the same pregnancy, so the weeks-and-days agree.
    const viaLmp = at({ method: 'lmp', lmp: '2024-01-01' });
    for (const other of [
      at({ method: 'conception', conception: '2024-01-15' }),
      at({ method: 'ultrasound', scanDate: '2024-03-01', scanWeeks: '8', scanDays: '4' }),
      at({ method: 'ivf', transferDate: '2024-01-20', embryoAge: '5' }),
    ]) {
      expect(other).toContain('you are 21 weeks and 5 days along');
      expect(viaLmp).toContain('you are 21 weeks and 5 days along');
    }
  });

  it('same-day: 0w 0d hero, 1st trimester, 40 weeks to go', () => {
    const p = presentPregnancy(computePregnancy(v('2024-06-01')));
    expect(p.headline).toBe('0 weeks, 0 days');
    expect(p.trimester).toBe('1st');
    expect(p.remaining).toBe('40 weeks to go');
    expect(p.progressPct).toBe(0);
  });
  it('past-due: due-date hero, prominent secondary + progress suppressed, milestones kept, neutral note', () => {
    const p = presentPregnancy(computePregnancy(v('2023-01-01')));
    expect(p.pastDue).toBe(true);
    expect(p.headlineLabel).toBe('Estimated due date');
    expect(p.headline).toBe('Sunday, October 8, 2023');
    expect(p.trimester).toBe('—'); // suppressed
    expect(p.dueSecondary).toBe('—'); // suppressed (the due date is the hero)
    expect(p.remaining).toBe(''); // suppressed
    expect(p.progressPct).toBe(0);
    expect(p.conception).toBe('Jan 15, 2023'); // clock-free milestones still shown
    expect(p.dueDate).toBe('Oct 8, 2023');
    expect(p.interpretation).toBe('The estimated due date has passed. Check the entered date if this is unexpected.');
  });
});

describe('pregnancy binding — announcement (dominant + due date)', () => {
  it('ongoing announces the progress and the due date', () => {
    expect(describePregnancy(computePregnancy(v('2024-01-01')))).toBe('Pregnancy progress: 21 weeks and 5 days. Estimated due date: Monday, October 7, 2024.');
  });
  it('past-due announces the due date plus a passed note', () => {
    expect(describePregnancy(computePregnancy(v('2023-01-01')))).toBe('Estimated due date: Sunday, October 8, 2023. This estimated date has passed.');
  });
});

/* ------------------------------------------------------------------ */
/* readValues / resetValues (mock root — no DOM in node vitest)         */
/* ------------------------------------------------------------------ */

describe('pregnancy binding — readValues / resetValues', () => {
  /** A stand-in for the island's form: every dating field, plus the method radios. */
  const mockRoot = (values: Partial<Record<string, string>>, checked: string) => {
    const names = [
      'dueDate',
      'lmp',
      'cycleDays',
      'conception',
      'scanDate',
      'scanWeeks',
      'scanDays',
      'transferDate',
      'embryoAge',
    ];
    const fields = Object.fromEntries(names.map((n) => [n, { value: values[n] ?? '' }]));
    const radios = ['due', 'lmp', 'ultrasound', 'conception', 'ivf'].map((value) => ({
      value,
      checked: value === checked,
    }));
    const root = {
      querySelector: (sel: string) => {
        if (sel === '[name="method"]:checked') return radios.find((r) => r.checked) ?? null;
        const m = /^\[name="([^"]+)"\]$/.exec(sel);
        return m ? (fields[m[1]] ?? null) : null;
      },
      querySelectorAll: (sel: string) => (sel === '[name="method"]' ? radios : []),
    } as unknown as HTMLElement;
    return { root, fields, radios };
  };

  it('reads the chosen method and its fields, and seeds today from the local calendar', () => {
    const { root } = mockRoot({ lmp: '2024-03-15', cycleDays: '31' }, 'lmp');
    const read = pregnancyBinding.readValues(root);
    expect(read.method).toBe('lmp');
    expect(read.lmp).toBe('2024-03-15');
    expect(read.cycleDays).toBe('31');
    expect(read.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(read.today).toBe(todayISO());
  });

  it('reads all five methods this calculator offers', () => {
    for (const method of ['due', 'lmp', 'ultrasound', 'conception', 'ivf'] as const) {
      const { root } = mockRoot({}, method);
      expect(pregnancyBinding.readValues(root).method).toBe(method);
    }
  });

  it('falls back to the first offered method rather than trusting an unknown radio value', () => {
    const { root } = mockRoot({}, 'not-a-method');
    expect(pregnancyBinding.readValues(root).method).toBe('due');
  });

  it('reset clears every dating field, restores the 5-day embryo and the Due Date method', () => {
    const { root, fields, radios } = mockRoot(
      {
        dueDate: '2025-01-01',
        lmp: '2024-03-15',
        cycleDays: '31',
        conception: '2024-04-01',
        scanDate: '2024-05-01',
        scanWeeks: '9',
        scanDays: '2',
        transferDate: '2024-04-10',
        embryoAge: '3',
      },
      'ivf',
    );
    pregnancyBinding.resetValues(root, 'personal');
    for (const name of [
      'dueDate',
      'lmp',
      'cycleDays',
      'conception',
      'scanDate',
      'scanWeeks',
      'scanDays',
      'transferDate',
    ]) {
      expect(fields[name].value).toBe('');
    }
    expect(fields.embryoAge.value).toBe('5');
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual(['due']);
  });
});
