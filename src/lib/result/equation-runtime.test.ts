import { describe, it, expect } from 'vitest';
import {
  planEquationAction,
  isLiveActive,
  INITIAL_EQUATION_STATE,
  type EquationMachineState,
  type EquationProbe,
  type RecalculationMode,
} from './equation-runtime';

/**
 * The equation runtime's decision logic is pure, so it is pinned here without a
 * DOM (per-instance DOM behaviour is covered on the live Percentage page). Each
 * equation instance carries its OWN state, so these transitions describe one
 * equation in isolation — the independence guarantee is that nothing here reads
 * or writes shared state.
 */

const S = (
  state: EquationMachineState['status']['state'],
  activity: EquationMachineState['status']['activity'],
  hasCalculated: boolean,
): EquationMachineState => ({ status: { state, activity }, hasCalculated });

const OK: EquationProbe = { validation: { ok: true }, resultFinite: true };
const NON_FINITE: EquationProbe = { validation: { ok: true }, resultFinite: false };
const INVALID: EquationProbe = {
  validation: { ok: false, fieldErrors: { whole: 'The total value must not be zero.' } },
  resultFinite: false,
};
const opts = (recalculationMode: RecalculationMode) => ({ recalculationMode });

describe('INITIAL_EQUATION_STATE', () => {
  it('is empty, idle and not yet calculated', () => {
    expect(INITIAL_EQUATION_STATE).toEqual({ status: { state: 'empty', activity: 'idle' }, hasCalculated: false });
  });
});

describe('isLiveActive', () => {
  it('gates live on the first calculation for live-after-first', () => {
    expect(isLiveActive('live-after-first', false)).toBe(false);
    expect(isLiveActive('live-after-first', true)).toBe(true);
    expect(isLiveActive('always-live', false)).toBe(true);
    expect(isLiveActive('explicit', true)).toBe(false);
  });
});

describe('planEquationAction — submit', () => {
  it('a valid first calculation computes, announces and reveals the result', () => {
    const plan = planEquationAction(INITIAL_EQUATION_STATE, { kind: 'submit' }, OK, opts('live-after-first'));
    expect(plan.next).toEqual({ status: { state: 'valid', activity: 'just-updated' }, hasCalculated: true });
    expect(plan.effects.compute).toBe(true);
    expect(plan.effects.announce).toBe('value');
    expect(plan.effects.focus).toBe('revealResult');
    expect(plan.effects.liveNote).toBe(true);
  });

  it('an invalid submission announces the error and focuses the first invalid input', () => {
    const plan = planEquationAction(INITIAL_EQUATION_STATE, { kind: 'submit' }, INVALID, opts('live-after-first'));
    expect(plan.next.status.state).toBe('invalid');
    expect(plan.next.hasCalculated).toBe(false);
    expect(plan.effects.compute).toBe(false);
    expect(plan.effects.announce).toBe('error');
    expect(plan.effects.focus).toBe('firstInvalid');
    expect(plan.effects.fieldErrors).toBe('apply');
  });

  it('protects against a non-finite result (division by zero) from valid-looking inputs', () => {
    const plan = planEquationAction(INITIAL_EQUATION_STATE, { kind: 'submit' }, NON_FINITE, opts('live-after-first'));
    expect(plan.next.status.state).toBe('invalid');
    expect(plan.effects.compute).toBe(false);
    expect(plan.effects.focus).toBe('none');
  });

  it('recovers invalid → valid on the next successful submit', () => {
    const invalid = planEquationAction(INITIAL_EQUATION_STATE, { kind: 'submit' }, INVALID, opts('live-after-first')).next;
    const plan = planEquationAction(invalid, { kind: 'submit' }, OK, opts('live-after-first'));
    expect(plan.next).toEqual({ status: { state: 'valid', activity: 'just-updated' }, hasCalculated: true });
  });

  it('explicit mode never shows the auto-update note', () => {
    const plan = planEquationAction(INITIAL_EQUATION_STATE, { kind: 'submit' }, OK, opts('explicit'));
    expect(plan.effects.liveNote).toBe(false);
  });
});

