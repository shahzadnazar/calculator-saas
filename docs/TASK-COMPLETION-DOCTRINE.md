# Global Task-Completion Psychology — Product Doctrine

**Status: permanent, non-negotiable. Applies to the complete calculator fleet
and every content surface.** Every calculator design, migration and review MUST
be evaluated for compliance with this doctrine. It changes product
architecture, not one calculator.

Referenced from: `STRATEGY.md`, `TASK-FIRST-MIGRATION.md`,
`RESULT-MONETIZATION-ARCHITECTURE.md`, `CONTENT-STYLE.md`.

## North star

> Calculator.net's immediate utility, familiar anatomy and information density
> **+** AllCalculators' modern design, accessibility, responsiveness, search,
> result states, trust and controlled monetization.

**Do not copy** Calculator.net's branding, visual styling, code, content or exact
layout. Match the *task-completion behavior and density*, not the appearance.

## 1. Global utility lifecycle (every calculator)

understand the task → enter/select values → **one obvious primary action** → see
the result immediately → understand the result → adjust easily → calculate
again. Every family architecture must support this loop.

## 2. Above-tool rule

Before the calculator, allow only: breadcrumb · H1 · one short task-focused
sentence · a necessary immediate safety warning. Then the calculator. Move
**below** it: long intros, category eyebrow nav, review metadata, references,
methodology, FAQ, related guides, promo, ads, affiliate. **Reposition, never
remove.**

## 3. Density (task-first ≠ sparse)

Use medium-high utility density. Avoid oversized cards, excessive vertical
padding, decorative gaps, unnecessarily tall fields, repeated headings, long
vertical workflows. Preserve readable text, accessible targets, visible focus,
clear grouping, mobile usability. **At 1366×768**, show where practical: H1,
concise instruction, primary inputs, task-specific action, and the main result
(or its position).

## 4. Input ↔ result proximity

Results must feel causally connected to inputs.
- Suitable desktop: `Inputs | Main result`.
- Complex desktop: `Primary inputs | Main result` · `Advanced options |
  Breakdown/chart` · `Calculate | Assumptions`.
- Mobile: Inputs → Calculate → Result → Breakdown.
- Never place the main result after long content.

## 5. Family model

`physical/keypad · standard form · complex form · equation · generator ·
converter · date/duration · dynamic-row · financial schedule · specialized
report`. Same task-completion psychology globally; **workspace anatomy differs by
family.** Do not force all calculators into one generic controller or identical
visual layout.

## 6. Primary action

Exactly one dominant, task-specific action per calculator (Calculate BMI,
Calculate Mortgage Payment, Calculate Percentage, Convert, Calculate Age,
Generate Password). Reset / Copy / Print / Advanced Options are visually
subordinate.

## 7. Progressive disclosure

Required primary fields visible immediately. Optional settings under labelled
expandable groups (Advanced options, Taxes & insurance, Extra payments, Detailed
assumptions, Additional settings). **Never hide required main-task fields.**

## 8. Initial state by family

| Family | Initial state |
|---|---|
| Physical/keypad | display `0` |
| Personal health / date | empty personal inputs, empty result |
| Equation | empty operands, empty result |
| Generator | empty output until Generate |
| Converter | a neutral default (e.g. `1`) when it aids comprehension |
| Complex finance | may use a **clearly-labelled Example** when it materially aids task comprehension |

Example calculations must: be explicitly labelled **Example**; never resemble
the user's own result; provide **Clear example / Start with my values**; change
to **Your calculation** after interaction; echo important assumptions. Worked
examples stay **below** the calculator (education + SEO).

## 9. Recalculation

Default (form/equation): explicit first calculation → live updates after the
first valid result → Calculate button stays visible → "Changes update
automatically." Family-specific exceptions allowed. **Reset must exist and be
deterministic.**

## 10. Result system

Hierarchy: **1 main result → 2 unit → 3 immediate interpretation → 4 breakdown →
5 assumptions → 6 detailed chart/table → 7 result actions.** Main result stays
visually dominant. Distinguish `empty | example | valid | invalid`. **Never show
NaN, Infinity, undefined or raw errors.**

## 11. Accessibility (global)

Keyboard-operable controls · visible focus · accessible units (never
`aria-hide` the only unit) · field-level error association · first-invalid-field
focus · one restrained `aria-live` result/error announcement · no focus movement
on live updates · mobile tap targets · non-colour-only result meaning.

## 12. Search & discovery are secondary

Never between inputs and results. Use embedded homepage search, compact Header
search, related calculators **after** the workspace, and an optional discovery
sidebar only with sufficient space.

## 13. Monetization

