import { describe, it, expect } from 'vitest';
import {
  validateGrade,
  computeGrade,
  completeGradeValue,
  describeGrade,
  planSentence,
  toItems,
  isBlankRow,
  parseWeight,
  validateFinal,
  computeFinal,
  completeFinalValue,
  finalSentence,
  parseFinalGrade,
  INITIAL_ROWS,
  MSG,
  GRADE_EXAMPLE_VALUES,
  FINAL_EXAMPLE_VALUES,
  type GradeFormValues,
  type GradeRowValue,
  type FinalFormValues,
} from './grade-form';
import { formatAverageGrade } from './grade';
import type { ValidationResult } from '@lib/result/form-runtime';

const row = (id: string, grade: string, weight: string, name = ''): GradeRowValue => ({ id, name, grade, weight });
const form = (rows: GradeRowValue[], goal = '', remainingWeight = ''): GradeFormValues => ({ rows, goal, remainingWeight });
const errors = (r: ValidationResult) => (r.ok ? {} : (r.fieldErrors ?? {}));
const formError = (r: ValidationResult) => (r.ok ? '' : (r.formError ?? ''));

const REFERENCE = form([
  row('1', '90', '5', 'Homework 1'),
  row('2', 'B', '20', 'Project'),
  row('3', '88', '20', 'Midterm exam'),
  row('4', '', ''),
  row('5', '', ''),
]);

/* ---- Rows ---------------------------------------------------------- */

describe('reading the assignment rows', () => {
  it('opens with enough rows to keep the primary action above the fold', () => {
    expect(INITIAL_ROWS).toBe(5);
  });

  it('treats an untouched row as blank, not as an error', () => {
    expect(isBlankRow(row('1', '', ''))).toBe(true);
    expect(isBlankRow(row('1', '', '', 'Essay'))).toBe(true); // a name alone is not an entry
    expect(isBlankRow(row('1', 'B', ''))).toBe(false);
    expect(validateGrade(REFERENCE).ok).toBe(true);
  });

  it('keeps only the rows that were filled in', () => {
    expect(toItems(REFERENCE)).toEqual([
      { name: 'Homework 1', grade: '90', weight: 5 },
      { name: 'Project', grade: 'B', weight: 20 },
      { name: 'Midterm exam', grade: '88', weight: 20 },
    ]);
  });

  it('parses a weight strictly', () => {
    expect(parseWeight('20')).toBe(20);
    expect(parseWeight('0')).toBe(0);
    expect(parseWeight('')).toBe('empty');
    expect(parseWeight('-5')).toBe('invalid');
    expect(parseWeight('twenty')).toBe('invalid');
  });
});

/* ---- Validation ---------------------------------------------------- */

describe('grade validation', () => {
  it('names the field that is missing or wrong', () => {
    expect(errors(validateGrade(form([row('1', 'B', ''), row('2', 'A', '10')])))['weight-1']).toBe(MSG.weightRequired);
    expect(errors(validateGrade(form([row('1', '', '10'), row('2', 'A', '10')])))['grade-1']).toBe(MSG.gradeMissing);
    expect(errors(validateGrade(form([row('1', 'Z', '10')])))['grade-1']).toBe(MSG.gradeInvalid);
    expect(errors(validateGrade(form([row('1', 'B', 'x')])))['weight-1']).toBe(MSG.weightInvalid);
  });

  it('asks for at least one weighted row', () => {
    expect(formError(validateGrade(form([row('1', '', '')])))).toBe(MSG.noRows);
    expect(formError(validateGrade(form([row('1', 'B', '0')])))).toBe(MSG.noRows);
  });

  it('treats the planning block as optional, but not half of it', () => {
    expect(validateGrade(form([row('1', 'B', '20')])).ok).toBe(true);
    expect(errors(validateGrade(form([row('1', 'B', '20')], 'A-', ''))).remainingWeight).toBe(MSG.remainingRequired);
    expect(errors(validateGrade(form([row('1', 'B', '20')], '', '55'))).goal).toBe(MSG.goalRequired);
    expect(validateGrade(form([row('1', 'B', '20')], 'A-', '55')).ok).toBe(true);
  });

  it('rejects a planning goal that is not a grade, and a zero remaining weight', () => {
    expect(errors(validateGrade(form([row('1', 'B', '20')], 'Z', '55'))).goal).toBe(MSG.gradeInvalid);
    expect(errors(validateGrade(form([row('1', 'B', '20')], 'A-', '0'))).remainingWeight).toBe(MSG.remainingInvalid);
  });
});

/* ---- The reference result ------------------------------------------ */

