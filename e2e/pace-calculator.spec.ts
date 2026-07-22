import { test, expect, type Page } from '@playwright/test';

/**
 * Pace calculator — R7C-2E1 standard-form wave (calculator #12). SINGLE-MODE:
 * distance + a composite h:m:s elapsed time → the SELECTED-UNIT pace (dominant) with
 * secondary pace/speed conversions and equivalent finish times. The km/mi control is
 * the runtime's unit selector and CONVERTS the entered distance. Covers the doctrine
 * end-to-end plus the composite-time validation, the converting unit selector, the
 * selected-unit result hierarchy, and the equivalent-finish-time wording.
 */
const ROUTE = '/health/pace-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#pc-result');
const primary = (page: Page) => page.locator('#pc-result [data-result-value]');
const primaryUnit = (page: Page) => page.locator('#pc-result [data-result-when~="valid"] [data-result-unit]');
const otherPace = (page: Page) => page.locator('#pc-result [data-pc-otherpace]');
const otherPaceLabel = (page: Page) => page.locator('#pc-result [data-pc-otherpace-label]');
const speed1 = (page: Page) => page.locator('#pc-result [data-pc-speed1]');
const speed2 = (page: Page) => page.locator('#pc-result [data-pc-speed2]');
const liveRegion = (page: Page) => page.locator('#pc-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#pc-result [data-result-when~="${when}"]`);
const raceTime = (page: Page, i: number) => page.locator(`#pc-result [data-pc-race="${i}"] [data-pc-race-time]`);

const calcKm = async (page: Page) => {
  await page.fill('[name="distance"]', '5');
  await page.fill('[name="m"]', '25'); // 5 km in 25:00 → 5:00 /km
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: fields blank, unit km, result empty, Calculate visible, no live note', async ({ page }) => {
  for (const name of ['distance', 'h', 'm', 's']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[data-unit="km"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-unit="mi"]')).toHaveAttribute('aria-checked', 'false');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(region(page, 'valid')).toBeHidden();
  await expect(submit(page)).toHaveText('Calculate Pace');
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(primary(page)).toHaveText('—');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="distance"]', '5');
  await page.fill('[name="m"]', '25');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Valid results ------------------------------------------------------ */

test('valid kilometre result: dominant pace/km, secondary pace/mi + both speeds, finish times', async ({ page }) => {
  await calcKm(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('5:00');
  await expect(primaryUnit(page)).toHaveText('/km');
  await expect(otherPaceLabel(page)).toHaveText('Pace per mile');
  await expect(otherPace(page)).toHaveText('8:03 /mi');
  await expect(speed1(page)).toHaveText('12.0 km/h'); // primary-unit-aligned speed first
  await expect(speed2(page)).toHaveText('7.5 mph');
  await expect(raceTime(page, 0)).toHaveText('25:00'); // 5K equals the input
  await expect(raceTime(page, 1)).toHaveText('50:00'); // 10K
  await expect(page.locator('[data-live-note]')).toBeVisible();
  // The dominant pace is visually larger than the secondary metrics.
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await speed1(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
});

test('valid mile result: the dominant pace follows the selected unit (per mile)', async ({ page }) => {
  await page.click('[data-unit="mi"]');
  await page.fill('[name="distance"]', '5'); // 5 mi in 25:00 → 5:00 /mi
  await page.fill('[name="m"]', '25');
  await submit(page).click();
  await expect(primary(page)).toHaveText('5:00');
  await expect(primaryUnit(page)).toHaveText('/mi');
  await expect(otherPaceLabel(page)).toHaveText('Pace per kilometre');
  await expect(otherPace(page)).toHaveText('3:06 /km');
  await expect(speed1(page)).toHaveText('12.0 mph'); // mile-aligned speed first
  await expect(speed2(page)).toHaveText('19.3 km/h');
});

test('the elapsed-time inputs are a labelled fieldset group (Hours / Minutes / Seconds)', async ({ page }) => {
  await expect(page.locator('form[data-form] fieldset legend')).toHaveText('Elapsed time');
  await expect(page.locator('label[for="pc-h"]')).toHaveText('Hours');
  await expect(page.locator('label[for="pc-m"]')).toHaveText('Minutes');
  await expect(page.locator('label[for="pc-s"]')).toHaveText('Seconds');
});

test('the equivalent-finish-time table is accessible (caption + column + row headers)', async ({ page }) => {
  await calcKm(page);
  await expect(page.locator('#pc-result table caption')).toHaveText(
    'Equivalent times if you hold this pace for the full distance.',
  );
  const cols = page.locator('#pc-result table thead th');
  await expect(cols).toHaveCount(2);
  await expect(cols.nth(0)).toHaveText('Distance');
  await expect(cols.nth(1)).toHaveText('Equivalent time');
  const firstRow = page.locator('#pc-result table tbody tr').first().locator('th');
  await expect(firstRow).toHaveAttribute('scope', 'row');
  await expect(firstRow).toHaveText('5K');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty explicit submission focuses the distance field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const dist = page.locator('[name="distance"]');
  await expect(dist).toBeFocused();
  await expect(dist).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="distance"]')).toHaveText('Enter a distance.');
});

test('minutes and seconds of 60 are rejected (never normalised)', async ({ page }) => {
  await page.fill('[name="distance"]', '5');
  await page.fill('[name="m"]', '60');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="m"]')).toHaveText('Enter whole minutes from 0 to 59.');
  await page.fill('[name="m"]', '5');
  await page.fill('[name="s"]', '60');
  await submit(page).click();
  await expect(page.locator('[data-error-for="s"]')).toHaveText('Enter whole seconds from 0 to 59.');
});

test('a zero total elapsed time is rejected', async ({ page }) => {
  await page.fill('[name="distance"]', '5'); // time all empty → total 0
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="time"]')).toHaveText('Enter an elapsed time greater than zero.');
});

/* ---- Live-after-first --------------------------------------------------- */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calcKm(page);
  await expect(primary(page)).toHaveText('5:00');
  const mins = page.locator('[name="m"]');
  await mins.focus();
  await mins.fill('20'); // 5 km in 20:00 → 4:00 /km
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('4:00');
  await expect(mins).toBeFocused();
});