Order: calculator task → result → immediate interpretation → monetization.
**Never** before the calculator, between required inputs, between Calculate and
Result, inside the result panel, or between search and matching results.
Desktop revenue/sidebar only when the full core workspace stays comfortable;
calculator-level opt-in + container-based width validation.

## 14. Compliance review checklist (every design & migration review)

Evaluate each calculator on: time to first usable input · primary fields above
the fold · action visibility · result visibility · input↔result distance ·
advanced-option discoverability · initial-state clarity · result ownership ·
recalculation path · reset behavior · error recovery · mobile completion path ·
keyboard accessibility · monetization interruption.

## 15. Implement through shared systems

Realize this via shared `CalculatorLayout`, family-specific workspace
components, result primitives, controller runtimes, an action hierarchy,
validation patterns, responsive density tokens, and monetization boundaries.
**Do not fix each calculator independently.**

---

# Fleet audit against the doctrine (canonical)

**This is the single authoritative fleet audit. It supersedes every earlier
count — any "48 island/calculator" figure elsewhere in the docs is stale and
replaced by the table below.**

**Audit date:** 2026-07-19 · **Source commit:** `7592a2d`. Re-run and refresh
the date, commit and counts whenever the fleet changes.

| Metric | Value |
|---|---|
| Total live calculators | **49** |
| Migrated (task-first + shared runtime) | **9** — scientific, bmi, **bmr**, **ideal-weight**, **protein**, **body-fat**, **calorie**, percent, password-generator |
| Not migrated (legacy) | **40** |
| Approved exceptions | **0** |
| Distinct Astro islands | **47** — statistics + standard-deviation share `StatisticsCalculator` via a `primary` prop; **scientific uses `PhysicalCalculator`** (`components/calc/`, not an island) |
| Embed exposure | **all 49** — each calculator is served by a **generated per-slug static page** `src/pages/embed/<category>/<slug>.astro` (R7D1; the dynamic `IslandBySlug` route was retired). Same public URLs; each page bundles only its own island's scoped CSS |

**The 40 legacy calculators are noncompliant with the doctrine in the same
recurring ways** — each **auto-calculates prefilled example values and shows a
result that reads as the visitor's own**, with **no explicit primary action, no
Reset, and no result `aria-live`** (the lone `aria-live` exception among the
legacy set is `random-number-generator`). Documented behavioral exceptions exist
(below) and are tracked in the migration-status table. These recurring gaps are
what the R1–R7 program closes.

## Accepted migration commits (provenance)

| Phase | Calculator(s) / scope | Accepted commit |
|---|---|---|
| R7B.1 | shared health-domain modules (`activity-levels`, `body-measurements`) | `309ec75` |
| R7C-1 #1 | ideal-weight-calculator | `d28917e` |
| R7C-1 #2 | protein-calculator | `2648aa0` |
| R7C-1.1 | ideal-weight announcement hardening + embed-CSS report (no calculator migrated) | `d0e5fbe` |
| R7C-2A | body-fat-calculator (first conditional-input migration) | `140f3f7` |
| R7C-2A.1 | body-fat hardening: sanity boundary, hip disable/preserve, category ownership, embed-CSS thresholds (no calculator migrated) | `fa9c318` |
| R7C-2B | calorie-calculator (activity + goal; goal selector picks an existing figure) | `4c5a126` |
| R7C-2B.1 | calorie hardening: non-positive comparison "Not available" + goal-scenario labels (no calculator migrated) | `430229b` |
| R7D1 | per-slug public-embed code splitting (retire dynamic IslandBySlug; no calculator migrated) | *(this R7D1 commit)* |

**Fleet after R7D1:** 49 total · **9 migrated** · **40 legacy** · **0 approved exceptions** (R7D1 migrates no calculator — it is an embed-infrastructure change only).

## Embed architecture — per-slug code splitting (R7D1)

**The old ripple (retired).** Public embeds were served by one dynamic route
`src/pages/embed/[category]/[slug].astro` rendering `IslandBySlug`, which
**statically imported all 47 islands** into a `Record<slug, Component>` map and
rendered `const Island = ISLANDS[slug]; <Island/>`. Because `Island` was a runtime
variable, Astro/Vite could not statically determine the component per generated
path, so CSS bundling (per-**file**, from the static import graph) emitted **every**
island's scoped `<style>` onto **every** `/embed/*` page — the rendered island
pruned the HTML, not the CSS. (JS did not ripple: hoisted island scripts follow the
render tree.) By R7C-2B every embed page carried **~24 KB scoped CSS, of which
~18–23 KB (16–17 non-rendered islands) was dead** — crossing the 20 KB-raw advisory
threshold. An `import.meta.glob` spike confirmed glob does **not** fix this (it
expands statically to all matches within the one route file → same graph).

