import { describe, it, expect } from 'vitest';
import {
  validateDueDate,
  isStrictCalendarDate,
  computeDueDate,
  completeDueDateValue,
  presentDueDate,
  describeDueDate,
  longDate,
  todayISO,
  dueDateBinding,
  type DueDateComputed,
} from './due-date-form';

/**
 * Due Date form-binding tests (R14B1 Commit 2). Exercise the VALIDATION /
 * PRESENTATION boundary only — the pure gestational engine underneath is
 * unchanged and separately frozen by due-date.test.ts. `today` is injected so
 * every case is deterministic (the binding's only clock read is isolated in
 * readValues via todayISO). Covers: required + future-LMP validation, the
 * local-today max boundary, ordinary vs past-due computation and presentation,
 * the complete-result guard (reconciliation + malformed rejection; NaN sentinel;
 * no isUsableResult), announcements, and readValues/resetValues.
 */

const TODAY = '2024-06-01';
const v = (lmp: string, today = TODAY) => ({ lmp, today });
const ok = (r: ReturnType<typeof validateDueDate>) => r.ok === true;
const err = (r: ReturnType<typeof validateDueDate>) =>
  (r as { fieldErrors: Record<string, string> }).fieldErrors.lmp;
const rejects = (r: DueDateComputed) => Number.isNaN(completeDueDateValue(r));

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe('due-date binding — contract', () => {
  it('does NOT define isUsableResult (the guard lives in resultValue)', () => {
    expect(dueDateBinding.isUsableResult).toBeUndefined();
    expect(dueDateBinding.resultValue).toBe(completeDueDateValue);
  });
});

/* ------------------------------------------------------------------ */
/* Validation — required + not in the future                          */
/* ------------------------------------------------------------------ */

describe('due-date binding — validation (required → strict calendar → not future)', () => {
  it('accepts ordinary + leap + leading-zero + today dates', () => {
    for (const d of ['2024-01-01', '2024-02-29', '2024-06-01', TODAY]) {
      expect(ok(validateDueDate(v(d)))).toBe(true);
    }
  });
  it('rejects empty input with the required message', () => {
    expect(err(validateDueDate(v('')))).toBe('Enter the first day of your last menstrual period.');
    expect(err(validateDueDate(v('   ')))).toBe('Enter the first day of your last menstrual period.');
  });
  it('rejects impossible / malformed / non-canonical dates with the invalid-calendar message', () => {
    for (const bad of ['not-a-date', '2023-02-29', '2023-02-30', '2026-04-31', '2026-00-10', '2026-13-01', '2026-05-00', '2026-1-2', '20240101']) {
      expect(err(validateDueDate(v(bad)))).toBe('Enter a valid last menstrual period date.');
    }
  });
  it('rejects a future LMP with the future message', () => {
    expect(err(validateDueDate(v('2024-07-01')))).toBe('Enter a last menstrual period date that is not in the future.');
    expect(err(validateDueDate(v('2024-06-02')))).toMatch(/not in the future/);
  });
  it('accepts a historical LMP (no lower bound)', () => {
    expect(ok(validateDueDate(v('2000-01-01')))).toBe(true);
  });
  it('applies precedence: required → invalid-calendar → future', () => {
    expect(err(validateDueDate(v('')))).toMatch(/first day/); // required wins over "also not a date"
    expect(err(validateDueDate({ lmp: '2027-02-30', today: TODAY }))).toBe('Enter a valid last menstrual period date.'); // impossible wins over future-year
    expect(err(validateDueDate(v('2024-07-01')))).toMatch(/not in the future/); // valid-but-future
  });
});

