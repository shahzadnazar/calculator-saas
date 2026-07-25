import { test, expect, type Page } from '@playwright/test';

/**
 * Live Scientific Calculator page — /math/scientific-calculator.
 * Exercises everything that can run on the production route (Scientific default,
 * no mode switch, single instance). Cross-mode and multi-instance behaviors stay
 * in calculator.spec.ts on the dev route.
 */
const ROUTE = '/math/scientific-calculator';
const ID = 'scientific-calculator';
const bkey = (page: Page, aria: string) => page.locator(`#${ID} .keypad--basic button[aria-label="${aria}"]`).first();
const fkey = (page: Page, aria: string) => page.locator(`#${ID} button[aria-label="${aria}"]`).first();
const mainText = (page: Page) => page.locator(`#${ID} [data-calc-main]`).textContent();
const subText = (page: Page) => page.locator(`#${ID} [data-calc-sub]`).textContent();
async function tapBasic(page: Page, arias: string[]) { for (const a of arias) await bkey(page, a).click(); }

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

test('defaults to Scientific with Deg/Rad and no mode switch', async ({ page }) => {
  await expect(page.locator(`#${ID} .sci-panel`)).toBeVisible();
  await expect(page.locator(`#${ID} .keypad--basic`)).toBeVisible(); // shared keypad below
  await expect(page.locator(`#${ID} [data-angle-switch]`)).toBeVisible();
  await expect(page.locator(`#${ID} [data-mode-switch]`)).toHaveCount(0);
});

test('the complete calculator begins before the supporting SEO content', async ({ page }) => {
  const calc = await page.locator(`#${ID}`).boundingBox();
  const howto = await page.getByRole('heading', { name: 'How to use the scientific calculator' }).boundingBox();
  expect(calc!.y).toBeLessThan(howto!.y); // calculator above the long content
  expect(calc!.y).toBeLessThan(800); // begins within the first desktop viewport
});

test('scientific function click', async ({ page }) => {
  await fkey(page, 'sine').click();
  await tapBasic(page, ['9', '0']);
  await fkey(page, 'close parenthesis').click();
  await bkey(page, 'equals').click();
  expect((await mainText(page))?.trim()).toBe('1'); // sin(90°) = 1
});

test('Deg/Rad behavior', async ({ page }) => {
  await page.locator(`#${ID} [data-angle-switch] button[data-angle="rad"]`).click();
  await fkey(page, 'sine').click();
  await tapBasic(page, ['9', '0']);
  await fkey(page, 'close parenthesis').click();
  await bkey(page, 'equals').click();
  expect(Number(await mainText(page))).toBeCloseTo(0.894, 2); // sin(90 rad) ≈ 0.894
});

test('hardware-keyboard calculation (scientific precedence)', async ({ page }) => {
  await page.locator(`#${ID} [data-calc-display]`).click();
  await page.keyboard.type('2+3*4');
  await page.keyboard.press('Enter');
  expect((await mainText(page))?.trim()).toBe('14'); // precedence
});

test('basic keypad operation inside Scientific', async ({ page }) => {
  await tapBasic(page, ['1', '2', 'add', '3', 'equals']);
  expect((await mainText(page))?.trim()).toBe('15');
});

test('reciprocal (1/x)', async ({ page }) => {
  await tapBasic(page, ['8']);
  await fkey(page, 'Reciprocal').click();
  expect((await mainText(page))?.trim()).toBe('0.125');
});

test('modulo', async ({ page }) => {
  await tapBasic(page, ['1', '0']);
  await fkey(page, 'Modulo').click();
  await tapBasic(page, ['3', 'equals']);
  expect((await mainText(page))?.trim()).toBe('1'); // 10 mod 3
});

test('Ans (previous answer)', async ({ page }) => {
  await tapBasic(page, ['6', 'add', '2', 'equals']);
  await bkey(page, 'all clear').click();
  await fkey(page, 'Previous answer').click();
  expect((await mainText(page))?.trim()).toBe('8');
});

test('EXP (scientific notation)', async ({ page }) => {
  await tapBasic(page, ['2']);
  await fkey(page, 'Enter exponent in scientific notation').click();
  await tapBasic(page, ['3', 'equals']);
  expect((await mainText(page))?.trim()).toBe('2000'); // 2 × 10³
});

test('division-by-zero error and recovery', async ({ page }) => {
  await tapBasic(page, ['5', 'divide', '0', 'equals']);
  expect((await mainText(page))?.trim()).toBe('Cannot divide by zero');
  await tapBasic(page, ['7']);
  expect((await mainText(page))?.trim()).toBe('7');
});

test('expression display after equals', async ({ page }) => {
  await tapBasic(page, ['5', 'add', '6', 'equals']);
  expect((await subText(page))?.trim()).toBe('5 + 6 =');
  expect((await mainText(page))?.trim()).toBe('11');
});

test('accessible advanced labels', async ({ page }) => {
  await expect(fkey(page, 'Enter exponent in scientific notation')).toBeVisible();
  await expect(fkey(page, 'Modulo')).toBeVisible();
  await expect(fkey(page, 'Previous answer')).toBeVisible();
  await expect(fkey(page, 'Reciprocal')).toBeVisible();
});

test('mobile responsiveness', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator(`#${ID}`)).toBeVisible();
  await tapBasic(page, ['7', 'multiply', '8', 'equals']);
  expect((await mainText(page))?.trim()).toBe('56');
});
