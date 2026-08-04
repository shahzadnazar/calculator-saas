import { describe, it, expect } from 'vitest';
import {
  validateGrade,
  computeGrade,
  completeGradeValue,
  presentGrade,
  describeGrade,
  finalStatus,
  gradeBinding,
  MSG,
  type GradeComputed,
  type GradeFormValues,
} from './grade-form';

/**
 * Grade form-binding tests (R16B2 Commit 2 — Academic follow-on, 2 of 2; multi-mode).
 * Exercise the VALIDATION / PRESENTATION boundary only — the pure engine
 * (weightedGrade / finalScoreNeeded) is unchanged and separately frozen by
 * grade.test.ts. Covers active-mode-only validation (hidden-mode fields ignored),
 * calculator-owned weighted rows, the final-needed reachability status, the
 * complete-result guard (NaN sentinel; NO isUsableResult), and presentation.
 */

const row = (id: string, score: string, weight: string) => ({ id, score, weight });
const avg = (...rows: Array<ReturnType<typeof row>>): GradeFormValues => ({ mode: 'average', rows, current: '', finalWeight: '', target: '' });
const fin = (current: string, finalWeight: string, target: string): GradeFormValues => ({ mode: 'final', rows: [], current, finalWeight, target });
const ok = (r: ReturnType<typeof validateGrade>) => r.ok === true;
const fe = (r: ReturnType<typeof validateGrade>, f: string) => (r as { fieldErrors?: Record<string, string> }).fieldErrors?.[f];
const formErr = (r: ReturnType<typeof validateGrade>) => (r as { formError?: string }).formError;
const rejects = (c: GradeComputed) => Number.isNaN(completeGradeValue(c));

/* ------------------------------------------------------------------ */
/* Contract + mode routing                                             */
/* ------------------------------------------------------------------ */