describe('due-date binding — strict calendar round-trip (isStrictCalendarDate)', () => {
  it('accepts canonical valid dates (incl. leap day)', () => {
    for (const d of ['2024-01-01', '2024-02-29', '2000-12-31']) expect(isStrictCalendarDate(d)).toBe(true);
  });
  it('rejects rollover / malformed input (the frozen primitive still rolls over — see due-date.test.ts)', () => {
    for (const bad of ['2023-02-30', '2023-02-29', '2026-04-31', '2026-13-01', '2026-1-2', '', 'x']) {
      expect(isStrictCalendarDate(bad)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('due-date binding — computation', () => {
  it('ordinary LMP → due date, conception, gestational age, not past-due', () => {
    const r = computeDueDate(v('2024-01-01'));
    expect(longDate(r.dueDate)).toBe('Monday, October 7, 2024');
    expect(r.age.totalDays).toBe(152); // 2024-01-01 → 2024-06-01
    expect(r.age.weeks).toBe(21);
    expect(r.age.days).toBe(5);
    expect(r.age.trimester).toBe(2);
    expect(r.pastDue).toBe(false);
  });
  it('same-day LMP → 0w 0d, not past-due', () => {
    const r = computeDueDate(v('2024-06-01'));
    expect(r.age.totalDays).toBe(0);
    expect(r.pastDue).toBe(false);
  });
  it('historical LMP whose due date has passed → pastDue', () => {
    const r = computeDueDate(v('2023-01-01'));
    expect(longDate(r.dueDate)).toBe('Sunday, October 8, 2023');
    expect(r.pastDue).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

describe('due-date binding — complete-result guard', () => {
  it('returns the finite due-date timestamp for a well-formed ongoing result', () => {
    const r = computeDueDate(v('2024-01-01'));
    expect(completeDueDateValue(r)).toBe(r.dueDate.getTime());
    expect(Number.isFinite(completeDueDateValue(r))).toBe(true);
  });
  it('returns finite for a well-formed past-due result', () => {
    const r = computeDueDate(v('2023-01-01'));
    expect(Number.isFinite(completeDueDateValue(r))).toBe(true);
  });
  it('rejects an unparseable LMP', () => {
    const r = computeDueDate(v('2024-01-01'));
    expect(rejects({ ...r, lmpISO: '' })).toBe(true);
  });
  it('rejects a due date that does not reconcile with LMP+280', () => {
    const r = computeDueDate(v('2024-01-01'));
    expect(rejects({ ...r, dueDate: new Date(Number.NaN) })).toBe(true);
    expect(rejects({ ...r, dueDate: new Date(Date.UTC(2099, 0, 1)) })).toBe(true);
  });
  it('rejects a conception date that does not reconcile with LMP+14', () => {
    const r = computeDueDate(v('2024-01-01'));
    expect(rejects({ ...r, conceptionDate: new Date(Date.UTC(2099, 0, 1)) })).toBe(true);
  });
  it('rejects an ongoing result whose gestational block is out of range', () => {
    const r = computeDueDate(v('2024-01-01'));
    expect(rejects({ ...r, age: { ...r.age, weeks: -1 } })).toBe(true);
    expect(rejects({ ...r, age: { ...r.age, days: 9 } })).toBe(true);
    expect(rejects({ ...r, age: { ...r.age, trimester: 5 as 1 } })).toBe(true);
    expect(rejects({ ...r, age: { ...r.age, progressPct: 150 } })).toBe(true);
    expect(rejects({ ...r, age: { ...r.age, totalDays: 300 } })).toBe(true); // > 280 but flagged ongoing
  });
  it('rejects an ongoing result whose gestational block does not reconcile with the engine', () => {
    const r = computeDueDate(v('2024-01-01'));
    expect(rejects({ ...r, age: { ...r.age, weeks: 99 } })).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Presentation + announcement                                         */
/* ------------------------------------------------------------------ */

describe('due-date binding — presentation', () => {
  it('ongoing: due date + how-far-along + trimester + ordinary interpretation', () => {
    const p = presentDueDate(computeDueDate(v('2024-01-01')));
    expect(p.pastDue).toBe(false);
    expect(p.dueDate).toBe('Monday, October 7, 2024');
    expect(p.along).toBe('21w 5d');
    expect(p.trimester).toBe('2nd');
    expect(p.interpretation).toBe('Based on the entered last menstrual period, the estimated due date is Monday, October 7, 2024.');
  });
  it('past-due: due date kept, progress suppressed, neutral interpretation', () => {
    const p = presentDueDate(computeDueDate(v('2023-01-01')));
    expect(p.pastDue).toBe(true);
    expect(p.dueDate).toBe('Sunday, October 8, 2023');
    expect(p.along).toBe('—');
    expect(p.trimester).toBe('—');
    expect(p.interpretation).toBe('The estimated due date has passed. Check the entered date if this is unexpected.');
  });
});

describe('due-date binding — announcement (dominant only)', () => {
  it('ordinary announces the due date', () => {
    expect(describeDueDate(computeDueDate(v('2024-01-01')))).toBe('Estimated due date: Monday, October 7, 2024.');
  });
  it('past-due announces the due date plus a passed note', () => {
    expect(describeDueDate(computeDueDate(v('2023-01-01')))).toBe('Estimated due date: Sunday, October 8, 2023. This estimated date has passed.');
  });
});

/* ------------------------------------------------------------------ */
/* readValues / resetValues (mock root — no DOM in node vitest)         */
/* ------------------------------------------------------------------ */

describe('due-date binding — readValues / resetValues', () => {
  const mockRoot = (lmp: string) => {
    const input = { value: lmp };
    return {
      querySelector: (sel: string) => (sel === '[name="lmp"]' ? input : null),
      __input: input,
    } as unknown as HTMLElement & { __input: { value: string } };
  };

  it('reads the LMP and seeds today from the local calendar (ISO)', () => {
    const read = dueDateBinding.readValues(mockRoot('2024-03-15'));
    expect(read.lmp).toBe('2024-03-15');
    expect(read.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(read.today).toBe(todayISO());
  });
  it('reset clears the LMP field', () => {
    const root = mockRoot('2024-03-15');
    dueDateBinding.resetValues(root, 'personal');
    expect((root as unknown as { __input: { value: string } }).__input.value).toBe('');
  });
});
