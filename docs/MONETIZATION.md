# Monetization Strategy

**Principle: build trust first, revenue second — and never one stream at the
expense of UX.** Every stream below is architected and OFF by default. Config
lives in `src/config/monetization.ts`; nothing activates until traffic, trust
and (where needed) approvals are in place.

Why diversify (not just AdSense): display ads pay poor RPM on a new site, can be
switched off by one policy change, and hurt UX if overdone. A calculator site's
real value is **high commercial intent** (loans, mortgages, investing, insurance)
and an **owned audience** — which affiliate, email and premium capture far better
than banners.

## The nine streams — status, mechanism, when to turn on

| # | Stream | Built | Mechanism in this codebase | Activate when |
|---|---|---|---|---|
| 1 | **Display ads** | ✅ `AdSlot` + `ADS` config | Central, density-capped, lazy-loaded, CLS-safe slots | ~10–50k sessions/mo + AdSense approval (needs the trust pages we already ship) |
| 2 | **Affiliate** | ✅ `offers.ts` + `RelatedOffers` (disclosed) | Contextual, FTC-disclosed, `rel="sponsored"` offers per calculator | As soon as relevant partner programs are approved (finance first) |
| 3 | **Email** | ✅ `Newsletter` + `NEWSLETTER` config | Inline, no-popup capture on guides/home → owned audience | Now-ish: add a provider endpoint; start collecting from day one |
| 4 | **Premium tools** | ⭘ `PREMIUM` flag | Freemium extras (PDF/print export, saved history, ad-free) | After a loyal base exists; needs payments + entitlement edge function |
| 5 | **Digital products** | ⭘ `DIGITAL_PRODUCTS` flag | Templates, printables, ebooks as static product pages | When we have audience + a checkout provider |
| 6 | **Sponsorships** | ✅ via `RelatedOffers` (`sponsored:true`) | Same disclosed slot, direct-sold, labelled "Sponsored" | Once category pages have meaningful traffic |
| 7 | **Membership** | ⭘ `MEMBERSHIP` flag | Accounts: sync, history, ad-free | Needs auth backend; later stage |
| 8 | **Public API** | ⭘ `PUBLIC_API` flag | `src/lib/calculators/*` are pure + tested → expose via serverless | When there's developer demand; the logic is already API-shaped |
| 9 | **Embeddable / SaaS** | ⭘ `EMBEDDABLE` flag | iframe/script embeds of the islands; white-label | Doubles as an **authority play** — embeds earn backlinks |

## UX guardrails (non-negotiable)

