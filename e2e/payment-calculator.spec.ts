import { test, expect, type Page } from '@playwright/test';

/**
 * Payment calculator — R8B1 standard-form wave (calculator #14; product family
 * MULTI-MODE, on the standard-form runtime + the small isUsableResult extension).
 * Two modes ("Monthly payment" / "Payoff time") swap ONE conditional field; the island
 * hides + disables the inactive one and syncs the action label. Covers the doctrine
 * end-to-end plus the conditional field, the mode-specific dominant, the informational
 * "Never" payoff (a VALID result, not an error), and value preservation across a switch.
 */
const ROUTE = '/finance/payment-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#pm-result');
const primary = (page: Page) => page.locator('#pm-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#pm-result [data-result-summary-label]');
const detail = (page: Page) => page.locator('#pm-result [data-pm-detail]');
const liveRegion = (page: Page) => page.locator('#pm-live');
const submit = (page: Page) => page.locator('[data-pm-submit]');
const region = (page: Page, when: string) => page.locator(`#pm-result [data-result-when~="${when}"]`);

const calcTerm = async (page: Page, principal = '20000', rate = '6', term = '5') => {
  await page.fill('[name="principal"]', principal);
  await page.fill('[name="annualRatePct"]', rate);
  await page.fill('[name="termYears"]', term);
  await submit(page).click();
};

const calcPayment = async (page: Page, principal: string, rate: string, payment: string) => {
  await page.check('[name="mode"][value="payment"]');
  await page.fill('[name="principal"]', principal);
  await page.fill('[name="annualRatePct"]', rate);
  await page.fill('[name="payment"]', payment);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: Monthly-payment mode, blank fields, result empty, Calculate Payment action, no live note', async ({ page }) => {
  await expect(page.locator('[name="mode"][value="term"]')).toBeChecked();
  await expect(page.locator('[name="principal"]')).toHaveValue('');
  await expect(page.locator('[name="annualRatePct"]')).toHaveValue('');
  await expect(page.locator('[name="termYears"]')).toHaveValue('');
  await expect(submit(page)).toHaveText('Calculate Payment');
  // Term field shown; payment field hidden AND disabled (out of the a11y + submit order).
  await expect(page.locator('[data-pm-term]')).toBeVisible();
  await expect(page.locator('[data-pm-payment]')).toBeHidden();
  await expect(page.locator('[name="payment"]')).toBeDisabled();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(region(page, 'valid')).toBeHidden();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(primary(page)).toHaveText('—');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="principal"]', '20000');
  await page.fill('[name="annualRatePct"]', '6');
  await page.fill('[name="termYears"]', '5');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Fixed term (solve for the monthly payment) ------------------------- */

test('valid term result: monthly payment dominant, payment count subordinate', async ({ page }) => {
  await calcTerm(page, '20000', '6', '5');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Estimated monthly payment');
  await expect(primary(page)).toHaveText('$386.66');
  await expect(detail(page)).toHaveText('60 monthly payments');
  await expect(liveRegion(page)).toHaveText('Your estimated monthly payment is 386 dollars and 66 cents.');
});

test('an entered 0% rate is valid (interest-free) and divides principal evenly', async ({ page }) => {
  await calcTerm(page, '12000', '0', '1');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$1,000.00');
  await expect(detail(page)).toHaveText('12 monthly payments');
});

/* ---- Fixed payment (solve for the payoff time) -------------------------- */

test('valid payoff result: payoff time dominant, payment count subordinate', async ({ page }) => {
  await calcPayment(page, '20000', '0', '500'); // interest-free → exactly 40 months
  await expect(summaryLabel(page)).toHaveText('Estimated payoff time');
  await expect(primary(page)).toHaveText('3 years, 4 months');
  await expect(detail(page)).toHaveText('40 monthly payments');
  await expect(liveRegion(page)).toHaveText('Your estimated payoff time is 3 years and 4 months.');
});

test('a payment that never covers the interest is a VALID informational result, not an error', async ({ page }) => {
  await calcPayment(page, '100000', '12', '500'); // interest is 1,000/mo
  // Stays VALID — the extension: an impossible payoff is informational, not invalid.
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Estimated payoff time');
  await expect(primary(page)).toHaveText('Never');
  await expect(detail(page)).toContainText('does not cover the monthly interest');
  await expect(detail(page)).toContainText('Increase the monthly payment');
  // No input error styling, no formula language, no NaN / Infinity leaking through.
  await expect(page.locator('[name="payment"]')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined|log/);
  await expect(liveRegion(page)).toHaveText(
    'At this payment amount, the loan will never be paid off because the payment does not cover the monthly interest.',
  );
});

test('a payment just above the monthly interest is a finite payoff, not "Never"', async ({ page }) => {
  await calcPayment(page, '100000', '12', '1001'); // just over the 1,000/mo interest
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).not.toHaveText('Never');
  await expect(detail(page)).toContainText('monthly payments');
});

/* ---- Duration normalization (R8B1.1) ------------------------------------ */

test('a payoff whose residual rounds to 12 shows the carried year, never "12 months"', async ({ page }) => {
  await calcPayment(page, '11600', '0', '1000'); // interest-free → exactly 11.6 months
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('1 year'); // NOT "0 years, 12 months"
  await expect(primary(page)).not.toContainText('12 months');
  await expect(detail(page)).toHaveText('12 monthly payments'); // payment count is unchanged (ceil)
  await expect(liveRegion(page)).toHaveText('Your estimated payoff time is 1 year.');
});

