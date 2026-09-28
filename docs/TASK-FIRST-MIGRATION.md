# Task-First Calculator Pages — Contracts & Migration Plan

> Governed by the **Global Task-Completion Psychology** doctrine
> (`docs/TASK-COMPLETION-DOCTRINE.md`). The above-tool order and density rules
> below are one expression of it; reviews must check doctrine compliance.

This document locks three product contracts (homepage calculator, task-first
page header, global calculator search) and records the shared-layout migration.
It is the reference for how calculator pages present the tool and trust signals.

**Status**

| Step | State |
| --- | --- |
| Scientific page task-first (bespoke), header tightened | ✅ shipped (1.3 / 1.3a) |
| `CalculatorLayout` task-first extension (backward-compatible) | ✅ shipped |
| Pilots: Scientific (keypad), BMI (form), Percentage (equation), Password (generator) | ✅ shipped |
| Category-wide migration waves | ⏳ after pilot sign-off |
| Homepage Basic/Scientific calculator (§1) | ✅ shipped |
| Homepage global-search dropdown + Header search (§5) | ⏳ separate approval |
| Calculator listing cards — category / task / directory (§7) | ✅ shipped |

---

## 1. Homepage calculator — locked contract

The homepage first viewport must include the shared `PhysicalCalculator`.

**Behavior**
- Default mode **Basic**; show the **Basic / Scientific** toggle.
- Basic keypad immediately usable; Scientific mode expands the function panel
  **above the unchanged Basic keypad**.
- Preserve **expression, result, Ans and angle mode** on switch; **no navigation
  or reload**.
- Use **`size="compact"`**.
- **Desktop:** global calculator **search** and **popular calculator links**
  appear **beside** the calculator. **Mobile:** global **search appears before**
  the calculator (see §5).

**Target call** (already supported by the component API):
```astro
<PhysicalCalculator id="home-calculator" defaultMode="basic" showModeSwitch={true} size="compact" />
```

The dedicated Scientific page stays **Scientific by default, Deg/Rad visible, no
Basic/Scientific switch**.

> ✅ **Implemented** on the homepage to this contract (`id="home-calculator"`,
> Basic default + Basic/Scientific toggle, `size="compact"`, calculator beside the
> search and popular links on desktop, search before the calculator on mobile).
> Guarded by `e2e/home.spec.ts`. The **global-search dropdown** (§5) — the homepage
> `CalculatorSearch` and Header search — remains a separate, still-unapproved step.

---

## 2. Task-first page header — locked contract

Every calculator page uses this order, top to bottom:

1. One **breadcrumb** → 2. **H1** → 3. one short **task-focused sentence** →
4. **calculator immediately** → 5. supporting/SEO content → 6. review/reference
metadata (below).

**Never above the calculator:** a second category/task nav line, review date,
reference link, methodology, long introduction, table of contents, guide cards,
FAQ, or promotional copy.

**The intro sentence** states exactly what the calculator calculates, uses no
marketing language, and normally fits two mobile lines. The **12–22-word range
is guidance, not a hard rule** — a precise shorter sentence is correct and must
not be padded to hit a count. Example (Scientific, 10 words, shipped):
> Enter an expression and calculate trigonometry, logarithms, powers and roots.

---

## 3. Shared architecture — `CalculatorLayout` (implemented)

Pages are **not** rebuilt on `BaseLayout`. One shared layout offers task-first
as an **opt-in** that defaults to today's arrangement.

### 3.1 API (as shipped)

```ts
interface Props {
  calculator: Calculator;
  intro: string;                                  // required — a deliberate sentence per §2
  faqs?: FAQ[];
  presentation?: 'legacy' | 'task-first';         // default 'legacy'
  reviewMetadata?: CalculatorReviewMetadata;       // structured trust signals (§3.2)
  reviewedOn?: string;                             // legacy shorthand → reviewMetadata.reviewedDate
}
```

One **presentation** mode drives behavior, instead of several booleans that
could contradict each other:

