import { test, expect, type Page } from '@playwright/test';

/**
 * Credit card payoff — R8C1 standard-form wave (calculator #15; product family
 * MULTI-MODE, on the standard-form runtime + the accepted isUsableResult gate). Two
 * modes ("Monthly payment" / "Target payoff time") swap ONE conditional field; each
 * ordinary result carries an interest + total-paid breakdown; a positive-but-insufficient
 * payment is the informational "Never" (valid, financial rows omitted).
 */
const ROUTE = '/finance/credit-card-payoff-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#cc-result');
const primary = (page: Page) => page.locator('#cc-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#cc-result [data-result-summary-label]');
const interest = (page: Page) => page.locator('#cc-result [data-cc-interest]');
const total = (page: Page) => page.locator('#cc-result [data-cc-total]');
const interestLabel = (page: Page) => page.locator('#cc-result [data-cc-interest-label]');
const explanation = (page: Page) => page.locator('#cc-result [data-cc-explanation]');
const breakdown = (page: Page) => page.locator('#cc-result [data-cc-breakdown]');
const assumption = (page: Page) => page.locator('#cc-result [data-cc-assumption]');
const liveRegion = (page: Page) => page.locator('#cc-live');
const submit = (page: Page) => page.locator('[data-cc-submit]');
const region = (page: Page, when: string) => page.locator(`#cc-result [data-result-when~="${when}"]`);

const calcPayment = async (page: Page, balance: string, apr: string, payment: string) => {
  await page.fill('[name="balance"]', balance);
  await page.fill('[name="aprPct"]', apr);
  await page.fill('[name="payment"]', payment);
  await submit(page).click();
};

const calcTimeline = async (page: Page, balance: string, apr: string, months: string) => {
  await page.check('[name="mode"][value="months"]');
  await page.fill('[name="balance"]', balance);
  await page.fill('[name="aprPct"]', apr);
  await page.fill('[name="months"]', months);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: By-payment mode, blank fields, result empty, Calculate Payoff Time action, no live note', async ({ page }) => {
  await expect(page.locator('[name="mode"][value="payment"]')).toBeChecked();
  await expect(page.locator('[name="balance"]')).toHaveValue('');
  await expect(page.locator('[name="aprPct"]')).toHaveValue('');
  await expect(page.locator('[name="payment"]')).toHaveValue('');
  await expect(submit(page)).toHaveText('Calculate Payoff Time');
  await expect(page.locator('[data-cc-payment]')).toBeVisible();
  await expect(page.locator('[data-cc-months]')).toBeHidden();
  await expect(page.locator('[name="months"]')).toBeDisabled();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(region(page, 'valid')).toBeHidden();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="balance"]', '5000');
  await page.fill('[name="aprPct"]', '19.99');
  await page.fill('[name="payment"]', '200');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- By payment (solve for payoff time) --------------------------------- */

