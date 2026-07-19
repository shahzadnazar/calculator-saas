import { test, expect, type Page } from '@playwright/test';

/**
 * Percentage calculator — the R3 equation-runtime pilot, on its LIVE page.
 *
 * The defining property is INDEPENDENCE: three equations, each its own form +
 * runtime instance. These tests hold that isolation (calc / live / invalid /
 * reset / announce all stay scoped to one equation) alongside the usual
 * doctrine checks (empty initial state, first-calc gate, no NaN, focus, aria,
 * mobile order, theming).
 */
const ROUTE = '/math/percent-calculator';
const DEBOUNCE = 300;

const OF = 'form[data-equation="percent-of"]';
const WHAT = 'form[data-equation="what-percent"]';
const CHANGE = 'form[data-equation="percent-change"]';

const shell = (page: Page, eq: string) => page.locator(`${eq} [data-result-shell]`);
const state = (page: Page, eq: string) => shell(page, eq).getAttribute('data-result-state');
const value = (page: Page, eq: string) => page.locator(`${eq} [data-result-when~="valid"] [data-result-value]`);
const liveOf = (page: Page, eq: string) => page.locator(`${eq} [data-result-live]`);
const submitOf = (page: Page, eq: string) => page.locator(`${eq} button[type="submit"]`);

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('all operands and results start empty; three task-specific Calculate buttons', async ({ page }) => {
  for (const id of ['pof-percent', 'pof-value', 'wp-part', 'wp-whole', 'pc-from', 'pc-to']) {
    await expect(page.locator(`#${id}`)).toHaveValue('');
  }
  for (const eq of [OF, WHAT, CHANGE]) {
    await expect(shell(page, eq)).toHaveAttribute('data-result-state', 'empty');
    await expect(liveOf(page, eq)).toHaveText('');
  }
  await expect(submitOf(page, OF)).toHaveText('Calculate amount');
  await expect(submitOf(page, WHAT)).toHaveText('Calculate percentage');
  await expect(submitOf(page, CHANGE)).toHaveText('Calculate percentage change');
});

