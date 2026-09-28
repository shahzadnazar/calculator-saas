import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Loan calculator — three loan modes, one set of fields, two schedule views.
 *
 * Wraps the pure calculateExtendedLoan engine via its OWN loan-form.ts binding (imports nothing
 * from amortization-form; the two islands are NOT merged). Task-first: empty fields behind a
 * labelled example, "Calculate Loan Payment" for the first result, live-after-first. The dominant
 * figure and its label change with the mode (payment / amount due at maturity / amount received
 * today); the schedule is a native <details> disclosure (closed by default) built via the DOM API
 * (no innerHTML) with an Annual/Monthly switch that is presentation-only. The complete-result guard
 * lives in the binding's resultValue (NaN sentinel — NO isUsableResult).
 */
const ROUTE = '/finance/loan-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#loan-result');
const primary = (page: Page) => page.locator('#loan-result [data-result-when~="valid"] [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#loan-result [data-result-summary-label]');
const interest = (page: Page) => page.locator('[data-loan-interest]');
const total = (page: Page) => page.locator('[data-loan-total]');
const totalLabel = (page: Page) => page.locator('[data-loan-total-label]');
const payoff = (page: Page) => page.locator('[data-loan-payoff]');
const live = (page: Page) => page.locator('#loan-live');
const submit = (page: Page) => page.locator('[data-loan-submit]');
const region = (page: Page, when: string) => page.locator(`#loan-result [data-result-when~="${when}"]`);
const disclosure = (page: Page) => page.locator('[data-loan-disclosure]');
const summaryToggle = (page: Page) => page.locator('[data-loan-disclosure] > summary');
const yearlyRows = (page: Page) => page.locator('[data-loan-rows="yearly"] tr');
const detailRows = (page: Page) => page.locator('[data-loan-rows="detail"] tr.loan-row');
const yearEnds = (page: Page) => page.locator('[data-loan-rows="detail"] tr.loan-year-end');
const isOpen = (d: Locator) => d.evaluate((el) => (el as HTMLDetailsElement).open);

const TERM_MSG = 'Enter a whole number of years from 0 to 30.';

const calc = async (
  page: Page,
  amount: string,
  rate: string,
  term: string,
  extra: { mode?: string; months?: string; compound?: string; payback?: string } = {},
) => {
  if (extra.mode) await page.check(`[name="mode"][value="${extra.mode}"]`);
  if (extra.compound) await page.selectOption('[name="compoundKey"]', extra.compound);
  if (extra.payback) await page.selectOption('[name="paybackKey"]', extra.payback);
  await page.fill('[name="amount"]', amount);
  await page.fill('[name="annualInterestRate"]', rate);
  await page.fill('[name="termYears"]', term);
  await page.fill('[name="termMonths"]', extra.months ?? '');
  await submit(page).click();
};

