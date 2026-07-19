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
| Migrated (task-first + shared runtime) | **4** — scientific, bmi, percent, password-generator |
| Not migrated (legacy) | **45** |
| Approved exceptions | **0** |
| Distinct Astro islands | **47** — statistics + standard-deviation share `StatisticsCalculator` via a `primary` prop; **scientific uses `PhysicalCalculator`** (`components/calc/`, not an island) |
| Embed exposure | **all 49** — every calculator is served by the dynamic route `src/pages/embed/[category]/[slug].astro` (`getLiveCalculators()` → `IslandBySlug`); no per-slug embed files exist |

**The 45 legacy calculators are noncompliant with the doctrine in the same
recurring ways** — each **auto-calculates prefilled example values and shows a
result that reads as the visitor's own**, with **no explicit primary action, no
Reset, and no result `aria-live`** (the lone `aria-live` exception among the
legacy set is `random-number-generator`). Documented behavioral exceptions exist
(below) and are tracked in the migration-status table. These recurring gaps are
what the R1–R7 program closes.

## Migration status (per calculator)

Status values: `not-migrated` · `pilot` · `migrated` · `approved-exception`.

| Status | Calculators | Meaning |
|---|---|---|
| `migrated` | scientific-calculator; **bmi-calculator**; **percent-calculator**; **password-generator** | scientific: PhysicalCalculator, legacy island retired (R0.5). **bmi: standard-form runtime pilot (family: standard form). Accepted migration: R2 range `843d113..b7f9d44`, refined by R2.1.** **percent: equation runtime pilot (family: equation) — three INDEPENDENT equations. Accepted migration: R3 range `7460547..45e432f` (incl. R3.1 positive start; direction from operands).** **password: explicit-output generator pilot (family: generator) — no output on load, explicit Generate, settings-change → stale (kept visible, Copy off, note), Copy gated on a fresh output, strength as text, crypto-only generation never announced/stored/logged/transmitted. Accepted migration: R4 implementation `9c51c33`, docs/status `45f5e56`.** |
| `pilot` | (none active) | The initial standard-form, equation and explicit-output generator pilots are complete. Additional calculator subfamilies still require separate pilots (each validated before binding). |
| `not-migrated` | the other **45** live calculators | Current recurring-gap behavior; scheduled by family wave. |
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
| standard form | 15 | **health (9):** bmi ✅done · bmr, body-fat, calorie, ideal-weight, protein, fat-intake *(all B)*, target-heart-rate *(B; **missing** test)*, pace *(B/C — deferred, decision 5)* · **geometry (3):** triangle *(**C** — multi-output + triangle-inequality; batch)*, square-footage *(B; batch)*, concrete *(B; batch)* · **finance-simple (3):** simple-interest *(B; dedicated)*, inflation *(B; dedicated)*, tip *(B; batch)* |
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

¹ 4 calculator pages are task-first (scientific, bmi, percent, password); the
other 45 render the category eyebrow + review metadata above the tool (legacy
`CalculatorLayout` mode). ² Age/GPA/Pregnancy SSR `—`; DueDate partial.
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
