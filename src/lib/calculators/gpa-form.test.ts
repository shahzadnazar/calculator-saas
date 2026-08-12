import { describe, it, expect } from 'vitest';
import {
  validateGpa,
  computeGpa,
  completeGpaValue,
  presentGpa,
  describeGpa,
  gpaBinding,
  MAX_GPA,
  MSG,
  type GpaComputed,
  type GpaFormValues,
} from './gpa-form';

/**
 * GPA form-binding tests (R16B1 Commit 2 — Academic family pilot, 1 of 2). Exercise
 * the VALIDATION / PRESENTATION boundary only — the pure engine (calculateGPA +
 * GRADE_POINTS) is unchanged and separately frozen by gpa.test.ts. Covers dynamic
 * row reading, per-row grade/credit validation + the form-level "one course with
 * credit hours" rule, the letter→point mapping, the complete-result guard (NaN
 * sentinel; NO isUsableResult; a valid 0.0 accepted), and presentation/announcement.
 */

const row = (id: string, grade: string, credits: string) => ({ id, grade, credits });
const V = (...rows: Array<ReturnType<typeof row>>): GpaFormValues => ({ rows });
const ok = (r: ReturnType<typeof validateGpa>) => r.ok === true;
const fe = (r: ReturnType<typeof validateGpa>, f: string) =>
  (r as { fieldErrors?: Record<string, string> }).fieldErrors?.[f];
