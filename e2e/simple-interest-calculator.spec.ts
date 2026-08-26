import { test, expect, type Page } from '@playwright/test';

/**
 * Simple interest calculator — R9A1 standard-form wave (calculator #17; product family
 * FINANCE-SIMPLE, runtime unchanged, no isUsableResult). Single mode, no structural selectors.
 * Covers the task-first doctrine end-to-end: empty start, explicit first calc, live-after-first,
 * the interest-earned dominant hierarchy with the total subordinate, zero/fractional validity,
 * strict validation, the single dominant announcement, USD wording, the embed route and the guide
 * embed. Task-first ORDER + first-viewport are additionally asserted by e2e/task-first-layout.spec.ts.
 */
const ROUTE = '/finance/simple-interest-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#si-result');
const primary = (page: Page) => page.locator('#si-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#si-result [data-result-summary-label]');
const interpretation = (page: Page) => page.locator('#si-result [data-si-interpretation]');
const total = (page: Page) => page.locator('#si-result [data-si-total]');
const liveRegion = (page: Page) => page.locator('#si-live');
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate Simple Interest' });
const resetBtn = (page: Page) => page.getByRole('button', { name: 'Reset' });
const region = (page: Page, when: string) => page.locator(`#si-result [data-result-when~="${when}"]`);

const calc = async (page: Page, principal = '5000', rate = '5', years = '3') => {
  await page.fill('[name="principal"]', principal);
  await page.fill('[name="annualRatePct"]', rate);
  await page.fill('[name="years"]', years);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: blank fields, empty result, Calculate + Reset visible, no live note', async ({ page }) => {
  await expect(page.locator('[name="principal"]')).toHaveValue('');
  await expect(page.locator('[name="annualRatePct"]')).toHaveValue('');
  await expect(page.locator('[name="years"]')).toHaveValue('');
  await expect(submit(page)).toBeVisible();
  await expect(resetBtn(page)).toBeVisible();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  // The empty placeholder is replaced by the labelled example on load.
  await expect(region(page, 'empty')).toBeHidden();
  await expect(region(page, 'valid')).toBeVisible();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(primary(page)).not.toHaveText('—');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="principal"]', '5000');
  await page.fill('[name="annualRatePct"]', '5');
  await page.fill('[name="years"]', '3');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Valid result + hierarchy ------------------------------------------- */

test('valid result: interest dominant, total subordinate, with interpretation and USD wording', async ({ page }) => {
  await calc(page, '5000', '5', '3');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Interest earned');
  await expect(primary(page)).toHaveText('$750.00');
  await expect(interpretation(page)).toHaveText('At 5% simple interest for 3 years, the interest earned is $750.00.');
  await expect(total(page)).toHaveText('$5,750.00');
  // Explicit USD wording is visible on the page.
  await expect(page.getByText('Principal amount in USD')).toBeVisible();
  await expect(page.getByText('Interest and total are in US dollars (USD).')).toBeVisible();
  // The dominant interest is visually larger than the subordinate total row.
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await total(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
});

test('a fractional duration is accepted (2.5 years)', async ({ page }) => {
  await calc(page, '1000', '5', '2.5');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$125.00'); // 1000 × 0.05 × 2.5
  await expect(total(page)).toHaveText('$1,125.00');
});

test('an entered principal of 0 is valid and shows $0.00 interest and total', async ({ page }) => {
  await calc(page, '0', '5', '3');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$0.00');
  await expect(total(page)).toHaveText('$0.00');
});

test('an entered rate of 0 is valid: no interest, total = principal', async ({ page }) => {
  await calc(page, '1000', '0', '3');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$0.00');
  await expect(total(page)).toHaveText('$1,000.00');
  await expect(interpretation(page)).toContainText('no interest accrues');
});

test('an entered duration of 0 years is valid: no interest, total = principal', async ({ page }) => {
  await calc(page, '1000', '5', '0');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$0.00');
  await expect(total(page)).toHaveText('$1,000.00');
  await expect(interpretation(page)).toContainText('0 years');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty explicit submission focuses the principal field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const principal = page.locator('[name="principal"]');
  await expect(principal).toBeFocused();
  await expect(principal).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="principal"]')).toHaveText('Enter a principal amount.');
});