- **Never above the tool.** Users came for an answer; ads/offers sit *below* it.
- **No layout shift.** Reserve space or lazy-load; protect LCP/CLS (our current
  near-zero-JS pages are a competitive edge — see `docs/COMPETITOR-RESEARCH.md`,
  where the incumbent's ad-driven CLS is a documented weakness).
- **Density cap** (`ADS.maxUnitsPerPage`) — RPM is a curve, not a line; past a
  point more ads *lower* revenue by tanking dwell time and rankings.
- **No pop-ups / interstitials** for email. Inline only.
- **Disclosure always** on affiliate/sponsored links (FTC + EEAT). Relevance is
  mandatory — an irrelevant offer costs more trust than it earns.
- **No fabricated ratings/reviews** (we deliberately omit `aggregateRating`).

## Metrics the architecture is built to move

Revenue = Traffic × RPM. We grow both sides without dark patterns:

- **Session duration ↑** — calculators embedded inside guides, deep explainers,
  worked examples. (Incumbent avg session is ~4:49; depth is how you match it.)
- **Pages per visit ↑** — registry-driven "Related calculators", "Read more"
  guides, and category interlinking on every page.
- **Return visitors ↑** — the email list (owned audience) + genuinely fast,
  clean, ad-light UX that people *choose* to come back to.
- **CTR / RPM ↑ (when ads on)** — contextual affiliate offers on high-intent
  finance pages typically out-earn display CPMs many times over; placement and
  density tuning, not volume, drive RPM.

## Rollout sequence

1. **Now:** ship trust — accurate tools, EEAT/legal pages, fast UX (done).
   Wire in the (empty) email + offer slots (done). Add analytics to measure.
2. **First revenue:** enable **affiliate** on finance calculators (highest
   intent) with 1–3 genuinely useful, disclosed partners each. Turn on **email**.
3. **At traffic:** apply for **display ads**; enable with strict density.
4. **With a base:** launch **premium**, **digital products**, **embeddable
   widgets** (widgets also feed the authority/link program).
5. **Later:** **membership**, **public API**, **SaaS**.

Everything above is a config flip away — by design.

---

## Monetization-region architecture (R5 — architecture only, all off)

A higher-level orchestrator now sits above the specialized modules. It does NOT
replace `AdSlot`, `RelatedOffers` or `EmbedBox` — they keep their
responsibilities — and it is NOT wired into any live layout (that is R6).

- **`src/config/monetization.ts` → `MONETIZATION_CONFIG`** — the single source of
  placement decisions. `enabled: false` globally and per placement; each
  placement documents its intended module + reservation + consent requirement.
- **`src/lib/monetization/policy.ts`** — pure resolvers (`resolvePlacement`,
  no-fill/CLS + static-collapse policy, sidebar container eligibility, disclosure
  selection, consent, and safe-event helpers that never carry input/result/query
  data).
- **`src/components/monetization/MonetizationRegion.astro`** — resolves the
  config → a labelled `complementary` region + disclosure → the specialized
  module (distinct per kind), rendered as a SIBLING of the result, never inside a
  result primitive. Not-permitted → renders nothing (no space, no request).
- **`/dev/monetization`** — internal, noindex, sitemap-excluded demo of every
  state / module / gate with placeholders only.

**Status:** every placement is disabled. No AdSense/affiliate/analytics/consent
provider or script is integrated. A vendor-neutral `ConsentState` defaults to all
denied; a real CMP + providers remain deferred. `CalculatorLayout` integration
and homepage monetization (after its future dashboard) are later phases.

## CalculatorLayout integration (R6 — eligibility + layout only, still all off)

R6 wires the orchestrator into `CalculatorLayout` (both presentation modes)
WITHOUT enabling anything. With the production config (all off), every live
calculator page is byte-identical to the pre-R6 build — no region, wrapper,
reserved space, landmark, monetization CSS, bridge, tracking or request.

- **`monetization` prop (`CalculatorMonetizationOptions`)** — `allowSidebar`,
  `enablePostResult`, `enableInContent`, `enableRelatedTools`, `resultSelector`,
  all default off. Eligibility only: no provider ids, and it cannot bypass the
  global config, consent or result-state gating.
- **`src/lib/monetization/layout.ts`** — pure `planCalculatorMonetization` ANDs
  each opt-in with the global + per-placement `enabled` flags. Off config →
  all-false plan → the layout renders nothing.
- **Result-state bridge (`src/lib/monetization/result-bridge.ts` + inline script)**
  — the post-result region is a `hidden`, client-gated sibling of the result,
  revealed by observing `[data-result-shell]` state only for a fresh valid result
  (`valid && !stale && !calculating`). The percentage tool's three equations share
  ONE region — any one fresh valid result qualifies. The inline observer is emitted
  ONLY when the region is active, so disabled pages run no monetization JS.
- **CSS** — `.mon-*` styles live in `src/lib/monetization/styles.ts`, emitted
  inline only when a region renders (the components carry no scoped `<style>`, so
  referencing them never links CSS onto a disabled page).
- **Gate** — `npm run assert:mon-off` fails the build if any monetization artifact
  appears on a live page while the config is disabled.

**Status:** integration complete; every placement still disabled. Enabling live
revenue, a CMP, ad/affiliate providers, and homepage/category/guide monetization
remain later phases.
