import { describe, it, expect } from 'vitest';
import { shellEligible, pageEligible, type ResultShellSnapshot } from './result-bridge';

/**
 * The bridge predicates decide when the post-result region may show. They are
 * the same rule the inline layout script runs in the browser, pinned here so the
 * "fresh valid result only" gate cannot silently drift. A page qualifies when
 * ANY observed shell holds a fresh, valid, non-stale, settled result — which is
 * exactly the percentage tool's "≥1 equation" policy for its three shells.
 */

const snap = (over: Partial<ResultShellSnapshot> = {}): ResultShellSnapshot => ({
  state: 'valid',
  activity: 'idle',
  stale: false,
  ...over,
});

describe('shellEligible', () => {
  it('qualifies a fresh valid result (idle or just-updated)', () => {
    expect(shellEligible(snap({ activity: 'idle' }))).toBe(true);
    expect(shellEligible(snap({ activity: 'just-updated' }))).toBe(true);
  });

  it('withholds while a perceptible recompute is calculating', () => {
    expect(shellEligible(snap({ activity: 'calculating' }))).toBe(false);
  });

  it('withholds a stale generator output', () => {
    expect(shellEligible(snap({ stale: true }))).toBe(false);
  });

  it('withholds empty / example / invalid results', () => {
    for (const state of ['empty', 'example', 'invalid', null] as const) {
      expect(shellEligible(snap({ state }))).toBe(false);
    }
  });
});

describe('pageEligible', () => {
  it('is false with no shells', () => {
    expect(pageEligible([])).toBe(false);
  });

  it('is true when any single shell qualifies (percentage: any one equation)', () => {
    const shells = [
      snap({ state: 'empty' }),
      snap({ state: 'invalid' }),
      snap({ state: 'valid', activity: 'just-updated' }), // one fresh valid equation
    ];
    expect(pageEligible(shells)).toBe(true);
  });

  it('is false when every shell is ineligible (all empty / stale / calculating)', () => {
    const shells = [snap({ state: 'empty' }), snap({ stale: true }), snap({ activity: 'calculating' })];
    expect(pageEligible(shells)).toBe(false);
  });

  it('single-shell tools (BMI / password) qualify exactly when their one shell does', () => {
    expect(pageEligible([snap({ state: 'valid' })])).toBe(true);
    expect(pageEligible([snap({ state: 'valid', stale: true })])).toBe(false);
  });
});