**The fix (direct static imports).** Each public embed is now a **generated
per-slug static page** `src/pages/embed/<category>/<slug>.astro` with a **literal
static import of exactly one island** + the shared `EmbedPageShell` (which forwards
to the unchanged `EmbedLayout`). A literal import lets Astro emit only that island's
scoped CSS. `IslandBySlug` and the dynamic route are deleted.

**How generation works.**
- **Canonical source:** `src/data/embed-components.json` (+ typed
  `embed-components.ts`) — serializable `slug → { category, componentPath, props? }`
  (path strings + JSON-safe props only, so a pure-Node generator needs no TS
  loader). The **registry** (`@data/calculators`) stays the authority on which
  calculators are live; a coverage test asserts the map matches it EXACTLY.
- **Generator:** `npm run gen:embed-pages` (`scripts/gen-embed-pages.mjs`) writes
  one deterministic page per live calculator (sorted slugs, LF newlines, forward-
  slash paths, sorted prop keys). `--only a,b` limits to a subset.
- **Drift gate:** `npm run assert:embed-pages-current` (`--check`) regenerates in
  memory and fails on any missing / stale / orphaned page. **Wired into the required
  CI `build-and-test` job** (after `check`). Generated pages are committed.
- **Special cases** (in the map): scientific →
  `@components/calc/ScientificCalculatorEmbed.astro`; statistics →
  `StatisticsCalculator`; **standard-deviation → `StatisticsCalculator` with
  `props: { primary: 'sd' }`** (rendered `primary="sd"`); password-generator →
  `PasswordGeneratorCalculator`.

**Before → after (per embed page, raw / gzip CSS; unrelated scoped raw):**

| Embed | Before total | After total | Before gzip | After gzip | Unrelated scoped: before → after |
|---|---|---|---|---|---|
| mortgage | 64,190 B | **32,007 B** | 11,334 B | **7,122 B** | 23,226 B → **0** |
| bmi | 64,190 B | **37,860 B** | 11,334 B | **8,274 B** | 21,919 B → **0** |
| calorie | 64,190 B | **40,987 B** | 11,334 B | **8,487 B** | 18,827 B → **0** |
| tip | 64,190 B | **32,007 B** | 11,334 B | **7,122 B** | 23,226 B → **0** |
| scientific | 64,190 B | **36,033 B** | 11,334 B | **7,863 B** | ~23 KB → **0** |
| standard-deviation | 64,190 B | **32,007 B** | 11,334 B | **7,122 B** | ~23 KB → **0** |

Every embed page now carries **0 B unrelated calculator-scoped CSS** (only the
shared `EmbedLayout` shell cid `r4tsmomu` + the one rendered island). Every public
embed URL, the rendered island HTML/behavior, hydration, per-island JS, and all
non-embed pages are unchanged (backward-compat: **only `/embed/*` pages differ**).

**Baseline + thresholds.** `docs/embed-css-baseline.json` re-baselined to the
post-R7D1 mortgage embed (total **32,007 B** / gzip **7,122 B** / **0** unused
scoped). `report:embed-css` stays READ-ONLY, non-failing, with the advisory
warnings (unused scoped **> 20 KB raw**; total **> 15 KB gzip**) — now structurally
impossible to trip from unrelated islands, since each embed only bundles its own.

**Rollback (bounded).** Restore `src/pages/embed/[category]/[slug].astro` +
`src/components/IslandBySlug.astro`, delete `src/pages/embed/<category>/<slug>.astro`
+ the generator/map/shell + the drift gate + coverage/route tests, and restore the
previous baseline. One tightly-bounded change; no calculator migration is entangled.

**⚠ THRESHOLD CROSSED at R7C-2B.** Calorie added **+4,157 B** scoped CSS; the
cumulative delta vs `2648aa0` is now **+7,446 B total / +692 B gzip**, and unused
calculator-scoped CSS on the mortgage embed reached **23,226 B (> 20 KB raw)** —
so `report:embed-css` now emits the warning. Total gzip **11,334 B** is still
under the 15 KB gzip threshold. Per the R7C-2A.1 policy this is the trigger to
**open a code-splitting architecture review** of IslandBySlug (e.g. per-slug
scoped-CSS emission instead of one all-islands bundle) before the next migrations.
IslandBySlug is unchanged in R7C-2B; the review is a recommended follow-up, gated
to the user.

## Migration status (per calculator)

Status values: `not-migrated` · `pilot` · `migrated` · `approved-exception`.

