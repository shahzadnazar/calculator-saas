/**
 * IndexNow submitter — tells Bing (and Yandex, Seznam, Naver) that URLs changed.
 *
 * Bing acts on IndexNow quickly, which matters far more on a young domain than
 * waiting for a discovery crawl. This is the whole integration: no dependency,
 * no SDK, one POST to https://api.indexnow.org/indexnow.
 *
 * TWO RULES SHAPE EVERYTHING BELOW.
 *
 * 1. The key never appears in this file or anywhere in the repository. It comes
 *    from INDEXNOW_KEY at run time, and the verification file that proves
 *    ownership is written into the bundle at deploy time for the same reason.
 *    A key committed to a public repo is a key anyone can submit URLs with.
 *
 * 2. Submit what CHANGED, not the site. Re-submitting all 112 URLs on every
 *    deploy is the behaviour that gets a host rate-limited and ignored, and it
 *    tells the crawler nothing it did not already know. The baseline is the
 *    sitemap that is CURRENTLY LIVE: diffing it against the freshly built one
 *    yields exactly the URLs that are new, whose lastmod moved, or that have
 *    been removed — which is why `lastmod` had to be accurate first. `--all`
 *    exists for the one-time initial submission and should not be routine.
 *
 * Usage:
 *   node scripts/indexnow.mjs --all                      # one-time: every URL
 *   node scripts/indexnow.mjs --since <url|file>         # routine: the diff
 *   node scripts/indexnow.mjs --all --dry-run            # print, never POST
 *   node scripts/indexnow.mjs --write-key-file dist      # dist/<key>.txt
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ENDPOINT = 'https://api.indexnow.org/indexnow';
export const HOST = 'bestcalculate.com';
export const ORIGIN = `https://${HOST}`;
/** One request carries at most 10,000 URLs (IndexNow protocol limit). */
export const MAX_URLS_PER_REQUEST = 10_000;

/* -- Key ------------------------------------------------------------------ */

/**
 * IndexNow keys are 8–128 characters of [a-zA-Z0-9-]. Validating the shape is
 * not pedantry: an unset secret arrives as the empty string, and posting that
 * burns a 403 against the host for no reason.
 *
 * @returns {{ ok: true, key: string } | { ok: false, reason: string }}
 */
export function validateKey(key) {
  if (key === undefined || key === null || key === '') {
    return { ok: false, reason: 'INDEXNOW_KEY is not set. Nothing was submitted.' };
  }
  if (typeof key !== 'string') return { ok: false, reason: 'INDEXNOW_KEY must be a string.' };
  const trimmed = key.trim();
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(trimmed)) {
    return {
      ok: false,
      reason:
        `INDEXNOW_KEY is not a valid IndexNow key (got ${trimmed.length} characters). ` +
        'It must be 8-128 characters of a-z, A-Z, 0-9 or "-".',
    };
  }
  return { ok: true, key: trimmed };
}

export const keyFileUrl = (key, origin = ORIGIN) => `${origin}/${key}.txt`;

/** Writes the ownership-proof file the API fetches to verify the key. */
export function writeKeyFile(dir, key) {
  const check = validateKey(key);
  if (!check.ok) throw new Error(check.reason);
  const path = join(dir, `${check.key}.txt`);
  writeFileSync(path, check.key, 'utf8');
  return path;
}

/* -- Reading the sitemap -------------------------------------------------- */

/**
 * `<loc>` + `<lastmod>` out of a sitemap. Deliberately a regex and not an XML
 * parser: the input is our own generated file, and this script stays
 * dependency-free.
 *
 * @returns {{ loc: string, lastmod: string | undefined }[]}
 */
export function parseSitemap(xml) {
  return [...String(xml).matchAll(/<url>([\s\S]*?)<\/url>/g)].flatMap((m) => {
    const loc = m[1].match(/<loc>([^<]*)<\/loc>/)?.[1]?.trim();
    if (!loc) return [];
    return [{ loc, lastmod: m[1].match(/<lastmod>([^<]*)<\/lastmod>/)?.[1]?.trim() }];
  });
}

/**
 * A chrome-less embed route: /embed/<category>/<slug>. These are `noindex` with
 * a canonical pointing at the parent, so submitting one asks a crawler to spend
 * a fetch on a page we have told it not to index. The two embed HUBS — /embed
 * and /embed/gallery — are ordinary indexable pages and are NOT excluded.
 */
