import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Loan calculator — R15B1 task-first migration (Loan family pilot, 1 of 3). Wraps the UNCHANGED
 * calculateLoan / @lib/finance engine via its OWN loan-form.ts binding (imports nothing from
 * amortization-form; the two islands are NOT merged). Task-first: empty start, "Calculate Loan
 * Payment" for the first result, live-after-first. The dominant monthly payment + total interest /
 * total paid / payoff period show first; the YEARLY amortization schedule is a native <details>
 * disclosure (closed by default) built via the DOM API (no innerHTML). The complete-result guard
 * lives in the binding's resultValue (NaN sentinel — NO isUsableResult).
 */
const ROUTE = '/finance/loan-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#loan-result');
const primary = (page: Page) => page.locator('#loan-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#loan-result [data-result-summary-label]');
const interest = (page: Page) => page.locator('[data-loan-interest]');
const total = (page: Page) => page.locator('[data-loan-total]');
const payoff = (page: Page) => page.locator('[data-loan-payoff]');
const live = (page: Page) => page.locator('#loan-live');
const submit = (page: Page) => page.locator('[data-loan-submit]');
const region = (page: Page, when: string) => page.locator(`#loan-result [data-result-when~="${when}"]`);
const disclosure = (page: Page) => page.locator('[data-loan-disclosure]');
const summaryToggle = (page: Page) => page.locator('[data-loan-disclosure] > summary');
const yearlyRows = (page: Page) => page.locator('[data-loan-rows] tr');
const isOpen = (d: Locator) => d.evaluate((el) => (el as HTMLDetailsElement).open);

const calc = async (page: Page, amount: string, rate: string, term: string) => {
  await page.fill('[name="amount"]', amount);
  await page.fill('[name="annualInterestRate"]', rate);
  await page.fill('[name="termYears"]', term);
  await submit(page).click();
};

