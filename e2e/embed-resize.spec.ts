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
 */
test('the demo iframe is resized by the embedded calculator, not left at its default', async ({ page }) => {
  await page.goto('/embed');
  const frame = page.locator('#bestcalculate-demo');
  await expect(frame).toBeVisible();

  // The inline style ships height:560px; a working handshake overwrites it.
  await expect
    .poll(async () => (await frame.evaluate((el) => (el as HTMLElement).style.height)) || '', {
      timeout: 10_000,
    })
    .not.toBe('560px');

  const height = await frame.evaluate((el) => parseFloat((el as HTMLElement).style.height));
  expect(height).toBeGreaterThan(100);
});

test('the embed page still answers a host that listens for the legacy message name', async ({ page }) => {
  // Snippets copied before the rename are frozen in other people's HTML and
  // cannot be updated. Their listener is the old name, so we must still send it.
  await page.goto('/embed');
  const seen = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const types: string[] = [];
        const onMessage = (e: MessageEvent) => {
          const t = (e.data as { type?: string } | null)?.type;
          if (typeof t === 'string' && t.endsWith('-resize') && !types.includes(t)) types.push(t);
        };
        window.addEventListener('message', onMessage);
        // Nudge the embed into re-posting, then collect what arrived.
        window.dispatchEvent(new Event('resize'));
        setTimeout(() => {
          window.removeEventListener('message', onMessage);
          resolve(types);
        }, 3000);
      }),
  );
  expect(seen).toContain('bestcalculate-resize');
  expect(seen, 'already-pasted embeds would be stuck at their initial height').toContain('allcalc-resize');
});
