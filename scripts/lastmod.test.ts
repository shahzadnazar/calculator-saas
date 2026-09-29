import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { buildLastmodMap, lastmodSerializer } from './lastmod.mjs';
import { CALCULATORS } from '../src/data/calculators';
import { REFERENCES } from '../src/data/reference';

/**
 * `lastmod` is the only sitemap hint Google acts on, and Google's stated position
 * is that an inaccurate one is worse than a missing one — it stops trusting the
 * signal site-wide. So the map has exactly two jobs: cover every page that
 * records a date, and invent a date for nothing else.
 *
 * It reads the sources with a regex because it runs inside astro.config, which
 * loads before app code. These tests are what keeps that regex honest when a
 * page's prop formatting changes.
 */
const map = buildLastmodMap();
const guideSlugs = readdirSync('src/content/guides')
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => f.replace(/\.mdx$/, ''));

describe('sitemap lastmod map', () => {
  it('covers every live calculator', () => {
    const live = CALCULATORS.filter((c) => c.status === 'live');
    const missing = live.filter((c) => !map.has(`/${c.category}/${c.slug}`));
    expect(missing.map((c) => c.slug)).toEqual([]);
    expect(live.length).toBeGreaterThan(0);
  });

  it('covers every reference table, with the date the table itself publishes', () => {
    for (const r of REFERENCES) {
      expect(map.get(`/reference/${r.slug}`), r.slug).toBe(r.reviewed);
    }
  });

  it('covers every guide', () => {
    const missing = guideSlugs.filter((s) => !map.has(`/guides/${s}`));
    expect(missing).toEqual([]);
  });

  it('claims a date for nothing else', () => {
    const expected = new Set([
      ...CALCULATORS.filter((c) => c.status === 'live').map((c) => `/${c.category}/${c.slug}`),
      ...guideSlugs.map((s) => `/guides/${s}`),
      ...REFERENCES.map((r) => `/reference/${r.slug}`),
    ]);
    expect([...map.keys()].filter((k) => !expected.has(k))).toEqual([]);
  });

  it('emits only well-formed dates, none of them in the future', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const [path, date] of map) {
      expect(date, path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(date)), path).toBe(false);
      expect(date <= today, `${path} is dated ${date}, after today`).toBe(true);
    }
  });

  it('adds lastmod to a known URL and leaves an unknown one untouched', () => {
    const serialize = lastmodSerializer('https://bestcalculate.com');
    const known = CALCULATORS.find((c) => c.status === 'live')!;
    const withDate = serialize({ url: `https://bestcalculate.com/${known.category}/${known.slug}` });
    expect(withDate.lastmod).toBe(map.get(`/${known.category}/${known.slug}`));

    const untouched = serialize({ url: 'https://bestcalculate.com/about' });
    expect(untouched.lastmod).toBeUndefined();
  });

  it('matches a URL whether or not the sitemap wrote a trailing slash', () => {
    const serialize = lastmodSerializer('https://bestcalculate.com');
    const c = CALCULATORS.find((x) => x.status === 'live')!;
    expect(serialize({ url: `https://bestcalculate.com/${c.category}/${c.slug}/` }).lastmod).toBe(
      serialize({ url: `https://bestcalculate.com/${c.category}/${c.slug}` }).lastmod
    );
  });
});
