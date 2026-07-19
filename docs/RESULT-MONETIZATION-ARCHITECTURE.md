# Shared Result & Monetization Architecture

> Governed by the **Global Task-Completion Psychology** doctrine
> (`docs/TASK-COMPLETION-DOCTRINE.md`): the result hierarchy, initial-state
> policy, recalculation model and monetization boundaries below implement it.
> Reviews must check doctrine compliance.

Approved R0 blueprint for the result-state system, per-family controllers, and
monetization regions. This records the locked contracts and product decisions so
R1+ implements against a fixed target. **Everything below is a plan** except the
R0.5 work, which shipped.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| R0 | Audit + contracts | ✅ approved |
| **R0.5** | **Retire the duplicate legacy Scientific island** | ✅ **shipped** |
| R1 | Result state machine + shared result primitives | ✅ shipped |
| **R2** | **Standard-form runtime + BMI pilot** | ✅ **shipped** (`843d113..b7f9d44`, +R2.1 `c18041c`) |
| **R3** | **Equation runtime + Percentage pilot** | ✅ **shipped** (`7460547..45e432f`, incl. R3.1 positive-start semantics) |
| **R4** | **Generator runtime + Password pilot** | ✅ **shipped** (impl `9c51c33`, docs/status `45f5e56`) |
| R5 | Monetization-region architecture (placeholders, off) | ⏳ |
| R6 | CalculatorLayout monetization integration | ⏳ |
| R7 | Full validation + docs | ⏳ |

Do not build the form, equation and generator runtimes together in R1.
No category-wide migration; pilots only.

## Final product decisions (locked)

1. **Direct-intent initial state** — inside a calculator: personal inputs empty;
   result empty (instruction / em dash); **no sample result in the visitor's
   result panel**. Worked examples stay below the calculator as clearly-labelled
   educational content. The `example` result state is for guides / deliberately
   labelled demos, not the default direct-page result.
2. **Calculate labels** — task-specific: "Calculate BMI", "Calculate
   Percentage", "Calculate Monthly Payment", "Generate Password"; generic
   "Calculate" only where a specific label is unsuitable.
3. **Recalculation** — `type RecalculationMode = 'explicit' | 'live-after-first'
   | 'always-live'`; **default `live-after-first`**: explicit first calc, then
   live; Calculate button stays; show "Changes update automatically."
4. **Unit changes** — empty stays empty; valid values convert; results
   recalculate; invalid/incomplete never get fabricated defaults; a unit change
   is **not** the first calculation; personal values are never persisted.
5. **Generators** — explicit Generate required; setting changes don't silently
   regenerate ("Settings changed. Generate again to apply them."); Copy only
   after output exists; live mode opt-in, default off.
6. **Temporary inconsistency** — non-pilot calculators may keep current behavior
   during controlled waves; tracked explicitly, not a permanent mixed system.

## Result state model

```ts
type ResultState    = 'empty' | 'example' | 'valid' | 'invalid';   // content
type ResultActivity = 'idle'  | 'calculating' | 'just-updated';     // transient
```
No permanent `reset`/`loading-complete`/`updated` states. Transitions: initial→
valid/invalid; invalid→valid; valid→live-update (`calculating`→`just-updated`→
`idle`, announce once, no focus steal); valid→reset (→`empty`); mode/unit change
(re-project, recompute if a result exists); multiple equations each own their
state.

### Result accessibility
- Units remain accessible; **never `aria-hide` the only unit label**; use a
  combined accessible label where notation is abbreviated.
- **One** restrained live announcement per completed result or error.

### Focus
- Invalid submit → focus the first invalid field.
- Successful explicit calc → focus/scroll the result **only** when it's not
  visible or on narrow/mobile.
- Live updates → never move focus or scroll.

## Family model (subfamilies — validate each before claiming support)

`standard form · two-way converter · date/duration · multi-mode form ·
dynamic-row · financial schedule · specialized report · equation · generator ·
physical`. The standard-form runtime must not claim compatibility with every
subfamily until each is validated. (Audit: 43 form-markup, 2 equation, 2
generator, 1 physical; multi-mode/dynamic-row/converter variants noted.)

## Controller contracts

