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
  /** ISO date the tool's method was last reviewed (drives dateModified). */
  dateModified?: string;
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
    softwareVersion: '1.0',
    isAccessibleForFree: true,
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    publisher: { '@id': `${SITE.url}/#organization` },
    // NOTE: aggregateRating intentionally omitted — Google requires genuine
    // user ratings; fabricating them violates guidelines and our EEAT stance.
  };
}

/** Article schema for long-form guides (EEAT + rich results). */
export function articleSchema(opts: {
  title: string;
  description: string;
  path: string;
  authorName: string;
  datePublished: string; // ISO
  dateModified?: string; // ISO
  image?: string;
}): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.title,
    description: opts.description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(opts.path) },
    author: { '@type': 'Organization', name: opts.authorName, url: SITE.url },
    publisher: { '@id': `${SITE.url}/#organization` },
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    image: opts.image ? (opts.image.startsWith('http') ? opts.image : absoluteUrl(opts.image)) : absoluteUrl(SITE.defaultOgImage),
  };
}

/**
 * Dataset schema for a computed reference table.
 *
 * The reference pages are the one thing on this site that is genuinely a
 * dataset: every figure is produced at build time by the same unit-tested
 * functions that drive the calculators, not transcribed from somewhere. That is
 * also what makes them citable, and a citation is a link that needs nothing from
 * the person giving it — no iframe, no HTML access, no permission.
 *
 * Emitted ALONGSIDE Article rather than instead of it: the page is both a data
 * table and an explained one, and the Article carries the author and review
 * signals. The `distribution` points at the CSV, which is the part that makes
 * the declaration true rather than decorative — a Dataset nobody can download
 * is a claim, not a dataset.
 */
export function datasetSchema(opts: {
  name: string;
  description: string;
  path: string;
  /** ISO date the figures were last verified. */
  dateModified: string;
  /** Root-relative path of the machine-readable copy. */
  csvPath: string;
  /** Column headers, as the measured variables. */
  variables?: readonly string[];
}): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    isAccessibleForFree: true,
    creator: { '@id': `${SITE.url}/#organization` },
    publisher: { '@id': `${SITE.url}/#organization` },
    dateModified: opts.dateModified,
    ...(opts.variables?.length ? { variableMeasured: [...opts.variables] } : {}),
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'text/csv',
        contentUrl: absoluteUrl(opts.csvPath),
      },
    ],
  };
}

/**
 * CollectionPage schema for a topic hub — an ItemList of the member calculators.
 * Helps search engines understand the page as a curated collection.
 */
export function collectionPageSchema(opts: {
  name: string;
  description: string;
  path: string;
  items: { name: string; path: string }[];
}): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    isPartOf: { '@id': `${SITE.url}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: opts.items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: it.name,
        url: absoluteUrl(it.path),
      })),
    },
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
