import { test, expect, type Page } from '@playwright/test';

/**
 * Auto Loan calculator — R11C1 task-first migration (finance complex-form). Wraps the UNCHANGED
 * calculateAutoLoan / @lib/finance engine; the complete-result guard lives in the binding's
 * resultValue (NaN sentinel — NO isUsableResult). Task-first: empty personal fields, term 60 +
 * "Finance taxes and fees" checked as structural defaults, "Calculate Auto Loan Payment" for the first
 * result, live-after-first. Sales tax is on the FULL price (no trade-in credit); negative trade-in
 * equity is supported and shown signed; a zero financed balance is a valid informational result.
 */
const ROUTE = '/finance/auto-loan-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#al-result');
const primary = (page: Page) => page.locator('#al-result [data-result-value]');
const financedAmt = (page: Page) => page.locator('[data-al-financed]');
const tax = (page: Page) => page.locator('[data-al-tax]');
const interest = (page: Page) => page.locator('[data-al-interest]');
const top = (page: Page) => page.locator('[data-al-top]');
const upfront = (page: Page) => page.locator('[data-al-upfront]');
const totalCost = (page: Page) => page.locator('[data-al-total]');
const interpretation = (page: Page) => page.locator('[data-al-interpretation]');
const toggleNote = (page: Page) => page.locator('[data-al-toggle-note]');
const equityRow = (page: Page) => page.locator('[data-al-equity-row]');
const equityVal = (page: Page) => page.locator('[data-al-equity]');
const equityNote = (page: Page) => page.locator('[data-al-equity-note]');
const live = (page: Page) => page.locator('#al-live');
const submit = (page: Page) => page.locator('[data-al-submit]');
const finance = (page: Page) => page.locator('[name="includeTaxesFeesInLoan"]');
const term = (page: Page) => page.locator('[name="loanTermMonths"]');
const region = (page: Page, when: string) => page.locator(`#al-result [data-result-when~="${when}"]`);

