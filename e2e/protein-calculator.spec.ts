import { test, expect, type Page } from '@playwright/test';

/**
 * Protein calculator — R7C-1 standard-form wave (calculator #2). Body weight +
 * goal personal tool with a DOMINANT daily-protein target for the SELECTED goal
 * and a SECONDARY per-goal comparison table. Covers the doctrine end-to-end + the
 * result policy: one honest figure (the formula returns a single value per goal,
 * not a range), a real comparison table with headers, the selected goal
 * highlighted, and a concise primary-only announcement.
 */
const ROUTE = '/health/protein-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#pr-result');
const primary = (page: Page) => page.locator('#pr-result [data-result-value]');
const liveRegion = (page: Page) => page.locator('#pr-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#pr-result [data-result-when~="${when}"]`);
const gramsCell = (page: Page, key: string) => page.locator(`#pr-result [data-pr-grams="${key}"]`);
const row = (page: Page, key: string) => page.locator(`#pr-result [data-pr-row="${key}"]`);

const calcMetric = async (page: Page, kg = '75') => {
  await page.fill('[name="weightKg"]', kg);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: weight blank, goal defaulted, result empty, Calculate visible, no announcement', async ({ page }) => {
  await expect(page.locator('[name="weightKg"]')).toHaveValue('');
  await expect(page.locator('[name="goalKey"]')).toHaveValue('active'); // sensible default, not prefilled data
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(region(page, 'valid')).toBeHidden();
  await expect(submit(page)).toHaveText('Calculate Protein Needs');
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  // No COMPUTED grams on load: the primary + every goal cell hold the dash (the
  // static g/kg factor scale in the reserved-but-hidden valid region is not output).
  await expect(primary(page)).toHaveText('—');
  await expect(gramsCell(page, 'active')).toHaveText('—');
});

test('does not calculate automatically before the first submission', async ({ page }) => {
  await page.fill('[name="weightKg"]', '75');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Valid result: dominant primary + secondary goal comparison --------- */

test('valid metric result shows the selected goal target and every goal estimate', async ({ page }) => {
  await calcMetric(page, '75'); // default goal = active (1.2 g/kg)
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('90'); // 75 × 1.2
  await expect(gramsCell(page, 'sedentary')).toHaveText('60 g'); // 75 × 0.8
  await expect(gramsCell(page, 'active')).toHaveText('90 g');
  await expect(gramsCell(page, 'endurance')).toHaveText('105 g'); // 75 × 1.4
  await expect(gramsCell(page, 'strength')).toHaveText('135 g'); // 75 × 1.8
  await expect(gramsCell(page, 'cutting')).toHaveText('165 g'); // 75 × 2.2
  // The primary figure is visually DOMINANT over the comparison cells.
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await gramsCell(page, 'active').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
  await expect(page.locator('[data-live-note]')).toBeVisible();
});

test('the interpretation names the selected goal and its g/kg factor', async ({ page }) => {
  await calcMetric(page, '75');
  await expect(page.locator('#pr-result [data-pr-interpretation]')).toHaveText(
    'Based on active / general fitness at 1.2 g per kg of body weight.',
  );
});

test('the selected goal is highlighted, and only that row', async ({ page }) => {
  await calcMetric(page, '75');
  await expect(row(page, 'active')).toHaveAttribute('aria-current', 'true');
  for (const key of ['sedentary', 'endurance', 'strength', 'cutting']) {
    await expect(row(page, key)).not.toHaveAttribute('aria-current', 'true');
  }
});

test('the goal comparison is an accessible table with column + row headers', async ({ page }) => {
  await calcMetric(page, '75');
  const table = page.locator('#pr-result table.pr-goals');
  await expect(table.locator('thead th[scope="col"]')).toHaveCount(3); // Goal / Target / Protein/day
  await expect(table.locator('tbody th[scope="row"]')).toHaveCount(5); // one per goal
});

test('valid imperial result still reports grams from the converted weight', async ({ page }) => {
  await page.click('[data-unit="imperial"]');
  await page.fill('[name="weightLb"]', '176'); // ≈ 79.83 kg × 1.2 ≈ 96
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('96');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Changing the goal (protein-specific live behaviour) ---------------- */

test('changing the goal after the first calc re-targets the primary and the highlight', async ({ page }) => {
  await calcMetric(page, '75');
  await expect(primary(page)).toHaveText('90');
  await page.selectOption('[name="goalKey"]', 'strength');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('135'); // 75 × 1.8
  await expect(row(page, 'strength')).toHaveAttribute('aria-current', 'true');
  await expect(row(page, 'active')).not.toHaveAttribute('aria-current', 'true');
});

/* ---- Validation, focus, aria ------------------------------------------- */

test('an empty submission focuses the weight field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const weight = page.locator('[name="weightKg"]');
  await expect(weight).toBeFocused();
  await expect(weight).toHaveAttribute('aria-invalid', 'true');
  const errId = await weight.getAttribute('aria-describedby');
  await expect(page.locator(`#${errId}`)).toHaveText('Enter your body weight.');
});

test('a zero weight is rejected, never treated as zero grams', async ({ page }) => {
  await page.fill('[name="weightKg"]', '0');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="weightKg"]')).toHaveText('Enter a weight greater than zero.');
});

/* ---- Live-after-first + focus ------------------------------------------ */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calcMetric(page, '75');
  await expect(primary(page)).toHaveText('90');
  const w = page.locator('[name="weightKg"]');
  await w.focus();
  await w.fill('80');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('96'); // 80 × 1.2
  await expect(w).toBeFocused();
});

/* ---- Unit switching ---------------------------------------------------- */

test('switching units converts the weight and does not count as the first calc', async ({ page }) => {
  await page.fill('[name="weightKg"]', '80');
  await page.click('[data-unit="imperial"]');
  await expect(page.locator('[name="weightLb"]')).toHaveValue('176.4'); // 80 kg → lb, rounded to 0.1
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Reset -------------------------------------------------------------- */

test('reset clears weight, restores the default goal + Metric, returns to empty', async ({ page }) => {
  await calcMetric(page, '75');
  await page.selectOption('[name="goalKey"]', 'cutting');
  await page.click('[data-unit="imperial"]');
  await page.waitForTimeout(DEBOUNCE);
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(page.locator('[name="weightKg"]')).toHaveValue('');
  await expect(page.locator('[name="goalKey"]')).toHaveValue('active');
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(page.locator('[data-unit="metric"]')).toHaveAttribute('aria-checked', 'true');
});

/* ---- Announcement ------------------------------------------------------- */

test('announces the daily target concisely, never the goal table', async ({ page }) => {
  await calcMetric(page, '75');
  await expect(liveRegion(page)).toHaveText('Your estimated daily protein target is about 90 grams per day.');
  await expect(liveRegion(page)).not.toContainText(/sedentary|endurance|strength|cutting|g\/kg/i);
});

/* ---- Responsive / theme / embed / monetization ------------------------- */

test('desktop shows the result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcMetric(page, '75');
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → action → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcMetric(page, '75');
  await expect(primary(page)).toHaveText('90');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcMetric(page, '75');
  await expect(primary(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/health/protein-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="weightKg"]', '75');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#pr-result [data-result-value]')).toHaveText('90');
});

test('the guide that embeds the island renders the migrated task-first tool', async ({ page }) => {
  await page.goto('/guides/how-much-protein-do-you-need', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#pr-result')).toHaveAttribute('data-result-state', 'empty'); // empty, not a prefilled result
  await page.fill('[name="weightKg"]', '75');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#pr-result [data-result-value]')).toHaveText('90');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
