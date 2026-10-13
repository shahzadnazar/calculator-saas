// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { lastmodSerializer } from './scripts/lastmod.mjs';

// Canonical site URL. Kept in sync with src/config/site.ts (SITE.url).
// Declared here as a literal because astro.config is loaded before app code
// and drives absolute URLs in the generated sitemap + canonical tags.
const SITE_URL = 'https://bestcalculate.com';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'never',
  build: {
    // Emit clean URLs: /calculators/scientific instead of /.../index.html
    format: 'file',
    inlineStylesheets: 'auto',
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  integrations: [
    mdx(),
    sitemap({
      // Exclude 404, the chrome-less iframe embed pages, the dev routes, and the
      // JSON search index (a data asset, not a page).
      //
      // The embed exclusion matches the ROUTES, not the path prefix. Every
      // chrome-less embed lives two segments deep — /embed/<category>/<slug>
      // and /embed/reference/<slug> — and is noindex with a canonical pointing
      // at its parent, so it must never appear here. One segment deep are the
      // two embed HUBS: /embed and /embed/gallery. Both are ordinary indexable
      // pages with their own copy, their own description and a self-canonical,
      // and `includes('/embed/')` was silently dropping the gallery — 3,358
      // words, the only indexable page on the site missing from the sitemap.
      filter: (page) =>
        !page.includes('/404') &&
        !/\/embed\/[^/]+\/[^/]+/.test(page) &&
        !page.includes('/dev/') &&
        !page.includes('/search-index') &&
        // The reference tables' machine-readable copies. Linked from their page
        // and declared in its Dataset schema; not pages in their own right.
        !page.endsWith('.csv'),
      // Google ignores changefreq and priority and acts on lastmod, so the one
      // that matters is added per URL from the page's own reviewed/updated date
      // (see scripts/lastmod.mjs). The other two are kept because they cost
      // nothing and other crawlers still read them.
      changefreq: 'weekly',
      priority: 0.7,
      serialize: lastmodSerializer(SITE_URL),
    }),
  ],
  vite: {
    // Cast avoids a type-only clash between Astro's bundled Vite and the Vite
    // that @tailwindcss/vite resolves; runtime behavior is unaffected.
    plugins: [/** @type {any} */ (tailwindcss())],
  },
});