const calc = async (page: Page, price: string, rate: string, opts: { down?: string; tax?: string } = {}) => {
  await page.fill('[name="autoPrice"]', price);
  await page.fill('[name="interestRatePct"]', rate);
  if (opts.down !== undefined) await page.fill('[name="downPayment"]', opts.down);
  if (opts.tax !== undefined) await page.fill('[name="salesTaxRatePct"]', opts.tax);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: blank personal fields, term 60, finance checked, empty result, no auto-calc', async ({ page }) => {
  await expect(page.locator('[name="autoPrice"]')).toHaveValue('');
  await expect(page.locator('[name="interestRatePct"]')).toHaveValue('');
  await expect(page.locator('[name="downPayment"]')).toHaveValue('');
  await expect(term(page)).toHaveValue('60');
  await expect(finance(page)).toBeChecked();
  await expect(submit(page)).toHaveText('Calculate Auto Loan Payment');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  // The example fills this calculator's OWN valid region, so it is visible on load.
  await expect(region(page, 'valid')).toBeVisible();
  await expect(live(page)).toHaveText('');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="autoPrice"]', '30000');
  await page.fill('[name="interestRatePct"]', '5');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('the optional trade-in & fees disclosure is closed initially and its fields are hidden', async ({ page }) => {
  expect(await page.locator('[data-al-disclosure]').evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  await expect(page.locator('[name="tradeInValue"]')).toBeHidden();
  await page.locator('[data-al-disclosure] > summary').click();
  await expect(page.locator('[name="tradeInValue"]')).toBeVisible();
});

/* ---- Ordinary result ---------------------------------------------------- */

test('ordinary financed loan: payment, financed amount, sales tax, interest, total of payments, announcement', async ({ page }) => {
  await page.fill('[name="autoPrice"]', '30000');
  await page.fill('[name="interestRatePct"]', '5');
  await page.fill('[name="downPayment"]', '3000');
  await page.fill('[name="salesTaxRatePct"]', '7');
  await page.locator('[data-al-disclosure] > summary').click();
  await page.fill('[name="fees"]', '300');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$554.81');
  await expect(financedAmt(page)).toHaveText('$29,400');
  await expect(tax(page)).toHaveText('$2,100.00');
  await expect(interest(page)).toHaveText('$3,889');
  await expect(top(page)).toHaveText('$33,289');
  await expect(upfront(page)).toHaveText('$3,000.00');
  await expect(totalCost(page)).toHaveText('$36,289');
  await expect(interpretation(page)).toContainText('$554.81 per month for 60 months');
  await expect(live(page)).toHaveText('Your estimated monthly payment is 554 dollars and 81 cents.');
});

test('a zero interest rate is valid (payment = financed / months, no interest)', async ({ page }) => {
  await calc(page, '30000', '0', { down: '3000', tax: '7' });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$485.00'); // (30000 + 2100 tax − 3000 down) / 60, no fees
  await expect(interest(page)).toHaveText('$0');
});

test('no NaN / Infinity / undefined for an ordinary result', async ({ page }) => {
  await calc(page, '30000', '5', { down: '3000' });
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

test('the result states USD and the tax-jurisdiction assumption', async ({ page }) => {
  await calc(page, '30000', '5');
  await expect(shell(page)).toContainText('US dollars (USD)');
  await expect(shell(page)).toContainText('applies the entered sales-tax rate to the full vehicle price and does not apply a trade-in tax credit');
});

/* ---- Finance-taxes-and-fees toggle -------------------------------------- */

test('toggling finance OFF before the first calculation does not calculate', async ({ page }) => {
  await finance(page).uncheck();
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('after the first result, toggling finance recalculates live, keeps focus on the checkbox, one announcement', async ({ page }) => {
  await page.fill('[name="autoPrice"]', '30000');
  await page.fill('[name="interestRatePct"]', '5');
  await page.fill('[name="downPayment"]', '3000');
  await page.fill('[name="salesTaxRatePct"]', '7');
  await page.locator('[data-al-disclosure] > summary').click();
  await page.fill('[name="fees"]', '300');
  await submit(page).click();
  await expect(primary(page)).toHaveText('$554.81');
  await expect(toggleNote(page)).toContainText('includes the entered sales tax and fees');

  await finance(page).uncheck();
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('$509.52'); // taxes/fees no longer financed
  await expect(financedAmt(page)).toHaveText('$27,000');
  await expect(upfront(page)).toHaveText('$5,400.00');
  await expect(toggleNote(page)).toContainText('excludes the entered sales tax and fees');
  await expect(finance(page)).toBeFocused(); // focus stays on the checkbox
});

test('changing the loan term recalculates after the first result (shorter term → higher payment)', async ({ page }) => {
  await calc(page, '30000', '5', { down: '3000', tax: '7' });
  const num = async () => parseFloat((await primary(page).textContent())!.replace(/[$,]/g, ''));
  const p60 = await num();
  await term(page).selectOption('36');
  await page.waitForTimeout(DEBOUNCE);
  const p36 = await num();
  expect(p36).toBeGreaterThan(p60);
});

/* ---- Trade-in / negative equity ----------------------------------------- */

test('negative trade-in equity is supported and shown as a signed value, not a positive credit', async ({ page }) => {
  await page.fill('[name="autoPrice"]', '30000');
  await page.fill('[name="interestRatePct"]', '5');
  await page.fill('[name="downPayment"]', '3000');
  await page.fill('[name="salesTaxRatePct"]', '7');
  await page.locator('[data-al-disclosure] > summary').click();
  await page.fill('[name="tradeInValue"]', '10000');
  await page.fill('[name="amountOwedOnTradeIn"]', '14000');
  await page.fill('[name="fees"]', '300');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(financedAmt(page)).toHaveText('$33,400'); // negative equity increased the loan
  await expect(equityRow(page)).toBeVisible();
  await expect(equityVal(page)).toHaveText('−$4,000.00'); // signed, not positive
  await expect(equityNote(page)).toContainText('$4,000.00 of negative equity');
});

test('a positive / no trade-in shows no negative-equity row', async ({ page }) => {
  await calc(page, '30000', '5', { down: '3000' });
  await expect(equityRow(page)).toBeHidden();
  await expect(equityNote(page)).toBeHidden();
});

/* ---- Zero financed balance (informational) ------------------------------ */

test('a zero financed balance is a VALID informational result, not an error', async ({ page }) => {
  await calc(page, '30000', '5', { down: '35000' }); // credits exceed the base
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid'); // NOT invalid
  await expect(primary(page)).toHaveText('$0.00');
  await expect(financedAmt(page)).toHaveText('$0');
  await expect(interest(page)).toHaveText('$0');
  await expect(interpretation(page)).toContainText('no auto-loan balance remains');
  await expect(live(page)).toHaveText('No auto-loan balance remains based on the entered values.');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty submission focuses the vehicle price first and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const price = page.locator('[name="autoPrice"]');
  await expect(price).toBeFocused();
  await expect(price).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="autoPrice"]')).toHaveText('Enter a vehicle price.');
});

test('a zero vehicle price and a negative rate are field errors', async ({ page }) => {
  await calc(page, '0', '5');
  await expect(page.locator('[data-error-for="autoPrice"]')).toHaveText('Enter a vehicle price greater than zero.');
  await calc(page, '30000', '-2');
  await expect(page.locator('[data-error-for="interestRatePct"]')).toHaveText('Enter an interest rate of zero or more.');
});

test('a negative optional amount is a field error; empty optionals are fine', async ({ page }) => {
  await page.fill('[name="autoPrice"]', '30000');
  await page.fill('[name="interestRatePct"]', '5');
  await page.fill('[name="downPayment"]', '-500');
  await submit(page).click();
  await expect(page.locator('[data-error-for="downPayment"]')).toHaveText('Enter a down payment of zero or more.');
});

/* ---- Reset -------------------------------------------------------------- */

test('reset clears fields, restores term 60 + finance checked + closed disclosure, empties result', async ({ page }) => {
  await calc(page, '30000', '5', { down: '3000' });
  await term(page).selectOption('72');
  await finance(page).uncheck();
  await page.locator('[data-al-disclosure] > summary').click();
  await page.click('[data-reset]');
  await expect(page.locator('[name="autoPrice"]')).toHaveValue('');
  await expect(page.locator('[name="downPayment"]')).toHaveValue('');
  await expect(term(page)).toHaveValue('60');
  await expect(finance(page)).toBeChecked();
  expect(await page.locator('[data-al-disclosure]').evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(live(page)).toHaveText('');
});

test('keyboard submission works from a field', async ({ page }) => {
  await page.fill('[name="autoPrice"]', '30000');
  await page.locator('[name="interestRatePct"]').fill('0');
  await page.locator('[name="interestRatePct"]').press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

/* ---- Responsive / theme / embed / guide / monetization ------------------ */

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calc(page, '30000', '5', { down: '3000' });
  await expect(primary(page)).toBeInViewport();
});

test('mobile does not overflow horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calc(page, '30000', '5', { down: '3000' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calc(page, '30000', '5', { down: '3000' });
  await expect(primary(page)).toBeVisible();
});

test('the generated embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/finance/auto-loan-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="autoPrice"]', '30000');
  await page.fill('[name="interestRatePct"]', '0');
  await page.fill('[name="downPayment"]', '3000');
  await page.fill('[name="salesTaxRatePct"]', '7');
  await page.locator('[data-al-submit]').click();
  await expect(page.locator('#al-result [data-result-value]')).toHaveText('$485.00');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});

/* ---- Guide-embedded regression ------------------------------------------ */

test.describe('guide embed (getting-the-best-auto-loan)', () => {
  const GUIDE = '/guides/getting-the-best-auto-loan';

  test('the guide embeds one task-first calculator, empty with no stale result', async ({ page }) => {
    await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-autoloan]')).toHaveCount(1);
    await expect(page.locator('[name="autoPrice"]')).toHaveValue('');
    await expect(page.locator('#al-result')).toHaveAttribute('data-result-state', 'example');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1); // no duplicated H1
  });

  test('the guide-embedded calculator computes a valid result', async ({ page }) => {
    await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
    await page.fill('[name="autoPrice"]', '30000');
    await page.fill('[name="interestRatePct"]', '0');
    await page.fill('[name="downPayment"]', '3000');
    await page.fill('[name="salesTaxRatePct"]', '7');
    await page.locator('[data-al-submit]').click();
    await expect(page.locator('#al-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#al-result [data-result-value]')).toHaveText('$485.00');
  });
});
