/**
 * Post-deployment SEO smoke test — runs against the LIVE site, not the build.
 *
 * Every other gate in this repo inspects `dist/`. That cannot catch the class of
 * failure that actually loses rankings, because those happen between the bundle
 * and the browser: a rewrite rule that redirects a sitemap URL, a host serving
 * the wrong canonical host, a key file that 404s, `.htaccess` not shipping at
 * all. This fetches what a crawler fetches and asserts on what comes back.
 *
 * Usage:
 *   node scripts/seo-smoke.mjs                          # https://bestcalculate.com
 *   node scripts/seo-smoke.mjs --base http://localhost:4399
 *   node scripts/seo-smoke.mjs --concurrency 4
 *
 * Exits non-zero and names the exact URL for every failure.
 */
import { ORIGIN } from './indexnow.mjs';

export const CATEGORY_SEGMENTS = ['finance', 'health', 'math', 'everyday'];

/* -- Pure checks ----------------------------------------------------------- */

const meta = (html, name) =>
  html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1];
const canonicalOf = (html) =>
  html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)?.[1];

/** The embed route that frames a given indexable page, or undefined. */
export function embedUrlFor(path) {
  const m = path.match(/^\/([a-z-]+)\/([a-z0-9-]+)$/);
  if (!m) return undefined;
  const [, segment, slug] = m;
  if (CATEGORY_SEGMENTS.includes(segment)) return `/embed/${segment}/${slug}`;
  if (segment === 'reference') return `/embed/reference/${slug}`;
  return undefined;
}

/** Checks for a page that IS in the sitemap: it must be indexable and self-canonical. */
export function checkIndexablePage({ url, status, redirected, finalUrl, html, canonicalOrigin, path }) {
  const problems = [];
  if (status !== 200) problems.push(`${url} returned HTTP ${status} (expected 200)`);
  if (redirected) problems.push(`${url} redirected to ${finalUrl} — a sitemap URL must be the final URL`);
  if (typeof html !== 'string') return problems;

  const robots = meta(html, 'robots') ?? '';
  if (/noindex/i.test(robots)) problems.push(`${url} is in the sitemap but carries robots "${robots}"`);

  const canonical = canonicalOf(html);
  if (!canonical) problems.push(`${url} has no canonical link`);
  else {
    const expected = `${canonicalOrigin}${path}`.replace(/\/$/, '') || canonicalOrigin;
    const actual = canonical.replace(/\/$/, '') || canonical;
    if (actual !== expected) {
      problems.push(`${url} canonicalises to ${canonical} — expected a self-reference to ${expected}`);
    }
  }

  const description = meta(html, 'description');
  if (!description || !description.trim()) problems.push(`${url} has no meta description`);
  return problems;
}

/** Checks for a chrome-less embed page: described, noindex, pointing at its parent. */
export function checkEmbedPage({ url, status, html, parentUrl }) {
  const problems = [];
  if (status !== 200) problems.push(`${url} returned HTTP ${status} (expected 200)`);
  if (typeof html !== 'string') return problems;

  const description = meta(html, 'description');
  if (!description || !description.trim()) problems.push(`${url} has no meta description`);

  const robots = meta(html, 'robots');
  if (robots !== 'noindex, follow') {
    problems.push(`${url} has robots "${robots ?? 'none'}" — expected "noindex, follow"`);
  }

  const canonical = canonicalOf(html);
  if (!canonical) problems.push(`${url} has no canonical link`);
  else if (canonical.replace(/\/$/, '') !== parentUrl.replace(/\/$/, '')) {
    problems.push(`${url} canonicalises to ${canonical} — expected its parent ${parentUrl}`);
  }
  return problems;
}

