import { test, expect, type Page } from '@playwright/test';

/**
 * Target heart-rate calculator — R7C-2C standard-form wave (calculator #10). Age +
 * an OPTIONAL resting heart rate; the primary result is the estimated maximum heart
 * rate, with the five training zones as an accessible comparison table. A resting
 * rate switches the reviewed function to the Karvonen (heart-rate reserve) method.
 * Covers the doctrine end-to-end plus both methods, the accessible zone table, the
 * two validation guards the migration adds (whole in-range age; resting below max),
 * and a concise announcement.
 */
const ROUTE = '/health/target-heart-rate-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#thr-result');
const primary = (page: Page) => page.locator('#thr-result [data-result-value]');
const method = (page: Page) => page.locator('#thr-result [data-thr-method]');
const methodId = (page: Page) => page.locator('#thr-result [data-thr-method-id]');
const methodLine = (page: Page) => page.locator('#thr-result .thr-method-id');
const liveRegion = (page: Page) => page.locator('#thr-live');
const submit = (page: Page) => page.locator('form[data-form] button[type="submit"]');
const region = (page: Page, when: string) => page.locator(`#thr-result [data-result-when~="${when}"]`);
const zoneRange = (page: Page, i: number) => page.locator(`#thr-result [data-thr-zone="${i}"] [data-thr-range]`);

const calcSimple = async (page: Page) => {
  await page.fill('[name="age"]', '30'); // maxHr 190, simple % (no resting)
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: fields blank, result empty, Calculate visible, no live note', async ({ page }) => {
  await expect(page.locator('[name="age"]')).toHaveValue('');
  await expect(page.locator('[name="restingHr"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  // The empty placeholder is replaced by the labelled example on load.
  await expect(region(page, 'empty')).toBeHidden();
  await expect(region(page, 'valid')).toBeVisible();
  await expect(submit(page)).toHaveText('Calculate Heart Rate Zones');
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(primary(page)).not.toHaveText('—');
});

test('does not calculate automatically before the first submission', async ({ page }) => {
  await page.fill('[name="age"]', '30');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Valid results ------------------------------------------------------ */

test('valid simple-percentage result: dominant max HR + all five zone ranges', async ({ page }) => {
  await calcSimple(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('190');
  // Simple % of maxHr 190: 50–60 / 60–70 / 70–80 / 80–90 / 90–100.
  await expect(zoneRange(page, 0)).toHaveText('95–114');
  await expect(zoneRange(page, 1)).toHaveText('114–133');
  await expect(zoneRange(page, 2)).toHaveText('133–152');
  await expect(zoneRange(page, 3)).toHaveText('152–171');
  await expect(zoneRange(page, 4)).toHaveText('171–190');
  // Visible method identity — a simple-percentage result is never labelled Karvonen.
  await expect(methodId(page)).toHaveText('Percentage of estimated maximum heart rate');
  await expect(methodLine(page)).toContainText('Method: Percentage of estimated maximum heart rate');
  await expect(page.locator('[data-live-note]')).toBeVisible();
  // The max HR is visually DOMINANT over the zone cells.
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await zoneRange(page, 0).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
});

test('a resting heart rate switches to the Karvonen method and re-computes the zones', async ({ page }) => {
  await page.fill('[name="age"]', '30');
  await page.fill('[name="restingHr"]', '60');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('190'); // maxHr unchanged
  await expect(zoneRange(page, 0)).toHaveText('125–138'); // Karvonen: round((190−60)·pct + 60)
  await expect(zoneRange(page, 4)).toHaveText('177–190');
  await expect(methodId(page)).toHaveText('Karvonen heart-rate-reserve method');
  await expect(method(page)).toContainText('Personalised using your resting heart rate of 60 bpm');
});

test('the zone table is an accessible data table (caption + column + row headers)', async ({ page }) => {
  await calcSimple(page);
  await expect(page.locator('#thr-result table caption')).toHaveText(
    'Estimated heart-rate zones based on the selected calculation method.',
  );
  const colHeaders = page.locator('#thr-result table thead th');
  await expect(colHeaders).toHaveCount(3);
  await expect(colHeaders.nth(0)).toHaveAttribute('scope', 'col');
  await expect(colHeaders.nth(0)).toHaveText('Zone');
  await expect(colHeaders.nth(1)).toHaveText('Intensity');
  await expect(colHeaders.nth(2)).toHaveText('Heart rate');
  const firstRowHeader = page.locator('#thr-result table tbody tr').first().locator('th');
  await expect(firstRowHeader).toHaveAttribute('scope', 'row');
  await expect(firstRowHeader).toHaveText('Warm up / recovery');
});

/* ---- Method switching after the first result (R7C-2C.1) ----------------- */

test('adding a resting HR after a simple result switches to Karvonen, announces the change, keeps focus', async ({ page }) => {
  await calcSimple(page); // simple method first
  await expect(methodId(page)).toHaveText('Percentage of estimated maximum heart rate');
  const rest = page.locator('[name="restingHr"]');
  await rest.focus();
  await rest.fill('60');
  await page.waitForTimeout(DEBOUNCE);
  // Recomputed to Karvonen automatically…
  await expect(methodId(page)).toHaveText('Karvonen heart-rate-reserve method');
  await expect(zoneRange(page, 0)).toHaveText('125–138');
  // …focus stayed on the resting-HR field (live updates never move focus)…
  await expect(rest).toBeFocused();
  // …and exactly the concise method-change line was announced (not the table).
  await expect(liveRegion(page)).toHaveText(
    'Target heart-rate zones updated using the Karvonen heart-rate-reserve method.',
  );
  await expect(liveRegion(page)).not.toContainText(/Fat burn|Aerobic|Warm up/);
});

test('clearing the resting HR after a Karvonen result switches back to simple, announces the change, keeps focus', async ({ page }) => {
  await page.fill('[name="age"]', '30');
  await page.fill('[name="restingHr"]', '60');
  await submit(page).click(); // Karvonen first
  await expect(methodId(page)).toHaveText('Karvonen heart-rate-reserve method');
  const rest = page.locator('[name="restingHr"]');
  await rest.focus();
  await rest.fill(''); // clear it
  await page.waitForTimeout(DEBOUNCE);
  await expect(methodId(page)).toHaveText('Percentage of estimated maximum heart rate');
  await expect(zoneRange(page, 0)).toHaveText('95–114'); // simple again
  await expect(rest).toBeFocused();
  await expect(liveRegion(page)).toHaveText(
    'Target heart-rate zones updated using the percentage of maximum heart rate method.',
  );
});

test('an invalid update announces the error, not a method change; the next valid switch compares against the last valid result', async ({ page }) => {
  await calcSimple(page); // simple result committed
  const rest = page.locator('[name="restingHr"]');
  await rest.focus();
  await rest.fill('190'); // resting ≥ max 190 → live update becomes invalid (no method-change)
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(liveRegion(page)).not.toContainText('updated using');
  // A valid resting HR now switches to Karvonen, comparing against the last VALID (simple).
  await rest.fill('60');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(liveRegion(page)).toHaveText(
    'Target heart-rate zones updated using the Karvonen heart-rate-reserve method.',
  );
});

test('the first result after Reset uses the first-result announcement, not a method-change line', async ({ page }) => {
  await page.fill('[name="age"]', '30');
  await page.fill('[name="restingHr"]', '60');
  await submit(page).click(); // Karvonen
  await page.click('[data-reset]');
  await calcSimple(page); // a fresh simple calculation after reset
  await expect(liveRegion(page)).toHaveText(
    'Your estimated maximum heart rate is 190 beats per minute. Training zones span 95 to 190 beats per minute.',
  );
  await expect(liveRegion(page)).not.toContainText('updated using');
});

/* ---- Announcement ------------------------------------------------------- */

test('announces the max HR and span concisely, not the full table', async ({ page }) => {
  await calcSimple(page);
  await expect(liveRegion(page)).toHaveText(
    'Your estimated maximum heart rate is 190 beats per minute. Training zones span 95 to 190 beats per minute.',
  );
  await expect(liveRegion(page)).not.toContainText(/Fat burn|Aerobic|Anaerobic/);
});

test('names the Karvonen method in the announcement when a resting rate is used', async ({ page }) => {
  await page.fill('[name="age"]', '30');
  await page.fill('[name="restingHr"]', '60');
  await submit(page).click();
  await expect(liveRegion(page)).toContainText('using the Karvonen method with your resting heart rate');
});

/* ---- Validation, focus, aria -------------------------------------------- */

test('an empty explicit submission focuses the age field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const age = page.locator('[name="age"]');
  await expect(age).toBeFocused();
  await expect(age).toHaveAttribute('aria-invalid', 'true');
  const errId = (await age.getAttribute('aria-describedby'))!.split(/\s+/).pop();
  await expect(page.locator(`#${errId}`)).toHaveText('Enter your age.');
});

test('a non-whole age is rejected with clear guidance', async ({ page }) => {
  await page.fill('[name="age"]', '30.5');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="age"]')).toHaveText('Enter your age in whole years.');
});

test('a resting heart rate at or above the maximum is rejected (guards against inverted zones)', async ({ page }) => {
  await page.fill('[name="age"]', '30'); // maxHr 190
  await page.fill('[name="restingHr"]', '190');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="restingHr"]')).toHaveText(
    'Enter a resting heart rate below your maximum of 190 bpm.',
  );
  await expect(page.locator('[name="restingHr"]')).toHaveAttribute('aria-invalid', 'true');
});