export const isIndividualEmbedUrl = (url) => /^\/embed\/[^/]+\/[^/]+/.test(pathOf(url) ?? '');

function pathOf(url) {
  try {
    return new URL(url, ORIGIN).pathname;
  } catch {
    return undefined;
  }
}

/** True only for an absolute http(s) URL on exactly our host. */
export function belongsToHost(url, host = HOST) {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname === host;
  } catch {
    return false;
  }
}

/**
 * The submittable set: our host only, no individual embed routes, no
 * duplicates, in a stable order.
 *
 * @param {{loc: string, lastmod?: string}[] | string[]} entries
 * @returns {string[]}
 */
export function eligibleUrls(entries, { host = HOST } = {}) {
  const seen = new Set();
  for (const entry of entries ?? []) {
    const loc = typeof entry === 'string' ? entry : entry?.loc;
    if (!loc || !belongsToHost(loc, host) || isIndividualEmbedUrl(loc)) continue;
    // Normalise so /x and /x#frag and /x?a=1 cannot be submitted as three URLs.
    const url = new URL(loc);
    url.hash = '';
    url.search = '';
    const normalised = url.href.replace(/\/$/, '') || url.origin;
    seen.add(normalised);
  }
  return [...seen].sort();
}

/**
 * What actually changed between the live sitemap and the built one.
 *
 * Removed URLs are submitted too: a crawler that re-fetches a deleted page and
 * sees a 404 drops it, which is the point.
 *
 * @returns {{ added: string[], changed: string[], removed: string[], urls: string[] }}
 */
export function diffSitemaps(previousEntries, currentEntries, { host = HOST } = {}) {
  const dateOf = (entries) => {
    const out = new Map();
    for (const e of entries ?? []) {
      const loc = typeof e === 'string' ? e : e?.loc;
      if (!loc || !belongsToHost(loc, host) || isIndividualEmbedUrl(loc)) continue;
      const url = new URL(loc);
      url.hash = '';
      url.search = '';
      out.set(url.href.replace(/\/$/, '') || url.origin, (typeof e === 'string' ? '' : e?.lastmod) ?? '');
    }
    return out;
  };
  const before = dateOf(previousEntries);
  const after = dateOf(currentEntries);

  const added = [...after.keys()].filter((u) => !before.has(u)).sort();
  const changed = [...after.keys()].filter((u) => before.has(u) && before.get(u) !== after.get(u)).sort();
  const removed = [...before.keys()].filter((u) => !after.has(u)).sort();
  return { added, changed, removed, urls: [...new Set([...added, ...changed, ...removed])].sort() };
}

/* -- Submitting ----------------------------------------------------------- */

/** IndexNow accepts the set (200) or queues it pending key validation (202). */
export const isSuccessStatus = (status) => status === 200 || status === 202;

/** Human-readable meaning for the statuses the protocol defines. */
export function describeStatus(status) {
  return (
    {
      200: 'OK — URLs accepted.',
      202: 'Accepted — URLs received, key validation pending.',
      400: 'Bad request — the payload was malformed.',
      403: 'Forbidden — the key file could not be verified at keyLocation.',
      422: 'Unprocessable — a URL does not belong to the host, or the key does not match.',
      429: 'Too many requests — slow down; this usually means the site is submitting too often.',
    }[status] ?? `Unexpected status ${status}.`
  );
}

export function buildPayload({ host = HOST, key, urlList, origin = ORIGIN }) {
  return { host, key, keyLocation: keyFileUrl(key, origin), urlList };
}

export const chunk = (items, size = MAX_URLS_PER_REQUEST) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/**
 * POSTs the URLs. Returns a result rather than throwing so the caller decides
 * whether a failure should fail a deployment.
 *
 * @param {string[]} [urls]
 * @param {{
 *   key?: string,
 *   host?: string,
 *   origin?: string,
 *   fetchImpl?: (url: string, init: { method: string, headers: Record<string, string>, body: string }) => Promise<{ status: number, text: () => Promise<string> }>,
 *   dryRun?: boolean,
 * }} [options]
 * @returns {Promise<{ ok: boolean, submitted: number, batches: {status: number, ok: boolean, detail: string}[], error?: string }>}
 */
