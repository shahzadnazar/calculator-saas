import { describe, it, expect } from 'vitest';
import {
  resolvePlacement,
  resultGateAllows,
  sidebarEligible,
  consentAllows,
  isStaticModule,
  disclosureLabel,
  noFillCollapses,
  reservesDimensions,
  sidebarFitsContainer,
  monetizationEvent,
  isSafeEventPayload,
  DENIED_CONSENT,
  type MonetizationConfig,
  type ConsentState,
} from './policy';
import { AFFILIATE } from '@config/monetization';

/**
 * The monetization-region policy is the decision core; these tests pin every
 * gate so the orchestrator (and future live integration) can trust it. R5 is
 * off by default — with no/blank config a placement is never permitted.
 */

const consent = (over: Partial<ConsentState> = {}): ConsentState => ({ ...DENIED_CONSENT, ...over });

const config = (): MonetizationConfig => ({
  enabled: true,
  placements: {
    'calculator-post-result': { enabled: true, module: 'affiliate', reserveSpace: false, requiresConsent: 'none' },
    'calculator-sidebar': {
      enabled: true,
      module: 'ad',
      reserveSpace: true,
      retainReservationOnNoFill: true,
      lazy: true,
      requiresConsent: 'advertising',
    },
    'calculator-in-content': {
      enabled: true,
      module: 'ad',
      reserveSpace: true,
      requiresConsent: 'advertising',
      allowedCategories: ['finance'],
      excludedSlugs: ['mortgage-calculator'],
    },
    footer: { enabled: false, module: 'premium', reserveSpace: false, requiresConsent: 'none' },
  },
});

/* ---- Global + placement gating ------------------------------------------ */

describe('resolvePlacement — enable gating', () => {
  it('blocks everything when globally disabled', () => {
    const c = { ...config(), enabled: false };
    expect(resolvePlacement(c, 'calculator-post-result').reason).toBe('globally-disabled');
    expect(resolvePlacement(c, 'calculator-post-result').permitted).toBe(false);
  });
  it('blocks a placement with no configuration', () => {
    expect(resolvePlacement(config(), 'guide-in-content').reason).toBe('placement-missing');
  });
  it('blocks a disabled placement', () => {
    expect(resolvePlacement(config(), 'footer').reason).toBe('placement-disabled');
  });
  it('permits an enabled, unrestricted placement (post-result needs a valid result)', () => {
    const r = resolvePlacement(config(), 'calculator-post-result', { resultState: 'valid' });
    expect(r.permitted).toBe(true);
    expect(r.reason).toBe('permitted');
    expect(r.module).toBe('affiliate');
  });
});

/* ---- Allowlists / exclusions -------------------------------------------- */

describe('resolvePlacement — allowlists and exclusions', () => {
  it('enforces a category allowlist', () => {
    const grant = consent({ advertising: true });
    expect(resolvePlacement(config(), 'calculator-in-content', { category: 'finance', consent: grant }).permitted).toBe(true);
    expect(resolvePlacement(config(), 'calculator-in-content', { category: 'health', consent: grant }).reason).toBe(
      'category-not-allowed',
    );
    // Missing category cannot satisfy an allowlist.
    expect(resolvePlacement(config(), 'calculator-in-content', { consent: grant }).reason).toBe('category-not-allowed');
  });
  it('enforces a slug exclusion', () => {
    const grant = consent({ advertising: true });
    expect(
      resolvePlacement(config(), 'calculator-in-content', { category: 'finance', slug: 'mortgage-calculator', consent: grant }).reason,
    ).toBe('slug-excluded');
  });
});

/* ---- Consent ------------------------------------------------------------ */

describe('consent', () => {
  it('none requires nothing; a specific requirement needs that grant', () => {
    expect(consentAllows('none', DENIED_CONSENT)).toBe(true);
    expect(consentAllows('advertising', DENIED_CONSENT)).toBe(false);
    expect(consentAllows('advertising', consent({ advertising: true }))).toBe(true);
  });
  it('blocks an advertising placement until advertising consent is granted', () => {
    expect(resolvePlacement(config(), 'calculator-sidebar', { allowSidebar: true }).reason).toBe('consent-denied');
    const r = resolvePlacement(config(), 'calculator-sidebar', { allowSidebar: true, consent: consent({ advertising: true }) });
    expect(r.permitted).toBe(true);
  });
});

