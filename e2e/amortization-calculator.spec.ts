import { test, expect, type Page } from '@playwright/test';

/**
 * Amortization calculator — R11B1 Commit 2 task-first migration. Wraps the UNCHANGED calculateLoan
 * / @lib/finance engine. Task-first: empty start, "Calculate Schedule" for the first result,
 * live-after-first thereafter. The loan term is a migrated-product boundary (whole, 1–30 years),
 * bounding the monthly schedule to at most 360 rows. The full schedule renders every row (yearly
 * summary + monthly breakdown, no pagination / virtualization), built via the DOM API (no innerHTML).
 * Yearly is the default view; Monthly is on demand, an island-owned presentation switch.
 */
const ROUTE = '/finance/amortization-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#am-result');
const primary = (page: Page) => page.locator('#am-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#am-result [data-result-summary-label]');
const interest = (page: Page) => page.locator('[data-am-interest]');
const total = (page: Page) => page.locator('[data-am-total]');
const count = (page: Page) => page.locator('[data-am-count]');
const live = (page: Page) => page.locator('#am-live');
const submit = (page: Page) => page.locator('[data-am-submit]');
const region = (page: Page, when: string) => page.locator(`#am-result [data-result-when~="${when}"]`);
const yearlyRows = (page: Page) => page.locator('[data-am-rows="yearly"] tr');
const monthlyRows = (page: Page) => page.locator('[data-am-rows="monthly"] tr');
const viewBtn = (page: Page, v: string) => page.locator(`[data-am-view-btn="${v}"]`);

const calc = async (page: Page, amount: string, rate: string, term: string) => {
  await page.fill('[name="amount"]', amount);
  await page.fill('[name="annualInterestRate"]', rate);
  await page.fill('[name="termYears"]', term);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: blank fields, empty result, Calculate Schedule action, no live note', async ({ page }) => {
  await expect(page.locator('[name="amount"]')).toHaveValue('');
  await expect(page.locator('[name="annualInterestRate"]')).toHaveValue('');
  await expect(page.locator('[name="termYears"]')).toHaveValue('');
  await expect(submit(page)).toHaveText('Calculate Schedule');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(region(page, 'valid')).toBeHidden();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(live(page)).toHaveText('');
});

test('the term field carries the migrated-product min/max/step attributes', async ({ page }) => {
  const term = page.locator('[name="termYears"]');
  await expect(term).toHaveAttribute('min', '1');
  await expect(term).toHaveAttribute('max', '30');
  await expect(term).toHaveAttribute('step', '1');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="amount"]', '250000');
  await page.fill('[name="annualInterestRate"]', '6.5');
  await page.fill('[name="termYears"]', '30');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Valid result ------------------------------------------------------- */

test('valid result: dominant monthly payment + totals + payment count + announcement', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Estimated monthly payment');
  await expect(primary(page)).toHaveText('$1,580.17');
  await expect(interest(page)).toHaveText('$318,861');
  await expect(total(page)).toHaveText('$568,861');
  await expect(count(page)).toHaveText('360 payments');
  await expect(live(page)).toHaveText(
    'Your estimated monthly payment is 1580 dollars and 17 cents over 360 monthly payments, with 318861 dollars and 22 cents in total interest.',
  );
  // The dominant payment is visually larger than the supporting metrics.
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await interest(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
});

test('renders no NaN / Infinity / undefined for an ordinary result', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Full schedule + Yearly default ------------------------------------- */

test('renders the FULL schedule: 30 yearly rows, 360 monthly rows, ending at a $0 balance', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await expect(yearlyRows(page)).toHaveCount(30);
  await expect(monthlyRows(page)).toHaveCount(360); // the 360-row ceiling, rendered in full
  await expect(yearlyRows(page).last().locator('td').last()).toHaveText('$0');
  await expect(monthlyRows(page).last().locator('td').last()).toHaveText('$0');
});

test('defaults to the Yearly view; Monthly is hidden until requested', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await expect(page.locator('[data-am-schedule]')).toHaveAttribute('data-am-view', 'yearly');
  await expect(page.locator('[data-am-rows="yearly"]')).toBeVisible();
  await expect(page.locator('[data-am-rows="monthly"]')).toBeHidden();
  await expect(page.locator('[data-am-when-view="yearly"]')).toBeVisible(); // header reads "Year"
  await expect(page.locator('[data-am-when-view="monthly"]')).toBeHidden();
  await expect(viewBtn(page, 'yearly')).toHaveAttribute('aria-checked', 'true');
  await expect(viewBtn(page, 'monthly')).toHaveAttribute('aria-checked', 'false');
});

test('the period cells are row headers (accessible), proving DOM-built (not innerHTML) rows', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await expect(page.locator('[data-am-rows="monthly"] tr th[scope="row"]')).toHaveCount(360);
  await expect(page.locator('[data-am-rows="monthly"] tr').first().locator('th[scope="row"]')).toHaveText('1');
});

/* ---- View toggle (island-owned, no recompute) --------------------------- */

