/**
 * Result focus & scroll helpers (R1) — family-neutral, DOM-only.
 *
 * These encode the doctrine's focus rules so every future runtime behaves the
 * same way, without any calculator-specific knowledge:
 *   • invalid submit  → move focus to the first invalid field;
 *   • explicit calc   → reveal the result only when it isn't already visible or
 *                        on a narrow/mobile viewport (never yank a desktop user
 *                        whose result is already on screen);
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

function focusElement(el: HTMLElement): void {
  const focusable =
    el.matches('a[href], button, input, select, textarea, [tabindex]') ||
    el.hasAttribute('tabindex');
  if (!focusable) {
    el.setAttribute('tabindex', '-1');
    el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
  }
  el.focus({ preventScroll: false });
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
 * Reveal a freshly-computed result. Scrolls it into view ONLY when it isn't
 * already visible or the viewport is narrow/mobile; a live update never reveals.
 * Returns true if it scrolled/focused, false if it intentionally did nothing.
 */
export function revealResult(result: HTMLElement | null, opts: RevealOptions = {}): boolean {
  if (!hasDom() || !result) return false;
  if (opts.live) return false; // live updates must not move focus or scroll

  const needsReveal = opts.force || isMobileViewport() || !isElementInViewport(result);
  if (!needsReveal) return false;

  result.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'nearest',
  });
  if (opts.focus) focusElement(result);
  return true;
}
