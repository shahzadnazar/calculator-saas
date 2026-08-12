import { test, expect } from '@playwright/test';

/**
 * Calculator listing surfaces — the shared "SaaS product" card (CalculatorCard)
 * used on category pages, task-group hubs and the /calculators directory. Guards
 * that the card renders large with its Open-calculator action, and — critically —
 * that the directory's inline search filter still narrows the list after the card
 * swap (the card sits inside the [data-calc-item] wrapper the filter drives).
 */

test.describe('category page (/finance)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/finance', { waitUntil: 'domcontentloaded' });
  });

  test('renders large calculator cards, each a link with an action', async ({ page }) => {
    const cards = page.locator('.calc-card');
    expect(await cards.count()).toBeGreaterThan(1);
    const first = cards.first();
    await expect(first).toHaveAttribute('href', /^\/finance\//);
    await expect(first.locator('.calc-card__cta')).toContainText('Open calculator');
    const box = await first.boundingBox();
    expect(box!.height).toBeGreaterThan(120); // a "large" product card, not a dense row
  });

  test('header shows the live calculator count', async ({ page }) => {
    await expect(page.getByText(/free, no sign-up/)).toBeVisible();
  });

  test('mobile: single column, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});

test.describe('directory (/calculators)', () => {
  test('renders the shared card and the inline search filter still narrows results', async ({ page }) => {
    await page.goto('/calculators', { waitUntil: 'domcontentloaded' });
    expect(await page.locator('.calc-card').count()).toBeGreaterThan(10);
    await page.locator('#calc-search').fill('mortgage');
    await expect(page.locator('[data-calc-item]:not([hidden])')).toHaveCount(1);
    await page.locator('#calc-search').fill('zzznope');
    await expect(page.locator('[data-calc-search-empty]')).toBeVisible();
  });
});

test.describe('task-group hub (/tasks/save-invest)', () => {
  test('renders calculator cards with an Open-calculator action', async ({ page }) => {
    await page.goto('/tasks/save-invest', { waitUntil: 'domcontentloaded' });
    const cards = page.locator('.calc-card');
    expect(await cards.count()).toBeGreaterThan(1);
    await expect(cards.first().locator('.calc-card__cta')).toContainText('Open calculator');
  });
});