| Status | Calculators | Meaning |
|---|---|---|
| `migrated` | scientific-calculator; **bmi-calculator**; **percent-calculator**; **password-generator** | scientific: PhysicalCalculator, legacy island retired (R0.5). **bmi: standard-form runtime pilot (family: standard form). Accepted migration: R2 range `843d113..b7f9d44`, refined by R2.1.** **percent: equation runtime pilot (family: equation) — three INDEPENDENT equations. Accepted migration: R3 range `7460547..45e432f` (incl. R3.1 positive start; direction from operands).** **password: explicit-output generator pilot (family: generator) — no output on load, explicit Generate, settings-change → stale (kept visible, Copy off, note), Copy gated on a fresh output, strength as text, crypto-only generation never announced/stored/logged/transmitted. Accepted migration: R4 implementation `9c51c33`, docs/status `45f5e56`.** |
| `pilot` | (none active) | The initial standard-form, equation and explicit-output generator pilots are complete. Additional calculator subfamilies still require separate pilots (each validated before binding). |
| `migrated` (R7B, `a4c6c6f`; hardened R7B.1) | **bmr-calculator** | **First standard-form GENERALIZATION beyond BMI** (family: standard form). Task-first; empty inputs → explicit **Calculate BMR** → live-after-first; **Reset**; field-level validation + first-invalid focus; concise result `aria-live`; Metric/Imperial with in-place conversion; dominant BMR figure + a **secondary "Estimated daily calorie needs" (TDEE) table** (BMR × the shared `ACTIVITY_LEVELS`, labelled as daily calorie needs, not more BMR values). The shared standard-form runtime was used **UNCHANGED** (no runtime extension). Sex is a native fieldset/legend radio group so its changes flow through the runtime's `input` path. **R7B.1:** the activity multipliers moved to `@lib/health/activity-levels` and the Metric/Imperial conversions + imperial-height classification to `@lib/health/body-measurements`; **BMI and BMR both consume these shared primitives with no behaviour change** (BMI + Calorie pages byte-identical). Accepted implementation: R7B `a4c6c6f`. |
| `migrated` (R7C-1) | **ideal-weight-calculator** | Standard-form wave, calculator #1 (runtime UNCHANGED). Task-first; height-only; empty → **Calculate Ideal Weight** → live-after-first; **Reset**; field-level validation + focus; concise `aria-live` announcing the RANGE only. **Multi-formula policy:** the DOMINANT result is the healthy-BMI weight range (the defensible primary the copy frames as the target); Robinson/Miller/Devine/Hamwi are shown as a SECONDARY accessible comparison table (col + row `scope` headers) — **no average is invented and no single formula is made authoritative**. Reuses the R7B.1 shared `@lib/health/body-measurements` primitives; formulas preserved in `ideal-weight.ts`. One guide (`healthy-weight-for-your-height`) embeds the island and updates accordingly. **R7C-1.1:** after the first result, changing sex moves the (sex-dependent) formula estimates while the height-only BMI range stays identical — a range-only announcement would be byte-identical and deduped (left silent), so the binding announces a distinct concise message (*"Healthy-weight range: X to Y … Formula estimates updated for [sex]."*) without moving focus, never speaking the formula rows. Decision logic is the pure `idealWeightAnnouncement`. |
| `migrated` (R7C-1) | **protein-calculator** | Standard-form wave, calculator #2 (runtime UNCHANGED). Task-first; body weight + goal/activity select; empty → **Calculate Protein Needs** → live-after-first; **Reset** (restores the default goal); field-level validation (weight never `Number()\|\|0`) + focus; concise `aria-live` announcing the PRIMARY daily target only. **Single-value policy:** the reviewed `calculateProtein` returns ONE gram value per goal (not a range), so the DOMINANT result is the selected goal's `N g/day`; every goal's g/kg factor + grams are shown as a SECONDARY accessible comparison table (col + row `scope` headers) with the **selected goal highlighted (`aria-current`)** — grams delegated verbatim to `protein.ts` (factors preserved). Reuses the R7B.1 shared `@lib/health/body-measurements` weight conversions. One guide (`how-much-protein-do-you-need`) embeds the island and updates accordingly. |
| `migrated` (R7C-2A) | **body-fat-calculator** | Standard-form wave, calculator #3 — the **first CONDITIONAL-input migration** (runtime UNCHANGED). U.S. Navy circumference method: men need height/neck/waist, women additionally need **hip**. Task-first; empty → **Calculate Body Fat** → live-after-first; **Reset** (restores male + hidden hip). The hip row is shown only for women (island DOM helper) and the binding's required-field SET excludes it for men, so the runtime's own validate→invalid/valid transitions do the right thing: switching sex to one needing an empty measurement invalidates (never shows the stale result) without stealing focus; switching to one needing fewer recomputes automatically. Explicit presence/positivity validation + **plain-language formula-domain checks** (men: waist > neck; women: waist + hip > neck — never "logarithm argument…"); a finiteness+positivity gate turns the formula's out-of-domain NaN/negative into the invalid state. DOMINANT percentage + **TEXT** classification (colour-coded pills dropped — no colour-only meaning, no diagnostic implication) + a SECONDARY accessible category scale (col + row `scope` headers, sex-specific ranges, visitor's category `aria-current`). Concise `aria-live` (`"…18.4 percent, classified as [category]."`). Formula + classification preserved in `body-fat.ts`; conversions reuse the shared `@lib/health/body-measurements` primitives. One guide (`body-fat-percentage-explained`) embeds the island and updates accordingly. **R7C-2A.1 hardening:** (a) result **sanity boundary** — a valid estimate must be `finite && 0 < pct < 100`; the pure `isRealisticBodyFat` gates `validate` (plain-language *"These measurements do not produce a realistic estimate…"*, no clamp/internals) and backstops `resultValue`. (b) **Conditional hip** — when not applicable the hip input is `hidden` **and** `disabled` (out of the keyboard + a11y order, never submitted), its stale error cleared; the entered value is **preserved** across an in-session sex switch and only cleared on Reset. (c) **Category ownership** — the selected category carries TEXT ownership (*"Your category: …"* + an sr-only per-row marker), never colour/`aria-current` alone. First-viewport at 1366×768: H1 137px, selectors 294px, last required field 534px, Calculate 633px, result 269px — all above the fold. |
| `migrated` (R7C-2B) | **calorie-calculator** | Standard-form wave, calculator #4 (runtime UNCHANGED). Mifflin-St Jeor BMR × activity (TDEE) + the reviewed goal deltas, all preserved in `calorie.ts`; shares `bmr.ts` + the shared `ACTIVITY_LEVELS`. Task-first; sex + age + height/weight + Activity + a new **Goal** selector; empty → **Calculate Calorie Needs** → live-after-first; **Reset** (restores Male / Metric / Moderate / Maintain); field-level validation (never `Number()\|\|0`, imperial height via the shared classifier); concise `aria-live` naming the selected goal. **Goal-selector policy:** the DOMINANT figure is the selected goal's daily target — a value `calculateCalories` already returns (maintenance, or ±250/±500 kcal) — so no number/range/average is fabricated; Maintenance (TDEE) and BMR are accurately-labelled secondary references (activity-adjusted values are never called BMR), and all five goals are an accessible comparison (col + row `scope` headers) with the selected goal highlighted + named (*"— your goal"*). A finite+positive gate + `validate` sanity reject a non-usable target (*"These details do not produce a usable calorie estimate…"*); non-positive goal values render as a dash. Two guides (`complete-guide-to-healthy-weight`, `bmi-bmr-and-calories-explained`) embed the island and update accordingly. First-viewport at 1366×768 (all above the fold): H1 137px, selectors 294px, age 353px, height/weight 444px, activity/goal 562px, Calculate 630px, result 269px. **R7C-2B.1 hardening:** goal scenarios are labelled with their exact adjustments (*Maintain weight · Mild weight loss (−250 kcal/day) · Weight loss (−500 kcal/day) · Mild weight gain (+250) · Weight gain (+500)*) and framed as *"Based on the selected calculation scenario"* (not medical recommendations; formula/adjustments unchanged). A non-positive UNSELECTED goal renders **"Not available"** (never a dash/zero/negative) with an in-cell sr-only explanation; a non-positive SELECTED goal makes the result invalid (never shows another goal as the result). |
| `not-migrated` | the other **40** live calculators | Current recurring-gap behavior; scheduled by family wave. |
| `approved-exception` | (none yet) | Reserved for deliberate, documented deviations. Requires a documented user-task reason, tests and explicit matrix approval (see Ratified product decisions #7) — legacy compatibility alone is never a valid reason. |

> **R2 / R2.1 note (2026-07-19):** BMI is the first standard-form migration. The
> shared standard-form runtime (`src/lib/result/form-runtime.ts`) is validated for
> **standard one-form calculators only**; the rest of the standard-form family
> (converters, date/duration, dynamic-row, multi-mode, financial schedules,
> specialized reports) is **not** certified by this single pilot and must be
> validated per subfamily before binding. R2.1 tightened imperial-height
> validation (feet = non-negative integer; inches finite and `0 ≤ in < 12` with
> "Enter inches from 0 to 11."; total > 0; no silent normalization) and added a
> reusable `ResultShell` `placeholderAlignment: 'start' | 'center'` prop (shared
> `result.css`) so no calculator needs a bespoke display override. Two
> BMI-embedding guides show the migrated tool (same component); prose unchanged.

> **R3 note (2026-07-19):** Percentage is the first equation migration. The shared
> equation runtime (`src/lib/result/equation-runtime.ts`) mounts one instance per
> `<form data-equation>`, so equations are fully independent (no shared listener).
> **Known limitations:** certified for **independent natural-language equations
> only** — it does NOT certify multi-mode forms, converters, date calculators,
> dynamic-row tools, financial schedules or specialized reports. The **Fraction
> Calculator and the wider equation family are NOT migrated** on the strength of
> this single pilot; each remaining equation tool must be validated before
> binding. The runtime reuses the shared result state machine + focus helpers;
> the standard-form runtime (and BMI) are untouched.

> **R4 note (2026-07-19):** Password is the first generator migration. The shared
> generator runtime (`src/lib/result/generator-runtime.ts`) owns the
> explicit-generation gate, stale-on-settings-change (kept visible, Copy off, no
> silent regeneration), Copy availability and reset; `stale` is generator
> metadata (`data-stale`) layered over `valid`, NOT a new global ResultState.
> Announcements only ever carry `generated | stale | error | none` — never output
> content; the password is read from the DOM at copy time and is never stored,
> logged, put in a URL or transmitted. **Known limitations:** certified for
> **explicit-output generators only** (settings → Generate → one output). The
> **Random Number Generator and the wider generator family are NOT migrated** on
> this single pilot. It reuses the shared state machine + focus helpers; the form
> and equation runtimes (BMI, Percentage) are untouched.

> **R7B note (2026-07-19):** BMR is the first standard-form GENERALIZATION beyond
> BMI. The shared standard-form runtime (`src/lib/result/form-runtime.ts`) was used
> **UNCHANGED** — the whole point of the pilot was to prove generalization without
> bending the runtime to fit. New surface is confined to the BMR binding
> (`src/lib/calculators/bmr-form.ts`): reading a sex selector (a native radio group,
> so changes flow through the runtime's existing `input` path — no new event
> wiring), BMR validation, Metric/Imperial conversion, and rendering a dominant BMR
> figure + a **secondary** activity-level daily-calorie table (BMR × the canonical
> `ACTIVITY_LEVELS` reused read-only from `calorie.ts`; the previous island only
> cross-linked, so this is newly surfaced — the Mifflin-St Jeor formula and the
> multipliers are unchanged). Body-metric validators/converters are replicated from
> BMI's accepted semantics to keep BMI byte-identical; a later standard-form wave
> should extract them to a shared body-metrics module. **Outcome: the pilot
> SUPPORTS the planned R7C standard-form wave** — a certified runtime + a
> per-calculator binding + a task-first presentation flip generalizes cleanly. It
> does NOT certify multi-mode, shape-selector, converter, date/duration,
> dynamic-row, financial-schedule or specialized-report families.

## Family classification (canonical — 49 calculators, 13 families)

Primary interaction family; **(2°)** = secondary behavior. **Runtime-fit:**
`done` · **B** binding-only on a certified runtime · **C** certified runtime +
family-safe extension · **D** new family runtime required. **Test coverage:**
`dedicated` (own `*.test.ts`) · `batch` (shared `batch-*`/`gaps.test.ts`) ·
`indirect` (exercised only through another module's tests) · `missing`.
**Indirect coverage is NOT equivalent to a dedicated module test.**

| Family | n | Calculators (fit; coverage) |
|---|---|---|
| physical/keypad | 1 | scientific ✅done (dedicated) |
| standard form | 15 | **health (9):** bmi ✅done · bmr ✅done *(R7B — generalization pilot; runtime unchanged)* · ideal-weight ✅done *(R7C-1 — multi-formula; runtime unchanged)* · protein ✅done *(R7C-1 — single-value per goal; runtime unchanged)* · body-fat ✅done *(R7C-2A — first CONDITIONAL inputs: hip women-only; runtime unchanged)* · calorie ✅done *(R7C-2B — activity + goal selector; runtime unchanged)* · fat-intake *(B)*, target-heart-rate *(B; **missing** test)*, pace *(B/C — deferred, decision 5)* · **geometry (3):** triangle *(**C** — multi-output + triangle-inequality; batch)*, square-footage *(B; batch)*, concrete *(B; batch)* · **finance-simple (3):** simple-interest *(B; dedicated)*, inflation *(B; dedicated)*, tip *(B; batch)* |
| complex form | 7 | income-tax *(brackets + filing-status parameter; batch)*, interest *(dual simple-vs-compound; **indirect**)*, interest-rate *(iterative solver; batch)*, investment *(proportion bar; dedicated)*, retirement *(multi-metric report; dedicated)*, auto-loan *(collapsible groups; dedicated)*, home-equity-loan *(LTV advisory; batch)* — all **C** |
| shape selector | 2 | area, volume — **D** *(shape `<select>` rebuilds the input-field schema at runtime; the certified standard-form runtime assumes fixed fields; **indirect** via `gaps.test.ts`)* |
| equation | 2 | percent ✅done (dedicated) · fraction *(**C** — operator-select operand + tri-format output; dedicated)* |
| explicit-output generator | 1 | password ✅done (dedicated ×2) |
| random-data generator | 1 | random-number-generator *(**C** — extend generator runtime: explicit Generate, no-live, no-Copy, list output; already has `aria-live`; batch)* |
| converter | 2 | conversion, salary — **D** *(category / pay-period select drives the option lists + equivalence output, result-as-input; both batch)* |
| date/duration | 6 | age *(client-clock → intentional SSR-empty result + hydrate; dedicated)*, date *(two sub-tools/result-regions in one island; dedicated)*, due-date *(dedicated)*, pregnancy *(**missing** test)*, hours *(dedicated)*, time *(batch)* — all **D** |
| multi-mode | 4 | sales-tax *(add/remove)*, payment *(term/payment)*, credit-card-payoff *(2° schedule)*, savings *(2° schedule — project/goal)* — all **D** |
| dynamic-row | 2 | gpa *(pure add-row; batch)*, grade *(2° co-resident fixed "final-needed" mode + advisories; batch)* — **D** |
| financial schedule | 4 | mortgage *(2° complex-form; **the only island embedded live in a guide** → highest regression risk; dedicated)*, amortization *(**indirect** via loan)*, loan *(dedicated)*, compound-interest *(dedicated)* — all **D** |
| specialized report | 2 | statistics *(dedicated)*, standard-deviation *(**indirect** — shares `StatisticsCalculator` + module via `primary` summary/sd)* — **D** |

**Reclassifications from the prior (stale "48") audit — now canonical:**
`salary` → **converter** (pay-period select, not a solve-mode) · `income-tax` →
**complex form** (filing status is a parameter, not a mode) · `savings` →
**multi-mode** with schedule behavior · `home-equity-loan` → **complex form** ·
`interest` → **complex form** · `area` & `volume` → **shape-selector family** ·
`triangle` → **standard form requiring a family-safe extension** ·
**financial-schedule family = `mortgage`, `amortization`, `loan`,
`compound-interest` only**. The prior audit also omitted `inflation-calculator`
and undercounted date/duration; both are fixed here.

**Coverage gaps to close before the relevant wave:** dedicated tests for
`target-heart-rate` and `pregnancy` (**missing**); dedicated tests for the
`src/lib/finance.ts` schedule engine and the *indirect* modules (amortization,
interest, standard-deviation) before their family waves.

## Ratified product decisions (R7A.1)

1. **Complex-finance initial state** starts **empty** by default. A labelled
   Example requires **calculator-specific approval + evidence** (the only
   sanctioned source of an `approved-exception`; see #7).
2. **Converter family** uses a **neutral value `1`** with **immediate
   conversion** — **no Calculate button required**. This is an **approved family
   behavior, not a doctrine violation** of the one-primary-action rule.
3. **Multi-mode state** stays **ephemeral** initially — **no query-parameter mode
   state** during a multi-mode tool's first migration.
4. **Financial-schedule order:** inputs → Calculate → summary →
   interpretation/assumptions → schedule control → detailed schedule →
   monetization.
5. **Pace** classification (standard-form vs multi-mode) is **deferred to its
   pre-wave source audit**.
6. **Interest Calculator** remains a **distinct complex-form calculator** (never
   folded into simple/compound).
7. **Approved exceptions** require a **documented user-task reason, tests, and
   explicit matrix approval**. **Legacy compatibility alone is not a valid
   reason.**

## Current compliance matrix (by family)

Legend: ✅ meets · ⚠️ partial · ❌ gap.

| Doctrine axis | Physical | Std form | Complex/finance | Multi-mode | Equation | Generator | Converter | Date | Dynamic-row |
|---|---|---|---|---|---|---|---|---|---|
| Above-tool order (task-first) | ✅ live pg | ⚠️ legacy¹ | ⚠️ legacy¹ | ⚠️ legacy¹ | ⚠️ legacy¹ | ⚠️ legacy¹ | ⚠️ legacy¹ | ⚠️ legacy¹ | ⚠️ legacy¹ |
| Primary explicit action | ✅ `=` | ❌ auto | ❌ auto | ❌ auto | ❌ auto | ⚠️ Generate/live | ❌ auto | ❌ auto | ❌ auto |
| Initial state / result ownership | ✅ `0` | ❌ prefilled result reads as user's | ❌ same | ❌ same | ❌ same | ⚠️ auto-gen on load | ❌ same | ⚠️ some SSR `—`² | ❌ same |
| Input↔result proximity | n/a | ✅ 2-card | ✅ 2-card | ✅ 2-card | ✅ inline | ✅ | ⚠️ input-as-result | ✅ | ✅ |
| Reset (deterministic) | ✅ AC | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ row× only |
| Result `aria-live` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Field-level validation | ⚠️ parser | ❌³ | ❌³ | ❌³ | ❌ | ⚠️ soft | ❌ | ❌ | ❌ |
| No NaN/∞ leak | ✅ | ✅ `—` | ✅ `—`/"Never"⁴ | ✅ | ✅ `—` | ✅ | ✅ | ✅ | ✅ |
| Progressive disclosure | n/a | mostly none | ⚠️ Mortgage `<details>` only | ⚠️ mode toggles | n/a | ⚠️ options | n/a | n/a | ⚠️ add-row |
| Monetization boundary | ✅ off/below | ✅ off/below | ✅ off/below | ✅ off/below | ✅ | ✅ | ✅ | ✅ | ✅ |
| Keyboard + mobile path | ✅ | ⚠️ native inputs; no focus mgmt | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ |

¹ 9 calculator pages are task-first (scientific, bmi, bmr, ideal-weight,
protein, body-fat, calorie, percent, password); the other 40 render the category
eyebrow + review metadata above the tool (legacy `CalculatorLayout` mode). ² Age/GPA/Pregnancy SSR `—`; DueDate partial.
³ Inline *warnings* exist on triangle, home-equity-loan, grade, payment,
body-fat (not field-level error association). ⁴ credit-card-payoff & payment
render "Never" for non-finite payoff.

## Notable per-calculator exceptions

- **Has reset:** only `scientific` (AC). **Has result `aria-live`:** only
  `scientific`, `random-number-generator`, `password-generator`.
- **Empty SSR (no prefilled result):** `age`, `gpa`, `pregnancy`; `due-date`
  partial. **Sentinel for edge inputs:** `credit-card-payoff`, `payment` → "Never".
- **Real inline warnings:** `triangle` ("cannot form a triangle"),
  `home-equity-loan` ("exceeds available equity"), `grade`, `payment`, `body-fat`,
  `random-number-generator`.
- **Generator split:** `random-number-generator` = explicit Generate, **no
  live**, **no Copy**; `password-generator` = Generate/regen + **live** + Copy.
- **Converter (2):** `conversion` (category → from/to selects, readonly result
  input) and `salary` (pay-period select → equivalence table). Neutral default
  `1` + immediate conversion is the approved family behavior (product decision 2).

## Family-level migration roadmap (maps to existing phases)

The doctrine is realized by the planned phases — this roadmap sequences the
canonical families (above) onto them; **no new fix-each-calculator work.** Family
membership + runtime-fit (B/C/D) come from the canonical classification.

| Wave | Families (canonical) | Vehicle (phase) | State |
|---|---|---|---|
| A | equation, explicit-output generator, standard-form (pilots) | R1 primitives + R2/R3/R4 runtimes; BMI / Percent / Password | ✅ shipped |
| — | monetization regions (all placements off) | R5 architecture + R6 CalculatorLayout integration + R6.1 CI gate & bridge scope | ✅ shipped |
| — | migration program (audit → waves → policies) | **R7A** (+ R7A.1 canonical audit) | ✅ shipped |
| B | standard-form (fit B: health-personal, geometry-simple, finance-simple) | binding-only on the certified standard-form runtime — **R7B pilot = `bmr`**, then family waves | ▶ R7B |
| C | complex-form, equation-extension (fraction), shape-selector, random-data | certified runtime + family-safe extension; pilot per family | ⏳ |
| D | converter, date/duration, multi-mode, dynamic-row, financial-schedule, specialized-report | **new** family runtimes; foundation → pilot → wave, one at a time | ⏳ |
| — | above-tool order for every migrated page | `CalculatorLayout presentation="task-first"` (flips **with** each migration) | ▶ ongoing |
| ✅ | physical/keypad | `PhysicalCalculator` (legacy island retired R0.5) | ✅ compliant |

Each family is **validated individually** before its runtime claims support (per
the R0 correction). No category-wide migration in one commit; pilots first, each
behind build + `astro check` + unit + E2E + backward-compat + `assert:mon-off`
gates.

## Guardrail

Commercial value never affects search ranking or calculated results; pages stay
fully usable with all monetization disabled; trust first, revenue second.
