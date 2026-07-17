/**
 * Monetization configuration.
 *
 * Ads are OFF by default: an ad-light experience is a competitive advantage and
 * a prerequisite for the trust an authority site needs. When you are approved
 * for a network, set `ads.enabled = true` and fill in the publisher id. Every
 * <AdSlot> across the site then activates from this one switch — no page edits.
 */

export interface AdConfig {
  enabled: boolean;
  /** e.g. AdSense publisher id 'ca-pub-XXXXXXXXXXXXXXXX'. */
  publisherId?: string;
  /** Reserve slot height even when disabled? Keep false to avoid blank space. */
  reserveSpaceWhenDisabled: boolean;
}

export const ADS: AdConfig = {
  enabled: false,
  publisherId: undefined,
  reserveSpaceWhenDisabled: false,
};

/** Named placements let us tune density/format per position later. */
export type AdPlacement = 'in-content' | 'below-tool' | 'sidebar';
