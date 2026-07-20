import { test, expect, type Page } from '@playwright/test';

/**
 * Calorie / TDEE calculator — R7C-2B standard-form wave (calculator #4). Personal
 * BMR inputs + activity + a GOAL selector that picks the dominant daily target
 * from the reviewed figures (maintenance ± the existing goal deltas). Covers the
 * doctrine end-to-end plus the activity/goal structural semantics, the accurate
 * BMR vs maintenance (TDEE) vs target language, the goal comparison, and a concise
 * selected-goal announcement.
 */
const ROUTE = '/health/calorie-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#cal-result');
const primary = (page: Page) => page.locator('#cal-result [data-result-value]');
const goalLabel = (page: Page) => page.locator('#cal-result [data-cal-goal-label]');
const maintenance = (page: Page) => page.locator('#cal-result [data-cal-maintenance]');
const bmr = (page: Page) => page.locator('#cal-result [data-cal-bmr]');
const liveRegion = (page: Page) => page.locator('#cal-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#cal-result [data-result-when~="${when}"]`);
const goalVal = (page: Page, key: string) => page.locator(`#cal-result [data-cal-row="${key}"] [data-cal-goalval]`);
const currentRow = (page: Page) => page.locator('#cal-result [data-cal-row][aria-current="true"]');

const calcMale = async (page: Page) => {
  await page.fill('[name="age"]', '30');
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="weightKg"]', '80');
  await submit(page).click(); // default activity 1.55 (Moderate), goal maintain
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: personal fields blank, structural defaults set, result empty, Calculate visible', async ({ page }) => {
  for (const name of ['age', 'heightCm', 'weightKg']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[name="activity"]')).toHaveValue('1.55'); // Moderate default
  await expect(page.locator('[name="goalKey"]')).toHaveValue('maintain');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(region(page, 'valid')).toBeHidden();
  await expect(submit(page)).toHaveText('Calculate Calorie Needs');
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(primary(page)).toHaveText('—');
});

test('does not calculate automatically before the first submission', async ({ page }) => {
  await page.fill('[name="age"]', '30');
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="weightKg"]', '80');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

test('changing activity or goal before the first calc updates only the control, not the result', async ({ page }) => {
  await page.selectOption('[name="activity"]', '1.2');
  await page.selectOption('[name="goalKey"]', 'loss');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Valid results ------------------------------------------------------ */

test('valid metric result: dominant target, maintenance + BMR references, goal comparison', async ({ page }) => {
  await calcMale(page); // maintain @ activity 1.55 → maintenance = round(1780×1.55) = 2,759
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('2,759');
  await expect(goalLabel(page)).toHaveText('Maintain weight');
  await expect(maintenance(page)).toHaveText('2,759');
  await expect(bmr(page)).toHaveText('1,780');
  // Goal comparison values (preserved figures).
  await expect(goalVal(page, 'maintain')).toHaveText('2,759');
  await expect(goalVal(page, 'loss')).toHaveText('2,259'); // -500
  await expect(goalVal(page, 'gain')).toHaveText('3,259'); // +500
  await expect(currentRow(page).locator('th')).toContainText('Maintain weight');
  // The target is visually DOMINANT over the comparison cells.
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await goalVal(page, 'loss').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
  await expect(page.locator('[data-live-note]')).toBeVisible();
});

test('valid imperial result is finite and positive', async ({ page }) => {
  await page.click('[data-unit="imperial"]');
  await page.fill('[name="age"]', '25');
  await page.fill('[name="heightFt"]', '5');
  await page.fill('[name="heightIn"]', '11');
  await page.fill('[name="weightLb"]', '176');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText(/^[\d,]+$/);
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined|-\d/);
});

/* ---- Activity + goal structural changes (after first result) ------------ */

test('changing activity after the first result recalculates', async ({ page }) => {
  await calcMale(page);
  await expect(primary(page)).toHaveText('2,759');
  await page.selectOption('[name="activity"]', '1.2'); // Sedentary → round(1780×1.2) = 2,136
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('2,136');
  await expect(maintenance(page)).toHaveText('2,136');
});

test('changing goal after the first result re-targets the primary, keeps maintenance as the reference, and announces once', async ({ page }) => {
  await calcMale(page);
  await expect(primary(page)).toHaveText('2,759');
  const goalSel = page.locator('[name="goalKey"]');
  await goalSel.focus();
  await goalSel.selectOption('loss');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('2,259'); // the loss target is now dominant…
  await expect(maintenance(page)).toHaveText('2,759'); // …maintenance stays the reference
  await expect(goalLabel(page)).toHaveText('Weight loss (−500 kcal/day)');
  await expect(currentRow(page).locator('th')).toContainText('Weight loss');
  // focus stays on the changed control (the runtime never moves focus on a live update)
  expect(await page.evaluate(() => document.activeElement?.getAttribute('name'))).toBe('goalKey');
  await expect(liveRegion(page)).toHaveText(
    'Your estimated daily calorie target for weight loss is 2,259 kilocalories per day.',
  );
});

/* ---- Validation, focus, aria -------------------------------------------- */

test('an empty explicit submission focuses the first invalid field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const age = page.locator('[name="age"]');
  await expect(age).toBeFocused();
  await expect(age).toHaveAttribute('aria-invalid', 'true');
  const errId = await age.getAttribute('aria-describedby');
  await expect(page.locator(`#${errId}`)).toHaveText('Enter your age.');
});

/* ---- Live-after-first --------------------------------------------------- */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calcMale(page);
  await expect(primary(page)).toHaveText('2,759');
  const w = page.locator('[name="weightKg"]');
  await w.focus();
  await w.fill('90');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).not.toHaveText('2,759');
  await expect(w).toBeFocused();
});