- **legacy** — category eyebrow + review metadata above the tool (unchanged).
- **task-first** — no eyebrow; calculator immediately after the intro; review
  date, methodology and references in an **"About this calculator"** block
  below the tool.

Per-page override props are intentionally **not** added until a real page needs
an exception; presentation is the only knob today.

### 3.2 Structured review metadata (one source of truth)

```ts
interface CalculatorReviewMetadata {
  reviewedDate?: string;                          // ISO; EEAT signal + schema dateModified
  methodLabel?: string;                           // defaults to "Method reviewed for accuracy"
  references?: Array<{ label: string; href: string }>;  // extra citations
}
```

The layout renders review/reference content; **pages never hand-render** it.
Internal reference-data pages (from the `reference` registry, e.g. the BMI
chart) are merged automatically with any `reviewMetadata.references`. `reviewedOn`
is a legacy shorthand normalized into `reviewMetadata.reviewedDate`, so the
remaining legacy pages keep working untouched (45 not-migrated today — see the
canonical fleet audit in `TASK-COMPLETION-DOCTRINE.md`).

### 3.3 Lower-content flexibility (regions/slots)

Header and calculator order are standardized; **lower educational content may
vary per calculator intent**:
- default slot — the tool (standardized position).
- **`belowTool`** slot — optional region hugging the tool (result explanation,
  assumptions); emits nothing unless a page fills it.
- **`content`** slot — free-form prose; the page controls the order of how-to,
  formulas, examples, assumptions.
- FAQ (structured prop), related calculators and the About block follow, laid
  out by the layout. A page needing bespoke FAQ placement can omit `faqs` and
  render its own within `content`.

### 3.4 Backward compatibility (verified)

With no page opting in, the extended layout is **byte-for-byte** compatible: a
whitespace-ignoring diff (`diff -rw`) of all 171 built pages is **empty** — no
comment, tag, attribute, text, internal-link or JSON-LD change. The raw
differences found were whitespace only. `intro` was made required safely because
every existing calculator page already passed it. (Historical measurement from
the task-first layout rollout; current fleet counts live in the canonical audit.)

### 3.5 Pilots (shipped) — one per interaction structure

Migrating only Scientific + BMI would miss interaction structures, so all four
are piloted and must pass visual, behavioral, accessibility and SEO checks:

| Structure | Page | Result |
| --- | --- | --- |
| keypad | `math/scientific-calculator` | returned from bespoke → layout; **JSON-LD/canonical/title/OG byte-identical**; `scientific-page.spec.ts` passes unchanged; tool top y=241 |
| form | `health/bmi-calculator` | task-first; **BMI chart reference** now renders below the tool; tool 373→269 |
| equation | `math/percent-calculator` | task-first; tool 369→297 |
| generator | `everyday/password-generator` | task-first; tool 341→269 |

### 3.6 Regression & DOM-order tests (shipped)

- **Task-first DOM order** (`e2e/task-first-layout.spec.ts`) — per pilot:
  breadcrumb → H1 → intro → calculator → supporting content → review/reference;
  **no eyebrow / review date / reference / methodology above the tool**; tool
  within the first viewport.
- **Backward-compat guard** (`e2e/legacy-layout.spec.ts`) — one un-migrated page
  per category (finance/health/math/everyday): eyebrow AND review metadata stay
  **above** the tool; canonical + H1 intact.
- **Build-time invariance** — the `diff -rw` proof (§3.4).
- **Parity** — `scientific-page.spec.ts` unchanged after the return migration.
- **Property checks (not only byte diff)** — verified on migrated pages: H1,
  intro, canonical, title, meta description, JSON-LD type set (WebApplication +
  BreadcrumbList + FAQPage + Organization + WebSite), internal links, and the
  calculator's form/result markup. Baseline screenshots captured for a Finance,
  Health, Math and Everyday page.

### 3.7 SEO / schema preservation

Only the visible *position* of EEAT signals moves. JSON-LD builders
(`calculatorSchema` with `dateModified`, `breadcrumbSchema`, `faqSchema`) plus
site-wide Organization + WebSite are unchanged; canonical, title, description,
OG image, breadcrumb DOM/schema, routes and sitemap are unchanged; review date
+ references remain on the page (relocated below). Verified byte-identical for
the Scientific migration.

