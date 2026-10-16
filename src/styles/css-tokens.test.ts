import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every `var(--x)` written without a fallback has to name a property something defines.
 *
 * This is not style policing. A `var()` whose property is undefined and which carries no
 * fallback does NOT fall through to the next declaration in the cascade: the whole
 * declaration becomes invalid at computed-value time, the property resets to its initial
 * value, and it does so SILENTLY — no build error, no console warning, nothing from
 * `astro check`.
 *
 * Two live bugs came from exactly that, and both reached production looking like a layout
 * problem rather than a typo:
 *
 *   - seven schedule tables painted their sticky header with `var(--surface)`, so the
 *     header resolved to `transparent` and the rows scrolled straight through the column
 *     names on a phone;
 *   - the triangle calculator's inputs used `var(--bg)` and came out transparent while
 *     every other field on the site carried `--card`.
 *
 * `var(--x, <fallback>)` is fine and deliberately allowed — a few places reference a
 * property only some contexts set and name the default right there.
 */

const SRC = new URL('../', import.meta.url).pathname;

/** A property is "defined" if anything in src/ writes `--name:` — in a stylesheet, in an
 *  Astro `<style>`, or inside the template literals the layouts use to set one inline. */
const DEFINITION = /(?:^|[\s;{`'"(])(--[a-zA-Z0-9_-]+)\s*:/gm;
/** The character right after the property name says whether a fallback follows. */
const REFERENCE = /var\(\s*(--[a-zA-Z0-9_-]+)\s*([,)])/g;

/** Comments describe the bug, so they name the broken properties; reading them as code
 *  would make this test fail on its own documentation. */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(astro|css|ts)$/.test(entry) && !entry.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

const files = sourceFiles(SRC);
const sources = new Map(files.map((f) => [f, stripComments(readFileSync(f, 'utf8'))]));

const defined = new Set<string>();
for (const text of sources.values()) {
  for (const [, name] of text.matchAll(DEFINITION)) defined.add(name);
}

/** The dangling references in a body of source — the thing the rule is actually about. */
function dangling(entries: Iterable<[string, string]>): string[] {
  const out: string[] = [];
  for (const [file, text] of entries) {
    for (const [, name, next] of stripComments(text).matchAll(REFERENCE)) {
      if (next === ',') continue; // a fallback is spelled out
      if (defined.has(name)) continue;
      out.push(`${file.replace(SRC, 'src/')}: var(${name})`);
    }
  }
  return out;
}

describe('CSS custom properties', () => {
  it('reads the whole source tree', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(defined.size).toBeGreaterThan(50);
  });

  it('defines the tokens the shared calculator-table header is built from', () => {
    for (const token of ['--subtle', '--fg', '--line', '--card', '--heading']) {
      expect(defined.has(token)).toBe(true);
    }
  });

  it('never references an undefined property without a fallback', () => {
    expect(dangling(sources)).toEqual([]);
  });

  it('still catches the two properties that actually shipped undefined', () => {
    // Guards the detector itself: were the regexes to stop matching, the rule above
    // would pass vacuously. These are the real names that broke.
    expect(dangling([['src/fake.astro', 'a { background: var(--surface); color: var(--bg); }']])).toEqual([
      'src/fake.astro: var(--surface)',
      'src/fake.astro: var(--bg)',
    ]);
  });

  it('accepts a reference that names its own fallback', () => {
    expect(dangling([['src/fake.astro', 'a { color: var(--nope, var(--heading)); }']])).toEqual([]);
  });
});
