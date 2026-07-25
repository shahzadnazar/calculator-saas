import { test, expect, type Page } from '@playwright/test';

/**
 * Mortgage calculator — R11E1 task-first migration (finance complex-form; the fourth and final). Wraps
 * the UNCHANGED DEDICATED calculateMortgage / toYearlySchedule engine (its OWN PMI-aware schedule — NOT
 * @lib/finance / the Amortization binding); the complete-result guard lives in the binding's resultValue
 * (a NaN sentinel — NO isUsableResult). Task-first: empty fields, "Calculate Mortgage" for the first
 * result, live-after-first. The estimated monthly payment (PITI + HOA) is dominant; the yearly schedule
 * is a closed <details> disclosure; a down payment equal to the price is a valid zero-mortgage.
 */
const ROUTE = '/finance/mortgage-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#mc-result');
const primary = (page: Page) => page.locator('#mc-result [data-result-value]');
const interpretation = (page: Page) => page.locator('[data-mc-interpretation]');
const downPct = (page: Page) => page.locator('[data-mc-down-pct]');
const disclosure = (page: Page) => page.locator('[data-mc-disclosure]');
const scheduleBlock = (page: Page) => page.locator('[data-mc-schedule-block]');
const rows = (page: Page) => page.locator('[data-mc-rows] tr');
const live = (page: Page) => page.locator('#mc-live');
const submit = (page: Page) => page.locator('[data-mc-submit]');
const region = (page: Page, when: string) => page.locator(`#mc-result [data-result-when~="${when}"]`);
const fieldError = (page: Page, name: string) => page.locator(`[data-error-for="${name}"]`);

const fillCore = async (
  page: Page,
  price: string,
  down: string,
  term: string,
  rate: string,
) => {
  await page.fill('[name="homePrice"]', price);
  if (down !== '') await page.fill('[name="downPayment"]', down);
  await page.selectOption('[name="loanTermYears"]', term);
  await page.fill('[name="annualInterestRate"]', rate);
};

const openCosts = (page: Page) => page.locator('summary', { hasText: 'Taxes, insurance' }).click();

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: blank fields, term defaults to 30, empty result, Calculate Mortgage, no auto-calc', async ({ page }) => {
  await expect(page.locator('[name="homePrice"]')).toHaveValue('');
  await expect(page.locator('[name="downPayment"]')).toHaveValue('');
  await expect(page.locator('[name="annualInterestRate"]')).toHaveValue('');
  await expect(page.locator('[name="loanTermYears"]')).toHaveValue('30');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(submit(page)).toHaveText('Calculate Mortgage');
  await expect(downPct(page)).toBeHidden();
});

test('does not calculate before the first submission', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Ordinary results --------------------------------------------------- */

test('P&I-only mortgage: the monthly total is the principal & interest, with a loan summary', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$1,820.36'); // no taxes/insurance/PMI entered
  await expect(page.locator('[data-mc-pi]')).toHaveText('$1,820.36');
  await expect(page.locator('[data-mc-tax]')).toHaveText('$0.00');
  await expect(page.locator('[data-mc-pmi]')).toHaveText('$0.00');
  await expect(page.locator('[data-mc-loan]')).toHaveText('$288,000');
});

test('full PITI: taxes, insurance and HOA add into the monthly total', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await openCosts(page);
  await page.fill('[name="propertyTaxAnnual"]', '3600');
  await page.fill('[name="homeInsuranceAnnual"]', '1200');
  await submit(page).click();
  await expect(primary(page)).toHaveText('$2,220.36'); // 1820.36 + 300 tax + 100 insurance
  await expect(page.locator('[data-mc-tax]')).toHaveText('$300.00');
  await expect(page.locator('[data-mc-ins]')).toHaveText('$100.00');
});

test('the announcement states the dominant monthly payment', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(live(page)).toContainText('estimated monthly payment is 1820 dollars and 36 cents');
});

test('the term select drives the schedule length', async ({ page }) => {
  await fillCore(page, '360000', '72000', '15', '6.5');
  await submit(page).click();
  await disclosure(page).locator('summary').click();
  await expect(rows(page)).toHaveCount(15);
  // Switch to 30 years live and re-open.
  await page.selectOption('[name="loanTermYears"]', '30');
  await page.waitForTimeout(DEBOUNCE);
  await expect(rows(page)).toHaveCount(30);
});

test('a live "% down" readout appears beside the down payment', async ({ page }) => {
  await page.fill('[name="homePrice"]', '360000');
  await page.fill('[name="downPayment"]', '72000');
  await expect(downPct(page)).toBeVisible();
  await expect(downPct(page)).toHaveText('20% down');
});

/* ---- PMI ---------------------------------------------------------------- */

test('under 20% down applies PMI and the interpretation explains it', async ({ page }) => {
  await fillCore(page, '400000', '40000', '30', '6'); // 10% down
  await openCosts(page);
  await page.fill('[name="pmiAnnualRate"]', '0.5');
  await submit(page).click();
  await expect(page.locator('[data-mc-pmi]')).toHaveText('$150.00');
  await expect(interpretation(page)).toContainText('PMI');
  await expect(interpretation(page)).toContainText('20% down removes it');
});

test('at 20% down there is no PMI', async ({ page }) => {
  await fillCore(page, '400000', '80000', '30', '6'); // exactly 20%
  await openCosts(page);
  await page.fill('[name="pmiAnnualRate"]', '0.5');
  await submit(page).click();
  await expect(page.locator('[data-mc-pmi]')).toHaveText('$0.00');
  await expect(interpretation(page)).toContainText('no PMI');
});