test('an entered resting HR of 0 is invalid — not treated as empty', async ({ page }) => {
  await page.fill('[name="age"]', '30');
  await page.fill('[name="restingHr"]', '0');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="restingHr"]')).toHaveText(
    'Enter a resting heart rate greater than zero, or leave it blank.',
  );
});

test('age 219 is accepted but 220 is rejected (max HR would be 0; no narrower cap)', async ({ page }) => {
  await page.fill('[name="age"]', '219');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('1'); // 220 − 219
  await page.fill('[name="age"]', '220');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="age"]')).toHaveText('Enter an age below 220 years.');
});

/* ---- Live-after-first --------------------------------------------------- */

test('updates automatically after the first success, without moving focus', async ({ page }) => {
  await calcSimple(page);
  await expect(primary(page)).toHaveText('190');
  const age = page.locator('[name="age"]');
  await age.focus();
  await age.fill('50'); // maxHr 170
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('170');
  await expect(age).toBeFocused();
});

/* ---- Reset -------------------------------------------------------------- */

test('reset clears both fields and returns to empty', async ({ page }) => {
  await page.fill('[name="age"]', '30');
  await page.fill('[name="restingHr"]', '60');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await page.click('[data-reset]');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(page.locator('[name="age"]')).toHaveValue('');
  await expect(page.locator('[name="restingHr"]')).toHaveValue('');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Responsive / theme / embed / monetization ------------------------- */

test('desktop shows the result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcSimple(page);
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcSimple(page);
  await expect(primary(page)).toHaveText('190');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcSimple(page);
  await expect(primary(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/health/target-heart-rate-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="age"]', '30');
  await page.locator('form[data-form] button[type="submit"]').click();
  await expect(page.locator('#thr-result [data-result-value]')).toHaveText('190');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
