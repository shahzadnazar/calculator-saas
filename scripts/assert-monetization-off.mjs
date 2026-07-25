/**
 * Backward-compat / disabled-monetization gate (R6).
 *
 * While the central MONETIZATION_CONFIG is disabled, integrating monetization
 * into CalculatorLayout must add NOTHING to any live page — no region, no
 * workspace wrapper, no result-state bridge, no monetization CSS, no client
 * tracking. This guard fails the build if any monetization artifact appears in a
 * live (non-/dev/) HTML page, so a stray enable or a whitespace/CSS regression
 * cannot ship silently.
 *
 *   node scripts/assert-monetization-off.mjs   # run after `astro build`
 *
 * The internal /dev/monetization demo is exempt (it renders regions on purpose
 * with its own enabled demo config) and is removed before launch by
 * assert-no-dev.mjs anyway.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
// Markers that only ever appear when a monetization region / landmark / reserved
// slot / CSS / result-state bridge renders. `data-mon-` covers rendered region
// HTML, the `complementary` landmark (`data-mon-region`), reserved slots
// (`data-mon-reserve`) and the bridge's own source (it queries
// `[data-mon-client-gated]` / sets `data-mon-eligible`). `data-calculator-workspace`
// is the bridge's scope root, emitted only when the bridge is active. The CSS
// markers catch the inline monetization stylesheet. A provider script/URL is only
// ever loaded from inside a rendered region, so the absence of every marker also
// means no provider request can fire (the E2E suite additionally asserts zero
// third-party requests at runtime).
const MARKERS = ['data-mon-', 'data-calculator-workspace', 'mon-region{', 'mon-workspace{'];

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Exempt the internal demo route; it renders placeholders deliberately.
      if (full === join(DIST, 'dev')) continue;
      yield* htmlFiles(full);
    } else if (entry.endsWith('.html')) {
      yield full;
    }
  }
}

const offenders = [];
for (const file of htmlFiles(DIST)) {
  const html = readFileSync(file, 'utf8');
  const hits = MARKERS.filter((m) => html.includes(m));
  if (hits.length) offenders.push(`${file}: ${hits.join(', ')}`);
}

if (offenders.length) {
  console.error(`✗ Monetization artifacts found on ${offenders.length} live page(s) while the config is disabled:`);
  for (const o of offenders.slice(0, 20)) console.error(`  - ${o}`);
  if (offenders.length > 20) console.error(`  …and ${offenders.length - 20} more`);
  console.error('  Live pages must be free of monetization output until MONETIZATION_CONFIG is deliberately enabled.');
  process.exit(1);
}

console.log('✓ No monetization artifacts on any live page (monetization is disabled).');
