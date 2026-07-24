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

**Audit date:** 2026-07-25 · **Source commit:** this R10C1 migration (Concrete;
see the provenance table). Re-run and refresh the date, commit and
counts whenever the fleet changes.

| Metric | Value |
|---|---|
| Total live calculators | **49** |
| Migrated (task-first + shared runtime) | **21** — scientific, bmi, **bmr**, **ideal-weight**, **protein**, **body-fat**, **calorie**, **target-heart-rate**, **fat-intake**, **pace**, **sales-tax**, **payment**, **credit-card-payoff**, **savings**, **simple-interest**, **tip**, **inflation**, **square-footage**, **concrete**, percent, password-generator |
| Not migrated (legacy) | **28** |
| Approved exceptions | **0** |
| Distinct Astro islands | **47** — statistics + standard-deviation share `StatisticsCalculator` via a `primary` prop; **scientific uses `PhysicalCalculator`** (`components/calc/`, not an island) |
| Embed exposure | **all 49** — each calculator is served by a **generated per-slug static page** `src/pages/embed/<category>/<slug>.astro` (R7D1; the dynamic `IslandBySlug` route was retired). Same public URLs; each page bundles only its own island's scoped CSS |

**The 33 legacy calculators are noncompliant with the doctrine in the same
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
| R7D1 | per-slug public-embed code splitting (retire dynamic IslandBySlug; no calculator migrated) | `c0bbb01` |
| R7D1.1 | embed hardening: failing isolation gate + source-of-truth contract + generated-page contract test (no calculator migrated) | `d3d5977` |
| R7C-2C chars | target-heart-rate formula characterization suite (parity net; no formula change) | `295fddc` |
| R7C-2C | target-heart-rate-calculator (optional resting HR → Karvonen/simple; accessible zone table) | `1df53ed` |
| R7C-2C.1 | target-heart-rate hardening: visible method identity + stateful method-change announcement + age<220 semantics + resting 0≠empty + zone caption (no calculator migrated) | `92ad566` |
| R7C-2D chars | fat-intake formula characterization suite (parity net; no formula change) | `1f2cad2` |
| R7C-2D | fat-intake-calculator (single calorie target → AMDR fat range 20–35%; range preserved) | `9e6f798` |
| R7C-2D.1 | standard-form runtime: **per-instance** result-description context (retires the ideal-weight + target-heart-rate module-global announcement cells); fat-intake midpoint relabel (no calculator migrated) | `e706128` |
| R7C-2E0 | Pace family + runtime audit (read-only; single-mode → standard form; Sales Tax = multi-mode pilot) | *(no commit — analysis only)* |
| R7C-2E1 chars | pace formula characterization suite (parity net; no formula change) | `230156d` |
| R7C-2E1 | pace-calculator (single-mode; converting km/mi unit; corrected description) | `f9447cd` |
| R8A0 | Sales Tax multi-mode runtime-fit audit (read-only; verdict: existing runtime unchanged) | *(no commit — analysis only)* |
| R8A1 chars | sales-tax formula characterization suite expanded (parity net; no formula change) | `0ac5a77` |
| R8A1 | sales-tax-calculator (multi-mode add/remove on the UNCHANGED runtime; guide embed) | `f1ba91d` |
| R8B0 | Payment multi-mode source/interaction/runtime-fit audit (read-only) | *(no commit — analysis only)* |
| R8B1 chars | payment formula characterization suite expanded (both modes + duration rounding; parity net; no formula change) | `e36d38d` |
| R8B1 ext | standard-form runtime: optional `isUsableResult` gate for valid non-numeric results (default finite guard unchanged) | `b4c01a5` |
| R8B1 | payment-calculator (multi-mode term/payment + conditional field; informational "Never" payoff; corrected description) | `2940a73` |
| R8B1.1 | payment duration-presentation hardening: pure `presentDuration` normalizes a residual that rounds to 12 into the next year ("4 years, 12 months" → "5 years"); presentation only (no calculator migrated) | `8dfe0bc` |
| R8C0 | Credit Card Payoff multi-mode source/interaction/runtime-fit audit (read-only; verdict: existing runtime + accepted `isUsableResult`, no new extension) | *(no commit — analysis only)* |
| R8C1 chars | credit-card formula characterization (consolidated from batch-b; both modes + ceil/round + all-Infinity never; parity net; no formula change) | `47a3da0` |
| R8C1 ext | extract the shared payoff duration presenter to `@lib/format` (Payment behaviour byte-identical; only asset-hash change) | `513b34c` |
| R8C1 | credit-card-payoff-calculator (multi-mode payment/timeline + conditional field; enriched interest+total-paid breakdown; informational "Never"; refined description) | `0757a64` |
| R8C1.1 | isolate the payoff duration presenter into `@lib/format-duration` (unrelated `formatCurrency` consumers byte-identical vs pre-pollution) | `c8d5423` |
| R8D0 | Savings multi-mode source/interaction/runtime-fit audit (read-only; verdict: existing runtime unchanged, no `isUsableResult`, summary-only) | *(no commit — analysis only)* |
| R8D1 chars | savings formula characterization expanded (both modes + the latent yearly series + already-reached; parity net; no formula change) | `b457b75` |
| R8D1 | savings-calculator (multi-mode project/goal + conditional field; enriched projection breakdown; valid-$0 "already reached"; summary-only; refined description) | `e6169f9` |
| R9A0 | Finance-simple family triage + runtime-fit audit (read-only; Simple Interest / Inflation / Tip; verdict: all Decision A on the UNCHANGED runtime; pilot order Simple Interest → Tip → Inflation) | *(no commit — analysis only)* |
| R9A1 chars | simple-interest formula characterization expanded (ordinary / zero / current-negative / non-finite / precision; parity net; no formula change) | `736ba96` |
| R9A1 | simple-interest-calculator (**first finance-simple migration**; single mode, no selectors; interest-earned dominant + total breakdown; empty → Calculate → live-after-first; runtime UNCHANGED, no `isUsableResult`; guide embed) | `f9f0edd` |
| R9B1 chars | tip formula characterization (consolidated out of `gaps.test.ts` into a dedicated `tip.test.ts`; parity net; no formula change) | `c3eca9e` |
| R9B1 | tip-calculator (**second finance-simple**; single mode + accessible tip-% PRESET group; total-per-person dominant + tip/total/tip-per-person breakdown; whole-people ≥ 1; refined description; runtime UNCHANGED, no `isUsableResult`; no preset abstraction) | `3218413` |
| R9C1 chars | inflation formula characterization expanded (ordinary / zero / valid deflation / non-finite cliff / negative-amount / non-finite inputs; parity net; no formula change) | `c49862b` |
| R9C1 | inflation-calculator (**third/final finance-simple — family COMPLETE**; single mode; deflation-safe validation rate > -100; future-cost dominant + buying-power $ + signed cumulative % breakdown; refined description; runtime UNCHANGED, no `isUsableResult` — malformed-result guard in `resultValue`) | `2509c65` |
| R10A0 | Geometry family triage + runtime-fit audit (read-only; Square Footage / Concrete / Triangle; verdict: all on the existing standard-form runtime — SqFt/Concrete = converting-unit (Pace precedent), Triangle = cross-field domain `formError`; pilot order Square Footage → Concrete → Triangle) | *(no commit — analysis only)* |
| R10B1 chars | square-footage formula characterization (consolidated out of `gaps.test.ts` into a dedicated `square-footage.test.ts`; all 4 units + quantity/price edges + metre drift; parity net; no formula change) | `c0b394f` |
| R10B1 | square-footage-calculator (**first geometry migration**; converting native-select input unit ft/in/yd/m (Pace `convertValues`); total-sq-ft dominant + m²/yd² + conditional one-section & optional cost rows; runtime UNCHANGED, no `isUsableResult` — guard in `resultValue`) | `609c85c` |
| R10C1 chars | concrete formula characterization (consolidated out of the shared `batch-d.test.ts` into a dedicated `concrete.test.ts`; ordinary feet + metres + the UNROUNDED-derivation divergence + the three bag-yield ceil boundaries + waste/dimension edges; parity net; no formula change) | `5133013` |
| R10C1 | concrete-calculator (**second geometry migration**; converting native-RADIO input unit ft/m over length + width + depth (Pace `convertValues`, 3 fields); cubic-yards dominant + m³/ft³ equivalents + a fixed 40/60/80 lb bag table; **NO cost** — cost FAQ clarified; waste optional, no legacy 10% prefill; runtime UNCHANGED, no `isUsableResult` — guard in `resultValue`) | *(this R10C1 migration commit)* |

