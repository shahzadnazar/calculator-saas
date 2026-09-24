import { test, expect } from '@playwright/test';

/**
 * Minimal E2E smoke — proves the production build boots, is titled, renders a
 * single H1, and exposes crawlable static calculator links. This is the gate
 * that Phase 1's calculator E2E will extend; it must stay fast and stable.
 */
test('homepage renders with a title and one visible H1', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/BestCalculate/i);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toBeVisible();
});

test('the directory exposes crawlable static calculator links', async ({ page }) => {
  await page.goto('/calculators');
  // Real <a href> in static HTML (not JS-only), per the crawlability requirement.
  await expect(page.locator('a[href="/finance/mortgage-calculator"]').first()).toBeVisible();
});
