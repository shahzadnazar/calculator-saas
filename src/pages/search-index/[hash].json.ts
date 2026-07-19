import type { APIRoute, GetStaticPaths } from 'astro';
import { buildSearchRecords, searchIndexVersion, SEARCH_INDEX_VERSION } from '@lib/search';
import { getPopularCalculatorIds } from '@data/popular-calculators';

/**
 * Fingerprinted static search index — emitted at /search-index/<content-hash>.json.
 * Live calculators only; no coming-soon entries, guides or reference pages.
 *
 * The hash in the path is derived from the searchable/displayed content, so the
 * URL changes whenever that content changes. The search component receives the
 * exact URL (SEARCH_INDEX_URL) as a build-time prop — deployment-safe cache
 * invalidation with no reliance on CDN purge. The whole /search-index/ path is
 * excluded from the sitemap (astro.config.mjs). `popularIds` is delivered
 * alongside but kept separate from per-record ranking metadata.
 */
export const prerender = true;

export const getStaticPaths: GetStaticPaths = () => [{ params: { hash: SEARCH_INDEX_VERSION } }];

export const GET: APIRoute = () => {
  const records = buildSearchRecords();
  const body = JSON.stringify({
    version: searchIndexVersion(records),
    count: records.length,
    records,
    popularIds: getPopularCalculatorIds(),
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Fingerprinted URL → immutable; any content change ships a brand-new URL.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
