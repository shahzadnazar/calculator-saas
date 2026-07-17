/**
 * Single source of truth for brand + site-wide metadata.
 *
 * Everything that identifies the brand (name, domain, social handles, default
 * SEO copy) lives here so it can be changed in exactly one place. Pages, the
 * SEO head, structured data, the sitemap and the footer all read from this.
 */

export interface SiteConfig {
  /** Public brand name, e.g. shown in the header and <title> suffix. */
  readonly name: string;
  /** Legal/entity name used in structured data + copyright. */
  readonly legalName: string;
  /** Canonical origin, no trailing slash. Change here to rebrand the domain. */
  readonly url: string;
  /** Short tagline used under the logo and in Organization schema. */
  readonly tagline: string;
  /** Default meta description when a page does not supply its own. */
  readonly description: string;
  /** Public contact email shown on contact/legal pages. */
  readonly contactEmail: string;
  /** Default social share image (absolute path from site root). */
  readonly defaultOgImage: string;
  /** Primary brand color (hex) used for theme-color + OG rendering. */
  readonly themeColor: string;
  /** BCP-47 locale for <html lang> and OpenGraph. */
  readonly locale: string;
  readonly social: {
    readonly twitter?: string; // handle without @, for twitter:site
    readonly github?: string;
  };
}

export const SITE: SiteConfig = {
  name: 'AllCalculators',
  legalName: 'AllCalculators',
  // Canonical domain. If the registered domain differs, change ONLY this line.
  url: 'https://allcalculators.com',
  tagline: 'Every calculator you need, in one place.',
  contactEmail: 'hello@allcalculators.com',
  description:
    'Free online calculators for finance, health, math, and everyday life. Fast, accurate, mobile-friendly, and ad-light — no sign-up required.',
  defaultOgImage: '/og/default.png',
  themeColor: '#2563eb',
  locale: 'en_US',
  social: {
    twitter: 'allcalculators',
  },
};

/** Absolute URL helper. Accepts a root-relative path and returns a full URL. */
export function absoluteUrl(path = '/'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE.url}${normalized === '/' ? '/' : normalized.replace(/\/$/, '')}`;
}
