import { test, expect, type Page } from '@playwright/test';

/**
 * Home page (`/`) — the product-forward hero locked by TASK-FIRST-MIGRATION.md §1:
 * a live Basic/Scientific PhysicalCalculator sits beside the headline, global search
 * and popular quick-links. This spec guards that contract (the calculator mounts in
 * the first viewport, Basic default with a working mode switch) plus the §5 mobile
 * order (search comes before the calculator). Deep calculator behaviour lives in
 * scientific-page.spec.ts / calculator.spec.ts — here we only prove it is wired up.
 */
const ID = 'home-calculator';
const bkey = (page: Page, aria: string) =>
  page.locator(`#${ID} .keypad--basic button[aria-label="${aria}"]`).first();
const mainText = (page: Page) => page.locator(`#${ID} [data-calc-main]`).textContent();
const modeBtn = (page: Page, mode: 'basic' | 'scientific') =>
  page.locator(`#${ID} [data-mode-switch] button[data-mode="${mode}"]`);
async function tapBasic(page: Page, arias: string[]) {
  for (const a of arias) await bkey(page, a).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
});

test('mounts a compact Basic calculator with a mode switch (§1 contract)', async ({ page }) => {
  const calc = page.locator(`#${ID}[data-physical-calculator]`);
  await expect(calc).toBeVisible();
  await expect(calc).toHaveAttribute('data-default-mode', 'basic');
  await expect(calc).toHaveAttribute('data-size', 'compact');
  await expect(page.locator(`#${ID} [data-mode-switch]`)).toBeVisible();
  await expect(page.locator(`#${ID} .keypad--basic`)).toBeVisible();
  await expect(page.locator(`#${ID} [data-sci-panel]`)).toBeHidden(); // Basic default: functions tucked away
});

test('the calculator begins within the first desktop viewport', async ({ page }) => {
  const box = await page.locator(`#${ID}`).boundingBox();
  expect(box!.y).toBeLessThan(800);
});

test('basic calculation works on the home instance', async ({ page }) => {
  await tapBasic(page, ['7', 'multiply', '8', 'equals']);
  expect((await mainText(page))?.trim()).toBe('56');
});

test('switching to Scientific reveals the function panel and preserves the running value', async ({ page }) => {
  await tapBasic(page, ['7', 'multiply', '8', 'equals']); // 56 on the engine
  await modeBtn(page, 'scientific').click();
  await expect(page.locator(`#${ID} .sci-panel`)).toBeVisible();
  await expect(page.locator(`#${ID} [data-angle-switch]`)).toBeVisible(); // Deg/Rad appears in Scientific
  expect((await mainText(page))?.trim()).toBe('56'); // shared engine keeps the answer across modes
  await modeBtn(page, 'basic').click();
  await expect(page.locator(`#${ID} [data-sci-panel]`)).toBeHidden();
});

test('global search and popular quick-links are present in the hero', async ({ page }) => {
  await expect(page.locator('#hero-search')).toBeVisible();
  await expect(page.getByText('Popular:', { exact: true })).toBeVisible();
  // The curated chips are trimmed titles ("Mortgage Calculator" → "Mortgage"); match on
  // the normalized accessible name so the chip, not the full-title card below, is found.
  await expect(page.getByRole('link', { name: 'Mortgage', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'BMI', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Age', exact: true })).toBeVisible();
});

test('mobile order: search comes before the calculator, no horizontal overflow (§5)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const searchBox = await page.locator('#hero-search').boundingBox();
  const calcBox = await page.locator(`#${ID}`).boundingBox();
  expect(searchBox!.y).toBeLessThan(calcBox!.y); // search above the calculator on small screens
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
  // and it still calculates on mobile
  await tapBasic(page, ['9', 'add', '1', 'equals']);
  expect((await mainText(page))?.trim()).toBe('10');
});