test('valid By-payment result: payoff time dominant, estimated interest + total paid subordinate', async ({ page }) => {
  await calcPayment(page, '5000', '19.99', '200');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Estimated payoff time');
  await expect(primary(page)).toHaveText('2 years, 9 months');
  await expect(breakdown(page)).toBeVisible();
  await expect(interestLabel(page)).toHaveText('Estimated total interest');
  await expect(interest(page)).toHaveText('$1,600.00');
  await expect(total(page)).toHaveText('$6,600.00');
  await expect(assumption(page)).toContainText('may slightly overstate the final payment');
  await expect(liveRegion(page)).toHaveText('Your estimated payoff time is 2 years and 9 months.');
  // The dominant payoff time is visually larger than the breakdown figures.
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await interest(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
});

test('an entered 0% APR is valid (interest-free payoff)', async ({ page }) => {
  await calcPayment(page, '6000', '0', '500'); // 6000/500 = 12 months
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('1 year');
  await expect(interest(page)).toHaveText('$0.00');
  await expect(total(page)).toHaveText('$6,000.00');
});

/* ---- Never (informational, valid) --------------------------------------- */

test('a payment that never covers the interest is a VALID informational result, financial rows omitted', async ({ page }) => {
  await calcPayment(page, '5000', '18', '50'); // interest is 75/mo
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid'); // NOT invalid
  await expect(summaryLabel(page)).toHaveText('Estimated payoff time');
  await expect(primary(page)).toHaveText('Never');
  await expect(explanation(page)).toBeVisible();
  await expect(explanation(page)).toContainText('does not cover the monthly interest');
  await expect(explanation(page)).toContainText('Increase the monthly payment');
  await expect(breakdown(page)).toBeHidden(); // no interest / total-paid rows
  await expect(page.locator('[name="payment"]')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
  await expect(liveRegion(page)).toHaveText(
    'At this payment amount, the credit card balance will never be paid off because the payment does not cover the monthly interest.',
  );
});

/* ---- By timeline (solve for required payment) --------------------------- */

test('valid By-timeline result: required payment dominant, interest + total paid subordinate', async ({ page }) => {
  await calcTimeline(page, '6000', '0', '24'); // interest-free → 250/mo
  await expect(summaryLabel(page)).toHaveText('Required monthly payment');
  await expect(primary(page)).toHaveText('$250.00');
  await expect(breakdown(page)).toBeVisible();
  await expect(interestLabel(page)).toHaveText('Total interest'); // exact, not "Estimated"
  await expect(interest(page)).toHaveText('$0.00');
  await expect(total(page)).toHaveText('$6,000.00');
  await expect(assumption(page)).toBeHidden(); // no full-final-payment caveat when solving the payment
  await expect(liveRegion(page)).toHaveText('Your required monthly payment is 250 dollars.');
});

/* ---- Mode switching + conditional field --------------------------------- */

test('switching mode before the first calc swaps the field + label, does not calculate, preserves entries', async ({ page }) => {
  await page.fill('[name="balance"]', '5000');
  await page.fill('[name="aprPct"]', '19.99');
  await page.fill('[name="payment"]', '200');
  await page.check('[name="mode"][value="months"]');
  await expect(submit(page)).toHaveText('Calculate Required Payment');
  await expect(page.locator('[data-cc-months]')).toBeVisible();
  await expect(page.locator('[name="payment"]')).toBeDisabled();
  await expect(page.locator('[data-cc-payment]')).toBeHidden();
  await expect(page.locator('[name="balance"]')).toHaveValue('5000'); // preserved
  await expect(page.locator('[name="payment"]')).toHaveValue('200'); // preserved for switch-back
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('after a result, switching to an empty-field mode asks for it live; switching back restores the preserved value', async ({ page }) => {
  await calcTimeline(page, '5000', '19.99', '24');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await page.check('[name="mode"][value="payment"]'); // payment field empty
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="payment"]')).toHaveText('Enter a monthly payment.');
  await page.check('[name="mode"][value="months"]'); // months (24) preserved
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[name="months"]')).toHaveValue('24');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Required monthly payment');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty explicit submission focuses the balance and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const balance = page.locator('[name="balance"]');
  await expect(balance).toBeFocused();
  await expect(balance).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="balance"]')).toHaveText('Enter your card balance.');
});

test('zero balance is invalid; negative APR is invalid', async ({ page }) => {
  await calcPayment(page, '0', '19.99', '200');
  await expect(page.locator('[data-error-for="balance"]')).toHaveText('Enter a balance greater than zero.');
  await calcPayment(page, '5000', '-1', '200');
  await expect(page.locator('[data-error-for="aprPct"]')).toHaveText('Enter an APR of zero or more.');
});

test('By-timeline rejects a fractional target and a target below 1 (never silently rounded)', async ({ page }) => {
  await calcTimeline(page, '5000', '19.99', '24.5');
  await expect(page.locator('[data-error-for="months"]')).toHaveText('Enter a whole number of months (1 or more).');
  await page.fill('[name="months"]', '0');
  await submit(page).click();
  await expect(page.locator('[data-error-for="months"]')).toHaveText('Enter a whole number of months (1 or more).');
});

test('keyboard submission works from a field', async ({ page }) => {
  await page.fill('[name="balance"]', '6000');
  await page.fill('[name="aprPct"]', '0');
  await page.locator('[name="payment"]').fill('500');
  await page.locator('[name="payment"]').press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('1 year');
});

/* ---- Reset -------------------------------------------------------------- */

test('reset restores By-payment mode + label, clears fields, returns to empty', async ({ page }) => {
  await calcTimeline(page, '5000', '19.99', '24');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await page.click('[data-reset]');
  await expect(page.locator('[name="mode"][value="payment"]')).toBeChecked();
  await expect(submit(page)).toHaveText('Calculate Payoff Time');
  await expect(page.locator('[data-cc-payment]')).toBeVisible();
  await expect(page.locator('[data-cc-months]')).toBeHidden();
  await expect(page.locator('[name="balance"]')).toHaveValue('');
  await expect(page.locator('[name="months"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Integrity / responsive / theme / embed / monetization ------------- */

test('renders no NaN / Infinity / undefined for an ordinary result', async ({ page }) => {
  await calcPayment(page, '5000', '19.99', '200');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcPayment(page, '5000', '19.99', '200');
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcPayment(page, '5000', '19.99', '200');
  await expect(primary(page)).toHaveText('2 years, 9 months');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcPayment(page, '5000', '19.99', '200');
  await expect(primary(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/finance/credit-card-payoff-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="balance"]', '6000');
  await page.fill('[name="aprPct"]', '0');
  await page.fill('[name="payment"]', '500');
  await page.locator('[data-cc-submit]').click();
  await expect(page.locator('#cc-result [data-result-value]')).toHaveText('1 year');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
