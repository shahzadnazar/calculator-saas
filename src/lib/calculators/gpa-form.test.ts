import { describe, it, expect } from 'vitest';
import {
  validateGpa,
  computeGpa,
  completeGpaValue,
  describeGpa,
  toCourses,
  isBlankRow,
  parseCredits,
  validatePlan,
  computePlan,
  completePlanValue,
  planSentence,
  describePlan,
  INITIAL_ROWS,
  MAX_GPA,
  MSG,
  GPA_EXAMPLE_VALUES,
  PLAN_EXAMPLE_VALUES,
  type GpaFormValues,
  type GpaRowValue,
  type PlanFormValues,
} from './gpa-form';
import { formatGpa } from './gpa';
import type { ValidationResult } from '@lib/result/form-runtime';

const row = (id: string, grade: string, credits: string, name = ''): GpaRowValue => ({ id, name, grade, credits });
const form = (...rows: GpaRowValue[]): GpaFormValues => ({ rows });
const errors = (r: ValidationResult) => (r.ok ? {} : (r.fieldErrors ?? {}));
const formError = (r: ValidationResult) => (r.ok ? '' : (r.formError ?? ''));

const REFERENCE = form(
  row('1', 'A', '3', 'Math'),
  row('2', 'B+', '3', 'English'),
  row('3', 'A-', '2', 'History'),
  row('4', '', ''),
  row('5', '', ''),
);

/* ---- Rows ---------------------------------------------------------- */

describe('reading the course rows', () => {
  it('opens with the reference number of blank rows', () => {
    expect(INITIAL_ROWS).toBe(5);
  });

  it('treats an untouched row as blank, not as an error', () => {
    expect(isBlankRow(row('1', '', ''))).toBe(true);
    expect(isBlankRow(row('1', '', '', 'Math'))).toBe(true); // a name alone is not an entry
    expect(isBlankRow(row('1', 'A', ''))).toBe(false);
    expect(validateGpa(REFERENCE).ok).toBe(true); // the two blank rows do not object
  });

  it('keeps only the rows that were filled in', () => {
    expect(toCourses(REFERENCE)).toEqual([
      { name: 'Math', credits: 3, grade: 'A' },
      { name: 'English', credits: 3, grade: 'B+' },
      { name: 'History', credits: 2, grade: 'A-' },
    ]);
  });

  it('parses credits strictly, telling empty from malformed', () => {
    expect(parseCredits('3')).toBe(3);
    expect(parseCredits('0.5')).toBe(0.5);
    expect(parseCredits('0')).toBe(0);
    expect(parseCredits('')).toBe('empty');
    expect(parseCredits('three')).toBe('invalid');
    expect(parseCredits('-2')).toBe('invalid');
    expect(parseCredits('1e2')).toBe('invalid');
  });
});

/* ---- Validation ---------------------------------------------------- */

describe('GPA validation', () => {
  it('asks for the credits of a row that has a grade', () => {
    expect(errors(validateGpa(form(row('1', 'A', ''))))['credits-1']).toBe(MSG.creditsRequired);
  });

  it('names the field that is missing', () => {
    expect(errors(validateGpa(form(row('1', 'A', ''), row('2', 'B', '3'))))['credits-1']).toBe(MSG.creditsRequired);
    expect(errors(validateGpa(form(row('1', '', '3'), row('2', 'B', '3'))))['grade-1']).toBe(MSG.gradeMissing);
    expect(errors(validateGpa(form(row('1', 'A', 'x'), row('2', 'B', '3'))))['credits-1']).toBe(MSG.creditsInvalid);
  });

  it('rejects a grade that is not on the scale', () => {
    expect(errors(validateGpa(form(row('1', 'Z', '3'))))['grade-1']).toBe(MSG.gradeInvalid);
  });

  it('asks for at least one course when every row is blank', () => {
    expect(formError(validateGpa(form(row('1', '', ''), row('2', '', ''))))).toBe(MSG.noCourses);
  });

  it('says so when every course entered is an ignored grade', () => {
    expect(formError(validateGpa(form(row('1', 'P', '3'), row('2', 'W', '2'))))).toBe(MSG.allIgnored);
  });

  it('does not call a zero-credit F "not scored" — it is graded, it just weighs nothing', () => {
    expect(formError(validateGpa(form(row('1', 'F', '0'))))).toBe(MSG.noCourses);
  });
});

/* ---- The reference result ------------------------------------------ */