test.describe('loan: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('loads empty: blank fields, amortized mode, labelled example, disclosure closed', async ({ page }) => {
    for (const name of ['amount', 'annualInterestRate', 'termYears', 'termMonths']) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    }
    await expect(page.locator('[name="mode"][value="amortized"]')).toBeChecked();
    await expect(page.locator('[name="compoundKey"]')).toHaveValue('monthly');
    await expect(page.locator('[name="paybackKey"]')).toHaveValue('month');
    await expect(submit(page)).toHaveText('Calculate Loan Payment');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(region(page, 'empty')).toBeHidden();
    await expect(region(page, 'valid')).toBeVisible();
    await expect(live(page)).toHaveText('');
    expect(await isOpen(disclosure(page))).toBe(false);
    await expect(yearlyRows(page)).not.toHaveCount(0); // the example prepares its own schedule
  });

  test('the term fields carry the years 0–30 / months 0–11 bounds', async ({ page }) => {
    const years = page.locator('[name="termYears"]');
    await expect(years).toHaveAttribute('min', '0');
    await expect(years).toHaveAttribute('max', '30');
    await expect(years).toHaveAttribute('step', '1');
    const months = page.locator('[name="termMonths"]');
    await expect(months).toHaveAttribute('min', '0');
    await expect(months).toHaveAttribute('max', '11');
  });

  test('does not calculate before the first submission', async ({ page }) => {
    await page.fill('[name="amount"]', '250000');
    await page.fill('[name="annualInterestRate"]', '6.5');
    await page.fill('[name="termYears"]', '30');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- amortized (the default mode) ---- */

  test('amortized: dominant payment + totals + announcement; disclosure CLOSED, rows prepared', async ({ page }) => {
    await calc(page, '250000', '6.5', '30');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Payment every month');
    await expect(primary(page)).toHaveText('$1,580.17');
    await expect(totalLabel(page)).toHaveText('Total of 360 payments');
    await expect(total(page)).toHaveText('$568,861.22');
    await expect(interest(page)).toHaveText('$318,861.22');
    await expect(payoff(page)).toHaveText('30 years');
    await expect(live(page)).toHaveText(
      'Your payment is 1580 dollars and 17 cents every month over 360 payments, with 318861 dollars and 22 cents in total interest.',
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

  /* ---- deferred + bond ---- */

  test('deferred: one lump sum at maturity, labelled as such, balance only ever grows', async ({ page }) => {
    await calc(page, '100000', '6', '10', { mode: 'deferred', compound: 'annually' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Amount due at loan maturity');
    await expect(primary(page)).toHaveText('$179,084.77');
    await expect(totalLabel(page)).toHaveText('Amount due at maturity');
    await expect(total(page)).toHaveText('$179,084.77');
    await expect(interest(page)).toHaveText('$79,084.77');
    await expect(live(page)).toHaveText(
      'The amount due at maturity is 179084 dollars and 77 cents, including 79084 dollars and 77 cents in total interest.',
    );
    // A deferred loan pays back nothing before maturity, so the schedule closes on the amount due.
    await summaryToggle(page).click();
    await expect(yearlyRows(page)).toHaveCount(10);
    await expect(yearlyRows(page).first().locator('td').last()).toHaveText('$106,000');
    await expect(yearlyRows(page).last().locator('td').last()).toHaveText('$179,085');
  });

  test('bond: the amount received today for a predetermined amount due', async ({ page }) => {
    await calc(page, '100000', '6', '10', { mode: 'bond', compound: 'annually' });
    await expect(summaryLabel(page)).toHaveText('Amount received when the loan starts');
    await expect(primary(page)).toHaveText('$55,839.48');
    await expect(total(page)).toHaveText('$100,000.00');
    await expect(interest(page)).toHaveText('$44,160.52');
    await summaryToggle(page).click();
    await expect(yearlyRows(page).last().locator('td').last()).toHaveText('$100,000');
  });

  test('switching mode relabels the amount field and hides Pay Back where it is meaningless', async ({ page }) => {
    const amountLabel = page.locator('[data-loan-amount-label]');
    const payback = page.locator('[data-loan-payback]');
    await expect(amountLabel).toHaveText('Loan amount');
    await expect(payback).toBeVisible();
    await page.check('[name="mode"][value="bond"]');
    await expect(amountLabel).toHaveText('Predetermined due amount');
    await expect(payback).toBeHidden();
    await page.check('[name="mode"][value="deferred"]');
    await expect(amountLabel).toHaveText('Loan amount');
    await expect(payback).toBeHidden();
    await page.check('[name="mode"][value="amortized"]');
    await expect(amountLabel).toHaveText('Loan amount');
    await expect(payback).toBeVisible();
  });

  /* ---- compounding + payback frequency ---- */

  test('the compound setting changes the answer, not just a label', async ({ page }) => {
    await calc(page, '20000', '5', '5', { compound: 'annually' });
    const annually = await primary(page).innerText();
    await page.selectOption('[name="compoundKey"]', 'daily');
    await page.waitForTimeout(DEBOUNCE);
    const daily = await primary(page).innerText();
    expect(annually).not.toBe(daily);
    const num = (s: string) => Number(s.replace(/[^0-9.]/g, ''));
    expect(num(annually)).toBeLessThan(num(daily));
  });

  test('paying back quarterly re-cadences the payment, the label and the schedule', async ({ page }) => {
    await calc(page, '20000', '5', '5', { months: '6', payback: 'quarter' });
    await expect(summaryLabel(page)).toHaveText('Payment every quarter');
    await expect(primary(page)).toHaveText('$1,046.04');
    await expect(totalLabel(page)).toHaveText('Total of 22 payments');
    await expect(payoff(page)).toHaveText('5 years 6 months');
    await summaryToggle(page).click();
    await page.check('[name="loan-view"][value="detail"]');
    await expect(page.locator('[data-loan-period-head]')).toHaveText('Quarter');
    await expect(detailRows(page)).toHaveCount(22);
  });

  /* ---- the two schedules ---- */

  test('Annual and Monthly are one switch over rows the runtime already rendered', async ({ page }) => {
    await calc(page, '100000', '6', '10', { mode: 'deferred', compound: 'annually' });
    await summaryToggle(page).click();
    expect(await isOpen(disclosure(page))).toBe(true);
    await expect(page.locator('#loan-result table caption')).toHaveText(/schedule/i);
    await expect(page.locator('#loan-result thead th[scope="col"]')).toHaveCount(4);

    // Annual is the default view: 10 rows, year as the row header.
    await expect(yearlyRows(page).first()).toBeVisible();
    await expect(detailRows(page).first()).toBeHidden();
    await expect(page.locator('[data-loan-rows="yearly"] tr th[scope="row"]')).toHaveCount(10);

    // The control names itself: Schedule — Annual / Monthly.
    await expect(page.locator('.loan-view__legend')).toHaveText('Schedule');
    await expect(page.locator('[name="loan-view"][value="yearly"] + span')).toHaveText('Annual');
    await expect(page.locator('[name="loan-view"][value="detail"] + span')).toHaveText('Monthly');

    // Monthly: 120 rows plus a "Year #N End" separator closing each year.
    await page.check('[name="loan-view"][value="detail"]');
    await expect(detailRows(page).first()).toBeVisible();
    await expect(yearlyRows(page).first()).toBeHidden();
    await expect(detailRows(page)).toHaveCount(120);
    await expect(yearEnds(page)).toHaveCount(10);
    await expect(yearEnds(page).first()).toContainText('Year #1 End');
    await expect(yearEnds(page).first().locator('td')).toHaveText('$106,000');
    await expect(yearEnds(page).last()).toContainText('Year #10 End');
  });

  test('an amortized schedule ends at $0 in both views', async ({ page }) => {
    await calc(page, '250000', '6.5', '30');
    await summaryToggle(page).click();
    await expect(yearlyRows(page).last().locator('td').last()).toHaveText('$0');
    await page.check('[name="loan-view"][value="detail"]');
    await expect(detailRows(page)).toHaveCount(360);
    await expect(detailRows(page).last().locator('td').last()).toHaveText('$0');
  });

  /* ---- term boundary (0–30 years + 0–11 months, at least one month) ---- */

  test('a 30-year term is valid with 30 yearly rows; above 30 is rejected with the single term message', async ({ page }) => {
    await calc(page, '250000', '6.5', '30');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(yearlyRows(page)).toHaveCount(30);
    await calc(page, '250000', '6.5', '31');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="termYears"]')).toHaveText(TERM_MSG);
  });

  test('a 1-year term is valid with exactly 1 yearly row; a fractional term is rejected (never rounded)', async ({ page }) => {
    await calc(page, '24000', '6', '1');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(yearlyRows(page)).toHaveCount(1);
    await calc(page, '24000', '6', '2.5');
    await expect(page.locator('[data-error-for="termYears"]')).toHaveText(TERM_MSG);
  });

  test('extra months extend the term; 0 years + 0 months is rejected as no loan at all', async ({ page }) => {
    await calc(page, '24000', '0', '0', { months: '6' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(payoff(page)).toHaveText('6 months');
    await expect(primary(page)).toHaveText('$4,000.00'); // 24,000 / 6 at 0%
    await calc(page, '24000', '0', '0', { months: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="termYears"]')).toHaveText('Enter a loan term of at least one month.');
    await calc(page, '24000', '0', '1', { months: '12' });
    await expect(page.locator('[data-error-for="termMonths"]')).toHaveText('Enter extra months from 0 to 11.');
  });

  /* ---- amount + rate validation ---- */

  test('a zero amount is rejected; a 0% loan is valid; a negative rate is rejected', async ({ page }) => {
    await calc(page, '0', '6.5', '30');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="amount"]')).toHaveText('Enter a loan amount greater than zero.');
    await calc(page, '12000', '0', '1');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$1,000.00'); // 12,000 / 12
    await expect(interest(page)).toHaveText('$0.00');
    await calc(page, '12000', '-1', '1');
    await expect(page.locator('[data-error-for="annualInterestRate"]')).toHaveText('Enter an interest rate of zero or more.');
  });

  test('bond mode asks for the amount DUE in its own error messages', async ({ page }) => {
    await page.check('[name="mode"][value="bond"]');
    await submit(page).click();
    await expect(page.locator('[data-error-for="amount"]')).toHaveText('Enter the amount due at maturity.');
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

  test('a valid live update preserves the open disclosure and view, replaces rows, keeps focus', async ({ page }) => {
    await calc(page, '250000', '6.5', '30');
    await summaryToggle(page).click();
    await page.check('[name="loan-view"][value="detail"]');
    await page.fill('[name="amount"]', '200000');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('$1,264.14'); // 200k at 6.5% / 30y
    expect(await isOpen(disclosure(page))).toBe(true);
    await expect(page.locator('[name="loan-view"][value="detail"]')).toBeChecked();
    await expect(detailRows(page)).toHaveCount(360);
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
    await expect(detailRows(page)).toHaveCount(0);
    await expect(page.locator('[name="termYears"]')).toBeFocused();
  });

  test('reset restores the initial state: fields, mode, selects, view, disclosure, result', async ({ page }) => {
    await calc(page, '100000', '6', '10', { mode: 'bond', compound: 'annually' });
    await summaryToggle(page).click();
    await page.check('[name="loan-view"][value="detail"]');
    await page.click('[data-reset]');
    for (const name of ['amount', 'annualInterestRate', 'termYears', 'termMonths']) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    }
    await expect(page.locator('[name="mode"][value="amortized"]')).toBeChecked();
    await expect(page.locator('[name="compoundKey"]')).toHaveValue('monthly');
    await expect(page.locator('[name="paybackKey"]')).toHaveValue('month');
    await expect(page.locator('[data-loan-amount-label]')).toHaveText('Loan amount');
    await expect(page.locator('[name="loan-view"][value="yearly"]')).toBeChecked();
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

  test('the mode radios are reachable and operable from the keyboard', async ({ page }) => {
    await page.locator('[name="mode"][value="amortized"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[name="mode"][value="deferred"]')).toBeChecked();
    await expect(page.locator('[data-loan-payback]')).toBeHidden();
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
    await page.check('[name="loan-view"][value="detail"]');
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
    await expect(page.locator('#loan-result [data-result-when~="valid"] [data-result-value]')).toHaveText('$2,000.00');
    await page.locator('[data-loan-disclosure] > summary').click();
    await expect(page.locator('[data-loan-rows="yearly"] tr')).toHaveCount(1);
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
    await expect(page.locator('#loan-result [data-result-when~="valid"] [data-result-value]')).toHaveText('$2,000.00');
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
