import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { buildLastmodMap, lastmodSerializer } from './lastmod.mjs';
import { CALCULATORS, CATEGORIES } from '../src/data/calculators';
import { REFERENCES } from '../src/data/reference';
import { TASK_GROUPS } from '../src/data/tasks';
import { CLUSTERS } from '../src/data/clusters';
import { SITE } from '../src/config/site';
import { PAGE_LASTMOD } from '../src/data/page-dates';

/**
 * `lastmod` is the one sitemap hint Google and Bing act on, and an inaccurate
 * one is worse than a missing one — a crawler that sees the whole site "change"
 * on every deploy stops trusting the signal site-wide.
 *
 * So there are two invariants, and they pull against each other:
 *   1. EVERY indexable URL has a date (what the Bing scan was missing), and
 *   2. no date is invented — each one traces to content, and is stable until
 *      that content changes.
 *
 * These tests hold both, which is what stops anyone "fixing" coverage with
 * `new Date()`.
 */
const map = buildLastmodMap();
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const live = CALCULATORS.filter((c) => c.status === 'live');
const guideSlugs = readdirSync('src/content/guides')
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => f.replace(/\.mdx$/, ''));
const STANDALONE = ['about', 'contact', 'disclaimer', 'methodology', 'privacy', 'terms'];

