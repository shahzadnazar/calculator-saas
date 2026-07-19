import { test, expect, type Page } from '@playwright/test';

/**
 * BMR calculator — the R7B standard-form-runtime GENERALIZATION pilot, on its
 * LIVE page. Proves the shipped runtime (validated by BMI) generalizes to a
 * second standard-form calculator with a sex selector + a secondary activity
 * table. Covers the doctrine end-to-end: empty initial state, first-calc gate,
 * live-after-first, validation + focus + aria, unit conversion before/after the
 * first calc, reset, the single concise announcement, activity estimates as
 * subordinate secondary output, no NaN/∞, desktop + mobile.
 */
const ROUTE = '/health/bmr-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#bmr-result');
const value = (page: Page) => page.locator('#bmr-result [data-result-when~="valid"] [data-result-value]');
const a11y = (page: Page) => page.locator('#bmr-result [data-result-when~="valid"] [data-result-value-a11y]');
const activity = (page: Page) => page.locator('#bmr-result [data-bmr-activity]');
const liveRegion = (page: Page) => page.locator('#bmr-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#bmr-result [data-result-when~="${when}"]`);

const calcMetric = async (page: Page, age = '30', h = '180', w = '80') => {
  await page.fill('[name="age"]', age);
  await page.fill('[name="heightCm"]', h);
  await page.fill('[name="weightKg"]', w);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: fields blank, result empty, Calculate BMR visible, no announcement', async ({ page }) => {
  for (const n of ['age', 'heightCm', 'weightKg']) await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(region(page, 'valid')).toBeHidden();
  await expect(submit(page)).toBeVisible();
  await expect(submit(page)).toHaveText('Calculate BMR');
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  // No BMR number is presented as the visitor's result on load.
  await expect(shell(page)).not.toContainText(/\d,\d{3}/);
});

test('does not calculate automatically before the first submission (incl. sex/unit changes)', async ({ page }) => {
  await page.fill('[name="age"]', '30');
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="weightKg"]', '80');
  await page.check('[name="sex"][value="female"]'); // structural change must not calculate
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Valid results + activity secondary output -------------------------- */

test('valid metric result shows a dominant BMR and a secondary activity table', async ({ page }) => {
  await calcMetric(page, '30', '180', '80');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(value(page)).toHaveText('1,780'); // 10·80 + 6.25·180 − 5·30 + 5
  await expect(page.locator('[data-live-note]')).toBeVisible();
  // Five activity estimates, computed as BMR × factor (secondary output).
  await expect(activity(page)).toHaveCount(5);
  await expect(activity(page).first()).toHaveText('2,136'); // 1780 × 1.2
  await expect(activity(page).last()).toHaveText('3,382'); // 1780 × 1.9
  // The BMR figure is visually DOMINANT over the activity rows.
  const bmrSize = await value(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const actSize = await activity(page).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(bmrSize).toBeGreaterThan(actSize * 1.5);
});

test('valid imperial result computes from feet/inches/pounds', async ({ page }) => {
  await page.click('[data-unit="imperial"]');
  await page.fill('[name="age"]', '40');
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '5');
  await page.fill('[name="weightLb"]', '140');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(value(page)).toHaveText('1,472'); // Male default: base 1466.9 + 5
  await expect(activity(page)).toHaveCount(5);
});

test('the sex selector changes the result (male vs female)', async ({ page }) => {
  await calcMetric(page, '30', '180', '80');
  await expect(value(page)).toHaveText('1,780');
  await page.check('[name="sex"][value="female"]');
  await page.waitForTimeout(DEBOUNCE);
  await expect(value(page)).toHaveText('1,614'); // base 1775 − 161
});

test('exposes the value to assistive tech and never leaks NaN/∞/undefined', async ({ page }) => {
  await calcMetric(page, '30', '180', '80');
  await expect(a11y(page)).toContainText('1,780');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Validation, focus, aria ------------------------------------------- */

test('an empty submission focuses the first invalid field (age) and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const age = page.locator('[name="age"]');
  await expect(age).toBeFocused();
  await expect(age).toHaveAttribute('aria-invalid', 'true');
  const errId = await age.getAttribute('aria-describedby');
  await expect(page.locator(`#${errId}`)).toHaveText('Enter your age.');
});

test('a zero weight is rejected with distinct guidance and no NaN', async ({ page }) => {
  await calcMetric(page, '30', '180', '0');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="weightKg"]')).toHaveText('Enter a weight greater than zero.');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

test('imperial rejects 12+ inches without normalizing (accepted BMI semantics)', async ({ page }) => {
  await page.click('[data-unit="imperial"]');
  await page.fill('[name="age"]', '30');
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '14');
  await page.fill('[name="weightLb"]', '154');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="height"]')).toHaveText('Enter inches from 0 to 11.');
});

/* ---- Live-after-first --------------------------------------------------- */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calcMetric(page, '30', '180', '80');
  await expect(value(page)).toHaveText('1,780');
  const weight = page.locator('[name="weightKg"]');
  await weight.focus();
  await weight.fill('90');
  await page.waitForTimeout(DEBOUNCE);
  await expect(value(page)).toHaveText('1,880'); // +10kg → +100 kcal
  await expect(weight).toBeFocused(); // live updates never steal focus
});

