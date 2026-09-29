/**
 * Per-URL `lastmod` values for the sitemap.
 *
 * Google ignores `<changefreq>` and `<priority>` and has said so publicly;
 * `<lastmod>` is the one hint it acts on, and on a domain with no index history
 * it is the main lever for getting a page recrawled after an edit. The sitemap
 * shipped both of the ignored hints and neither of the useful one.
 *
 * This runs inside `astro.config.mjs`, which is loaded before any app code, so
 * it reads the sources directly with `fs` rather than importing the registry.
 * Two sources, because those are the only two places the site records a date:
 *
 *   - calculators: `reviewedDate` in the page's `reviewMetadata` prop, which is
 *     the same date the page prints as "reviewed for accuracy on" and emits as
 *     `dateModified` in its WebApplication schema;
 *   - guides: `updatedDate ?? publishDate` in the MDX frontmatter;
 *   - reference tables: `reviewed` in the reference registry, which is also the
 *     date the page prints and declares in its Dataset schema.
 *
 * Hubs and legal pages carry no date of their own, and they get no `lastmod`. Google's guidance is that an inaccurate `lastmod` is worse
 * than a missing one — it stops trusting the signal site-wide — so a date is
 * emitted only where the site actually knows it. Omitting the element for some
 * URLs is valid: the sitemap spec makes it optional per URL.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CATEGORY_DIRS = ['finance', 'health', 'math', 'everyday'];
const PAGES = 'src/pages';
const GUIDES = 'src/content/guides';
const REFERENCE = 'src/data/reference.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @returns {Map<string, string>} site-root path (no trailing slash) -> YYYY-MM-DD
 */
export function buildLastmodMap() {
  const map = new Map();

  for (const dir of CATEGORY_DIRS) {
    const abs = join(PAGES, dir);
    if (!existsSync(abs)) continue;
    for (const file of readdirSync(abs)) {
      if (!file.endsWith('.astro')) continue;
      const date = readFileSync(join(abs, file), 'utf8').match(
        /reviewedDate:\s*['"](\d{4}-\d{2}-\d{2})['"]/
      )?.[1];
      if (date) map.set(`/${dir}/${file.replace(/\.astro$/, '')}`, date);
    }
  }

  if (existsSync(GUIDES)) {
    for (const file of readdirSync(GUIDES)) {
      if (!file.endsWith('.mdx')) continue;
      // Frontmatter only: a date-looking string in the body must not win.
      const frontmatter = readFileSync(join(GUIDES, file), 'utf8').split('---')[1] ?? '';
      const pick = (key) =>
        frontmatter.match(new RegExp(`^${key}:\\s*['"]?(\\d{4}-\\d{2}-\\d{2})`, 'm'))?.[1];
      const date = pick('updatedDate') ?? pick('publishDate');
      if (date) map.set(`/guides/${file.replace(/\.mdx$/, '')}`, date);
    }
  }

  if (existsSync(REFERENCE)) {
    // Entries are `slug: '...'` … `reviewed: '...'` within one object literal;
    // pair them in source order rather than parsing TypeScript.
    const src = readFileSync(REFERENCE, 'utf8');
    for (const entry of src.matchAll(/slug:\s*'([a-z0-9-]+)',[\s\S]*?reviewed:\s*'(\d{4}-\d{2}-\d{2})'/g)) {
      map.set(`/reference/${entry[1]}`, entry[2]);
    }
  }

  for (const [path, date] of map) {
    if (!ISO_DATE.test(date)) map.delete(path);
  }
  return map;
}

/**
 * `serialize` handler for @astrojs/sitemap. Adds `lastmod` where we know it and
 * leaves the entry untouched where we do not.
 *
 * @param {string} origin e.g. https://bestcalculate.com
 */
export function lastmodSerializer(origin) {
  const map = buildLastmodMap();
  return (item) => {
    const path = item.url.replace(origin, '').replace(/\/+$/, '');
    const date = map.get(path);
    return date ? { ...item, lastmod: date } : item;
  };
}
