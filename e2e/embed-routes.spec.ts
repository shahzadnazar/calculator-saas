import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * R7D1 / R7D1.1 — the public embed routes are generated per-slug STATIC pages (the
 * dynamic IslandBySlug route is gone), and the embed manifest no longer carries a
 * category (the calculator registry is the sole route authority). Derive the route
 * list from the generated page tree itself — the filesystem truth for "which embed
 * routes exist" — and prove every one serves a 200 static embed with the shared
 * shell, that an unknown slug 404s, and that the one props special case
 * (standard-deviation → StatisticsCalculator primary='sd') renders. Deep behavior is
 * covered by each calculator's own spec; the embed renders the identical island.
 * (Registry↔manifest↔generated-page coverage is owned by embed-components.test.ts.)
 */
const PAGES = 'src/pages/embed';
// Non-calculator entries under src/pages/embed: the reference/[slug] route, the
// gallery index, and the embed landing page.
const RESERVED = new Set(['reference', 'gallery.astro', 'index.astro']);
const routes: { slug: string; url: string }[] = [];
for (const category of readdirSync(PAGES)) {
  if (RESERVED.has(category) || category.startsWith('[') || category.endsWith('.astro')) continue;
  for (const file of readdirSync(resolve(PAGES, category))) {
    if (!file.endsWith('.astro') || file.startsWith('[')) continue;
    const slug = file.replace(/\.astro$/, '');
    routes.push({ slug, url: `/embed/${category}/${slug}` });
  }
}

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