**Fleet after R8D1:** 49 total · **16 migrated** · **33 legacy** · **0 approved exceptions**. **Embed architecture:** 49 generated static calculator routes · 0 dynamic calculator embed routes · **0 unrelated calculator-scoped CSS per embed** (enforced). **Multi-mode family COMPLETE** — all four are migrated on the standard-form runtime: Sales Tax (simplest: same two fields), Payment (conditional field + summary-only informational "Never"), Credit-Card Payoff (conditional field + an ENRICHED interest/total-paid breakdown + informational "Never"), and Savings (project/goal conditional field + a projection breakdown + a valid-$0 "already reached" outcome). Payment/Credit-Card use the accepted `isUsableResult` gate; **Savings needs neither a new extension nor even `isUsableResult`** (its "already reached" answer is a finite $0 that the default gate accepts). **No dedicated multi-mode or financial-report runtime was ever built** — Savings' latent yearly series stays unrendered (summary-only), and any future schedule would be binding-owned markup (the BMR/calorie table precedent), not a runtime.

**Fleet after R9A1:** 49 total · **17 migrated** · **32 legacy** · **0 approved exceptions**. **Finance-simple family STARTED (1 of 3 audited).** Simple Interest is the pilot: single mode, **no structural selectors**, always-finite, migrated on the standard-form runtime **UNCHANGED — no `isUsableResult`** (R9A0 Decision A). **Interest earned** is the dominant result; the **Total amount** is a one-row breakdown (not co-equal). All fields start EMPTY (the legacy island prefilled $5,000 / 5% / 3 yr and auto-calculated on load); explicit **Calculate Simple Interest** → live-after-first. Principal/rate/time are each required, finite and ≥ 0 (an explicit 0 is valid); negative rates are rejected (no depreciation) and **fractional years are allowed**. The guide `simple-interest-explained` (which embeds the island) renders the migrated task-first tool with **no prose change**. **Tip and Inflation remain legacy** (audited in R9A0, not migrated); the recommended order is Simple Interest → Tip → Inflation.

**Fleet after R9B1:** 49 total · **18 migrated** · **31 legacy** · **0 approved exceptions**. **Finance-simple family 2 of 3.** Tip is single mode with the family's (and the fleet's) **first accessible PRESET quick-set group** — the tip-% buttons are ISLAND-owned toggle controls (`aria-pressed` + a non-colour selected state: fill + heavier border + a ✓ glyph) that write into the numeric tip field and dispatch its normal input event, so the runtime recomputes through the SAME path as typing. The numeric field stays the source of truth (a typed match presses a preset; any other value, including 0, clears all); **no preset runtime or shared abstraction was created**. Total-per-person is the dominant result; tip / total-bill / tip-per-person form the breakdown. Bill + tip % required ≥ 0 (0 valid); **people required a whole number ≥ 1** (fractional/zero/negative rejected at the interaction layer, never silently floored). The registry **description was refined** ("Calculate the tip, total bill, and amount per person when splitting a bill.") — the only intentional ripple to directory / category / search / related-tools surfaces. **No guide embeds Tip; `reference/tip-table` imports neither the island nor the formula and is unchanged.** Inflation remains legacy (audited, not migrated) — the last finance-simple calculator, with the family's only open product decision (deflation / non-finite validation).

**Fleet after R9C1:** 49 total · **19 migrated** · **30 legacy** · **0 approved exceptions**. **FINANCE-SIMPLE FAMILY COMPLETE (3/3)** — Simple Interest, Tip and Inflation, all on the standard-form runtime UNCHANGED with **no `isUsableResult`**. Inflation resolved the family's only open product decision: a **NEGATIVE rate is valid deflation**, and only `rate <= -100` (the non-finite cliff — factor 0 → NaN buying power; below −100 → NaN/negative/astronomical) is rejected, alongside a negative amount. The result is **mixed-unit**: a dominant projected future cost ($) + future buying power ($) + a **signed cumulative price change (%)** labelled neutrally ("Cumulative price change", never "increase", not colour-coded) so deflation never reads as an error. Crucially, `isUsableResult` stayed unimplemented: the all-outputs-finite + non-negative-currency guard lives in **`resultValue`** (returns a non-finite sentinel for a malformed result so the DEFAULT gate rejects it) — a new pattern that keeps the runtime untouched. Description refined ("Estimate how inflation or deflation changes future prices and purchasing power over time."). **No guide embeds Inflation; `reference/inflation-purchasing-power-table` imports the pure formula (unchanged) and stays byte-identical.** With finance-simple done, the standard-form migrated set spans health-personal (9) + finance-simple (3) + multi-mode (4) + the R1–R4 pilots; **geometry-simple** (triangle, square-footage, concrete) is the next standard-form family to audit.

