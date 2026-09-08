/**
 * The logo mark, in one place.
 *
 * The same rounded square lives in the header, the favicon, the app icons and every Open
 * Graph card. It used to be copy-pasted into all four, which is how the old blue mark
 * outlived the purple rebrand in three of them. This module is the only definition; every
 * consumer renders it at the size it needs.
 *
 * Colours come from `brand-palette.mjs`, which reads the design tokens, so the mark cannot
 * drift from the palette either. Plain `.mjs` because the two asset generators run in bare
 * node with no TypeScript loader.
 *
 * Geometry notes, on a 32x32 grid: the square is 29 wide, leaving room at the bottom-right
 * for the dot to sit half outside its corner without touching the viewBox edge.
 */
import { readPalette } from './brand-palette.mjs';

/**
 * @param {object} [opts]
 * @param {number|string} [opts.size]  rendered width/height; omit for a viewBox-only SVG that
 *                                     scales to its container.
 * @param {string} [opts.id]           suffix for the gradient ids — required when more than one
 *                                     mark can land in the same document, since SVG ids are
 *                                     global and duplicates silently repaint the first one.
 */
export function brandMarkSvg({ size, id = '' } = {}) {
  const p = readPalette();
  const dim = size === undefined ? '' : ` width="${size}" height="${size}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"${dim} role="img" aria-hidden="true">
  <defs>
    <linearGradient id="mk-sq${id}" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="${p.squareFrom}"/>
      <stop offset="1" stop-color="${p.squareTo}"/>
    </linearGradient>
    <linearGradient id="mk-sheen${id}" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="mk-eq${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.markKeyFrom}"/>
      <stop offset="1" stop-color="${p.markKeyTo}"/>
    </linearGradient>
  </defs>
  <rect width="29" height="29" rx="8.2" fill="url(#mk-sq${id})"/>
  <rect width="29" height="29" rx="8.2" fill="url(#mk-sheen${id})"/>
  <g fill="#ffffff">
    <rect x="5" y="5" width="8.5" height="8.5" rx="2.7"/>
    <rect x="15.5" y="5" width="8.5" height="8.5" rx="2.7"/>
    <rect x="5" y="15.5" width="8.5" height="8.5" rx="2.7"/>
  </g>
  <rect x="15.5" y="15.5" width="8.5" height="8.5" rx="2.7" fill="url(#mk-eq${id})"/>
  <g stroke="${p.brand}" stroke-width="1.5" stroke-linecap="round">
    <path d="M9.25 7.2v4.1M7.2 9.25h4.1"/>
    <path d="M17.7 9.25h4.1"/>
    <path d="M7.75 17.95l3 3M10.75 17.95l-3 3"/>
  </g>
  <g stroke="#ffffff" stroke-width="1.5" stroke-linecap="round">
    <path d="M17.7 18.7h4.1M17.7 21.3h4.1"/>
  </g>
  <circle cx="26.9" cy="26.9" r="3.6" fill="${p.markDot}"/>
</svg>`;
}
