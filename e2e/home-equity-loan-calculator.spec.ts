import { test, expect, type Page } from '@playwright/test';

/**
 * Home Equity Loan calculator — R15B2 task-first migration (Loan family follow-on, 2 of 3). Wraps the
 * UNCHANGED calculateHomeEquity / @lib/finance `pmt` engine via its OWN home-equity-loan-form.ts binding
 * (imports nothing from loan-form / amortization-form; the islands are NOT merged). Task-first: empty
 * start, "Calculate Home Equity Loan" for the first result, live-after-first. The dominant estimated
 * monthly payment shows first; equity held and the LTV-capped maximum-borrow are the prominent secondary.
 * A requested loan ABOVE the cap is SHOWN (payment + figures render, with a neutral over-limit note),
 * never rejected. There is no amortization schedule (the frozen result exposes none). The borrowing
 * DISCLAIMER is island-owned so it appears exactly once on both the full page and the embed. The
 * complete-result guard lives in the binding's resultValue (NaN sentinel — NO isUsableResult).
 */
const ROUTE = '/finance/home-equity-loan-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#he-result');
const primary = (page: Page) => page.locator('#he-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#he-result [data-result-summary-label]');
const equity = (page: Page) => page.locator('[data-he-equity]');
const maxBorrow = (page: Page) => page.locator('[data-he-max]');
const interpretation = (page: Page) => page.locator('[data-he-interpretation]');
const overlimit = (page: Page) => page.locator('[data-he-overlimit]');
const live = (page: Page) => page.locator('#he-live');
const submit = (page: Page) => page.locator('[data-he-submit]');
const region = (page: Page, when: string) => page.locator(`#he-result [data-result-when~="${when}"]`);
const disclaimer = (page: Page) => page.locator('.he-disclaimer');

const FIELDS = ['homeValue', 'mortgageBalance', 'maxLtvPct', 'loanAmount', 'annualRatePct', 'termYears'] as const;
type Fields = Record<(typeof FIELDS)[number], string>;

const BASE: Fields = {
  homeValue: '400000',
  mortgageBalance: '250000',
  maxLtvPct: '85',
  loanAmount: '50000',
  annualRatePct: '8',
  termYears: '10',
};

const calc = async (page: Page, over: Partial<Fields> = {}) => {
  const v = { ...BASE, ...over };
  for (const name of FIELDS) await page.fill(`[name="${name}"]`, v[name]);
  await submit(page).click();
};

