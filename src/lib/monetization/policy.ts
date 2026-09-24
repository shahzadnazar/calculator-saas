/**
 * Monetization-region policy (R5) — pure, framework-agnostic resolvers.
 *
 * This is the decision core the `MonetizationRegion` orchestrator uses to decide
 * IF a placement may render, WHICH revenue module, in WHAT slot state, with what
 * disclosure and reservation/collapse behaviour. It renders nothing and knows
 * nothing about the DOM. Everything is OFF by default (trust first, revenue
 * second): with no central config a placement resolves to not-permitted.
 *
 * SCOPE: R5 is architecture only. No placement is wired into a live layout, no
 * real provider or consent vendor is integrated, and consent defaults to denied.
 */
import { AFFILIATE } from '@config/monetization';
import { SITE } from '@config/site';

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/* ------------------------------------------------------------------ */

export type MonetizationPlacement =
  | 'calculator-sidebar'
  | 'calculator-post-result'
  | 'calculator-in-content'
  | 'related-tools'
  | 'home-after-dashboard'
  | 'category-between-groups'
  | 'guide-in-content'
  | 'footer';

export type RevenueModuleKind = 'ad' | 'affiliate' | 'sponsored' | 'premium' | 'embed' | 'api' | 'lead';

export type MonetizationSlotState = 'disabled' | 'reserved' | 'loading' | 'filled' | 'no-fill' | 'failed';

export type ResultState = 'empty' | 'example' | 'valid' | 'invalid';

export interface ConsentState {
  advertising: boolean;
  analytics: boolean;
  personalization: boolean;
  leadGeneration: boolean;
}

/** Which consent a placement needs, or 'none' for contextual internal modules. */
export type ConsentRequirement = keyof ConsentState | 'none';

/** All consent denied — the R5 default. */
export const DENIED_CONSENT: ConsentState = {
  advertising: false,
  analytics: false,
  personalization: false,
  leadGeneration: false,
};

export interface PlacementConfiguration {
  enabled: boolean;
  module: RevenueModuleKind;
  reserveSpace: boolean;
  retainReservationOnNoFill?: boolean;
  collapseBeforeRequest?: boolean;
  lazy?: boolean;
  requiresConsent?: ConsentRequirement;
  allowedCategories?: string[];
  allowedSlugs?: string[];
  excludedSlugs?: string[];
}

export interface MonetizationConfig {
  enabled: boolean;
  placements: Partial<Record<MonetizationPlacement, PlacementConfiguration>>;
}

export interface PlacementContext {
  category?: string;
  slug?: string;
  resultState?: ResultState;
  resultIsStale?: boolean;
  allowSidebar?: boolean;
  consent?: ConsentState;
}

export type PlacementDecisionReason =
  | 'permitted'
  | 'globally-disabled'
  | 'placement-missing'
  | 'placement-disabled'
  | 'category-not-allowed'
  | 'slug-not-allowed'
  | 'slug-excluded'
  | 'result-state-blocked'
  | 'stale-result-blocked'
  | 'sidebar-ineligible'
  | 'consent-denied';

export interface ResolvedPlacement {
  permitted: boolean;
  reason: PlacementDecisionReason;
  module: RevenueModuleKind | null;
  requiresConsent: ConsentRequirement;
  consentGranted: boolean;
  reserveSpace: boolean;
  retainReservationOnNoFill: boolean;
  collapseBeforeRequest: boolean;
  lazy: boolean;
  disclosure: string;
  /** Static modules collapse fully when unavailable; ads reserve. */
  isStaticModule: boolean;
}

/* ------------------------------------------------------------------ */
/* Small pure predicates                                               */
/* ------------------------------------------------------------------ */

export function consentAllows(requirement: ConsentRequirement, consent: ConsentState): boolean {
  if (requirement === 'none') return true;
  return consent[requirement] === true;
}

/** Only `calculator-post-result` is result-gated: valid AND not stale. */
export function resultGateAllows(
  placement: MonetizationPlacement,
  resultState?: ResultState,
  resultIsStale?: boolean,
): boolean {
  if (placement !== 'calculator-post-result') return true;
  return resultState === 'valid' && resultIsStale !== true;
}

/** Sidebar is opt-in per calculator; container-size eligibility is a CSS concern. */
export function sidebarEligible(placement: MonetizationPlacement, allowSidebar?: boolean): boolean {
  if (placement !== 'calculator-sidebar') return true;
  return allowSidebar === true;
}

/** Ads reserve dimensions; every other module kind is static (collapses fully). */
export function isStaticModule(kind: RevenueModuleKind): boolean {
  return kind !== 'ad';
}

export function disclosureLabel(kind: RevenueModuleKind): string {
  switch (kind) {
    case 'ad':
      return 'Advertisement';
    case 'affiliate':
      return AFFILIATE.disclosure;
    case 'sponsored':
      return 'Sponsored';
    case 'premium':
      return `${SITE.name} Plus`; // internal product — labelled, never "independent recommendation"
    case 'embed':
      return 'Embed this tool';
    case 'api':
      return `${SITE.name} API`;
    case 'lead':
      return 'Get a quote';
  }
}

/* ------------------------------------------------------------------ */
/* Central resolution                                                  */
/* ------------------------------------------------------------------ */

