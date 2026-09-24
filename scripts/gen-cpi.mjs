/**
 * Regenerate src/data/cpi-us.ts — the BLS CPI-U series the inflation calculator reads.
 *
 * The series is CUUR0000SA0: all urban consumers, U.S. city average, all items, NOT
 * seasonally adjusted, 1982-84 = 100. The historical run comes from the `cpi-us` package,
 * which mirrors that series; recent months that the mirror has not picked up yet are added
 * by hand from the BLS monthly news release and listed in RECENT below.
 *
 *   node scripts/gen-cpi.mjs            rewrite the data file
 *   node scripts/gen-cpi.mjs --check    fail if the file is not what this script produces
 *
 * TWO RULES THAT MUST NOT BE RELAXED
 *
 * 1. A month BLS never published stays `null`. The upstream mirror fills October 2025 —
 *    the month lost to the 2025 lapse in appropriations — with the midpoint of its
 *    neighbours. That is a made-up number wearing the costume of data, and it is stripped
 *    here. The check below refuses any month that sits exactly on the midpoint of its
 *    neighbours in the three-decimal era, which is the signature of that kind of fill.
 *
 * 2. Anything added to RECENT must be checked against the 12-month change BLS headlined
 *    with, in src/data/cpi-us.test.ts, before it ships.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OUT = new URL('../src/data/cpi-us.ts', import.meta.url);

/** Months published after the mirror's last release. `null` pads the rest of the year. */
const RECENT = {
  2026: [325.252, 326.785, 330.213, 333.020, 335.123, 333.952, 333.918, null, null, null, null, null],
};

/** Months BLS never published, and why. */
const NEVER_PUBLISHED = [
  { year: 2025, month: 10, reason: '2025 lapse in appropriations — prices were never collected' },
];

function load() {
  let mirror;
  try {
    mirror = require('cpi-us/dist/data.json');
  } catch {
    console.error(
      'cpi-us is not installed. Run `npm i -D cpi-us` to regenerate, or edit RECENT by hand.',
    );
    process.exit(2);
  }
  const firstYear = mirror.firstYear;
  const years = mirror.cpi.map((row) => row.map(Number));

  for (const { year, month } of NEVER_PUBLISHED) {
    const row = years[year - firstYear];
    if (!row) continue;
    const [a, b, c] = [row[month - 2], row[month - 1], row[month]];
    if (Number.isFinite(a) && Number.isFinite(c) && Math.abs(b - (a + c) / 2) > 1e-9) {
      console.warn(`warning: ${year}-${month} is not the midpoint of its neighbours; check upstream.`);
    }
    row[month - 1] = null;
  }

  for (const [year, row] of Object.entries(RECENT)) {
    const i = Number(year) - firstYear;
    years[i] = row.slice();
  }
  return { firstYear, years };
}

/** A month landing exactly on the midpoint of its neighbours is a filled hole, not data. */
function assertNoInterpolation(firstYear, years) {
  const flat = years.flat();
  const start = flat.length - 12 * 20;
  for (let k = start + 1; k < flat.length - 1; k += 1) {
    const [a, b, c] = [flat[k - 1], flat[k], flat[k + 1]];
    if (a === null || b === null || c === null || a === c) continue;
    if (Math.abs(b - (a + c) / 2) < 1e-9) {
      const idx = Math.floor(k / 12) + firstYear;
      throw new Error(`interpolated value detected near ${idx}-${(k % 12) + 1}`);
    }
  }
}

function render({ firstYear, years }) {
  const rows = years
    .map((row, i) => `  /* ${firstYear + i} */ [${row.map((v) => (v === null ? 'n' : v)).join(',')}],`)
    .join('\n');
  return `/**
 * U.S. Consumer Price Index for All Urban Consumers (CPI-U), U.S. city average,
 * all items, NOT seasonally adjusted — BLS series CUUR0000SA0, 1982-84 = 100.
 *
 * GENERATED — do not edit by hand. Regenerate with scripts/gen-cpi.mjs.
 *
 * Provenance
 *   1913-2025  the published BLS series, mirrored by the \`cpi-us\` package
 *              (https://github.com/8hobbies/cpi-us), which tracks CUUR0000SA0.
 *   2026       BLS monthly news releases.
 *
 * Verification (see cpi-us.test.ts): annual averages reproduce the BLS published
 * averages (2016 = 240.007, 2020 = 258.811, 2024 = 313.689), and every 2026 month
 * reproduces its released 12-month change against the same month of 2025.
 *
 * OCTOBER 2025 IS NULL ON PURPOSE. Prices were never collected that month because of
 * the 2025 lapse in appropriations, so BLS published no index. The upstream package
 * fills the hole with the midpoint of September and November; that is a made-up
 * number and it is removed here. A missing month is missing — never interpolated.
 */

/** A month with no published index. */
const n = null;

export const CPI_FIRST_YEAR = ${firstYear};

/** One row per year from CPI_FIRST_YEAR, twelve months each, \`null\` where unpublished. */
export const CPI_MONTHLY: readonly (readonly (number | null)[])[] = [
${rows}
];
`;
}

const data = load();
assertNoInterpolation(data.firstYear, data.years);
const next = render(data);

if (process.argv.includes('--check')) {
  const current = readFileSync(OUT, 'utf8');
  if (current !== next) {
    console.error('✗ src/data/cpi-us.ts is out of date — run `node scripts/gen-cpi.mjs`.');
    process.exit(1);
  }
  console.log('✓ src/data/cpi-us.ts is current.');
} else {
  writeFileSync(OUT, next);
  console.log(`✓ wrote src/data/cpi-us.ts (${data.years.length} years from ${data.firstYear}).`);
}
