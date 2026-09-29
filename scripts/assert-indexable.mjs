/**
 * Post-build guard: fail if the bundle about to be deployed could not be indexed
 * properly by a search engine.
 *
 * Written after the live site spent weeks with a single Google result reading
 * `https://bestcalculate.com/home/` — "No information is available for this
 * page" — and no description anywhere for the real home page. None of the causes
 * were visible in the source; all of them were visible in `dist/`. Each check
 * below is one of those causes, and each one is cheap.
 *
 *   npm run build && npm run assert:indexable
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const ORIGIN = 'https://bestcalculate.com';

/** Length bounds Google actually renders: shorter is thin, longer is truncated. */
const DESCRIPTION_MIN = 70;
const DESCRIPTION_MAX = 160;
const TITLE_MAX = 70;

const problems = [];
const fail = (what, detail) => problems.push(`${what}\n    ${detail}`);

const read = (p) => readFileSync(join(DIST, p), 'utf8');
const head = (html) => html.split('</head>')[0] ?? html;
const meta = (html, name) =>
  head(html).match(new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]*)"`, 'i'))?.[1];
const prop = (html, property) =>
  head(html).match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, 'i'))?.[1];

/* -- 1. The bundle ships the server config every clean URL depends on ------- */

if (!existsSync(join(DIST, '.htaccess'))) {
  fail('dist/.htaccess is missing', 'Without it /finance and every calculator URL 404 on Apache.');
} else {
  const htaccess = read('.htaccess');
  // The legacy front page of whatever occupied the domain before. Google still
  // holds it, and every brand-search visitor lands on it.
  if (!/RewriteRule\s+\^home/.test(htaccess)) {
    fail('.htaccess has no /home redirect', 'The old indexed /home/ URL would 404 again.');
  }
  if (!/DirectoryIndex\s+index\.html/.test(htaccess)) {
    fail('.htaccess does not pin DirectoryIndex', 'A leftover index.php on the host would serve / instead of ours.');
  }
}

/* -- 2. robots.txt lets crawlers in, and points at the sitemap -------------- */

if (!existsSync(join(DIST, 'robots.txt'))) {
  fail('dist/robots.txt is missing', 'Hosts serve their own default when one is absent.');
} else {
  const robots = read('robots.txt');
  // "No information is available for this page" is what Google prints when it
  // holds a URL it is not allowed to fetch. A blanket disallow is how that
  // happens, and it is one character away from the allow we want.
  if (/^\s*Disallow:\s*\/\s*$/im.test(robots)) {
    fail('robots.txt disallows the whole site', robots.trim());
  }
  if (!robots.includes(`${ORIGIN}/sitemap`)) {
    fail('robots.txt does not point at the sitemap', robots.trim());
  }

  // The one that actually bit us. Search Console reported /home/ as "Indexed,
  // though blocked by robots.txt": a disallow stops the CRAWL, and a crawler
  // that never fetches the URL never sees the 301 sitting there waiting for it,
  // so the dead URL stays in the index indefinitely. A redirect and a disallow
  // on the same path cancel each other out — so every path this config redirects
  // must be crawlable.
  const disallowed = [...robots.matchAll(/^\s*Disallow:\s*(\S+)\s*$/gim)].map((m) => m[1]);
  const redirected = existsSync(join(DIST, '.htaccess'))
    ? [...read('.htaccess').matchAll(/^\s*RewriteRule\s+\^\(?([a-z0-9|\\.-]+)/gim)]
        .flatMap((m) => m[1].split('|').map((alt) => `/${alt.replace(/\\/g, '')}`))
    : [];

  // Both directions, on normalised paths. The real case was `Disallow: /home/`
  // against a rule matching `^home(/.*)?$`: comparing one way only, "/home" does
  // not start with "/home/", and the check sailed straight past the exact bug it
  // exists to catch.
  const norm = (p) => p.replace(/[*]+$/, '').replace(/\/+$/, '');
  for (const path of redirected) {
    const blocking = disallowed.find((rule) => {
      const r = norm(rule);
      if (!r || r === '/') return false; // the blanket disallow has its own check
      return norm(path).startsWith(r) || r.startsWith(norm(path));
    });
    if (blocking) {
      fail(
        `robots.txt blocks ${path}, which .htaccess redirects`,
        `"Disallow: ${blocking}" stops the crawl, so the 301 is never seen and the old URL stays indexed.`
      );
    }
  }
}

/* -- 3. The home page carries everything a result needs -------------------- */

const home = read('index.html');
const title = head(home).match(/<title>(.*?)<\/title>/s)?.[1]?.trim();
const description = meta(home, 'description');
const canonical = head(home).match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i)?.[1];
const robotsMeta = meta(home, 'robots') ?? 'index, follow';

