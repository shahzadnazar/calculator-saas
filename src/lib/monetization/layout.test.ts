import { describe, it, expect } from 'vitest';
import {
  planCalculatorMonetization,
  placementLive,
  DEFAULT_RESULT_SELECTOR,
  type CalculatorMonetizationOptions,
} from './layout';
import { MONETIZATION_CONFIG } from '@config/monetization';
import type { MonetizationConfig } from './policy';

/**
 * The layout planner is the server-side gate for R6. It turns a page's opt-in
 * plus the central config into a per-placement plan. The load-bearing property:
 * the production config (all off) yields an all-false plan, so CalculatorLayout
 * renders no region, no wrapper, no bridge and no CSS — a disabled page is
 * byte-identical to a pre-monetization build.
 */

// A fully-enabled config used to prove the plan reacts to opt-ins (never shipped).
const ON: MonetizationConfig = {
  enabled: true,
  placements: {
    'calculator-sidebar': { enabled: true, module: 'ad', reserveSpace: true, requiresConsent: 'advertising' },
    'calculator-post-result': { enabled: true, module: 'affiliate', reserveSpace: false, requiresConsent: 'none' },
    'calculator-in-content': { enabled: true, module: 'ad', reserveSpace: true, requiresConsent: 'advertising' },
    'related-tools': { enabled: true, module: 'embed', reserveSpace: false, requiresConsent: 'none' },
  },
};

const ALL_OPTS: CalculatorMonetizationOptions = {
  allowSidebar: true,
  enablePostResult: true,
  enableInContent: true,
  enableRelatedTools: true,
};

/* ---- The production default: everything off ----------------------------- */

describe('planCalculatorMonetization — production config (all off)', () => {
  it('yields an all-false plan even when a page opts into everything', () => {
    const plan = planCalculatorMonetization({
      config: MONETIZATION_CONFIG,
      options: ALL_OPTS,
      hasSharedResultState: true,
    });
    expect(plan).toMatchObject({
      sidebar: false,
      postResult: false,
      inContent: false,
      relatedTools: false,
      active: false,
      bridge: false,
    });
  });

  it('is all-false with no options at all', () => {
    const plan = planCalculatorMonetization({ config: MONETIZATION_CONFIG, hasSharedResultState: true });
    expect(plan.active).toBe(false);
    expect(plan.bridge).toBe(false);
  });
});

/* ---- placementLive: the AND gate ---------------------------------------- */

describe('placementLive', () => {
  it('is true only when the global config AND the placement are both enabled', () => {
    expect(placementLive(ON, 'calculator-post-result')).toBe(true);
    expect(placementLive({ ...ON, enabled: false }, 'calculator-post-result')).toBe(false);
    expect(placementLive(MONETIZATION_CONFIG, 'calculator-post-result')).toBe(false); // production: off
    // Missing placement configuration → not live.
    expect(placementLive({ enabled: true, placements: {} }, 'calculator-sidebar')).toBe(false);
  });
});

/* ---- Opt-in expresses eligibility only; cannot force activation ---------- */

describe('planCalculatorMonetization — opt-in gating', () => {
  it('activates a placement only when BOTH the config enables it and the page opts in', () => {
    const plan = planCalculatorMonetization({ config: ON, options: ALL_OPTS, hasSharedResultState: true });
    expect(plan).toMatchObject({ sidebar: true, postResult: true, inContent: true, relatedTools: true, active: true, bridge: true });
  });

  it('a page that does not opt in gets nothing, even with the config enabled', () => {
    const plan = planCalculatorMonetization({ config: ON, options: {}, hasSharedResultState: true });
    expect(plan.active).toBe(false);
  });

  it('each opt-in is independent', () => {
    const plan = planCalculatorMonetization({ config: ON, options: { enableRelatedTools: true }, hasSharedResultState: true });
    expect(plan).toMatchObject({ sidebar: false, postResult: false, inContent: false, relatedTools: true, active: true, bridge: false });
  });

  it('a globally-disabled config blocks everything regardless of opt-in', () => {
    const plan = planCalculatorMonetization({ config: { ...ON, enabled: false }, options: ALL_OPTS, hasSharedResultState: true });
    expect(plan.active).toBe(false);
  });

  it('an enabled global config but a disabled placement does not activate that placement', () => {
    const cfg: MonetizationConfig = { ...ON, placements: { ...ON.placements, 'related-tools': { enabled: false, module: 'embed', reserveSpace: false } } };
    const plan = planCalculatorMonetization({ config: cfg, options: ALL_OPTS, hasSharedResultState: true });
    expect(plan.relatedTools).toBe(false);
  });
});

/* ---- Post-result requires a shared, client-observable result state ------- */

describe('planCalculatorMonetization — post-result needs shared result state', () => {
  it('is withheld for legacy pages (no shared result state) even when opted in + enabled', () => {
    const plan = planCalculatorMonetization({ config: ON, options: { enablePostResult: true }, hasSharedResultState: false });
    expect(plan.postResult).toBe(false);
    expect(plan.bridge).toBe(false);
  });

  it('drives the bridge flag: bridge is true iff post-result is active', () => {
    const withResult = planCalculatorMonetization({ config: ON, options: { enablePostResult: true }, hasSharedResultState: true });
    expect(withResult.postResult).toBe(true);
    expect(withResult.bridge).toBe(true);
    // Related-tools alone activates the region set but needs no bridge.
    const noBridge = planCalculatorMonetization({ config: ON, options: { enableRelatedTools: true }, hasSharedResultState: true });
    expect(noBridge.active).toBe(true);
    expect(noBridge.bridge).toBe(false);
  });
});

/* ---- Result selector ---------------------------------------------------- */

describe('planCalculatorMonetization — result selector', () => {
  it('defaults to the shared result-shell selector and honours an override', () => {
    expect(planCalculatorMonetization({ config: ON, hasSharedResultState: true }).resultSelector).toBe(DEFAULT_RESULT_SELECTOR);
    expect(
      planCalculatorMonetization({ config: ON, options: { resultSelector: '#custom [data-result-shell]' }, hasSharedResultState: true }).resultSelector,
    ).toBe('#custom [data-result-shell]');
  });
});