/* ---- Zero mortgage ------------------------------------------------------ */

test('a down payment equal to the price is a valid zero-mortgage with the schedule hidden', async ({ page }) => {
  await fillCore(page, '300000', '300000', '30', '6');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$0.00');
  await expect(interpretation(page)).toContainText('no mortgage'); // no-cost branch: "…no mortgage and no ongoing monthly cost…"
  await expect(page.locator('[data-mc-loan]')).toHaveText('$0');
  await expect(scheduleBlock(page)).toBeHidden();
});

/* ---- Schedule disclosure ------------------------------------------------ */

test('the schedule is a disclosure, closed by default, revealing Year/Principal/Interest/Balance rows', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(disclosure(page)).not.toHaveAttribute('open', '');
  await expect(rows(page).first()).toBeHidden(); // collapsed
  await disclosure(page).locator('summary').click();
  await expect(rows(page)).toHaveCount(30);
  // First yearly row is Year 1 with a decreasing balance below the loan amount.
  await expect(rows(page).first().locator('th')).toHaveText('1');
});

test('no NaN / Infinity / undefined leaks into the rendered result', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await openCosts(page);
  await page.fill('[name="propertyTaxAnnual"]', '3600');
  await submit(page).click();
  await disclosure(page).locator('summary').click();
  expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
});

test('the result states its PITI / USD assumptions', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(region(page, 'valid')).toContainText('PITI');
  await expect(region(page, 'valid')).toContainText('USD');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty home price is a field error on submit', async ({ page }) => {
  await page.fill('[name="annualInterestRate"]', '6');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(fieldError(page, 'homePrice')).toBeVisible();
  await expect(page.locator('[name="homePrice"]')).toBeFocused();
});

test('a down payment above the home price is a field error on the down payment', async ({ page }) => {
  await fillCore(page, '300000', '400000', '30', '6');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(fieldError(page, 'downPayment')).toContainText('no greater than the home price');
});

test('a negative interest rate is a field error; 0% is valid', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '-1');
  await submit(page).click();
  await expect(fieldError(page, 'annualInterestRate')).toBeVisible();

  // The first submit failed, so live-after-first is not yet active — an explicit re-submit is needed.
  await page.fill('[name="annualInterestRate"]', '0');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$800.00'); // 288000 / 360, principal only
});

test('an invalid live edit clears the stale schedule rows', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await disclosure(page).locator('summary').click();
  await expect(rows(page)).toHaveCount(30);
  // Break the price live → invalid → the observer drops the rows.
  await page.fill('[name="homePrice"]', '0');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(rows(page)).toHaveCount(0);
});

/* ---- Interaction -------------------------------------------------------- */

test('after the first result, editing updates live and keeps focus on the edited field', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(primary(page)).toHaveText('$1,820.36');
  const rate = page.locator('[name="annualInterestRate"]');
  await rate.focus();
  await rate.fill('7');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).not.toHaveText('$1,820.36');
  await expect(rate).toBeFocused();
});

test('reset clears fields, result, announcement, restores the term and closes the disclosure', async ({ page }) => {
  await fillCore(page, '360000', '72000', '15', '6.5');
  await submit(page).click();
  await disclosure(page).locator('summary').click();
  await expect(disclosure(page)).toHaveAttribute('open', '');

  await page.locator('[data-reset]').click();
  await expect(page.locator('[name="homePrice"]')).toHaveValue('');
  await expect(page.locator('[name="loanTermYears"]')).toHaveValue('30'); // default restored
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(live(page)).toHaveText('');
  await expect(downPct(page)).toBeHidden();
});

/* ---- Responsive / theme / embed / guide / monetization ------------------ */

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(primary(page)).toBeInViewport();
});

test('mobile does not overflow horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(primary(page)).toBeVisible();
});

test('the generated embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/finance/mortgage-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="homePrice"]', '360000');
  await page.fill('[name="downPayment"]', '72000');
  await page.selectOption('[name="loanTermYears"]', '30');
  await page.fill('[name="annualInterestRate"]', '6.5');
  await page.locator('[data-mc-submit]').click();
  await expect(page.locator('#mc-result [data-result-value]')).toHaveText('$1,820.36');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});

/* ---- Guide-embedded regressions ----------------------------------------- */

for (const GUIDE of ['/guides/rent-vs-buy-a-home', '/guides/how-much-house-can-you-afford']) {
  test.describe(`guide embed (${GUIDE})`, () => {
    test('embeds one task-first calculator, empty with no stale result', async ({ page }) => {
      await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-mortgage]')).toHaveCount(1);
      await expect(page.locator('[name="homePrice"]')).toHaveValue('');
      await expect(page.locator('#mc-result')).toHaveAttribute('data-result-state', 'empty');
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1); // no duplicated H1
    });

    test('the guide-embedded calculator computes a valid result', async ({ page }) => {
      await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
      await page.fill('[name="homePrice"]', '360000');
      await page.fill('[name="downPayment"]', '72000');
      await page.selectOption('[name="loanTermYears"]', '30');
      await page.fill('[name="annualInterestRate"]', '6.5');
      await page.locator('[data-mc-submit]').click();
      await expect(page.locator('#mc-result')).toHaveAttribute('data-result-state', 'valid');
      await expect(page.locator('#mc-result [data-result-value]')).toHaveText('$1,820.36');
    });
  });
}
