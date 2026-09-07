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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CSS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'styles', 'global.css');

export function readToken(name, css = readFileSync(CSS, 'utf8')) {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(css);
  if (!m) throw new Error(`brand-palette: no --${name} in src/styles/global.css`);
  return m[1];
}

/** The colours the generated brand assets use, named as the Logo component uses them. */
export function readPalette() {
  const css = readFileSync(CSS, 'utf8');
  return {
    brand: readToken('color-brand-600', css), // the mark's rounded square, and the wordmark tail
    accent: readToken('color-accent-400', css), // the one highlighted "operator" key
    tintFrom: readToken('color-brand-50', css), // OG card background gradient
    tintTo: readToken('color-brand-100', css),
    pillText: readToken('color-brand-700', css), // the OG card's label pill
  };
}