```ts
interface FormCalculatorBinding<V, R> {
  readValues(root: HTMLElement): V;
  validate(values: V): ValidationResult;              // fieldErrors + formError
  compute(values: V): R;                              // pure @lib/calculators/*
  renderResult(result: R, ctx: RenderContext): void;  // format at the boundary
  resetValues(mode: ResetMode): void;                 // 'personal' | 'all'
}
interface EquationBinding<Ops, R> { /* per-equation instance; independent state */ }
interface GeneratorBinding<S, O> {
  readSettings(root): S; validateSettings(s: S): ValidationResult;
  generate(s: S): O; renderOutput(o: O, ctx): void; resetSettings(): void;
}
type ValidationResult = { ok: true } | { ok: false; fieldErrors?: Record<string,string>; formError?: string };
```
A shared runtime per family owns the first-calc gate, live-after-first, reset,
unit re-projection, focus/scroll, the single announcement, and the state
machine; bindings stay tiny. Never surface NaN/Infinity/undefined.

## Shared result components

`ResultShell · ResultSummary · ResultValue · ResultUnit · ResultInterpretation ·
ResultBreakdown · ResultAssumptions · ResultActions · EmptyResult · InvalidResult
· ResultAnnouncement`. Slot-based so the main result stays dominant and
breakdowns/assumptions/actions stay secondary; reuses existing `.card`/
`.result-label`/`.result-value` classes. Astro structure + thin client that
flips `data-result-state`/`data-result-activity` via safe DOM text APIs.

## Monetization (extend, don't replace)

Existing: `AdSlot` (display), `RelatedOffers`+`@data/offers` (affiliate),
`EmbedBox` (embed), `config/monetization.ts`, `docs/MONETIZATION.md`. **Add a
higher-level `MonetizationRegion`** that selects an existing/future module from
central config; AdSlot/RelatedOffers/EmbedBox keep their responsibilities.

```ts
type MonetizationPlacement =
  | 'calculator-sidebar' | 'calculator-post-result' | 'calculator-in-content'
  | 'related-tools' | 'home-after-dashboard' | 'category-between-groups'
  | 'guide-in-content' | 'footer';
type MonetizationSlotState = 'disabled' | 'reserved' | 'loading' | 'filled' | 'no-fill' | 'failed';
interface MonetizationConfig { enabled: boolean; placements: Partial<Record<MonetizationPlacement, PlacementConfiguration>>; }
```

**CLS per placement (not one rule):** reserved ad placements reserve dimensions
and **retain** the reservation after no-fill/failure when collapsing would shift
layout; lazy below-fold placements collapse only before the reservation is seen;
static affiliate/premium/embed render immediately when enabled and collapse
fully when disabled. Reservation/no-fill behavior is configurable per placement.

**Sidebar — container space, not viewport alone (prefer a container query):**
workspace ≈1040px min, calculator ≈600px min, sidebar 300px, gap 24–32px.
Opt-in per calculator, default off until visually validated.

**Consent (deferred CMP):** R5/R6 use placeholders only — no AdSense/tracking
scripts; expose a vendor-neutral consent interface; default consent
unavailable/denied.

**Rules:** nothing before the tool on direct-intent pages; nothing between
required inputs; nothing between Calculate and Result; nothing inside the result
panel; post-result only after result + interpretation; explicit
Advertisement/Sponsored labels + affiliate disclosure; commercial modules never
resemble calculator controls; commercial value never affects ranking or results;
pages fully usable with all slots disabled.

## R0.5 — shipped

Retired the duplicate legacy Scientific UI: added
`src/components/calc/ScientificCalculatorEmbed.astro` (wraps `PhysicalCalculator`
scientific config), repointed `IslandBySlug` and the how-to guide, deleted
`src/components/islands/ScientificCalculator.astro`. **PhysicalCalculator is now
the only Scientific Calculator UI.** Verified: zero legacy imports; live
Scientific page, homepage, search and all pages unchanged in content (only the
shared CSS bundle re-hashed as the obsolete styles were removed); 253 unit +
83 E2E pass.

## R1 — shipped

Result state machine + shared result primitives, isolated on `/dev/result`.
`src/lib/result/state.ts` (two-axis `ResultState`×`ResultActivity`, pure
`reduceResult` with illegal-transition protection, sanitization, accessible
units, single-announcement generator) + `focus.ts`; primitives in
`src/components/result/` + scoped `src/styles/result.css`. No live page touched.

## R2 — shipped (BMI standard-form pilot)

The **standard-form runtime** (`src/lib/result/form-runtime.ts`) implements the
`FormCalculatorBinding` / `FormCalculatorOptions` contracts from this document:
pure `planFormAction` (first-calc gate, `live-after-first`, explicit/always-live,
reset, invalid↔valid recovery, non-finite protection, announce/focus decisions)
+ `mountFormCalculator` (DOM executor — submit/reset/debounced-input/unit wiring,
field `aria-invalid` + error association, one deduped `aria-live` announcement,
the "Changes update automatically." note, focus/scroll via `focus.ts`).

