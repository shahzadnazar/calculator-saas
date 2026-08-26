import { test, expect, type Page } from '@playwright/test';

/**
 * Inflation calculator — R9C1 standard-form wave (calculator #19; product family FINANCE-SIMPLE,
 * runtime unchanged, no isUsableResult — the malformed-result guard lives in resultValue). Single
 * mode; a NEGATIVE rate is valid deflation (only rate <= -100 is rejected). Covers the task-first
 * doctrine end-to-end plus deflation, the mixed-unit result (future cost $ dominant + buying power $
 * + signed cumulative % ), neutral wording, the rate boundary, the embed route and the (unchanged)
 * reference page. Task-first ORDER + first-viewport are additionally asserted by task-first-layout.spec.ts.
 */
const ROUTE = '/finance/inflation-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#if-result');
const primary = (page: Page) => page.locator('#if-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#if-result [data-result-summary-label]');
const interpretation = (page: Page) => page.locator('#if-result [data-if-interpretation]');
const power = (page: Page) => page.locator('#if-result [data-if-power]');
const change = (page: Page) => page.locator('#if-result [data-if-change]');
const liveRegion = (page: Page) => page.locator('#if-live');
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate Inflation Impact' });
const resetBtn = (page: Page) => page.getByRole('button', { name: 'Reset' });
const region = (page: Page, when: string) => page.locator(`#if-result [data-result-when~="${when}"]`);

const calc = async (page: Page, amount = '100', rate = '3', years = '10') => {
  await page.fill('[name="amount"]', amount);
  await page.fill('[name="annualRatePct"]', rate);
  await page.fill('[name="years"]', years);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: blank fields, empty result, Calculate + Reset visible, no live note', async ({ page }) => {
  await expect(page.locator('[name="amount"]')).toHaveValue('');
  await expect(page.locator('[name="annualRatePct"]')).toHaveValue('');
  await expect(page.locator('[name="years"]')).toHaveValue('');
  await expect(submit(page)).toBeVisible();
  await expect(resetBtn(page)).toBeVisible();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  // The empty placeholder is replaced by the labelled example on load.
  await expect(region(page, 'empty')).toBeHidden();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(primary(page)).not.toHaveText('—');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="amount"]', '100');
  await page.fill('[name="annualRatePct"]', '3');
  await page.fill('[name="years"]', '10');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Inflation + hierarchy ---------------------------------------------- */

test('valid inflation: future cost dominant, buying power + signed change subordinate, USD wording', async ({ page }) => {
  await calc(page, '100', '3', '10');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Projected future cost');
  await expect(primary(page)).toHaveText('$134.39');
  await expect(interpretation(page)).toHaveText('At an annual inflation rate of 3% for 10 years, an amount costing $100.00 today would cost approximately $134.39.');
  await expect(power(page)).toHaveText('$74.41');
  await expect(change(page)).toHaveText('34.4%');
  await expect(page.getByText('Current amount in USD')).toBeVisible();
  await expect(page.getByText(/Amounts are in US dollars \(USD\)\./)).toBeVisible();
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await power(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
});

/* ---- Deflation ---------------------------------------------------------- */

test('valid deflation (negative rate): lower cost, higher buying power, NEGATIVE change, no "increase"', async ({ page }) => {
  await calc(page, '100', '-2', '10');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$81.71'); // below the original $100
  await expect(power(page)).toHaveText('$122.39'); // above the original $100
  await expect(change(page)).toHaveText('-18.3%'); // signed, negative
  await expect(interpretation(page)).toHaveText('At an annual deflation rate of 2% for 10 years, the projected cost decreases to approximately $81.71.');
  await expect(shell(page)).not.toContainText(/increase/i);
});

/* ---- Zero + fractional -------------------------------------------------- */

test('an entered amount of 0 is valid: $0 cost and buying power', async ({ page }) => {
  await calc(page, '0', '3', '10');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$0.00');
  await expect(power(page)).toHaveText('$0.00');
});

test('a 0% rate is valid: no price change, cost = amount', async ({ page }) => {
  await calc(page, '100', '0', '10');
  await expect(primary(page)).toHaveText('$100.00');
  await expect(change(page)).toHaveText('0%');
  await expect(interpretation(page)).toContainText('no price change');
});

test('0 years is valid: no change; fractional years compute', async ({ page }) => {
  await calc(page, '100', '3', '0');
  await expect(primary(page)).toHaveText('$100.00');
  await calc(page, '100', '3', '10.5');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).not.toHaveText('$100.00');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty explicit submission focuses the amount field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const amount = page.locator('[name="amount"]');
  await expect(amount).toBeFocused();
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="amount"]')).toHaveText('Enter an amount.');
});

