/**
 * Calculator-search index builder (server/build only).
 *
 * This module imports the calculator registry and task data, so it must NOT be
 * bundled into the browser. It builds the compact index and computes the
 * fingerprinted URL; the pure query-time functions live in ./search-core (which
 * the client bundles). Everything from the core is re-exported for convenience.
 */

import {
  CALCULATORS,
  getCategory,
  calculatorPath,
} from '@data/calculators';
import { getTaskGroupForCalculator } from '@data/tasks';
import { searchIndexVersion, type CalculatorSearchRecord } from './search-core';

export * from './search-core';

/**
 * Build the compact search index from the registry. Includes LIVE calculators
 * only — no coming-soon entries, guides or reference pages — and only the
 * fields search needs. `searchPriority` is intentionally omitted (reserved).
 */
export function buildSearchRecords(): CalculatorSearchRecord[] {
  const records: CalculatorSearchRecord[] = [];
  CALCULATORS.forEach((c, i) => {
    if (c.status !== 'live') return;
    const category = getCategory(c.category);
    const taskGroup = getTaskGroupForCalculator(c.category, c.slug);
    records.push({
      id: `${c.category}/${c.slug}`,
      title: c.title,
      href: calculatorPath(c),
      category: category ? category.shortName : c.category,
      taskGroups: taskGroup ? [taskGroup.title] : [],
      blurb: c.description,
      keywords: [...c.keywords],
      aliases: c.aliases ? [...c.aliases] : [],
      phrases: c.phrases ? [...c.phrases] : [],
      registryOrder: i,
    });
  });
  return records;
}

/**
 * The current index content hash and its fingerprinted URL, computed once at
 * module load from the registry (pure). The build emits the index at exactly
 * this path, and the search component receives SEARCH_INDEX_URL as a build-time
 * prop — so the URL changes whenever searchable content changes, giving
 * deployment-safe cache invalidation without relying on CDN purge.
 */
export const SEARCH_INDEX_VERSION: string = searchIndexVersion(buildSearchRecords());
export const SEARCH_INDEX_URL: string = `/search-index/${SEARCH_INDEX_VERSION}.json`;
