# Task-First Calculator Pages — Contracts & Migration Plan

This document locks two product contracts and lays out the plan for making the
whole calculator surface task-first through **one shared layout**, migrated in
controlled waves. It is the reference for the homepage calculator and for the
`CalculatorLayout` extension.

Status at time of writing:
- The dedicated **Scientific Calculator** page (`/math/scientific-calculator`)
  is already task-first, currently as a bespoke page on `BaseLayout`
  (Phase 1.3) with the tightened header (Phase 1.3a).
- The shared `PhysicalCalculator` component system is built and covered by unit
  + E2E tests, with a `/dev/physical-calculator` demo route retained for the
  pending homepage work.

Nothing in section 3 is implemented yet. **The plan is for approval first.**

---

## 1. Homepage calculator — locked contract

The homepage first viewport must include the shared `PhysicalCalculator`.

**Behavior**
- Default mode: **Basic**.
- Show the **Basic / Scientific** toggle.
- Basic keypad is immediately usable.
- Scientific mode expands the scientific function panel **above the unchanged
  Basic keypad**.
- Preserve **expression, result, Ans and angle mode** when switching modes.
- **No navigation or reload** on switch (client-only state).
- Use **`size="compact"`** on the homepage.
- **Desktop:** global calculator **search** and **popular calculator links**
  appear **beside** the calculator.
- **Mobile:** global calculator **search appears before** the calculator.

**Component call (target)**
```astro
<PhysicalCalculator
  id="home-calculator"
  defaultMode="basic"
  showModeSwitch={true}
  size="compact"
/>
```

This is already supported by the component API (verified on the demo route:
`#demo-a` is Basic + mode switch; `#demo-c` is compact). The homepage work is
layout/placement + the search and popular-links column, **not** new calculator
behavior.

**Not the homepage — the dedicated Scientific page stays:**
- Default **Scientific**.
- **Deg/Rad** visible.
- **No** Basic/Scientific switch.

> Do not implement the homepage until separately approved. This section is the
> binding spec for when it is.

---

## 2. Global task-first calculator page header — locked contract

Every calculator page uses this order, top to bottom:

1. One **breadcrumb**
2. **H1**
3. One short **task-focused sentence**
4. **Calculator** immediately
5. Supporting and SEO content below

**Never render above the calculator:** a second category/task navigation line,
review date, reference link, methodology, long introduction, table of contents,
guide cards, FAQ, or promotional copy.

**The intro sentence must:**
- Be **one sentence**.
- Normally contain **12–22 words** (a precise, shorter statement is acceptable
  when it fully describes the tool — e.g. the Scientific intro is 10 words).
- Use **no marketing language**.
- State **exactly what the calculator calculates**.
- Occupy **no more than two mobile lines** where practical.

**Scientific Calculator intro (shipped):**
> Enter an expression and calculate trigonometry, logarithms, powers and roots.

The second category-eyebrow line has been removed from the Scientific page
(Phase 1.3a). The remaining sections below turn this contract into a shared,
opt-in layout so every page can adopt it identically.

---

## 3. Shared architecture — `CalculatorLayout` extension plan

**Principle:** do **not** keep rebuilding pages on `BaseLayout`. The bespoke
Scientific page was a deliberate, temporary exception to prove the pattern; the
end state is that **every** calculator page (Scientific included) renders through
the shared `CalculatorLayout`, with task-first ordering as an **opt-in** that
defaults to today's behavior.

### 3.1 Exact `CalculatorLayout` changes

Current header (lines ~94–143 of `src/layouts/CalculatorLayout.astro`) renders,
in order: eyebrow → H1 → intro → review date → references, then the tool slot,
then an ad, then content/guides/FAQ/offers/related/embed.

**Props — add three opt-in flags (existing props unchanged):**
```ts
interface Props {
  calculator: Calculator;
  intro?: string;                          // already exists
  faqs?: FAQ[];                            // already exists
  reviewedOn?: string;                     // already exists
  // NEW — all opt-in, defaulting to current behavior:
  toolFirst?: boolean;                     // master task-first switch
  showCategoryEyebrow?: boolean;           // the second nav line above the tool
  showReviewMetadataAboveTool?: boolean;   // review date + references above the tool
}
```

