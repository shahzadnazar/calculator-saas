import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * R7D1 — the public embed routes are now generated per-slug STATIC pages (the
 * dynamic IslandBySlug route is gone). Prove every live calculator still serves a
 * 200 static embed with the shared shell, that an unknown slug 404s, and that the
 * one props special case (standard-deviation → StatisticsCalculator primary='sd')
 * renders. Deep per-calculator behavior is covered by each calculator's own spec
 * (which also mounts its embed route); the embed page renders the identical island.
 */
const MAP = JSON.parse(readFileSync('src/data/embed-components.json', 'utf8')) as Record<
  string,
  { category: string }
>;
const routes = Object.entries(MAP).map(([slug, d]) => ({ slug, url: `/embed/${d.category}/${slug}` }));

test('all 49 generated embed routes serve a 200 static page with the shared shell', async ({ page }) => {
  expect(routes.length).toBe(49);
  for (const { url } of routes) {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
    expect(resp?.status(), `${url} status`).toBe(200);
    await expect(page.locator('main.embed-main'), `${url} shell`).toBeVisible();
    await expect(page.locator('footer.embed-attribution'), `${url} attribution`).toBeVisible();
    expect(await page.content(), `${url} monetization`).not.toContain('data-mon-');
  }
});

test('an unknown embed slug returns 404 (no static page exists)', async ({ page }) => {
  const resp = await page.goto('/embed/health/not-a-real-calculator', { waitUntil: 'domcontentloaded' });
  expect(resp?.status()).toBe(404);
});

test('the standard-deviation embed renders the shared statistics island via the generated primary="sd" prop', async ({ page }) => {
  await page.goto('/embed/math/standard-deviation-calculator', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.embed-main h1')).toContainText('Standard Deviation');
  // The statistics island mounted (a real interactive control is present).
  await expect(page.locator('main.embed-main').locator('input, textarea, button').first()).toBeVisible();
});

test('a representative legacy embed (mortgage) renders its interactive tool', async ({ page }) => {
  await page.goto('/embed/finance/mortgage-calculator', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.embed-main h1')).toContainText('Mortgage');
  await expect(page.locator('main.embed-main').locator('input').first()).toBeVisible();
});