describe('planEquationAction — input (live gate)', () => {
  it('does nothing before the first successful calculation', () => {
    const plan = planEquationAction(INITIAL_EQUATION_STATE, { kind: 'input' }, OK, opts('live-after-first'));
    expect(plan.next).toEqual(INITIAL_EQUATION_STATE);
    expect(plan.effects.compute).toBe(false);
    expect(plan.effects.announce).toBe('none');
  });

  it('updates automatically after the first calc without moving focus', () => {
    const plan = planEquationAction(S('valid', 'idle', true), { kind: 'input' }, OK, opts('live-after-first'));
    expect(plan.next.status).toEqual({ state: 'valid', activity: 'just-updated' });
    expect(plan.effects.compute).toBe(true);
    expect(plan.effects.announce).toBe('value');
    expect(plan.effects.focus).toBe('none');
  });

  it('drops a stale value when a live edit becomes invalid, and recovers', () => {
    const toInvalid = planEquationAction(S('valid', 'idle', true), { kind: 'input' }, INVALID, opts('live-after-first'));
    expect(toInvalid.next.status.state).toBe('invalid');
    expect(toInvalid.effects.compute).toBe(false);
    expect(toInvalid.effects.focus).toBe('none');
    const recovered = planEquationAction(toInvalid.next, { kind: 'input' }, OK, opts('live-after-first'));
    expect(recovered.next.status).toEqual({ state: 'valid', activity: 'just-updated' });
  });

  it('explicit mode never live-updates; always-live computes immediately', () => {
    expect(planEquationAction(S('valid', 'idle', true), { kind: 'input' }, OK, opts('explicit')).effects.compute).toBe(false);
    expect(planEquationAction(INITIAL_EQUATION_STATE, { kind: 'input' }, OK, opts('always-live')).effects.compute).toBe(true);
  });
});

describe('planEquationAction — reset', () => {
  it('returns to empty, clears operands + errors, drops the note, no announcement', () => {
    const plan = planEquationAction(S('valid', 'just-updated', true), { kind: 'reset' }, null, opts('live-after-first'));
    expect(plan.next).toEqual({ status: { state: 'empty', activity: 'idle' }, hasCalculated: false });
    expect(plan.effects.clearOperands).toBe(true);
    expect(plan.effects.fieldErrors).toBe('clear');
    expect(plan.effects.liveNote).toBe(false);
    expect(plan.effects.announce).toBe('none');
  });
});

describe('planEquationAction — dismissExample', () => {
  const EXAMPLE = S('example', 'idle', false);

  it('the explicit action leaves the example for empty and hands over the first operand', () => {
    const plan = planEquationAction(EXAMPLE, { kind: 'dismissExample', source: 'action' }, null, opts('live-after-first'));
    expect(plan.next).toEqual({ status: { state: 'empty', activity: 'idle' }, hasCalculated: false });
    expect(plan.effects.focus).toBe('firstField');
    expect(plan.effects.compute).toBe(false);
    expect(plan.effects.announce).toBe('none');
    expect(plan.effects.liveNote).toBe(false);
    expect(plan.effects.clearOperands).toBe(false);
  });

  it('dismissal by typing goes to empty WITHOUT moving focus mid-keystroke', () => {
    const plan = planEquationAction(EXAMPLE, { kind: 'dismissExample', source: 'input' }, null, opts('live-after-first'));
    expect(plan.next).toEqual({ status: { state: 'empty', activity: 'idle' }, hasCalculated: false });
    expect(plan.effects.focus).toBe('none');
    expect(plan.effects.clearOperands).toBe(false);
  });

  it('does not open the live gate — the first calculation stays explicit', () => {
    const plan = planEquationAction(EXAMPLE, { kind: 'dismissExample', source: 'input' }, null, opts('live-after-first'));
    expect(isLiveActive('live-after-first', plan.next.hasCalculated)).toBe(false);
  });

  it('is a no-op from every other state, so it can never wipe a real result', () => {
    for (const state of [S('valid', 'just-updated', true), S('invalid', 'idle', true), INITIAL_EQUATION_STATE]) {
      const plan = planEquationAction(state, { kind: 'dismissExample', source: 'action' }, null, opts('live-after-first'));
      expect(plan.next).toEqual(state);
      expect(plan.effects.compute).toBe(false);
      expect(plan.effects.clearOperands).toBe(false);
      expect(plan.effects.focus).toBe('none');
    }
  });

  it('dismissing one equation is planned from ITS state alone — neighbours are untouched', () => {
    const dismissed = planEquationAction(EXAMPLE, { kind: 'dismissExample', source: 'action' }, null, opts('live-after-first'));
    const neighbour = S('example', 'idle', false);
    expect(dismissed.next.status.state).toBe('empty');
    expect(neighbour.status.state).toBe('example'); // unmutated by planning A
  });
});

describe('planEquationAction — instance independence', () => {
  it('is a pure function of the passed state — one instance never affects another', () => {
    const a = S('valid', 'idle', true);
    const b = INITIAL_EQUATION_STATE;
    // Planning an action for instance A returns A's next state and does not
    // mutate A or reference B.
    const planA = planEquationAction(a, { kind: 'input' }, OK, opts('live-after-first'));
    expect(a).toEqual({ status: { state: 'valid', activity: 'idle' }, hasCalculated: true }); // unmutated
    expect(planA.next).not.toBe(a);
    // Instance B, given the same trigger, is gated (its own hasCalculated=false).
    const planB = planEquationAction(b, { kind: 'input' }, OK, opts('live-after-first'));
    expect(planB.next).toEqual(INITIAL_EQUATION_STATE);
  });
});