export function checkRobotsTxt({ status, body, canonicalOrigin, base = canonicalOrigin }) {
  const problems = [];
  if (status !== 200) problems.push(`${base}/robots.txt returned HTTP ${status} (expected 200)`);
  if (typeof body !== 'string') return problems;
  // The declared sitemap is always the production URL, wherever robots.txt is
  // being served from — a staging copy pointing at staging would be the bug.
  const sitemap = body.match(/^\s*Sitemap:\s*(\S+)\s*$/im)?.[1];
  if (!sitemap) problems.push(`${base}/robots.txt declares no Sitemap: line`);
  else if (sitemap !== `${canonicalOrigin}/sitemap-index.xml`) {
    problems.push(`${base}/robots.txt points at ${sitemap} — expected ${canonicalOrigin}/sitemap-index.xml`);
  }
  if (/^\s*Disallow:\s*\/\s*$/im.test(body)) problems.push(`${base}/robots.txt disallows the whole site`);
  return problems;
}

/** Entries plus the problems found in the sitemap document itself. */
export function checkSitemap({ url, status, body }) {
  const problems = [];
  if (status !== 200) problems.push(`${url} returned HTTP ${status} (expected 200)`);
  if (typeof body !== 'string') return { entries: [], problems };
  if (!/<urlset[\s>]/.test(body) && !/<sitemapindex[\s>]/.test(body)) {
    problems.push(`${url} is not a valid sitemap document (no <urlset> or <sitemapindex>)`);
    return { entries: [], problems };
  }
  const entries = [...body.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: m[1].match(/<loc>([^<]*)<\/loc>/)?.[1]?.trim(),
    lastmod: m[1].match(/<lastmod>([^<]*)<\/lastmod>/)?.[1]?.trim(),
  }));
  for (const { loc, lastmod } of entries) {
    if (!loc) problems.push(`${url} has a <url> entry with no <loc>`);
    else if (!lastmod) problems.push(`${loc} has no <lastmod> in ${url}`);
    else if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.test(lastmod)) {
      problems.push(`${loc} has an invalid W3C lastmod "${lastmod}" in ${url}`);
    }
    if (loc && /^https?:\/\/[^/]+\/embed\/[^/]+\/[^/]+/.test(loc)) {
      problems.push(`${loc} is an individual embed route and must not be in the sitemap`);
    }
  }
  return { entries, problems };
}

/** A canonical-host redirect must land on https + the bare host, in one place. */
export function checkCanonicalRedirect({ from, status, location, origin }) {
  const problems = [];
  if (status < 300 || status >= 400) {
    problems.push(`${from} returned HTTP ${status} — expected a 301 to ${origin}`);
    return problems;
  }
  if (!location) {
    problems.push(`${from} redirected with no Location header`);
    return problems;
  }
  let target;
  try {
    target = new URL(location, from);
  } catch {
    problems.push(`${from} redirected to an unparseable Location "${location}"`);
    return problems;
  }
  if (target.protocol !== 'https:') problems.push(`${from} redirected to ${location} — expected https`);
  if (target.hostname !== new URL(origin).hostname) {
    problems.push(`${from} redirected to host ${target.hostname} — expected ${new URL(origin).hostname}`);
  }
  return problems;
}

/* -- Runner ---------------------------------------------------------------- */

