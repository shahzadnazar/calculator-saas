import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BRAND_ASSETS, OG_DIR, assertBrandOutput } from './asset-outputs.mjs';

/**
 * The two asset generators must not both claim `public/og/default.png`.
 *
 * They did, and the file that survived was whichever script ran last — so the site's default
 * share image had no single answer. These assertions are the cheap part of the fix; the
 * expensive part was noticing.
 */
/** Source with comments removed — the doc headers legitimately DISCUSS the paths they avoid. */
const code = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const brandSrc = code('scripts/generate-assets.mjs');
const ogSrc = code('scripts/gen-og.mjs');

describe('asset output ownership', () => {
  it('lets the brand generator write only the marks it owns', () => {
    for (const name of BRAND_ASSETS) expect(assertBrandOutput(name)).toBe(name);
  });

  it('refuses an Open Graph path from the brand generator', () => {
    expect(() => assertBrandOutput(`${OG_DIR}/default.png`)).toThrow(/does not own/);
    expect(() => assertBrandOutput(`${OG_DIR}/calc-vat-calculator.png`)).toThrow(/gen-og/);
  });

  it('keeps the brand generator out of public/og entirely', () => {
    // A path, not the bare word: the script legitimately NAMES gen-og.mjs when it hands the
    // job over. What must never reappear is a write into that directory.
    expect(brandSrc).not.toMatch(/og\//);
    expect(brandSrc).not.toContain('default.png');
    expect(brandSrc).not.toMatch(/writeFile\([^)]*og/);
  });

  it('leaves gen-og.mjs as the only writer under public/og', () => {
    expect(ogSrc).toContain("import { OG_DIR } from './asset-outputs.mjs'");
    expect(ogSrc).toMatch(/writeFileSync\(`\$\{OUT_DIR\}\/\$\{name\}\.png`/);
  });

  it('runs the two stages in a fixed order, brand then OG', () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(scripts['assets:brand']).toContain('generate-assets.mjs');
    expect(scripts['assets:og']).toContain('gen-og.mjs');
    expect(scripts.assets).toBe('npm run assets:brand && npm run assets:og');
  });
});
