import { test, expect, type Page } from '@playwright/test';

/**
 * Interest Rate calculator — R15B3 task-first migration (Loan family follow-on, 3 of 3; family COMPLETE).
 * Wraps the UNCHANGED solveAnnualRate (a bisection over the shared @lib/finance `pmt`) via its OWN
 * interest-rate-form.ts binding (imports nothing from loan-form / home-equity-loan-form / amortization-
 * form). Task-first: empty start, "Calculate Interest Rate" for the first result, live-after-first.
 * The dominant estimated ANNUAL rate shows first; the monthly rate + supplied monthly payment are the
 * prominent secondary. Term is in MONTHS (whole ≥ 1). A monthly payment too low to ever repay the loan
 * is rejected (the pure solver would floor to a misleading 0%). The estimator disclaimer is island-owned
 * (once on page + once in embed). The complete-result guard lives in the binding's resultValue (NaN
 * sentinel — NO isUsableResult); a valid 0% rate is a finite 0 the default gate accepts.
 */
const ROUTE = '/finance/interest-rate-calculator';
const DEBOUNCE = 300;
const INFEASIBLE = 'This monthly payment is too low to repay the loan over the term. Enter a higher payment or a shorter term.';

const shell = (page: Page) => page.locator('#ir-result');
const primary = (page: Page) => page.locator('#ir-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#ir-result [data-result-summary-label]');
const monthly = (page: Page) => page.locator('[data-ir-monthly]');
const payment = (page: Page) => page.locator('[data-ir-payment]');
const amount = (page: Page) => page.locator('[data-ir-amount]');
const payments = (page: Page) => page.locator('[data-ir-payments]');
const total = (page: Page) => page.locator('[data-ir-total]');
const interpretation = (page: Page) => page.locator('[data-ir-interpretation]');
const live = (page: Page) => page.locator('#ir-live');
const submit = (page: Page) => page.locator('[data-ir-submit]');
const region = (page: Page, when: string) => page.locator(`#ir-result [data-result-when~="${when}"]`);
const disclaimer = (page: Page) => page.locator('.ir-disclaimer');

const FIELDS = ['amount', 'payment', 'months'] as const;
type Fields = Record<(typeof FIELDS)[number], string>;
const BASE: Fields = { amount: '20000', payment: '386.66', months: '60' }; // ≈ 6% annual

const calc = async (page: Page, over: Partial<Fields> = {}) => {
  const v = { ...BASE, ...over };
  for (const name of FIELDS) await page.fill(`[name="${name}"]`, v[name]);
  await submit(page).click();
};
const rateOf = async (page: Page) => parseFloat((await primary(page).textContent())!.replace('%', ''));