/* ---- Unit switching ----------------------------------------------------- */

test('switching units converts height + weight and does not count as the first calc', async ({ page }) => {
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="weightKg"]', '80');
  await page.click('[data-unit="imperial"]');
  await expect(page.locator('[name="heightFt"]')).toHaveValue('5');
  await expect(page.locator('[name="heightIn"]')).toHaveValue('11');
  await expect(page.locator('[name="weightLb"]')).toHaveValue('176.4');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Reset -------------------------------------------------------------- */

test('reset clears personal inputs, restores Male / Metric / Moderate / Maintain, returns to empty', async ({ page }) => {
  await calcMale(page);
  await page.selectOption('[name="activity"]', '1.9');
  await page.selectOption('[name="goalKey"]', 'gain');
  await page.check('[name="sex"][value="female"]');
  await page.waitForTimeout(DEBOUNCE);
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  for (const name of ['age', 'heightCm', 'weightKg']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[name="sex"][value="male"]')).toBeChecked();
  await expect(page.locator('[data-unit="metric"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[name="activity"]')).toHaveValue('1.55');
  await expect(page.locator('[name="goalKey"]')).toHaveValue('maintain');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Announcement + no non-positive ------------------------------------ */

test('announces the selected goal target concisely, never the comparison', async ({ page }) => {
  await calcMale(page);
  await expect(liveRegion(page)).toHaveText(
    'Your estimated daily calorie target for maintaining weight is 2,759 kilocalories per day.',
  );
  await expect(liveRegion(page)).not.toContainText(/mild|1,780|bmr/i);
});

test('renders no non-positive calorie value anywhere in the result', async ({ page }) => {
  await calcMale(page);
  const text = (await shell(page).innerText()).replace(/[—–]/g, '');
  expect(text).not.toMatch(/-\s?\d/); // no negative numbers
  for (const key of ['maintain', 'mild-loss', 'loss', 'mild-gain', 'gain']) {
    await expect(goalVal(page, key)).toHaveText(/^[\d,]+$/); // every goal value is a positive number
  }
});

/* ---- Non-positive comparison handling (R7C-2B.1) ------------------------ */

// Tiny-but-valid inputs: maintenance is positive, but the −500 loss goal is
// non-positive. age 80 / 100 cm / 10 kg @ sedentary → maintenance ≈ 396, loss < 0.
const fillEdge = async (page: Page) => {
  await page.fill('[name="age"]', '80');
  await page.fill('[name="heightCm"]', '100');
  await page.fill('[name="weightKg"]', '10');
  await page.selectOption('[name="activity"]', '1.2');
};

test('an unselected non-positive goal shows "Not available" (never a dash/zero/negative) with an accessible explanation', async ({ page }) => {
  await fillEdge(page); // goal stays maintain (positive) → valid result
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText(/^[\d,]+$/); // the selected maintain target is a positive number
  const lossCell = page.locator('#cal-result [data-cal-row="loss"] [data-cal-goalval]');
  await expect(lossCell).toHaveText('Not available');
  // The accessible explanation is inside the same cell.
  await expect(page.locator('#cal-result [data-cal-row="loss"]')).toContainText(
    'This goal does not produce a usable positive calorie estimate for these inputs.',
  );
  // No dash, zero or negative surfaced in the comparison.
  await expect(lossCell).not.toHaveText('—');
});

test('selecting the non-positive goal makes the result invalid, not another goal shown as the result', async ({ page }) => {
  await fillEdge(page);
  await page.selectOption('[name="goalKey"]', 'loss'); // the underwater goal
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(region(page, 'valid')).toBeHidden();
  await expect(page.locator('#cal-result [data-result-invalid-message]')).toContainText(
    'These details do not produce a usable calorie estimate. Check your entries and try again.',
  );
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
  await expect(primary(page)).toHaveText('2,759');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcMale(page);
  await expect(primary(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/health/calorie-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="age"]', '30');
  await page.fill('[name="heightCm"]', '180');
  await page.fill('[name="weightKg"]', '80');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#cal-result [data-result-value]')).toHaveText('2,759');
});

// These guides embed BOTH the BMI and Calorie islands, so scope to the calorie
// island to avoid matching the BMI form's shared field names.
for (const guide of ['complete-guide-to-healthy-weight', 'bmi-bmr-and-calories-explained']) {
  test(`the guide that embeds the island (${guide}) renders the migrated task-first tool`, async ({ page }) => {
    await page.goto(`/guides/${guide}`, { waitUntil: 'domcontentloaded' });
    const island = page.locator('[data-calorie]');
    await expect(page.locator('#cal-result')).toHaveAttribute('data-result-state', 'empty'); // empty, not prefilled
    await island.locator('[name="age"]').fill('30');
    await island.locator('[name="heightCm"]').fill('180');
    await island.locator('[name="weightKg"]').fill('80');
    await island.locator('form[data-form] button[type="submit"]').click();
    await expect(page.locator('#cal-result [data-result-value]')).toHaveText('2,759');
  });
}

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
