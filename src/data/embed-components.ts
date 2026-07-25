/**
 * Embed COMPONENT IDENTITY manifest (R7D1 · source-of-truth hardened R7D1.1).
 *
 * `slug → { componentPath, props? }` — component identity ONLY. It carries NO
 * category / title / status: the calculator REGISTRY (`@data/calculators`) is the
 * single authority on which calculators are live and their category, and the
 * generated embed ROUTE PATHS are derived from it (see `scripts/gen-embed-pages.mjs`).
 *
 * It is deliberately serializable (aliased path strings + JSON-safe props only —
 * never an imported Astro component), so the plain-Node generator and drift/
 * isolation gates read `embed-components.json` without a TypeScript loader, and
 * each generated page ends up with a LITERAL static import of exactly one island
 * (so Astro emits only that island's scoped CSS). A coverage test asserts this
 * manifest's slug set matches the live registry EXACTLY, so the two never drift.
 */
import raw from './embed-components.json';

export interface EmbedComponentDefinition {
  /** Aliased path to the embed component, e.g. `@components/islands/BmiCalculator.astro`. */
  readonly componentPath: string;
  /** Serializable props passed to the component (e.g. `{ primary: 'sd' }`). */
  readonly props?: Readonly<Record<string, string | number | boolean>>;
}

export const EMBED_COMPONENTS: Readonly<Record<string, EmbedComponentDefinition>> = raw;
