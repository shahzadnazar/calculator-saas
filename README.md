# BestCalculate

Free, fast, accurate online calculators for finance, health, math and everyday
life — built as a long-term SEO authority site.

**Live tools:** 44 calculators across all four categories — finance (18), health
(11), math (7) and everyday (8) — each with unit-tested logic, an SSR-default
interactive island, and a dedicated guide. The full breadth is live; see
`src/data/calculators.ts` for the registry.

---

## Tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | [Astro 5](https://astro.build) (static output) | Ships **zero JS by default**; hydrates only interactive "islands". Ideal Core Web Vitals for a content + tools site. |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) + a small design-token layer | Utility speed with a consistent, themeable design system. |
| Interactivity | Vanilla TS islands | No framework runtime — the smallest possible client bundles. |
| Calc logic | Pure TS functions in `src/lib/calculators/` | Framework-agnostic, reusable, **unit-tested**. |
| Tests | Vitest | Correctness is the product; every formula is covered. |
| SEO | Per-page `BaseHead`, JSON-LD builders, `@astrojs/sitemap` | Canonicals, OG/Twitter, structured data and a sitemap for free. |
| Fonts | System font stack | No render-blocking font downloads; zero layout shift. |

## Commands

```bash
npm install        # install dependencies
npm run dev        # local dev server (http://localhost:4321)
npm run build      # production build → dist/
npm run preview    # serve the production build locally
npm run check      # Astro + TypeScript diagnostics (must be clean)
npm run test       # run the calculator unit tests
npm run assets     # regenerate every brand asset, then every OG card (assets:brand + assets:og)
```

## Project structure

```
src/
├── config/
│   ├── site.ts            # SINGLE SOURCE OF TRUTH: brand name, domain, contact
│   └── monetization.ts    # ad on/off switch + placements (ads off by default)
├── data/
│   └── calculators.ts     # THE REGISTRY: every calculator + category as data
├── lib/
│   ├── calculators/       # pure, tested calculation logic (+ *.test.ts)
│   ├── format.ts          # shared locale-aware formatters
│   └── schema.ts          # JSON-LD structured-data builders
├── styles/global.css      # design tokens + theming + component classes
├── components/
│   ├── BaseHead.astro      # all <head>/SEO concerns
│   ├── Header/Footer/Logo  # shared brand chrome (derived from the registry)
│   ├── Breadcrumbs.astro
│   ├── AdSlot.astro        # centrally-controlled ad placement
│   └── islands/            # interactive calculators (client-hydrated)
├── layouts/
│   ├── BaseLayout.astro       # HTML shell + theme + header/footer
│   ├── CalculatorLayout.astro # reference structure for every calculator page
│   └── ContentLayout.astro    # static/legal/content pages
└── pages/                  # routes (see URL strategy below)
```

## URL strategy

Calculators live in topical silos to reinforce SEO relevance:

```
/                                  home
/<category>                        category landing (finance, health, math, everyday)
/<category>/<slug>                 a calculator, e.g. /finance/mortgage-calculator
/calculators                       full directory + instant search (?q=)
/about /contact /methodology       trust / EEAT
/privacy /terms /disclaimer        legal (required for ad networks)
```

## Adding a new calculator

The architecture is data-driven, so a new calculator is a small, well-scoped change:

1. **Registry** — add an entry to `src/data/calculators.ts` (set `status: 'live'`).
2. **Logic** — add a pure function in `src/lib/calculators/<name>.ts` **plus a
   `<name>.test.ts`**. Logic never lives in the UI.
3. **Island** — add `src/components/islands/<Name>Calculator.astro` that imports
   the logic (server-render a sensible default; enhance on the client).
4. **Page** — add `src/pages/<category>/<slug>.astro` using `CalculatorLayout`,
   passing the registry entry, an intro, FAQs and a `reviewedOn` date.

Navigation, the sitemap, category pages, related-tool links and structured data
update automatically from the registry.

## Adding a guide (content engine)

Guides are MDX in `src/content/guides/` (a typed content collection defined in
`src/content.config.ts`). A guide can **embed live calculators inline** and is
interlinked with them both ways.

1. Create `src/content/guides/<slug>.mdx` with frontmatter: `title`,
   `description`, `category`, `publishDate`, `relatedCalculators` (array of
   `"category/slug"` refs), optional `featured`/`updatedDate`.
2. To embed a calculator, import its island at the top of the MDX and drop it
   in the body: `import MortgageCalculator from '@components/islands/MortgageCalculator.astro'`.
3. The guide gets Article structured data, author/EEAT attribution, a "Calculators
   used" panel, and a reciprocal "Read more" link on each referenced calculator —
   all automatically. Authors live in `src/config/authors.ts`.
4. Set `pillar: true` for comprehensive, cluster-spanning decision guides — they
   surface in a "Start here" section on `/guides` and on the home page.

## Rebranding / domain change

Change `SITE.url` (and `name`, `contactEmail`) in `src/config/site.ts` and the
matching `SITE_URL` in `astro.config.mjs`. Everything else derives from those.

## Notes

- `npm audit` reports a dev-only esbuild advisory (dev server reachability). It
  does **not** affect the static production build. We intentionally do not force
  the breaking Astro-7 upgrade for a dev-time issue.

See [`docs/STRATEGY.md`](docs/STRATEGY.md) for the product/SEO strategy and roadmap.
