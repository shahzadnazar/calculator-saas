/**
 * Result focus & scroll helpers (R1) — family-neutral, DOM-only.
 *
 * These encode the doctrine's focus rules so every future runtime behaves the
 * same way, without any calculator-specific knowledge:
 *   • invalid submit  → move focus to the first invalid field;
 *   • explicit calc   → reveal the result only when its HEAD isn't already on
 *                        screen, or on a narrow/mobile viewport (never yank a
 *                        desktop user whose result is already in front of them);
 *   • live updates    → never move focus or scroll.
 *
 * Nothing here reduces state — it only reacts to decisions already made by the
 * state machine. All functions are safe to import anywhere; they no-op when
 * there is no DOM (SSR) and respect reduced-motion for scrolling.
 */

const hasDom = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

/** Narrow/mobile viewport — the width below which a result is likely off-screen. */
export function isMobileViewport(maxWidth = 768): boolean {
  if (!hasDom() || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(`(max-width: ${maxWidth}px)`).matches;
}

/** True when the element is at least partially within the vertical viewport. */
export function isElementInViewport(el: Element): boolean {
  if (!hasDom()) return false;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  return rect.bottom > 0 && rect.top < vh;
}

/**
 * True when the TOP of the element is on screen.
 *
 * This, not `isElementInViewport`, is the question a result panel needs answered.
 * A tall panel scrolled so its head is above the fold is still "partially in the
 * viewport" — its footnotes are visible — while the dominant figure the visitor
 * pressed Calculate for has scrolled off the top. Treating that as revealed is how
 * a reader ends up looking at an assumptions list instead of their answer.
 */
export function isElementTopInViewport(el: Element): boolean {
  if (!hasDom()) return false;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  return rect.top >= 0 && rect.top < vh;
}

function prefersReducedMotion(): boolean {
  return (
    hasDom() &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Move focus to the first invalid field within `root`. A field is "invalid" if
 * it carries `aria-invalid="true"`. Returns the focused element, or null if no
 * invalid field was found. Makes non-focusable containers focusable temporarily
 * so focus is never lost.
 */
export function focusFirstInvalidField(root: ParentNode): HTMLElement | null {
  if (!hasDom()) return null;
  const field = root.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!field) return null;
  focusElement(field);
  return field;
}

/**
 * `preventScroll` decides who owns the scroll position. Focusing an invalid field
 * SHOULD scroll to it — that is the whole point. Focusing a result must not, because
 * the caller has already scrolled deliberately: a second, browser-chosen scroll then
 * fights the first, and for a panel taller than the viewport the browser satisfies
 * itself by aligning the panel's BOTTOM — landing the reader on the footnotes with
 * the headline pushed off the top.
 */
function focusElement(el: HTMLElement, preventScroll = false): void {
  const focusable =
    el.matches('a[href], button, input, select, textarea, [tabindex]') ||
    el.hasAttribute('tabindex');
  if (!focusable) {
    el.setAttribute('tabindex', '-1');
    el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
  }
  el.focus({ preventScroll });
}

export interface RevealOptions {
  /** A live-after-first update: never move focus or scroll. */
  live?: boolean;
  /** Force reveal regardless of visibility (rarely needed). */
  force?: boolean;
  /** Move focus to the result (not just scroll). Off by default. */
  focus?: boolean;
}

/**
 * Reveal a freshly-computed result. Scrolls it into view ONLY when its head is not
 * already on screen, or the viewport is narrow/mobile; a live update never reveals.
 * Returns true if it scrolled/focused, false if it intentionally did nothing.
 */
export function revealResult(result: HTMLElement | null, opts: RevealOptions = {}): boolean {
  if (!hasDom() || !result) return false;
  if (opts.live) return false; // live updates must not move focus or scroll

  // Reveal when the result's HEAD is off screen, not merely when the whole panel is.
  // A long panel (schedule, chart, assumptions) can have its dominant figure scrolled
  // above the fold while its tail is still showing, which is exactly the case the old
  // partial-visibility test called "already visible" and left alone.
  const needsReveal = opts.force || isMobileViewport() || !isElementTopInViewport(result);
  if (!needsReveal) return false;

  result.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    // 'start' rather than 'nearest': when we have decided the head is off screen,
    // bringing it to the top is the reveal. 'nearest' would park it on whichever
    // edge it drifted past, which on a tall panel shows the least useful end.
    block: 'start',
  });
  if (opts.focus) focusElement(result, true); // the scroll above already placed it
  return true;
}
