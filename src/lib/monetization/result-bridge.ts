/**
 * Result-state bridge logic (R6) — pure eligibility predicates.
 *
 * The client bridge (an `is:inline` script CalculatorLayout emits ONLY when a
 * post-result region is active) observes each shared result shell's
 * `data-result-state`, `data-result-activity` and `data-stale`, and reveals the
 * post-result region only while the page is eligible. These pure predicates
 * encode that rule so it is unit-testable; the inline script mirrors them
 * exactly (keep the two in sync — see CalculatorLayout `BRIDGE_TEMPLATE`).
 *
 * A page is eligible when AT LEAST ONE observed result shell holds a fresh,
 * valid, non-stale, settled result. The percentage tool's three independent
 * equations therefore share ONE post-result region: any single fresh valid
 * result qualifies the page. Empty, example, invalid, calculating and stale
 * results never qualify — so the region stays hidden until the visitor has a
 * real answer, and hides again the moment it goes stale or invalid.
 */

/** A snapshot of the three attributes the bridge reads from a `[data-result-shell]`. */
export interface ResultShellSnapshot {
  /** `data-result-state`: empty | example | valid | invalid (or null if absent). */
  state: string | null;
  /** `data-result-activity`: idle | calculating | just-updated (or null if absent). */
  activity: string | null;
  /** `data-stale === 'true'` (generator metadata; absent on non-generators → false). */
  stale: boolean;
}

/**
 * A single shell qualifies: a valid result that is neither stale nor mid
 * (perceptible) recompute. `just-updated` and `idle` both qualify — only
 * `calculating` is withheld, so the region never flashes during a live edit.
 */
export function shellEligible(s: ResultShellSnapshot): boolean {
  return s.state === 'valid' && s.activity !== 'calculating' && s.stale !== true;
}

/** The page qualifies when any observed shell qualifies (percentage: any one equation). */
export function pageEligible(shells: readonly ResultShellSnapshot[]): boolean {
  return shells.some(shellEligible);
}