describe('what the map covers', () => {
  it('covers every live calculator', () => {
    expect(live.filter((c) => !map.has(`/${c.category}/${c.slug}`)).map((c) => c.slug)).toEqual([]);
    expect(live.length).toBeGreaterThan(0);
  });

  it('covers every guide', () => {
    expect(guideSlugs.filter((s) => !map.has(`/guides/${s}`))).toEqual([]);
  });

  it('covers every reference table, with the date the table itself publishes', () => {
    for (const r of REFERENCES) expect(map.get(`/reference/${r.slug}`), r.slug).toBe(r.reviewed);
  });

  it('covers every standalone page, from whichever of the two sources owns it', () => {
    for (const name of STANDALONE) {
      const shown = readFileSync(`src/pages/${name}.astro`, 'utf8').match(
        /updated=["'](\d{4}-\d{2}-\d{2})["']/
      )?.[1];
      const declared = shown ?? PAGE_LASTMOD[`/${name}`];
      expect(declared, `/${name} has neither an updated= prop nor a PAGE_LASTMOD entry`).toBeTruthy();
      expect(map.get(`/${name}`), name).toBe(declared);
    }
  });

  /**
   * A page that both renders a date and declares one for the sitemap has two
   * sources for one fact, and they drift the first time someone edits one.
   */
  it('never takes a date for one page from both sources at once', () => {
    for (const path of Object.keys(PAGE_LASTMOD)) {
      const file = `src/pages${path}.astro`;
      if (!existsSync(file)) continue;
      const shown = readFileSync(file, 'utf8').match(/updated=["'](\d{4}-\d{2}-\d{2})["']/)?.[1];
      expect(shown, `${path} renders "Last updated" AND declares PAGE_LASTMOD — pick one`).toBeUndefined();
    }
  });

  /** The reason PAGE_LASTMOD exists: a sitemap date that shows nothing to a reader. */
  it('renders no "Last updated" line for a page dated only in PAGE_LASTMOD', () => {
    for (const path of Object.keys(PAGE_LASTMOD)) {
      const built = `dist${path}.html`;
      if (!existsSync(built)) continue;
      expect(readFileSync(built, 'utf8'), `${path} shows a visible "Last updated" line`).not.toContain(
        'Last updated'
      );
    }
  });

  it('covers every hub: categories, task groups, topic clusters, directories and home', () => {
    for (const c of CATEGORIES) expect(map.has(`/${c.slug}`), c.slug).toBe(true);
    for (const g of TASK_GROUPS) expect(map.has(`/tasks/${g.slug}`), g.slug).toBe(true);
    for (const c of CLUSTERS) expect(map.has(`/topics/${c.slug}`), c.slug).toBe(true);
    for (const p of ['/', '/calculators', '/tasks', '/topics', '/guides', '/reference', '/embed', '/embed/gallery']) {
      expect(map.has(p), p).toBe(true);
    }
  });
});

describe('where the dates come from', () => {
  it('declares PAGE_LASTMOD dates in the same well-formed, non-future shape', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const [path, date] of Object.entries(PAGE_LASTMOD)) {
      expect(path, 'PAGE_LASTMOD keys are root-relative paths').toMatch(/^\/[a-z0-9/-]*$/);
      expect(date, path).toMatch(ISO);
      expect(date <= today, `${path} is dated ${date}, after today`).toBe(true);
    }
  });

  it('emits only well-formed dates, none of them in the future', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const [path, date] of map) {
      expect(date, path).toMatch(ISO);
      expect(Number.isNaN(Date.parse(date)), path).toBe(false);
      expect(date <= today, `${path} is dated ${date}, after today`).toBe(true);
    }
  });

  /**
   * The one that matters. Every value must be a date the content itself
   * declares — so nobody can close a coverage gap with the build date.
   */
  it('invents nothing: every value is a date some page actually declares', () => {
    const declared = new Set<string>();
    for (const c of live) {
      const d = readFileSync(`src/pages/${c.category}/${c.slug}.astro`, 'utf8').match(
        /reviewedDate:\s*['"](\d{4}-\d{2}-\d{2})['"]/
      )?.[1];
      if (d) declared.add(d);
    }
    for (const s of guideSlugs) {
      const fm = readFileSync(`src/content/guides/${s}.mdx`, 'utf8').split('---')[1] ?? '';
      for (const m of fm.matchAll(/(?:updatedDate|publishDate):\s*['"]?(\d{4}-\d{2}-\d{2})/g)) {
        declared.add(m[1]);
      }
    }
    for (const r of REFERENCES) declared.add(r.reviewed);
    for (const n of STANDALONE) {
      const d = readFileSync(`src/pages/${n}.astro`, 'utf8').match(/updated=["'](\d{4}-\d{2}-\d{2})["']/)?.[1];
      if (d) declared.add(d);
    }
    for (const d of Object.values(PAGE_LASTMOD)) declared.add(d);
    for (const [path, date] of map) {
      expect(declared.has(date), `${path} is dated ${date}, which no page declares`).toBe(true);
    }
  });

  it('gives a hub the newest date among the pages it lists', () => {
    const newest = (refs: readonly string[]) =>
      refs.map((r) => map.get(`/${r}`)!).filter(Boolean).sort().at(-1);

    for (const c of CATEGORIES) {
      const members = live.filter((x) => x.category === c.slug).map((x) => `${x.category}/${x.slug}`);
      expect(map.get(`/${c.slug}`), c.slug).toBe(newest(members));
    }
    for (const g of TASK_GROUPS) {
      expect(map.get(`/tasks/${g.slug}`), g.slug).toBe(newest(g.members.map((m) => m.ref)));
    }
    for (const c of CLUSTERS) {
      expect(map.get(`/topics/${c.slug}`), c.slug).toBe(newest(c.members.map((m) => m.ref)));
    }
    expect(map.get('/calculators')).toBe(newest(live.map((c) => `${c.category}/${c.slug}`)));
  });

  it('is deterministic — the same inputs give the same map every time', () => {
    expect([...buildLastmodMap()].sort()).toEqual([...buildLastmodMap()].sort());
  });
});

describe('the sitemap serializer', () => {
  const serialize = lastmodSerializer(SITE.url);

  it('dates a known URL and leaves an unknown one untouched', () => {
    const c = live[0];
    expect(serialize({ url: `${SITE.url}/${c.category}/${c.slug}` }).lastmod).toBe(
      map.get(`/${c.category}/${c.slug}`)
    );
    expect(serialize({ url: `${SITE.url}/not-a-page` }).lastmod).toBeUndefined();
  });

  it('dates the home page, whose path normalises to empty', () => {
    expect(serialize({ url: `${SITE.url}/` }).lastmod).toBe(map.get('/'));
    expect(serialize({ url: SITE.url }).lastmod).toBe(map.get('/'));
  });

  it('matches a URL whether or not the sitemap wrote a trailing slash', () => {
    const c = live[0];
    expect(serialize({ url: `${SITE.url}/${c.category}/${c.slug}/` }).lastmod).toBe(
      serialize({ url: `${SITE.url}/${c.category}/${c.slug}` }).lastmod
    );
  });
});

/** The output is what Bing reads, so assert on the built file, not just the map. */
describe.skipIf(!existsSync('dist/sitemap-0.xml'))('the built sitemap', () => {
  const xml = existsSync('dist/sitemap-0.xml') ? readFileSync('dist/sitemap-0.xml', 'utf8') : '';
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: m[1].match(/<loc>([^<]+)<\/loc>/)![1],
    lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1],
  }));

  it('gives EVERY entry a lastmod — the gap the Bing scan reported', () => {
    expect(entries.length).toBeGreaterThan(100);
    expect(entries.filter((e) => !e.lastmod).map((e) => e.loc)).toEqual([]);
  });

  it('writes valid W3C datetimes that agree with the map', () => {
    for (const { loc, lastmod } of entries) {
      // W3C datetime: a complete date, optionally with a time and zone.
      expect(lastmod, loc).toMatch(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/);
      expect(Number.isNaN(Date.parse(lastmod!)), loc).toBe(false);
      const path = loc.replace(SITE.url, '').replace(/\/+$/, '') || '/';
      expect(lastmod!.slice(0, 10), loc).toBe(map.get(path));
    }
  });

  it('does not stamp every URL with one build-time date', () => {
    // The failure mode this whole module exists to avoid.
    expect(new Set(entries.map((e) => e.lastmod!.slice(0, 10))).size).toBeGreaterThan(1);
  });
});
