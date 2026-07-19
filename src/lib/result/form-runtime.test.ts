import { describe, it, expect } from 'vitest';
import {
  planFormAction,
  isLiveActive,
  INITIAL_FORM_STATE,
  type FormMachineState,
  type FormProbe,
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

const OK: FormProbe = { validation: { ok: true }, resultFinite: true };
const NON_FINITE: FormProbe = { validation: { ok: true }, resultFinite: false };
const INVALID: FormProbe = {
  validation: { ok: false, fieldErrors: { heightCm: 'Enter your height.' } },
  resultFinite: false,
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
