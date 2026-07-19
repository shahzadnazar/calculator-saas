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

# Fleet audit against the doctrine (baseline)

**Audited:** 2026-07-19 · **Source commit:** `0e4d61c`. Re-run this audit and
refresh the date + commit whenever the fleet changes.

Grounded in the island behavior audit (48 islands; see the family classification
below). **The current fleet is largely noncompliant with the doctrine in the
same recurring ways** — it mostly **auto-calculates prefilled example values and
shows a result that reads as the visitor's own**, with **no explicit primary
action, no reset, and no result `aria-live`** on 45 of 48. It is not
behaviorally identical: documented exceptions exist (see below), and each is
tracked in the migration-status table. These recurring gaps are what R1–R7 close.

## Migration status (per calculator)

Status values: `not-migrated` · `pilot` · `migrated` · `approved-exception`.

| Status | Calculators | Meaning |
|---|---|---|
| `migrated` | scientific-calculator; **bmi-calculator**; **percent-calculator** | scientific: PhysicalCalculator, legacy island retired (R0.5). **bmi: standard-form runtime pilot (family: standard form). Accepted migration: R2 range `843d113..b7f9d44`, refined by R2.1 (imperial-height semantics; shared `placeholderAlignment` API).** **percent: equation runtime pilot (family: equation) — three INDEPENDENT equations, each its own form + runtime instance, empty initial state, task-specific Calculate + per-equation Reset, live-after-first, scoped validation/`aria-invalid`/`aria-live`/focus, direction as text. Accepted migration: R3 range `7460547..434ce1b`, refined by R3.1 (percentage-change starting value must be > 0; direction derived from comparing new vs start, not the percent sign).** |
| `pilot` | password-generator | Task-first page shipped; designated result-system pilot (R4 generator). Result semantics not yet migrated. |
| `not-migrated` | the other 44 live calculators | Current recurring-gap behavior; scheduled by family wave. |
| `approved-exception` | (none yet) | Reserved for deliberate, documented deviations (e.g. a complex-finance tool using a clearly-labelled Example). |

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

## Family classification (all 48)

| Family | Calculators |
|---|---|
| physical/keypad (1) | scientific-calculator |
| standard form — health/personal (9) | bmi, bmr, calorie, body-fat, ideal-weight, protein, fat-intake, target-heart-rate, pace |
| standard form — geometry (5) | area, volume, triangle, square-footage, concrete |
| complex / financial-schedule (11) | mortgage, amortization, loan, auto-loan, home-equity-loan, compound-interest, investment, retirement, savings, simple-interest, interest |
| multi-mode form (7) | sales-tax, credit-card-payoff, payment, interest-rate, income-tax, salary, tip |
| specialized report (2) | statistics, standard-deviation |
| equation (2) | percent, fraction |
| generator (2) | password-generator, random-number-generator |
| converter (1) | conversion |
| date/duration (5) | age, date, due-date, pregnancy, hours, time |
| dynamic-row (2) | gpa, grade |

(48 total. `time` is date/duration; `statistics`/`standard-deviation` share one
island via a `primary` prop.)

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
other 44 render the category eyebrow + review metadata above the tool (legacy
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
- **Converter:** `conversion` uses a readonly input as its result (not a result
  card) — the doctrine's converter neutral-default (`1`) fits it.

## Family-level migration roadmap (maps to existing phases)

The doctrine is realized by the already-planned phases — this roadmap sequences
families onto them; **no new fix-each-calculator work.**

| Wave | Families | Vehicle (phase) |
|---|---|---|
| A | equation, generator, standard-form | R1 result primitives + R2/R3/R4 controller runtimes; pilots BMI/Percent/Password |
| B | complex/financial-schedule, multi-mode | R2 form runtime hardened per subfamily (financial-schedule + multi-mode validated before claiming support) |
| C | converter, date/duration, dynamic-row | family-specific workspace adapters on the shared runtimes (validate each subfamily) |
| D | all migrated pages | above-tool order via `CalculatorLayout presentation="task-first"` category waves (see `TASK-FIRST-MIGRATION.md`) |
| E | all | monetization regions (R5/R6), density tokens, container sidebar |
| ✅ | physical | already compliant (`PhysicalCalculator`; legacy island retired in R0.5) |

Subfamilies must be **validated individually** before the standard runtime
claims support (per the R0 correction). No category-wide migration in one
commit; pilots first, each behind build + `astro check` + E2E + backward-compat
gates.

## Guardrail

Commercial value never affects search ranking or calculated results; pages stay
fully usable with all monetization disabled; trust first, revenue second.
