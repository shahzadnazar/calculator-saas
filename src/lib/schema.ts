/**
 * JSON-LD structured data builders.
 *
 * Centralising schema generation keeps every page's structured data valid and
 * consistent, and makes it trivial to extend site-wide (e.g. add sameAs links
 * or ratings later). All builders return plain objects ready for JSON.stringify.
 */
import { SITE, absoluteUrl } from '@config/site';

type Schema = Record<string, unknown>;

/** Organization schema — emitted site-wide for brand entity recognition. */
export function organizationSchema(): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE.url}/#organization`,
    name: SITE.legalName,
    url: SITE.url,
    description: SITE.tagline,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/logo.png'),
    },
  };
}

/** WebSite schema with a Sitelinks Search Box action. */
export function webSiteSchema(): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    publisher: { '@id': `${SITE.url}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE.url}/calculators?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** BreadcrumbList from an ordered list of {name, path} crumbs. */
export function breadcrumbSchema(crumbs: { name: string; path: string }[]): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

/**
 * WebApplication schema for a calculator tool. Communicates to search engines
 * that the page is a free, browser-based utility (eligible for rich results).
 */
export function calculatorSchema(opts: {
  name: string;
  description: string;
  path: string;
}): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    applicationCategory: 'UtilityApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript.',
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    publisher: { '@id': `${SITE.url}/#organization` },
  };
}

/** FAQPage schema from question/answer pairs (answers are plain text). */
export function faqSchema(faqs: { question: string; answer: string }[]): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    })),
  };
}