test('live recalculation into a year boundary uses normalized wording (display + announcement)', async ({ page }) => {
  await calcPayment(page, '59500', '0', '2000'); // 29.75 months → "2 years, 6 months"
  await expect(primary(page)).toHaveText('2 years, 6 months');
  // Live edit into the carry boundary: 59,500 / 1,000 = 59.5 months → "5 years".
  await page.fill('[name="payment"]', '1000');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('5 years'); // NOT "4 years, 12 months"
  await expect(primary(page)).not.toContainText('12 months');
  await expect(detail(page)).toHaveText('60 monthly payments');
  await expect(liveRegion(page)).toHaveText('Your estimated payoff time is 5 years.');
});

/* ---- Mode switching + conditional field --------------------------------- */

test('switching mode before the first calc swaps the field + label, does not calculate, preserves entries', async ({ page }) => {
  await page.fill('[name="principal"]', '20000');
  await page.fill('[name="annualRatePct"]', '6');
  await page.fill('[name="termYears"]', '5');
  await page.check('[name="mode"][value="payment"]');
  await expect(submit(page)).toHaveText('Calculate Payoff Time');
  await expect(page.locator('[data-pm-payment]')).toBeVisible();
  await expect(page.locator('[name="termYears"]')).toBeDisabled(); // inactive field out of the way
  await expect(page.locator('[data-pm-term]')).toBeHidden();
  await expect(page.locator('[name="principal"]')).toHaveValue('20000'); // preserved
  await expect(page.locator('[name="termYears"]')).toHaveValue('5'); // preserved for switch-back
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty'); // no calc
});

test('after a result, switching to a mode whose field is empty asks for it live; switching back restores the preserved value', async ({ page }) => {
  await calcPayment(page, '20000', '6', '400');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  // Switch to term mode — its term field is empty, so live recompute asks for it.
  await page.check('[name="mode"][value="term"]');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="termYears"]')).toHaveText('Enter a loan term.');
  // Switch back to payment mode — the payment value (400) was preserved → payoff again.
  await page.check('[name="mode"][value="payment"]');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[name="payment"]')).toHaveValue('400');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Estimated payoff time');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty explicit submission focuses the loan amount and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const principal = page.locator('[name="principal"]');
  await expect(principal).toBeFocused();
  await expect(principal).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="principal"]')).toHaveText('Enter a loan amount.');
});

test('rejects a zero / negative loan amount and a negative rate', async ({ page }) => {
  await calcTerm(page, '0', '6', '5');
  await expect(page.locator('[data-error-for="principal"]')).toHaveText('Enter a loan amount greater than zero.');
  await calcTerm(page, '20000', '-1', '5');
  await expect(page.locator('[data-error-for="annualRatePct"]')).toHaveText('Enter an interest rate of zero or more.');
});

test('term mode requires the term; payment mode requires the monthly payment', async ({ page }) => {
  await calcTerm(page, '20000', '6', ''); // no term
  await expect(page.locator('[data-error-for="termYears"]')).toHaveText('Enter a loan term.');
  await page.click('[data-reset]');
  await page.check('[name="mode"][value="payment"]');
  await page.fill('[name="principal"]', '20000');
  await page.fill('[name="annualRatePct"]', '6');
  await submit(page).click(); // no payment
  await expect(page.locator('[data-error-for="payment"]')).toHaveText('Enter a monthly payment.');
});

test('keyboard submission works from a field', async ({ page }) => {
  await page.fill('[name="principal"]', '20000');
  await page.fill('[name="annualRatePct"]', '6');
  await page.locator('[name="termYears"]').fill('5');
  await page.locator('[name="termYears"]').press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$386.66');
});

/* ---- Reset -------------------------------------------------------------- */

test('reset restores Monthly-payment mode + label, clears fields, returns to empty', async ({ page }) => {
  await calcPayment(page, '20000', '6', '400');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await page.click('[data-reset]');
  await expect(page.locator('[name="mode"][value="term"]')).toBeChecked();
  await expect(submit(page)).toHaveText('Calculate Payment');
  await expect(page.locator('[data-pm-term]')).toBeVisible();
  await expect(page.locator('[data-pm-payment]')).toBeHidden();
  await expect(page.locator('[name="principal"]')).toHaveValue('');
  await expect(page.locator('[name="payment"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Integrity ---------------------------------------------------------- */

test('renders no NaN / Infinity / undefined for an ordinary result', async ({ page }) => {
  await calcTerm(page, '20000', '6', '5');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Responsive / theme / embed / monetization ------------------------- */

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcTerm(page, '20000', '6', '5');
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcTerm(page, '20000', '6', '5');
  await expect(primary(page)).toHaveText('$386.66');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcTerm(page, '20000', '6', '5');
  await expect(primary(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/finance/payment-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="principal"]', '20000');
  await page.fill('[name="annualRatePct"]', '6');
  await page.fill('[name="termYears"]', '5');
  await page.locator('[data-pm-submit]').click();
  await expect(page.locator('#pm-result [data-result-value]')).toHaveText('$386.66');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