/* ---- Result-state gating ------------------------------------------------ */

describe('result-state gating', () => {
  it('only post-result is result-gated', () => {
    expect(resultGateAllows('related-tools', 'empty')).toBe(true);
    expect(resultGateAllows('calculator-post-result', 'valid')).toBe(true);
  });
  it('post-result renders only for a fresh valid result', () => {
    for (const s of ['empty', 'example', 'invalid'] as const) {
      expect(resolvePlacement(config(), 'calculator-post-result', { resultState: s }).reason).toBe('result-state-blocked');
    }
    expect(resolvePlacement(config(), 'calculator-post-result', { resultState: 'valid', resultIsStale: true }).reason).toBe(
      'stale-result-blocked',
    );
    expect(resolvePlacement(config(), 'calculator-post-result', { resultState: 'valid', resultIsStale: false }).permitted).toBe(true);
  });
});

/* ---- Sidebar eligibility ------------------------------------------------ */

describe('sidebar eligibility', () => {
  it('is opt-in (default off) and non-sidebar placements are unaffected', () => {
    expect(sidebarEligible('calculator-sidebar', false)).toBe(false);
    expect(sidebarEligible('calculator-sidebar', true)).toBe(true);
    expect(sidebarEligible('footer', undefined)).toBe(true);
    expect(resolvePlacement(config(), 'calculator-sidebar', { consent: consent({ advertising: true }) }).reason).toBe(
      'sidebar-ineligible',
    );
  });
  it('requires a container wide enough for the full core workspace', () => {
    expect(sidebarFitsContainer({ workspaceWidth: 1040, calculatorWidth: 600 })).toBe(true);
    expect(sidebarFitsContainer({ workspaceWidth: 980, calculatorWidth: 600 })).toBe(false);
    expect(sidebarFitsContainer({ workspaceWidth: 1200, calculatorWidth: 560 })).toBe(false);
  });
});

/* ---- Reservation / collapse / static ------------------------------------ */

describe('slot reservation and no-fill policy', () => {
  it('ads reserve; static modules never reserve generic ad space', () => {
    expect(isStaticModule('ad')).toBe(false);
    expect(isStaticModule('affiliate')).toBe(true);
    expect(reservesDimensions({ reserveSpace: true, isStaticModule: false }, 'reserved')).toBe(true);
    expect(reservesDimensions({ reserveSpace: true, isStaticModule: false }, 'disabled')).toBe(false);
    expect(reservesDimensions({ reserveSpace: true, isStaticModule: true }, 'reserved')).toBe(false);
  });
  it('a visible reserved ad retains its reservation on no-fill; a static module collapses', () => {
    const ad = { isStaticModule: false, reserveSpace: true, retainReservationOnNoFill: true };
    expect(noFillCollapses(ad, true)).toBe(false); // seen → retain (no shift)
    expect(noFillCollapses(ad, false)).toBe(true); // lazy, unseen → collapse
    const affiliate = { isStaticModule: true, reserveSpace: false, retainReservationOnNoFill: false };
    expect(noFillCollapses(affiliate, true)).toBe(true);
  });
});

/* ---- Disclosure labels -------------------------------------------------- */

describe('disclosureLabel', () => {
  it('selects the correct disclosure per module kind', () => {
    expect(disclosureLabel('ad')).toBe('Advertisement');
    expect(disclosureLabel('affiliate')).toBe(AFFILIATE.disclosure);
    expect(disclosureLabel('sponsored')).toBe('Sponsored');
    expect(disclosureLabel('premium')).not.toMatch(/independent|editorial|unbiased/i); // never poses as neutral advice
  });
});

/* ---- Events carry no sensitive values ----------------------------------- */

describe('monetization events', () => {
  it('carry only placement/module/state — never input, result, query or password data', () => {
    const e = monetizationEvent('region-filled', 'calculator-post-result', 'affiliate', 'filled');
    expect(Object.keys(e).sort()).toEqual(['module', 'placement', 'state', 'type']);
    expect(isSafeEventPayload(e)).toBe(true);
  });
  it('rejects any payload carrying extra (potentially sensitive) keys', () => {
    expect(isSafeEventPayload({ type: 'x', placement: 'footer', module: 'ad', state: 'filled', query: 'bmi 30' })).toBe(false);
    expect(isSafeEventPayload({ type: 'x', value: 175 })).toBe(false);
  });
});