/* ---- Distance-unit conversion ------------------------------------------- */

test('switching units before the first result converts the distance and does not calculate', async ({ page }) => {
  await page.fill('[name="distance"]', '5');
  await page.click('[data-unit="mi"]');
  await expect(page.locator('[name="distance"]')).toHaveValue('3.107'); // 5 / 1.609344
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

test('switching units on an empty distance leaves it empty with no error', async ({ page }) => {
  await page.click('[data-unit="mi"]');
  await expect(page.locator('[name="distance"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('switching units after a result converts, recalculates, keeps focus on the selector, announces once', async ({ page }) => {
  await calcKm(page); // 5 km → 5:00 /km
  await expect(primary(page)).toHaveText('5:00');
  await page.click('[data-unit="mi"]');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[name="distance"]')).toHaveValue('3.107');
  await expect(primary(page)).toHaveText('8:03'); // now dominant per-mile pace
  await expect(primaryUnit(page)).toHaveText('/mi');
  await expect(page.locator('[data-unit="mi"]')).toBeFocused();
  await expect(liveRegion(page)).toHaveText('Your pace is 8 minutes and 3 seconds per mile.');
});

test('a unit round trip returns a stable distance value', async ({ page }) => {
  await page.fill('[name="distance"]', '5');
  await page.click('[data-unit="mi"]');
  await expect(page.locator('[name="distance"]')).toHaveValue('3.107');
  await page.click('[data-unit="km"]');
  await expect(page.locator('[name="distance"]')).toHaveValue('5');
});

/* ---- Reset -------------------------------------------------------------- */

test('reset clears fields, restores km, returns to empty', async ({ page }) => {
  await page.click('[data-unit="mi"]');
  await calcKm(page); // fills distance 5, m 25 in mi mode
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  for (const name of ['distance', 'h', 'm', 's']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[data-unit="km"]')).toHaveAttribute('aria-checked', 'true');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Announcement + integrity ------------------------------------------- */

test('announces the dominant pace concisely, never the speeds or the finish-time table', async ({ page }) => {
  await calcKm(page);
  await expect(liveRegion(page)).toHaveText('Your pace is 5 minutes per kilometre.');
  await expect(liveRegion(page)).not.toContainText(/km\/h|mph|5K|10K|Marathon/);
});

test('renders no NaN / Infinity / undefined / malformed duration', async ({ page }) => {
  await calcKm(page);
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
  await expect(primary(page)).toHaveText(/^\d+:\d{2}$/);
});

/* ---- Responsive / theme / embed / monetization ------------------------- */

test('desktop shows the primary pace within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcKm(page);
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcKm(page);
  await expect(primary(page)).toHaveText('5:00');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcKm(page);
  await expect(primary(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/health/pace-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="distance"]', '5');
  await page.fill('[name="m"]', '25');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#pc-result [data-result-value]')).toHaveText('5:00');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
