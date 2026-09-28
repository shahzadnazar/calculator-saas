/**
 * Generates the BRAND assets — the favicons, the app icons and the logo — from the one shared
 * mark in `brand-mark.mjs`, so they are reproducible and versioned. Run: `npm run assets:brand`.
 *
 * This script does NOT produce Open Graph images. `scripts/gen-og.mjs` owns everything under
 * `public/og/`, including `default.png`; see `scripts/asset-outputs.mjs`.
 *
 * Uses sharp, which ships as an Astro dependency.
 */
import sharp from 'sharp';
import { brandMarkSvg } from './brand-mark.mjs';
import { assertBrandOutput, BRAND_ASSETS } from './asset-outputs.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// One definition of the mark, rendered at each size the browsers and app stores ask for.
const mark = brandMarkSvg();

async function png(size, name) {
  assertBrandOutput(name);
  const out = await sharp(Buffer.from(mark)).resize(size, size).png().toBuffer();
  await writeFile(join(publicDir, name), out);
  console.log('✓', name);
}

async function svg(name) {
  assertBrandOutput(name);
  await writeFile(join(publicDir, name), `${mark}\n`);
  console.log('✓', name);
}

async function main() {
  await mkdir(publicDir, { recursive: true });

  await svg('favicon.svg');
  await png(32, 'favicon-32.png');
  await png(180, 'apple-touch-icon.png');
  await png(192, 'icon-192.png');
  await png(512, 'icon-512.png');
  await png(512, 'logo.png');

  console.log(`✓ ${BRAND_ASSETS.length} brand assets — Open Graph images are gen-og.mjs's job`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
