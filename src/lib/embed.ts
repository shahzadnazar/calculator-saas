/**
 * Shared embed-snippet builder — the single source for the copy-paste code that
 * puts a calculator or reference table on another site. Used by EmbedBox (on
 * each page) and the embed gallery, so the snippet is identical everywhere.
 *
 * The attribution `<a>` is intentionally OUTSIDE the iframe (in the host page's
 * DOM): that is what makes it a real backlink — a link inside the iframe would
 * not count.
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

export function embedIframeId(slug: string): string {
  return `allcalc-${slug}`;
}

export function buildEmbedSnippet(target: EmbedTarget): string {
  const embedUrl = absoluteUrl(target.embedPath);
  const canonicalUrl = absoluteUrl(target.canonicalPath);
  const id = embedIframeId(target.slug);
  return [
    `<iframe src="${embedUrl}" title="${target.title} by ${SITE.name}" loading="lazy" style="width:100%;border:0;height:640px" id="${id}"></iframe>`,
    `<script>window.addEventListener("message",function(e){if(e.data&&e.data.type==="allcalc-resize"&&e.data.slug==="${target.slug}"){var f=document.getElementById("${id}");if(f)f.style.height=e.data.height+"px";}});</script>`,
    `<p style="font:13px/1.5 sans-serif">Free <a href="${canonicalUrl}">${target.title}</a> by ${SITE.name}</p>`,
  ].join('\n');
}
