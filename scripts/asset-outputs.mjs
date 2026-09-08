/**
 * Which generator owns which files under `public/`.
 *
 * Both generators used to write `public/og/default.png`, so the card that survived was
 * whichever script ran last — the pipeline had no single answer for what the site's default
 * share image looked like. Ownership is declared here once and enforced at the point of
 * writing, so the two cannot silently claim the same path again.
 *
 *   scripts/generate-assets.mjs  →  the brand marks listed below, and nothing else
 *   scripts/gen-og.mjs           →  everything under public/og/, including default.png
 */

/** The only directory `gen-og.mjs` writes to, relative to `public/`. */
export const OG_DIR = 'og';

/** Every file `generate-assets.mjs` produces, relative to `public/`. */
export const BRAND_ASSETS = Object.freeze([
  'favicon.svg',
  'favicon-32.png',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'logo.png',
]);

/**
 * Guard for the brand generator: refuse a path it does not own.
 *
 * Throws rather than warns. A warning is what let the two generators overlap unnoticed.
 */
export function assertBrandOutput(name) {
  if (!BRAND_ASSETS.includes(name)) {
    throw new Error(
      `generate-assets.mjs does not own public/${name}. ` +
        `It owns ${BRAND_ASSETS.join(', ')}; everything under public/${OG_DIR}/ belongs to gen-og.mjs.`,
    );
  }
  return name;
}
