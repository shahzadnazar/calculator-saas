import { describe, it, expect } from 'vitest';
import {
  ORIGIN,
  belongsToHost,
  buildPayload,
  chunk,
  describeStatus,
  diffSitemaps,
  eligibleUrls,
  isIndividualEmbedUrl,
  isSuccessStatus,
  keyFileUrl,
  parseSitemap,
  submitUrls,
  validateKey,
  MAX_URLS_PER_REQUEST,
} from './indexnow.mjs';

const u = (path: string) => `${ORIGIN}${path}`;

/** A fetch that records what it was given and replies with a fixed status. */
function fakeFetch(status: number, body = '') {
  const calls: { url: string; payload: Record<string, unknown> }[] = [];
  const impl = async (url: string, init: { body: string }) => {
    calls.push({ url, payload: JSON.parse(init.body) as Record<string, unknown> });
    return { status, text: async () => body };
  };
  return { impl, calls };
}

describe('the key', () => {
  it('refuses an unset key rather than burning a 403 on the host', () => {
    for (const missing of [undefined, null, '']) {
      const result = validateKey(missing as unknown as string);
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toContain('INDEXNOW_KEY is not set');
    }
  });

  it('refuses a key that is not the shape IndexNow defines', () => {
    for (const bad of ['short', 'has spaces in it', 'illegal/characters', 'a'.repeat(129), '!'.repeat(20)]) {
      expect(validateKey(bad).ok, bad).toBe(false);
    }
  });

  it('accepts a well-formed key and trims it', () => {
    expect(validateKey('  abcdef0123456789  ')).toEqual({ ok: true, key: 'abcdef0123456789' });
    expect(validateKey('a-B-9'.repeat(3)).ok).toBe(true);
  });

  it('points keyLocation at the file the API will fetch to verify ownership', () => {
    expect(keyFileUrl('abcdef0123456789')).toBe(`${ORIGIN}/abcdef0123456789.txt`);
  });

  it('never embeds the key anywhere but the payload it is sent in', () => {
    const payload = buildPayload({ key: 'abcdef0123456789', urlList: [u('/')] });
    expect(payload).toEqual({
      host: 'bestcalculate.com',
      key: 'abcdef0123456789',
      keyLocation: `${ORIGIN}/abcdef0123456789.txt`,
      urlList: [u('/')],
    });
  });
});

describe('which URLs are eligible', () => {
  it('excludes every individual /embed/ route', () => {
    expect(isIndividualEmbedUrl(u('/embed/finance/mortgage-calculator'))).toBe(true);
    expect(isIndividualEmbedUrl(u('/embed/reference/tip-table'))).toBe(true);
    const urls = eligibleUrls([
      u('/finance/mortgage-calculator'),
      u('/embed/finance/mortgage-calculator'),
      u('/embed/reference/tip-table'),
      u('/embed/health/bmi-calculator'),
    ]);
    expect(urls).toEqual([u('/finance/mortgage-calculator')]);
  });

  /**
   * The hubs are NOT embed routes. They are ordinary indexable pages with their
   * own copy and a self-canonical, and a prefix match on "/embed/" wrongly
   * swallows the gallery — the same bug that kept it out of the sitemap.
   */
  it('keeps the two embed hubs, which are indexable pages', () => {
    expect(isIndividualEmbedUrl(u('/embed'))).toBe(false);
    expect(isIndividualEmbedUrl(u('/embed/gallery'))).toBe(false);
    expect(eligibleUrls([u('/embed'), u('/embed/gallery')])).toEqual([u('/embed'), u('/embed/gallery')]);
  });

  it('rejects any URL that is not on bestcalculate.com', () => {
    expect(belongsToHost('https://example.com/finance/x')).toBe(false);
    expect(belongsToHost('https://evil.bestcalculate.com.attacker.test/x')).toBe(false);
    expect(belongsToHost('https://notbestcalculate.com/x')).toBe(false);
    expect(belongsToHost(u('/finance/x'))).toBe(true);
    expect(
      eligibleUrls([u('/finance/x'), 'https://example.com/finance/x', 'https://bestcalculate.com.evil.test/y'])
    ).toEqual([u('/finance/x')]);
  });

  it('rejects malformed and relative entries instead of throwing', () => {
    expect(eligibleUrls(['', 'not a url', '/finance/relative', null as unknown as string])).toEqual([]);
    expect(eligibleUrls(undefined as unknown as string[])).toEqual([]);
  });

  it('removes duplicates, including ones differing only by slash, query or fragment', () => {
    expect(
      eligibleUrls([
        u('/finance/mortgage-calculator'),
        u('/finance/mortgage-calculator'),
        u('/finance/mortgage-calculator/'),
        u('/finance/mortgage-calculator#results'),
        u('/finance/mortgage-calculator?utm_source=x'),
      ])
    ).toEqual([u('/finance/mortgage-calculator')]);
  });

  it('reads loc and lastmod out of a sitemap', () => {
    const xml = `<urlset>
      <url><loc>${u('/a')}</loc><lastmod>2026-09-01</lastmod></url>
      <url><loc>${u('/b')}</loc></url>
      <url><lastmod>2026-09-02</lastmod></url>
    </urlset>`;
    expect(parseSitemap(xml)).toEqual([
      { loc: u('/a'), lastmod: '2026-09-01' },
      { loc: u('/b'), lastmod: undefined },
    ]);
  });
});