test('negative principal, rate and years are each rejected with a clear message', async ({ page }) => {
  await calc(page, '-1000', '5', '3');
  await expect(page.locator('[data-error-for="principal"]')).toHaveText('Enter a principal amount of zero or more.');
  await calc(page, '1000', '-5', '3');
  await expect(page.locator('[data-error-for="annualRatePct"]')).toHaveText('Enter an annual interest rate of zero or more.');
  await calc(page, '1000', '5', '-3');
  await expect(page.locator('[data-error-for="years"]')).toHaveText('Enter a time period of zero years or more.');
});

/* ---- Live-after-first + announcement ------------------------------------ */

test('live-after-first: edits recalculate without moving focus, and announce once', async ({ page }) => {
  await calc(page, '5000', '5', '3');
  await expect(liveRegion(page)).toHaveText('Your simple interest is 750 dollars.');
  await expect(page.locator('[data-live-note]')).toBeVisible();
  // Edit the rate live — the result updates, focus stays on the field, no scroll jump.
  await page.locator('[name="annualRatePct"]').fill('10');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('$1,500.00'); // 5000 × 0.10 × 3
  await expect(page.locator('[name="annualRatePct"]')).toBeFocused();
  await expect(liveRegion(page)).toHaveText('Your simple interest is 1500 dollars.');
});

test('announces the dominant result concisely, never the total', async ({ page }) => {
  await calc(page, '5000', '5', '3');
  await expect(liveRegion(page)).toHaveText('Your simple interest is 750 dollars.');
  await expect(liveRegion(page)).not.toContainText(/total|5,?750/i);
});

test('keyboard submission works from a field', async ({ page }) => {
  await page.fill('[name="principal"]', '5000');
  await page.fill('[name="annualRatePct"]', '5');
  await page.locator('[name="years"]').fill('3');
  await page.locator('[name="years"]').press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$750.00');
});

/* ---- Reset -------------------------------------------------------------- */

test('reset clears fields, returns to empty, clears the announcement', async ({ page }) => {
  await calc(page, '5000', '5', '3');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await resetBtn(page).click();
  await expect(page.locator('[name="principal"]')).toHaveValue('');
  await expect(page.locator('[name="annualRatePct"]')).toHaveValue('');
  await expect(page.locator('[name="years"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
  await expect(page.locator('[data-live-note]')).toBeHidden();
});

/* ---- Integrity ---------------------------------------------------------- */

test('renders no NaN / Infinity / undefined', async ({ page }) => {
  await calc(page, '5000', '5', '3');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Responsive / theme ------------------------------------------------- */

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calc(page, '5000', '5', '3');
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calc(page, '5000', '5', '3');
  await expect(primary(page)).toHaveText('$750.00');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calc(page, '5000', '5', '3');
  await expect(primary(page)).toBeVisible();
});

/* ---- Embed + monetization ----------------------------------------------- */

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/finance/simple-interest-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="principal"]', '5000');
  await page.fill('[name="annualRatePct"]', '5');
  await page.fill('[name="years"]', '3');
  await page.getByRole('button', { name: 'Calculate Simple Interest' }).click();
  await expect(page.locator('#si-result [data-result-value]')).toHaveText('$750.00');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});

/* ---- Guide embed (simple-interest-explained) ---------------------------- */

test('the guide that embeds the island renders the migrated task-first tool', async ({ page }) => {
  await page.goto('/guides/simple-interest-explained', { waitUntil: 'domcontentloaded' });
  // Exactly one H1 (the guide's); the embedded island injects no page H1 or breadcrumb.
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('[data-simple-interest] h1')).toHaveCount(0);
  await expect(page.locator('[data-simple-interest] nav')).toHaveCount(0);
  // Guide prose remains present.
  await expect(page.getByText('Not all interest compounds.')).toBeVisible();
  // Empty (not prefilled) initial state, then an explicit calc works.
  await expect(page.locator('#si-result')).toHaveAttribute('data-result-state', 'example');
  await expect(page.locator('[name="principal"]')).toHaveValue('');
  await page.fill('[name="principal"]', '5000');
  await page.fill('[name="annualRatePct"]', '5');
  await page.fill('[name="years"]', '3');
  await page.getByRole('button', { name: 'Calculate Simple Interest' }).click();
  await expect(page.locator('#si-result [data-result-value]')).toHaveText('$750.00');
  // Reset returns to empty.
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('#si-result')).toHaveAttribute('data-result-state', 'empty');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(await page.content()).not.toContain('data-mon-');
});