describe('the reference GPA result', () => {
  const computed = computeGpa(REFERENCE);

  it('reports 3.663 across 8 credits', () => {
    expect(formatGpa(computed.result.gpa)).toBe('3.663');
    expect(computed.result.totalCredits).toBe(8);
  });

  it('announces the answer without formula internals', () => {
    expect(describeGpa(computed)).toBe('GPA: 3.663 across 8 credits.');
  });

  it('says nothing when there is no result', () => {
    expect(describeGpa(computeGpa(form(row('1', '', ''))))).toBe('');
  });
});

describe('the GPA complete-result guard', () => {
  it('accepts a reconciling result', () => {
    expect(completeGpaValue(computeGpa(REFERENCE))).toBeCloseTo(3.6625, 10);
  });

  it('accepts a legitimate zero', () => {
    expect(completeGpaValue(computeGpa(form(row('1', 'F', '3'))))).toBe(0);
  });

  it('rejects an empty set of courses', () => {
    expect(completeGpaValue(computeGpa(form(row('1', '', ''))))).toBeNaN();
  });

  it('rejects a result with no counted credits', () => {
    expect(completeGpaValue(computeGpa(form(row('1', 'P', '3'))))).toBeNaN();
  });

  it('rejects a result whose courses no longer produce it', () => {
    const computed = computeGpa(REFERENCE);
    expect(completeGpaValue({ ...computed, courses: [{ name: 'X', credits: 1, grade: 'F' }] })).toBeNaN();
  });
});

/* ---- Planning ------------------------------------------------------- */

describe('planning validation', () => {
  const plan = (o: Partial<PlanFormValues> = {}): PlanFormValues => ({
    currentGpa: '3.663',
    targetGpa: '3',
    currentCredits: '8',
    additionalCredits: '15',
    ...o,
  });

  it('accepts the reference entries', () => {
    expect(validatePlan(plan()).ok).toBe(true);
  });

  it('asks for every field', () => {
    const r = errors(validatePlan({ currentGpa: '', targetGpa: '', currentCredits: '', additionalCredits: '' }));
    expect(Object.keys(r).sort()).toEqual(['additionalCredits', 'currentCredits', 'currentGpa', 'targetGpa']);
  });

  it('holds a GPA to the scale', () => {
    expect(errors(validatePlan(plan({ targetGpa: '5' }))).targetGpa).toBe(MSG.gpaRange);
    expect(validatePlan(plan({ targetGpa: String(MAX_GPA) })).ok).toBe(true);
  });

  it('needs more than zero additional credits, but allows zero current ones', () => {
    expect(errors(validatePlan(plan({ additionalCredits: '0' }))).additionalCredits).toBe(MSG.creditsPositive);
    expect(validatePlan(plan({ currentCredits: '0' })).ok).toBe(true);
  });
});

describe('the reference planning result', () => {
  const computed = computePlan(PLAN_EXAMPLE_VALUES);

  it('writes the reference sentence', () => {
    expect(planSentence(computed.plan)).toBe(
      'To achieve a target GPA of 3, the GPA for the next 15 credits needs to be 2.646 or higher.',
    );
    expect(describePlan(computed)).toBe(planSentence(computed.plan));
  });

  it('says so when the target is already met', () => {
    const met = computePlan({ currentGpa: '4', targetGpa: '2', currentCredits: '30', additionalCredits: '15' });
    expect(planSentence(met.plan)).toContain('already met');
  });

  it('says so, with the number, when the target is out of reach', () => {
    const hard = computePlan({ currentGpa: '1', targetGpa: '4', currentCredits: '60', additionalCredits: '3' });
    expect(planSentence(hard.plan)).toContain('out of reach');
    expect(planSentence(hard.plan)).toContain('4.3'); // names the ceiling it exceeds
  });

  it('gates on a coherent input, not on whether the answer is achievable', () => {
    expect(completePlanValue(computed)).toBeCloseTo(2.6464, 10);
    const hard = computePlan({ currentGpa: '1', targetGpa: '4', currentCredits: '60', additionalCredits: '3' });
    expect(Number.isFinite(completePlanValue(hard))).toBe(true); // an out-of-reach answer is still an answer
    const none = computePlan({ currentGpa: '3', targetGpa: '3.5', currentCredits: '10', additionalCredits: '0' });
    expect(completePlanValue(none)).toBeNaN();
  });
});

describe('the worked examples', () => {
  it('both solve, and the GPA example is the reference transcript', () => {
    expect(validateGpa(GPA_EXAMPLE_VALUES).ok).toBe(true);
    expect(formatGpa(completeGpaValue(computeGpa(GPA_EXAMPLE_VALUES)))).toBe('3.663');
    expect(validatePlan(PLAN_EXAMPLE_VALUES).ok).toBe(true);
    expect(formatGpa(completePlanValue(computePlan(PLAN_EXAMPLE_VALUES)))).toBe('2.646');
  });
});