The **BMI binding** (`src/lib/calculators/bmi-form.ts`) reads/validates/converts/
renders BMI and speaks an accessible summary; the island
(`src/components/islands/BmiCalculator.astro`) is rebuilt task-first (empty
initial state, `Calculate BMI` + subordinate Reset, R1 primitives, reserved
result height so live editing never jumps). Default `recalculationMode =
'live-after-first'`.

**Scope caveat:** validated for **standard one-form calculators only**. It does
NOT yet certify converters, date/duration, dynamic-row, multi-mode, financial
schedules or specialized reports — one pilot does not certify the family.

Verified: `astro check` 0 errors; 324 unit + 114 E2E pass; 173-page build;
first viewport (1366×768) shows H1 + inputs + unit selector + Calculate + full
result; backward-compat confirmed — homepage, search, reference, category and
all non-BMI calculator pages byte-identical (embed pages carry only inert BMI
scoped-CSS ripple; two BMI-embedding guides show the migrated tool, prose
unchanged). SEO/schema/FAQ/content on the BMI page preserved.

## R3 — shipped (Percentage equation pilot)

The **equation runtime** (`src/lib/result/equation-runtime.ts`) implements the
`EquationCalculatorBinding` / `EquationCalculatorOptions` contracts: pure
`planEquationAction` + `mountEquationCalculator`, mounting **one instance per
`<form data-equation>`** so each equation is fully independent (its own
operands, result/activity state, Calculate, Reset, live-after-first, validation,
`aria-live` and focus — no shared/root listener). It reuses the shared result
state machine + focus helpers; the standard-form runtime and BMI are untouched.

The **Percentage bindings** (`src/lib/calculators/percent-form.ts`) are three
independent bindings over the reviewed `percentOf`/`whatPercent`/`percentChange`,
with explicit presence+finiteness validation (never `Number(v) || 0`),
zero-denominator/zero-start guards, preserved negative semantics, and
direction as words (never colour/arrow alone). The island rebuilds the tool as
three compact task units with a per-equation compact reservation (5–6rem).

**Scope caveat:** certified for **independent natural-language equations only** —
NOT multi-mode forms, converters, date calculators, dynamic-row tools, financial
schedules or specialized reports. The Fraction calculator and the wider equation
family are not certified by this one pilot.

Verified: `astro check` 0 errors; 356 unit + 127 E2E pass; 173-page build; the
first equation (sentence + Calculate + result) sits in the 1366×768 first
viewport; backward-compat confirmed — only the Percentage page changed (plus the
inert IslandBySlug scoped-CSS ripple on embed pages); homepage, search, guides,
references, category/directory, monetization and BMI byte-identical.
SEO/schema/FAQ/content on the Percentage page preserved.

## R4 — shipped (Password generator pilot)

The **generator runtime** (`src/lib/result/generator-runtime.ts`) implements the
`GeneratorBinding` / `GeneratorOptions` contracts: pure `planGeneratorAction` +
`mountGeneratorCalculator`. Explicit Generate is the only path to output; a
settings change never silently regenerates — with `invalidateOutputOn
SettingsChange` (default true) it marks the existing output **stale** (kept
visible, Copy disabled, "Settings changed…" note) instead of losing it. Copy is
available only for a fresh valid output. `stale` is generator metadata
(`data-stale`) layered over `valid` — NOT a new global ResultState. The runtime
never announces / stores / logs / transmits the output; announcements carry only
`generated | stale | error | none`; the password is read from the DOM at copy
time.

The **password binding** (`src/lib/calculators/password-form.ts`) validates
length + character types (min length ≥ class count → the selection can never be
silently violated) and delegates generation to the reviewed secure generator
(`crypto.getRandomValues`, one char per selected class, Fisher–Yates shuffle),
unchanged. `describeOutput` is content-free.

**Scope caveat:** certified for **explicit-output generators only** — NOT every
generator/random-data tool. The Random Number Generator and the wider generator
family are not certified by this one pilot.

Verified: `astro check` 0 errors; 379 unit + 142 E2E pass; 173-page build; first
viewport (1366×768) shows settings + Generate + output location; security E2E
prove no password in aria-live / storage / URL / network / console (+ Copy
success and failure). Backward-compat confirmed — homepage, search, guides,
references, category/directory, monetization, BMI and Percentage byte-identical;
only the Password page changed (+ inert IslandBySlug scoped-CSS ripple).
SEO/schema/FAQ/content on the Password page preserved.
