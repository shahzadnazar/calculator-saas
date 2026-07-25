import { test, expect, type Page } from '@playwright/test';

/**
 * Backward-compatibility guard — un-migrated pages must keep the ORIGINAL
 * arrangement: category eyebrow and review metadata ABOVE the tool. One
 * representative page per category (none of them pilots). If a future change
 * accidentally flips the default presentation, these fail.
 *
 * (Whole-fleet invariance is additionally proven at build time by a
 * whitespace-ignoring diff of every page; these tests lock the behaviour in CI.)
 */
const LEGACY = [
  { route: '/finance/loan-calculator', category: 'finance' }, // mortgage migrated in R11E1; loan stays legacy
  { route: '/health/due-date-calculator', category: 'health' }, // target-heart-rate migrated in R7C-2C; this stays legacy
  { route: '/math/area-calculator', category: 'math' },
  { route: '/everyday/age-calculator', category: 'everyday' },
];

const tool = (page: Page) => page.locator('section[aria-label$=" tool"]');

for (const { route, category } of LEGACY) {
  test.describe(`legacy (${category}): ${route}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
    });

    test('category eyebrow renders above the tool', async ({ page }) => {
      const eyebrow = page.locator('header:has(h1) a').first();
      await expect(eyebrow).toBeVisible();
      const eb = await eyebrow.boundingBox();
      const t = await tool(page).boundingBox();
      expect(eb!.y).toBeLessThan(t!.y); // eyebrow above the tool
    });

    test('review metadata renders above the tool', async ({ page }) => {
      const review = await page.getByText(/Method reviewed for accuracy on/).boundingBox();
      const t = await tool(page).boundingBox();
      expect(review!.y).toBeLessThan(t!.y); // legacy keeps review metadata above the tool
    });

    test('canonical and H1 are intact', async ({ page }) => {
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://allcalculators.com${route}`,
      );
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  });
}