test.describe('interest rate: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('loads empty: blank fields, empty result, "Calculate Interest Rate", disclaimer shown', async ({ page }) => {
    for (const name of FIELDS) await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    await expect(submit(page)).toHaveText('Calculate Interest Rate');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    // The empty placeholder is replaced by the labelled example on load.
    await expect(region(page, 'empty')).toBeHidden();
    await expect(region(page, 'valid')).toBeVisible();
    await expect(live(page)).toHaveText('');
    await expect(disclaimer(page)).toHaveCount(1);
    await expect(disclaimer(page)).toBeVisible();
  });

  test('the term field is in whole months (min 1, step 1)', async ({ page }) => {
    const term = page.locator('[name="months"]');
    await expect(term).toHaveAttribute('min', '1');
    await expect(term).toHaveAttribute('step', '1');
  });

  test('does not calculate before the first submission', async ({ page }) => {
    for (const name of FIELDS) await page.fill(`[name="${name}"]`, BASE[name]);
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  test('valid result: dominant annual rate + monthly-rate/payment secondary + supporting + announcement', async ({ page }) => {
    await calc(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Estimated annual interest rate');
    expect(await rateOf(page)).toBeGreaterThan(5.9); // ≈ 6% from $386.66 / 60mo / $20,000
    expect(await rateOf(page)).toBeLessThan(6.1);
    await expect(payment(page)).toHaveText('$386.66');
    await expect(amount(page)).toHaveText('$20,000.00');
    await expect(payments(page)).toHaveText('60 monthly payments');
    await expect(total(page)).toHaveText('$23,199.60'); // 386.66 × 60
    await expect(monthly(page)).not.toHaveText('—');
    await expect(interpretation(page)).toContainText('interest rate');
    const announcement = await live(page).textContent();
    expect(announcement).toMatch(/^Estimated annual interest rate: \d/);
    // dominant rate visually larger than the supporting metrics
    const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const metricSize = await monthly(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(primarySize).toBeGreaterThan(metricSize * 1.5);
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the zero-interest boundary (payment × months = principal) resolves to 0%', async ({ page }) => {
    await calc(page, { amount: '12000', payment: '1000', months: '12' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('0%');
    await expect(total(page)).toHaveText('$12,000.00');
    await expect(live(page)).toHaveText('Estimated annual interest rate: 0 percent.');
  });

  test('an infeasible payment (too low to ever repay the loan) is rejected, not shown as 0%', async ({ page }) => {
    await calc(page, { amount: '20000', payment: '100', months: '12' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(page.locator('[data-error-for="payment"]')).toHaveText(INFEASIBLE);
  });

  /* ---- validation ---- */

  test('field validation: amount > 0, payment > 0, whole term ≥ 1 month', async ({ page }) => {
    await calc(page, { amount: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="amount"]')).toHaveText('Enter a loan amount greater than zero.');

    await calc(page, { payment: '0' });
    await expect(page.locator('[data-error-for="payment"]')).toHaveText('Enter a monthly payment greater than zero.');

    await calc(page, { months: '2.5' });
    await expect(page.locator('[data-error-for="months"]')).toHaveText('Enter a whole loan term of 1 month or more.');
    await calc(page, { months: '0' });
    await expect(page.locator('[data-error-for="months"]')).toHaveText('Enter a whole loan term of 1 month or more.');
  });

  test('an empty explicit submission focuses the loan amount and associates the error', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    const amt = page.locator('[name="amount"]');
    await expect(amt).toBeFocused();
    await expect(amt).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-error-for="amount"]')).toHaveText('Enter the loan amount.');
  });

  /* ---- live update / invalidate / reset ---- */

  test('a valid live update recomputes without moving focus', async ({ page }) => {
    await calc(page);
    const before = await rateOf(page);
    await page.fill('[name="payment"]', '450');
    await page.waitForTimeout(DEBOUNCE);
    expect(await rateOf(page)).toBeGreaterThan(before); // a higher payment ⇒ a higher implied rate
    await expect(page.locator('[name="payment"]')).toBeFocused();
  });

  test('an invalid live edit removes the stale valid result, keeping focus', async ({ page }) => {
    await calc(page);
    await expect(region(page, 'valid')).toBeVisible();
    await page.fill('[name="months"]', '2.5');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(page.locator('[name="months"]')).toBeFocused();
  });

  test('reset clears fields, empties result + announcement; the disclaimer stays', async ({ page }) => {
    await calc(page);
    await page.click('[data-reset]');
    for (const name of FIELDS) await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
    await expect(disclaimer(page)).toBeVisible();
  });

  /* ---- keyboard / responsive / theme / disclaimer-once / embed / monetization ---- */

  test('keyboard submission works from a field', async ({ page }) => {
    for (const name of FIELDS) await page.fill(`[name="${name}"]`, BASE[name]);
    await page.locator('[name="months"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    expect(await rateOf(page)).toBeGreaterThan(5.9);
  });

  test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await calc(page);
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc(page);
    await expect(primary(page)).toBeVisible();
  });

  test('the estimator disclaimer appears exactly once on the full page', async ({ page }) => {
    await expect(disclaimer(page)).toHaveCount(1);
    await expect(page.getByText(/not financial advice/i)).toHaveCount(1);
  });

  test('the generated embed mounts the same island and shows the disclaimer once', async ({ page }) => {
    await page.goto('/embed/finance/interest-rate-calculator', { waitUntil: 'domcontentloaded' });
    await expect(disclaimer(page)).toHaveCount(1);
    for (const name of FIELDS) await page.fill(`[name="${name}"]`, BASE[name]);
    await page.locator('[data-ir-submit]').click();
    await expect(page.locator('#ir-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#ir-result [data-ir-payment]')).toHaveText('$386.66');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});