if (!title) fail('The home page has no <title>', 'Google has nothing to headline the result with.');
else if (title.length > TITLE_MAX) fail('The home page title is too long', `${title.length} chars: ${title}`);

if (!description) {
  fail('The home page has no meta description', 'Google falls back to scraped text, or to nothing at all.');
} else if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
  fail('The home page description is outside the length Google renders', `${description.length} chars (want ${DESCRIPTION_MIN}-${DESCRIPTION_MAX}): ${description}`);
}

if (canonical !== `${ORIGIN}/`) {
  fail('The home page canonical is not the bare origin', `got ${canonical ?? 'none'}, want ${ORIGIN}/`);
}
if (/noindex/i.test(robotsMeta)) fail('The home page is noindex', robotsMeta);
if (!prop(home, 'og:image')) fail('The home page has no og:image', 'Shares and some result treatments show nothing.');

for (const type of ['"@type":"Organization"', '"@type":"WebSite"']) {
  if (!home.includes(type)) fail(`The home page is missing ${type} structured data`, 'It is what ties the brand name to the domain.');
}

/* -- 4. Nothing public is accidentally noindex ----------------------------- */

const pages = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (entry.endsWith('.html')) pages.push(p);
  }
})(DIST);

// /embed/* and /dev/* are deliberately noindex; 404 is never indexed anyway.
const PUBLIC = (p) => {
  const rel = relative(DIST, p).replace(/\\/g, '/');
  return !rel.startsWith('embed/') && !rel.startsWith('dev/') && rel !== '404.html';
};
const noindexed = pages.filter(PUBLIC).filter((p) => /noindex/i.test(meta(readFileSync(p, 'utf8'), 'robots') ?? ''));
if (noindexed.length) {
  fail(`${noindexed.length} public page(s) are noindex`, noindexed.map((p) => relative(DIST, p)).join(', '));
}

/* -- 5. Every sitemap URL is a file we actually built ----------------------- */

const sitemaps = readdirSync(DIST).filter((f) => /^sitemap.*\.xml$/.test(f) && f !== 'sitemap-index.xml');
const locs = sitemaps.flatMap((f) => [...read(f).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
if (!locs.length) fail('The sitemap lists no URLs', sitemaps.join(', ') || 'no sitemap files at all');

const dead = locs.filter((url) => {
  const path = url.replace(ORIGIN, '').replace(/\/$/, '');
  if (path === '') return !existsSync(join(DIST, 'index.html'));
  return !existsSync(join(DIST, `${path}.html`)) && !existsSync(join(DIST, path, 'index.html'));
});
if (dead.length) fail(`${dead.length} sitemap URL(s) have no built page`, dead.slice(0, 10).join('\n    '));

/* -- Report ---------------------------------------------------------------- */

if (problems.length) {
  console.error(`✗ ${problems.length} indexability problem(s) in the bundle:\n`);
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}

console.log(
  `✓ Indexable: robots.txt allows crawling, .htaccess ships with the /home redirect, ` +
    `the home page has a ${description.length}-char description and a canonical, ` +
    `${pages.filter(PUBLIC).length} public pages carry no stray noindex, and all ${locs.length} sitemap URLs exist.`
);
