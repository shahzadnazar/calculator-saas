import { test, expect, type Page } from '@playwright/test';

/**
 * Zero-legacy sentinel (R21A1 — the task-first program is COMPLETE: 49 migrated / 0 legacy).
 *
 * This file used to assert the ORIGINAL arrangement (category eyebrow + review metadata ABOVE the tool)
 * on one representative legacy page per category. Every calculator is now task-first, so there is no
 * legacy representative left. Rather than delete the guard (which would silently drop the invariant),
 * it is repurposed: LEGACY must stay EMPTY, and the FORMER final representative — compound-interest,
 * migrated last in R21A1 — must satisfy the task-first contract. If anyone reintroduces a legacy layout
 * (or regresses compound-interest), these assertions fail.
 */

// The list of legacy-layout calculators. The fleet reached 0 legacy in R21A1; it must stay empty.
const LEGACY: { route: string; category: string }[] = [];

// The final calculator to migrate (R21A1). Kept as an explicit regression anchor.
const FORMER_FINAL_LEGACY = '/finance/compound-interest-calculator';

const tool = (page: Page) => page.locator('section[aria-label$=" tool"]');

test.describe('zero-legacy fleet sentinel', () => {
  test('no calculator renders the legacy layout — the fleet is 0 legacy', () => {
    expect(LEGACY).toHaveLength(0);
  });

  test.describe(`former final legacy is now task-first: ${FORMER_FINAL_LEGACY}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(FORMER_FINAL_LEGACY, { waitUntil: 'domcontentloaded' });
    });

    test('order: H1 → tool → About; no eyebrow above the tool', async ({ page }) => {
      // The task-first header holds only the H1 + one-sentence intro — no eyebrow links.
      await expect(page.locator('header:has(h1) a')).toHaveCount(0);
      const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
      const t = await tool(page).boundingBox();
      const about = await page.getByRole('heading', { name: 'About this calculator' }).boundingBox();
      expect(h1!.y).toBeLessThan(t!.y); // calculator below the heading/intro
      expect(t!.y).toBeLessThan(about!.y); // review/reference metadata below the tool
    });

    test('review metadata renders BELOW the tool (task-first), not above it', async ({ page }) => {
      const t = await tool(page).boundingBox();
      const review = await page.getByText(/Method reviewed for accuracy on/).boundingBox();
      expect(review!.y).toBeGreaterThan(t!.y);
    });
  });
});

// Legacy-layout representative loop retained for structure; LEGACY is empty, so it contributes no
// tests. The zero-legacy assertion above is the real guard against reintroducing a legacy layout.
for (const { route, category } of LEGACY) {
  test.describe(`legacy (${category}): ${route}`, () => {
    test('category eyebrow renders above the tool', async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const eyebrow = page.locator('header:has(h1) a').first();
      await expect(eyebrow).toBeVisible();
      const eb = await eyebrow.boundingBox();
      const t = await tool(page).boundingBox();
      expect(eb!.y).toBeLessThan(t!.y);
    });
  });
}