**Default resolution (backward-compatible):**
```ts
const {
  calculator, intro, faqs = [], reviewedOn,
  toolFirst = false,
  showCategoryEyebrow = !toolFirst,          // eyebrow on unless task-first
  showReviewMetadataAboveTool = !toolFirst,  // metadata up top unless task-first
} = Astro.props;
```

**Template edits (all additive / gated — no existing markup deleted):**
1. Wrap the eyebrow `<div>` (lines 95–111) in `{showCategoryEyebrow && ( … )}`.
2. Wrap the review-date block (lines 118–127) in
   `{showReviewMetadataAboveTool && reviewedDisplay && ( … )}`.
3. Wrap the references block (lines 128–142) in
   `{showReviewMetadataAboveTool && references.length > 0 && ( … )}`.
4. Reduce the tool section's top margin when `toolFirst` (see 3.5):
   `class={`mt-8 ${toolFirst ? 'mt-6' : ''}`}` → resolve to a single class.
5. Add a **bottom "About this calculator"** section, rendered only when the
   review metadata was suppressed up top
   (`{!showReviewMetadataAboveTool && ( … )}`), placed just before "Related
   calculators". It contains, in this order:
   - `<h2>About this calculator</h2>`
   - the review-date line (if `reviewedOn`), same markup as today,
   - a one-line methodology/privacy note with a link to `/methodology`,
   - the references line (if any), same markup as today.

   This relocates the EEAT signals **below** the tool instead of removing them.

Everything else in the layout (ad slot, content slot, related guides, FAQ,
offers, related calculators, embed box, all JSON-LD) is untouched.

### 3.2 Backward-compatible defaults

- A page that passes **no** new props gets `toolFirst=false`,
  `showCategoryEyebrow=true`, `showReviewMetadataAboveTool=true` → **byte-for-byte
  the current output**. All 48 un-migrated pages are unaffected by the layout
  change itself.
- A page opts in with a single prop: `<CalculatorLayout … toolFirst>`. That flips
  both sub-toggles off by default; either can still be overridden explicitly if a
  page needs a hybrid.
- Guard this with a regression test (3.7) that asserts a non-migrated page still
  shows the eyebrow and the review-date line above the tool.

### 3.3 Returning the bespoke Scientific page to `CalculatorLayout`

Once the layout supports `toolFirst`, replace the bespoke `BaseLayout` page with:
```astro
<CalculatorLayout
  calculator={calc}
  toolFirst
  intro="Enter an expression and calculate trigonometry, logarithms, powers and roots."
  faqs={faqs}
  reviewedOn={reviewedOn}
>
  <PhysicalCalculator id="scientific-calculator" defaultMode="scientific" showModeSwitch={false} size="full" />
  <Fragment slot="content"> … existing explainer prose … </Fragment>
</CalculatorLayout>
```
Notes:
- The Scientific-specific behavior (default Scientific, Deg/Rad, no mode switch)
  lives entirely in the `PhysicalCalculator` props in the slot — the layout does
  not need to know about it.