export async function submitUrls(urls, { key, host = HOST, origin = ORIGIN, fetchImpl = globalThis.fetch, dryRun = false } = {}) {
  const check = validateKey(key);
  if (!check.ok) return { ok: false, submitted: 0, batches: [], error: check.reason };
  if (!urls?.length) {
    // Not a failure: a deploy that changed no public URL has nothing to say.
    return { ok: true, submitted: 0, batches: [], error: undefined };
  }
  if (dryRun) {
    return { ok: true, submitted: urls.length, batches: [{ status: 0, ok: true, detail: 'dry run — nothing was sent' }] };
  }

  const batches = [];
  for (const batch of chunk(urls)) {
    const payload = buildPayload({ host, key: check.key, urlList: batch, origin });
    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });
    } catch (cause) {
      batches.push({ status: 0, ok: false, detail: `Request failed: ${cause?.message ?? cause}` });
      continue;
    }
    const ok = isSuccessStatus(response.status);
    let detail = describeStatus(response.status);
    if (!ok) {
      const body = await response.text().catch(() => '');
      if (body.trim()) detail += ` Response body: ${body.trim().slice(0, 500)}`;
    }
    batches.push({ status: response.status, ok, detail });
  }

  const failed = batches.filter((b) => !b.ok);
  return {
    ok: failed.length === 0,
    submitted: failed.length === 0 ? urls.length : 0,
    batches,
    error: failed.length ? failed.map((b) => `[${b.status}] ${b.detail}`).join('\n') : undefined,
  };
}

/* -- CLI ------------------------------------------------------------------ */

async function readSource(source) {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Could not read ${source}: HTTP ${response.status}`);
    return response.text();
  }
  return readFileSync(source, 'utf8');
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const flag = (name) => argv.includes(`--${name}`);
  const value = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const dir = value('dist') ?? 'dist';

  if (flag('write-key-file')) {
    const target = value('write-key-file') ?? dir;
    try {
      console.log(`✓ IndexNow key file written to ${writeKeyFile(target, env.INDEXNOW_KEY)}`);
      return 0;
    } catch (cause) {
      console.error(`✗ Could not write the IndexNow key file: ${cause.message}`);
      return 1;
    }
  }

  const current = readdirSync(dir)
    .filter((f) => /^sitemap.*\.xml$/.test(f) && f !== 'sitemap-index.xml')
    .flatMap((f) => parseSitemap(readFileSync(join(dir, f), 'utf8')));

  if (!current.length) {
    console.error(`✗ No sitemap URLs found in ${dir}/. Run the build first.`);
    return 1;
  }

  let urls;
  if (flag('all')) {
    urls = eligibleUrls(current);
    console.log(`Submitting ALL ${urls.length} eligible URLs (one-time initial submission).`);
  } else {
    const since = value('since');
    if (!since) {
      console.error(
        '✗ Routine submissions need a baseline: --since <url|file> (normally the live sitemap,\n' +
          `  e.g. --since ${ORIGIN}/sitemap-0.xml). Use --all only for the initial submission.`
      );
      return 1;
    }
    let previous;
    try {
      previous = parseSitemap(await readSource(since));
    } catch (cause) {
      console.error(`✗ Could not read the baseline sitemap: ${cause.message}`);
      return 1;
    }
    const diff = diffSitemaps(previous, current);
    urls = diff.urls;
    console.log(
      `Changed since the live sitemap: ${diff.added.length} new, ${diff.changed.length} updated, ${diff.removed.length} removed.`
    );
  }

  if (!urls.length) {
    console.log('✓ Nothing to submit — no public URL changed.');
    return 0;
  }

  const result = await submitUrls(urls, { key: env.INDEXNOW_KEY, dryRun: flag('dry-run') });
  if (!result.ok) {
    console.error(`✗ IndexNow submission failed.\n${result.error}`);
    return 1;
  }
  console.log(`✓ IndexNow accepted ${result.submitted} URL(s).`);
  for (const b of result.batches) console.log(`  ${b.detail}`);
  return 0;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((cause) => {
      // A stack trace in a deploy log tells whoever is reading it nothing.
      console.error(`✗ IndexNow failed unexpectedly: ${cause?.message ?? cause}`);
      process.exit(1);
    });
}
