import { test, expect, type Page } from '@playwright/test';

/**
 * Body fat calculator — R7C-2A standard-form wave (calculator #3), the FIRST with
 * CONDITIONAL inputs (hip is required for women, absent for men). Covers the
 * doctrine end-to-end plus the conditional-field policy: hip visibility tracks
 * sex; switching to a sex that needs an empty measurement invalidates rather than
 * showing a stale result; the dominant percentage + TEXT classification + an
 * accessible, sex-specific category scale; a concise announcement.
 */
const ROUTE = '/health/body-fat-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#bf-result');
const primary = (page: Page) => page.locator('#bf-result [data-result-value]');
const category = (page: Page) => page.locator('#bf-result [data-bf-category]');
const liveRegion = (page: Page) => page.locator('#bf-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#bf-result [data-result-when~="${when}"]`);
const bandsTable = (page: Page) => page.locator('#bf-result table.bf-bands');
const currentBand = (page: Page) => page.locator('#bf-result [data-bf-band][aria-current="true"]');

const calcMale = async (page: Page) => {
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="neckCm"]', '38');
  await page.fill('[name="waistCm"]', '85');
  await submit(page).click();
};
const calcFemale = async (page: Page) => {
  await page.check('[name="sex"][value="female"]');
  await page.fill('[name="heightCm"]', '165');
  await page.fill('[name="neckCm"]', '34');
  await page.fill('[name="waistCm"]', '74');
  await page.fill('[name="hipCm"]', '96');
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: measurements blank, hip hidden, result empty, Calculate visible, no announcement', async ({ page }) => {
  for (const name of ['heightCm', 'neckCm', 'waistCm']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[name="hipCm"]')).toBeHidden(); // male default → hip not shown
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(region(page, 'valid')).toBeHidden();
  await expect(bandsTable(page)).toBeHidden(); // scale not positioned in the empty state
  await expect(submit(page)).toHaveText('Calculate Body Fat');
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(primary(page)).toHaveText('—');
});

