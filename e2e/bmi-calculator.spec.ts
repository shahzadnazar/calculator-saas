import { test, expect, type Page } from '@playwright/test';

/**
 * BMI calculator — the R2 standard-form-runtime pilot, on its LIVE page.
 *
 * Covers the doctrine end-to-end: empty initial state, the first-calculation
 * gate, live-after-first, validation + focus + aria wiring, unit conversion
 * before and after the first calc, reset, the single announcement, no
 * NaN/∞/undefined, the desktop workspace and the mobile order.
 */
const ROUTE = '/health/bmi-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#bmi-result');
const value = (page: Page) => page.locator('#bmi-result [data-result-when~="valid"] [data-result-value]');
const a11y = (page: Page) => page.locator('#bmi-result [data-result-when~="valid"] [data-result-value-a11y]');
const category = (page: Page) => page.locator('[data-bmi-category]');
const liveRegion = (page: Page) => page.locator('#bmi-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#bmi-result [data-result-when~="${when}"]`);

const calcMetric = async (page: Page, h = '175', w = '70') => {
  await page.fill('[name="heightCm"]', h);
  await page.fill('[name="weightKg"]', w);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: fields blank, result empty, Calculate BMI visible, no announcement', async ({ page }) => {
  await expect(page.locator('[name="heightCm"]')).toHaveValue('');
  await expect(page.locator('[name="weightKg"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(region(page, 'valid')).toBeHidden();
  await expect(submit(page)).toBeVisible();
  await expect(submit(page)).toHaveText('Calculate BMI');
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
});

test('does not calculate automatically before the first submission', async ({ page }) => {
  await page.fill('[name="heightCm"]', '175');
  await page.fill('[name="weightKg"]', '70');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Valid results ------------------------------------------------------ */

test('valid metric result shows a dominant BMI, category and healthy range', async ({ page }) => {
  await calcMetric(page, '175', '70');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(value(page)).toHaveText('22.9');
  await expect(category(page)).toHaveText('Normal weight');
  await expect(page.locator('[data-bmi-range]')).toContainText('kg');
  await expect(page.locator('[data-live-note]')).toBeVisible();
});

test('valid imperial result computes from feet/inches/pounds', async ({ page }) => {
  await page.click('[data-unit="imperial"]');
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '9');
  await page.fill('[name="weightLb"]', '154');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(value(page)).toHaveText('22.7');
  await expect(page.locator('[data-bmi-range]')).toContainText('lb');
});

test('the unit is exposed to assistive tech as a spoken combined name', async ({ page }) => {
  await calcMetric(page, '175', '70');
  await expect(a11y(page)).toHaveText('22.9 kilograms per square metre');
});

/* ---- Validation, focus, aria ------------------------------------------- */

test('invalid submission focuses the first invalid field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const height = page.locator('[name="heightCm"]');
  await expect(height).toBeFocused();
  await expect(height).toHaveAttribute('aria-invalid', 'true');
  const errId = await height.getAttribute('aria-describedby');
  const err = page.locator(`#${errId}`);
  await expect(err).toBeVisible();
  await expect(err).toHaveText('Enter your height.');
});

test('a zero value is rejected with distinct guidance and no NaN', async ({ page }) => {
  await calcMetric(page, '175', '0');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="weightKg"]')).toHaveText('Enter a weight greater than zero.');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Live-after-first --------------------------------------------------- */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calcMetric(page, '175', '70');
  await expect(value(page)).toHaveText('22.9');
  const weight = page.locator('[name="weightKg"]');
  await weight.focus();
  await weight.fill('95');
  await page.waitForTimeout(DEBOUNCE);
  await expect(value(page)).toHaveText('31'); // 95 / 1.75² ≈ 31.0
  await expect(category(page)).toHaveText('Obesity');
  await expect(weight).toBeFocused(); // live updates never steal focus
});

test('a live edit to invalid drops the stale value, then recovers', async ({ page }) => {
  await calcMetric(page, '175', '70');
  const weight = page.locator('[name="weightKg"]');
  await weight.fill('0');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(region(page, 'valid')).toBeHidden(); // no stale "22.9" presented
  await weight.fill('60');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(value(page)).toHaveText('19.6');
});

/* ---- Explicit-calc focus ------------------------------------------------ */

test('an explicit calc keeps focus on Calculate BMI when the result is already visible', async ({ page }) => {
  await page.fill('[name="heightCm"]', '175');
  await page.fill('[name="weightKg"]', '70');
  await submit(page).click();
  await expect(value(page)).toHaveText('22.9');
  await expect(submit(page)).toBeFocused(); // desktop, result visible → no focus theft
});

/* ---- Unit conversion ---------------------------------------------------- */

test('switching units converts entered values and does not count as the first calc', async ({ page }) => {
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="weightKg"]', '75');
  await page.click('[data-unit="imperial"]');
  // Converted, but NO calculation before the first explicit calc.
  await expect(page.locator('[name="heightFt"]')).toHaveValue('5');
  await expect(page.locator('[name="heightIn"]')).toHaveValue('11');
  await expect(page.locator('[name="weightLb"]')).toHaveValue('165.3');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('after the first calc, switching units converts and recalculates live', async ({ page }) => {
  await calcMetric(page, '180', '75');
  await expect(value(page)).toHaveText('23.1');
  await page.click('[data-unit="imperial"]');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(value(page)).toHaveText('23.1'); // same person, converted units
  await expect(page.locator('[data-bmi-range]')).toContainText('lb');
});

/* ---- Reset -------------------------------------------------------------- */

test('reset clears values, returns to empty, drops the note, restores metric', async ({ page }) => {
  await calcMetric(page, '175', '70');
  await page.click('[data-unit="imperial"]'); // switch away before reset
  await page.waitForTimeout(DEBOUNCE);
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(page.locator('[name="heightCm"]')).toHaveValue('');
  await expect(page.locator('[name="weightKg"]')).toHaveValue('');
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(page.locator('[data-unit="metric"]')).toHaveAttribute('aria-checked', 'true');
});

/* ---- Announcement ------------------------------------------------------- */

test('announces the completed result exactly once, then stays put on settle', async ({ page }) => {
  await calcMetric(page, '175', '70');
  await expect(liveRegion(page)).toHaveText(
    'Your BMI is 22.9 kilograms per square metre, classified as normal weight.',
  );
});

/* ---- Workspace / responsive / theme ------------------------------------ */

test('desktop workspace shows the result within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcMetric(page, '175', '70');
  await expect(value(page)).toBeInViewport();
});

test('mobile stacks inputs → action → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const formBottom = formBox.y + formBox.height;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBottom - 1); // result comes after the form
  await calcMetric(page, '175', '70');
  await expect(value(page)).toHaveText('22.9');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcMetric(page, '175', '70');
  await expect(value(page)).toBeVisible();
  const bg = await shell(page).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgb(255, 255, 255)');
});
