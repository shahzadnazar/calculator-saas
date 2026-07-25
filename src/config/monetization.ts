/**
 * Unified monetization configuration — every revenue stream in one place.
 *
 * PRINCIPLE: trust first, revenue second. EVERYTHING here is OFF (or empty) by
 * default. Nothing degrades UX, adds layout shift, or collects data until it is
 * deliberately enabled. The architecture is ready; activation is a config flip
 * once traffic, trust and (where relevant) approvals are in place.
 *
 * See docs/MONETIZATION.md for the strategy, activation thresholds and the UX
 * guardrails each stream must respect.
 */

/* ---------------------------------------------------------------- */
/* 1. Display ads                                                    */
/* ---------------------------------------------------------------- */
export type AdPlacement = 'in-content' | 'below-tool' | 'sidebar';

export interface AdConfig {
  enabled: boolean;
  /** e.g. AdSense publisher id 'ca-pub-XXXXXXXXXXXXXXXX'. */
  publisherId?: string;
  /** Reserve slot height even when disabled? Keep false to avoid blank space. */
  reserveSpaceWhenDisabled: boolean;
  /** Lazy-load ad units below the fold to protect LCP/CLS. */
  lazyLoad: boolean;
  /** Hard cap on ad units per page — density guardrail for UX + RPM balance. */
  maxUnitsPerPage: number;
}

export const ADS: AdConfig = {
  enabled: false,
  publisherId: undefined,
  reserveSpaceWhenDisabled: false,
  lazyLoad: true,
  maxUnitsPerPage: 2,
};

/* ---------------------------------------------------------------- */
/* 2. Affiliate marketing (highest near-term commercial-intent lever) */
/* ---------------------------------------------------------------- */
export interface AffiliateConfig {
  enabled: boolean;
  /** FTC-compliant disclosure shown wherever partner links appear. */
  disclosure: string;
  /** rel attribute applied to every partner link. */
  linkRel: string;
}

export const AFFILIATE: AffiliateConfig = {
  enabled: false,
  disclosure:
    'Some links below are partner links. If you use them we may earn a commission at no extra cost to you. It never affects our calculators or what we recommend.',
  linkRel: 'sponsored nofollow noopener',
};

/* ---------------------------------------------------------------- */
/* 3. Email marketing (owned audience → return visitors)             */
/* ---------------------------------------------------------------- */
export interface NewsletterConfig {
  enabled: boolean;
  /** Form POST endpoint from your provider (Buttondown, ConvertKit, etc.). */
  actionUrl?: string;
  heading: string;
  blurb: string;
}

export const NEWSLETTER: NewsletterConfig = {
  enabled: false,
  actionUrl: undefined,
  heading: 'Get one useful calculator or guide a week',
  blurb: 'No spam, no clutter — just practical tools. Unsubscribe anytime.',
};

/* ---------------------------------------------------------------- */
/* 4. Privacy-friendly analytics (measure RPM, CTR, dwell, returns)  */
/* ---------------------------------------------------------------- */
export interface AnalyticsConfig {
  enabled: boolean;
  /** 'plausible' | 'umami' | 'ga4' etc. Cookieless preferred for trust. */
  provider?: string;
  siteId?: string;
  scriptSrc?: string;
}

export const ANALYTICS: AnalyticsConfig = {
  enabled: false,
  provider: undefined,
  siteId: undefined,
  scriptSrc: undefined,
};

/* ---------------------------------------------------------------- */
/* 5+. Roadmap streams — architecture placeholders, activated later  */
/* ---------------------------------------------------------------- */
export interface StreamFlag {
  enabled: boolean;
  note: string;
}

/** Premium tools: freemium extras (PDF export, saved history, ad-free). */
export const PREMIUM: StreamFlag = { enabled: false, note: 'Requires payments + entitlement checks (edge function).' };
/** Membership/accounts: sync, history, ad-free. */
export const MEMBERSHIP: StreamFlag = { enabled: false, note: 'Requires auth backend.' };
/** Direct sponsorships of calculators/guides (disclosed like affiliate). */
export const SPONSORSHIPS: StreamFlag = { enabled: false, note: 'Uses the disclosed offer slot with sponsored=true.' };
/** Digital products: templates, printables, ebooks. */
export const DIGITAL_PRODUCTS: StreamFlag = { enabled: false, note: 'Static product pages + a checkout provider.' };
/** Public API: the pure, tested calc logic in src/lib/calculators is API-ready. */
export const PUBLIC_API: StreamFlag = { enabled: false, note: 'Expose src/lib/calculators via serverless functions.' };
/** Embeddable widgets / white-label (also builds backlinks → authority). */
export const EMBEDDABLE: StreamFlag = { enabled: true, note: 'iframe/script embed of islands; each embed carries an attribution backlink → authority + brand.' };

/* ---------------------------------------------------------------- */
/* 6. Central monetization-region configuration (R5)                 */
/* ---------------------------------------------------------------- */
/**
 * The single source of placement decisions for the higher-level
 * `MonetizationRegion` orchestrator. EVERYTHING is disabled: `enabled: false`
 * globally and per placement, so no region renders on any live page. The
 * pure resolvers live in `src/lib/monetization/policy.ts`; the internal
 * `/dev/monetization` demo supplies its own config to showcase states. Types
 * are imported type-only to avoid a runtime cycle with the policy module.
 *
 * R5 is architecture only — CalculatorLayout integration is R6, and every
 * placement stays off until traffic, trust and (where relevant) a consent
 * vendor + provider are in place. Defaults below document the INTENDED module
 * and reservation/consent settings for each placement, not an activation.
 */
import type { MonetizationConfig } from '@lib/monetization/policy';

export const MONETIZATION_CONFIG: MonetizationConfig = {
  enabled: false,
  placements: {
    'calculator-sidebar': {
      enabled: false,
      module: 'ad',
      reserveSpace: true,
      retainReservationOnNoFill: true,
      lazy: true,
      requiresConsent: 'advertising',
    },
    'calculator-post-result': {
      enabled: false,
      module: 'affiliate',
      reserveSpace: false,
      requiresConsent: 'none',
    },
    'calculator-in-content': {
      enabled: false,
      module: 'ad',
      reserveSpace: true,
      retainReservationOnNoFill: true,
      lazy: true,
      requiresConsent: 'advertising',
    },
    'related-tools': {
      enabled: false,
      module: 'embed',
      reserveSpace: false,
      requiresConsent: 'none',
    },
    'home-after-dashboard': {
      enabled: false,
      module: 'sponsored',
      reserveSpace: false,
      requiresConsent: 'none',
    },
    'category-between-groups': {
      enabled: false,
      module: 'ad',
      reserveSpace: true,
      lazy: true,
      requiresConsent: 'advertising',
    },
    'guide-in-content': {
      enabled: false,
      module: 'affiliate',
      reserveSpace: false,
      requiresConsent: 'none',
    },
    footer: {
      enabled: false,
      module: 'premium',
      reserveSpace: false,
      requiresConsent: 'none',
    },
  },
};
