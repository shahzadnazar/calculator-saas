/**
 * Pure calculator-search library (S0).
 *
 * Framework-agnostic and side-effect-free: no DOM, no fetch, no localStorage,
 * no analytics. It turns the calculator registry into a compact search index
 * and ranks records against a query with a deterministic, weighted model.
 *
 * The eventual UI (S1+) consumes `buildSearchRecords()` (served as a static
 * JSON index) and calls `rankCalculators` / `findClosestSuggestion`. Ranking
 * returns TEXT VALUES ONLY — never HTML — so the UI must render with safe DOM
 * text APIs.
 */

import {
  CALCULATORS,
  getCategory,
  calculatorPath,
} from '@data/calculators';
import { getTaskGroupForCalculator } from '@data/tasks';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface CalculatorSearchRecord {
  /** "category/slug" — stable identity. */
  readonly id: string;
  readonly title: string;
  /** Canonical path, e.g. '/finance/mortgage-calculator'. */
  readonly href: string;
  /** Category short name, for display (e.g. 'Finance'). */
  readonly category: string;
  /** Task-group titles the calculator belongs to (secondary classification). */
  readonly taskGroups: string[];
  /** Short supporting phrase (the registry description). */
  readonly blurb: string;
  readonly keywords: string[];
  readonly aliases: string[];
  readonly phrases: string[];
  /** Index into the full registry — a stable final tie-breaker. */
  readonly registryOrder: number;
  /** Optional manual nudge for tie-breaking only (never affiliate/CPC-driven). */
  readonly searchPriority?: number;
}

export interface RankedCalculatorResult {
  readonly record: CalculatorSearchRecord;
  /** Higher is more relevant. */
  readonly score: number;
  /** Fraction of query tokens covered by the record (tie-breaker). */
  readonly coverage: number;
  /** Which signal produced the score — for UI hints/debugging, not HTML. */
  readonly matchedOn: 'title' | 'alias' | 'phrase' | 'keyword' | 'category' | 'fuzzy';
}

/**
 * Manual search priority — a small curated nudge used ONLY for tie-breaking
 * (e.g. so a bare "calculator" surfaces the scientific calculator first).
 * Never derived from affiliate value, sponsorship, CPC or ad potential.
 */
const SEARCH_PRIORITY: Readonly<Record<string, number>> = {
  'math/scientific-calculator': 10,
  'finance/mortgage-calculator': 6,
  'health/bmi-calculator': 6,
  'math/percent-calculator': 5,
  'finance/loan-calculator': 4,
  'everyday/age-calculator': 4,
};

/* ------------------------------------------------------------------ */
/* Index construction (live calculators only)                          */
/* ------------------------------------------------------------------ */

/**
 * Build the compact search index from the registry. Includes LIVE calculators
 * only — no coming-soon entries, guides or reference pages — and only the
 * fields search needs.
 */
export function buildSearchRecords(): CalculatorSearchRecord[] {
  const records: CalculatorSearchRecord[] = [];
  CALCULATORS.forEach((c, i) => {
    if (c.status !== 'live') return;
    const category = getCategory(c.category);
    const taskGroup = getTaskGroupForCalculator(c.category, c.slug);
    const id = `${c.category}/${c.slug}`;
    const priority = SEARCH_PRIORITY[id];
    records.push({
      id,
      title: c.title,
      href: calculatorPath(c),
      category: category ? category.shortName : c.category,
      taskGroups: taskGroup ? [taskGroup.title] : [],
      blurb: c.description,
      keywords: [...c.keywords],
      aliases: c.aliases ? [...c.aliases] : [],
      phrases: c.phrases ? [...c.phrases] : [],
      registryOrder: i,
      ...(priority !== undefined ? { searchPriority: priority } : {}),
    });
  });
  return records;
}

/**
 * Deterministic content version for the index (FNV-1a over the stable JSON).
 * Changes only when the index content changes, so the future loader can request
 * `/search-index.json?v=<version>` for deployment-safe cache invalidation
 * without any time- or random-based value. Pure.
 */