async function pooled(items, size, worker) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) results.push(await worker(items[next++]));
    })
  );
  return results.flat();
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const value = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  // Where pages are FETCHED from. Canonicals are always the production origin,
  // even on a staging base — a canonical that pointed at localhost would be the
  // bug, not the check.
  const base = (value('base') ?? ORIGIN).replace(/\/$/, '');
  const concurrency = Number(value('concurrency') ?? 8);
  const isProduction = base === ORIGIN;
  const problems = [];
  const note = (label) => console.log(`· ${label}`);

  const get = async (url, init) => {
    try {
      const response = await fetch(url, init);
      return { status: response.status, redirected: response.redirected, finalUrl: response.url, response };
    } catch (cause) {
      problems.push(`${url} could not be fetched: ${cause?.message ?? cause}`);
      return undefined;
    }
  };

  /* robots.txt */
  note('robots.txt');
  const robots = await get(`${base}/robots.txt`);
  if (robots) {
    problems.push(
      ...checkRobotsTxt({ status: robots.status, body: await robots.response.text(), canonicalOrigin: ORIGIN, base })
    );
  }

  /* sitemaps */
  note('sitemap index and documents');
  const index = await get(`${base}/sitemap-index.xml`);
  let entries = [];
  if (index) {
    const body = await index.response.text();
    const indexCheck = checkSitemap({ url: `${base}/sitemap-index.xml`, status: index.status, body });
    problems.push(...indexCheck.problems);
    const children = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => `${base}${new URL(m[1].trim(), ORIGIN).pathname}`
    );
    for (const child of children) {
      const doc = await get(child);
      if (!doc) continue;
      const result = checkSitemap({ url: child, status: doc.status, body: await doc.response.text() });
      problems.push(...result.problems);
      entries.push(...result.entries.filter((e) => e.loc));
    }
  }
  if (!entries.length) problems.push(`No sitemap URLs were found at ${base} — nothing could be verified.`);

  /* every sitemap URL */
  note(`${entries.length} sitemap URLs`);
  problems.push(
    ...(await pooled(entries, concurrency, async ({ loc }) => {
      const path = new URL(loc).pathname.replace(/\/$/, '') || '/';
      const url = `${base}${path === '/' ? '/' : path}`;
      const page = await get(url, { redirect: 'follow' });
      if (!page) return [];
      return checkIndexablePage({
        url,
        status: page.status,
        redirected: page.redirected,
        finalUrl: page.finalUrl,
        html: await page.response.text(),
        canonicalOrigin: ORIGIN,
        path,
      });
    }))
  );

  /* the embed route behind each calculator and reference page */
  const embedTargets = entries
    .map(({ loc }) => ({ parentUrl: loc, embed: embedUrlFor(new URL(loc).pathname) }))  // parentUrl stays the canonical production URL
    .filter((t) => t.embed);
  note(`${embedTargets.length} embed pages`);
  problems.push(
    ...(await pooled(embedTargets, concurrency, async ({ parentUrl, embed }) => {
      const url = `${base}${embed}`;
      const page = await get(url);
      if (!page) return [];
      return checkEmbedPage({ url, status: page.status, html: await page.response.text(), parentUrl });
    }))
  );

  /* canonical host — only meaningful against the real domain */
  if (isProduction) {
    note('http:// and www. redirects');
    for (const from of [`http://${new URL(ORIGIN).hostname}/`, `https://www.${new URL(ORIGIN).hostname}/`]) {
      const response = await get(from, { redirect: 'manual' });
      if (!response) continue;
      problems.push(
        ...checkCanonicalRedirect({
          from,
          status: response.status,
          location: response.response.headers.get('location'),
          origin: ORIGIN,
        })
      );
    }
  } else {
    note('http:// and www. redirects — SKIPPED (not the production origin)');
  }

  /* IndexNow key file, when a key is available to check it with */
  if (env.INDEXNOW_KEY) {
    note('IndexNow key file');
    const url = `${base}/${env.INDEXNOW_KEY}.txt`;
    const file = await get(url);
    if (file) {
      if (file.status !== 200) problems.push(`${url} returned HTTP ${file.status} (expected 200)`);
      else {
        const body = (await file.response.text()).trim();
        if (body !== env.INDEXNOW_KEY) {
          problems.push(`${url} does not contain the key — IndexNow submissions will be rejected with 403`);
        }
      }
    }
  } else {
    note('IndexNow key file — SKIPPED (INDEXNOW_KEY is not set)');
  }

  if (problems.length) {
    console.error(`\n✗ ${problems.length} SEO problem(s) at ${base}:\n`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(
    `\n✓ SEO smoke test passed at ${base}: robots.txt and sitemaps serve, ` +
      `all ${entries.length} sitemap URLs return 200 with a self-canonical, a description and no noindex, ` +
      `every entry has a valid lastmod, and all ${embedTargets.length} embed pages are described, ` +
      `noindex and canonicalised to their parent.`
  );
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((cause) => {
      console.error(`✗ SEO smoke test failed unexpectedly: ${cause?.message ?? cause}`);
      process.exit(1);
    });
}
