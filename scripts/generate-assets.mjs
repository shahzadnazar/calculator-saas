/**
 * Generates the raster BRAND assets — favicons, app icons and the logo — from inline SVG so
 * they are reproducible and versioned. Run: `npm run assets:brand`.
 *
 * This script does NOT produce Open Graph images. `scripts/gen-og.mjs` owns everything under
 * `public/og/`, including `default.png`; see `scripts/asset-outputs.mjs`.
 *
 * Uses sharp, which ships as an Astro dependency.
 */
import sharp from 'sharp';
import { readPalette } from './brand-palette.mjs';
import { assertBrandOutput, BRAND_ASSETS } from './asset-outputs.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Read from the design tokens so the icons cannot drift from the site again.
const { brand: BRAND, accent: ACCENT } = readPalette();

const markSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
  <rect width="32" height="32" rx="8" fill="${BRAND}"/>
  <rect x="6" y="5" width="20" height="8" rx="2" fill="#ffffff" fill-opacity="0.92"/>
  <g fill="#ffffff">
    <rect x="6" y="16" width="5.5" height="5.5" rx="1.4"/>
    <rect x="13.25" y="16" width="5.5" height="5.5" rx="1.4"/>
    <rect x="20.5" y="16" width="5.5" height="5.5" rx="1.4" fill="${ACCENT}"/>
    <rect x="6" y="23.25" width="5.5" height="3.75" rx="1.4"/>
    <rect x="13.25" y="23.25" width="5.5" height="3.75" rx="1.4"/>
    <rect x="20.5" y="23.25" width="5.5" height="3.75" rx="1.4" fill="${ACCENT}"/>
  </g>
</svg>`;

async function png(svg, size, name) {
  assertBrandOutput(name);
  const out = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await writeFile(join(publicDir, name), out);
  console.log('✓', name);
}

async function main() {
  await mkdir(publicDir, { recursive: true });

  await png(markSvg(32), 32, 'favicon-32.png');
  await png(markSvg(180), 180, 'apple-touch-icon.png');
  await png(markSvg(192), 192, 'icon-192.png');
  await png(markSvg(512), 512, 'icon-512.png');
  await png(markSvg(512), 512, 'logo.png');

  console.log(`✓ ${BRAND_ASSETS.length} brand assets — Open Graph images are gen-og.mjs's job`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