/* ---- Unit conversion ---------------------------------------------------- */

test('switching units converts entered values and does not count as the first calc', async ({ page }) => {
  await page.fill('[name="age"]', '30');
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="weightKg"]', '80');
  await page.click('[data-unit="imperial"]');
  await expect(page.locator('[name="heightFt"]')).toHaveValue('5');
  await expect(page.locator('[name="heightIn"]')).toHaveValue('11');
  await expect(page.locator('[name="weightLb"]')).toHaveValue('176.4');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty'); // no calc yet
});

test('after the first calc, switching units converts and recalculates live', async ({ page }) => {
  await calcMetric(page, '30', '180', '80');
  await expect(value(page)).toHaveText('1,780');
  await page.click('[data-unit="imperial"]');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  // Same person, converted through whole-inch height → ~0.1% rounding drift.
  await expect(value(page)).toHaveText(/1,78\d/);
});

/* ---- Reset -------------------------------------------------------------- */

test('reset clears values, restores Male + Metric defaults, returns to empty', async ({ page }) => {
  await calcMetric(page, '30', '180', '80');
  await page.check('[name="sex"][value="female"]');
  await page.click('[data-unit="imperial"]');
  await page.waitForTimeout(DEBOUNCE);
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  for (const n of ['age', 'heightCm', 'weightKg']) await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(page.locator('[name="sex"][value="male"]')).toBeChecked(); // safe structural default
  await expect(page.locator('[data-unit="metric"]')).toHaveAttribute('aria-checked', 'true');
});

/* ---- Announcement (concise; never the activity table) ------------------- */

test('announces the BMR concisely and never reads the activity table', async ({ page }) => {
  await calcMetric(page, '30', '180', '80');
  await expect(liveRegion(page)).toHaveText('Your estimated basal metabolic rate is 1,780 kilocalories per day.');
  await expect(liveRegion(page)).not.toContainText(/sedentary|activity|2,136/i);
});

/* ---- Workspace / responsive / theme ------------------------------------ */

test('desktop workspace shows the result within the viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcMetric(page, '30', '180', '80');
  await expect(value(page)).toBeInViewport();
});

test('mobile stacks inputs → action → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcMetric(page, '30', '180', '80');
  await expect(value(page)).toHaveText('1,780');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcMetric(page, '30', '180', '80');
  await expect(value(page)).toBeVisible();
  const bg = await shell(page).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgb(255, 255, 255)');
});

/* ---- Embed route + monetization off ------------------------------------ */

test('the embed route mounts the same interactive BMR island', async ({ page }) => {
  await page.goto('/embed/health/bmr-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="age"]', '30');
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="weightKg"]', '80');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#bmr-result [data-result-when~="valid"] [data-result-value]')).toHaveText('1,780');
});

test('the live BMR page carries no monetization output (globally disabled)', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toContain('data-mon-');
});
