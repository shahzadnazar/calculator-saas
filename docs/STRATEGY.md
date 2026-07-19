# AllCalculators — Product & SEO Strategy

> **Non-negotiable product doctrine:** every calculator and content surface must
> comply with **Global Task-Completion Psychology**
> (`docs/TASK-COMPLETION-DOCTRINE.md`) and the content/density standards in
> `docs/CONTENT-STYLE.md`. All design and migration reviews evaluate compliance.

This document records the strategic decisions behind the rebuild: what we found,
what we chose, the trade-offs, and the roadmap. It is the reference for why the
architecture looks the way it does.

---

## 1. Where we started

The uploaded project was a static HTML calculator site (~55 calculators). The
maths was largely sound, but the delivery was not viable for an authority site.
Measured findings:

| Finding | Extent | Impact |
| --- | --- | --- |
| `cdn.tailwindcss.com` (dev-only CDN) on every page | 58/58 pages | Render-blocking; recompiles CSS in-browser. Fails Core Web Vitals. |
| Branded **"Calculator.net"** (a competitor's trademark) | 61 files | Legal risk; no ownable brand; impossible to build brand equity. |
| No `sitemap.xml` / `robots.txt` | — | No crawl foundation. |
| No shared components | 55+ files | A nav change meant editing 55 files. Does not scale. |
| Inconsistent titles (`Document`, mixed formats) | many | Weak on the #1 on-page ranking signal. |
| Broken internal links, junk files (`.exe`, a PDF book) in repo | several | Broken UX; unprofessional repo. |

**Conclusion:** the content/maths were salvageable; the architecture, branding
and delivery were not. Patching 58 copy-pasted files would cap the ceiling
permanently.

## 2. Decisions

### Rebuild on Astro (static output)
- **Why:** purpose-built for content + tools. Zero JS by default, island
  hydration only where needed → best-in-class CWV (objective: extreme speed).
  Components give one source of truth (maintainability, reuse). Static output is
  cheap, fast and CDN-friendly.
- **Trade-off:** real migration cost vs. cosmetic patching. We chose migration
  because the patch path cannot host a content/guide engine, cannot guarantee
  CWV, and cannot scale.
- **Long-term:** ready for programmatic SEO and an editorial content layer — the
  things that actually build topical authority and ad inventory.

### Data-driven calculator registry
- Every calculator + category is **data** (`src/data/calculators.ts`). Nav,
  sitemap, category pages, related links and structured data derive from it.
- **Effect:** calculator #56–#500 are near-free to add. This is the core
  scalability lever.

### Logic separated from UI, and unit-tested
- Pure functions in `src/lib/calculators/` with Vitest coverage. A safe
  expression evaluator (shunting-yard, **no `eval`**) powers the scientific
  calculator — secure and correct.
- **Why it matters:** for a calculator brand, correctness *is* the product and
  the trust moat.

### Brand: AllCalculators (`allcalculators.com`)
- Keyword-rich hub brand; communicates the value proposition instantly.
- Centralised in `src/config/site.ts` — one-line change to rebrand or swap domain.

### SEO infrastructure from day one
- Per-page canonical, Open Graph, Twitter, robots directives (`BaseHead`).
- JSON-LD: Organization + WebSite (with search action) site-wide; WebApplication
  + BreadcrumbList + FAQPage per calculator.
- Auto-generated sitemap; topical-silo URLs (`/finance/mortgage-calculator`).

### Monetization architecture, off by default
- `AdSlot` + `src/config/monetization.ts`: one switch turns on ads everywhere.
- **Why off now:** an ad-light, fast experience is a competitive advantage and a
  prerequisite for AdSense approval (which requires trust pages + real content,
  both shipped). Ads never influence results.

### EEAT foundation
- About, Contact, Methodology, Privacy, Terms, Disclaimer pages shipped.
- Each calculator shows a "method reviewed on" date and explains its formula.

## 3. What shipped in this foundation

- Astro + Tailwind v4 build; design system with light/dark theming.
- 3 flagship calculators, fully working & browser-verified: **Scientific,
  Mortgage, BMI** — across three categories to prove the pattern.
- 16 pages total; 21 passing unit tests; 9 passing end-to-end browser checks.
- Client JS budget: ~2.3 KB gzip for the heaviest calculator; content pages ship
  no calculator JS.
- Full SEO plumbing, sitemap, robots, favicons, OG image.

## 4. Roadmap (priority order)

**Phase 1 — Breadth (migrate the registry).** Build the remaining ~50
calculators, highest-search-volume first: Loan, Auto Loan, Compound Interest,
Percentage, Calorie, Age, Auto/Amortization. Each follows the reference pattern
(logic + test + island + page). This is highly parallelizable.

**Phase 2 — Content & topical authority.** Add an Astro content collection for
guides/blog ("How much house can I afford?", "How to lower your BMI safely").
Interlink guides ↔ calculators to build topical clusters and long-tail traffic.

**Phase 3 — UX depth.** Shareable/permalinked calculation states, print/PDF
export, unit-preference memory, and per-tool charts (kept lightweight).

**Phase 4 — Monetization.** Apply for AdSense once traffic + content thresholds
are met; enable `AdSlot` with conservative density. Later: contextual affiliate
placements (e.g. mortgage/insurance) that respect UX.

**Phase 5 — Scale & measure.** Programmatic pages (currency/region variants),
Search Console + analytics wiring, Core Web Vitals monitoring, and an internal
search index.

## 5. Guardrails

- No `cdn.tailwindcss.com`, no `eval`, no per-page copy-paste — enforced by the
  architecture.
- New calculators must ship with tests and a reviewed date.
- Keep the client JS budget small; prefer server rendering + progressive
  enhancement.
- Brand/domain and monetization remain single-config switches.
