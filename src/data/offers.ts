/**
 * Affiliate / sponsor offer registry.
 *
 * EMPTY by default. Populate with genuinely relevant, high-quality partner
 * offers once you have affiliate relationships — keyed by "category/slug" for a
 * specific calculator (e.g. "finance/mortgage-calculator" → mortgage lenders) or
 * by "category" for a whole section. Offers only ever render when AFFILIATE is
 * enabled, and always with an FTC disclosure and rel="sponsored".
 *
 * Rule: an offer must be a genuinely useful next step for the user. Relevance
 * protects trust — and trust is what makes the revenue durable.
 */
import { AFFILIATE } from '@config/monetization';

export interface Offer {
  title: string;
  description: string;
  url: string;
  cta: string;
  /** True for direct sponsorships (labelled "Sponsored" vs "Partner"). */
  sponsored?: boolean;
}

// e.g. { 'finance/mortgage-calculator': [{ title: 'Compare mortgage rates', ... }] }
export const OFFERS: Record<string, Offer[]> = {};

/** Contextual offers for a calculator (specific first, then category). Max 3. */
export function getOffers(categorySlug: string, calcSlug?: string): Offer[] {
  if (!AFFILIATE.enabled) return [];
  const specific = calcSlug ? OFFERS[`${categorySlug}/${calcSlug}`] ?? [] : [];
  const category = OFFERS[categorySlug] ?? [];
  return [...specific, ...category].slice(0, 3);
}
