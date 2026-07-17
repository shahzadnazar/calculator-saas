/**
 * Generates raster brand assets (favicons, app icons, social share image) from
 * inline SVG so they are reproducible and versioned. Run: `npm run assets`.
 * Uses sharp, which ships as an Astro dependency.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BRAND = '#2563eb';
const ACCENT = '#34d399';

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

const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eff6ff"/>
      <stop offset="1" stop-color="#dbeafe"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="12" fill="${BRAND}"/>
  <g transform="translate(90, 150)">
    <g transform="scale(2.6)">
      <rect width="32" height="32" rx="8" fill="${BRAND}"/>
      <rect x="6" y="5" width="20" height="8" rx="2" fill="#ffffff" fill-opacity="0.92"/>
      <rect x="6" y="16" width="5.5" height="5.5" rx="1.4" fill="#fff"/>
      <rect x="13.25" y="16" width="5.5" height="5.5" rx="1.4" fill="#fff"/>
      <rect x="20.5" y="16" width="5.5" height="5.5" rx="1.4" fill="${ACCENT}"/>
      <rect x="6" y="23.25" width="5.5" height="3.75" rx="1.4" fill="#fff"/>
      <rect x="13.25" y="23.25" width="5.5" height="3.75" rx="1.4" fill="#fff"/>
      <rect x="20.5" y="23.25" width="5.5" height="3.75" rx="1.4" fill="${ACCENT}"/>
    </g>
    <text x="105" y="60" font-family="DejaVu Sans, Arial, sans-serif" font-size="52" font-weight="bold" fill="#0f172a">AllCalculators</text>
  </g>
  <text x="90" y="360" font-family="DejaVu Sans, Arial, sans-serif" font-size="72" font-weight="bold" fill="#0f172a">Every calculator you need,</text>
  <text x="90" y="450" font-family="DejaVu Sans, Arial, sans-serif" font-size="72" font-weight="bold" fill="${BRAND}">in one place.</text>
  <text x="90" y="530" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" fill="#475569">Free · Fast · Accurate · No sign-up</text>
</svg>`;

async function png(svg, size, name) {
  const out = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await writeFile(join(publicDir, name), out);
  console.log('✓', name);
}

async function main() {
  await mkdir(join(publicDir, 'og'), { recursive: true });

  await png(markSvg(32), 32, 'favicon-32.png');
  await png(markSvg(180), 180, 'apple-touch-icon.png');
  await png(markSvg(192), 192, 'icon-192.png');
  await png(markSvg(512), 512, 'icon-512.png');
  await png(markSvg(512), 512, 'logo.png');

  const og = await sharp(Buffer.from(ogSvg)).png().toBuffer();
  await writeFile(join(publicDir, 'og', 'default.png'), og);
  console.log('✓', 'og/default.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
