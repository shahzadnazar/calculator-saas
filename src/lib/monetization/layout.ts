/**
 * Calculator-page monetization planning (R6) — pure, framework-agnostic.
 *
 * Turns a page's OPT-IN eligibility (`CalculatorMonetizationOptions`) together
 * with the central `MonetizationConfig` into a concrete per-placement plan for
 * `CalculatorLayout`. Page props express eligibility ONLY: every placement is
 * additionally gated by the global `enabled` flag AND the placement's own
 * `enabled` flag, so a page can never switch on a placement the central config
 * keeps off. With the production config (all off) every flag is `false`, so the
 * layout renders no region, no wrapper, no bridge and no monetization CSS — a
 * disabled page is byte-identical to one with no monetization at all.
 *
 * What is NOT decided here: consent (resolved per region by `resolvePlacement`)
 * and the post-result result-state gate (enforced on the client by the
 * result-state bridge). This module only decides which regions the layout may
 * ATTEMPT to render.
 */
import type { MonetizationConfig, MonetizationPlacement } from './policy';

/**
 * A calculator page's monetization opt-in. Every field defaults to off: it
 * expresses eligibility, never forces activation. No provider IDs, consent
 * state or result state pass through here — those are resolved centrally, so a
 * page cannot leak a provider id or bypass consent/result gating through props.
 */
export interface CalculatorMonetizationOptions {
  /** Offer the wide-container sidebar workspace (`calculator-sidebar`). */
  allowSidebar?: boolean;
  /** Offer a post-result region, revealed by the client only for a fresh valid result. */
  enablePostResult?: boolean;
  /** Offer an in-content region within the explainer prose (`calculator-in-content`). */
  enableInContent?: boolean;
  /** Offer a related-tools region near the related calculators (`related-tools`). */
  enableRelatedTools?: boolean;
  /** Override of the result-shell selector the client bridge observes. */
  resultSelector?: string;
}

/** The concrete decision the layout renders from. */
export interface CalculatorMonetizationPlan {
  sidebar: boolean;
  postResult: boolean;
  inContent: boolean;
  relatedTools: boolean;
  /** Any region may render → the layout emits its monetization scope + CSS. */
  active: boolean;
  /** The post-result region is active → the layout emits the result-state bridge. */
  bridge: boolean;
  /** Result-shell selector the bridge observes within the calculator scope. */
  resultSelector: string;
}

/** Default selector for the shared result primitive the bridge observes. */
export const DEFAULT_RESULT_SELECTOR = '[data-result-shell]';

export interface PlanInput {
  config: MonetizationConfig;
  options?: CalculatorMonetizationOptions;
  /**
   * Post-result requires a shared, client-observable result state. Only tools
   * migrated to the shared result runtime (task-first) expose one; legacy tools
   * do not, so they never get a post-result region even if a page opts in.
   */
  hasSharedResultState: boolean;
}

/** True only if the global config AND the specific placement are both enabled. */
export function placementLive(config: MonetizationConfig, placement: MonetizationPlacement): boolean {
  return config.enabled === true && config.placements[placement]?.enabled === true;
}

/**
 * Resolve a calculator page's monetization plan. Pure: same inputs → same plan,
 * no globals, no DOM. The AND with `placementLive` is what guarantees a disabled
 * central config produces an all-false plan (`active: false`).
 */
export function planCalculatorMonetization({ config, options, hasSharedResultState }: PlanInput): CalculatorMonetizationPlan {
  const o = options ?? {};

  const sidebar = o.allowSidebar === true && placementLive(config, 'calculator-sidebar');
  const postResult =
    o.enablePostResult === true && hasSharedResultState === true && placementLive(config, 'calculator-post-result');
  const inContent = o.enableInContent === true && placementLive(config, 'calculator-in-content');
  const relatedTools = o.enableRelatedTools === true && placementLive(config, 'related-tools');

  const active = sidebar || postResult || inContent || relatedTools;

  return {
    sidebar,
    postResult,
    inContent,
    relatedTools,
    active,
    bridge: postResult,
    resultSelector: o.resultSelector ?? DEFAULT_RESULT_SELECTOR,
  };
}
