import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Amortization calculator — R11B1 task-first migration + R11B1.1 hardening. Wraps the UNCHANGED
 * calculateLoan / @lib/finance engine; the complete-result guard lives in the binding's resultValue
 * (NaN sentinel — NO isUsableResult). Task-first: empty start, "Calculate Amortization" for the first
 * result, live-after-first. The schedule is a native <details> disclosure (closed by default) holding
 * the FULL schedule — yearly summary + up to 360 monthly rows, every row, no pagination/virtualization
 * — built via the DOM API (no innerHTML). Yearly (default) / Monthly is a native-radio, island-owned
 * presentation switch that never recomputes and never announces.
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
const disclosure = (page: Page) => page.locator('[data-am-disclosure]');
const summaryToggle = (page: Page) => page.locator('[data-am-disclosure] > summary');
const yearlyRows = (page: Page) => page.locator('[data-am-rows="yearly"] tr');
const monthlyRows = (page: Page) => page.locator('[data-am-rows="monthly"] tr');
const viewRadio = (page: Page, v: string) => page.locator(`[name="am-view"][value="${v}"]`);

const isOpen = (d: Locator) => d.evaluate((el) => (el as HTMLDetailsElement).open);

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

test('loads empty: blank fields, empty result, "Calculate Amortization" action, disclosure closed, no rows', async ({ page }) => {
  await expect(page.locator('[name="amount"]')).toHaveValue('');
  await expect(page.locator('[name="annualInterestRate"]')).toHaveValue('');
  await expect(page.locator('[name="termYears"]')).toHaveValue('');
  await expect(submit(page)).toHaveText('Calculate Amortization');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  await expect(region(page, 'empty')).toBeHidden();
  await expect(region(page, 'valid')).toBeVisible();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(live(page)).toHaveText('');
  // Disclosure closed, no rows, Yearly selected structurally.
  expect(await isOpen(disclosure(page))).toBe(false);
  await expect(yearlyRows(page)).not.toHaveCount(0); // the example prepares its own schedule
  await expect(monthlyRows(page)).not.toHaveCount(0); // the example prepares both views
  await expect(viewRadio(page, 'yearly')).toBeChecked();
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

/* ---- First success ------------------------------------------------------ */

test('valid result: dominant payment + totals + count + announcement, disclosure stays CLOSED, rows prepared', async ({ page }) => {
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
  // Disclosure remains CLOSED; rows are PREPARED (present in the DOM) but not visible or announced.
  expect(await isOpen(disclosure(page))).toBe(false);
  await expect(yearlyRows(page)).toHaveCount(30);
  await expect(monthlyRows(page)).toHaveCount(360);
  await expect(yearlyRows(page).first()).toBeHidden(); // hidden inside the closed disclosure
  await expect(viewRadio(page, 'yearly')).toBeChecked();
  // Dominant payment visually larger than the supporting metrics.
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await interest(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
});

test('renders no NaN / Infinity / undefined for an ordinary result', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await summaryToggle(page).click();
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Open the disclosure ------------------------------------------------ */

test('opening the disclosure reveals the Yearly schedule with a caption + scoped headers', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await summaryToggle(page).click();
  expect(await isOpen(disclosure(page))).toBe(true);
  await expect(yearlyRows(page).first()).toBeVisible();
  await expect(page.locator('[data-am-rows="monthly"]')).toBeHidden();
  // Semantic table: a caption + four column headers, period cells are row headers.
  await expect(page.locator('#am-result table caption')).toHaveText(/Amortization schedule/);
  await expect(page.locator('#am-result thead th[scope="col"]')).toHaveCount(4);
  await expect(page.locator('[data-am-rows="yearly"] tr th[scope="row"]')).toHaveCount(30);
  await expect(yearlyRows(page).last().locator('td').last()).toHaveText('$0'); // ends at $0
});

/* ---- View change (native radios; no recompute, no announcement) --------- */

test('switching to Monthly is a pure presentation change: native radio, 360 rows, focus kept, no recompute/announce', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await summaryToggle(page).click();
  const announced = await live(page).textContent();

  await viewRadio(page, 'monthly').check();
  await expect(page.locator('[data-am-schedule]')).toHaveAttribute('data-am-view', 'monthly');
  await expect(page.locator('[data-am-rows="monthly"]')).toBeVisible();
  await expect(page.locator('[data-am-rows="yearly"]')).toBeHidden();
  await expect(page.locator('[data-am-when-view="monthly"]')).toBeVisible(); // header reads "Month"
  await expect(monthlyRows(page)).toHaveCount(360);
  await expect(monthlyRows(page).last().locator('td').last()).toHaveText('$0');
  // Focus stays on the selected radio; the dominant result + announcement are unchanged (no recompute).
  await expect(viewRadio(page, 'monthly')).toBeFocused();
  await expect(primary(page)).toHaveText('$1,580.17');
  await expect(live(page)).toHaveText(announced ?? '');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

/* ---- Term boundary (migrated-product 1–30, whole) ----------------------- */

test('a 30-year term is valid and prepares exactly 360 monthly rows (the ceiling)', async ({ page }) => {
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

/* ---- Valid live update: disclosure + view + focus preserved ------------- */

test('a valid live update preserves the open disclosure and the Monthly view, replaces rows, keeps focus', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await summaryToggle(page).click();
  await viewRadio(page, 'monthly').check();
  expect(await isOpen(disclosure(page))).toBe(true);

  await page.fill('[name="amount"]', '200000');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('$1,264.14'); // 200k at 6.5% / 30y — rows replaced
  expect(await isOpen(disclosure(page))).toBe(true); // disclosure state preserved
  await expect(page.locator('[data-am-schedule]')).toHaveAttribute('data-am-view', 'monthly'); // view preserved
  await expect(monthlyRows(page)).toHaveCount(360);
  await expect(page.locator('[name="amount"]')).toBeFocused(); // focus preserved
});

/* ---- Invalid live update: stale rows removed, focus kept ---------------- */

test('an invalid live edit removes the stale summary AND all schedule rows, keeping focus on the field', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await summaryToggle(page).click();
  await viewRadio(page, 'monthly').check();
  await expect(monthlyRows(page)).toHaveCount(360);

  await page.fill('[name="termYears"]', '31'); // above the 30-year max
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(region(page, 'valid')).toBeHidden(); // stale summary gone
  await expect(yearlyRows(page)).toHaveCount(0); // stale rows removed
  await expect(monthlyRows(page)).toHaveCount(0);
  await expect(page.locator('[name="termYears"]')).toBeFocused(); // focus on the edited field
});

/* ---- Reset -------------------------------------------------------------- */

test('reset closes the disclosure, restores Yearly, clears rows + fields, empties result + announcement', async ({ page }) => {
  await calc(page, '250000', '6.5', '30');
  await summaryToggle(page).click();
  await viewRadio(page, 'monthly').check();

  await page.click('[data-reset]');
  await expect(page.locator('[name="amount"]')).toHaveValue('');
  await expect(page.locator('[name="termYears"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  expect(await isOpen(disclosure(page))).toBe(false); // disclosure closed
  await expect(viewRadio(page, 'yearly')).toBeChecked(); // Yearly restored
  await expect(page.locator('[data-am-schedule]')).toHaveAttribute('data-am-view', 'yearly');
  await expect(yearlyRows(page)).toHaveCount(0); // rows cleared
  await expect(monthlyRows(page)).toHaveCount(0);
  await expect(live(page)).toHaveText(''); // announcement cleared
});

/* ---- Keyboard / responsive / theme / embed / monetization -------------- */

test('keyboard submission works from a field', async ({ page }) => {
  await page.fill('[name="amount"]', '24000');
  await page.fill('[name="annualInterestRate"]', '0');
  await page.locator('[name="termYears"]').fill('1');
  await page.locator('[name="termYears"]').press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$2,000.00');
});

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calc(page, '250000', '6.5', '30');
  await expect(primary(page)).toBeInViewport();
});

test('mobile does not overflow horizontally (the wide schedule scrolls inside its own container)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calc(page, '250000', '6.5', '30');
  await summaryToggle(page).click();
  await viewRadio(page, 'monthly').check();
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
  await page.locator('[data-am-disclosure] > summary').click();
  await expect(page.locator('[data-am-rows="monthly"] tr')).toHaveCount(12);
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
