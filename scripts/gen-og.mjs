/**
 * Generate per-page Open Graph images (1200x630 PNG) into public/og/.
 *
 * Run offline; the PNGs are committed as static assets, so the site build has NO
 * dependency on satori/resvg. Regenerate after adding pages or changing the
 * template:
 *   npm i --no-save satori @resvg/resvg-js @fontsource/inter
 *   node --experimental-strip-types scripts/gen-og.mjs
 *
 * Layout is satori (flexbox → SVG, text shaped with Inter woff), rasterized to
 * PNG by resvg. Titles/labels come straight from the registries.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { CATEGORIES, getLiveCalculators, getCategory } from '../src/data/calculators.ts';
import { REFERENCES } from '../src/data/reference.ts';
import { CLUSTERS } from '../src/data/clusters.ts';
import { TASK_GROUPS } from '../src/data/tasks.ts';
import { SITE, wordmarkParts } from '../src/config/site.ts';

// Brand text comes from the config, so a rebrand never leaves 97 stale PNGs behind.
const { lead: BRAND_LEAD, tail: BRAND_TAIL } = wordmarkParts();
const BRAND_HOST = SITE.url.replace(/^https?:\/\//, '');

const F = 'node_modules/@fontsource/inter/files';
const fonts = [
  { name: 'Inter', weight: 400, style: 'normal', data: readFileSync(`${F}/inter-latin-400-normal.woff`) },
  { name: 'Inter', weight: 600, style: 'normal', data: readFileSync(`${F}/inter-latin-600-normal.woff`) },
  { name: 'Inter', weight: 700, style: 'normal', data: readFileSync(`${F}/inter-latin-700-normal.woff`) },
];

const LOGO = `<svg width="64" height="64" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="7.5" fill="#2563eb"/><path d="M0 7.5A7.5 7.5 0 0 1 7.5 0h17A7.5 7.5 0 0 1 32 7.5V13H0Z" fill="#ffffff" fill-opacity="0.08"/><rect x="6" y="5.5" width="20" height="7" rx="2" fill="#ffffff" fill-opacity="0.95"/><g fill="#ffffff"><rect x="6" y="16" width="5.5" height="5.5" rx="1.5"/><rect x="13.25" y="16" width="5.5" height="5.5" rx="1.5"/><rect x="6" y="23.25" width="5.5" height="3.75" rx="1.5"/><rect x="13.25" y="23.25" width="5.5" height="3.75" rx="1.5"/></g><rect x="20.5" y="16" width="5.5" height="11" rx="1.8" fill="#34d399"/></svg>`;
const LOGO_URI = 'data:image/svg+xml;base64,' + Buffer.from(LOGO).toString('base64');

const el = (type, style, children) => ({ type, props: { style: { display: 'flex', ...style }, children } });
const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function card({ title, subtitle, label }) {
  return el('div', {
    width: '1200px', height: '630px', flexDirection: 'column', justifyContent: 'space-between',
    padding: '72px', backgroundColor: '#ffffff', fontFamily: 'Inter',
  }, [
    el('div', { position: 'absolute', top: '0px', left: '0px', width: '1200px', height: '10px', backgroundColor: '#2563eb' }, []),
    // Brand row
    el('div', { alignItems: 'center', gap: '18px' }, [
      { type: 'img', props: { src: LOGO_URI, width: 60, height: 60, style: { display: 'flex' } } },
      el('div', { fontSize: '32px', fontWeight: 800, color: '#0f172a' }, [
        BRAND_LEAD, el('span', { color: '#2563eb' }, [BRAND_TAIL]),
      ]),
    ]),
    // Title + subtitle
    el('div', { flexDirection: 'column', gap: '22px' }, [
      el('div', { fontSize: '64px', fontWeight: 700, color: '#0f172a', lineHeight: '1.08', letterSpacing: '-0.03em', maxWidth: '1010px' }, [title]),
      ...(subtitle ? [el('div', { fontSize: '30px', color: '#64748b', lineHeight: '1.35', maxWidth: '980px' }, [subtitle])] : []),
    ]),
    // Footer row
    el('div', { alignItems: 'center', justifyContent: 'space-between' }, [
      el('div', { alignItems: 'center', backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: '26px', fontWeight: 600, padding: '10px 24px', borderRadius: '999px' }, [label]),
      el('div', { fontSize: '26px', color: '#94a3b8', fontWeight: 500 }, [BRAND_HOST]),
    ]),
  ]);
}

async function write(name, opts) {
  const svg = await satori(card(opts), { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  writeFileSync(`public/og/${name}.png`, png);
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

let done = 0;
for (const [name, opts] of jobs) {
  await write(name, opts);
  done++;
}
console.log(`Generated ${done} OG images into public/og/`);
