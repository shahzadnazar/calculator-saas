# AllCalculators — project logic & working rules

Astro 5 static SEO-authority site: **49 live calculators, 0 planned** (finance 19 / health 11 /
math 9 / everyday 10) + guides, reference tables, task hubs and topic clusters.
(The README's "44 calculators" line is STALE — the registry is authoritative.)
Brand `AllCalculators`, domain `https://allcalculators.com`.

Read `docs/` before changing anything structural. `docs/TASK-COMPLETION-DOCTRINE.md`
is **non-negotiable product law** and every design/migration review checks compliance.

---

## 1. The three load-bearing ideas

1. **Data-driven registry.** `src/data/calculators.ts` is the ONLY source of truth for
   the live set and each calculator's category (hence its route). Nav, sitemap,
   category pages, related links, search index, structured data and the generated
   embed pages all *derive* from it. Adding calculator #50 is near-free.
2. **Logic is separated from UI and unit-tested.** Correctness *is* the product and
   the trust moat. Pure functions in `src/lib/calculators/`, never in the island.
3. **Task-first, not tool-first.** People want a job done, not a "financial
   calculator". `src/data/tasks.ts` is the PRIMARY information architecture
   (nav + breadcrumbs); the finance/health/math/everyday taxonomy is the secondary
   "browse by type" view. Tool URLs are unchanged — the task layer is additive.

## 2. Tech stack & commands

Astro 5 (static, `format: 'file'`, `trailingSlash: 'never'`) · Tailwind v4 via
`@tailwindcss/vite` · **vanilla TS islands, no framework runtime** · Vitest (unit) ·
Playwright (e2e) · MDX content collection · `@astrojs/sitemap`.

```
npm run dev / build / preview
npm run check                      # astro check — must be 0 errors
npm test                           # vitest
npm run test:e2e                   # playwright
npm run gen:embed-pages            # regenerate per-slug embed pages
npm run assert:embed-pages-current # drift gate (CI)
npm run assert:embed-isolation     # 0 unrelated scoped CSS per embed (CI, post-build)
npm run assert:mon-off             # no monetization artifact on live pages (CI)
npm run assert:no-dev              # /dev/* must not reach production (main only)
```

CI job `build-and-test`: check → embed-drift → unit → build → embed-isolation →
mon-off → e2e. A separate `prelaunch-no-dev` job runs on `main` only.

## 3. Directory map

```
src/config/     site.ts (brand/domain — ONE place to rebrand) · monetization.ts · authors.ts
src/data/       calculators.ts (THE REGISTRY) · tasks.ts (primary IA) · clusters.ts (pillar hubs)
                reference.ts (citable tables) · offers.ts (affiliate, empty) ·
                popular-calculators.ts (search empty-state only) · embed-components.json/.ts
src/lib/calculators/   <name>.ts  = pure engine  + <name>.test.ts
                       <name>-form.ts = runtime binding + <name>-form.test.ts   (47 of each)
src/lib/result/        state.ts · form-runtime.ts · equation-runtime.ts ·
                       generator-runtime.ts · focus.ts     ← the shared runtimes
src/lib/monetization/  policy.ts · layout.ts · result-bridge.ts · styles.ts
src/lib/        format.ts · format-duration.ts · finance.ts · schema.ts ·
                search-core.ts (browser-safe, no registry) · search.ts (build only) · embed.ts
src/components/islands/   47 calculator islands
src/components/result/    ResultShell/Value/Unit/Summary/Interpretation/Breakdown/
                          Assumptions/Actions/Empty/Invalid/Example/Announcement
src/layouts/    BaseLayout · CalculatorLayout · ContentLayout · GuideLayout ·
                ReferenceLayout · EmbedLayout · EmbedPageShell
src/pages/      / · /<category> · /<category>/<slug> · /calculators · /tasks/<slug> ·
                /topics/<slug> · /guides/<slug> · /reference/<slug> ·
                /embed/<category>/<slug> (generated, noindex) · /dev/* (internal, stripped)
```

## 4. Task-Completion Doctrine — the rules that bind every change

North star: *Calculator.net's immediate utility, familiar anatomy and information
density + AllCalculators' modern design, accessibility, responsiveness, search,
result states, trust and controlled monetization.* **Match the task-completion
behavior and density, never their branding, styling, code, content or layout.**

- **Lifecycle:** understand → enter values → **one obvious primary action** → see
  result immediately → understand it → adjust → recalculate.
- **Above-tool rule:** above the calculator, allow ONLY breadcrumb · H1 · one short
  task-focused sentence · a necessary safety warning. Everything else (long intros,
  eyebrow nav, review metadata, references, methodology, FAQ, related guides, ads)
  moves **below**. *Reposition, never remove.*
- **Density:** task-first ≠ sparse. Medium-high utility density; at **1366×768** show
  H1 + instruction + primary inputs + primary action + the main result (or its slot).
- **Input↔result proximity:** desktop `Inputs | Main result`; mobile Inputs →
  Calculate → Result → Breakdown. Never put the main result after long content.
- **One dominant, task-specific primary action** ("Calculate BMI", "Generate
  Password"). Reset/Copy/Print/Advanced are visually subordinate.
- **Progressive disclosure:** required fields always visible; optional settings under
  labelled expandable groups. Never hide a required main-task field.
- **Initial state:** personal inputs empty, **result empty** — no sample result in the
  visitor's result panel. Worked examples live *below* the tool, explicitly labelled.
- **Recalculation:** default `live-after-first` — explicit first calculation, then live
  updates, Calculate stays visible, note "Changes update automatically." Reset must
  exist and be deterministic.
- **Result hierarchy:** 1 main result → 2 unit → 3 interpretation → 4 breakdown →
  5 assumptions → 6 chart/table → 7 actions. States `empty | example | valid | invalid`.
  **Never render NaN / Infinity / undefined / raw errors.**
- **Accessibility:** keyboard-operable, visible focus, never `aria-hide` the only unit,
  field-level error association, focus the first invalid field, ONE restrained
  `aria-live` announcement, no focus movement on live updates, ≥44px tap targets,
  never colour-only meaning.
- **Search is secondary** — never between inputs and results.
- **Monetization order:** task → result → interpretation → monetization. Never before
  the calculator, between required inputs, between Calculate and Result, inside the
  result panel, or between search and its results.
- **Fix through shared systems** (layout, runtimes, result primitives, tokens) —
  **never per-calculator one-offs.**

### Ratified product decisions (binding)
1. Complex-finance starts **empty**; a labelled Example needs per-calculator approval.
2. **Converter family** uses neutral value `1` + immediate conversion — an approved
   family behavior, not a doctrine violation of one-primary-action.
3. Multi-mode state stays **ephemeral** (no query-param/URL/storage mode state).
4. Financial-schedule order: inputs → Calculate → summary → interpretation →
   schedule control → detailed schedule → monetization.
6. Interest Calculator stays a distinct complex-form tool (never folded into
   simple/compound).
7. `approved-exception` needs a documented user-task reason + tests + matrix approval.
   **Legacy compatibility alone is never a valid reason.**
8. **Impossible-but-meaningful results are VALID informational results, not input
   errors** (Payment's "Never" payoff). The shell stays `valid`; supported by the
   opt-in `isUsableResult` gate. Never expose zero/Infinity/NaN or formula internals.

## 5. Migration status — COMPLETE

**49/49 migrated, 0 legacy, 0 approved exceptions.** Every calculator is task-first on
a shared runtime: empty-first, explicit primary action, live-after-first, Reset, strict
validation, `aria-live` result. `compound-interest` migrated LAST (R21A1) as the final
regression sentinel because it owns the shared compound-growth engine consumed by
Investment / Savings / Retirement / Interest and two reference tables.
`e2e/legacy-layout.spec.ts` is now a **zero-legacy sentinel** — it fails if any legacy
layout is reintroduced.

**13 families:** physical/keypad (1) · standard form (15) · complex form (7) ·
shape selector (2) · equation (2) · explicit-output generator (1) · random-data
generator (1) · converter (2) · date/duration (6) · multi-mode (4) · dynamic-row (2) ·
financial schedule (4) · specialized report (2). Same psychology globally; **workspace
anatomy differs by family — do not force one generic controller.**

Notably the multi-mode family (sales-tax, payment, credit-card-payoff, savings)
completed with **no dedicated multi-mode runtime** — only the one small opt-in
`isUsableResult` gate.

## 6. The shared runtime pattern (how to add/change a calculator)

Every runtime is a **pure planner** (`planFormAction` / `planEquationAction` /
`planGeneratorAction` — unit-tested with no DOM) + a **thin DOM executor**
(`mountXCalculator`). The runtime owns the first-calc gate, live-after-first, reset,
unit re-projection, focus/scroll, the single announcement and the state machine.
**Bindings stay tiny.**

- `src/lib/result/state.ts` — two INDEPENDENT axes: `ResultState`
  (`empty|example|valid|invalid`) × `ResultActivity` (`idle|calculating|just-updated`).
  Pure `reduceResult`; illegal transitions no-op. No permanent reset/updated states.
- `form-runtime.ts` (R2) — standard one-form calculators. Certified for that only.
- `equation-runtime.ts` (R3) — one instance per `<form data-equation>`; equations are
  fully independent (no shared root listener).
- `generator-runtime.ts` (R4) — explicit Generate only; a settings change marks output
  **stale** (kept visible, Copy disabled) rather than silently regenerating. `stale` is
  generator metadata over `valid`, NOT a new global ResultState. The runtime never
  announces/stores/logs/transmits the output.

**Adding a calculator:**
1. Registry entry in `src/data/calculators.ts` (`status: 'live'`).
2. Pure logic `src/lib/calculators/<name>.ts` **+ `<name>.test.ts`**.
3. Binding `<name>-form.ts` **+ `<name>-form.test.ts`** — validate presence and
   finiteness explicitly; **never `Number(v) || 0`**.
4. Island `src/components/islands/<Name>Calculator.astro` (SSR a sensible empty
   default; enhance on the client).
5. Page `src/pages/<category>/<slug>.astro` via `CalculatorLayout` with
   `presentation="task-first"`, intro, FAQs and `reviewMetadata`.
6. Run `npm run gen:embed-pages` and add the entry to `embed-components.json`.

Nav, sitemap, category pages, related links, search and schema follow automatically.

## 7. Embed architecture (R7D1) — do not regress

Public embeds are **generated per-slug static pages** `src/pages/embed/<category>/<slug>.astro`,
each with a **literal static import of exactly one island** + `EmbedPageShell`. The old
dynamic `IslandBySlug` route imported all islands into a runtime map, so Astro emitted
**every** island's scoped CSS onto **every** embed page (~23 KB dead). Result now:
**0 B unrelated calculator-scoped CSS** on all 49 embeds.

`embed-components.json` carries **component identity only** (`slug → {componentPath, props?}`);
the registry alone owns category/route, so there is no projection to drift.
Special cases: scientific → `ScientificCalculatorEmbed`; password-generator →
`PasswordGeneratorCalculator`. No embed carries `props` any more — standard-deviation now
has its own island rather than a configured `StatisticsCalculator`.

**Forbidden in a generated embed page:** a component map, `import.meta.glob`, a runtime
dynamic import, a `<script>` loader, or ≠ 1 island import. Gated by
`assert:embed-isolation` (failing gate, no byte budget) + `embed-components.test.ts`.
The attribution `<a>` in an embed snippet is deliberately OUTSIDE the iframe — that is
what makes it a real backlink.

## 8. Monetization — architected, integrated, entirely OFF

**Trust first, revenue second. Commercial value never affects search ranking or
calculated results; pages stay fully usable with everything disabled.**

Nine streams (`docs/MONETIZATION.md`): display ads · affiliate · email · premium ·
digital products · sponsorships · membership · public API · embeddable/SaaS. Display
ads pay poorly on a new site — the real value is high commercial intent + an owned
audience, so **affiliate and email come before AdSense**.

- `src/config/monetization.ts` → `MONETIZATION_CONFIG` is the single source of
  placement decisions. `enabled: false` globally AND per placement.
- `policy.ts` — pure resolvers; `layout.ts` — `planCalculatorMonetization` ANDs each
  page opt-in with the global + placement flags. Page props express **eligibility
  only**: no provider ids, cannot bypass config, consent or result gating.
- `MonetizationRegion` renders as a **SIBLING of the result, never inside ResultShell**.
- **Result bridge:** the post-result region is `hidden` and revealed by an inline script
  only for a fresh valid result (`valid && !stale && activity !== 'calculating'`),
  scoped to this layout's `[data-calculator-workspace]` — never `document`-wide.
  Percentage's three equations share ONE region (any fresh valid result qualifies).
- **CSS trick that matters:** `MonetizationRegion`/`RevenueModule` carry NO scoped
  `<style>` (Astro would link a referenced component's CSS onto every page even when it
  renders nothing). `.mon-*` lives in `styles.ts`, emitted inline only when active.
- **Byte-identical discipline:** each region is appended to its preceding sibling's line
  with no intervening whitespace, because Astro emits inter-node whitespace verbatim —
  a standalone `{cond && …}` line would add stray bytes to every page.
- No AdSense / affiliate / analytics / consent vendor is integrated. `ConsentState`
  defaults to all-denied. **`aggregateRating` is deliberately NOT emitted** — fabricated
  ratings violate Google's guidelines and our EEAT stance.

## 9. SEO & content

- Topical-silo URLs; per-page canonical/OG/Twitter/robots via `BaseHead`.
- JSON-LD: Organization + WebSite (search action) site-wide; WebApplication +
  BreadcrumbList + FAQPage per calculator; Article on guides. Builders in `lib/schema.ts`.
- **Content depth is the #1 on-page lever** — competitors rank for 5K–27K keywords per
  URL by answering every long-tail variation and PAA question on one page.
- Competitive reality: we cannot out-authority calculator.net (Authority Score 90,
  28.8K referring domains). We **out-UX, out-speed and out-mobile** them (their
  documented weaknesses: ad clutter, dated desktop-first design, layout shift) while
  earning authority on long-tail and KD<50 terms.
- Invest depth first in what we already own at KD<50: credit-card payoff (24),
  square footage (31), concrete (34), protein (44), standard deviation (47), GPA (49),
  income tax (50).
- **Content style:** prose 65–72ch (`.prose` is 68ch); paragraphs 2–4 sentences /
  ~40–90 words; numbered steps for procedures, bullets for options, tables only for
  genuine comparison; no marketing filler; **no programmatic sentence truncation or
  automatic paragraph splitting** — copy is human-written.
- Presentation models: `task-first` (product default) · `article-first` (BLUF; guides
  without tools + legal) · `reference-first` · `embed`. Never choose `article-first`
  merely because a page has a lot of SEO text.
- Reference tables are computed at build time from our own tested functions — provably
  accurate "citable data" assets that earn links.
- Guides are MDX in `src/content/guides/`, can embed live islands, and interlink
  bidirectionally with calculators. `pillar: true` surfaces on /guides and the home page.

## 10. Search

Embedded behavior, never a destination — **there is no public standalone Search page**.
`/dev/search` is an internal test route, noindex + sitemap-excluded, deleted before
launch. One shared index + `rankCalculators` engine across homepage, header, directory
and category surfaces.

`search-core.ts` is deliberately registry-free and DOM-free so the browser bundle stays
small; `search.ts` (build-only) builds the fingerprinted `/search-index/<hash>.json`.
Ranking bands: exact title → title prefix → title contains → full title-token coverage →
exact alias/phrase → alias/phrase coverage → keyword coverage → category/task-group →
bounded fuzzy. Ranking returns **text values only, never HTML** — render with safe DOM
text APIs. `popular-calculators.ts` feeds the **empty state only** and must never
influence relevance; popularity is never derived from affiliate/ad/CPC value.

## 11. Hard guardrails

- No `cdn.tailwindcss.com`. No `eval` — the scientific calculator uses a shunting-yard
  parser. No per-page copy-paste.
- No "Calculator.net" branding anywhere (the original upload had it in 61 files; it is
  a competitor trademark and a legal risk).
- Every new calculator ships with tests and a reviewed date.
- Never skip, disable or quarantine a test to get green.
- Keep the client JS budget small — server-render, then progressively enhance.
- Brand/domain and monetization stay single-config switches.
- Personal values are never persisted; calculations run in the browser and nothing the
  visitor enters is sent to a server.
- `/dev/*` must never reach production.

## 12. Branch & recent work

Development branch: `claude/repo-branch-review-evdkzi` (currently identical to
`origin/tabish`). The default/base branch used by past PRs is
`claude/authority-website-strategy-knvhep`. No open issues; no PR review comments.

Latest commit `737a936` "Project updated by Tabish on 18/08/2026" is a **visual +
density pass**, not a logic change:
- Rebranded the design tokens from blue/emerald to **Plum (brand) / Rose (accent) /
  Apricot (warm highlight)** in `global.css`, with a warm-neutral page background.
- Rebuilt `Header.astro` onto semantic `site-*` classes (still task-first, still works
  with JS disabled, added an "All" entry and an active-state dot).
- Tightened spacing fleet-wide toward the doctrine's medium-high density target —
  `CalculatorLayout` (`py-8→py-4`, tool `mt-6→mt-3`, content `mt-12→mt-4`), Footer,
  and every island's form padding (`p-5 sm:p-6 → p-4`).
- Reworked the homepage and `calc.css`.