export function searchIndexVersion(records: CalculatorSearchRecord[]): string {
  const json = JSON.stringify(records);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/* ------------------------------------------------------------------ */
/* Normalization & tokenization (pure)                                 */
/* ------------------------------------------------------------------ */

/**
 * Normalize free text for searching: Unicode-safe, lowercased, trimmed,
 * whitespace collapsed, hyphens/underscores treated as spaces, punctuation
 * stripped — but the meaningful symbols %, / and + are preserved.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    // strip everything except letters (any script), numbers, spaces and % / +
    .replace(/[^\p{L}\p{N}%/+\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split normalized text into non-empty tokens. */
export function tokenizeSearchText(value: string): string[] {
  const n = normalizeSearchText(value);
  return n ? n.split(' ').filter(Boolean) : [];
}

/* ------------------------------------------------------------------ */
/* Bounded Damerau-Levenshtein                                          */
/* ------------------------------------------------------------------ */

/**
 * Optimal string alignment distance (Damerau-Levenshtein with adjacent
 * transpositions), bounded: returns `max + 1` as soon as the distance is known
 * to exceed `max`. No dependency; cheap for the short tokens we compare.
 */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl <= max ? bl : max + 1;
  if (bl === 0) return al <= max ? al : max + 1;

  const prevPrev = new Array<number>(bl + 1).fill(0);
  let prev = new Array<number>(bl + 1);
  let curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prevPrev[j - 2] + 1); // transposition
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1; // whole row already exceeds the bound
    for (let j = 0; j <= bl; j++) prevPrev[j] = prev[j];
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[bl] <= max ? prev[bl] : max + 1;
}

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

// Score bands. Non-overlapping so a stronger signal always outranks a weaker
// one; within the coverage bands, multi-token coverage refines the score.
const BAND = {
  exactTitle: 10000,
  titlePrefix: 9000,
  titleContains: 8000,
  titleTokenFull: 7000,
  aliasExact: 6000,
  aliasPhraseCoverage: 5000, // × coverage
  keywordCoverage: 3000, // × coverage
  categoryCoverage: 1000, // × coverage
  fuzzy: 800, // × coverage, minus a per-edit penalty
} as const;

interface RecordTokens {
  nTitle: string;
  titleTokens: Set<string>;
  aliasNorms: string[];
  phraseNorms: string[];
  aliasPhraseTokens: Set<string>;
  keywordTokens: Set<string>;
  categoryTokens: Set<string>;
  fuzzyTokens: string[]; // title + alias tokens
}

function recordTokens(r: CalculatorSearchRecord): RecordTokens {
  const titleTokens = tokenizeSearchText(r.title);
  const aliasTokens = r.aliases.flatMap(tokenizeSearchText);
  const phraseTokens = r.phrases.flatMap(tokenizeSearchText);
  const keywordTokens = r.keywords.flatMap(tokenizeSearchText);
  const categoryTokens = [
    ...tokenizeSearchText(r.category),
    ...r.taskGroups.flatMap(tokenizeSearchText),
  ];
  return {
    nTitle: normalizeSearchText(r.title),
    titleTokens: new Set(titleTokens),
    aliasNorms: r.aliases.map(normalizeSearchText),
    phraseNorms: r.phrases.map(normalizeSearchText),
    aliasPhraseTokens: new Set([...aliasTokens, ...phraseTokens]),
    keywordTokens: new Set(keywordTokens),
    categoryTokens: new Set(categoryTokens),
    fuzzyTokens: [...new Set([...titleTokens, ...aliasTokens])],
  };
}

function coverage(queryTokens: string[], tokenSet: Set<string>): number {
  if (!queryTokens.length) return 0;
  let hit = 0;
  for (const t of queryTokens) if (tokenSet.has(t)) hit++;
  return hit / queryTokens.length;
}

/** Fuzzy coverage over a record's title/alias tokens, honoring the query rules. */
function fuzzyMatch(queryTokens: string[], targetTokens: string[]): { score: number; coverage: number } {
  let hits = 0;
  let penalty = 0;
  for (const qt of queryTokens) {
    if (qt.length < 2) continue; // 1-char: no fuzzy
    let best = Infinity;
    for (const tt of targetTokens) {
      if (qt.length === 2) {
        if (tt.startsWith(qt)) { best = 0; break; } // 2-char: prefix only
        continue;
      }
      const maxD = qt.length >= 6 ? 2 : 1; // longer terms tolerate 2 edits, shorter 1
      const d = boundedEditDistance(qt, tt, maxD);
      if (d <= maxD && d < best) best = d;
    }
    if (best !== Infinity) { hits++; penalty += best; }
  }
  if (!hits) return { score: 0, coverage: 0 };
  const cov = hits / queryTokens.length;
  return { score: Math.max(1, BAND.fuzzy * cov - 40 * penalty), coverage: cov };
}