test.describe('home equity loan: task-first', () => {
  /** Clear the arrive-filled starting values, so a test can exercise the blank form. */
  const startBlank = async (page: Page) => {
    await page.locator('[data-reset]').click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  };

  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('loads FILLED with a computed result, "Calculate Home Equity Loan", disclaimer shown', async ({ page }) => {
    // Arrive-filled: the visitor lands on a worked result to type over, not a blank form.
    for (const name of FIELDS) await expect(page.locator(`[name="${name}"]`)).not.toHaveValue('');
    await expect(page.locator('[name="homeValue"]')).toHaveValue('400000');
    await expect(page.locator('[name="loanAmount"]')).toHaveValue('50000');
    await expect(submit(page)).toHaveText('Calculate Home Equity Loan');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(region(page, 'valid')).toBeVisible();
    await expect(region(page, 'empty')).toBeHidden();
    await expect(primary(page)).not.toHaveText('—');
    await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
    // Arriving filled is silent — a result the visitor did not ask for is never announced.
    await expect(live(page)).toHaveText('');
    // Island-owned disclaimer: present exactly once and visible.
    await expect(disclaimer(page)).toHaveCount(1);
    await expect(disclaimer(page)).toBeVisible();
  });

  test('Reset clears the starting values to a genuinely blank, empty-state form', async ({ page }) => {
    await startBlank(page);
    for (const name of FIELDS) await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    await expect(region(page, 'empty')).toBeVisible();
    await expect(region(page, 'valid')).toBeHidden();
    await expect(live(page)).toHaveText('');
    await expect(disclaimer(page)).toBeVisible(); // still shown before any result
  });

  test('the term field carries the migrated-product min/max/step', async ({ page }) => {
    const term = page.locator('[name="termYears"]');
    await expect(term).toHaveAttribute('min', '1');
    await expect(term).toHaveAttribute('max', '30');
    await expect(term).toHaveAttribute('step', '1');
  });

  test('editing over the starting values updates live, with no Calculate press', async ({ page }) => {
    const before = await primary(page).textContent();
    await page.fill('[name="loanAmount"]', '75000');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).not.toHaveText(before!);
  });

  test('once blanked, it does not calculate again before the next explicit submission', async ({ page }) => {
    await startBlank(page);
    for (const name of FIELDS) await page.fill(`[name="${name}"]`, BASE[name]);
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  test('valid result: dominant payment + equity/max-borrow secondary + interpretation + announcement', async ({ page }) => {
    await calc(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Estimated monthly payment');
    await expect(primary(page)).toHaveText('$606.64'); // pmt(50000, 8%/12, 120)
    await expect(equity(page)).toHaveText('$150,000'); // 400000 − 250000
    await expect(maxBorrow(page)).toHaveText('$90,000'); // 0.85·400000 − 250000
    await expect(interpretation(page)).toHaveText('You hold $150,000 of equity; at a 85% loan-to-value cap you could borrow up to $90,000.');
    await expect(overlimit(page)).toBeHidden(); // requested loan is within the cap
    const announcement = await live(page).textContent();
    expect(announcement).toMatch(/^Estimated monthly payment: .+\. You can borrow up to 90000 dollars\.$/);
    // dominant payment visually larger than the supporting metrics
    const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const metricSize = await equity(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(primarySize).toBeGreaterThan(metricSize * 1.5);
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('a requested loan ABOVE the cap is SHOWN, not rejected (payment + over-limit note)', async ({ page }) => {
    // 120000 > 90000 max; 0% keeps the payment a clean 120000/120 = 1000.
    await calc(page, { loanAmount: '120000', annualRatePct: '0', termYears: '10' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid'); // still valid
    await expect(primary(page)).toHaveText('$1,000.00');
    await expect(maxBorrow(page)).toHaveText('$90,000');
    await expect(overlimit(page)).toBeVisible();
    await expect(overlimit(page)).toContainText('$120,000');
    await expect(overlimit(page)).toContainText('$90,000');
    await expect(live(page)).toHaveText('Estimated monthly payment: 1000 dollars. The entered loan is above your 90000 dollars maximum.');
  });

  test('an underwater mortgage shows zero equity and zero borrow, still a valid payment', async ({ page }) => {
    await calc(page, { homeValue: '300000', mortgageBalance: '350000', loanAmount: '50000', annualRatePct: '0', termYears: '10' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(equity(page)).toHaveText('$0');
    await expect(maxBorrow(page)).toHaveText('$0');
    await expect(primary(page)).toHaveText('$416.67'); // 50000 / 120
    await expect(overlimit(page)).toBeVisible(); // any loan exceeds a $0 maximum
  });

  /* ---- validation ---- */

  test('field validation: home value > 0, mortgage >= 0, LTV in (0,100], loan > 0, rate >= 0, term 1–30', async ({ page }) => {
    await calc(page, { homeValue: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="homeValue"]')).toHaveText('Enter a home value greater than zero.');

    await calc(page, { mortgageBalance: '-1' });
    await expect(page.locator('[data-error-for="mortgageBalance"]')).toHaveText('Enter a mortgage balance of zero or more.');

    await calc(page, { maxLtvPct: '150' });
    await expect(page.locator('[data-error-for="maxLtvPct"]')).toHaveText('Enter a loan-to-value between 0 and 100 percent.');

    await calc(page, { loanAmount: '0' });
    await expect(page.locator('[data-error-for="loanAmount"]')).toHaveText('Enter a loan amount greater than zero.');

    await calc(page, { annualRatePct: '-1' });
    await expect(page.locator('[data-error-for="annualRatePct"]')).toHaveText('Enter an interest rate of zero or more.');

    await calc(page, { termYears: '31' });
    await expect(page.locator('[data-error-for="termYears"]')).toHaveText('Enter a whole loan term from 1 to 30 years.');
    await calc(page, { termYears: '2.5' });
    await expect(page.locator('[data-error-for="termYears"]')).toHaveText('Enter a whole loan term from 1 to 30 years.');
  });

  test('a 0% rate and a no-mortgage (0) balance are both valid', async ({ page }) => {
    await calc(page, { mortgageBalance: '0', annualRatePct: '0', loanAmount: '60000', termYears: '5' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$1,000.00'); // 60000 / 60
    await expect(equity(page)).toHaveText('$400,000'); // no mortgage → full value is equity
  });

  test('an empty explicit submission focuses the home value and associates the error', async ({ page }) => {
    await startBlank(page);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    const home = page.locator('[name="homeValue"]');
    await expect(home).toBeFocused();
    await expect(home).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-error-for="homeValue"]')).toHaveText('Enter your home value.');
  });

  /* ---- live update / invalidate / reset ---- */

  test('a valid live update recomputes without moving focus', async ({ page }) => {
    await calc(page);
    await page.fill('[name="loanAmount"]', '30000');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('$363.98'); // pmt(30000, 8%/12, 120)
    await expect(page.locator('[name="loanAmount"]')).toBeFocused();
  });

  test('an invalid live edit removes the stale valid result, keeping focus', async ({ page }) => {
    await calc(page);
    await expect(region(page, 'valid')).toBeVisible();
    await page.fill('[name="termYears"]', '31');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(page.locator('[name="termYears"]')).toBeFocused();
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
    await page.locator('[name="termYears"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$606.64');
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

  test('the borrowing disclaimer appears exactly once on the full page', async ({ page }) => {
    await expect(disclaimer(page)).toHaveCount(1);
    // The "not financial advice" wording is not duplicated in the page content.
    await expect(page.getByText(/not financial advice/i)).toHaveCount(1);
  });

  test('the generated embed mounts the same island and shows the disclaimer once', async ({ page }) => {
    await page.goto('/embed/finance/home-equity-loan-calculator', { waitUntil: 'domcontentloaded' });
    await expect(disclaimer(page)).toHaveCount(1);
    for (const name of FIELDS) await page.fill(`[name="${name}"]`, BASE[name]);
    await page.locator('[data-he-submit]').click();
    await expect(page.locator('#he-result [data-result-value]')).toHaveText('$606.64');
    await expect(page.locator('#he-result [data-he-max]')).toHaveText('$90,000');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});
