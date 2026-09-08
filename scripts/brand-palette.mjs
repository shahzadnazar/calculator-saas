/**
 * The brand palette, read from the design tokens rather than repeated.
 *
 * The favicon, the app icons and the Open Graph cards are raster files generated offline, so
 * every colour in them is a copy of something `global.css` already defines. Those copies went
 * stale once already — the icons stayed blue for months after the site moved to purple — so
 * the generators read the tokens instead of restating them.
 *
 * Plain regex, no CSS parser: these are `--name: #hex;` declarations in the `@theme` block and
 * nothing more complicated is needed. A missing token throws, because silently falling back to
 * a default colour is how the drift started.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, parse } from 'node:path';

/**
 * The project root, found by walking up to the nearest `package.json`.
 *
 * Not a path relative to this file: `Logo.astro` imports the mark that reads these tokens, so
 * Astro bundles this module into `dist/chunks/` and a `../src/styles` from there points
 * nowhere. Walking up lands on the repo root from both locations.
 */
function projectRoot(from = dirname(fileURLToPath(import.meta.url))) {
  let dir = from;
  while (!existsSync(join(dir, 'package.json'))) {
    const up = dirname(dir);
    if (up === dir) throw new Error(`brand-palette: no package.json above ${from}`);
    dir = up;
  }
  return dir;
}

const CSS = join(projectRoot(), 'src', 'styles', 'global.css');

export function readToken(name, css = readFileSync(CSS, 'utf8')) {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(css);
  if (!m) throw new Error(`brand-palette: no --${name} in src/styles/global.css`);
  return m[1];
}

/** The colours the generated brand assets use, named as the Logo component uses them. */
export function readPalette() {
  const css = readFileSync(CSS, 'utf8');
  return {
    brand: readToken('color-brand-600', css), // the mark's glyphs, and the wordmark tail
    accent: readToken('color-accent-400', css), // the UI accent
    squareFrom: readToken('color-brand-700', css), // the mark's rounded square, top-left...
    squareTo: readToken('color-brand-500', css), // ...to bottom-right
    markKeyFrom: readToken('color-mark-key-from', css), // the highlighted "=" key
    markKeyTo: readToken('color-mark-key-to', css),
    markDot: readToken('color-mark-dot', css), // the corner dot
    tintFrom: readToken('color-brand-50', css), // OG card background gradient
    tintTo: readToken('color-brand-100', css),
    pillText: readToken('color-brand-700', css), // the OG card's label pill
  };
}
