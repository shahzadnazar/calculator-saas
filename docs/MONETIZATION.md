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