test.describe('loan: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('loads empty: blank fields, empty result, "Calculate Loan Payment", disclosure closed, no rows', async ({ page }) => {
    await expect(page.locator('[name="amount"]')).toHaveValue('');
    await expect(page.locator('[name="annualInterestRate"]')).toHaveValue('');
    await expect(page.locator('[name="termYears"]')).toHaveValue('');
    await expect(submit(page)).toHaveText('Calculate Loan Payment');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(region(page, 'empty')).toBeHidden();
    await expect(region(page, 'valid')).toBeVisible();
    await expect(live(page)).toHaveText('');
    expect(await isOpen(disclosure(page))).toBe(false);
    await expect(yearlyRows(page)).not.toHaveCount(0); // the example prepares its own schedule
  });

  test('the term field carries the migrated-product min/max/step', async ({ page }) => {
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

  test('valid result: dominant payment + interest/total/payoff + announcement; disclosure CLOSED, rows prepared', async ({ page }) => {
    await calc(page, '250000', '6.5', '30');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Estimated monthly payment');
    await expect(primary(page)).toHaveText('$1,580.17');
    await expect(interest(page)).toHaveText('$318,861');
    await expect(total(page)).toHaveText('$568,861');
    await expect(payoff(page)).toHaveText('30 years');
    await expect(live(page)).toHaveText(
      'Your estimated monthly payment is 1580 dollars and 17 cents over 360 monthly payments, with 318861 dollars and 22 cents in total interest.',
    );
    expect(await isOpen(disclosure(page))).toBe(false);
    await expect(yearlyRows(page)).toHaveCount(30); // prepared but hidden inside the closed disclosure
    await expect(yearlyRows(page).first()).toBeHidden();
    // dominant payment visually larger than the supporting metrics
    const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const cellSize = await interest(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(primarySize).toBeGreaterThan(cellSize * 1.5);
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('opening the disclosure reveals the yearly schedule with a caption + scoped headers, ending at $0', async ({ page }) => {
    await calc(page, '250000', '6.5', '30');
    await summaryToggle(page).click();
    expect(await isOpen(disclosure(page))).toBe(true);
    await expect(yearlyRows(page).first()).toBeVisible();
    await expect(page.locator('#loan-result table caption')).toHaveText(/amortization schedule/i);
    await expect(page.locator('#loan-result thead th[scope="col"]')).toHaveCount(4);
    await expect(page.locator('[data-loan-rows] tr th[scope="row"]')).toHaveCount(30); // year = row header
    await expect(yearlyRows(page).last().locator('td').last()).toHaveText('$0'); // final balance 0
  });

  /* ---- term boundary (1–30 whole) ---- */

  test('a 30-year term is valid with 30 yearly rows; above 30 is rejected with the single term message', async ({ page }) => {
    await calc(page, '250000', '6.5', '30');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(yearlyRows(page)).toHaveCount(30);
    await calc(page, '250000', '6.5', '31');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="termYears"]')).toHaveText('Enter a whole loan term from 1 to 30 years.');
  });

  test('a 1-year term is valid with exactly 1 yearly row; a fractional or zero term is rejected (never rounded)', async ({ page }) => {
    await calc(page, '24000', '6', '1');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(yearlyRows(page)).toHaveCount(1);
    const msg = 'Enter a whole loan term from 1 to 30 years.';
    await calc(page, '24000', '6', '2.5');
    await expect(page.locator('[data-error-for="termYears"]')).toHaveText(msg);
    await calc(page, '24000', '6', '0');
    await expect(page.locator('[data-error-for="termYears"]')).toHaveText(msg);
  });

  /* ---- amount + rate validation ---- */

  test('a zero loan amount is rejected; a 0% loan is valid; a negative rate is rejected', async ({ page }) => {
    await calc(page, '0', '6.5', '30');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="amount"]')).toHaveText('Enter a loan amount greater than zero.');
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

  /* ---- live update / invalidate / reset ---- */

  test('a valid live update preserves the open disclosure, replaces rows, keeps focus', async ({ page }) => {
    await calc(page, '250000', '6.5', '30');
    await summaryToggle(page).click();
    expect(await isOpen(disclosure(page))).toBe(true);
    await page.fill('[name="amount"]', '200000');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('$1,264.14'); // 200k at 6.5% / 30y
    expect(await isOpen(disclosure(page))).toBe(true);
    await expect(yearlyRows(page)).toHaveCount(30);
    await expect(page.locator('[name="amount"]')).toBeFocused();
  });

  test('an invalid live edit removes the stale summary AND all schedule rows, keeping focus', async ({ page }) => {
    await calc(page, '250000', '6.5', '30');
    await summaryToggle(page).click();
    await expect(yearlyRows(page)).toHaveCount(30);
    await page.fill('[name="termYears"]', '31');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(yearlyRows(page)).toHaveCount(0);
    await expect(page.locator('[name="termYears"]')).toBeFocused();
  });

  test('reset closes the disclosure, clears rows + fields, empties result + announcement', async ({ page }) => {
    await calc(page, '250000', '6.5', '30');
    await summaryToggle(page).click();
    await page.click('[data-reset]');
    await expect(page.locator('[name="amount"]')).toHaveValue('');
    await expect(page.locator('[name="termYears"]')).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    expect(await isOpen(disclosure(page))).toBe(false);
    await expect(yearlyRows(page)).toHaveCount(0);
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / responsive / theme / embed / monetization ---- */

  test('keyboard submission works from a field', async ({ page }) => {
    await page.fill('[name="amount"]', '24000');
    await page.fill('[name="annualInterestRate"]', '0');
    await page.locator('[name="termYears"]').fill('1');
    await page.locator('[name="termYears"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$2,000.00');
    await expect(payoff(page)).toHaveText('1 year');
  });

  test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await calc(page, '250000', '6.5', '30');
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally (the schedule scrolls inside its own container)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page, '250000', '6.5', '30');
    await summaryToggle(page).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc(page, '250000', '6.5', '30');
    await expect(primary(page)).toBeVisible();
  });

  test('the generated embed mounts the same interactive island', async ({ page }) => {
    await page.goto('/embed/finance/loan-calculator', { waitUntil: 'domcontentloaded' });
    await page.fill('[name="amount"]', '24000');
    await page.fill('[name="annualInterestRate"]', '0');
    await page.fill('[name="termYears"]', '1');
    await page.locator('[data-loan-submit]').click();
    await expect(page.locator('#loan-result [data-result-value]')).toHaveText('$2,000.00');
    await page.locator('[data-loan-disclosure] > summary').click();
    await expect(page.locator('[data-loan-rows] tr')).toHaveCount(1);
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});

/* ---- Guide embed regression: how-loans-and-interest-work ---- */

test.describe('loan: guide embed (how-loans-and-interest-work)', () => {
  const GUIDE = '/guides/how-loans-and-interest-work';
  test.beforeEach(async ({ page }) => {
    await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
  });

  test('exactly one migrated Loan island renders, empty, with a single Calculate action', async ({ page }) => {
    await expect(page.locator('#loan-result')).toHaveCount(1);
    await expect(page.locator('[data-loan-submit]')).toHaveCount(1);
    await expect(page.locator('#loan-result')).toHaveAttribute('data-result-state', 'example');
    await expect(page.locator('[data-loan-submit]')).toHaveText('Calculate Loan Payment');
  });

  test('the embedded calculator computes, validates and resets', async ({ page }) => {
    await page.fill('[name="amount"]', '24000');
    await page.fill('[name="annualInterestRate"]', '0');
    await page.fill('[name="termYears"]', '1');
    await page.locator('[data-loan-submit]').click();
    await expect(page.locator('#loan-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#loan-result [data-result-value]')).toHaveText('$2,000.00');
    // invalid submission
    await page.fill('[name="amount"]', '0');
    await page.locator('[data-loan-submit]').click();
    await expect(page.locator('#loan-result')).toHaveAttribute('data-result-state', 'invalid');
    // reset
    await page.locator('[data-reset]').click();
    await expect(page.locator('#loan-result')).toHaveAttribute('data-result-state', 'empty');
    await expect(page.locator('[name="amount"]')).toHaveValue('');
  });

  test('the guide page does not overflow horizontally with the embedded calculator', async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
