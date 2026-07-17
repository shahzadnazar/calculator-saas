// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Canonical site URL. Kept in sync with src/config/site.ts (SITE.url).
// Declared here as a literal because astro.config is loaded before app code
// and drives absolute URLs in the generated sitemap + canonical tags.
const SITE_URL = 'https://allcalculators.com';

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
    sitemap({
      filter: (page) => !page.includes('/404'),
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