test('no equation calculates before its own Calculate is pressed', async ({ page }) => {
  await page.fill('#pof-percent', '15');
  await page.fill('#pof-value', '200');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page, OF)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Independent calculation -------------------------------------------- */

test('each equation calculates independently and never overwrites another', async ({ page }) => {
  // Equation 1 only.
  await page.fill('#pof-percent', '15');
  await page.fill('#pof-value', '200');
  await submitOf(page, OF).click();
  await expect(value(page, OF)).toHaveText('30');
  await expect(shell(page, WHAT)).toHaveAttribute('data-result-state', 'empty');
  await expect(shell(page, CHANGE)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveOf(page, WHAT)).toHaveText(''); // announcement scoped to eq1
  await expect(liveOf(page, OF)).toHaveText('30');

  // Equation 2 only.
  await page.fill('#wp-part', '50');
  await page.fill('#wp-whole', '200');
  await submitOf(page, WHAT).click();
  await expect(value(page, WHAT)).toHaveText('25');
  await expect(page.locator(`${WHAT} [data-result-when~="valid"] [data-result-value-a11y]`)).toHaveText('25 percent');
  await expect(value(page, OF)).toHaveText('30'); // eq1 untouched

  // Equation 3 only.
  await page.fill('#pc-from', '80');
  await page.fill('#pc-to', '100');
  await submitOf(page, CHANGE).click();
  await expect(value(page, CHANGE)).toHaveText('25');
  await expect(page.locator(`${CHANGE} [data-eq-direction]`)).toHaveText('increase');
  await expect(value(page, OF)).toHaveText('30');
  await expect(value(page, WHAT)).toHaveText('25');
});

test('Enter submits only the focused equation', async ({ page }) => {
  await page.fill('#pof-percent', '15');
  await page.fill('#pof-value', '200');
  await page.locator('#pof-value').press('Enter');
  await expect(shell(page, OF)).toHaveAttribute('data-result-state', 'valid');
  await expect(shell(page, WHAT)).toHaveAttribute('data-result-state', 'empty');
  await expect(shell(page, CHANGE)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Live-after-first (scoped) ------------------------------------------ */

test('live-after-first updates only its own equation', async ({ page }) => {
  await page.fill('#pof-percent', '15');
  await page.fill('#pof-value', '200');
  await submitOf(page, OF).click();
  await expect(value(page, OF)).toHaveText('30');
  // Editing eq1 live-updates eq1 only; eq2 stays empty (never calculated).
  await page.fill('#pof-value', '300');
  await page.waitForTimeout(DEBOUNCE);
  await expect(value(page, OF)).toHaveText('45');
  await expect(shell(page, WHAT)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Validation, focus, aria (scoped) ----------------------------------- */

test('a zero total is rejected in its own equation, scoped focus + aria, no NaN', async ({ page }) => {
  await page.fill('#wp-part', '50');
  await page.fill('#wp-whole', '0');
  await submitOf(page, WHAT).click();
  await expect(shell(page, WHAT)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator(`${WHAT} [data-error-for="whole"]`)).toHaveText('The total value must not be zero.');
  await expect(page.locator('#wp-whole')).toBeFocused();
  await expect(page.locator('#wp-whole')).toHaveAttribute('aria-invalid', 'true');
  // aria-invalid stays scoped — no other equation's input is marked.
  await expect(page.locator('#pof-percent')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#pc-from')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(shell(page, WHAT)).not.toContainText(/NaN|Infinity|undefined/);
});

test('a live edit to invalid drops the stale value in that equation only', async ({ page }) => {
  await page.fill('#pc-from', '80');
  await page.fill('#pc-to', '100');
  await submitOf(page, CHANGE).click();
  await expect(value(page, CHANGE)).toHaveText('25');
  await page.fill('#pc-from', '0'); // zero start → invalid
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page, CHANGE)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator(`${CHANGE} [data-result-when~="valid"]`)).toBeHidden(); // no stale 25
});

/* ---- Direction text ----------------------------------------------------- */

test('percentage change shows increase / decrease as words', async ({ page }) => {
  await page.fill('#pc-from', '80');
  await page.fill('#pc-to', '100');
  await submitOf(page, CHANGE).click();
  await expect(page.locator(`${CHANGE} [data-eq-direction]`)).toHaveText('increase');
  await expect(liveOf(page, CHANGE)).toHaveText('25 percent increase');
  // Flip to a decrease.
  await page.fill('#pc-from', '100');
  await page.fill('#pc-to', '80');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator(`${CHANGE} [data-eq-direction]`)).toHaveText('decrease');
  await expect(value(page, CHANGE)).toHaveText('20');
});

test('percentage change requires a starting value greater than zero (R3.1)', async ({ page }) => {
  // Zero start is rejected.
  await page.fill('#pc-from', '0');
  await page.fill('#pc-to', '100');
  await submitOf(page, CHANGE).click();
  await expect(shell(page, CHANGE)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator(`${CHANGE} [data-error-for="from"]`)).toHaveText('Enter a starting value greater than zero.');
  await expect(page.locator('#pc-from')).toBeFocused();
  // A positive start with a negative new value is valid and reads as a decrease.
  await page.fill('#pc-from', '100');
  await page.fill('#pc-to', '-50');
  await submitOf(page, CHANGE).click();
  await expect(shell(page, CHANGE)).toHaveAttribute('data-result-state', 'valid');
  await expect(value(page, CHANGE)).toHaveText('150');
  await expect(page.locator(`${CHANGE} [data-eq-direction]`)).toHaveText('decrease');
  await expect(liveOf(page, CHANGE)).toHaveText('150 percent decrease');
});

/* ---- Independent reset -------------------------------------------------- */

test('reset clears only its own equation', async ({ page }) => {
  // Calculate all three.
  await page.fill('#pof-percent', '15');
  await page.fill('#pof-value', '200');
  await submitOf(page, OF).click();
  await page.fill('#wp-part', '50');
  await page.fill('#wp-whole', '200');
  await submitOf(page, WHAT).click();
  await page.fill('#pc-from', '80');
  await page.fill('#pc-to', '100');
  await submitOf(page, CHANGE).click();

  // Reset equation 1 only.
  await page.locator(`${OF} [data-reset]`).click();
  await expect(shell(page, OF)).toHaveAttribute('data-result-state', 'empty');
  await expect(page.locator('#pof-percent')).toHaveValue('');
  await expect(page.locator(`${OF} [data-live-note]`)).toBeHidden();
  await expect(liveOf(page, OF)).toHaveText('');
  // Equations 2 and 3 remain valid and populated.
  await expect(shell(page, WHAT)).toHaveAttribute('data-result-state', 'valid');
  await expect(value(page, WHAT)).toHaveText('25');
  await expect(shell(page, CHANGE)).toHaveAttribute('data-result-state', 'valid');
  await expect(page.locator('#pc-from')).toHaveValue('80');
});

/* ---- Workspace / responsive / theme ------------------------------------ */

test('desktop first viewport shows the first equation, its action and result', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(submitOf(page, OF)).toBeInViewport();
  const resultTop = (await shell(page, OF).boundingBox())!.y;
  expect(resultTop).toBeLessThan(768);
});

test('mobile stacks sentence → inputs → action → result, no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const inputY = (await page.locator('#pof-percent').boundingBox())!.y;
  const btnY = (await submitOf(page, OF).boundingBox())!.y;
  const resultY = (await shell(page, OF).boundingBox())!.y;
  expect(btnY).toBeGreaterThan(inputY);
  expect(resultY).toBeGreaterThan(btnY);
  await page.fill('#pof-percent', '15');
  await page.fill('#pof-value', '200');
  await submitOf(page, OF).click();
  await expect(value(page, OF)).toHaveText('30');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.fill('#pof-percent', '15');
  await page.fill('#pof-value', '200');
  await submitOf(page, OF).click();
  await expect(value(page, OF)).toBeVisible();
});