test('negative amount is rejected; a rate of -100 or below is rejected; deflation above -100 is accepted', async ({ page }) => {
  await calc(page, '-1', '3', '10');
  await expect(page.locator('[data-error-for="amount"]')).toHaveText('Enter an amount of zero or more.');
  await calc(page, '100', '-100', '10');
  await expect(page.locator('[data-error-for="annualRatePct"]')).toHaveText('Enter an annual rate greater than -100%.');
  await calc(page, '100', '-150', '10');
  await expect(page.locator('[data-error-for="annualRatePct"]')).toHaveText('Enter an annual rate greater than -100%.');
  await calc(page, '100', '-99.9', '10'); // just above -100 → valid deflation
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

test('negative years are rejected', async ({ page }) => {
  await calc(page, '100', '3', '-3');
  await expect(page.locator('[data-error-for="years"]')).toHaveText('Enter a time period of zero years or more.');
});

/* ---- Live-after-first + announcement ------------------------------------ */

test('live-after-first: edits recalculate without moving focus, announcing once (deflation phrasing too)', async ({ page }) => {
  await calc(page, '100', '3', '10');
  await expect(liveRegion(page)).toHaveText('The projected future cost is 134 dollars and 39 cents.');
  await page.locator('[name="annualRatePct"]').fill('-2');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('$81.71');
  await expect(page.locator('[name="annualRatePct"]')).toBeFocused();
  await expect(liveRegion(page)).toHaveText('The projected future cost is 81 dollars and 71 cents.');
});

test('announces the dominant future cost only, never buying power or the percentage', async ({ page }) => {
  await calc(page, '100', '3', '10');
  await expect(liveRegion(page)).toHaveText('The projected future cost is 134 dollars and 39 cents.');
  await expect(liveRegion(page)).not.toContainText(/buying power|percent|%/i);
});

test('keyboard submission works from a field', async ({ page }) => {
  await page.fill('[name="amount"]', '100');
  await page.fill('[name="annualRatePct"]', '3');
  await page.locator('[name="years"]').fill('10');
  await page.locator('[name="years"]').press('Enter');
  await expect(primary(page)).toHaveText('$134.39');
});

/* ---- Reset + integrity -------------------------------------------------- */

test('reset clears fields, returns to empty, clears the announcement', async ({ page }) => {
  await calc(page, '100', '3', '10');
  await resetBtn(page).click();
  await expect(page.locator('[name="amount"]')).toHaveValue('');
  await expect(page.locator('[name="annualRatePct"]')).toHaveValue('');
  await expect(page.locator('[name="years"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

test('renders no NaN / Infinity / undefined (inflation or deflation)', async ({ page }) => {
  await calc(page, '100', '3', '10');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
  await calc(page, '100', '-2', '10');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Responsive / theme ------------------------------------------------- */

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calc(page, '100', '3', '10');
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calc(page, '100', '3', '10');
  await expect(primary(page)).toHaveText('$134.39');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calc(page, '100', '3', '10');
  await expect(primary(page)).toBeVisible();
});

/* ---- Embed + reference + monetization ----------------------------------- */

test('the embed route mounts the same interactive island (inflation + deflation)', async ({ page }) => {
  await page.goto('/embed/finance/inflation-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="amount"]', '100');
  await page.fill('[name="annualRatePct"]', '3');
  await page.fill('[name="years"]', '10');
  await page.getByRole('button', { name: 'Calculate Inflation Impact' }).click();
  await expect(page.locator('#if-result [data-result-value]')).toHaveText('$134.39');
  await page.fill('[name="annualRatePct"]', '-2');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('#if-result [data-result-value]')).toHaveText('$81.71');
});

test('the inflation reference table page still renders with its reference content intact', async ({ page }) => {
  await page.goto('/reference/inflation-purchasing-power-table', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByText(/what \$100 held today would be worth/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /inflation calculator/i })).toBeVisible();
  // The reference table is static SSR (no calculator island mounts here).
  await expect(page.locator('[data-inflation]')).toHaveCount(0);
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
