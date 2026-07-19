# Task-First Calculator Pages — Contracts & Migration Plan

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
| Homepage calculator + global search | ⏳ separate approval |

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

> Not implemented until separately approved. This is the binding spec.

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
is a legacy shorthand normalized into `reviewMetadata.reviewedDate`, so the 48
un-migrated pages keep working untouched.

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
comment, tag, attribute, text, internal-link or JSON-LD change. The 48 raw
differences are whitespace only. `intro` was made required safely because all
48 existing pages already pass it.

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

## 5. Global calculator search — locked contract (pre-homepage)

To be implemented with the homepage; recorded here first.

- **Live matching results render directly below the input** as the user types.
- Match against **title, slug, aliases, keywords, phrases, and typos**
  (fuzzy/typo-tolerant).
- **Relevance ranking** (exact/prefix title > alias/keyword > fuzzy).
- **Maximum 10** results in the dropdown, plus a **"View all X matching
  calculators"** row linking to the full filtered list.
- Results are **real semantic links** (`<a href>` to the calculator), crawlable
  and keyboard-activatable — not JS-only handlers.
- **Keyboard:** ArrowUp/ArrowDown move the active option, **Enter** navigates to
  it, **Escape** closes and clears the active option.
- **Accessible combobox/listbox semantics**: input `role="combobox"`
  `aria-expanded` `aria-controls` `aria-activedescendant`; list `role="listbox"`;
  each result `role="option"`.
- **Mobile:** full-width tappable result rows (≥44px targets).
- **No network request per keystroke** — the index is a static, prebuilt JSON
  loaded once and filtered in memory.
- **Static crawlable homepage/category links stay separate** from search — the
  directory of `<a>` links remains in the DOM for crawling and JS-off use.
- **`/calculators?q=` filtered states must not become duplicate indexable
  pages** — query-filtered views are `noindex` (or canonicalized to
  `/calculators`), so search never spawns thin duplicate URLs.

---

### 5.1 Search S0 — data layer (shipped)

The search **data layer** is built and unit-tested; no UI and no user-facing
page changed (verified: the only new build artifact is `/search-index.json`).

- Registry extended with optional `aliases?` / `phrases?`, curated on ~24 of the
  49 calculators (never forced onto every one).
- `src/lib/search.ts` — pure `normalizeSearchText`, `tokenizeSearchText`,
  `boundedEditDistance`, `buildSearchRecords`, `rankCalculators`,
  `findClosestSuggestion`, `searchIndexVersion`. No DOM / fetch / localStorage /
  analytics; returns text values only, never HTML.
- `src/pages/search-index.json.ts` → `/search-index.json`: static, **live-only**
  index (49 records, ~4.3 KB gzipped), content-versioned for cache-busting,
  **excluded from the sitemap**.

Record shape (`CalculatorSearchRecord`): `id, title, href, category,
taskGroups[], blurb, keywords[], aliases[], phrases[], registryOrder,
searchPriority?`. Task-group membership is the secondary classification signal
(no new subcategory field).

Ranking bands (strong → weak): exact title → title prefix → title contains →
full title-token coverage → exact alias/phrase → alias/phrase token coverage →
keyword coverage → category/task-group → bounded fuzzy. Tie-break: score →
coverage → `searchPriority` → shorter title → `registryOrder`. `searchPriority`
is a small curated tie-break nudge only — never affiliate, sponsorship or CPC.

Fuzzy rules: 1-char none, 2-char prefix-only, 3+ bounded Damerau-Levenshtein
(distance 1 short / 2 long), applied to titles + aliases after exact/token
matches. S1 (component) and S2 (integration) remain pending approval.

## 6. Sequencing

1. ✅ Scientific task-first (bespoke) + header tightening.
2. ✅ `CalculatorLayout` task-first extension (backward-compatible).
3. ✅ Four pilots (keypad/form/equation/generator) + DOM-order & legacy-guard tests.
4. ⏳ **Pilot sign-off** → category-wide migration waves (§4).
5. ⏳ Homepage calculator (§1) + global search (§5) — separate approval.

Homepage and the remaining calculator pages are not modified until their step is
reached and approved.
