import { test, expect } from '@playwright/test';

/**
 * The resize handshake, end to end in a real browser.
 *
 * It crosses a frame boundary that nothing else tests: the embed page posts its
 * height, the host page listens and sets the iframe's. Both halves were renamed
 * from `allcalc-resize` to `bestcalculate-resize` at once, and matching strings
 * in two source files is not evidence that a postMessage still arrives.
 *
 * The /embed demo is the host: same code path as a real placement, but same
 * origin so it runs locally.
 *
 * TIMING. Two things make this easy to write as a flaky test, and the first
 * version was one — it passed locally 16 times in a row and failed on CI.
 *
 *   1. The embed posts on load, twice on a short timer, and from a
 *      ResizeObserver, and `post()` returns early when the height has not
 *      changed. So the messages are a short burst that ENDS. A listener
 *      attached after `page.goto()` resolves can miss the burst entirely, and
 *      nothing will ever re-send it: dispatching `resize` on the HOST window
 *      does not reach the listener inside the iframe.
 *   2. The demo iframe is `loading="lazy"` and sits below the fold, so on a
 *      slower machine it may not have loaded at all inside a fixed wait.
 *
 * Both are removed here rather than papered over with a longer sleep: the
 * collector is installed by `addInitScript`, before any of the page's own
 * script runs, so no message can be missed; the iframe is scrolled into view so
 * laziness cannot defer it; and the assertions poll instead of sleeping.
 */

/** Installs a message collector that is listening before the page's own code is. */
async function collectResizeMessages(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    (window as unknown as { __resizeTypes: string[] }).__resizeTypes = [];
    window.addEventListener('message', (e: MessageEvent) => {
      const type = (e.data as { type?: unknown } | null)?.type;
      const seen = (window as unknown as { __resizeTypes: string[] }).__resizeTypes;
      if (typeof type === 'string' && type.endsWith('-resize') && !seen.includes(type)) {
        seen.push(type);
      }
    });
  });
}

const seenTypes = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __resizeTypes: string[] }).__resizeTypes ?? []);

test('the demo iframe is resized by the embedded calculator, not left at its default', async ({ page }) => {
  await page.goto('/embed');
  const frame = page.locator('#bestcalculate-demo');
  await frame.scrollIntoViewIfNeeded();
  await expect(frame).toBeVisible();

  // The inline style ships height:560px; a working handshake overwrites it.
  await expect
    .poll(async () => frame.evaluate((el) => (el as HTMLElement).style.height), { timeout: 20_000 })
    .not.toBe('560px');

  const height = await frame.evaluate((el) => parseFloat((el as HTMLElement).style.height));
  expect(height).toBeGreaterThan(100);
});

test('the embed page still answers a host that listens for the legacy message name', async ({ page }) => {
  // Snippets copied before the rename are frozen in other people's HTML and
  // cannot be updated. Their listener is the old name, so we must still send it.
  await collectResizeMessages(page);
  await page.goto('/embed');
  await page.locator('#bestcalculate-demo').scrollIntoViewIfNeeded();

  await expect
    .poll(() => seenTypes(page), { timeout: 20_000 })
    .toEqual(expect.arrayContaining(['bestcalculate-resize', 'allcalc-resize']));
});
