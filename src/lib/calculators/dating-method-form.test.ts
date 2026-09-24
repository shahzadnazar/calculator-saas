import { describe, it, expect } from 'vitest';
import {
  MSG,
  SCAN_WEEKS_MAX,
  validateDating,
  resolveLmp,
  dueDateError,
  cycleError,
  scanAgeError,
  isStrictCalendarDate,
  readDatingValues,
  resetDatingValues,
  type DatingValues,
} from './dating-method-form';
import { toISODateUTC } from './date-duration';

/**
 * The dating form layer shared by the due-date and pregnancy calculators.
 *
 * The arithmetic for each route is frozen by due-date.test.ts; what is pinned here is what a
 * FORM needs and what the two calculators must agree on: that only the chosen method's
 * fields are validated, that each route resolves to the LMP the engine expects, and that a
 * calculator can never validate or resolve a method it does not offer.
 */

const TODAY = '2026-06-01';
const BASE: DatingValues = {
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
const v = (over: Partial<DatingValues> = {}): DatingValues => ({ ...BASE, ...over });
const errs = (r: ReturnType<typeof validateDating>) =>
  r.ok ? {} : ((r as { fieldErrors: Record<string, string> }).fieldErrors ?? {});
const lmpOf = (over: Partial<DatingValues>) => toISODateUTC(resolveLmp(v(over)));

/* ------------------------------------------------------------------ */
/* Each route lands on the LMP the engine expects                      */
/* ------------------------------------------------------------------ */

describe('resolveLmp — every route reaches the same place', () => {
  it('due date: runs the 280-day rule backwards', () => {
    expect(lmpOf({ method: 'due', dueDate: '2026-10-08' })).toBe('2026-01-01');
  });
  it('last period: is the LMP itself on a textbook cycle', () => {
    expect(lmpOf({ method: 'lmp', lmp: '2026-01-01' })).toBe('2026-01-01');
  });
  it('last period: a longer cycle moves the LMP day for day', () => {
    expect(lmpOf({ method: 'lmp', lmp: '2026-01-01', cycleDays: '35' })).toBe('2026-01-08');
    expect(lmpOf({ method: 'lmp', lmp: '2026-01-08', cycleDays: '21' })).toBe('2026-01-01');
  });
  it('conception: two weeks earlier', () => {
    expect(lmpOf({ method: 'conception', conception: '2026-01-15' })).toBe('2026-01-01');
  });
  it('ultrasound: the reported age back from the scan', () => {
    expect(lmpOf({ method: 'ultrasound', scanDate: '2026-03-01', scanWeeks: '8', scanDays: '3' })).toBe(
      '2026-01-01',
    );
  });
  it('IVF: the embryo age plus the two weeks before ovulation', () => {
    expect(lmpOf({ method: 'ivf', transferDate: '2026-01-20', embryoAge: '5' })).toBe('2026-01-01');
    expect(lmpOf({ method: 'ivf', transferDate: '2026-01-18', embryoAge: '3' })).toBe('2026-01-01');
  });
  it('an unparseable date resolves to nothing rather than to a plausible wrong day', () => {
    for (const bad of [
      { method: 'due' as const, dueDate: '' },
      { method: 'lmp' as const, lmp: 'x' },
      { method: 'conception' as const, conception: '' },
      { method: 'ultrasound' as const, scanDate: 'nonsense' },
      { method: 'ivf' as const, transferDate: '' },
    ]) {
      expect(Number.isFinite(resolveLmp(v(bad)).getTime())).toBe(false);
    }
  });

  it('leaves roll-over dates to validation, which is what actually stops them', () => {
    // The shared parser rolls 2026-02-30 forward to 2026-03-02 — frozen behaviour the
    // strict round-trip check exists to catch. So the resolver WILL produce a date here;
    // what guarantees no rolled-over result is ever shown is that validation fails first,
    // and the runtime never computes an invalid form.
    expect(Number.isFinite(resolveLmp(v({ method: 'conception', conception: '2026-02-30' })).getTime())).toBe(
      true,
    );
    expect(validateDating(v({ method: 'conception', conception: '2026-02-30' })).ok).toBe(false);
    expect(validateDating(v({ method: 'ivf', transferDate: '2026-1-2' })).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Only the chosen method is validated                                 */
/* ------------------------------------------------------------------ */

describe('validateDating — only the chosen method', () => {
  it('an empty form asks for exactly the chosen method’s date, never another’s', () => {
    const cases = [
      ['due', 'dueDate', MSG.dueRequired],
      ['lmp', 'lmp', MSG.lmpRequired],
      ['conception', 'conception', MSG.conceptionRequired],
      ['ultrasound', 'scanDate', MSG.scanRequired],
      ['ivf', 'transferDate', MSG.transferRequired],
    ] as const;
    for (const [method, field, message] of cases) {
      const e = errs(validateDating(v({ method })));
      expect(e[field]).toBe(message);
      for (const other of ['dueDate', 'lmp', 'conception', 'scanDate', 'transferDate']) {
        if (other !== field) expect(e[other]).toBeUndefined();
      }
    }
  });

  it('ignores a stale value belonging to a method that is not chosen', () => {
    expect(validateDating(v({ method: 'lmp', lmp: '2026-01-01', conception: 'rubbish' })).ok).toBe(true);
    expect(validateDating(v({ method: 'conception', conception: '2026-01-01', lmp: '2099-01-01' })).ok).toBe(
      true,
    );
  });

  it('rejects a future date on every route that must be in the past', () => {
    const future = '2026-06-02';
    expect(errs(validateDating(v({ method: 'lmp', lmp: future }))).lmp).toBe(MSG.lmpFuture);
    expect(errs(validateDating(v({ method: 'conception', conception: future }))).conception).toBe(
      MSG.conceptionFuture,
    );
    expect(
      errs(validateDating(v({ method: 'ultrasound', scanDate: future, scanWeeks: '8' }))).scanDate,
    ).toBe(MSG.scanFuture);
    expect(errs(validateDating(v({ method: 'ivf', transferDate: future }))).transferDate).toBe(
      MSG.transferFuture,
    );
  });

  it('applies precedence: required → a real calendar date → not in the future', () => {
    expect(errs(validateDating(v({ method: 'lmp', lmp: '' }))).lmp).toBe(MSG.lmpRequired);
    expect(errs(validateDating(v({ method: 'lmp', lmp: '2027-02-30' }))).lmp).toBe(MSG.lmpInvalid);
    expect(errs(validateDating(v({ method: 'lmp', lmp: '2027-01-01' }))).lmp).toBe(MSG.lmpFuture);
  });
});

/* ------------------------------------------------------------------ */
/* The due date is the one field that belongs in the future            */
/* ------------------------------------------------------------------ */

describe('dueDateError — future is normal, but only so far', () => {
  it('accepts a due date up to 40 weeks out, because that is an LMP of today', () => {
    expect(dueDateError('2027-03-08', TODAY)).toBeNull(); // TODAY + 280
  });
  it('rejects one beyond that, because it implies a last period that has not happened', () => {
    expect(dueDateError('2027-03-09', TODAY)).toBe(MSG.dueTooFar);
  });
  it('accepts a past due date — that is a pregnancy already gone past its date', () => {
    expect(dueDateError('2026-05-01', TODAY)).toBeNull();
  });
  it('asks for it when blank, and rejects an impossible calendar date', () => {
    expect(dueDateError('', TODAY)).toBe(MSG.dueRequired);
    expect(dueDateError('2026-02-30', TODAY)).toBe(MSG.dueInvalid);
  });
});

/* ------------------------------------------------------------------ */
/* Optional and bounded fields                                         */
/* ------------------------------------------------------------------ */

describe('cycleError — optional, and a cycle when given', () => {
  it('treats blank as the textbook 28 days rather than an error', () => {
    expect(cycleError('')).toBeNull();
    expect(cycleError('   ')).toBeNull();
  });
  it('accepts the range it documents and rejects either side of it', () => {
    for (const good of ['20', '28', '45']) expect(cycleError(good)).toBeNull();
    for (const bad of ['19', '46', '0', '-5', '28.5', 'x']) expect(cycleError(bad)).toBe(MSG.cycleRange);
  });
});

describe('scanAgeError — a scan reports a real age', () => {
  it('accepts an ordinary reported age', () => {
    expect(scanAgeError('8', '3')).toBeNull();
    expect(scanAgeError('12', '')).toBeNull();
    expect(scanAgeError('', '3')).toBeNull();
  });
  it('asks for one when it is blank, or adds up to nothing', () => {
    expect(scanAgeError('', '')).toBe(MSG.scanAgeRequired);
    expect(scanAgeError('0', '0')).toBe(MSG.scanAgeRequired);
  });
  it('bounds weeks and days to what a scan can say', () => {
    expect(scanAgeError(String(SCAN_WEEKS_MAX + 1), '0')).toBe(MSG.scanWeeksRange);
    expect(scanAgeError('-1', '0')).toBe(MSG.scanWeeksRange);
    expect(scanAgeError('8.5', '0')).toBe(MSG.scanWeeksRange);
    expect(scanAgeError('8', '7')).toBe(MSG.scanDaysRange);
    expect(scanAgeError('8', '-1')).toBe(MSG.scanDaysRange);
  });
});

describe('isStrictCalendarDate', () => {
  it('accepts canonical dates including the leap day', () => {
    for (const d of ['2024-01-01', '2024-02-29', '2000-12-31']) expect(isStrictCalendarDate(d)).toBe(true);
  });
  it('rejects roll-over and non-canonical formatting', () => {
    for (const bad of ['2023-02-30', '2023-02-29', '2026-04-31', '2026-13-01', '2026-1-2', '', 'x']) {
      expect(isStrictCalendarDate(bad)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Reading the form                                                    */
/* ------------------------------------------------------------------ */

describe('readDatingValues — a calculator only ever reads a method it offers', () => {
  const mockRoot = (checked: string) => {
    const radios = ['due', 'lmp', 'conception', 'ultrasound', 'ivf'].map((value) => ({
      value,
      checked: value === checked,
    }));
    return {
      querySelector: (sel: string) =>
        sel === '[name="method"]:checked' ? (radios.find((r) => r.checked) ?? null) : null,
      querySelectorAll: () => radios,
    } as unknown as HTMLElement;
  };

  it('takes the checked method when the calculator offers it', () => {
    expect(readDatingValues(mockRoot('ivf'), ['lmp', 'conception', 'ultrasound', 'ivf']).method).toBe('ivf');
  });

  it('falls back to the first offered method when the checked one is not on the list', () => {
    // The due-date calculator does not offer `due`; a radio claiming it must not be honoured.
    expect(readDatingValues(mockRoot('due'), ['lmp', 'conception', 'ultrasound', 'ivf']).method).toBe('lmp');
  });

  it('defaults the embryo age rather than reading an empty select as zero', () => {
    expect(readDatingValues(mockRoot('ivf'), ['ivf']).embryoAge).toBe('5');
  });
});

describe('resetDatingValues', () => {
  it('restores the calculator’s own first method, not a shared default', () => {
    const make = () => {
      const radios = ['due', 'lmp'].map((value) => ({ value, checked: value === 'lmp' }));
      return {
        root: {
          querySelector: () => null,
          querySelectorAll: () => radios,
        } as unknown as HTMLElement,
        radios,
      };
    };
    const a = make();
    resetDatingValues(a.root, 'due');
    expect(a.radios.filter((r) => r.checked).map((r) => r.value)).toEqual(['due']);

    const b = make();
    resetDatingValues(b.root, 'lmp');
    expect(b.radios.filter((r) => r.checked).map((r) => r.value)).toEqual(['lmp']);
  });
});
