import type { APIRoute } from 'astro';
import { buildSearchRecords, searchIndexVersion } from '@lib/search';

/**
 * Static, compact search index — built from the calculator registry at build
 * time and emitted as /search-index.json. Live calculators only; no
 * coming-soon entries, guides or reference pages.
 *
 * `version` is a deterministic content hash so the future client loader can
 * request `/search-index.json?v=<version>` for deployment-safe cache-busting.
 * The index is excluded from the sitemap (see astro.config.mjs).
 */
export const prerender = true;

export const GET: APIRoute = () => {
  const records = buildSearchRecords();
  const body = JSON.stringify({
    version: searchIndexVersion(records),
    count: records.length,
    records,
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
};
