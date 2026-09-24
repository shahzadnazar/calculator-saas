# Content & Density Style

Shared editorial and typography standards for every BestCalculate surface.
Serves the **Task-Completion Doctrine** (`TASK-COMPLETION-DOCTRINE.md`) and the
task-first content architecture (`TASK-FIRST-MIGRATION.md`). Non-negotiable for
reviews.

## Above the primary utility

Only: breadcrumb (when useful) · H1 · **one** short task-focused sentence · a
necessary immediate safety notice. Then the tool/answer/search. The one sentence
states exactly what the tool does — no marketing, no restating the H1.

## Prose

- Width **65–72ch** (`.prose` is 68ch — the default; the guide full-width
  exception is removed). **Tool width and prose width are independent.**
- Paragraphs **2–4 sentences, ~40–90 words**.
- Meaningful `<h2>`/`<h3>` when the topic changes; never re-explain the H1.
- **Numbered steps** for procedures; **bullets** for options/functions/
  conditions; **tables** only for genuine comparison.
- No marketing filler. No repeated explanation of the H1.
- **No programmatic sentence truncation or automatic paragraph splitting** —
  copy is human-written and intentional.

## Density (task-first ≠ sparse)

Medium-high utility density. Avoid oversized cards, excessive vertical padding,
decorative gaps, unnecessarily tall fields, repeated headings, long vertical
workflows — while preserving readable text, accessible ≥44px targets, visible
focus, clear grouping and mobile usability. Target: at **1366×768**, a
calculator shows H1 + one sentence + primary inputs + primary action + the main
result (or its position) where practical.

## Result copy

Distinguish `empty · example · valid · invalid`. Empty shows an instruction or
em dash — never a sample result in the visitor's result panel. `example` is
explicitly labelled "Example" and offers "Start with my values". Never surface
NaN / Infinity / undefined / raw errors — use plain corrective guidance.

## Per-surface primary-purpose order

- **Calculator:** breadcrumb → H1 → sentence → calculator → action → result →
  interpretation → supporting → monetization → related → FAQ → references/review.
- **Guide with tool:** breadcrumb → H1 → short summary → one orientation
  sentence → tool → detailed content → examples → FAQ → references.
- **Guide without tool:** breadcrumb → H1 → **direct answer / one-sentence
  summary → key steps/checklist** → detailed explanation.
- **Category:** H1 → short description → search/filter → popular → groups →
  supporting → monetization between groups → FAQ.
- **Directory:** H1 → search/filter → live results → category/task filters →
  SEO below.
- **Reference:** H1 → direct definition/formula/table → examples → detailed
  explanation → sources → related calculators.
- **Embed:** tool → minimal attribution.
- **Home:** search + calculator dashboard first; monetization/long content after
  the complete dashboard (separately approval-gated).

## Presentation model

`task-first` (product default) · `article-first` (answer-first, BLUF; guides
without tools + legal/content) · `reference-first` · `embed`. Never choose
`article-first` merely because a page has substantial SEO text.
