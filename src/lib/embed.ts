/**
 * Shared embed-snippet builder — the single source for the copy-paste code that
 * puts a calculator or reference table on another site. Used by EmbedBox (on
 * each page) and the embed gallery, so the snippet is identical everywhere.
 *
 * The attribution `<a>` is intentionally OUTSIDE the iframe (in the host page's
 * DOM): that is what makes it a real backlink — a link inside the iframe would
 * not count.
 *
 * The anchor text is the BRAND, not the calculator's name. It used to read
 * `Free <a>Mortgage Calculator</a> by BestCalculate` — an exact-match keyword
 * anchor, dofollow, byte-identical on every placement. That is the pattern
 * Google's link-spam documentation names when it describes widgets, and its
 * guidance is that keyword-anchored widget links should be nofollow. Ten of
 * those are invisible; two hundred all reading the same three words are a
 * footprint. Moving the link onto the brand keeps everything the host cares
 * about — same tool, same destination, same credit — and drops the footprint,
 * which is also simply what a real attribution looks like when a human writes
 * one.
 */
import { SITE, absoluteUrl } from '@config/site';

export interface EmbedTarget {
  /** Display title, e.g. "Mortgage Calculator". */
  title: string;
  /** Unique slug — namespaces the iframe id and the resize message. */
  slug: string;
  /** Root-relative path of the chrome-less embed page. */
  embedPath: string;
  /** Root-relative path of the canonical page (the backlink target). */
  canonicalPath: string;
}

/**
 * The postMessage type the embed page sends to resize its host iframe.
 *
 * LEGACY is still emitted alongside it, and must stay that way. A snippet is
 * copied once and then frozen in someone else's HTML: the listener half lives
 * on their page forever, while the sending half is ours and updates on every
 * deploy. Renaming only the sender would leave every already-pasted embed stuck
 * at its initial height, on sites we cannot contact.
 */
export const EMBED_RESIZE_MESSAGE = 'bestcalculate-resize';
export const EMBED_RESIZE_MESSAGE_LEGACY = 'allcalc-resize';

/**
 * DOM id for the host's iframe. Safe to rename, unlike the message type: each
 * snippet references its own id and nothing else does, so an old snippet stays
 * internally consistent.
 */
export function embedIframeId(slug: string): string {
  return `bestcalculate-${slug}`;
}

export function buildEmbedSnippet(target: EmbedTarget): string {
  const embedUrl = absoluteUrl(target.embedPath);
  const canonicalUrl = absoluteUrl(target.canonicalPath);
  const id = embedIframeId(target.slug);
  return [
    `<iframe src="${embedUrl}" title="${target.title} by ${SITE.name}" loading="lazy" style="width:100%;border:0;height:640px" id="${id}"></iframe>`,
    `<script>window.addEventListener("message",function(e){if(e.data&&e.data.type==="${EMBED_RESIZE_MESSAGE}"&&e.data.slug==="${target.slug}"){var f=document.getElementById("${id}");if(f)f.style.height=e.data.height+"px";}});</script>`,
    `<p style="font:13px/1.5 sans-serif">${target.title} by <a href="${canonicalUrl}">${SITE.name}</a></p>`,
  ].join('\n');
}