- FAQs move to the `faqs` prop (already rendered + schema'd by the layout).
- The current bespoke "About this calculator" footer is replaced by the layout's
  shared bottom block (3.1 item 5), so the methodology note and review date are
  preserved.
- **Acceptance:** the existing `e2e/scientific-page.spec.ts` must pass
  **unchanged** — it targets `#scientific-calculator` and content headings, not
  the layout — proving visual/behavioral parity with the shipped screenshots.
- Only after that passes do we delete the bespoke duplication.

### 3.4 Pilot migration approach

Migrate in this sequence, each step its own commit behind the build + E2E gate,
**stopping for approval after the pilots**:

1. **Extend the layout** (3.1). Behavior-preserving; prove with a full build
   (171 pages, 0 diffs on un-migrated pages) before touching any page.
2. **Pilot A — "return" migration:** move the Scientific page back onto
   `CalculatorLayout toolFirst` (3.3). Strongest test: the result must match the
   already-approved screenshots and keep `scientific-page.spec.ts` green.
3. **Pilot B — "forward" migration:** convert one page that uses the *old*
   layout today to `toolFirst`. Proposed: **`health/bmi-calculator`** (our
   empty-state reference, simple inputs, high traffic intent). This exercises a
   page whose tool is a form island, not the physical calculator — catching any
   layout assumption the physical-calculator pilot would miss.
4. **Review the two pilots together**, then migrate the remaining ~47 pages in
   **category-grouped waves** (Math → Finance → Health → Dates → Measure → …),
   one commit per wave, each gated. Waves keep blast radius small and let us stop
   or adjust between categories.

Do not migrate all pages in one operation.

### 3.5 Visual spacing targets

Task-first header rhythm (desktop; scale down ~15% on the compact homepage):

| Gap | Target | Tailwind |
| --- | --- | --- |
| Breadcrumb → H1 | 20px | `mt-5` |
| H1 → intro | 12px | `mt-3` |
| Intro → calculator | 24px | `mt-6` (was `mt-8` = 32px) |
| Calculator → first supporting section | 56px | `mt-14` |
| Between supporting sections | 56px | `mt-14` |
| Bottom "About" block | 32px + top border | `mt-14 border-t pt-8` |

Result target: the **complete** calculator begins within the first viewport —
desktop tool-top well under 800px, mobile under ~320px (Scientific currently
241px desktop / 293px mobile after the header fix).

### 3.6 SEO / schema preservation

Nothing that affects SEO changes; only the **visible position** of EEAT
signals moves.
- Same JSON-LD builders already in the layout: `calculatorSchema`
  (WebApplication, with `dateModified` from `reviewedOn`), `breadcrumbSchema`,
  `faqSchema` — plus site-wide Organization + WebSite from `BaseLayout`.
- Canonical, `<title>`, description, and OG image are derived by the layout from
  the registry exactly as today.
- Breadcrumb DOM + schema are identical (same `crumbs`).
- Review date and references **remain on the page**, relocated below the tool —
  EEAT retained, not removed.
- Routes/sitemap unchanged (no URL changes).
- H1 text unchanged.

### 3.7 Regression tests

- **Build gate:** 171 pages, `astro check` 0 errors, per wave.
- **Backward-compat guard (new E2E):** on a non-migrated page (e.g.
  `finance/mortgage-calculator`), assert the category eyebrow **and** the
  "Method reviewed" line render **above** the tool — proves defaults preserve
  today's layout.
- **Task-first order (new E2E):** on a migrated page, assert DOM order
  breadcrumb → H1 → intro → tool, and that eyebrow / review date / references /
  FAQ do **not** appear above the tool (bounding-box `y` checks, like
  `scientific-page.spec.ts`).
- **Parity:** `e2e/scientific-page.spec.ts` passes unchanged after Pilot A.
- **Schema presence:** built HTML for a migrated page still contains
  `WebApplication`, `BreadcrumbList`, and (where FAQs exist) `FAQPage` JSON-LD.
- **Intro length lint (optional):** a unit check that a migrated page's `intro`
  is one sentence within the length budget.

---

## 4. Sequencing summary

1. ✅ Phase 1.3 — Scientific page task-first (bespoke `BaseLayout`).
2. ✅ Phase 1.3a — tighten Scientific header (drop eyebrow, one-line intro).
3. ⏳ **This plan approved** →
4. Extend `CalculatorLayout` (behavior-preserving).
5. Pilot A (Scientific returns to the shared layout) + Pilot B (BMI forward).
6. Approval → category-grouped migration waves.
7. Homepage calculator (section 1) — separate approval.

Homepage and the remaining calculator pages are **not** modified until their
step is reached and approved.
