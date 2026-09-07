// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

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
      // Exclude 404, the chrome-less iframe embed pages (/embed/<cat>/<slug>,
      // which are noindex), the dev routes, and the JSON search index (a data
      // asset, not a page). The indexable /embed landing page is kept.
      filter: (page) =>
        !page.includes('/404') &&
        !page.includes('/embed/') &&
        !page.includes('/dev/') &&
        !page.includes('/search-index'),
      changefreq: 'weekly',
      priority: 0.7,
    }),
  ],
  vite: {
    // Cast avoids a type-only clash between Astro's bundled Vite and the Vite
    // that @tailwindcss/vite resolves; runtime behavior is unaffected.
    plugins: [/** @type {any} */ (tailwindcss())],
  },
});
