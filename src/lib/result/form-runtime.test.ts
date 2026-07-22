import { describe, it, expect } from 'vitest';
import {
  planFormAction,
  isLiveActive,
  isResultUsable,
  INITIAL_FORM_STATE,
  createResultDescriptionTracker,
  type FormMachineState,
  type FormProbe,
  type FormCalculatorBinding,
  type RecalculationMode,
} from './form-runtime';

/**
 * The standard-form runtime's DECISION logic is pure, so it is pinned here
 * without a DOM (the DOM wiring is covered end-to-end on the live BMI page).
 * These tests hold the contract every standard-form calculator depends on: the
 * first-calculation gate, live-after-first, the recalculation modes, reset,
 * non-finite protection, and which announcement / focus each situation yields.
 */

const S = (
  state: FormMachineState['status']['state'],
  activity: FormMachineState['status']['activity'],
  hasCalculated: boolean,
): FormMachineState => ({ status: { state, activity }, hasCalculated });

const OK: FormProbe = { validation: { ok: true }, resultUsable: true };
const NON_FINITE: FormProbe = { validation: { ok: true }, resultUsable: false };
const INVALID: FormProbe = {
  validation: { ok: false, fieldErrors: { heightCm: 'Enter your height.' } },
  resultUsable: false,
};
const opts = (recalculationMode: RecalculationMode) => ({ recalculationMode });

/* ------------------------------------------------------------------ */
/* Initial + helpers                                                   */
/* ------------------------------------------------------------------ */

describe('INITIAL_FORM_STATE', () => {
  it('is empty, idle and not yet calculated', () => {
    expect(INITIAL_FORM_STATE).toEqual({ status: { state: 'empty', activity: 'idle' }, hasCalculated: false });
  });
});

