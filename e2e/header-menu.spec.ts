import { test, expect, type Page } from '@playwright/test';
import { TASK_GROUPS_ORDERED, taskPath } from '../src/data/tasks';

/**
 * The header's task menu.
 *
 * Below 72rem the horizontal strip is clipped — it needs 698px and gets 446px at
 * 768px wide — so the groups past the third were reachable only by swiping a
 * scroller with no scrollbar and nothing to say it moved. The menu replaces that
 * strip there, and the strip replaces the menu above it. Both must hold, and the
 * menu has to work with JavaScript off, which is why it is a <details>.
 */
const MOBILE = { width: 390, height: 780 };
const DESKTOP = { width: 1366, height: 800 };

const menu = (page: Page) => page.locator('[data-site-menu]');
const toggle = (page: Page) => page.locator('.site-menu-toggle');
const panel = (page: Page) => page.locator('.site-menu-panel');
const strip = (page: Page) => page.locator('.site-nav');

test.describe('mobile', () => {
  test.use({ viewport: MOBILE });

  test('the strip is gone and the menu button is there', async ({ page }) => {
    await page.goto('/');
    await expect(strip(page)).toBeHidden();
    await expect(toggle(page)).toBeVisible();
  });

  test('the button is a >=44px tap target', async ({ page }) => {
    await page.goto('/');
    const box = await toggle(page).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test('it starts closed, opens on click and closes again', async ({ page }) => {
    await page.goto('/');
    await expect(panel(page)).toBeHidden();

    await toggle(page).click();
    await expect(panel(page)).toBeVisible();

    await toggle(page).click();
    await expect(panel(page)).toBeHidden();
  });

  test('every task group is listed, with the question that says what it is for', async ({ page }) => {
    await page.goto('/');
    await toggle(page).click();

    for (const group of TASK_GROUPS_ORDERED) {
      const row = panel(page).locator(`a[href="${taskPath(group)}"]`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(group.title);
      await expect(row).toContainText(group.question);
    }

    await expect(panel(page).locator('a[href="/calculators"]')).toBeVisible();
    await expect(panel(page).locator('a[href="/guides"]')).toBeVisible();
  });

  test('every row is reachable without scrolling past the panel', async ({ page }) => {
    await page.goto('/');
    await toggle(page).click();

    const rows = panel(page).locator('.site-menu-item');
    await expect(rows).toHaveCount(TASK_GROUPS_ORDERED.length + 2);

    for (const row of await rows.all()) {
      const box = await row.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('a row navigates', async ({ page }) => {
    await page.goto('/');
    await toggle(page).click();
    await panel(page).locator(`a[href="${taskPath(TASK_GROUPS_ORDERED[0])}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${taskPath(TASK_GROUPS_ORDERED[0])}$`));
  });

  test('Escape closes it and returns focus to the button', async ({ page }) => {
    await page.goto('/');
    await toggle(page).click();
    await expect(panel(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(toggle(page)).toBeFocused();
  });

  test('a click outside closes it', async ({ page }) => {
    await page.goto('/');
    await toggle(page).click();
    await expect(panel(page)).toBeVisible();

    await page.mouse.click(20, 400);
    await expect(panel(page)).toBeHidden();
  });

  test('the current group is marked, not just coloured', async ({ page }) => {
    const group = TASK_GROUPS_ORDERED[0];
    await page.goto(taskPath(group));
    await toggle(page).click();
    await expect(panel(page).locator(`a[href="${taskPath(group)}"]`)).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('it opens with JavaScript disabled', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: MOBILE });
    const page = await context.newPage();
    await page.goto('/');

    await expect(panel(page)).toBeHidden();
    await toggle(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator(`a[href="${taskPath(TASK_GROUPS_ORDERED[0])}"]`)).toBeVisible();

    await context.close();
  });

  test('the page does not scroll sideways with the menu open', async ({ page }) => {
    await page.goto('/');
    await toggle(page).click();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(1);
  });
});

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP });

  test('the strip is back and the menu button is gone', async ({ page }) => {
    await page.goto('/');
    await expect(strip(page)).toBeVisible();
    await expect(toggle(page)).toBeHidden();
  });

  test('every task group is still one click away in the strip', async ({ page }) => {
    await page.goto('/');
    for (const group of TASK_GROUPS_ORDERED) {
      await expect(strip(page).locator(`a[href="${taskPath(group)}"]`)).toBeVisible();
    }
  });

  test('a menu left open on a phone is closed when the layout widens', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await toggle(page).click();
    await expect(menu(page)).toHaveAttribute('open', '');

    await page.setViewportSize(DESKTOP);
    await expect(menu(page)).not.toHaveAttribute('open', '');
  });
});
