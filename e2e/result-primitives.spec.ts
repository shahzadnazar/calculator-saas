import { test, expect, type Page } from '@playwright/test';

/**
 * Coverage for the shared result primitives + state machine (R1), exercised in
 * isolation on the internal /dev/result demo. No calculator, no formula — this
 * validates the primitives' rendering, the CSS state switching, result
 * dominance, accessible units, the single live announcement, the focus rules,
 * dimensional stability, theming and mobile behaviour.
 *
 * At live integration these behaviours are re-asserted on real calculator pages;
 * this file guards the primitives themselves.
 */
const ROUTE = '/dev/result';

const shell = (page: Page) => page.locator('#demo-shell');
const region = (page: Page, when: string) => page.locator(`#demo-shell [data-result-when~="${when}"]`);
const control = (page: Page, action: string) => page.locator(`button[data-demo-action="${action}"]`);
const live = (page: Page) => page.locator('#demo-live');
const fontPx = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- State rendering + CSS switching ------------------------------------ */

test('empty is the initial state and shows the instruction, not a sample result', async ({ page }) => {
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(region(page, 'empty')).toContainText('height and weight');
  // No answer surfaced before the visitor acts.
  await expect(region(page, 'valid')).toBeHidden();
  await expect(region(page, 'invalid')).toBeHidden();
});

test('calculate(valid) switches to the valid region and hides the others', async ({ page }) => {
  await control(page, 'calculate-valid').click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(region(page, 'valid')).toBeVisible();
  await expect(region(page, 'empty')).toBeHidden();
  await expect(region(page, 'invalid')).toBeHidden();
  await expect(region(page, 'valid').locator('[data-result-value]')).toBeVisible();
});

test('calculate(invalid) shows the error surface only', async ({ page }) => {
  await control(page, 'calculate-invalid').click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(region(page, 'invalid')).toBeVisible();
  await expect(region(page, 'invalid')).toContainText('greater than zero');
  await expect(region(page, 'valid')).toBeHidden();
});

test('example is clearly labelled and never shown as the visitor\'s own result', async ({ page }) => {
  await control(page, 'example').click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  const example = region(page, 'example');
  await expect(example).toBeVisible();
  await expect(example).toContainText('Example');
});

/* ---- Result dominance ---------------------------------------------------- */

test('the result value is visually dominant over its interpretation', async ({ page }) => {
  await control(page, 'calculate-valid').click();
  const valuePx = await fontPx(page, '#demo-shell [data-result-when~="valid"] [data-result-value]');
  const interpPx = await fontPx(page, '#demo-shell [data-result-when~="valid"] [data-result-interpretation]');
  expect(valuePx).toBeGreaterThan(interpPx * 1.5);
});

/* ---- Accessible units ---------------------------------------------------- */

test('the unit is exposed as a spoken combined name, and the abbreviation is aria-hidden', async ({ page }) => {
  await control(page, 'calculate-valid').click();
  const a11y = region(page, 'valid').locator('[data-result-value-a11y]');
  await expect(a11y).toHaveText(/kilograms per square metre/);
  // The abbreviated visual unit's own wrapper is aria-hidden (it is the parent
  // of the visual value+unit; the spoken combined name lives in the sr-only span).
  await expect(region(page, 'valid').locator('[data-result-unit]')).toBeVisible();
  await expect(region(page, 'valid').locator('[data-result-value-group] > [aria-hidden="true"]')).toHaveCount(1);
});

/* ---- Live announcements -------------------------------------------------- */

test('announces exactly the completed result / error, and stays silent otherwise', async ({ page }) => {
  const liveRegion = live(page);
  await expect(liveRegion).toHaveAttribute('aria-live', 'polite');

  // Empty + example: silent.
  await expect(liveRegion).toHaveText('');
  await control(page, 'example').click();
  await expect(liveRegion).toHaveText('');

  // Valid: one announcement, the combined value name.
  await control(page, 'calculate-valid').click();
  await expect(liveRegion).toHaveText(/kilograms per square metre/);

  // Invalid: the error label.
  await control(page, 'calculate-invalid').click();
  await expect(liveRegion).toHaveText(/greater than zero/);
});

test('a completed result settles to idle without re-announcing', async ({ page }) => {
  await control(page, 'calculate-valid').click();
  await expect(shell(page)).toHaveAttribute('data-result-activity', 'just-updated');
  const announced = await live(page).textContent();
  // After the transient settles, activity returns to idle and the message is unchanged.
  await expect(shell(page)).toHaveAttribute('data-result-activity', 'idle', { timeout: 2000 });
  await expect(live(page)).toHaveText(announced ?? '');
});

/* ---- Focus rules --------------------------------------------------------- */

test('a live update never steals focus', async ({ page }) => {
  await control(page, 'calculate-valid').click();
  // Trigger a live update; the controller must not move focus into the result.
  const liveBtn = control(page, 'live');
  await liveBtn.click();
  await expect(liveBtn).toBeFocused();
});

test('an explicit calculate does not steal focus when the result is already visible', async ({ page }) => {
  const btn = control(page, 'calculate-valid');
  await btn.click();
  // Desktop viewport, result on screen → no scroll/focus theft.
  await expect(btn).toBeFocused();
});

/* ---- Dimensional stability ---------------------------------------------- */

test('switching states holds the reserved dimensions (no layout shift)', async ({ page }) => {
  const box1 = await shell(page).boundingBox();
  await control(page, 'calculate-valid').click();
  await expect(region(page, 'valid')).toBeVisible();
  const box2 = await shell(page).boundingBox();
  await control(page, 'calculate-invalid').click();
  await expect(region(page, 'invalid')).toBeVisible();
  const box3 = await shell(page).boundingBox();
  expect(box1 && box2 && box3).toBeTruthy();
  expect(Math.abs((box2!.height) - (box1!.height))).toBeLessThanOrEqual(1);
  expect(Math.abs((box3!.height) - (box1!.height))).toBeLessThanOrEqual(1);
});

/* ---- Keyboard: result actions ------------------------------------------- */

test('result actions are keyboard reachable', async ({ page }) => {
  const actions = page.locator('[aria-label="Result actions"]').first();
  const copy = actions.getByRole('button', { name: 'Copy' });
  await copy.focus();
  await expect(copy).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(actions.getByRole('button', { name: 'Regenerate' })).toBeFocused();
});

/* ---- Theming ------------------------------------------------------------- */

test('renders in dark scheme (media) and dark theme (explicit override)', async ({ page }) => {
  await control(page, 'calculate-valid').click();
  const value = region(page, 'valid').locator('[data-result-value]');
  await expect(value).toBeVisible();

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(value).toBeVisible();

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await expect(value).toBeVisible();
  // The boxed shell picks up the dark card token (not white).
  const bg = await shell(page).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgb(255, 255, 255)');
});

/* ---- Mobile -------------------------------------------------------------- */

test('does not overflow horizontally on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await control(page, 'calculate-valid').click();
  await expect(region(page, 'valid').locator('[data-result-value]')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