describe('isLiveActive', () => {
  it('is off before the first calc in live-after-first, on after', () => {
    expect(isLiveActive('live-after-first', false)).toBe(false);
    expect(isLiveActive('live-after-first', true)).toBe(true);
  });
  it('is always on for always-live and always off for explicit', () => {
    expect(isLiveActive('always-live', false)).toBe(true);
    expect(isLiveActive('explicit', true)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Explicit submission                                                 */
/* ------------------------------------------------------------------ */

describe('planFormAction — submit', () => {
  it('valid submission computes, announces the value, reveals the result and gates live on', () => {
    const plan = planFormAction(INITIAL_FORM_STATE, { kind: 'submit' }, OK, opts('live-after-first'));
    expect(plan.next).toEqual({ status: { state: 'valid', activity: 'just-updated' }, hasCalculated: true });
    expect(plan.effects.compute).toBe(true);
    expect(plan.effects.announce).toBe('value');
    expect(plan.effects.focus).toBe('revealResult');
    expect(plan.effects.liveNote).toBe(true);
    expect(plan.effects.fieldErrors).toBe('clear');
  });

  it('explicit mode shows no auto-update note even after a valid calc', () => {
    const plan = planFormAction(INITIAL_FORM_STATE, { kind: 'submit' }, OK, opts('explicit'));
    expect(plan.effects.liveNote).toBe(false);
  });

  it('invalid submission does not compute, announces an error and focuses the first invalid field', () => {
    const plan = planFormAction(INITIAL_FORM_STATE, { kind: 'submit' }, INVALID, opts('live-after-first'));
    expect(plan.next.status.state).toBe('invalid');
    expect(plan.next.hasCalculated).toBe(false); // never counts as a first calc
    expect(plan.effects.compute).toBe(false);
    expect(plan.effects.announce).toBe('error');
    expect(plan.effects.focus).toBe('firstInvalid');
    expect(plan.effects.fieldErrors).toBe('apply');
  });

  it('protects against a non-finite result from otherwise-valid inputs', () => {
    const plan = planFormAction(INITIAL_FORM_STATE, { kind: 'submit' }, NON_FINITE, opts('live-after-first'));
    expect(plan.next.status.state).toBe('invalid');
    expect(plan.effects.compute).toBe(false); // never render NaN/∞
    expect(plan.effects.announce).toBe('error');
    expect(plan.effects.focus).toBe('none'); // no specific field is at fault
  });

  it('recovers invalid → valid on the next successful submission', () => {
    const invalid = planFormAction(INITIAL_FORM_STATE, { kind: 'submit' }, INVALID, opts('live-after-first')).next;
    const plan = planFormAction(invalid, { kind: 'submit' }, OK, opts('live-after-first'));
    expect(plan.next).toEqual({ status: { state: 'valid', activity: 'just-updated' }, hasCalculated: true });
  });

  it('keeps the auto-update note once calculated, even on a later invalid submit', () => {
    const plan = planFormAction(S('valid', 'idle', true), { kind: 'submit' }, INVALID, opts('live-after-first'));
    expect(plan.effects.liveNote).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* First-calc gate + live-after-first                                  */
/* ------------------------------------------------------------------ */

describe('planFormAction — input (live gate)', () => {
  it('does nothing before the first successful calculation (live-after-first)', () => {
    const plan = planFormAction(INITIAL_FORM_STATE, { kind: 'input' }, OK, opts('live-after-first'));
    expect(plan.next).toEqual(INITIAL_FORM_STATE);
    expect(plan.effects.compute).toBe(false);
    expect(plan.effects.announce).toBe('none');
  });

  it('updates automatically after the first calc, announcing once, without moving focus', () => {
    const plan = planFormAction(S('valid', 'idle', true), { kind: 'input' }, OK, opts('live-after-first'));
    expect(plan.next.status).toEqual({ state: 'valid', activity: 'just-updated' });
    expect(plan.effects.compute).toBe(true);
    expect(plan.effects.announce).toBe('value');
    expect(plan.effects.focus).toBe('none'); // live updates never move focus/scroll
  });

  it('switches to invalid guidance on a live edit that becomes invalid, without stealing focus', () => {
    const plan = planFormAction(S('valid', 'idle', true), { kind: 'input' }, INVALID, opts('live-after-first'));
    expect(plan.next.status.state).toBe('invalid');
    expect(plan.effects.compute).toBe(false); // drop the stale value
    expect(plan.effects.announce).toBe('error');
    expect(plan.effects.focus).toBe('none');
    expect(plan.effects.fieldErrors).toBe('apply');
  });

  it('recovers invalid → valid automatically once the live edit is valid again', () => {
    const plan = planFormAction(S('invalid', 'idle', true), { kind: 'input' }, OK, opts('live-after-first'));
    expect(plan.next.status).toEqual({ state: 'valid', activity: 'just-updated' });
    expect(plan.effects.compute).toBe(true);
  });

  it('explicit mode never live-updates on input', () => {
    const plan = planFormAction(S('valid', 'idle', true), { kind: 'input' }, OK, opts('explicit'));
    expect(plan.effects.compute).toBe(false);
    expect(plan.next.status.state).toBe('valid'); // unchanged
  });

  it('always-live computes on input even before an explicit calc', () => {
    const plan = planFormAction(INITIAL_FORM_STATE, { kind: 'input' }, OK, opts('always-live'));
    expect(plan.effects.compute).toBe(true);
    expect(plan.next).toEqual({ status: { state: 'valid', activity: 'just-updated' }, hasCalculated: true });
  });
});

/* ------------------------------------------------------------------ */
/* Unit change (structural)                                            */
/* ------------------------------------------------------------------ */

describe('planFormAction — unit change', () => {
  it('is structural-only before the first calc: never computes or announces', () => {
    const plan = planFormAction(INITIAL_FORM_STATE, { kind: 'unit' }, OK, opts('live-after-first'));
    expect(plan.effects.compute).toBe(false);
    expect(plan.effects.announce).toBe('none');
    expect(plan.next).toEqual(INITIAL_FORM_STATE);
  });

  it('recalculates live after the first calc', () => {
    const plan = planFormAction(S('valid', 'idle', true), { kind: 'unit' }, OK, opts('live-after-first'));
    expect(plan.effects.compute).toBe(true);
    expect(plan.effects.focus).toBe('none');
    expect(plan.next.status.state).toBe('valid');
  });
});

/* ------------------------------------------------------------------ */
/* Reset                                                               */
/* ------------------------------------------------------------------ */

describe('planFormAction — reset', () => {
  it('returns to empty, clears values and errors, drops the note, and does not announce', () => {
    const plan = planFormAction(S('valid', 'just-updated', true), { kind: 'reset' }, null, opts('live-after-first'));
    expect(plan.next).toEqual({ status: { state: 'empty', activity: 'idle' }, hasCalculated: false });
    expect(plan.effects.clearValues).toBe(true);
    expect(plan.effects.fieldErrors).toBe('clear');
    expect(plan.effects.liveNote).toBe(false);
    expect(plan.effects.announce).toBe('none');
    expect(plan.effects.compute).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Per-instance result-description tracker (R7C-2D.1)                   */
/* ------------------------------------------------------------------ */

describe('createResultDescriptionTracker', () => {
  it('the first result is a first-result phase with no previous result', () => {
    const t = createResultDescriptionTracker<number>();
    expect(t.context()).toEqual({ phase: 'first-result' });
  });

  it('after a committed result, subsequent contexts are live-update with that previous result', () => {
    const t = createResultDescriptionTracker<number>();
    t.commit(10);
    expect(t.context()).toEqual({ phase: 'live-update', previousResult: 10 });
    t.commit(20);
    expect(t.context()).toEqual({ phase: 'live-update', previousResult: 20 });
  });

  it('reset forgets the previous result — the next result is a first result again', () => {
    const t = createResultDescriptionTracker<number>();
    t.commit(10);
    t.reset();
    expect(t.context()).toEqual({ phase: 'first-result' });
  });

  it('two trackers are fully isolated — commit/reset on one never affects the other', () => {
    const a = createResultDescriptionTracker<number>();
    const b = createResultDescriptionTracker<number>();
    a.commit(1);
    // b is untouched by a's commit…
    expect(b.context()).toEqual({ phase: 'first-result' });
    b.commit(2);
    expect(a.context()).toEqual({ phase: 'live-update', previousResult: 1 });
    // …and resetting one leaves the other intact.
    a.reset();
    expect(a.context()).toEqual({ phase: 'first-result' });
    expect(b.context()).toEqual({ phase: 'live-update', previousResult: 2 });
  });

  it('an invalid update (no commit) leaves the last valid previous result intact', () => {
    const t = createResultDescriptionTracker<number>();
    t.commit(42);
    // A subsequent invalid update simply does not call commit — the previous is kept.
    expect(t.context()).toEqual({ phase: 'live-update', previousResult: 42 });
    expect(t.context()).toEqual({ phase: 'live-update', previousResult: 42 });
  });
});

/* ------------------------------------------------------------------ */
/* Usability gate — valid non-numeric result extension (R8B1)          */
/* ------------------------------------------------------------------ */

// A minimal binding whose only members the gate consults are `resultValue`
// (here the identity of the computed number) and the optional `isUsableResult`.
// Everything else is a trivial stub — the gate never touches it.
const gateBinding = (
  isUsableResult?: (r: number) => boolean,
): FormCalculatorBinding<Record<string, never>, number> => ({
  readValues: () => ({}),
  validate: () => ({ ok: true }),
  compute: () => 0,
  renderResult: () => {},
  describeResult: () => '',
  resultValue: (r) => r,
  ...(isUsableResult ? { isUsableResult } : {}),
  resetValues: () => {},
});

describe('isResultUsable — the usability gate', () => {
  it('default gate (no hook): a finite primary value is usable, including zero', () => {
    expect(isResultUsable(gateBinding(), 386.66)).toBe(true);
    expect(isResultUsable(gateBinding(), 0)).toBe(true); // zero is a real result, not "empty"
  });

  it('default gate (no hook): a non-finite primary value is NOT usable (historical behaviour)', () => {
    expect(isResultUsable(gateBinding(), NaN)).toBe(false);
    expect(isResultUsable(gateBinding(), Infinity)).toBe(false);
    expect(isResultUsable(gateBinding(), -Infinity)).toBe(false);
  });

  it('a binding may WIDEN the gate to accept a deliberately non-finite informational result', () => {
    // The Payment "Never" outcome: the primary magnitude is Infinity, yet the
    // result is a meaningful informational answer the binding marks usable.
    expect(isResultUsable(gateBinding(() => true), Infinity)).toBe(true);
  });

  it('a binding may NARROW the gate to reject a malformed result even when finite', () => {
    expect(isResultUsable(gateBinding(() => false), 42)).toBe(false);
  });

  it('the hook fully overrides the default finite guard in both directions', () => {
    expect(isResultUsable(gateBinding(() => true), NaN)).toBe(true); // hook true wins over NaN
    expect(isResultUsable(gateBinding(() => false), 123)).toBe(false); // hook false wins over finite
  });
});