### 3.8 Visual spacing targets (task-first)

| Gap | Target |
| --- | --- |
| Breadcrumb → H1 | 20px |
| H1 → intro | 12px |
| Intro → calculator | 24px |
| Calculator → first supporting section | 56px |
| Bottom "About" block | top border + 32px |

Result: the complete tool begins in the first viewport (pilots land at
desktop y=241–297).

---

## 4. Category-wide migration (after pilot sign-off)

Migrate the remaining ~44 pages in **category-grouped waves** (Math → Finance →
Health → Dates → Measure → Everyday), one commit per wave, each behind the build
+ `astro check` + E2E gate, converting `reviewedOn` → `reviewMetadata` as each
page moves. **Not** all at once. The old `islands/ScientificCalculator.astro` is
retired only after the how-to guide and the `IslandBySlug` dispatcher stop
referencing it.

---

## 5. Global calculator search — architecture (embedded, never a page)

Search is a **task-first embedded behavior**, not a destination. There is **no
public standalone Search page**. `/dev/search` is an internal component test
route only (noindex + nofollow, sitemap-excluded) and is **stripped from the
deploy bundle** — it must never become public. Not deleted from the source: four
e2e specs use the /dev routes as isolated harnesses, so they have to build. The
`deploy` job removes them and re-runs `assert:no-dev` on the bundle it uploads.

### 5.1 Public behavior

As the user types into **any** calculator-search input:
- matching calculators appear directly **below that same input**;
- **no page reload**, and **no navigation to a separate Search page**;
- selecting a result **opens the calculator directly**;
- every surface uses the **same index and `rankCalculators` engine**.

### 5.2 Surfaces — one shared system (no per-page search logic)

1. **Homepage** — global scope, dropdown, ≤10 results, descriptions + recent + popular.
2. **Header** — global scope, compact dropdown, ~5–6 visible results.
3. **`/calculators` directory** — global scope, **inline filter** of the directory (same `rankCalculators`).
4. **Category pages** — **category scope**, inline filter of that category's calculators (same ranking).
5. **Any future calculator-finder input** — same component.

### 5.3 Extended component contract (target — realized at S2)

```ts
interface CalculatorSearchProps {
  indexUrl: string;
  variant?: 'homepage' | 'header' | 'directory' | 'category';
  scope?: 'global' | 'category';
  categoryId?: string;
  display?: 'dropdown' | 'inline-filter';
  loadStrategy?: 'eager' | 'idle' | 'interaction';
  maxVisibleResults?: number;
  showRecent?: boolean;
  showPopular?: boolean;
  fallbackAction?: string; // GET target; defaults to /calculators
}
```

- `display: 'dropdown'` → results below the input (homepage/header).
- `display: 'inline-filter'` → filter the existing directory/category list in place.
- `scope: 'category'` + `categoryId` → restrict to that category, **same ranking**.

The **S1** component ships `variant: 'full' | 'compact'` with the dropdown; it is
**extended to this contract at S2** (inline-filter + category scope are the
directory/category surfaces, so they land with those integrations — not before).

### 5.4 `/calculators?q=` — fallback directory only

Keep the query URL **only** for: no-JavaScript form submission, the "View all X
matching calculators →" link, complete filtered-directory results, and a
shareable filtered state. It is **not** the normal live-search destination
(live search never navigates). Query-filtered views stay non-indexable — the
canonical is `/calculators`, and the static build never mints a per-query page.

### 5.5 Submit control

Because results are instant, the form does **not** depend on a large primary
Search button — it keeps a **compact/secondary** submit for progressive
fallback. **Enter** opens the active result when one is selected, otherwise
submits to `/calculators?q=<encoded query>`.

### 5.6 Shipped so far

