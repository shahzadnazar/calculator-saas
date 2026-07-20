import { test, expect, type Page } from '@playwright/test';

/**
 * Fat intake calculator — R7C-2D standard-form wave (calculator #11). A single daily
 * calorie target → the reviewed daily fat RANGE (20% – 35% of calories at 9 kcal/g),
 * never collapsed to one average, with the AMDR proportion breakdown as a subordinate
 * reference. Covers the doctrine end-to-end plus the range semantics, the too-low
 * result guard, and the empty initial state (no prefilled 2,000-kcal sample).
 */
const ROUTE = '/health/fat-intake-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#fi-result');
const primary = (page: Page) => page.locator('#fi-result [data-result-value]');
const interpretation = (page: Page) => page.locator('#fi-result [data-fi-interpretation]');
const liveRegion = (page: Page) => page.locator('#fi-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#fi-result [data-result-when~="${when}"]`);
const band = (page: Page, key: string) => page.locator(`#fi-result [data-fi-band="${key}"] [data-fi-band-value]`);

const calc = async (page: Page, kcal = '2000') => {
  await page.fill('[name="calories"]', kcal);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: no prefilled calories, result empty, Calculate visible, no live note', async ({ page }) => {
  await expect(page.locator('[name="calories"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(region(page, 'valid')).toBeHidden();
  await expect(submit(page)).toHaveText('Calculate Fat Intake');
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(primary(page)).toHaveText('—');
});

test('does not calculate automatically before the first submission', async ({ page }) => {
  await page.fill('[name="calories"]', '2000');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Valid results ------------------------------------------------------ */

test('valid result: dominant fat RANGE + AMDR proportion breakdown', async ({ page }) => {
  await calc(page, '2000');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('44–78'); // 20%–35% of 2000 at 9 kcal/g
  await expect(interpretation(page)).toContainText('Based on 20–35% of your 2,000 kcal target');
  await expect(interpretation(page)).toContainText('9 kcal per gram');
  await expect(band(page, 'min')).toHaveText('44 g');
  await expect(band(page, 'mod')).toHaveText('61 g'); // moderate 27.5% is a subordinate reference…
  await expect(band(page, 'max')).toHaveText('78 g');
  await expect(page.locator('[data-live-note]')).toBeVisible();
  // …and the RANGE, not the average, is the dominant figure.
  await expect(primary(page)).not.toHaveText('61'); // never collapsed to the midpoint
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await band(page, 'mod').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
});

test('renders no NaN / Infinity / negative / reversed value anywhere', async ({ page }) => {
  await calc(page, '2000');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined|-\d/);
});

/* ---- Validation, focus, aria -------------------------------------------- */

test('an empty explicit submission focuses the calorie field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const cal = page.locator('[name="calories"]');
  await expect(cal).toBeFocused();
  await expect(cal).toHaveAttribute('aria-invalid', 'true');
  const errId = (await cal.getAttribute('aria-describedby'))!.split(/\s+/).pop();
  await expect(page.locator(`#${errId}`)).toHaveText('Enter your daily calorie target.');
});

test('a non-positive calorie target is rejected', async ({ page }) => {
  await page.fill('[name="calories"]', '0');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="calories"]')).toHaveText('Enter a calorie target greater than zero.');
});

test('a calorie target too low to produce a usable range shows plain guidance (no 0–0 g)', async ({ page }) => {
  await page.fill('[name="calories"]', '22'); // min would round to 0
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(region(page, 'valid')).toBeHidden();
  await expect(page.locator('#fi-result [data-result-invalid-message]')).toContainText(
    'This calorie target is too low to estimate a daily fat range.',
  );
});

/* ---- Live-after-first --------------------------------------------------- */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calc(page, '2000');
  await expect(primary(page)).toHaveText('44–78');
  const cal = page.locator('[name="calories"]');
  await cal.focus();
  await cal.fill('2500');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('56–97'); // 20%–35% of 2500
  await expect(cal).toBeFocused();
});

/* ---- Reset -------------------------------------------------------------- */

test('reset clears the calorie field and returns to empty', async ({ page }) => {
  await calc(page, '2000');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(page.locator('[name="calories"]')).toHaveValue('');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Announcement ------------------------------------------------------- */

test('announces the primary range concisely, never the breakdown', async ({ page }) => {
  await calc(page, '2000');
  await expect(liveRegion(page)).toHaveText('Your estimated daily fat intake is 44 to 78 grams per day.');
  await expect(liveRegion(page)).not.toContainText(/27\.5|Moderate|Lower|Upper|kcal/);
});

/* ---- Responsive / theme / embed / monetization ------------------------- */

test('desktop shows the result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calc(page, '2000');
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calc(page, '2000');
  await expect(primary(page)).toHaveText('44–78');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calc(page, '2000');
  await expect(primary(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/health/fat-intake-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="calories"]', '2000');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#fi-result [data-result-value]')).toHaveText('44–78');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