export function resolvePlacement(
  config: MonetizationConfig,
  placement: MonetizationPlacement,
  ctx: PlacementContext = {},
): ResolvedPlacement {
  const pc = config.placements[placement];
  const consent = ctx.consent ?? DENIED_CONSENT;
  const requiresConsent: ConsentRequirement = pc?.requiresConsent ?? 'none';

  const decide = (reason: PlacementDecisionReason, permitted = false): ResolvedPlacement => ({
    permitted,
    reason,
    module: pc?.module ?? null,
    requiresConsent,
    consentGranted: consentAllows(requiresConsent, consent),
    reserveSpace: pc?.reserveSpace ?? false,
    retainReservationOnNoFill: pc?.retainReservationOnNoFill ?? false,
    collapseBeforeRequest: pc?.collapseBeforeRequest ?? false,
    lazy: pc?.lazy ?? false,
    disclosure: pc ? disclosureLabel(pc.module) : '',
    isStaticModule: pc ? isStaticModule(pc.module) : true,
  });

  if (!config.enabled) return decide('globally-disabled');
  if (!pc) return decide('placement-missing');
  if (!pc.enabled) return decide('placement-disabled');

  if (pc.allowedCategories && !(ctx.category != null && pc.allowedCategories.includes(ctx.category))) {
    return decide('category-not-allowed');
  }
  if (pc.allowedSlugs && !(ctx.slug != null && pc.allowedSlugs.includes(ctx.slug))) {
    return decide('slug-not-allowed');
  }
  if (pc.excludedSlugs && ctx.slug != null && pc.excludedSlugs.includes(ctx.slug)) {
    return decide('slug-excluded');
  }

  if (!resultGateAllows(placement, ctx.resultState, ctx.resultIsStale)) {
    const stale = ctx.resultState === 'valid' && ctx.resultIsStale === true;
    return decide(stale ? 'stale-result-blocked' : 'result-state-blocked');
  }

  if (!sidebarEligible(placement, ctx.allowSidebar)) return decide('sidebar-ineligible');

  if (!consentAllows(requiresConsent, consent)) return decide('consent-denied');

  return decide('permitted', true);
}

/* ------------------------------------------------------------------ */
/* Slot-state behaviour                                                */
/* ------------------------------------------------------------------ */

/**
 * Whether a no-fill / failed slot should COLLAPSE (true) or RETAIN its
 * reservation (false). A visible reserved ad retains (collapsing would shift
 * layout); a lazy below-fold slot not yet seen collapses; static modules
 * collapse fully.
 */
export function noFillCollapses(resolved: Pick<ResolvedPlacement, 'isStaticModule' | 'reserveSpace' | 'retainReservationOnNoFill'>, seen: boolean): boolean {
  if (resolved.isStaticModule) return true;
  if (resolved.reserveSpace && resolved.retainReservationOnNoFill && seen) return false;
  return true;
}

/** Whether a slot should reserve dimensions in the given state. */
export function reservesDimensions(resolved: Pick<ResolvedPlacement, 'reserveSpace' | 'isStaticModule'>, state: MonetizationSlotState): boolean {
  if (resolved.isStaticModule) return false; // static modules never reserve generic ad space
  if (state === 'disabled') return false;
  return resolved.reserveSpace;
}

/* ------------------------------------------------------------------ */
/* Sidebar container eligibility (numeric; mirrored by container queries) */
/* ------------------------------------------------------------------ */

export const SIDEBAR_THRESHOLDS = {
  workspaceMin: 1040,
  calculatorMin: 600,
  sidebarWidth: 300,
  gapMin: 24,
} as const;

export interface WorkspaceMetrics {
  workspaceWidth: number;
  calculatorWidth: number;
}

/** The container is wide enough to add a sidebar without compressing the core. */
export function sidebarFitsContainer(m: WorkspaceMetrics): boolean {
  return m.workspaceWidth >= SIDEBAR_THRESHOLDS.workspaceMin && m.calculatorWidth >= SIDEBAR_THRESHOLDS.calculatorMin;
}

/* ------------------------------------------------------------------ */
/* Analytics events (no data leaves; no sensitive values)              */
/* ------------------------------------------------------------------ */

export type MonetizationEventType =
  | 'region-eligible'
  | 'region-rendered'
  | 'region-filled'
  | 'region-no-fill'
  | 'module-clicked';

export interface MonetizationEvent {
  type: MonetizationEventType;
  placement: MonetizationPlacement;
  module: RevenueModuleKind | null;
  state: MonetizationSlotState;
}

/** Build an event carrying ONLY safe, non-sensitive fields. */
export function monetizationEvent(
  type: MonetizationEventType,
  placement: MonetizationPlacement,
  module: RevenueModuleKind | null,
  state: MonetizationSlotState,
): MonetizationEvent {
  return { type, placement, module, state };
}

const ALLOWED_EVENT_KEYS = new Set(['type', 'placement', 'module', 'state']);

/** True only if the payload carries exclusively the allowed, non-sensitive keys. */
export function isSafeEventPayload(payload: unknown): boolean {
  if (payload == null || typeof payload !== 'object') return false;
  return Object.keys(payload as Record<string, unknown>).every((k) => ALLOWED_EVENT_KEYS.has(k));
}
