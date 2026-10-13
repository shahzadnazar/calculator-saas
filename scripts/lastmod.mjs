/**
 * Per-URL `lastmod` values for the sitemap.
 *
 * Google and Bing both ignore `<changefreq>` and `<priority>`; `<lastmod>` is
 * the one hint they act on, and on a domain with no index history it is the
 * main lever for getting a page recrawled after an edit.
 *
 * EVERY indexable URL gets one, and none of them is the build date. A date that
 * moves on every deploy is worse than no date at all — a crawler that sees the
 * whole site "change" every time stops trusting the signal site-wide — so each
 * value is derived from content and is stable until that content changes.
 *
 * Four declared sources, each already the date its own page displays:
 *
 *   - calculators: `reviewedDate` in the page's `reviewMetadata` prop, printed
 *     as "reviewed for accuracy on" and emitted as WebApplication dateModified;
 *   - guides: `updatedDate ?? publishDate` in the MDX frontmatter;
 *   - reference tables: `reviewed` in the reference registry, printed on the
 *     page and declared in its Dataset schema;
 *   - standalone pages: the `updated` prop ContentLayout already renders as
 *     "Last updated …", and for the pages that legitimately show no date,
 *     `PAGE_LASTMOD` in `src/data/page-dates.ts` — sitemap metadata, not page
 *     content, so declaring it renders nothing.
 *
 * ...and one derived rule for hubs. A hub has no content of its own: it is a
 * list of other pages, so it is modified exactly when the newest thing it lists
 * is. `/finance` takes the newest of the finance calculators, `/tasks/borrow-
 * repay` the newest of its members, `/` the newest of anything on the site.
 * Deriving it rather than declaring it means a hub can never drift out of date
 * behind the content it points at.
 *
 * This module runs inside `astro.config.mjs`. That config is processed by Vite,
 * so it CAN import the TypeScript registries directly — which is why the task,
 * cluster and reference data below is imported rather than scraped with a
 * regular expression. The dates that live in page files, not in a registry,
 * still have to be read with `fs`.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CALCULATORS, CATEGORIES } from '../src/data/calculators.ts';
import { TASK_GROUPS } from '../src/data/tasks.ts';
import { CLUSTERS } from '../src/data/clusters.ts';
import { REFERENCES } from '../src/data/reference.ts';
import { PAGE_LASTMOD } from '../src/data/page-dates.ts';

const CATEGORY_DIRS = CATEGORIES.map((c) => c.slug);
const PAGES = 'src/pages';
const GUIDES = 'src/content/guides';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Standalone pages whose date is declared with ContentLayout's `updated` prop. */
const STANDALONE_PAGES = ['about', 'contact', 'disclaimer', 'methodology', 'privacy', 'terms'];

/** The newest of a set of dates, or undefined when none is known. */
const newest = (dates) => {
  const known = dates.filter((d) => typeof d === 'string' && ISO_DATE.test(d));
  return known.length ? known.reduce((a, b) => (a > b ? a : b)) : undefined;
};

/**
 * @returns {Map<string, string>} site-root path (no trailing slash) -> YYYY-MM-DD
 */
export function buildLastmodMap() {
  const map = new Map();
  const set = (path, date) => {
    if (date && ISO_DATE.test(date)) map.set(path, date);
  };

  /* -- Declared: calculators ------------------------------------------- */
  for (const dir of CATEGORY_DIRS) {
    const abs = join(PAGES, dir);
    if (!existsSync(abs)) continue;
    for (const file of readdirSync(abs)) {
      if (!file.endsWith('.astro')) continue;
      const date = readFileSync(join(abs, file), 'utf8').match(
        /reviewedDate:\s*['"](\d{4}-\d{2}-\d{2})['"]/
      )?.[1];
      set(`/${dir}/${file.replace(/\.astro$/, '')}`, date);
    }
  }

  /* -- Declared: guides ------------------------------------------------- */
  if (existsSync(GUIDES)) {
    for (const file of readdirSync(GUIDES)) {
      if (!file.endsWith('.mdx')) continue;
      // Frontmatter only: a date-looking string in the body must not win.
      const frontmatter = readFileSync(join(GUIDES, file), 'utf8').split('---')[1] ?? '';
      const pick = (key) =>
        frontmatter.match(new RegExp(`^${key}:\\s*['"]?(\\d{4}-\\d{2}-\\d{2})`, 'm'))?.[1];
      set(`/guides/${file.replace(/\.mdx$/, '')}`, pick('updatedDate') ?? pick('publishDate'));
    }
  }

  /* -- Declared: reference tables --------------------------------------- */
  for (const ref of REFERENCES) set(`/reference/${ref.slug}`, ref.reviewed);

  /* -- Declared: standalone pages --------------------------------------- */
  // Where the page shows a date, that same date is the sitemap's: one source,
  // so what a crawler is told and what a visitor reads cannot disagree.
  for (const name of STANDALONE_PAGES) {
    const file = join(PAGES, `${name}.astro`);
    if (!existsSync(file)) continue;
    const date = readFileSync(file, 'utf8').match(/updated=["'](\d{4}-\d{2}-\d{2})["']/)?.[1];
    set(`/${name}`, date);
  }
  // ...and where it shows none, the sitemap-only declaration. Never both for one
  // path — lastmod.test.ts fails on an overlap, because two sources for one date
  // is two dates waiting to drift.
  for (const [path, date] of Object.entries(PAGE_LASTMOD)) set(path, date);

  /* -- Derived: hubs take the newest of what they list ------------------- */
  const dateOf = (ref) => map.get(`/${ref}`);
  const live = CALCULATORS.filter((c) => c.status === 'live');
  const calculatorDates = live.map((c) => dateOf(`${c.category}/${c.slug}`));
  const guideDates = [...map].filter(([p]) => p.startsWith('/guides/')).map(([, d]) => d);
  const referenceDates = REFERENCES.map((r) => r.reviewed);

  for (const category of CATEGORIES) {
    set(
      `/${category.slug}`,
      newest(live.filter((c) => c.category === category.slug).map((c) => dateOf(`${c.category}/${c.slug}`)))
    );
  }

  const taskDates = [];
  for (const group of TASK_GROUPS) {
    const date = newest(group.members.map((m) => dateOf(m.ref)));
    set(`/tasks/${group.slug}`, date);
    taskDates.push(date);
  }

  const clusterDates = [];
  for (const cluster of CLUSTERS) {
    const date = newest(cluster.members.map((m) => dateOf(m.ref)));
    set(`/topics/${cluster.slug}`, date);
    clusterDates.push(date);
  }

  set('/calculators', newest(calculatorDates));
  set('/tasks', newest(taskDates));
  set('/topics', newest(clusterDates));
  set('/guides', newest(guideDates));
  set('/reference', newest(referenceDates));

  // Both embed hubs list every embeddable tool — the calculators and the
  // reference tables — so they move when any of those does.
  const embeddable = newest([...calculatorDates, ...referenceDates]);
  set('/embed', embeddable);
  set('/embed/gallery', embeddable);

  // The home page surfaces the registry, the pillar guides and the reference
  // tables, so it is modified whenever anything it surfaces is.
  set('/', newest([...calculatorDates, ...guideDates, ...referenceDates]));

  return map;
}

/**
 * `serialize` handler for @astrojs/sitemap.
 *
 * @param {string} origin e.g. https://bestcalculate.com
 */
export function lastmodSerializer(origin) {
  const map = buildLastmodMap();
  return (item) => {
    const path = item.url.replace(origin, '').replace(/\/+$/, '');
    const date = map.get(path || '/');
    return date ? { ...item, lastmod: date } : item;
  };
}