describe('the reference grade result', () => {
  const computed = computeGrade(REFERENCE);

  it('reports B+ (3.21) over 45%', () => {
    expect(formatAverageGrade(computed.average)).toBe('B+ (3.21)');
    expect(computed.average.totalWeight).toBe(45);
  });

  it('announces the answer without formula internals', () => {
    expect(describeGrade(computed)).toBe('Average grade: B+ (3.21) over 45% of the course.');
  });

  it('says nothing when there is no result', () => {
    expect(describeGrade(computeGrade(form([row('1', '', '')])))).toBe('');
  });

  it('has no plan unless the optional block was filled in', () => {
    expect(computed.plan).toBe(null);
    expect(planSentence(computed)).toBe('');
  });
});

describe('the optional planning block', () => {
  it('says what the remaining work has to average', () => {
    const c = computeGrade(form(REFERENCE.rows, 'A-', '55'));
    expect(planSentence(c)).toBe('To finish on A- (3.7), the remaining 55% needs to average A (4.1) or better.');
  });

  it('says when a goal is already secured', () => {
    const c = computeGrade(form(REFERENCE.rows, 'D', '55'));
    expect(planSentence(c)).toContain('already secured');
  });

  it('says when a goal is out of reach, naming the ceiling', () => {
    const c = computeGrade(form(REFERENCE.rows, 'A+', '5'));
    expect(planSentence(c)).toContain('out of reach');
    expect(planSentence(c)).toContain('4.3');
  });
});

describe('the grade complete-result guard', () => {
  it('accepts a reconciling result', () => {
    expect(completeGradeValue(computeGrade(REFERENCE))).toBeCloseTo(3.2111111111, 9);
  });

  it('accepts a legitimate zero', () => {
    expect(completeGradeValue(computeGrade(form([row('1', 'F', '100')])))).toBe(0);
  });

  it('rejects an empty set of rows', () => {
    expect(completeGradeValue(computeGrade(form([row('1', '', '')])))).toBeNaN();
  });

  it('rejects a result whose rows no longer produce it', () => {
    const computed = computeGrade(REFERENCE);
    expect(completeGradeValue({ ...computed, items: [{ name: 'X', grade: 'F', weight: 10 }] })).toBeNaN();
  });
});

/* ---- The final grade calculator ------------------------------------ */

describe('the final grade calculator', () => {
  const values = (o: Partial<FinalFormValues> = {}): FinalFormValues => ({
    current: '88',
    want: '85',
    weight: '40',
    ...o,
  });

  it('reproduces the reference sentence', () => {
    expect(finalSentence(computeFinal(FINAL_EXAMPLE_VALUES))).toBe(
      'You will need a grade of 80.5 or higher on the final.',
    );
  });

  it('reads a plain number as itself and a letter as grade points', () => {
    expect(parseFinalGrade('88')).toEqual({ value: 88, isLetter: false });
    expect(parseFinalGrade('B+')).toEqual({ value: 3.3, isLetter: true });
    expect(parseFinalGrade('Z')).toBe(null);
    expect(parseFinalGrade('')).toBe(null);
  });

  it('answers in grade points when BOTH grades were letters', () => {
    const c = computeFinal(values({ current: 'B', want: 'B+' }));
    expect(c.gradePoints).toBe(true);
    expect(finalSentence(c)).toContain('(3.75)');
  });

  it('says when the target is already secured', () => {
    expect(finalSentence(computeFinal(values({ want: '50' })))).toContain('already secured');
  });

  it('says when the target is out of reach, naming the maximum', () => {
    const c = computeFinal(values({ want: '99', weight: '10' }));
    expect(finalSentence(c)).toContain('out of reach');
    expect(finalSentence(c)).toContain('100');
  });

  it('asks for every field, and holds the weight to a real share of the course', () => {
    const empty = errors(validateFinal({ current: '', want: '', weight: '' }));
    expect(Object.keys(empty).sort()).toEqual(['current', 'want', 'weight']);
    expect(errors(validateFinal(values({ weight: '0' }))).weight).toBe(MSG.weightPercent);
    expect(errors(validateFinal(values({ weight: '140' }))).weight).toBe(MSG.weightPercent);
    expect(errors(validateFinal(values({ current: 'Z' }))).current).toBe(MSG.numberRequired);
  });

  it('gates on a coherent input, not on whether the answer is reachable', () => {
    expect(completeFinalValue(computeFinal(FINAL_EXAMPLE_VALUES))).toBeCloseTo(80.5, 10);
    expect(Number.isFinite(completeFinalValue(computeFinal(values({ want: '99', weight: '10' }))))).toBe(true);
    expect(completeFinalValue(computeFinal(values({ weight: '0' })))).toBeNaN();
  });
});

describe('the worked examples', () => {
  it('are the reference transcripts, and both solve', () => {
    expect(validateGrade(GRADE_EXAMPLE_VALUES).ok).toBe(true);
    expect(formatAverageGrade(computeGrade(GRADE_EXAMPLE_VALUES).average)).toBe('B+ (3.21)');
    expect(validateFinal(FINAL_EXAMPLE_VALUES).ok).toBe(true);
    expect(completeFinalValue(computeFinal(FINAL_EXAMPLE_VALUES))).toBeCloseTo(80.5, 10);
  });
});
