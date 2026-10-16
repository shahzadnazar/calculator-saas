/**
 * Sitemap `lastmod` for pages that record no date of their own.
 *
 * Most pages already declare one somewhere the reader can see it: a calculator's
 * `reviewedDate`, a guide's frontmatter, a reference table's `reviewed`, or
 * ContentLayout's `updated` prop, which renders as "Last updated …". The sitemap
 * reuses those, so the date a crawler is told and the date a visitor is shown
 * can never disagree.
 *
 * A couple of pages legitimately show no date — /about and /contact are not the
 * kind of page a reader needs one on — but they still need an accurate
 * `lastmod`, because every indexable URL does. Declaring it here keeps the two
 * concerns separate: this is sitemap metadata, not page content, and nothing
 * here renders.
 *
 * Seeded from each file's real last content change. Bump the entry when you edit
 * the page; a stale date here is worse than none at all, because it tells a
 * crawler nothing changed when something did.
 *
 * A path must NEVER appear both here and as an `updated` prop on its own page —
 * two sources for one date is two dates waiting to drift. `lastmod.test.ts`
 * fails if that happens.
 */
export const PAGE_LASTMOD: Readonly<Record<string, string>> = {
  '/about': '2026-09-07',
  '/contact': '2026-09-29',
};