describe('grade binding — contract', () => {
  it('does NOT define isUsableResult (the guard lives in resultValue)', () => {
    expect(gradeBinding.isUsableResult).toBeUndefined();
    expect(gradeBinding.resultValue).toBe(completeGradeValue);
  });
  it('finalStatus derives the three regimes from the returned number', () => {
    expect(finalStatus(-10)).toBe('met');
    expect(finalStatus(0)).toBe('reachable');
    expect(finalStatus(92.5)).toBe('reachable');
    expect(finalStatus(100)).toBe('reachable');
    expect(finalStatus(101.67)).toBe('unreachable');
  });
  it('validates ONLY the active mode (hidden-mode fields ignored)', () => {
    expect(ok(validateGrade({ mode: 'average', rows: [row('r1', '90', '50')], current: 'abc', finalWeight: 'xyz', target: '' }))).toBe(true);
    expect(ok(validateGrade({ mode: 'final', rows: [row('r1', 'abc', 'xyz')], current: '80', finalWeight: '40', target: '85' }))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Weighted-average validation                                         */
/* ------------------------------------------------------------------ */

describe('grade binding — weighted-average validation', () => {
  it('a single blank row is a form-level error', () => {
    expect(formErr(validateGrade(avg(row('r1', '', ''))))).toBe(MSG.noItems);
  });
  it('a partial row errors on the missing field', () => {
    expect(fe(validateGrade(avg(row('r1', '90', ''))), 'weight-r1')).toBe(MSG.weightRequired);
    expect(fe(validateGrade(avg(row('r1', '', '50'))), 'score-r1')).toBe(MSG.scoreRequired);
  });
  it('malformed score / weight and a negative weight are row errors (0 weight is valid non-contributing)', () => {
    expect(fe(validateGrade(avg(row('r1', 'abc', '50'))), 'score-r1')).toBe(MSG.scoreInvalid);
    for (const bad of ['abc', 'Infinity', '-1']) {
      expect(fe(validateGrade(avg(row('r1', '90', bad))), 'weight-r1')).toBe(MSG.weightInvalid);
    }
    expect(fe(validateGrade(avg(row('r1', '90', '0'), row('r2', '80', '50'))), 'weight-r1')).toBeUndefined();
  });
  it('all-zero weights are a form-level error; one valid row passes', () => {
    expect(formErr(validateGrade(avg(row('r1', '90', '0'), row('r2', '80', '0'))))).toBe(MSG.noItems);
    expect(ok(validateGrade(avg(row('r1', '90', '50'))))).toBe(true);
    expect(ok(validateGrade(avg(row('r1', '90', '50'), row('r2', '', ''))))).toBe(true); // empty ignored
  });
});

/* ------------------------------------------------------------------ */
/* Final-needed validation                                            */
/* ------------------------------------------------------------------ */

describe('grade binding — final-needed validation', () => {
  it('accepts a well-formed final-needed set', () => {
    expect(ok(validateGrade(fin('80', '40', '85')))).toBe(true);
  });
  it('every field is required', () => {
    expect(fe(validateGrade(fin('', '40', '85')), 'current')).toBe(MSG.currentRequired);
    expect(fe(validateGrade(fin('80', '', '85')), 'finalWeight')).toBe(MSG.finalWeightRequired);
    expect(fe(validateGrade(fin('80', '40', '')), 'target')).toBe(MSG.targetRequired);
  });
  it('final weight must be in (0, 100]; 0, negative, > 100 and garbage are range errors', () => {
    for (const bad of ['0', '-10', '150', 'abc']) {
      expect(fe(validateGrade(fin('80', bad, '85')), 'finalWeight')).toBe(MSG.finalWeightRange);
    }
    expect(ok(validateGrade(fin('80', '100', '85')))).toBe(true); // 100 valid
  });
  it('current and target must be finite and non-negative', () => {
    expect(fe(validateGrade(fin('-1', '40', '85')), 'current')).toBe(MSG.currentInvalid);
    expect(fe(validateGrade(fin('80', '40', '-1')), 'target')).toBe(MSG.targetInvalid);
  });
});

/* ------------------------------------------------------------------ */
/* Computation + guard                                                 */
/* ------------------------------------------------------------------ */

describe('grade binding — computation + complete-result guard', () => {
  it('weighted mode computes as weightedGrade and reconciles', () => {
    const c = computeGrade(avg(row('r1', '90', '50'), row('r2', '80', '50')));
    expect(c.mode).toBe('average');
    if (c.mode !== 'average') return;
    expect(c.result.grade).toBeCloseTo(85, 10);
    expect(c.result.totalWeight).toBe(100);
    expect(completeGradeValue(c)).toBeCloseTo(85, 10);
  });
  it('final mode returns the finite required score for all three regimes (met / reachable / unreachable)', () => {
    expect(completeGradeValue(computeGrade(fin('80', '40', '85')))).toBeCloseTo(92.5, 10); // reachable
    expect(completeGradeValue(computeGrade(fin('90', '20', '70')))).toBeCloseTo(-10, 10); // already met, still finite/valid
    expect(completeGradeValue(computeGrade(fin('85', '30', '90')))).toBeCloseTo(101.6667, 3); // unreachable, still finite/valid
  });
  it('rejects an empty weighted result and tampered weighted totals', () => {
    expect(rejects(computeGrade(avg(row('r1', '', ''))))).toBe(true);
    const good = computeGrade(avg(row('r1', '90', '50'), row('r2', '80', '50')));
    if (good.mode !== 'average') return;
    expect(rejects({ ...good, result: { ...good.result, totalWeight: good.result.totalWeight + 5 } })).toBe(true);
    expect(rejects({ ...good, result: { ...good.result, grade: good.result.grade + 5 } })).toBe(true);
    expect(rejects({ ...good, result: { ...good.result, totalWeight: 0 } })).toBe(true);
  });
  it('rejects a tampered final result and an out-of-range final weight', () => {
    const good = computeGrade(fin('80', '40', '85'));
    if (good.mode !== 'final') return;
    expect(rejects({ ...good, needed: good.needed + 5 })).toBe(true);
    expect(rejects({ ...good, finalWeight: 0 })).toBe(true);
    expect(rejects({ ...good, finalWeight: 150 })).toBe(true);
    expect(rejects({ ...good, current: -1 })).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Presentation + announcement                                        */
/* ------------------------------------------------------------------ */

describe('grade binding — presentation', () => {
  it('weighted mode: label, value, total weight, and a normalization note only when the total ≠ 100', () => {
    const p100 = presentGrade(computeGrade(avg(row('r1', '80', '20'), row('r2', '75', '30'), row('r3', '90', '50'))));
    expect(p100.label).toBe('Weighted grade');
    expect(p100.value).toBe('83.5%');
    expect(p100.secondaryValue).toBe('100');
    expect(p100.interpretation).not.toContain('normalized');
    const pNorm = presentGrade(computeGrade(avg(row('r1', '90', '25'), row('r2', '70', '25'))));
    expect(pNorm.value).toBe('80%');
    expect(pNorm.interpretation).toContain('normalized');
  });
  it('final reachable: the score is the primary with a target secondary', () => {
    const p = presentGrade(computeGrade(fin('80', '40', '85')));
    expect(p.label).toBe('Required final score');
    expect(p.value).toBe('92.5%');
    expect(p.secondaryValue).toBe('85%');
    expect(p.interpretation).toContain('at least 92.5%');
  });
  it('final already-met and unreachable show a clear status, not a raw percentage', () => {
    const met = presentGrade(computeGrade(fin('90', '20', '70')));
    expect(met.value).toBe('Already met');
    expect(met.interpretation).toContain('already reached');
    const un = presentGrade(computeGrade(fin('85', '30', '90')));
    expect(un.value).toBe('Not reachable');
    expect(un.interpretation).toContain('not possible');
  });
  it('describeGrade announces the active-mode result concisely', () => {
    expect(describeGrade(computeGrade(avg(row('r1', '90', '50'), row('r2', '80', '50'))))).toBe('Weighted grade: 85 percent.');
    expect(describeGrade(computeGrade(fin('80', '40', '85')))).toBe('Required final score: 92.5 percent.');
    expect(describeGrade(computeGrade(fin('90', '20', '70')))).toBe('You have already reached your target.');
    expect(describeGrade(computeGrade(fin('85', '30', '90')))).toBe('That target is not reachable with the final alone.');
  });
});

/* ------------------------------------------------------------------ */
/* readValues / resetValues (mock DOM)                                 */
/* ------------------------------------------------------------------ */

describe('grade binding — readValues / resetValues', () => {
  const mockRoot = (data: { mode: string; rows: Array<{ id: string; score: string; weight: string }>; current: string; finalWeight: string; target: string }) => {
    const makeRow = (d: { id: string; score: string; weight: string }) => {
      const score = { value: d.score };
      const weight = { value: d.weight };
      const el = {
        dataset: { rowId: d.id },
        querySelector: (sel: string) => (sel.includes('data-grade-score') ? score : sel.includes('data-grade-weight') ? weight : null),
        remove() {
          const i = list.indexOf(el);
          if (i >= 0) list.splice(i, 1);
        },
      };
      return el;
    };
    const list = data.rows.map(makeRow);
    const fields: Record<string, { value: string }> = { current: { value: data.current }, finalWeight: { value: data.finalWeight }, target: { value: data.target } };
    return {
      querySelector: (sel: string) => {
        if (sel.includes('gmode') && sel.includes(':checked')) return { value: data.mode };
        const m = /\[name="([^"]+)"\]/.exec(sel);
        return m && fields[m[1]] ? fields[m[1]] : null;
      },
      querySelectorAll: (sel: string) => (sel.includes('data-grade-row') ? [...list] : []),
      __fields: fields,
    } as unknown as HTMLElement & { __fields: Record<string, { value: string }> };
  };

  it('reads the active mode, rows and final fields', () => {
    const root = mockRoot({ mode: 'final', rows: [row('r1', '90', '50')], current: '88', finalWeight: '30', target: '90' });
    expect(gradeBinding.readValues(root)).toEqual({
      mode: 'final',
      rows: [{ id: 'r1', score: '90', weight: '50' }],
      current: '88',
      finalWeight: '30',
      target: '90',
    });
  });
  it('reset collapses to one blank row and clears final fields', () => {
    const root = mockRoot({ mode: 'average', rows: [row('r1', '90', '50'), row('r2', '80', '50')], current: '88', finalWeight: '30', target: '90' });
    gradeBinding.resetValues(root, 'personal');
    const after = gradeBinding.readValues(root);
    expect(after.rows).toEqual([{ id: 'r1', score: '', weight: '' }]);
    expect(after.current).toBe('');
    expect(after.finalWeight).toBe('');
    expect(after.target).toBe('');
  });
});
