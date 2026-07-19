import { describe, it, expect } from 'vitest';
import {
  planGeneratorAction,
  INITIAL_GENERATOR_STATE,
  type GeneratorMachineState,
  type GeneratorProbe,
} from './generator-runtime';

/**
 * The generator runtime's decision logic is pure, so it is pinned here without a
 * DOM (Copy, clipboard, security and rendering are covered on the live Password
 * page). These tests hold the generator contract: explicit-generation gate,
 * stale-on-settings-change, Copy availability, reset, liveRegeneration default,
 * and which announcement each situation yields (never output content — the
 * planner only ever emits the tokens generated/stale/error/none).
 */

const S = (
  state: GeneratorMachineState['status']['state'],
  activity: GeneratorMachineState['status']['activity'],
  stale: boolean,
  hasGenerated: boolean,
): GeneratorMachineState => ({ status: { state, activity }, stale, hasGenerated });

const OK: GeneratorProbe = { validation: { ok: true } };
const INVALID: GeneratorProbe = {
  validation: { ok: false, fieldErrors: { charsets: 'Select at least one character type.' } },
};
const opts = (liveRegeneration = false, invalidateOutputOnSettingsChange = true) => ({
  liveRegeneration,
  invalidateOutputOnSettingsChange,
});

describe('INITIAL_GENERATOR_STATE', () => {
  it('is empty, not stale, not yet generated', () => {
    expect(INITIAL_GENERATOR_STATE).toEqual({
      status: { state: 'empty', activity: 'idle' },
      stale: false,
      hasGenerated: false,
    });
  });
});

describe('planGeneratorAction — generate', () => {
  it('a valid explicit generation produces output, enables Copy, relabels and announces', () => {
    const plan = planGeneratorAction(INITIAL_GENERATOR_STATE, { kind: 'generate' }, OK, opts());
    expect(plan.next).toEqual({ status: { state: 'valid', activity: 'just-updated' }, stale: false, hasGenerated: true });
    expect(plan.effects.generate).toBe(true);
    expect(plan.effects.announce).toBe('generated');
    expect(plan.effects.focus).toBe('revealOutput');
    expect(plan.effects.copyEnabled).toBe(true);
    expect(plan.effects.staleNote).toBe(false);
    expect(plan.effects.relabelGenerate).toBe(true);
  });

  it('an invalid generation does not produce output; Copy stays off, focus first invalid', () => {
    const plan = planGeneratorAction(INITIAL_GENERATOR_STATE, { kind: 'generate' }, INVALID, opts());
    expect(plan.next.status.state).toBe('invalid');
    expect(plan.effects.generate).toBe(false);
    expect(plan.effects.announce).toBe('error');
    expect(plan.effects.focus).toBe('firstInvalid');
    expect(plan.effects.copyEnabled).toBe(false);
    expect(plan.effects.fieldErrors).toBe('apply');
  });

  it('keeps the "Generate New" label after a later invalid generation', () => {
    const plan = planGeneratorAction(S('valid', 'idle', false, true), { kind: 'generate' }, INVALID, opts());
    expect(plan.effects.relabelGenerate).toBe(true); // has generated before
  });

  it('regenerating clears stale and re-enables Copy', () => {
    const stalePlan = planGeneratorAction(S('valid', 'idle', true, true), { kind: 'generate' }, OK, opts());
    expect(stalePlan.next.stale).toBe(false);
    expect(stalePlan.effects.copyEnabled).toBe(true);
    expect(stalePlan.effects.announce).toBe('generated');
  });
});

describe('planGeneratorAction — settings change', () => {
  it('does nothing before the first generation', () => {
    const plan = planGeneratorAction(INITIAL_GENERATOR_STATE, { kind: 'settingsChange' }, OK, opts());
    expect(plan.next).toEqual(INITIAL_GENERATOR_STATE);
    expect(plan.effects.generate).toBe(false);
    expect(plan.effects.announce).toBe('none');
    expect(plan.effects.copyEnabled).toBe(false);
  });

  it('marks a fresh output stale (kept visible, Copy off, note shown) and announces once', () => {
    const plan = planGeneratorAction(S('valid', 'idle', false, true), { kind: 'settingsChange' }, OK, opts());
    expect(plan.next).toEqual({ status: { state: 'valid', activity: 'idle' }, stale: true, hasGenerated: true });
    expect(plan.effects.generate).toBe(false); // never silently regenerate
    expect(plan.effects.announce).toBe('stale');
    expect(plan.effects.copyEnabled).toBe(false);
    expect(plan.effects.staleNote).toBe(true);
  });

  it('is a no-op once already stale (no repeat announcement)', () => {
    const plan = planGeneratorAction(S('valid', 'idle', true, true), { kind: 'settingsChange' }, OK, opts());
    expect(plan.next.stale).toBe(true);
    expect(plan.effects.announce).toBe('none');
    expect(plan.effects.copyEnabled).toBe(false);
    expect(plan.effects.staleNote).toBe(true);
  });

  it('does not invalidate when invalidateOutputOnSettingsChange is off', () => {
    const plan = planGeneratorAction(S('valid', 'idle', false, true), { kind: 'settingsChange' }, OK, opts(false, false));
    expect(plan.next.stale).toBe(false);
    expect(plan.effects.copyEnabled).toBe(true);
  });

  it('liveRegeneration regenerates on a settings change (opt-in, not the default)', () => {
    const plan = planGeneratorAction(S('valid', 'idle', false, true), { kind: 'settingsChange' }, OK, opts(true));
    expect(plan.effects.generate).toBe(true);
    expect(plan.effects.announce).toBe('generated');
  });
});

describe('planGeneratorAction — reset', () => {
  it('returns to empty, clears settings, disables Copy, restores the label, no announcement', () => {
    const plan = planGeneratorAction(S('valid', 'just-updated', true, true), { kind: 'reset' }, null, opts());
    expect(plan.next).toEqual({ status: { state: 'empty', activity: 'idle' }, stale: false, hasGenerated: false });
    expect(plan.effects.clearSettings).toBe(true);
    expect(plan.effects.copyEnabled).toBe(false);
    expect(plan.effects.staleNote).toBe(false);
    expect(plan.effects.relabelGenerate).toBe(false);
    expect(plan.effects.announce).toBe('none');
  });
});

describe('planGeneratorAction — announcements never carry content', () => {
  it('only ever emits the tokens generated | stale | error | none', () => {
    const seen = new Set<string>();
    const seeds = [
      INITIAL_GENERATOR_STATE,
      S('valid', 'idle', false, true),
      S('valid', 'idle', true, true),
      S('invalid', 'idle', false, true),
    ];
    const triggers = [{ kind: 'generate' }, { kind: 'settingsChange' }, { kind: 'reset' }] as const;
    for (const seed of seeds)
      for (const t of triggers) seen.add(planGeneratorAction(seed, t, OK, opts()).effects.announce);
    for (const a of seen) expect(['generated', 'stale', 'error', 'none']).toContain(a);
  });
});
