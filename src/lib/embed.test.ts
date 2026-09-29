import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SITE } from '@config/site';
import {
  buildEmbedSnippet,
  embedIframeId,
  EMBED_RESIZE_MESSAGE,
  EMBED_RESIZE_MESSAGE_LEGACY,
  type EmbedTarget,
} from './embed';

const target: EmbedTarget = {
  title: 'Mortgage Calculator',
  slug: 'mortgage-calculator',
  embedPath: '/embed/finance/mortgage-calculator',
  canonicalPath: '/finance/mortgage-calculator',
};

const snippet = buildEmbedSnippet(target);
const anchor = snippet.match(/<a\s[^>]*>(.*?)<\/a>/s);

describe('the embed snippet as a link', () => {
  /**
   * The snippet is the only thing this site distributes onto other people's
   * pages, so its anchor is a decision, not a detail. It used to read
   * `Free <a>Mortgage Calculator</a> by BestCalculate` — exact-match keyword,
   * dofollow, byte-identical on every placement, which is the footprint Google's
   * link-spam documentation describes for widgets.
   */
  it('puts the link on the brand, never on the calculator name', () => {
    expect(anchor, 'the snippet has no anchor at all').not.toBeNull();
    expect(anchor![1]).toBe(SITE.name);
    expect(anchor![1]).not.toContain(target.title);
  });

  it('still names the tool in the visible credit, outside the link', () => {
    const credit = snippet.match(/<p[^>]*>(.*?)<\/p>/s)![1];
    expect(credit).toContain(target.title);
    expect(credit.indexOf(target.title)).toBeLessThan(credit.indexOf('<a'));
  });

  it('carries exactly one link, and points it at the canonical page', () => {
    expect(snippet.match(/<a\s/g)).toHaveLength(1);
    expect(snippet).toContain(`href="${SITE.url}${target.canonicalPath}"`);
  });

  it('leaves the link followable — a nofollow would make the whole thing pointless', () => {
    expect(snippet).not.toMatch(/nofollow|sponsored|ugc/i);
  });

  it('keeps the link OUTSIDE the iframe, which is the only reason it counts', () => {
    const iframe = snippet.match(/<iframe[\s\S]*?<\/iframe>/)![0];
    expect(iframe).not.toContain('<a ');
    expect(snippet.indexOf('</iframe>')).toBeLessThan(snippet.indexOf('<a '));
  });
});

describe('the embed snippet as code someone else has to host', () => {
  it('frames the chrome-less embed page, not the canonical one', () => {
    expect(snippet).toContain(`<iframe src="${SITE.url}${target.embedPath}"`);
  });

  it('namespaces the iframe id per slug', () => {
    expect(embedIframeId(target.slug)).toBe(`bestcalculate-${target.slug}`);
    expect(snippet).toContain(`id="${embedIframeId(target.slug)}"`);
  });

  it('listens for the current resize message, scoped to its own slug', () => {
    expect(snippet).toContain(`e.data.type==="${EMBED_RESIZE_MESSAGE}"`);
    expect(snippet).toContain(`e.data.slug==="${target.slug}"`);
  });

  /**
   * A copied snippet is frozen in someone else's HTML: the listener half never
   * updates, the sending half updates on every deploy. EmbedLayout therefore
   * emits both names, and this pins the legacy one so nobody deletes it as dead
   * code — there is no way to find, or fix, the pages that depend on it.
   */
  it('keeps the legacy message name defined for embeds pasted before the rename', () => {
    expect(EMBED_RESIZE_MESSAGE_LEGACY).toBe('allcalc-resize');
    expect(EMBED_RESIZE_MESSAGE).not.toBe(EMBED_RESIZE_MESSAGE_LEGACY);
  });

  it('and actually sends both names from the embed page', () => {
    // The constant existing is not the promise; the postMessage is.
    const layout = readFileSync('src/layouts/EmbedLayout.astro', 'utf8');
    expect(layout).toContain('EMBED_RESIZE_MESSAGE');
    expect(layout).toContain('EMBED_RESIZE_MESSAGE_LEGACY');
    expect(layout.match(/parent\.postMessage\(/g)).toHaveLength(2);
  });
});
