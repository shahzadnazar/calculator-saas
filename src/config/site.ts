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

/**
 * The wordmark, split for two-tone rendering: the leading capitalised word, then the rest.
 *
 * The logo used to hard-code "All" + "Calculators", which meant renaming the brand needed an
 * edit in a component as well as here — exactly the kind of second place this file exists to
 * prevent. Derived from `SITE.name`, so the name above stays the only thing to change.
 * A single-word name returns an empty tail and simply renders in one colour.
 */
export function wordmarkParts(name: string = SITE.name): { lead: string; tail: string } {
  const m = /^([A-Z][a-z0-9]*)(.*)$/.exec(name);
  return m ? { lead: m[1], tail: m[2] } : { lead: name, tail: '' };
}

export const SITE: SiteConfig = {
  name: 'BestCalculate',
  legalName: 'BestCalculate',
  // Canonical domain. If the registered domain differs, change ONLY this line.
  url: 'https://bestcalculate.com',
  tagline: 'Calculate anything instantly',
  contactEmail: 'hello@bestcalculate.com',
  description:
    'Free online calculators for finance, health, math, and everyday life. Fast, accurate, mobile-friendly, and ad-light — no sign-up required.',
  defaultOgImage: '/og/default.png',
  themeColor: '#2563eb',
  locale: 'en_US',
  social: {
    twitter: 'bestcalculate',
  },
};

/** Absolute URL helper. Accepts a root-relative path and returns a full URL. */
export function absoluteUrl(path = '/'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE.url}${normalized === '/' ? '/' : normalized.replace(/\/$/, '')}`;
}
