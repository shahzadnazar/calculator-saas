import { test, expect, type Page } from '@playwright/test';

/**
 * Ideal-weight calculator — R7C-1 standard-form wave (calculator #1). Height-only
 * personal tool with a DOMINANT healthy-BMI range + a SECONDARY four-formula
 * comparison. Covers the doctrine end-to-end + the multi-formula policy: a real
 * comparison table (with headers), no fabricated average, concise range
 * announcement.
 */
const ROUTE = '/health/ideal-weight-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#iw-result');
const rangeMin = (page: Page) => page.locator('#iw-result [data-iw-bmimin]');
const rangeMax = (page: Page) => page.locator('#iw-result [data-iw-bmimax]');
const liveRegion = (page: Page) => page.locator('#iw-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#iw-result [data-result-when~="${when}"]`);

const calcMetric = async (page: Page, cm = '175') => {
  await page.fill('[name="heightCm"]', cm);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: height blank, result empty, Calculate visible, no announcement', async ({ page }) => {
  await expect(page.locator('[name="heightCm"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  // The empty placeholder is replaced by the labelled example on load.
  await expect(region(page, 'empty')).toBeHidden();
  await expect(region(page, 'valid')).toBeVisible();
  await expect(submit(page)).toHaveText('Calculate Ideal Weight');
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  // Weights ARE shown on load — they belong to the labelled example, not the visitor.
});

test('does not calculate automatically before the first submission', async ({ page }) => {
  await page.fill('[name="heightCm"]', '175');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Valid results: dominant range + secondary formula comparison ------- */

test('valid metric result shows a dominant healthy range and four formula estimates', async ({ page }) => {
  await calcMetric(page, '175');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(rangeMin(page)).toHaveText('56.7');
  await expect(rangeMax(page)).toHaveText('76.3');
  await expect(page.locator('[data-iw-unit]').first()).toHaveText('kg');
  await expect(page.locator('[data-iw-robinson]')).toHaveText('68.9 kg');
  await expect(page.locator('[data-iw-devine]')).toHaveText('70.5 kg');
  await expect(page.locator('[data-iw-hamwi]')).toHaveText('72 kg'); // formatNumber drops the trailing .0
  // The range figure is visually DOMINANT over the formula table cells.
  const rangeSize = await rangeMin(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await page.locator('[data-iw-robinson]').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(rangeSize).toBeGreaterThan(cellSize * 1.5);
  await expect(page.locator('[data-live-note]')).toBeVisible();
});

test('the formula comparison is an accessible table with column + row headers', async ({ page }) => {
  await calcMetric(page, '175');
  const table = page.locator('#iw-result table.iw-formulas');
  await expect(table.locator('thead th[scope="col"]')).toHaveCount(2);
  await expect(table.locator('tbody th[scope="row"]')).toHaveCount(4); // Robinson/Miller/Devine/Hamwi
});

test('valid imperial result reports pounds', async ({ page }) => {
  await page.click('[data-unit="imperial"]');
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '9');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(page.locator('[data-iw-unit]').first()).toHaveText('lb');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Validation, focus, aria ------------------------------------------- */

test('an empty submission focuses the height field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const height = page.locator('[name="heightCm"]');
  await expect(height).toBeFocused();
  await expect(height).toHaveAttribute('aria-invalid', 'true');
  const errId = await height.getAttribute('aria-describedby');
  await expect(page.locator(`#${errId}`)).toHaveText('Enter your height.');
});

test('imperial rejects 12+ inches without normalizing', async ({ page }) => {
  await page.click('[data-unit="imperial"]');
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '13');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="height"]')).toHaveText('Enter inches from 0 to 11.');
});

/* ---- Live-after-first + focus ------------------------------------------ */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calcMetric(page, '175');
  await expect(rangeMax(page)).toHaveText('76.3');
  const h = page.locator('[name="heightCm"]');
  await h.focus();
  await h.fill('185');
  await page.waitForTimeout(DEBOUNCE);
  await expect(rangeMax(page)).toHaveText('85.2'); // 24.9 × 1.85²
  await expect(h).toBeFocused();
});

/* ---- Unit switching ---------------------------------------------------- */

test('switching units converts the height and does not count as the first calc', async ({ page }) => {
  await page.fill('[name="heightCm"]', '175');
  await page.click('[data-unit="imperial"]');
  await expect(page.locator('[name="heightFt"]')).toHaveValue('5');
  await expect(page.locator('[name="heightIn"]')).toHaveValue('9');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Reset -------------------------------------------------------------- */

test('reset clears height, restores Male + Metric, returns to empty', async ({ page }) => {
  await calcMetric(page, '175');
  await page.check('[name="sex"][value="female"]');
  await page.click('[data-unit="imperial"]');
  await page.waitForTimeout(DEBOUNCE);
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(page.locator('[name="heightCm"]')).toHaveValue('');
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(page.locator('[name="sex"][value="male"]')).toBeChecked();
  await expect(page.locator('[data-unit="metric"]')).toHaveAttribute('aria-checked', 'true');
});

/* ---- Announcement ------------------------------------------------------- */

test('announces the healthy range concisely on the first result, never the formula table', async ({ page }) => {
  await calcMetric(page, '175');
  await expect(liveRegion(page)).toHaveText('Your healthy-weight range is approximately 56.7 to 76.3 kilograms.');
  await expect(liveRegion(page)).not.toContainText(/robinson|devine|68\.9/i);
});

test('changing sex after the first result updates the formulas, keeps the range, and announces the update without moving focus', async ({ page }) => {
  await calcMetric(page, '175'); // male
  await expect(rangeMin(page)).toHaveText('56.7');
  await expect(rangeMax(page)).toHaveText('76.3');
  const maleDevine = await page.locator('[data-iw-devine]').textContent();

  // Change sex — a real radio, so a live-after-first update whose PRIMARY range
  // (BMI-based, height-only) is identical while the named formulas move.
  const female = page.locator('[name="sex"][value="female"]');
  await female.check();
  await page.waitForTimeout(DEBOUNCE);

  // Formula estimates change…
  await expect(page.locator('[data-iw-devine]')).not.toHaveText(maleDevine!);
  // …the primary healthy range is unchanged and still correct…
  await expect(rangeMin(page)).toHaveText('56.7');
  await expect(rangeMax(page)).toHaveText('76.3');
  // …focus stays on the selected radio (live updates never steal focus)…
  await expect(female).toBeFocused();
  // …and exactly one concise announcement notes the update, never the formula rows.
  await expect(liveRegion(page)).toHaveText(
    'Healthy-weight range: 56.7 to 76.3 kilograms. Formula estimates updated for female.',
  );
  await expect(liveRegion(page)).not.toContainText(/robinson|miller|devine|hamwi/i);
});

/* ---- Responsive / theme / embed / monetization ------------------------- */

test('desktop shows the result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcMetric(page, '175');
  await expect(rangeMin(page)).toBeInViewport();
});

test('mobile stacks inputs → action → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcMetric(page, '175');
  await expect(rangeMax(page)).toHaveText('76.3');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcMetric(page, '175');
  await expect(rangeMin(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/health/ideal-weight-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="heightCm"]', '175');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#iw-result [data-iw-bmimax]')).toHaveText('76.3');
});

test('the guide that embeds the island renders the migrated task-first tool', async ({ page }) => {
  await page.goto('/guides/healthy-weight-for-your-height', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#iw-result')).toHaveAttribute('data-result-state', 'example'); // empty, not a prefilled result
  await page.fill('[name="heightCm"]', '175');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#iw-result [data-iw-bmimax]')).toHaveText('76.3');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