- **S0 (data)** — registry `aliases?`/`phrases?` (curated on ~24/49); pure
  `src/lib/search-core.ts` (`normalizeSearchText`, `tokenizeSearchText`,
  `boundedEditDistance`, `rankCalculators`, `findClosestSuggestion`,
  `isBroadDiscoveryQuery`, `searchIndexVersion`) — no DOM/fetch/localStorage/
  analytics, text-only. `src/lib/search.ts` builds the index + re-exports core.
- **S0.1** — `searchPriority` removed (reserved, always undefined; never
  affiliate/CPC); broad "calculator" queries → curated popular set (separate
  `src/data/popular-calculators.ts`, delivered as `popularIds`); **fingerprinted**
  `/search-index/<hash>.json` via `SEARCH_INDEX_URL` (changes only on searchable-
  content change), sitemap-excluded. `/math/basic-calculator` to be added before S2.
- **S1** — `src/components/search/CalculatorSearch.astro` + client, isolated on
  `/dev/search`: accessible combobox/listbox, one shared cached fetch per index
  URL (multi-instance → one request), safe DOM text rendering, recent = ids only,
  resilient failed-index fallback, 52px mobile rows. No live surface touched.

Record shape (`CalculatorSearchRecord`): `id, title, href, category,
taskGroups[], blurb, keywords[], aliases[], phrases[], registryOrder,
searchPriority?`. Ranking bands (strong→weak): exact title → title prefix →
title contains → full title-token coverage → exact alias/phrase → alias/phrase
coverage → keyword coverage → category/task-group → bounded fuzzy. Tie-break:
score → coverage → searchPriority → shorter title → registryOrder.

## 6. Sequencing

1. ✅ Scientific task-first (bespoke) + header tightening.
2. ✅ `CalculatorLayout` task-first extension (backward-compatible).
3. ✅ Four pilots (keypad/form/equation/generator) + DOM-order & legacy-guard tests.
4. ✅ Search **S0 → S0.1 → S1** — data, fingerprinted index, and the isolated
   accessible component on `/dev/search`.
5. ⏳ **Shared result & monetization architecture** phase (before S2).
6. ⏳ **S2 (search integration)** — separate approval. Order:
   (a) replace the homepage search form with `CalculatorSearch`;
   (b) ✅ add the homepage Basic/Scientific calculator (§1) — done independently
   of the search swap; the homepage keeps the simple `/calculators` search form
   until (a);
   (c) add the compact Header search;
   (d) unify `/calculators` filtering with `rankCalculators`;
   (e) add category-scoped search only where a search input is useful;
   (f) delete `/dev/search` after every live surface is covered (repoint E2E to
   the live surfaces first; keep the production `/dev` guard).
7. ⏳ **Pilot sign-off** → category-wide task-first migration waves (§4).

Homepage, Header, `/calculators`, category pages and the remaining calculator
pages are not modified until their step is reached and separately approved.

## 7. Calculator listing cards — SaaS product surfaces

The "pick a calculator" surfaces — category pages (`/[category]`), task-group hubs
(`/tasks/[slug]`) and the full directory (`/calculators`) — present each calculator
as a **large product card**, not a dense website-directory row. One shared
component, `CalculatorCard.astro`, is the single visual language across all three:

- **Large and tap-friendly** — a bold title, one supporting line (the calculator's
  description, or the task-framed use on task hubs), and one obvious action.
- **The whole card is the link**; on hover its "Open calculator →" action fills
  with brand so it reads as a real product button, not a text link.
- **Two-column** on desktop (`sm:grid-cols-2`), single column on mobile.
- Category headers carry a light **count + "free, no sign-up"** trust line.

The `/calculators` directory keeps its per-category grouping and its **inline
`?q=` search filter** — the card sits inside the existing `[data-calc-item]`
wrapper the filter drives, so filtering is unchanged; the one planned calculator
still renders as a compact dashed "Soon" cell.

This is additive **presentation only** — no calculator, route, JSON-LD or
search-index change. Guarded by `e2e/listing-cards.spec.ts` (the card renders on
all three surfaces; the directory filter still narrows results). The homepage's
own "Popular calculators" teaser and reference/guide cards are intentionally left
as-is (different content types); extending the card there is a later option.
