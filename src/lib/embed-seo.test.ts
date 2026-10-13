import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CALCULATORS, calculatorPath, getCalculator } from '@data/calculators';
import { REFERENCES, referencePath } from '@data/reference';
import { SITE } from '@config/site';
import { buildEmbedSnippet } from './embed';

/**
 * The SEO contract of the 61 chrome-less embed pages.
 *
 * `noindex` suppresses the RESULT, not the crawl. Bing and Google still fetch
 * these URLs, still record what they find, and a page with no meta description
 * is what a site scan reports as thin — which is exactly what happened here.
 * The fix is not to hide them harder: it is to make each one describe the tool
 * it frames and point unambiguously at the page that should rank instead.
 */

/** Every built chrome-less embed page: /embed/<category>/<slug> and /embed/reference/<slug>. */
function chromelessEmbedPages(): { url: string; html: string }[] {
  const root = 'dist/embed';
  const out: { url: string; html: string }[] = [];
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue; // /embed/gallery.html is a hub, not an embed
    for (const file of readdirSync(join(root, dir.name))) {
      if (!file.endsWith('.html')) continue;
      out.push({
        url: `/embed/${dir.name}/${file.replace(/\.html$/, '')}`,
        html: readFileSync(join(root, dir.name, file), 'utf8'),
      });
    }
  }
  return out;
}

const meta = (html: string, name: string) =>
  html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`))?.[1];
const canonical = (html: string) => html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];

describe.skipIf(!existsSync('dist/embed'))('every chrome-less embed page', () => {
  const pages = existsSync('dist/embed') ? chromelessEmbedPages() : [];

  it('exists for every live calculator and every reference table', () => {
    // 50 calculators + 10 reference tables. If this drifts, the sweeps below
    // would silently stop covering whatever went missing.
    const live = CALCULATORS.filter((c) => c.status === 'live');
    expect(pages.length).toBe(live.length + REFERENCES.length);
  });

  it('carries a non-empty meta description', () => {
    for (const { url, html } of pages) {
      const description = meta(html, 'description');
      expect(description, `${url} has no meta description`).toBeTruthy();
      expect(description!.trim().length, `${url} has an empty meta description`).toBeGreaterThan(0);
    }
  });

  it('takes that description from the central registry, not a rewrite of it', () => {
    for (const c of CALCULATORS.filter((x) => x.status === 'live')) {
      const page = pages.find((p) => p.url === `/embed/${c.category}/${c.slug}`);
      expect(page, `no embed page for ${c.slug}`).toBeDefined();
      expect(meta(page!.html, 'description')).toBe(c.description);
    }
    for (const r of REFERENCES) {
      const page = pages.find((p) => p.url === `/embed/reference/${r.slug}`);
      expect(page, `no embed page for ${r.slug}`).toBeDefined();
      expect(meta(page!.html, 'description')).toBe(r.description);
    }
  });

  it('stays noindex, follow — indexable embeds would compete with the real page', () => {
    for (const { url, html } of pages) {
      expect(meta(html, 'robots'), url).toBe('noindex, follow');
    }
  });

  it('canonicalises to its parent, never to itself or another embed', () => {
    for (const { url, html } of pages) {
      const href = canonical(html);
      expect(href, `${url} has no canonical`).toBeTruthy();
      expect(href!.startsWith(SITE.url), url).toBe(true);
      expect(href, `${url} canonicalises into /embed/`).not.toContain('/embed/');
      expect(href, `${url} canonicalises to itself`).not.toBe(`${SITE.url}${url}`);
    }
  });

  it('points each calculator embed at exactly its own parent', () => {
    for (const c of CALCULATORS.filter((x) => x.status === 'live')) {
      const page = pages.find((p) => p.url === `/embed/${c.category}/${c.slug}`)!;
      expect(canonical(page.html)).toBe(`${SITE.url}${calculatorPath(c)}`);
    }
    for (const r of REFERENCES) {
      const page = pages.find((p) => p.url === `/embed/reference/${r.slug}`)!;
      expect(canonical(page.html)).toBe(`${SITE.url}${referencePath(r)}`);
    }
  });
});

describe.skipIf(!existsSync('dist/sitemap-0.xml'))('the sitemap and the embed routes', () => {
  const xml = existsSync('dist/sitemap-0.xml') ? readFileSync('dist/sitemap-0.xml', 'utf8') : '';
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE.url, '') || '/');

  it('lists no individual embed route', () => {
    const leaked = locs.filter((u) => /^\/embed\/[^/]+\/[^/]+/.test(u));
    expect(leaked).toEqual([]);
  });

  /**
   * The exclusion has to match the ROUTES, not the `/embed/` prefix. Both hubs
   * are ordinary indexable pages with their own copy and a self-canonical, and
   * the blunt prefix test was dropping the gallery — the only indexable page on
   * the site that was missing from the sitemap.
   */
  it('lists both embed hubs, which are indexable pages in their own right', () => {
    expect(locs).toContain('/embed');
    expect(locs).toContain('/embed/gallery');
  });
});

describe('the attribution in the copy-paste snippet', () => {
  const calculator = getCalculator('finance', 'mortgage-calculator')!;
  const snippet = buildEmbedSnippet({
    title: calculator.title,
    slug: calculator.slug,
    embedPath: `/embed/${calculator.category}/${calculator.slug}`,
    canonicalPath: calculatorPath(calculator),
  });

  it('frames the embed but links to the parent — a link to a noindex page credits nothing', () => {
    expect(snippet).toContain(`<iframe src="${SITE.url}/embed/finance/mortgage-calculator"`);
    const href = snippet.match(/<a href="([^"]+)"/)![1];
    expect(href).toBe(`${SITE.url}${calculatorPath(calculator)}`);
    expect(href).not.toContain('/embed/');
  });

  it('reads "<Calculator name> by <brand>"', () => {
    expect(snippet.match(/<a[^>]*>(.*?)<\/a>/s)![1]).toBe(`${calculator.title} by ${SITE.name}`);
  });

  it('is visible to a reader, not hidden markup', () => {
    // Inside a rendered <p>, with no display:none / visibility / aria-hidden.
    expect(snippet).toMatch(/<p[^>]*>\s*<a /);
    expect(snippet).not.toMatch(/display:\s*none|visibility:\s*hidden|aria-hidden/i);
  });

  it('holds for every live calculator, not just the sampled one', () => {
    for (const c of CALCULATORS.filter((x) => x.status === 'live')) {
      const s = buildEmbedSnippet({
        title: c.title,
        slug: c.slug,
        embedPath: `/embed/${c.category}/${c.slug}`,
        canonicalPath: calculatorPath(c),
      });
      const link = s.match(/<a href="([^"]+)"[^>]*>(.*?)<\/a>/s)!;
      expect(link[1], c.slug).toBe(`${SITE.url}${calculatorPath(c)}`);
      expect(link[2], c.slug).toBe(`${c.title} by ${SITE.name}`);
    }
  });
});
