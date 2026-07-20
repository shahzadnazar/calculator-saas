/**
 * Canonical embed-component identity (R7D1).
 *
 * Serializable slug → { category, componentPath, props? } that GENERATES the
 * per-slug public embed pages (`scripts/gen-embed-pages.mjs`). It replaces the old
 * dynamic `IslandBySlug` component map: because it is serializable (aliased path
 * strings + JSON-safe props only — never an imported Astro component), a plain
 * Node generator and drift gate can read `embed-components.json` without a
 * TypeScript loader, and each generated page ends up with a LITERAL static import
 * of exactly one island (so Astro emits only that island's scoped CSS).
 *
 * The registry (`@data/calculators`) stays the authority on which calculators are
 * live and their category; a coverage test asserts this map matches the live
 * registry EXACTLY (same slugs, same categories) so the two never drift.
 */
import raw from './embed-components.json';

export interface EmbedComponentDefinition {
  /** Category slug — namespaces the generated route `/embed/<category>/<slug>`. */
  readonly category: string;
  /** Aliased path to the embed component, e.g. `@components/islands/BmiCalculator.astro`. */
  readonly componentPath: string;
  /** Serializable props passed to the component (e.g. `{ primary: 'sd' }`). */
  readonly props?: Readonly<Record<string, string | number | boolean>>;
}

export const EMBED_COMPONENTS: Readonly<Record<string, EmbedComponentDefinition>> = raw;
