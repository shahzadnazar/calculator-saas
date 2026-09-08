/**
 * Generate per-page Open Graph images (1200x630 PNG) into public/og/.
 *
 * SOLE OWNER of public/og/ — every card, `default.png` included. `generate-assets.mjs` used to
 * write its own simpler `default.png` too, which made the result depend on run order; it now
 * produces brand marks only. See `scripts/asset-outputs.mjs`.
 *
 * Run offline; the PNGs are committed as static assets, so the site build has NO
 * dependency on satori/resvg. Regenerate after adding pages or changing the
 * template:
 *   npm i --no-save satori @resvg/resvg-js @fontsource/inter
 *   npm run assets:og
 *
 * Layout is satori (flexbox → SVG, text shaped with Inter woff), rasterized to
 * PNG by resvg. Titles/labels come straight from the registries.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { CATEGORIES, getLiveCalculators, getCategory } from '../src/data/calculators.ts';
import { REFERENCES } from '../src/data/reference.ts';
import { CLUSTERS } from '../src/data/clusters.ts';
import { TASK_GROUPS } from '../src/data/tasks.ts';
import { SITE, wordmarkParts } from '../src/config/site.ts';
import { readPalette } from './brand-palette.mjs';
import { OG_DIR } from './asset-outputs.mjs';
import { brandMarkSvg } from './brand-mark.mjs';

// Brand text comes from the config, so a rebrand never leaves 97 stale PNGs behind.
const { lead: BRAND_LEAD, tail: BRAND_TAIL } = wordmarkParts();
// Colours come from the design tokens, not from copies that go stale.
const { brand: BRAND, accent: ACCENT, tintTo: PILL_BG, pillText: PILL_TEXT } = readPalette();
const BRAND_HOST = SITE.url.replace(/^https?:\/\//, '');

const F = 'node_modules/@fontsource/inter/files';
const fonts = [
  { name: 'Inter', weight: 400, style: 'normal', data: readFileSync(`${F}/inter-latin-400-normal.woff`) },
  { name: 'Inter', weight: 600, style: 'normal', data: readFileSync(`${F}/inter-latin-600-normal.woff`) },
  { name: 'Inter', weight: 700, style: 'normal', data: readFileSync(`${F}/inter-latin-700-normal.woff`) },
];

const LOGO = brandMarkSvg({ size: 64, id: '-og' });
const LOGO_URI = 'data:image/svg+xml;base64,' + Buffer.from(LOGO).toString('base64');

const el = (type, style, children) => ({ type, props: { style: { display: 'flex', ...style }, children } });
const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function card({ title, subtitle, label }) {
  return el('div', {
    width: '1200px', height: '630px', flexDirection: 'column', justifyContent: 'space-between',
    padding: '72px', backgroundColor: '#ffffff', fontFamily: 'Inter',
  }, [
    el('div', { position: 'absolute', top: '0px', left: '0px', width: '1200px', height: '10px', backgroundColor: BRAND }, []),
    // Brand row
    el('div', { alignItems: 'center', gap: '18px' }, [
      { type: 'img', props: { src: LOGO_URI, width: 60, height: 60, style: { display: 'flex' } } },
      el('div', { fontSize: '32px', fontWeight: 800, color: '#0f172a' }, [
        BRAND_LEAD, el('span', { color: BRAND }, [BRAND_TAIL]),
      ]),
    ]),
    // Title + subtitle
    el('div', { flexDirection: 'column', gap: '22px' }, [
      el('div', { fontSize: '64px', fontWeight: 700, color: '#0f172a', lineHeight: '1.08', letterSpacing: '-0.03em', maxWidth: '1010px' }, [title]),
      ...(subtitle ? [el('div', { fontSize: '30px', color: '#64748b', lineHeight: '1.35', maxWidth: '980px' }, [subtitle])] : []),
    ]),
    // Footer row
    el('div', { alignItems: 'center', justifyContent: 'space-between' }, [
      el('div', { alignItems: 'center', backgroundColor: PILL_BG, color: PILL_TEXT, fontSize: '26px', fontWeight: 600, padding: '10px 24px', borderRadius: '999px' }, [label]),
      el('div', { fontSize: '26px', color: '#94a3b8', fontWeight: 500 }, [BRAND_HOST]),
    ]),
  ]);
}

const OUT_DIR = `public/${OG_DIR}`;

async function write(name, opts) {
  const svg = await satori(card(opts), { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  writeFileSync(`${OUT_DIR}/${name}.png`, png);
}

const jobs = [];
// Default
jobs.push(['default', { title: SITE.tagline, subtitle: 'Free, fast and accurate online calculators for finance, health, math and everyday life.', label: SITE.name }]);
// Categories
for (const c of CATEGORIES) jobs.push([`cat-${c.slug}`, { title: c.name, subtitle: c.description, label: 'Category' }]);
// Calculators
for (const c of getLiveCalculators()) jobs.push([`calc-${c.slug}`, { title: c.title, subtitle: truncate(c.description, 120), label: getCategory(c.category)?.shortName ?? 'Calculator' }]);
// References
for (const r of REFERENCES) jobs.push([`ref-${r.slug}`, { title: r.shortName, subtitle: truncate(r.description, 120), label: 'Reference table' }]);
// Clusters (topic hubs)
for (const cl of CLUSTERS) jobs.push([`topic-${cl.slug}`, { title: cl.title, subtitle: truncate(cl.description, 120), label: 'Topic' }]);
// Task hubs (primary IA) — lead with the intent question.
for (const t of TASK_GROUPS) jobs.push([`task-${t.slug}`, { title: t.question, subtitle: t.title, label: 'Calculators by task' }]);
// Guides — read frontmatter title from the MDX files
for (const file of readdirSync('src/content/guides').filter((f) => f.endsWith('.mdx'))) {
  const src = readFileSync(`src/content/guides/${file}`, 'utf8');
  const title = (src.match(/title:\s*"([^"]+)"/) || [])[1] || file.replace('.mdx', '');
  const desc = (src.match(/description:\s*"([^"]+)"/) || [])[1] || '';
  jobs.push([`guide-${file.replace('.mdx', '')}`, { title, subtitle: truncate(desc, 120), label: 'Guide' }]);
}

// Owning the directory means creating it: the brand generator used to do this on the way to
// writing its own default.png, and no longer touches public/og at all.
mkdirSync(OUT_DIR, { recursive: true });

let done = 0;
for (const [name, opts] of jobs) {
  await write(name, opts);
  done++;
}
console.log(`Generated ${done} OG images into ${OUT_DIR}/`);
