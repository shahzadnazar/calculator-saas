/**
 * Embed CSS report (R7C-1.1) — READ-ONLY measurement of the dynamic embed system.
 *
 * The embed route (`src/pages/embed/[category]/[slug].astro` → `IslandBySlug`)
 * statically imports every island, so Astro bundles ALL islands' scoped CSS into
 * the stylesheet each `/embed/*` page carries — even though a page renders only
 * ONE island. This is the accepted "inert IslandBySlug ripple": every calculator
 * migration that adds scoped CSS grows that shared bundle on every embed page.
 *
 * This script measures an UNRELATED embed page (default: mortgage, which is not
 * being migrated) so the number reflects pure ripple, not the page's own island:
 *   - total linked + inline CSS bytes
 *   - gzipped CSS bytes
 *   - island-scoped CSS bytes (rules whose selector carries `[data-astro-cid-…]`)
 *   - unused island-scoped selectors (scoped rules whose cid is not rendered on
 *     this page — i.e. bundled dead CSS for islands that aren't here)
 *   - delta vs the committed baseline (docs/embed-css-baseline.json)
 *
 * It NEVER fails the build (no budget yet) and NEVER changes IslandBySlug — it
 * only reports, so future migrations can show cumulative growth. Re-baseline with
 * `--write-baseline` after an accepted migration.
 *
 * Usage:
 *   node scripts/report-embed-css.mjs [relativeDistPage] [--write-baseline] [--label "<text>"]
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const DIST = 'dist';
const BASELINE = 'docs/embed-css-baseline.json';
const DEFAULT_PAGE = 'embed/finance/mortgage-calculator.html';

const argv = process.argv.slice(2);
const flags = new Set();
const positional = [];
let label = '';
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--label') {
    label = argv[i + 1] ?? '';
    i += 1; // consume the label value so it is not read as the page
  } else if (a.startsWith('--')) {
    flags.add(a);
  } else {
    positional.push(a);
  }
}
const page = positional[0] || DEFAULT_PAGE;

const shortCommit = () => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

const pagePath = resolve(DIST, page);
if (!existsSync(pagePath)) {
  console.error(`✗ ${page} not found under ${DIST}/ — run \`npm run build\` first.`);
  process.exit(2);
}
const html = readFileSync(pagePath, 'utf8');
const bytes = (s) => Buffer.byteLength(s, 'utf8');

/* ---- collect CSS: inline <style> blocks + linked stylesheets ------------- */
const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
const linkHrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
let linkedCss = '';
let linkedFiles = 0;
for (const href of linkHrefs) {
  const p = resolve(DIST, href.replace(/^\//, ''));
  if (existsSync(p)) {
    linkedCss += readFileSync(p, 'utf8');
    linkedFiles += 1;
  }
}
const inlineCss = styleBlocks.join('\n');
const allCss = `${inlineCss}\n${linkedCss}`;
const totalCssBytes = bytes(allCss);
const gzippedCssBytes = gzipSync(Buffer.from(allCss)).length;

/* ---- which island cids are actually RENDERED (on elements, not in <style>) */
const htmlNoStyle = html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
const presentCids = new Set([...htmlNoStyle.matchAll(/data-astro-cid-([a-z0-9]+)/g)].map((m) => m[1]));

/* ---- classify scoped rules (selector carries a cid) as used / unused ----- */
const perCid = new Map(); // cid -> { bytes, rules, present }
let scopedCssBytes = 0;
let unusedScopedBytes = 0;
let unusedScopedSelectors = 0;
const ruleRe = /([^{}]*\[data-astro-cid-[a-z0-9]+\][^{}]*)\{[^{}]*\}/g;
for (const m of allCss.matchAll(ruleRe)) {
  const ruleBytes = bytes(m[0]);
  scopedCssBytes += ruleBytes;
  const cids = [...m[1].matchAll(/data-astro-cid-([a-z0-9]+)/g)].map((x) => x[1]);
  const used = cids.some((c) => presentCids.has(c));
  if (!used) {
    unusedScopedBytes += ruleBytes;
    unusedScopedSelectors += 1;
  }
  for (const c of new Set(cids)) {
    const e = perCid.get(c) || { bytes: 0, rules: 0, present: presentCids.has(c) };
    e.bytes += ruleBytes;
    e.rules += 1;
    perCid.set(c, e);
  }
}
const unusedIslands = [...perCid.values()].filter((e) => !e.present).length;

const measurement = {
  page,
  totalCssBytes,
  gzippedCssBytes,
  scopedCssBytes,
  unusedScopedBytes,
  unusedScopedSelectors,
  scopedIslandCids: perCid.size,
  renderedCids: [...presentCids].sort(),
};

/* ---- report ------------------------------------------------------------- */
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : '0.0');
const kib = (n) => (n / 1024).toFixed(2);
console.log(`\nEmbed CSS report — ${page}  (commit ${shortCommit()}${label ? `, ${label}` : ''})`);
console.log(`  Sources:             ${styleBlocks.length} inline <style> + ${linkedFiles} linked stylesheet(s)`);
console.log(`  Total CSS:           ${totalCssBytes} B (${kib(totalCssBytes)} KiB)`);
console.log(`  Gzipped CSS:         ${gzippedCssBytes} B (${kib(gzippedCssBytes)} KiB)`);
console.log(`  Island-scoped CSS:   ${scopedCssBytes} B (${pct(scopedCssBytes, totalCssBytes)}% of total) across ${perCid.size} island cids`);
console.log(`  Rendered on page:    ${[...presentCids].sort().join(', ') || '(none)'}`);
console.log(`  Unused scoped CSS:   ${unusedScopedBytes} B in ${unusedScopedSelectors} selectors (${unusedIslands} islands not on this page)`);

/* ---- delta vs committed baseline ---------------------------------------- */
if (existsSync(BASELINE)) {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const b = base.measurement || base;
  const d = (k) => measurement[k] - (b[k] ?? 0);
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  console.log(`  Delta vs baseline (${base.commit || '?'}${base.label ? `, ${base.label}` : ''}):`);
  console.log(`     total ${sign(d('totalCssBytes'))} B · gzip ${sign(d('gzippedCssBytes'))} B · scoped ${sign(d('scopedCssBytes'))} B · unused ${sign(d('unusedScopedBytes'))} B · scoped-selectors ${sign(d('unusedScopedSelectors'))}`);
} else {
  console.log(`  (no baseline yet at ${BASELINE})`);
}

if (flags.has('--write-baseline')) {
  const record = { commit: shortCommit(), label: label || undefined, measuredPage: page, measurement };
  writeFileSync(BASELINE, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`\n✓ wrote baseline → ${BASELINE}`);
}
console.log('');