const formErr = (r: ReturnType<typeof validateGpa>) => (r as { formError?: string }).formError;
const rejects = (c: GpaComputed) => Number.isNaN(completeGpaValue(c));

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe('gpa binding — contract', () => {
  it('does NOT define isUsableResult (the guard lives in resultValue)', () => {
    expect(gpaBinding.isUsableResult).toBeUndefined();
    expect(gpaBinding.resultValue).toBe(completeGpaValue);
  });
  it('exposes the exact frozen scale ceiling', () => {
    expect(MAX_GPA).toBe(4.0);
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('gpa binding — validation', () => {
  it('the initial single blank row is a form-level error (no course yet)', () => {
    const r = validateGpa(V(row('r1', '', '')));
    expect(ok(r)).toBe(false);
    expect(formErr(r)).toBe(MSG.noCourses);
  });

  it('wholly-empty rows are ignored; the form-level error stands', () => {
    expect(formErr(validateGpa(V(row('r1', '', ''), row('r2', '', ''))))).toBe(MSG.noCourses);
  });

  it('a partial row (grade set, credits empty) is a row credits error', () => {
    const r = validateGpa(V(row('r1', 'A', '')));
    expect(fe(r, 'credits-r1')).toBe(MSG.creditsRequired);
  });

  it('a partial row (credits set, grade empty) is a row grade error', () => {
    const r = validateGpa(V(row('r1', '', '3')));
    expect(fe(r, 'grade-r1')).toBe(MSG.gradeRequired);
  });

  it('an unsupported grade is a row grade error', () => {
    expect(fe(validateGpa(V(row('r1', 'Z', '3'))), 'grade-r1')).toBe(MSG.gradeInvalid);
  });

  it('malformed / non-finite / negative credits are a row credits error (0 is NOT)', () => {
    for (const bad of ['abc', 'Infinity', '-1']) {
      expect(fe(validateGpa(V(row('r1', 'A', bad))), 'credits-r1')).toBe(MSG.creditsInvalid);
    }
    // zero credits with a valid grade is not a per-field error — it is a valid non-contributing row.
    expect(fe(validateGpa(V(row('r1', 'A', '0'), row('r2', 'B', '3'))), 'credits-r1')).toBeUndefined();
  });

  it('all-zero-credit courses are a form-level error (no positive credit hours)', () => {
    expect(formErr(validateGpa(V(row('r1', 'A', '0'), row('r2', 'B', '0'))))).toBe(MSG.noCourses);
  });

  it('one valid course, and multiple valid courses, pass', () => {
    expect(ok(validateGpa(V(row('r1', 'A', '3'))))).toBe(true);
    expect(ok(validateGpa(V(row('r1', 'A', '3'), row('r2', 'B+', '4'), row('r3', 'C', '3'))))).toBe(true);
  });

  it('a valid course alongside an empty row passes (empty ignored)', () => {
    expect(ok(validateGpa(V(row('r1', 'A', '3'), row('r2', '', ''))))).toBe(true);
  });

  it('row field errors take precedence over the form-level error', () => {
    const r = validateGpa(V(row('r1', 'A', ''))); // partial → credits error, and no contributing course
    expect(fe(r, 'credits-r1')).toBe(MSG.creditsRequired);
    expect(formErr(r)).toBeUndefined();
  });

  it('an F grade with credits is valid (0 quality points is not an error)', () => {
    expect(ok(validateGpa(V(row('r1', 'F', '3'))))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('gpa binding — computation (letter → point via GRADE_POINTS)', () => {
  it('maps letters to points and computes exactly as calculateGPA', () => {
    const c = computeGpa(V(row('r1', 'A', '3'), row('r2', 'B', '4'), row('r3', 'A-', '3')));
    expect(c.courses).toEqual([
      { gradePoints: 4.0, credits: 3 },
      { gradePoints: 3.0, credits: 4 },
      { gradePoints: 3.7, credits: 3 },
    ]);
    expect(c.result.totalCredits).toBe(10);
    expect(c.result.gpa).toBeCloseTo(3.51, 2);
  });

  it('skips empty rows and includes a zero-credit course (contributing nothing)', () => {
    const c = computeGpa(V(row('r1', 'A', '3'), row('r2', 'C', '0'), row('r3', '', '')));
    expect(c.courses).toEqual([
      { gradePoints: 4.0, credits: 3 },
      { gradePoints: 2.0, credits: 0 },
    ]);
    expect(c.result.totalCredits).toBe(3);
    expect(c.result.gpa).toBe(4.0);
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

describe('gpa binding — complete-result guard', () => {
  const good = computeGpa(V(row('r1', 'A', '3'), row('r2', 'B', '4')));

  it('returns the finite GPA for a well-formed result', () => {
    expect(completeGpaValue(good)).toBe(good.result.gpa);
    expect(Number.isFinite(completeGpaValue(good))).toBe(true);
  });

  it('accepts a valid 0.0 GPA (finite 0 the default gate accepts)', () => {
    const zero = computeGpa(V(row('r1', 'F', '3')));
    expect(completeGpaValue(zero)).toBe(0);
    expect(Number.isFinite(completeGpaValue(zero))).toBe(true);
  });

  it('accepts a valid maximum 4.0 GPA', () => {
    const max = computeGpa(V(row('r1', 'A', '3'), row('r2', 'A', '5')));
    expect(completeGpaValue(max)).toBe(4.0);
  });

  it('rejects an empty course set (NaN)', () => {
    expect(rejects(computeGpa(V(row('r1', '', ''))))).toBe(true);
  });

  it('rejects tampered totals (credits / quality points)', () => {
    expect(rejects({ ...good, result: { ...good.result, totalCredits: good.result.totalCredits + 1 } })).toBe(true);
    expect(rejects({ ...good, result: { ...good.result, totalQualityPoints: good.result.totalQualityPoints + 1 } })).toBe(true);
  });

  it('rejects a GPA outside the exact scale bounds [0, 4.0]', () => {
    expect(rejects({ ...good, result: { ...good.result, gpa: 5 } })).toBe(true);
    expect(rejects({ ...good, result: { ...good.result, gpa: -0.1 } })).toBe(true);
    expect(rejects({ ...good, result: { ...good.result, gpa: Number.NaN } })).toBe(true);
  });

  it('rejects a course with an out-of-range grade point or negative credits', () => {
    expect(rejects({ ...good, courses: [{ gradePoints: 5, credits: 3 }] })).toBe(true);
    expect(rejects({ ...good, courses: [{ gradePoints: 4, credits: -3 }] })).toBe(true);
  });

  it('rejects a non-positive total-credits result', () => {
    expect(rejects({ ...good, result: { ...good.result, totalCredits: 0 } })).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('gpa binding — presentation', () => {
  it('presents the GPA to two decimals + total credit hours + a neutral interpretation', () => {
    const p = presentGpa(computeGpa(V(row('r1', 'A', '3'), row('r2', 'B', '4'), row('r3', 'A-', '3'))));
    expect(p.gpa).toBe('3.51');
    expect(p.credits).toBe('10');
    expect(p.interpretation).toContain('3.51');
    expect(p.interpretation).toContain('3 courses');
    expect(p.interpretation).toContain('10 credit hours');
  });

  it('describeGpa announces the GPA and credit hours (valid 0 announced normally; singular pluralization)', () => {
    expect(describeGpa(computeGpa(V(row('r1', 'A', '3'), row('r2', 'B', '4'), row('r3', 'A-', '3'))))).toBe(
      'GPA: 3.51 across 10 credit hours.',
    );
    expect(describeGpa(computeGpa(V(row('r1', 'F', '3'))))).toBe('GPA: 0.00 across 3 credit hours.');
    expect(describeGpa(computeGpa(V(row('r1', 'A', '1'))))).toBe('GPA: 4.00 across 1 credit hour.');
  });
});

/* ------------------------------------------------------------------ */
/* readValues / resetValues (mock dynamic-row DOM)                     */
/* ------------------------------------------------------------------ */

describe('gpa binding — readValues / resetValues (dynamic rows)', () => {
  const mockRoot = (data: Array<{ id: string; grade: string; credits: string }>) => {
    const make = (d: { id: string; grade: string; credits: string }) => {
      const grade = { value: d.grade };
      const credits = { value: d.credits };
      const el = {
        dataset: { rowId: d.id },
        querySelector: (sel: string) =>
          sel.includes('data-gpa-grade') ? grade : sel.includes('data-gpa-credits') ? credits : null,
        remove() {
          const i = list.indexOf(el);
          if (i >= 0) list.splice(i, 1);
        },
      };
      return el;
    };
    const list = data.map(make);
    return {
      querySelectorAll: (sel: string) => (sel.includes('data-gpa-row') ? [...list] : []),
      __list: list,
    } as unknown as HTMLElement & { __list: ReturnType<typeof make>[] };
  };

  it('reads every current row in order', () => {
    const root = mockRoot([
      { id: 'r1', grade: 'A', credits: '3' },
      { id: 'r2', grade: 'B+', credits: '4' },
    ]);
    expect(gpaBinding.readValues(root)).toEqual({
      rows: [
        { id: 'r1', grade: 'A', credits: '3' },
        { id: 'r2', grade: 'B+', credits: '4' },
      ],
    });
  });

  it('reset collapses to exactly one blank row', () => {
    const root = mockRoot([
      { id: 'r1', grade: 'A', credits: '3' },
      { id: 'r2', grade: 'B', credits: '4' },
      { id: 'r3', grade: 'C', credits: '3' },
    ]);
    gpaBinding.resetValues(root, 'personal');
    const after = gpaBinding.readValues(root);
    expect(after.rows).toEqual([{ id: 'r1', grade: '', credits: '' }]);
  });

  it('two roots read independently (per-instance isolation)', () => {
    const a = mockRoot([{ id: 'r1', grade: 'A', credits: '3' }]);
    const b = mockRoot([{ id: 'r1', grade: 'C', credits: '2' }]);
    expect(gpaBinding.readValues(a).rows[0].grade).toBe('A');
    expect(gpaBinding.readValues(b).rows[0].grade).toBe('C');
  });
});
