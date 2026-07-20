import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMBED_COMPONENTS } from './embed-components';
import { getLiveCalculators } from './calculators';

/**
 * R7D1 coverage — the canonical embed-component map (the single source that
 * generates the per-slug public embed pages) must match the live registry EXACTLY,
 * and each generated page must be a LITERAL static import of one island (the whole
 * point of the code-split). No hand-maintained second component map; the registry
 * stays the authority on which calculators are live.
 */
const live = getLiveCalculators();
const liveSlugs = new Set(live.map((c) => c.slug));
const entries = Object.entries(EMBED_COMPONENTS);

describe('embed-components ↔ registry coverage', () => {
  it('has exactly one entry per LIVE calculator — no missing, no extra', () => {
    for (const c of live) expect(EMBED_COMPONENTS[c.slug], `missing embed entry for ${c.slug}`).toBeTruthy();
    for (const [slug] of entries) expect(liveSlugs.has(slug), `embed entry for non-live "${slug}"`).toBe(true);
    expect(entries.length).toBe(live.length);
  });

  it('every entry category matches the registry category', () => {
    for (const c of live) expect(EMBED_COMPONENTS[c.slug].category).toBe(c.category);
  });

  it('every componentPath resolves to a real file', () => {
    for (const [slug, def] of entries) {
      const disk = def.componentPath.replace(/^@components\//, 'src/components/');
      expect(existsSync(resolve(disk)), `${slug}: ${def.componentPath} missing`).toBe(true);
    }
  });

  it('props are serializable and cover the documented special cases only', () => {
    for (const [, def] of entries) {
      if (def.props) for (const v of Object.values(def.props)) expect(['string', 'number', 'boolean']).toContain(typeof v);
    }
    // The only prop in the fleet: standard-deviation reuses StatisticsCalculator with primary='sd'.
    expect(EMBED_COMPONENTS['standard-deviation-calculator'].props).toEqual({ primary: 'sd' });
    expect(EMBED_COMPONENTS['statistics-calculator'].props).toBeUndefined();
    expect(EMBED_COMPONENTS['standard-deviation-calculator'].componentPath).toBe(
      '@components/islands/StatisticsCalculator.astro',
    );
    expect(EMBED_COMPONENTS['scientific-calculator'].componentPath).toBe(
      '@components/calc/ScientificCalculatorEmbed.astro',
    );
    expect(EMBED_COMPONENTS['password-generator'].componentPath).toBe(
      '@components/islands/PasswordGeneratorCalculator.astro',
    );
  });

  it('produces no duplicate routes', () => {
    const routes = entries.map(([slug, d]) => `${d.category}/${slug}`);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('the map keys are sorted (deterministic generation input)', () => {
    const keys = entries.map(([s]) => s);
    expect(keys).toEqual([...keys].sort());
  });
});

describe('generated embed pages are literal static imports', () => {
  it('each page imports exactly its island literally — no dynamic lookup, glob or full-fleet map', () => {
    for (const [slug, def] of entries) {
      const p = resolve('src/pages/embed', def.category, `${slug}.astro`);
      expect(existsSync(p), `missing generated page for ${slug}`).toBe(true);
      const src = readFileSync(p, 'utf8');
      expect(src).toContain(`import Island from '${def.componentPath}';`);
      expect(src).toContain(`getCalculator('${def.category}', '${slug}')`);
      expect(src).toContain("import EmbedPageShell from '@layouts/EmbedPageShell.astro'");
      expect(src).not.toMatch(/import\.meta\.glob/);
      expect(src).not.toMatch(/ISLANDS\[|IslandBySlug/);
      if (def.props) {
        for (const [k, v] of Object.entries(def.props)) {
          const attr = typeof v === 'string' ? `${k}=${JSON.stringify(v)}` : `${k}={${JSON.stringify(v)}}`;
          expect(src, `${slug} should render prop ${k}`).toContain(attr);
        }
      }
    }
  });
});
