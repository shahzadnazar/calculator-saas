import { describe, it, expect } from 'vitest';
import {
  checkCanonicalRedirect,
  checkEmbedPage,
  checkIndexablePage,
  checkRobotsTxt,
  checkSitemap,
  embedUrlFor,
} from './seo-smoke.mjs';

/**
 * The smoke test runs against the live site, so these cover the half that can be
 * tested without one: given a response, does it report the right problem?
 *
 * Every case here is a FAILING input. A checker that cannot fail is a checker
 * that passes a broken deployment, which is the only way this script could do
 * harm — it would make a red site look green.
 */
const ORIGIN = 'https://bestcalculate.com';
const ok = {
  url: `${ORIGIN}/finance/loan-calculator`,
  status: 200,
  redirected: false,
  finalUrl: `${ORIGIN}/finance/loan-calculator`,
  canonicalOrigin: ORIGIN,
  path: '/finance/loan-calculator',
  html: `<html><head><meta name="description" content="A loan calculator."><link rel="canonical" href="${ORIGIN}/finance/loan-calculator"></head></html>`,
};

describe('an indexable page', () => {
  it('passes when it is 200, self-canonical, described and not noindex', () => {
    expect(checkIndexablePage(ok)).toEqual([]);
  });

  it('fails on a non-200, naming the URL', () => {
    const problems = checkIndexablePage({ ...ok, status: 404 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(ok.url);
    expect(problems[0]).toContain('404');
  });

  it('fails when a sitemap URL redirects — the sitemap must list the final URL', () => {
    const problems = checkIndexablePage({ ...ok, redirected: true, finalUrl: `${ORIGIN}/finance/loan` });
    expect(problems.some((p) => p.includes('redirected to'))).toBe(true);
  });

  it('fails on noindex, which would silently drop the page from the index', () => {
    const html = ok.html.replace('<head>', '<head><meta name="robots" content="noindex, follow">');
    expect(checkIndexablePage({ ...ok, html }).some((p) => p.includes('noindex'))).toBe(true);
  });

  it('fails on a missing or cross-page canonical', () => {
    expect(checkIndexablePage({ ...ok, html: '<html><head></head></html>' }).some((p) => p.includes('no canonical'))).toBe(true);
    const wrong = ok.html.replace(`${ORIGIN}/finance/loan-calculator"`, `${ORIGIN}/finance/other"`);
    expect(checkIndexablePage({ ...ok, html: wrong }).some((p) => p.includes('expected a self-reference'))).toBe(true);
  });

  it('fails on a missing or blank meta description', () => {
    for (const html of ['<html><head></head></html>', ok.html.replace('A loan calculator.', '   ')]) {
      expect(checkIndexablePage({ ...ok, html }).some((p) => p.includes('no meta description')), html).toBe(true);
    }
  });

  it('compares the canonical against production even when fetched from staging', () => {
    // The page is fetched from localhost but must still claim the real URL.
    expect(
      checkIndexablePage({ ...ok, url: 'http://localhost:4399/finance/loan-calculator' })
    ).toEqual([]);
  });
});

describe('an embed page', () => {
  const embed = {
    url: `${ORIGIN}/embed/finance/loan-calculator`,
    status: 200,
    parentUrl: `${ORIGIN}/finance/loan-calculator`,
    html: `<html><head><meta name="description" content="A loan calculator."><meta name="robots" content="noindex, follow"><link rel="canonical" href="${ORIGIN}/finance/loan-calculator"></head></html>`,
  };

  it('passes when described, noindex-follow and canonicalised to its parent', () => {
    expect(checkEmbedPage(embed)).toEqual([]);
  });

  it('fails on the missing description the Bing scan reported', () => {
    const html = embed.html.replace('<meta name="description" content="A loan calculator.">', '');
    const problems = checkEmbedPage({ ...embed, html });
    expect(problems.some((p) => p.includes('no meta description'))).toBe(true);
    expect(problems[0]).toContain(embed.url);
  });

  it('fails if it becomes indexable, which would compete with the real page', () => {
    for (const robots of ['index, follow', 'noindex, nofollow', undefined]) {
      const html = robots
        ? embed.html.replace('noindex, follow', robots)
        : embed.html.replace(/<meta name="robots"[^>]*>/, '');
      expect(checkEmbedPage({ ...embed, html }).some((p) => p.includes('expected "noindex, follow"'))).toBe(true);
    }
  });

  it('fails if it canonicalises to itself instead of its parent', () => {
    const html = embed.html.replace(`${ORIGIN}/finance/loan-calculator"></head>`, `${embed.url}"></head>`);
    expect(checkEmbedPage({ ...embed, html }).some((p) => p.includes('expected its parent'))).toBe(true);
  });

  it('derives the embed route from a calculator or reference URL, and nothing else', () => {
    expect(embedUrlFor('/finance/loan-calculator')).toBe('/embed/finance/loan-calculator');
    expect(embedUrlFor('/reference/tip-table')).toBe('/embed/reference/tip-table');
    for (const notATool of ['/', '/about', '/guides/how-vat-works', '/tasks/borrow-repay', '/embed/gallery']) {
      expect(embedUrlFor(notATool), notATool).toBeUndefined();
    }
  });
});

describe('robots.txt', () => {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap-index.xml\n`;

  it('passes when it allows crawling and points at the production sitemap', () => {
    expect(checkRobotsTxt({ status: 200, body, canonicalOrigin: ORIGIN })).toEqual([]);
  });

  it('fails on a non-200, a missing Sitemap line, or the wrong sitemap URL', () => {
    expect(checkRobotsTxt({ status: 404, body, canonicalOrigin: ORIGIN })).not.toEqual([]);
    expect(
      checkRobotsTxt({ status: 200, body: 'User-agent: *\nAllow: /\n', canonicalOrigin: ORIGIN }).some((p) =>
        p.includes('no Sitemap')
      )
    ).toBe(true);
    expect(
      checkRobotsTxt({ status: 200, body: `Sitemap: ${ORIGIN}/sitemap.xml`, canonicalOrigin: ORIGIN }).some((p) =>
        p.includes('expected')
      )
    ).toBe(true);
  });

  /** The trap from this domain's history: a disallow a 301 can never be seen through. */
  it('fails on a blanket disallow', () => {
    const blocked = `User-agent: *\nDisallow: /\n\nSitemap: ${ORIGIN}/sitemap-index.xml\n`;
    expect(checkRobotsTxt({ status: 200, body: blocked, canonicalOrigin: ORIGIN }).some((p) => p.includes('disallows the whole site'))).toBe(true);
  });
});

describe('the sitemap document', () => {
  const entry = (loc: string, lastmod?: string) =>
    `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
  const wrap = (inner: string) => `<?xml version="1.0"?><urlset xmlns="x">${inner}</urlset>`;
  const url = `${ORIGIN}/sitemap-0.xml`;

  it('passes a well-formed sitemap and returns its entries', () => {
    const body = wrap(entry(`${ORIGIN}/a`, '2026-09-29') + entry(`${ORIGIN}/b`, '2026-09-29T00:00:00.000Z'));
    const result = checkSitemap({ url, status: 200, body });
    expect(result.problems).toEqual([]);
    expect(result.entries).toHaveLength(2);
  });

  it('fails on a non-200 or a document that is not a sitemap', () => {
    expect(checkSitemap({ url, status: 500, body: wrap('') }).problems.some((p) => p.includes('500'))).toBe(true);
    expect(checkSitemap({ url, status: 200, body: '<html></html>' }).problems.some((p) => p.includes('not a valid sitemap'))).toBe(true);
  });

  it('names the exact URL that is missing a lastmod', () => {
    const problems = checkSitemap({ url, status: 200, body: wrap(entry(`${ORIGIN}/a`)) }).problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`${ORIGIN}/a`);
    expect(problems[0]).toContain('no <lastmod>');
  });

  it('rejects a lastmod that is not a valid W3C date', () => {
    for (const bad of ['29/09/2026', '2026-9-1', 'yesterday', '2026-09-29 00:00']) {
      const problems = checkSitemap({ url, status: 200, body: wrap(entry(`${ORIGIN}/a`, bad)) }).problems;
      expect(problems.some((p) => p.includes('invalid W3C lastmod')), bad).toBe(true);
    }
  });

  it('fails if an individual embed route leaks into the sitemap', () => {
    const body = wrap(entry(`${ORIGIN}/embed/finance/loan-calculator`, '2026-09-29'));
    expect(checkSitemap({ url, status: 200, body }).problems.some((p) => p.includes('must not be in the sitemap'))).toBe(true);
  });

  it('accepts the embed hubs, which are indexable pages', () => {
    const body = wrap(entry(`${ORIGIN}/embed`, '2026-09-29') + entry(`${ORIGIN}/embed/gallery`, '2026-09-29'));
    expect(checkSitemap({ url, status: 200, body }).problems).toEqual([]);
  });
});

describe('the canonical-host redirects', () => {
  it('passes a 301 to https on the bare host', () => {
    expect(
      checkCanonicalRedirect({ from: 'http://bestcalculate.com/', status: 301, location: `${ORIGIN}/`, origin: ORIGIN })
    ).toEqual([]);
  });

  it('fails when http is served directly instead of redirected', () => {
    expect(
      checkCanonicalRedirect({ from: 'http://bestcalculate.com/', status: 200, location: null, origin: ORIGIN })
    ).not.toEqual([]);
  });

  it('fails when the redirect keeps http, or lands on www', () => {
    expect(
      checkCanonicalRedirect({ from: 'http://bestcalculate.com/', status: 301, location: 'http://bestcalculate.com/', origin: ORIGIN }).some((p) => p.includes('expected https'))
    ).toBe(true);
    expect(
      checkCanonicalRedirect({ from: 'https://www.bestcalculate.com/', status: 301, location: 'https://www.bestcalculate.com/x', origin: ORIGIN }).some((p) => p.includes('expected bestcalculate.com'))
    ).toBe(true);
  });
});