**Fleet after R10B1:** 49 total · **20 migrated** · **29 legacy** · **0 approved exceptions**. **Geometry family STARTED (1 of 3 audited, R10A0).** Square Footage is the pilot — the first GEOMETRY migration and the first to reuse the **converting-unit** capability (Pace's `convertValues`) on the standard-form runtime UNCHANGED, extended to govern **two** fields (length + width) via a native `<select>` (ft/in/yd/m). The unit change is **dimension-preserving** (converts the entered numbers, replacing the legacy reinterpret) — driven island-side (the select's input event feeds the runtime's normal live recompute; the 180ms debounce lands the synchronous conversion first), so **no new runtime hook**. Total square feet stays the dominant output; m²/yd² are equivalents; the **one-section** row shows only when quantity > 1 and the **estimated cost** row only when a price is entered (empty price → no row; entered 0 → $0.00 — no misleading default). Dimensions required > 0, quantity a whole number ≥ 1, price optional ≥ 0 (per square foot, USD, unchanged by the dimension unit). **No `isUsableResult`** — the all-outputs-finite/≥0 guard lives in `resultValue` (the Inflation precedent). No guide/reference embeds it. **Concrete and Triangle remain legacy** (audited, not migrated); order Square Footage → Concrete → Triangle.

**Fleet after R10C1:** 49 total · **21 migrated** · **28 legacy** · **0 approved exceptions**. **Geometry family 2 of 3.** Concrete is the second GEOMETRY migration — a single rectangular-prism volume (slab / wall / footing) on the standard-form runtime UNCHANGED, and the second calculator to reuse the **converting-unit** capability (Pace's `convertValues`), here governing **three** fields (length + width + depth) via a native **radio** group (ft/m) rather than a `<select>`. The unit change is **dimension-preserving** (converts the entered numbers, replacing the legacy reinterpret) and island-driven — the radio's own input event feeds the runtime's normal live recompute (the 180 ms debounce lands the synchronous conversion first), so **no new runtime hook**; before the first calc a unit change converts without calculating, after it recomputes with the physical volume preserved, and focus stays on the radio. **Cubic yards** is the dominant output; m³/ft³ are equivalents and a **fixed 40/60/80 lb bag table** (semantic `<th scope>` rows, whole ceil counts, visible yield assumptions) is the breakdown. The waste allowance is **optional** — empty → 0% (no legacy 10% prefill), an entered 0 valid, negative/non-finite rejected; length/width/depth required, finite, > 0. **The calculator computes NO cost** — a fixed rectangular prism only, no shapes/modes/quantity — and the cost-related FAQ was clarified to say so (multiply the returned cubic yards by local supplier pricing). **No `isUsableResult`** — the all-volumes-finite/≥0 + whole-bag guard lives in `resultValue` (the Inflation precedent). No guide or reference page embeds it; the registry description is unchanged. **Triangle remains legacy** (audited R10A0, not migrated) — the last geometry calculator and the family's cross-field domain-guard case (triangle inequality via `formError`).

**Documented runtime extension (R7C-2D.1).** The standard-form runtime gained a small, backward-compatible contract: `describeResult(result, context)` where `context: ResultDescriptionContext<R>` carries `{ phase: 'first-result' | 'live-update', previousResult? }`. Each `mountFormCalculator` call owns a `createResultDescriptionTracker` (previous-result cell in the closure), so **two mounted copies of a calculator never share announcement state** and Reset clears only that instance. Transition-aware bindings (ideal-weight sex change, target-heart-rate method change) consume the context and hold **no module-global state**; the six non-transition form bindings ignore the context unchanged (a 1-arg `describeResult` still satisfies the interface).

**Documented runtime extension (R8B1).** The standard-form runtime gained a second small, backward-compatible contract: an optional `isUsableResult?(result): boolean` on the binding. By default the success gate is unchanged — a result is usable iff its primary `resultValue` is finite — so **every one of the thirteen prior bindings behaves identically** (none implements the hook). A binding whose meaningful result is deliberately non-numeric may implement it to accept such a result in the VALID region instead of the invalid state; a malformed result still returns `false` and falls through to invalid. Payment is the first consumer and Credit-Card Payoff the second: an impossible payoff (a positive payment that never covers the interest) renders as the informational **"Never"**, a valid result, not an input error. The gate lives in a pure, unit-tested `isResultUsable(binding, result)` helper; no formula logic, no multi-mode machinery, and no per-family runtime entered the shared layer. These two are the runtime's only extensions since R2 — every calculator migration remains "runtime unchanged" for bindings that don't opt in. (R8C1 also extracted the shared payoff **duration presenter** to `@lib/format` — a pure formatter move, not a runtime change.)

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
- **Canonical source (R7D1.1 source-of-truth contract):** the **registry**
  (`@data/calculators`) is the SOLE authority on the live set **and** each
  calculator's `category` — hence its route. `src/data/embed-components.json`
  (+ typed `embed-components.ts`) carries **component identity ONLY** — serializable
  `slug → { componentPath, props? }` (path strings + JSON-safe props, so a pure-Node
  generator needs no TS loader). The manifest no longer duplicates
  `category`/`title`/`status`, so there is no projection to drift; the generator
  parses the registry for each slug's category. A coverage test asserts the map
  matches the live registry EXACTLY **and** that every entry is component identity
  only (keys ⊆ `{componentPath, props}`).
- **Generator:** `npm run gen:embed-pages` (`scripts/gen-embed-pages.mjs`) writes
  one deterministic page per live calculator (sorted slugs, LF newlines, forward-
  slash paths, sorted prop keys). `--only a,b` limits to a subset.
- **Drift gate:** `npm run assert:embed-pages-current` (`--check`) regenerates in
  memory and fails on any missing / stale / orphaned page. **Wired into the required
  CI `build-and-test` job** (after `check`). Generated pages are committed.
- **Isolation gate (R7D1.1):** `npm run assert:embed-isolation`
  (`scripts/assert-embed-isolation.mjs`) is a FAILING architectural gate with **no
  byte budget**, run **after `npm run build`** in CI. It fails if the legacy dynamic
  renderer returns (`IslandBySlug.astro` / `[category]/[slug].astro`), if any
  generated page uses a component map / `import.meta.glob` / runtime dynamic import /
  `<script>` loader / ≠ 1 island import, or if any built embed's CSS carries a scoped
  rule for a `data-astro-cid` **not rendered** on that page (unrelated
  calculator-scoped CSS / ownership). Asserts all 49 embeds; verified 0 unrelated.
  `report:embed-css` stays informational alongside it.
- **Generated-page contract test:** `embed-components.test.ts` asserts each generated
  page is exactly **one literal island import** + one shared `EmbedPageShell` + a
  **registry-derived** `getCalculator('<category>', '<slug>')`, the AUTO-GENERATED
  header, the expected props, no map / glob / dynamic-lookup / runtime request, and
  deterministic output (LF newlines, trailing newline).
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
+ the generator/map/shell + the drift gate + the R7D1.1 isolation gate +
coverage/route/contract tests, and restore the previous baseline. One
tightly-bounded change; no calculator migration is entangled.

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
| `migrated` (R7C-2C) | **target-heart-rate-calculator** | Standard-form wave, calculator #10 (runtime UNCHANGED). Age + an **optional resting heart rate**; the reviewed `calculateTargetHeartRate` is preserved byte-for-byte (max HR = 220 − age; **Karvonen** heart-rate-reserve method when a resting rate is supplied, otherwise a simple percentage of max; five fixed contiguous zones 50–100%). Task-first; empty → **Calculate Heart Rate Zones** → live-after-first; **Reset**; field-level validation + first-invalid focus; concise `aria-live` (max HR + training span + method). The DOMINANT figure is the estimated maximum heart rate; the five zones are a SECONDARY accessible comparison table (col `scope` = Zone / Intensity / Heart rate; row `scope` = zone name). **Formula characterization FIRST (commit `295fddc`, no formula change):** a dedicated `target-heart-rate.test.ts` froze the exact outputs (both methods, every zone bound, rounding, and the frozen quirks) so the migration's new validation is a visible binding-level decision. **Two legacy input gaps closed at the binding (not the formula):** a missing/non-whole/out-of-range age (the legacy island let an empty age become 0 → a misleading maxHr 220) and a resting rate ≥ max (which inverted the zones) are now explicit field errors. The reference chart `/reference/target-heart-rate-table` shares the unchanged pure function and is byte-identical. No guide embeds the island. **R7C-2C.1 hardening:** (a) the result **visibly names the method** — *"Method: Percentage of estimated maximum heart rate"* (resting empty) or *"Method: Karvonen heart-rate-reserve method"* (resting supplied); a simple result is never labelled Karvonen. (b) After the first result, adding/clearing a valid resting HR **switches method and recomputes automatically**, keeps focus on the resting-HR field, and speaks ONE concise method-change line (*"Target heart-rate zones updated using the … method."*), never the table — decision logic is the pure `targetHeartRateAnnouncement(result, previousMethod)`. (c) **Exact input semantics:** age required/whole/`> 0`/`< 220` (the arbitrary 120 cap removed — the source documents none); resting HR optional only when empty, else whole/`> 0`/strictly `< max`; an entered **0 is invalid and never equivalent to empty**. (d) the zone table gained a visible **caption** (*"Estimated heart-rate zones based on the selected calculation method."*); no *safe/recommended/required* zone language. First-viewport at 1366×768 (all above the fold): H1 137px, Age 322px, Resting HR 413px, Calculate 529px, result-panel 269px, max-HR value 312px. |
| `migrated` (R7C-2D) | **fat-intake-calculator** | Standard-form wave, calculator #11 (runtime UNCHANGED). A single daily calorie target → the reviewed daily fat RANGE, preserved byte-for-byte in `fat-intake.ts` (AMDR 20–35% of calories at 9 kcal/g, with a 27.5% moderate midpoint; `Math.round` per gram). Task-first; the calorie field starts EMPTY (the legacy island prefilled 2,000 kcal and showed 44–78 g as the visitor's result); empty → **Calculate Fat Intake** → live-after-first; **Reset**; field-level validation + first-invalid focus; concise `aria-live` announcing the RANGE only. **Range policy:** the DOMINANT figure is the `[min]–[max] g/day` range — never collapsed to one average; the AMDR proportion breakdown (Lower 20% / Moderate 27.5% / Upper 35%) is a SECONDARY accessible table (col + row `scope` headers). **Formula characterization FIRST (commit `1f2cad2`, no formula change):** a dedicated `fat-intake.test.ts` froze the exact outputs (2,000 → 44/61/78), rounding, band ordering, and the 0/negative/NaN → all-zero quirks. **Validation guard:** a calorie target `> 0` is required (never `Number()\|\|0`), and a target so low the range would round to non-positive grams is rejected with plain guidance (*"This calorie target is too low to estimate a daily fat range…"*) — no silent "0–0 g". No guide embeds the island. First-viewport at 1366×768 (all above the fold): H1 137px, calorie target 322px, Calculate 440px, result-panel 269px, range value 312px. |
| `migrated` (R7C-2E1) | **pace-calculator** | Standard-form wave, calculator #12 (runtime UNCHANGED). **SINGLE-MODE** — distance + a composite h:m:s elapsed time → the selected-unit pace, preserved byte-for-byte in `pace.ts` (`secPerKm = t/km`, `secPerMi = secPerKm·KM_PER_MI`, speeds, `predictTime`, `formatDuration`). Task-first; all fields start EMPTY (the legacy island prefilled 5 km / 25:00 and showed the result as the visitor's); empty → **Calculate Pace** → live-after-first; **Reset** (restores km); field-level validation + first-invalid focus; concise `aria-live` announcing the dominant pace only. **Composite time:** an accessible `fieldset`/legend ("Elapsed time") with Hours/Minutes/Seconds — 60 is NEVER normalised (a field error), empty is distinguished from an invalid entry, total time must be > 0, never `Number()\|\|0`. **Converting unit:** the km/mi control is the runtime's `[data-unit]` selector and **converts the entered distance** via `KM_PER_MI` (5 km ↔ 3.107 mi, stable round trip) — not a reinterpretation of the same number. **Selected-unit hierarchy:** the DOMINANT figure is the selected-unit pace (per-km when km, per-mile when mi); the other pace + both speeds are subordinate; equivalent finish times are an accessible table (caption + col/row `scope` headers) headed *"Equivalent finish times at the same pace"* with the assumption *"…these are not performance predictions."* **Formula characterization FIRST (commit `230156d`, no formula change):** dedicated `pace.test.ts` froze both units, the KM_PER_MI relationships, rounding, the all-NaN unusable cases and the Infinity quirk. **Description correction (R7C-2E1):** the registry description falsely promised *"pace, time or distance"* — corrected to *"Calculate running pace and speed from distance and elapsed time, with equivalent finish times for common race distances."*; the page intro + content + FAQ dropped *predicted/race-prediction* wording for *equivalent finish times*. **Solve-for-time / solve-for-distance are NOT added** (future feature, after the Sales Tax multi-mode pilot). No guide embeds the island. First-viewport at 1366×768 (all above the fold): H1 137px, distance 322px, unit selector 322px, elapsed-time 389–485px, Calculate 509px, result-panel 269px, primary pace 312px. |
| `migrated` (R8A1) | **sales-tax-calculator** | Standard-form wave, calculator #13 — the **first MULTI-MODE product** (add tax / remove tax), migrated on the standard-form runtime **UNCHANGED** (R8A0 verdict). The reviewed `addSalesTax` / `removeSalesTax` / `formatCurrency` are preserved byte-for-byte. **Mode = a native radio group** (a structural selector the runtime recomputes on, like calorie's goal); the **island owns** the visible mode presentation — the amount label ("Amount before tax" ⇄ "Total amount including tax") and the action label ("Add Sales Tax" ⇄ "Remove Sales Tax") sync instantly, and on a switch the mode-owned result is briefly **blanked** so no stale value shows under the new mode while the live recompute lands (the runtime's ~180 ms debounce). Task-first; amount + rate start EMPTY (the legacy island prefilled $100 / 7.25% and showed it as the visitor's result); empty → mode-specific action → live-after-first; **Reset** (restores Add + its labels); field-level validation. **Zero is valid** — an entered amount 0 or rate 0 computes (empty / negative / non-finite rejected; never `Number()\|\|0`). **Mode-specific dominant** (all three values always shown): Add → **Total including sales tax** dominant; Remove → **Amount before sales tax** dominant; concise USD `aria-live` (*"Total including sales tax is 108 dollars and 25 cents."*). **USD explicit** (formatCurrency en-US, 2 dp; "$" affix + "Amounts are in US dollars (USD)"; no currency selector/conversion). **Formula characterization FIRST (commit `0ac5a77`, no formula change):** `sales-tax.test.ts` expanded to 24 tests freezing both equations, zero cases, the negative/Infinity/denominator quirks and reversibility. **Guide embed:** `how-to-calculate-sales-tax.mdx` renders the migrated island (prose unchanged, still accurate). First-viewport at 1366×768 (all above the fold): H1 137px, mode selector 328px, amount 415px, rate 506px, action 577px, result-panel 269px, dominant 312px. |
| `migrated` (R8B1) | **payment-calculator** | Standard-form wave, calculator #14 — the **second MULTI-MODE product** and the first that **swaps a conditional field by mode** ("Solve for" → Monthly payment / Payoff time). Migrated on the standard-form runtime **plus one small `isUsableResult` extension**; the reviewed `loanPayment` / `solveMonths` / `pmt` are preserved byte-for-byte. **Mode = a native radio group** (structural, runtime recomputes on it); the **island owns** the conditional field — term mode shows the loan term (solve for the monthly payment), payment mode shows the monthly payment (solve for the payoff time) — the inactive field is `hidden` **and** `disabled` (out of the keyboard + a11y order, never submitted), its stale error cleared and its value **preserved** for an in-session switch back, and on a switch the mode-owned result is briefly **blanked**; the action label syncs ("Calculate Payment" ⇄ "Calculate Payoff Time"). The binding validates only the active mode's field. Task-first; all fields start EMPTY (the legacy island prefilled $20,000 / 6% / 5 yr and showed it as the visitor's result); empty → mode-specific action → live-after-first; **Reset** (restores term mode + its field/labels). **Input policies:** loan amount required `> 0`; rate required `≥ 0` (0% valid, no max); term required only in term mode `> 0` (fractional years allowed); payment required only in payment mode `> 0` — never `Number()\|\|0`. **Informational "Never" (Ratified product decision):** a positive payment that never covers the monthly interest (`solveMonths → Infinity`) renders as a **valid** result — dominant "Never" under "Estimated payoff time" + a plain explanation (*"This payment does not cover the monthly interest…"*), state stays `valid`, no `aria-invalid`, no zero/Infinity/NaN, no formula language; concise `aria-live` (*"At this payment amount, the loan will never be paid off…"*). Ordinary results: term → dominant monthly payment + "N monthly payments"; payment → dominant payoff duration ("4 years, 10 months") + "N monthly payments" (ceil). **R8B1.1 duration hardening:** a pure `presentDuration(rawMonths)` returns the visible + accessible wording; whole-year = floor, residual = round, and a residual that rounds to a full 12 **carries into the next year** ("4 years, 12 months" → "5 years") — presentation only, so the raw payoff months and `paymentCount = ceil(rawMonths)` are untouched. No "0 years"/trailing "0 months"/"12 months"-after-a-year/terse/fractional output; sub-month → "Less than 1 month"; non-finite/negative → neutral dash; the live announcement uses the same normalized wording. **No result enrichment** (no total paid / interest / schedule). **Description corrected:** *"Solve for the payment, term or amount on a fixed loan"* (no amount mode exists) → *"Calculate the monthly payment or payoff term for a fixed loan."* **Formula characterization FIRST (commit `e36d38d`, no formula change):** `payment.test.ts` expanded to 28 tests freezing both modes, the payment-vs-interest boundary, the exact-Infinity sentinel, cross-mode inverse consistency and the floor/round/ceil duration arithmetic. No guide embeds the island. |
| `migrated` (R8C1) | **credit-card-payoff-calculator** | Standard-form wave, calculator #15 — the **third MULTI-MODE product**, and the first whose ordinary result carries an **enriched cost breakdown**. Migrated on the standard-form runtime **plus the accepted `isUsableResult` gate — no new runtime extension** (R8C0 verdict). The reviewed `payoffByPayment` / `payoffByMonths` (delegating to the shared `solveMonths` / `pmt`) are preserved byte-for-byte. **Mode = a native radio group** ("Calculate by" → Monthly payment / Target payoff time; structural, runtime recomputes on it); the **island owns** the conditional field — By payment shows the monthly payment (solve for payoff time), By timeline shows the target months (solve for the required payment) — the inactive field is `hidden` **and** `disabled` (out of the keyboard + a11y order, never submitted), its stale error cleared and value **preserved** for an in-session switch, and on a switch the mode-owned result is briefly **blanked**; the action label syncs ("Calculate Payoff Time" ⇄ "Calculate Required Payment"). The binding validates only the active field. Task-first; all fields start EMPTY (the legacy island prefilled $5,000 / 19.99% / $200 and showed it as the visitor's result); empty → mode-specific action → live-after-first; **Reset** (restores By-payment + its field/labels). **Input policies:** balance required `> 0` (**zero balance is invalid** — R8C1 decision B); APR required `≥ 0` (0% valid, no max); payment required only in By-payment `> 0` (a positive-but-insufficient payment is the informational "Never", not a field error); target months required only in By-timeline, a **whole number `≥ 1`** — a fractional entry is REJECTED, never silently rounded (decision E); never `Number()\|\|0`. **Enriched result (decision A):** the DOMINANT figure is the payoff time (By payment) or the required payment (By timeline); a subordinate **cost breakdown** shows total interest + total paid. By-payment totals are labelled **"Estimated"** with the assumption *"Totals use whole monthly payments and may slightly overstate the final payment…"* (decision F — the formula assumes a full final payment); By-timeline totals amortize exactly and drop the "Estimated" label + assumption. **Informational "Never" (decision D / Ratified #8):** a positive payment below the monthly interest → state stays `valid`, dominant "Never" under "Estimated payoff time" + the plain explanation, and the financial rows are **omitted entirely** (never zero/Infinity/NaN/dashes); concise `aria-live` (*"At this payment amount, the credit card balance will never be paid off…"*). Ordinary announcements: By payment → the spoken payoff time; By timeline → the required payment in spoken USD. **Duration:** reuses the shared R8B1.1 `presentDuration` (extracted to `@lib/format` in R8C1 — the credit-card months is the ceil'd whole count). **Formula characterization FIRST (commit `47a3da0`, no formula change):** a dedicated `credit-card.test.ts` (consolidated from `batch-b.test.ts`) freezes both modes, zero/decimal APR, the payment-vs-interest boundary, the all-Infinity never, the whole-month ceil + total-paid/interest relationships, the timeline `max(1, round)` clamp and cross-mode consistency (with the ceil/round caveat). **Description refined (decision C):** *"Find out how long it takes to clear a credit card balance and the interest it costs."* (omitted the timeline mode) → *"Calculate how long it will take to pay off a credit card and the interest cost, or find the monthly payment needed to clear it by a target date."* No guide embeds the island. |
| `migrated` (R8D1) | **savings-calculator** | Standard-form wave, calculator #16 — the **fourth (and final) MULTI-MODE product**, completing the technical multi-mode family. Migrated on the standard-form runtime **UNCHANGED — no `isUsableResult`** (R8D0 verdict): Savings has no non-finite outcome, so the default finite gate suffices. The reviewed `projectSavings` / `requiredMonthlyForGoal` (delegating to the shared `calculateCompoundInterest`, monthly compounding, end-of-period deposits) are preserved byte-for-byte. **Mode = a native radio group** ("Savings calculation" → Project savings / Reach a savings goal; structural); the **island owns** the conditional field — Project shows the monthly deposit (→ projected balance + breakdown), Reach-a-goal shows the savings goal (→ required monthly deposit) — the inactive field is `hidden` **and** `disabled`, its stale error cleared and value **preserved** for an in-session switch; on a switch the mode-owned result is briefly **blanked**; the action label syncs ("Project Savings" ⇄ "Calculate Required Deposit"). The binding validates only the active field. Task-first; all fields start EMPTY (the legacy island prefilled $1,000 / $300 / 4% / 10 yr / $50,000 and showed it as the visitor's result); empty → mode-specific action → live-after-first; **Reset** (restores Project + its field/labels). **Input policies:** starting balance required `≥ 0` (**0 valid**); annual return required `≥ 0` (0% valid, no max); years required, a **whole number `≥ 1`** — a fractional entry is REJECTED, never silently rounded (decision D); monthly deposit required only in Project `≥ 0` (**0 valid** — a lump-sum projection); goal required only in Reach-a-goal `> 0`; never `Number()\|\|0`. **Enriched Project result (decision A/E):** dominant projected balance + a subordinate **Total deposited + Interest earned** breakdown; a **zero start + zero deposit** projection stays valid ($0) with the explanation *"With no starting balance or monthly deposits, the projected balance remains $0."* **Goal single-value (decision C):** dominant required monthly deposit, no breakdown. **"Already reached" (decision A):** when the grown starting balance meets the goal, `requiredMonthlyForGoal` returns **0** — presented as a **valid** `$0.00` under "Required monthly deposit" + *"Your starting balance is projected to reach this goal within the selected period, so no monthly deposit is required."* — state stays `valid`, no error/`aria-invalid`/focus move. **Summary-only (decision B):** the formula's yearly `series` is computed but **NOT rendered** (no table/chart/schedule); it stays latent formula output, frozen by the tests, for a possible future enhancement. **Formula characterization FIRST (commit `b457b75`, no formula change):** `savings.test.ts` expanded to freeze both modes, zero/decimal rate, all-zero project, the yearly series (row count, final row = future value, cumulative relationships), the goal-already-reached → 0 boundary, the whole-month `round(years·12)` behaviour and cross-mode consistency. **Description refined (decision F):** *"See how regular deposits and interest build your savings balance."* (omitted the goal mode) → *"Project how regular deposits and interest can grow your savings, or calculate the monthly deposit needed to reach a savings goal."* The `reference/savings-growth-table` page (static; uses `calculateCompoundInterest` directly, not `projectSavings`) is unchanged. No guide embeds the island. |
| `not-migrated` | the other **33** live calculators | Current recurring-gap behavior; scheduled by family wave. |
| `migrated` (R9A1) | **simple-interest-calculator** | Standard-form wave, calculator #17 — the **first FINANCE-SIMPLE migration** and the first single-mode, no-selector finance calculator. Migrated on the standard-form runtime **UNCHANGED — no `isUsableResult`** (R9A0 Decision A): every validated input yields a finite, non-negative result, so the default finite gate suffices. The reviewed `calculateSimpleInterest` (I = P·r·t; principal clamped `≥ 0`) is preserved byte-for-byte. Task-first; all fields start EMPTY (the legacy island prefilled $5,000 / 5% / 3 yr and auto-calculated on load); empty → **Calculate Simple Interest** → live-after-first; **Reset**. **Input policies (R9A1 decisions A–C):** principal required `≥ 0` (**0 valid**, empty invalid); annual rate required `≥ 0` (0% valid, no max — **negative rejected**, no depreciation); time required `≥ 0` in years, **fractional allowed** (no whole / half-step / `≥ 1` requirement); never `Number()\|\|0`. **Result hierarchy (decision D):** the DOMINANT figure is **Interest earned**; the **Total amount** is a subordinate one-row breakdown (not co-equal). A plain-language interpretation restates the rate + duration, with dedicated lines for a valid zero-rate, zero-duration or zero-principal result (each a valid $0, never an error). Concise USD `aria-live` announces the dominant interest only (*"Your simple interest is 750 dollars."*). **USD** throughout (decision E): explicit "Principal amount in USD" label + "…in US dollars (USD)" note; no currency selector / conversion / locale detection. **Scope unchanged (decision F):** strictly simple interest — no compounding, schedule, comparison table, compounding-frequency / time-unit control, or solve-for modes. **Formula characterization FIRST (commit `736ba96`, no formula change):** `simple-interest.test.ts` expanded to freeze ordinary / decimal / fractional cases, all zero cases, the current negative behaviour (principal clamps to 0; negative rate/years pass through to negative interest) and non-finite inputs (NaN via `\|\|0`; `Infinity × 0` → NaN), plus that displayed USD rounding is presentation-only. The guide `simple-interest-explained` embeds the island and renders the migrated tool (**no prose change**); the calculator has no reference page. |
| `migrated` (R9B1) | **tip-calculator** | Standard-form wave, calculator #18 — the **second FINANCE-SIMPLE migration** and the first calculator with an accessible **PRESET quick-set group**. Migrated on the standard-form runtime **UNCHANGED — no `isUsableResult`** (R9A0 Decision A): every validated input yields finite, non-negative outputs. The reviewed `calculateTip` (bill clamped `≥ 0`; `people = max(1, floor(people||1))`) is preserved byte-for-byte. Task-first; bill + tip % start EMPTY, **people defaults to 1** (a neutral structural default), no preset selected (the legacy island prefilled $50 / 18% and showed the result); empty → **Calculate Tip** → live-after-first; **Reset** (clears fields, restores people = 1, clears preset pressed state). **Input policies (R9B1 decisions B–D):** bill required `≥ 0` (**0 valid**); tip % required `≥ 0` (0% valid, **no maximum**, negative rejected); people required a **whole number `≥ 1`** — fractional / zero / negative **rejected at the interaction layer**, never silently floored (the formula's `max(1, floor)` is only a backstop); never `Number()\|\|0`. **Result hierarchy (decision E):** DOMINANT **Total per person**; subordinate breakdown keeps all four formula outputs (tip amount, total bill, tip per person). Interpretation uses the people count with singular/plural ("1 person" / "2 people"); a valid $0 bill is explained, a valid 0% tip uses the normal split line. Concise USD `aria-live` announces the dominant per-person figure only ("Each person pays 29 dollars and 50 cents." / single diner "The total per person is 59 dollars."). **Preset group (decision, §9):** five `aria-pressed` toggle buttons [10/15/18/20/25]%, accessible names ("Set tip to 18 percent"), a **non-colour** selected state (fill + heavier border + ✓ glyph), grouped "Quick tip percentages"; the numeric field is the source of truth — a preset writes it + dispatches the runtime's input path, a typed match presses the preset, any other value (incl. 0) clears all, only one pressed at a time, focus stays on the clicked preset on a live update, Reset clears the pressed state. **ISLAND-owned — no preset runtime / shared abstraction.** **USD** throughout (decision F): "Bill amount in USD" label + "…in US dollars (USD)" note; no selector / conversion / locale. **Scope unchanged:** tip / total / split only — no tax, service charge, fees, round-up, payment collection. **Description refined (decision, §2):** *"…split it evenly between any number of people."* → *"Calculate the tip, total bill, and amount per person when splitting a bill."* — rippling to the directory / category / search / related-tools surfaces that render it. **Formula characterization FIRST (commit `c3eca9e`, no formula change):** the Tip cases were consolidated out of the shared `gaps.test.ts` into a dedicated `tip.test.ts` freezing ordinary / decimal / zero / current-people (floor; 0/NaN/<1/negative → 1; Infinity → 0 per person) / current-negative / non-finite (NaN via `\|\|0`; `Infinity × 0` → NaN) / reconciliation, plus presentation-only USD rounding. **No guide embeds the island;** `reference/tip-table` (prose + reference data, no island/formula import) is unchanged. |
| `migrated` (R9C1) | **inflation-calculator** | Standard-form wave, calculator #19 — the **third and final FINANCE-SIMPLE migration (family COMPLETE)**. Migrated on the standard-form runtime **UNCHANGED — no `isUsableResult`** (R9A0 Decision A). The reviewed `adjustForInflation` (`factor = (1+rate/100)^years`; `factor===0 ? NaN` buying-power guard) is preserved byte-for-byte. Task-first; all fields start EMPTY (the legacy island prefilled $1,000 / 3% / 20 yr and auto-calculated); empty → **Calculate Inflation Impact** → live-after-first; **Reset**. **Input policies (R9C1 decisions B–D):** amount required `≥ 0` (**0 valid**); annual rate required, finite, **strictly `> -100`** — a **NEGATIVE rate is valid deflation**, `rate <= -100` (the cliff) and NaN/Infinity rejected, **no positive max**; time required `≥ 0` years, **fractional allowed**; never `Number()\|\|0`. **Mixed-unit result (decision E):** DOMINANT **Projected future cost** ($); breakdown **Future buying power** ($) + **Cumulative price change** — a **signed %** labelled neutrally (never "Total price increase"/"increase") and **not colour-coded**, so a negative (deflation) value never reads as an error. **Dynamic interpretation (decision, §10):** distinct inflation / deflation (absolute rate + "decreases") / no-change (0% or 0 yr) / zero-amount lines. Concise USD `aria-live` announces the dominant future cost only ("The projected future cost is 134 dollars and 39 cents."). **Malformed-result guard WITHOUT `isUsableResult`:** every rendered figure must be finite and the two currencies `≥ 0` (a negative cumulative % is fine); this guard lives in **`resultValue`**, which returns a non-finite sentinel for a malformed result (e.g. an absurd ~2000-yr horizon underflowing the factor to 0 → NaN buying power) so the runtime's DEFAULT finite gate moves it to the invalid state — `isUsableResult` stays unimplemented. **USD** throughout (decision F): "Current amount in USD" label + "…in US dollars (USD)" note + "Use a negative percentage for deflation." hint; no selector/conversion/locale. **Scope unchanged (decision G):** no direction modes, past-value, salary, schedules, charts, tables, CPI/live data, or location rates. **Description refined (decision, §2):** *"Adjust the value of money for inflation across years."* → *"Estimate how inflation or deflation changes future prices and purchasing power over time."* **Formula characterization FIRST (commit `c49862b`, no formula change):** `inflation.test.ts` expanded to freeze ordinary inflation, zero cases, valid deflation, the **non-finite cliff** (rate = −100 → NaN buying power; < −100 → NaN with fractional years / negative with odd whole / astronomical with even whole), current negative-amount and non-finite inputs, the relationships and presentation-only USD/% rounding. **No guide embeds the island;** `reference/inflation-purchasing-power-table` (imports the pure `adjustForInflation`, unchanged) stays byte-identical — asserted by an E2E regression. |
| `migrated` (R10B1) | **square-footage-calculator** | Standard-form wave, calculator #20 — the **first GEOMETRY migration** and the first to reuse the **converting-unit** capability beyond Pace. Migrated on the standard-form runtime **UNCHANGED — no `isUsableResult`**. The reviewed `calculateSquareFootage` (length/width × `TO_FEET[unit]`; area × `max(1, floor(qty))`; cost × `max(0, price)`) is preserved byte-for-byte. Task-first; all measurements start EMPTY (the legacy island prefilled 12×10 ft and auto-calculated); unit **ft** + quantity **1** are neutral structural defaults, price empty; empty → **Calculate Square Footage** → live-after-first; **Reset** (clears dims + price, restores ft + quantity 1). **Converting native-select unit (decision A, §6):** a native `<select>` (Feet/Inches/Yards/Metres); on change the binding's `convertValues` converts the entered length + width **dimension-preservingly** (mirrors `TO_FEET`, rounds to 6 dp for a stable ft→in→yd→m→ft round trip), **replacing the legacy reinterpret**. Island-driven — the select's input event feeds the runtime's normal live recompute (the 180 ms debounce lands the synchronous conversion first), so **no new runtime hook**; focus stays on the select; before the first calc a unit change converts without calculating; the visible "(ft)" tags follow the unit. **Input policies (decisions C–E):** length + width required, finite, **> 0** (zero is an invalid project input); quantity required, a **whole number ≥ 1** (fractional/zero/negative rejected, never floored); price **optional** — empty valid (no cost row), entered **0** valid (**$0.00** row), negative/non-finite rejected; never `Number()||0`. **Result hierarchy (decision B, §9):** DOMINANT **Total area** (square feet — output stays sq ft, no output-unit selector); m²/yd² equivalents; **Area of one section** only when quantity > 1; **Estimated cost** only when a price was entered (hidden otherwise — no misleading `$0.00`). Price is **always per square foot in USD**, unchanged by the dimension unit. Concise announcement of the dominant total only ("The total area is 120 square feet." / "…across 3 sections is 360 square feet."). **Malformed-result guard WITHOUT `isUsableResult`:** every rendered figure finite and ≥ 0 (cost only when priced) — the guard lives in `resultValue` (non-finite sentinel → default gate → invalid; the Inflation precedent). **Formula characterization FIRST (commit `c0b394f`, no formula change):** the Square Footage cases were consolidated out of the shared `gaps.test.ts` into a dedicated `square-footage.test.ts` freezing all four units + the exact `TO_FEET` constants, the same physical rectangle across units, the output relationships, current quantity behaviour (fractional floors; 0/neg/NaN → 1; Infinity → Infinity total), current price behaviour (neg/NaN → 0; Infinity → Infinity cost), dimension edges (clamp to 0; Infinity dim + price 0 → NaN cost), the metre-conversion drift, and presentation-only rounding. **No guide or reference page embeds the island or the formula.** Registry description unchanged (accurate). |
| `migrated` (R10C1) | **concrete-calculator** | Standard-form wave, calculator #21 — the **second GEOMETRY migration**, reusing the **converting-unit** capability over THREE fields via a native **radio** group. Migrated on the standard-form runtime **UNCHANGED — no `isUsableResult`**. The reviewed `calculateConcrete` (one rectangular-prism volume: `l·w·d·waste` clamped `≥ 0`, `×35.3146667` for metres; cubic yards / metres / bag counts derived from the UNROUNDED cubic feet; `ceil` per 0.30/0.45/0.60 ft³ bag yield) is preserved byte-for-byte. Task-first; length + width + depth start EMPTY (the legacy island prefilled 10×10×0.5 ft / 10% and auto-calculated), unit **ft** is the neutral default, waste empty; empty → **Calculate Concrete** → live-after-first; **Reset** (clears dims + waste, restores ft + the "(ft)" tags). **Converting native-RADIO unit (decision A/B):** a `fieldset`/legend radio group (Feet/Metres, values ft/m); on change the binding's `convertValues` converts the entered length + width + depth **dimension-preservingly** (`M_TO_FT = 3.280839895`, rounded to 6 dp for a stable ft↔m round trip), **replacing the legacy reinterpret**. Island-driven — the radio's input event feeds the runtime's normal live recompute (the 180 ms debounce lands the synchronous conversion first), so **no new runtime hook**; focus stays on the radio (native radios retain it in headless); before the first calc a unit change converts without calculating; the visible "(ft)" tags follow the unit. **Input policies (decisions C–D):** length + width + depth required, finite, **> 0** (zero is an invalid project input); waste **optional** — empty valid (0%, **no legacy 10% prefill**), entered **0** valid, negative/non-finite rejected, **no maximum**; never `Number()||0`. **Result hierarchy (decisions E–G):** DOMINANT **Concrete needed** in **cubic yards** (output stays cubic yards, no output selector); m³/ft³ equivalents; a **fixed 40/60/80 lb bag table** (semantic `<table>` — `<th scope="col">` + `<th scope="row">`, whole ceil counts, all three sizes always shown, no bag-size selector) with visible yield assumptions (0.30/0.45/0.60 ft³) + a "confirm with your supplier" note. Concise announcement of the dominant volume only ("You need approximately 1.852 cubic yards of concrete."); the interpretation states the waste allowance (or its absence). **NO cost (decision F):** the calculator computes none — a fixed rectangular prism only, no shapes/modes/quantity — and the cost-related FAQ was clarified (*"This calculator estimates volume and bag counts, not cost…"* — multiply the returned cubic yards by local supplier pricing); a pre-existing worked-example bag count (56 → 61 for 36.3 ft³) was corrected. **Malformed-result guard WITHOUT `isUsableResult`:** every volume finite and ≥ 0 and every bag count a whole number ≥ 0 — the guard lives in `resultValue` (non-finite sentinel → default gate → invalid; the Inflation precedent). **Formula characterization FIRST (commit `5133013`, no formula change):** the Concrete cases were consolidated out of the shared `batch-d.test.ts` into a dedicated `concrete.test.ts` freezing ordinary feet + metres (with a physically-equivalent ft/m slab), the divergence where cubic yards / metres / bag counts derive from the UNROUNDED cubic feet (a boundary where `1×1×0.60025 ft` rounds cubicFeet to 0.6 yet bags80 = ceil(0.60025/0.6) = 2), the three bag yields + ceil boundaries, waste behaviour (neg/NaN → 0; Infinity → Infinity) and dimension edges (clamp to 0; Infinity → Infinity bags). **No guide or reference page embeds the island or the formula.** Registry description unchanged (accurate). |
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
| standard form | 15 | **health (9):** bmi ✅done · bmr ✅done *(R7B — generalization pilot; runtime unchanged)* · ideal-weight ✅done *(R7C-1 — multi-formula; runtime unchanged)* · protein ✅done *(R7C-1 — single-value per goal; runtime unchanged)* · body-fat ✅done *(R7C-2A — first CONDITIONAL inputs: hip women-only; runtime unchanged)* · calorie ✅done *(R7C-2B — activity + goal selector; runtime unchanged)* · target-heart-rate ✅done *(R7C-2C — optional resting HR → Karvonen/simple; accessible zone table; runtime unchanged)* · fat-intake ✅done *(R7C-2D — single calorie target → AMDR fat range 20–35%; runtime unchanged)* · pace ✅done *(R7C-2E1 — SINGLE-MODE; converting km/mi unit + composite h:m:s time; runtime unchanged)* · **geometry (3):** square-footage ✅done *(R10B1 — first geometry; converting native-select unit ft/in/yd/m (Pace convertValues, 2 fields); total-sq-ft dominant + conditional one-section & cost rows; runtime unchanged, no isUsableResult)* · concrete ✅done *(R10C1 — second geometry; converting native-RADIO unit ft/m over L/W/D (Pace convertValues, 3 fields); cubic-yards dominant + m³/ft³ + fixed 40/60/80 lb bag table; NO cost; runtime unchanged, no isUsableResult; malformed guard in resultValue)* · triangle *(**C** — multi-output + triangle-inequality; batch)* · **finance-simple (3):** simple-interest ✅done *(R9A1 — first finance-simple; single-mode, no selectors; interest dominant + total breakdown; runtime unchanged, no isUsableResult)* · tip ✅done *(R9B1 — single-mode + accessible preset quick-set group; total-per-person dominant + breakdown; whole-people ≥ 1; runtime unchanged, no isUsableResult; no preset abstraction)* · inflation ✅done *(R9C1 — single-mode; deflation-safe rate > -100; future-cost dominant + buying-power + signed % breakdown; runtime unchanged, no isUsableResult; malformed guard in resultValue)* — **finance-simple COMPLETE (3/3)** |
| complex form | 7 | income-tax *(brackets + filing-status parameter; batch)*, interest *(dual simple-vs-compound; **indirect**)*, interest-rate *(iterative solver; batch)*, investment *(proportion bar; dedicated)*, retirement *(multi-metric report; dedicated)*, auto-loan *(collapsible groups; dedicated)*, home-equity-loan *(LTV advisory; batch)* — all **C** |
| shape selector | 2 | area, volume — **D** *(shape `<select>` rebuilds the input-field schema at runtime; the certified standard-form runtime assumes fixed fields; **indirect** via `gaps.test.ts`)* |
| equation | 2 | percent ✅done (dedicated) · fraction *(**C** — operator-select operand + tri-format output; dedicated)* |
| explicit-output generator | 1 | password ✅done (dedicated ×2) |
| random-data generator | 1 | random-number-generator *(**C** — extend generator runtime: explicit Generate, no-live, no-Copy, list output; already has `aria-live`; batch)* |
| converter | 2 | conversion, salary — **D** *(category / pay-period select drives the option lists + equivalence output, result-as-input; both batch)* |
| date/duration | 6 | age *(client-clock → intentional SSR-empty result + hydrate; dedicated)*, date *(two sub-tools/result-regions in one island; dedicated)*, due-date *(dedicated)*, pregnancy *(**missing** test)*, hours *(dedicated)*, time *(batch)* — all **D** |
| multi-mode | 4 ✅ALL DONE | sales-tax ✅done *(R8A1 — add/remove on the standard-form runtime UNCHANGED; mode = structural radio, island-owned labels)* · payment ✅done *(R8B1 — term/payment with a CONDITIONAL field that swaps by mode + an informational "Never" payoff; runtime + one small `isUsableResult` gate)* · credit-card-payoff ✅done *(R8C1 — payment/timeline conditional field + an ENRICHED interest/total-paid breakdown + informational "Never"; runtime + the accepted `isUsableResult`, NO new extension)* · savings ✅done *(R8D1 — project/goal conditional field + a projection breakdown + a valid-$0 "already reached"; runtime UNCHANGED, no `isUsableResult`; summary-only — the yearly series stays latent)* — **the technical multi-mode family is fully migrated on the standard-form runtime; no dedicated multi-mode or report runtime was needed** |
| dynamic-row | 2 | gpa *(pure add-row; batch)*, grade *(2° co-resident fixed "final-needed" mode + advisories; batch)* — **D** |
| financial schedule | 4 | mortgage *(2° complex-form; **the only island embedded live in a guide** → highest regression risk; dedicated)*, amortization *(**indirect** via loan)*, loan *(dedicated)*, compound-interest *(dedicated)* — all **D** |
| specialized report | 2 | statistics *(dedicated)*, standard-deviation *(**indirect** — shares `StatisticsCalculator` + module via `primary` summary/sd)* — **D** |

> **Multi-mode runtime policy (R7C-2E0 / R8A / R8B / R8C / R8D — family COMPLETE).** **Pace is
> SINGLE-MODE** and lives in the standard-form family — migrated on the existing runtime
> unchanged; no solve-for-time / solve-for-distance path exists (R7C-2E0). **Sales Tax
> (R8A0/R8A1) is the first multi-mode product, and it needed NO dedicated multi-mode
> runtime** — its mode is a structural radio the standard-form runtime already recomputes
> on, the amount/action labels are island-owned (the body-fat precedent), and the binding
> owns formula selection + the mode-specific dominant result. **Payment (R8B0/R8B1) is the
> second multi-mode product and the harder case** — its two modes **swap a conditional
> field** (term ⇆ monthly payment; the body-fat conditional-input precedent, driven by the
> mode radio instead of a sex radio) and it has an **impossible-result state**: a positive
> payment that never covers the interest. Still **no dedicated multi-mode runtime was
> built** — the conditional field is island-owned and the binding validates only the
> active field. The impossible payoff needed **one small, reusable runtime addition**: an
> optional `isUsableResult?(result)` gate so a deliberately non-numeric result ("Never")
> renders as a **valid informational** answer rather than an input error (Ratified product
> decision #8 below). The default gate is unchanged, so **all thirteen prior bindings are
> byte-identical**. **Credit-Card Payoff (R8C0/R8C1) is the third multi-mode product** and
> the first with an **enriched result** (an interest + total-paid breakdown beside the
> dominant figure). It migrated on the existing runtime + the accepted `isUsableResult`
> with **NO new extension** — enrichment is just the binding's `renderResult` filling a
> `ResultBreakdown` (the sales-tax/bmr precedent), and its impossible payoff reuses the
> "Never" contract. R8C1 also **extracted the shared payoff duration presenter to a neutral
> formatter module** (R8C1.1 finished the isolation into `@lib/format-duration`, so unrelated
> `formatCurrency` consumers no longer rehash when the presenter changes) — a pure formatter
> move, not a runtime change. **Savings (R8D0/R8D1) is the fourth and final multi-mode product,
> and it needed even LESS** — migrated on the runtime UNCHANGED with **no `isUsableResult`**,
> because its only non-ordinary outcome ("goal already reached") is a **finite $0** the default
> gate accepts. Its latent yearly `series` stays **unrendered** (summary-only); a future schedule
> would be binding-owned markup (the BMR/calorie table precedent), never a runtime. **The
> technical multi-mode family is now COMPLETE (4/4) with NO dedicated multi-mode or report
> runtime, and only one small opt-in gate (`isUsableResult`) added across the whole family.**
> **Mode state stays ephemeral:** no query-parameter / URL / storage mode state without a
> separate approved product requirement. **Solve-for-time / -distance for Pace remain future
> feature work.**

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
`pregnancy` (**missing**; `target-heart-rate` now covered by its R7C-2C
characterization + binding suites); dedicated tests for the
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
8. **Impossible-but-meaningful results are VALID informational results, not input
   errors (R8B1).** When a calculation is mathematically well-defined but has no
   finite answer that the user's own inputs made impossible — Payment's "Never"
   payoff (a positive payment that never covers the interest) — the result shell
   stays **`valid`**, shows the plain outcome + a corrective explanation, and does
   **not** use invalid styling, `aria-invalid`, focus moves, or expose
   zero/Infinity/NaN or formula internals. The standard-form runtime supports this
   via the opt-in `isUsableResult` gate (default finite-guard unchanged). This is a
   **product decision, not an `approved-exception`** — the tool completed the task
   and told the truth.

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

¹ 21 calculator pages are task-first (the migrated set in the fleet snapshot —
scientific, bmi, bmr, ideal-weight, protein, body-fat, calorie, target-heart-rate,
fat-intake, pace, sales-tax, payment, credit-card-payoff, savings, simple-interest,
tip, inflation, square-footage, concrete, percent, password); the other 28 render the category
eyebrow + review metadata above the tool (legacy `CalculatorLayout` mode). The family-level ⚠️ marks below predate the per-calculator
migrations tracked authoritatively in the migration-status table. ² Age/GPA/Pregnancy SSR `—`; DueDate partial.
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