test('does not calculate automatically before the first submission', async ({ page }) => {
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="neckCm"]', '38');
  await page.fill('[name="waistCm"]', '85');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Conditional field: hip is women-only ------------------------------- */

test('selecting Female reveals the hip field; Male hides it; before first calc the result stays empty', async ({ page }) => {
  await expect(page.locator('[name="hipCm"]')).toBeHidden();
  await page.check('[name="sex"][value="female"]');
  await expect(page.locator('[name="hipCm"]')).toBeVisible();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty'); // structural change only
  await page.check('[name="sex"][value="male"]');
  await expect(page.locator('[name="hipCm"]')).toBeHidden();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Valid results: every structural path ------------------------------- */

test('valid male metric result shows the dominant percentage, text category and highlighted scale row', async ({ page }) => {
  await calcMale(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('16.1');
  await expect(category(page)).toHaveText('Fitness');
  await expect(page.locator('#bf-result [data-bf-interpretation]')).toContainText('Fitness range for men');
  // The scale is an accessible table; the visitor's category is the highlighted row.
  await expect(bandsTable(page).locator('thead th[scope="col"]')).toHaveCount(2);
  await expect(bandsTable(page).locator('tbody th[scope="row"]')).toHaveCount(5);
  await expect(currentBand(page).locator('th')).toHaveText('Fitness');
  // Percentage is visually DOMINANT over the scale cells.
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await page
    .locator('#bf-result [data-bf-band-range]')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
  await expect(page.locator('[data-live-note]')).toBeVisible();
});

test('valid female metric result uses hip and reports its category', async ({ page }) => {
  await calcFemale(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('26.4');
  await expect(category(page)).toHaveText('Average');
  await expect(currentBand(page).locator('th')).toHaveText('Average');
});

test('valid male imperial result is finite and classified', async ({ page }) => {
  await page.click('[data-unit="imperial"]');
  await page.fill('[name="heightIn"]', '71');
  await page.fill('[name="neckIn"]', '15');
  await page.fill('[name="waistIn"]', '34');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText(/^\d{1,2}(\.\d)?$/); // formatNumber drops a trailing .0
  await expect(category(page)).not.toHaveText('—');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Validation, focus, aria, domain ------------------------------------ */

test('an empty explicit submission focuses the first invalid field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const height = page.locator('[name="heightCm"]');
  await expect(height).toBeFocused();
  await expect(height).toHaveAttribute('aria-invalid', 'true');
  const errId = await height.getAttribute('aria-describedby');
  await expect(page.locator(`#${errId}`)).toHaveText('Enter your height.');
});

test('the formula domain is enforced in plain language (waist must exceed neck)', async ({ page }) => {
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="neckCm"]', '40');
  await page.fill('[name="waistCm"]', '40'); // waist == neck → out of domain
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const err = page.locator('[data-error-for="waistCm"]');
  await expect(err).toHaveText('Your waist should be larger than your neck for this method.');
  await expect(err).not.toContainText(/logarithm|log10|argument/i);
});

test('a non-positive computed estimate is gated to the invalid state, never shown as a figure', async ({ page }) => {
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="neckCm"]', '38');
  await page.fill('[name="waistCm"]', '39'); // waist barely above neck → negative % from the formula
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(region(page, 'valid')).toBeHidden();
  await expect(primary(page)).toHaveText('—'); // never rendered → no negative percentage surfaced
});

/* ---- Live-after-first --------------------------------------------------- */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calcMale(page);
  await expect(primary(page)).toHaveText('16.1');
  const w = page.locator('[name="waistCm"]');
  await w.focus();
  await w.fill('95');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).not.toHaveText('16.1'); // recomputed
  await expect(w).toBeFocused();
});

/* ---- Conditional structural switch after a valid result ----------------- */

test('switching to a sex that needs an empty measurement invalidates (no stale result), then recovers', async ({ page }) => {
  await calcMale(page);
  await expect(primary(page)).toHaveText('16.1');
  // Male → Female: hip is now required but empty → invalid, and the stale male
  // result must NOT keep showing.
  await page.check('[name="sex"][value="female"]');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(region(page, 'valid')).toBeHidden();
  await expect(page.locator('[name="hipCm"]')).toBeVisible();
  // The invalid guidance does not steal focus during a live structural update.
  await expect(page.locator('[name="hipCm"]')).not.toBeFocused();
  // Provide hip → recovers to a valid female result automatically.
  await page.fill('[name="hipCm"]', '96');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

test('switching to a sex with fewer required inputs recalculates automatically', async ({ page }) => {
  await calcFemale(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  // Female → Male: hip no longer required; height/neck/waist remain valid → recompute.
  await page.check('[name="sex"][value="male"]');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(page.locator('[name="hipCm"]')).toBeHidden();
  await expect(category(page)).not.toHaveText('—');
});

/* ---- Unit switching ----------------------------------------------------- */

test('switching units converts measurements and does not count as the first calc', async ({ page }) => {
  await page.fill('[name="heightCm"]', '180');
  await page.click('[data-unit="imperial"]');
  await expect(page.locator('[name="heightIn"]')).toHaveValue('70.9'); // 180 cm → in, rounded to 0.1
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Reset -------------------------------------------------------------- */

test('reset clears measurements, restores Male + Metric + hidden hip, returns to empty', async ({ page }) => {
  await calcFemale(page);
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  for (const name of ['heightCm', 'neckCm', 'waistCm']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[name="sex"][value="male"]')).toBeChecked();
  await expect(page.locator('[data-unit="metric"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[name="hipCm"]')).toBeHidden();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Announcement ------------------------------------------------------- */

test('announces the percentage + classification concisely, never the whole scale', async ({ page }) => {
  await calcMale(page);
  await expect(liveRegion(page)).toHaveText('Your estimated body-fat percentage is 16.1 percent, classified as Fitness.');
  await expect(liveRegion(page)).not.toContainText(/essential|athletes|average|obese|under \d/i);
});

/* ---- Responsive / theme / embed / monetization ------------------------- */

test('desktop shows the result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcMale(page);
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → action → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcMale(page);
  await expect(primary(page)).toHaveText('16.1');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcMale(page);
  await expect(primary(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/health/body-fat-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="neckCm"]', '38');
  await page.fill('[name="waistCm"]', '85');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#bf-result [data-result-value]')).toHaveText('16.1');
});

test('the guide that embeds the island renders the migrated task-first tool', async ({ page }) => {
  await page.goto('/guides/body-fat-percentage-explained', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#bf-result')).toHaveAttribute('data-result-state', 'empty'); // empty, not prefilled
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="neckCm"]', '38');
  await page.fill('[name="waistCm"]', '85');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#bf-result [data-result-value]')).toHaveText('16.1');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
