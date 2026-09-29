/**
 * Relatedness ranking for the "Related calculators" rail and card grid.
 *
 * The previous implementation was `[...sameCategory, ...others].slice(0, limit)`
 * with both halves in *registry order* — the order the entries happen to be
 * authored in. Two things followed from that, and both were measurable in the
 * built site:
 *
 *   1. Every cross-category slot on the site went to whatever sits at the top of
 *      the finance list. Mortgage and Loan were linked from 59 and 60 pages —
 *      including every BMI, fraction and password page, where they are not
 *      related to anything — while Credit Card Payoff and Income Tax had 4 and 5.
 *   2. Finance has 20 live entries and the rail shows 12, so the last eight
 *      finance calculators in registry order were never linked from a sibling at
 *      all. Credit Card Payoff is one of them.
 *
 * Link equity therefore pooled on the two hardest keywords the site owns
 * (mortgage KD 89, loan KD 88) and starved the winnable ones, purely as a side
 * effect of authoring order. This module ranks by actual topical relatedness
 * instead, using signals the site already maintains:
 *
 *   - the task group, which `tasks.test.ts` guarantees is a clean partition of
 *     every live calculator — the strongest signal we have;
 *   - topic cluster membership, which is curated and may cross categories;
 *   - the category;
 *   - shared keywords/aliases/phrases, which order the result.
 *
 * Inclusion needs a STRUCTURAL signal — a task group, a cluster or the category.
 * Keyword overlap only ranks, never admits: scored on its own it paired BMI with
 * Inflation and Fractions with Time off a single incidental word. Cross-category
 * relatedness is therefore exactly what the curated clusters say it is, which is
 * what clusters are for (geometry spans math and everyday, and does so on
 * purpose).
 *
 * A candidate that scores zero is *unrelated*, and unrelated tools are left out
 * rather than padding the list to `limit`. A rail headed "Related calculators"
 * that lists a mortgage under a BMI result is both a worse answer for the reader
 * and a link the page should not be spending.
 */
import { CALCULATORS, type Calculator } from '@data/calculators';
import { TASK_GROUPS } from '@data/tasks';
import { CLUSTERS } from '@data/clusters';

const ref = (c: Pick<Calculator, 'category' | 'slug'>) => `${c.category}/${c.slug}`;

/** ref -> task group slug. Every live calculator has exactly one. */
const TASK_OF = new Map<string, string>(
  TASK_GROUPS.flatMap((g) => g.members.map((m) => [m.ref, g.slug] as const)),
);

/** ref -> the topic clusters it belongs to (a calculator may be in several). */
const CLUSTERS_OF = new Map<string, Set<string>>();
for (const cluster of CLUSTERS) {
  for (const m of cluster.members) {
    if (!CLUSTERS_OF.has(m.ref)) CLUSTERS_OF.set(m.ref, new Set());
    CLUSTERS_OF.get(m.ref)!.add(cluster.slug);
  }
}

/** Content words from a calculator's search vocabulary, for overlap scoring. */
const STOPWORDS = new Set(['calculator', 'calculate', 'the', 'a', 'an', 'of', 'to', 'for', 'my', 'how', 'much', 'i', 'and', 'is', 'in', 'on', 'what']);
const TERMS_OF = new Map<string, Set<string>>(
  CALCULATORS.map((c) => [
    ref(c),
    new Set(
      [...c.keywords, ...(c.aliases ?? []), ...(c.phrases ?? [])]
        .flatMap((k) => k.toLowerCase().split(/[^a-z0-9]+/))
        .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
    ),
  ]),
);

/** Weights are ordinal, not tuned: task group beats cluster beats category. */
const SAME_TASK_GROUP = 100;
const SHARED_CLUSTER = 40;
const SAME_CATEGORY = 20;
const PER_SHARED_TERM = 3;
const MAX_TERM_BONUS = 15;

/**
 * How related `other` is to `self`. Zero means unrelated — nothing in common
 * beyond both being calculators on this site.
 */
export function relatedness(self: Calculator, other: Calculator): number {
  const a = ref(self);
  const b = ref(other);
  if (a === b) return 0;

  const taskA = TASK_OF.get(a);
  const sameTask = Boolean(taskA) && taskA === TASK_OF.get(b);

  const clustersA = CLUSTERS_OF.get(a);
  const clustersB = CLUSTERS_OF.get(b);
  const sharedCluster =
    Boolean(clustersA && clustersB) && [...clustersA!].some((s) => clustersB!.has(s));

  const sameCategory = self.category === other.category;

  // No structural tie, no link — see the note at the top of this file.
  if (!sameTask && !sharedCluster && !sameCategory) return 0;

  let score = 0;
  if (sameTask) score += SAME_TASK_GROUP;
  if (sharedCluster) score += SHARED_CLUSTER;
  if (sameCategory) score += SAME_CATEGORY;

  const termsA = TERMS_OF.get(a);
  const termsB = TERMS_OF.get(b);
  if (termsA && termsB) {
    let shared = 0;
    for (const t of termsA) if (termsB.has(t)) shared += 1;
    score += Math.min(shared * PER_SHARED_TERM, MAX_TERM_BONUS);
  }
  return score;
}

/**
 * Related calculators for internal linking, most related first. Never returns
 * `self`, never returns a calculator that is not live, and never pads the list
 * with unrelated tools to reach `limit`.
 *
 * Ties break on title rather than registry position, so the order is stable
 * across builds and no calculator inherits an advantage from where it was typed.
 */
export function getRelatedCalculators(self: Calculator, limit = 6): Calculator[] {
  return CALCULATORS.filter((c) => c.status === 'live')
    .map((c) => ({ c, score: relatedness(self, c) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.title.localeCompare(b.c.title))
    .slice(0, limit)
    .map((x) => x.c);
}
