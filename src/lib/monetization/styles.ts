/**
 * Monetization CSS (R6) — shipped ONLY where monetization actually renders.
 *
 * WHY THIS IS A STRING, NOT COMPONENT `<style>`: Astro links a component's
 * scoped styles into a page whenever that component is referenced in the page's
 * template — even inside a falsy conditional that never renders. If
 * `MonetizationRegion`/`RevenueModule` carried scoped `<style>`, merely wiring
 * them into `CalculatorLayout` would inline their CSS onto EVERY calculator
 * page, breaking the "disabled ⇒ byte-identical, zero monetization bytes"
 * guarantee. So the components carry no styles, and this namespaced (`.mon-`)
 * global CSS is emitted inline via `<style is:inline set:html>` ONLY when a
 * region is active — by `CalculatorLayout` (when a placement is enabled) and by
 * the internal `/dev/monetization` demo. A disabled live page emits none of it.
 *
 * Everything is `.mon-`-prefixed to stay clear of page/global styles. The
 * sidebar workspace is additive and never compresses the core (600px basis; the
 * aside drops to a full-width row below the result under ~1040px container).
 */
export const MONETIZATION_CSS = `
/* Region wrapper (MonetizationRegion) */
.mon-region{display:block;width:100%}
.mon-region__label{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 .3rem}
.mon-region__reserve{display:grid;place-items:center;border:1px dashed var(--line);border-radius:.5rem;color:var(--muted);font-size:.72rem;text-align:center;padding:.5rem}
.mon-region__loading{opacity:.7}

/* Revenue modules (RevenueModule) — distinct per kind, never result-card styling */
.mon-module{width:100%}
.mon-tag{display:inline-block;font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);background:var(--subtle);border-radius:.35rem;padding:.1rem .45rem}
.mon-tag--sponsored,.mon-tag--product{color:var(--color-brand-700);background:color-mix(in srgb,var(--color-brand-500) 14%,transparent)}
.mon-note{font-size:.72rem;color:var(--muted);margin:0 0 .5rem}
.mon-ad{display:grid;place-items:center;gap:.4rem;min-height:90px;border:1px dashed var(--line);border-radius:.5rem;text-align:center;padding:.75rem}
.mon-ad__body{font-size:.78rem;color:var(--muted);margin:0}
.mon-offers{list-style:none;margin:0;padding:0;display:grid;gap:.4rem}
.mon-offer{display:flex;justify-content:space-between;gap:.75rem;border:1px solid var(--line);border-radius:.5rem;padding:.5rem .7rem;font-size:.85rem}
.mon-offer__cta{color:var(--color-brand-600);font-weight:600}
.mon-sponsored,.mon-promo,.mon-lead{border:1px solid var(--line);border-radius:.5rem;padding:.75rem .9rem}
.mon-sponsored__title,.mon-promo__title,.mon-lead__title{font-weight:700;margin:.4rem 0 .2rem;color:var(--heading);font-size:.95rem}
.mon-sponsored__desc,.mon-lead__note{font-size:.78rem;color:var(--muted);margin:0}
.mon-promo__cta{display:inline-block;margin-top:.3rem;font-size:.85rem;font-weight:600;color:var(--color-brand-600)}

/* Sidebar workspace (CalculatorLayout) — additive, never compresses the core */
.mon-workspace{display:flex;flex-wrap:wrap;align-items:flex-start;gap:2rem;container-type:inline-size}
.mon-workspace__core{flex:1 1 600px;min-width:0}
.mon-workspace__aside{flex:1 1 100%}
@container (min-width:1040px){.mon-workspace__aside{flex:0 0 300px}}

/* Client-gated post-result region: hidden until the bridge confirms a fresh valid result */
[data-mon-client-gated][hidden]{display:none}
`;