function scoreRecord(
  query: string,
  queryTokens: string[],
  r: CalculatorSearchRecord,
  t: RecordTokens,
): RankedCalculatorResult | null {
  const len = query.length;
  let score = 0;
  let matchedOn: RankedCalculatorResult['matchedOn'] = 'keyword';
  const consider = (s: number, on: RankedCalculatorResult['matchedOn']) => {
    if (s > score) { score = s; matchedOn = on; }
  };

  const titleCov = coverage(queryTokens, t.titleTokens);
  const aliasPhraseCov = coverage(queryTokens, t.aliasPhraseTokens);
  const keywordCov = coverage(queryTokens, t.keywordTokens);
  const categoryCov = coverage(queryTokens, t.categoryTokens);

  if (query === t.nTitle) consider(BAND.exactTitle, 'title');
  if (t.nTitle.startsWith(query)) consider(BAND.titlePrefix, 'title');
  if (len >= 3 && t.nTitle.includes(query)) consider(BAND.titleContains, 'title');
  if (len >= 3 && titleCov === 1) consider(BAND.titleTokenFull, 'title');
  if (t.aliasNorms.includes(query)) consider(BAND.aliasExact, 'alias');
  if (t.phraseNorms.includes(query)) consider(BAND.aliasExact, 'phrase');
  if (len >= 2 && aliasPhraseCov > 0) consider(BAND.aliasPhraseCoverage * aliasPhraseCov, 'alias');
  if (len >= 2 && keywordCov > 0) consider(BAND.keywordCoverage * keywordCov, 'keyword');
  if (len >= 3 && categoryCov > 0) consider(BAND.categoryCoverage * categoryCov, 'category');

  // Fuzzy only matters when nothing stronger matched (bands guarantee this).
  let fuzzyCov = 0;
  if (len >= 2 && score < BAND.categoryCoverage) {
    const fz = fuzzyMatch(queryTokens, t.fuzzyTokens);
    if (fz.score > 0) { fuzzyCov = fz.coverage; consider(fz.score, 'fuzzy'); }
  }

  if (score <= 0) return null;
  const cov = Math.max(titleCov, aliasPhraseCov, keywordCov, categoryCov, fuzzyCov);
  return { record: r, score, coverage: cov, matchedOn };
}

/**
 * Rank calculators against a query. Returns ALL matching records, most-relevant
 * first — the UI decides how many to show. Deterministic tie-breaking:
 * score → coverage → searchPriority → shorter title → registryOrder.
 */
export function rankCalculators(
  query: string,
  records: CalculatorSearchRecord[],
): RankedCalculatorResult[] {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const queryTokens = tokenizeSearchText(q);

  const results: RankedCalculatorResult[] = [];
  for (const r of records) {
    const res = scoreRecord(q, queryTokens, r, recordTokens(r));
    if (res) results.push(res);
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    const pa = a.record.searchPriority ?? 0;
    const pb = b.record.searchPriority ?? 0;
    if (pb !== pa) return pb - pa;
    if (a.record.title.length !== b.record.title.length) {
      return a.record.title.length - b.record.title.length;
    }
    return a.record.registryOrder - b.record.registryOrder;
  });
  return results;
}

/**
 * Closest single suggestion for a query that otherwise returns nothing
 * ("mortage" → Mortgage Calculator). Compares against titles and aliases with a
 * bounded edit distance; returns null when nothing is close enough.
 */
export function findClosestSuggestion(
  query: string,
  records: CalculatorSearchRecord[],
): CalculatorSearchRecord | null {
  const q = normalizeSearchText(query);
  if (q.length < 3) return null;
  const qTokens = tokenizeSearchText(q);
  const compact = q.replace(/\s+/g, '');
  const threshold = Math.max(1, Math.min(2, Math.floor(compact.length / 4)));

  let best: CalculatorSearchRecord | null = null;
  let bestDist = Infinity;
  for (const r of records) {
    const targets = [normalizeSearchText(r.title), ...r.aliases.map(normalizeSearchText)];
    const targetTokens = new Set<string>([
      ...tokenizeSearchText(r.title),
      ...r.aliases.flatMap(tokenizeSearchText),
    ]);
    let d = Infinity;
    for (const target of targets) d = Math.min(d, boundedEditDistance(q, target, threshold + 1));
    for (const qt of qTokens) {
      if (qt.length < 3) continue;
      for (const tt of targetTokens) d = Math.min(d, boundedEditDistance(qt, tt, threshold));
    }
    if (d > threshold) continue;
    const better =
      d < bestDist ||
      (d === bestDist && best !== null && (r.searchPriority ?? 0) > (best.searchPriority ?? 0));
    if (better) { bestDist = d; best = r; }
  }
  return best;
}