test('switching to Monthly reveals the monthly rows + "Month" header, without leaving the valid state', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await viewBtn(page, 'monthly').click();
  await expect(page.locator('[data-am-schedule]')).toHaveAttribute('data-am-view', 'monthly');
  await expect(page.locator('[data-am-rows="monthly"]')).toBeVisible();
  await expect(page.locator('[data-am-rows="yearly"]')).toBeHidden();
  await expect(page.locator('[data-am-when-view="monthly"]')).toBeVisible(); // header reads "Month"
  await expect(viewBtn(page, 'monthly')).toHaveAttribute('aria-checked', 'true');
  // A pure presentation switch: the dominant result is unchanged, still valid.
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$1,580.17');
  // ...and back to Yearly.
  await viewBtn(page, 'yearly').click();
  await expect(page.locator('[data-am-rows="yearly"]')).toBeVisible();
  await expect(page.locator('[data-am-rows="monthly"]')).toBeHidden();
});

/* ---- Term boundary (migrated-product 1–30, whole) ----------------------- */

test('a 30-year term is valid and produces exactly 360 monthly rows (the ceiling)', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(monthlyRows(page)).toHaveCount(360);
});

test('a term ABOVE 30 years is rejected with the single term message', async ({ page }) => {
  await calc(page, '250000', '6.5', '31');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="termYears"]')).toHaveText('Enter a whole loan term from 1 to 30 years.');
});

test('a 1-year term is valid with exactly 12 monthly rows', async ({ page }) => {
  await calc(page, '24000', '6', '1');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(monthlyRows(page)).toHaveCount(12);
  await expect(yearlyRows(page)).toHaveCount(1);
});

test('a zero, negative or fractional term is rejected (never rounded)', async ({ page }) => {
  const msg = 'Enter a whole loan term from 1 to 30 years.';
  await calc(page, '250000', '6.5', '0');
  await expect(page.locator('[data-error-for="termYears"]')).toHaveText(msg);
  await page.fill('[name="termYears"]', '2.5');
  await submit(page).click();
  await expect(page.locator('[data-error-for="termYears"]')).toHaveText(msg);
});

/* ---- Amount + rate validation ------------------------------------------- */

test('a zero loan amount is rejected as greater-than-zero', async ({ page }) => {
  await calc(page, '0', '6.5', '30');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="amount"]')).toHaveText('Enter a loan amount greater than zero.');
});

test('a 0% interest loan is VALID (principal-only schedule); a negative rate is invalid', async ({ page }) => {
  await calc(page, '12000', '0', '1');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$1,000.00'); // 12,000 / 12
  await expect(interest(page)).toHaveText('$0');
  await calc(page, '12000', '-1', '1');
  await expect(page.locator('[data-error-for="annualInterestRate"]')).toHaveText('Enter an interest rate of zero or more.');
});

test('an empty explicit submission focuses the amount and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const amount = page.locator('[name="amount"]');
  await expect(amount).toBeFocused();
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="amount"]')).toHaveText('Enter a loan amount.');
});

/* ---- Live-after-first + keyboard + reset -------------------------------- */

test('after the first result, editing a field updates live', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await expect(primary(page)).toHaveText('$1,580.17');
  await page.fill('[name="amount"]', '200000');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('$1,264.14'); // 200k at 6.5% / 30y
  await expect(monthlyRows(page)).toHaveCount(360);
});

test('keyboard submission works from a field', async ({ page }) => {
  await page.fill('[name="amount"]', '24000');
  await page.fill('[name="annualInterestRate"]', '0');
  await page.locator('[name="termYears"]').fill('1');
  await page.locator('[name="termYears"]').press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$2,000.00');
});

test('reset clears fields, returns the view to Yearly, and empties the result + announcement', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await viewBtn(page, 'monthly').click();
  await expect(page.locator('[data-am-schedule]')).toHaveAttribute('data-am-view', 'monthly');
  await page.click('[data-reset]');
  await expect(page.locator('[name="amount"]')).toHaveValue('');
  await expect(page.locator('[name="termYears"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(page.locator('[data-am-schedule]')).toHaveAttribute('data-am-view', 'yearly');
  await expect(viewBtn(page, 'yearly')).toHaveAttribute('aria-checked', 'true');
  await expect(live(page)).toHaveText('');
});

/* ---- Responsive / theme / embed / monetization -------------------------- */

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calc(page, '250000', '6.5', '30');
  await expect(primary(page)).toBeInViewport();
});

test('mobile does not overflow horizontally (the wide schedule scrolls inside its own container)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calc(page, '250000', '6.5', '30');
  await viewBtn(page, 'monthly').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calc(page, '250000', '6.5', '30');
  await expect(primary(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/finance/amortization-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="amount"]', '24000');
  await page.fill('[name="annualInterestRate"]', '0');
  await page.fill('[name="termYears"]', '1');
  await page.locator('[data-am-submit]').click();
  await expect(page.locator('#am-result [data-result-value]')).toHaveText('$2,000.00');
  await expect(page.locator('[data-am-rows="monthly"] tr')).toHaveCount(12);
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