describe('what a routine deployment submits', () => {
  const previous = [
    { loc: u('/'), lastmod: '2026-09-01' },
    { loc: u('/finance/loan-calculator'), lastmod: '2026-09-01' },
    { loc: u('/retired'), lastmod: '2026-09-01' },
  ];
  const current = [
    { loc: u('/'), lastmod: '2026-09-01' }, // unchanged
    { loc: u('/finance/loan-calculator'), lastmod: '2026-09-29' }, // changed
    { loc: u('/finance/new-calculator'), lastmod: '2026-09-29' }, // added
  ];

  it('submits what is new, changed or removed — and nothing else', () => {
    const diff = diffSitemaps(previous, current);
    expect(diff.added).toEqual([u('/finance/new-calculator')]);
    expect(diff.changed).toEqual([u('/finance/loan-calculator')]);
    expect(diff.removed).toEqual([u('/retired')]);
    expect(diff.urls).not.toContain(u('/'));
    expect(diff.urls).toHaveLength(3);
  });

  /** The behaviour that gets a host rate-limited and ignored. */
  it('submits nothing at all when a deploy changed no public URL', () => {
    expect(diffSitemaps(current, current).urls).toEqual([]);
  });

  it('never leaks an individual embed route into the diff', () => {
    const diff = diffSitemaps([], [{ loc: u('/embed/finance/mortgage-calculator'), lastmod: '2026-09-29' }]);
    expect(diff.urls).toEqual([]);
  });

  it('treats an entry that gained or lost a lastmod as changed', () => {
    expect(diffSitemaps([{ loc: u('/a') }], [{ loc: u('/a'), lastmod: '2026-09-29' }]).changed).toEqual([u('/a')]);
  });
});

describe('talking to the API', () => {
  const key = 'abcdef0123456789abcdef0123456789';

  it('treats 200 and 202 as success, and nothing else', () => {
    expect(isSuccessStatus(200)).toBe(true);
    expect(isSuccessStatus(202)).toBe(true);
    for (const bad of [400, 403, 422, 429, 500, 0]) expect(isSuccessStatus(bad), String(bad)).toBe(false);
  });

  it.each([200, 202])('reports success on %i', async (status) => {
    const { impl, calls } = fakeFetch(status);
    const result = await submitUrls([u('/a')], { key, fetchImpl: impl });
    expect(result.ok).toBe(true);
    expect(result.submitted).toBe(1);
    expect(calls[0].url).toBe('https://api.indexnow.org/indexnow');
    expect(calls[0].payload.urlList).toEqual([u('/a')]);
  });

  it.each([
    [400, 'malformed'],
    [403, 'key file could not be verified'],
    [422, 'does not belong to the host'],
    [429, 'Too many requests'],
  ])('explains a %i rather than just failing', async (status, phrase) => {
    const { impl } = fakeFetch(status, 'server detail here');
    const result = await submitUrls([u('/a')], { key, fetchImpl: impl });
    expect(result.ok).toBe(false);
    expect(result.submitted).toBe(0);
    expect(result.error).toContain(String(status));
    expect(describeStatus(status)).toContain(phrase);
    expect(result.error).toContain('server detail here');
  });

  it('reports a network failure as an error, not a crash', async () => {
    const result = await submitUrls([u('/a')], {
      key,
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('will not make a real submission without a valid production key', async () => {
    const { impl, calls } = fakeFetch(200);
    for (const bad of [undefined, '', 'short']) {
      const result = await submitUrls([u('/a')], { key: bad as unknown as string, fetchImpl: impl });
      expect(result.ok).toBe(false);
      expect(result.submitted).toBe(0);
    }
    expect(calls, 'a request was sent despite an invalid key').toHaveLength(0);
  });

  it('sends nothing for an empty URL list, and calls that success', async () => {
    const { impl, calls } = fakeFetch(200);
    for (const empty of [[], undefined]) {
      const result = await submitUrls(empty as string[], { key, fetchImpl: impl });
      expect(result.ok).toBe(true);
      expect(result.submitted).toBe(0);
    }
    expect(calls).toHaveLength(0);
  });

  it('sends nothing in a dry run', async () => {
    const { impl, calls } = fakeFetch(200);
    const result = await submitUrls([u('/a')], { key, fetchImpl: impl, dryRun: true });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('splits a submission larger than the protocol limit', () => {
    const many = Array.from({ length: MAX_URLS_PER_REQUEST + 5 }, (_, i) => u(`/p${i}`));
    const batches = chunk(many);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(MAX_URLS_PER_REQUEST);
    expect(batches[1]).toHaveLength(5);
    expect(batches.flat()).toEqual(many);
  });
});
