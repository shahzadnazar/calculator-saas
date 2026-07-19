# Shared Result & Monetization Architecture

Approved R0 blueprint for the result-state system, per-family controllers, and
monetization regions. This records the locked contracts and product decisions so
R1+ implements against a fixed target. **Everything below is a plan** except the
R0.5 work, which shipped.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| R0 | Audit + contracts | ✅ approved |
| **R0.5** | **Retire the duplicate legacy Scientific island** | ✅ **shipped** |
| R1 | Result state machine + shared result primitives | ⏳ next (own phase) |
| R2 | Form runtime + BMI pilot | ⏳ |
| R3 | Equation runtime + Percentage pilot | ⏳ |
| R4 | Generator runtime + Password pilot | ⏳ |
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
