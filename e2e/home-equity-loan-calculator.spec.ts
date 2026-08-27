import { test, expect, type Page } from '@playwright/test';

/**
 * Home equity — two calculators on one page, as the reference has them.
 *
 * FIRST, the loan: amount, rate and term produce the payment, the totals, the ring, the
 * amortization schedule in both views and the amortization graph. Closing costs are an
 * OPTIONAL disclosure behind an unchecked box; they never touch the payment, so they add
 * the net cash received and the real APR instead of changing the headline.
 *
 * SECOND, and optional, borrowing power: home value, mortgage balance and the lender's
 * loan-to-value cap. Its own form, result and binding.
 *
 * Both are pinned to the published reference: $150,000 at 8% over 15 years is $1,433.48 a
 * month, $258,026.06 across 180 payments, $108,026.06 of interest, a 58%/42% ring and an
 * annual schedule opening $11,804.97 / $5,396.77 / $144,603.23. A $600,000 home with
 * $250,000 owed at an 80% cap may borrow $230,000, at a current LTV of 41.7%.
 */
const ROUTE = '/finance/home-equity-loan-calculator';
const DEBOUNCE = 300;

/* ---- the loan calculator ---- */
const shell = (page: Page) => page.locator('#he-result');
const primary = (page: Page) => page.locator('#he-result [data-result-value]');
const total = (page: Page) => page.locator('[data-he-total]');
const interest = (page: Page) => page.locator('[data-he-interest]');
const paymentsLabel = (page: Page) => page.locator('[data-he-payments-label]');
const donut = (page: Page) => page.locator('[data-he-donut-figure]');
const chart = (page: Page) => page.locator('[data-he-chart-figure]');
const closingResult = (page: Page) => page.locator('[data-he-closing]');
const closingFields = (page: Page) => page.locator('[data-he-closing-fields]');
const heLive = (page: Page) => page.locator('#he-live');
const heSubmit = (page: Page) => page.locator('[data-he-submit]');
const region = (page: Page, when: string) => page.locator(`#he-result [data-result-when~="${when}"]`);
const yearlyRows = (page: Page) => page.locator('[data-he-rows-yearly] tr');
const monthlyRows = (page: Page) => page.locator('[data-he-rows-monthly] tr');

/* ---- the borrowing-power calculator ---- */
const hbShell = (page: Page) => page.locator('#hb-result');
const hbPrimary = (page: Page) => page.locator('#hb-result [data-result-value]');
const hbSubmit = (page: Page) => page.locator('[data-hb-submit]');
const hbLive = (page: Page) => page.locator('#hb-live');

interface Loan {
  amount: string;
  rate: string;
  term: string;
}
const REF: Loan = { amount: '150000', rate: '8', term: '15' };

const calc = async (page: Page, over: Partial<Loan> = {}) => {
  const v = { ...REF, ...over };
  await page.fill('[name="loanAmount"]', v.amount);
  await page.fill('[name="annualRatePct"]', v.rate);
  await page.fill('[name="termYears"]', v.term);
  await heSubmit(page).click();
};

const borrow = async (page: Page, value = '600000', owed = '250000', ltv = '80') => {
  await page.fill('[name="homeValue"]', value);
  await page.fill('[name="mortgageBalance"]', owed);
  await page.selectOption('[name="maxLtvPct"]', ltv);
  await hbSubmit(page).click();
};

test.describe('home equity loan: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('loads empty, with the closing-costs disclosure closed', async ({ page }) => {
    for (const name of ['loanAmount', 'annualRatePct', 'termYears']) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    }
    await expect(page.locator('[name="includeClosingCosts"]')).not.toBeChecked();
    await expect(closingFields(page)).toBeHidden();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(region(page, 'empty')).toBeHidden();
    await expect(heLive(page)).toHaveText('');
  });

  test('does not calculate before the first submission', async ({ page }) => {
    await page.fill('[name="loanAmount"]', REF.amount);
    await page.fill('[name="annualRatePct"]', REF.rate);
    await page.fill('[name="termYears"]', REF.term);
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- the reference result ---- */

  test('the reference case prints every published figure', async ({ page }) => {
    await calc(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$1,433.48');
    await expect(paymentsLabel(page)).toHaveText('Total of 180 loan payments');
    await expect(total(page)).toHaveText('$258,026.06');
    await expect(interest(page)).toHaveText('$108,026.06');
    await expect(page.locator('[data-he-interpretation]')).toHaveText(
      'Borrowing $150,000 at 8% over 15 years costs $1,433.48 a month and $108,026.06 in interest.',
    );
    await expect(heLive(page)).toHaveText('Monthly payment: 1433 dollars and 48 cents.');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the payment breakdown ring splits the total 58% / 42%', async ({ page }) => {
    await calc(page);
    await expect(donut(page)).toBeVisible();
    const svg = page.locator('.he-donut__svg');
    await expect(svg).toHaveCount(1);
    await expect(svg).toHaveAttribute('role', 'img');
    expect(await svg.getAttribute('aria-label')).toContain('$258,026.06');
    await expect(page.locator('[data-he-share-principal]')).toHaveText('58%');
    await expect(page.locator('[data-he-share-interest]')).toHaveText('42%');
    await expect(page.locator('[data-he-share-principal-amt]')).toHaveText('$150,000');
    await expect(page.locator('[data-he-share-interest-amt]')).toHaveText('$108,026');
  });

  test('the amortization graph plots balance, interest and payment across the term', async ({ page }) => {
    await calc(page);
    await expect(chart(page)).toBeVisible();
    await expect(page.locator('.he-chart__svg')).toHaveCount(1);
    for (const series of ['balance', 'interest', 'paid']) {
      await expect(page.locator(`.he-chart__line--${series}`)).toHaveCount(1);
    }
    await expect(page.locator('.he-chart__tick', { hasText: 'Year 0' })).toHaveCount(1);
    await expect(page.locator('.he-chart__tick', { hasText: 'Year 15' })).toHaveCount(1);
  });

  /* ---- the schedule ---- */

  test('the annual schedule reproduces the published rows to the cent', async ({ page }) => {
    await calc(page);
    await expect(yearlyRows(page)).toHaveCount(15);

    const cells = (row: number) => yearlyRows(page).nth(row).locator('td');
    // Year 1
    await expect(yearlyRows(page).nth(0).locator('th')).toHaveText('1');
    await expect(cells(0).nth(0)).toHaveText('$11,804.97');
    await expect(cells(0).nth(1)).toHaveText('$5,396.77');
    await expect(cells(0).nth(3)).toHaveText('$144,603.23');
    // Year 2
    await expect(cells(1).nth(0)).toHaveText('$11,357.04');
    await expect(cells(1).nth(1)).toHaveText('$5,844.70');
    await expect(cells(1).nth(3)).toHaveText('$138,758.53');
    // Year 7
    await expect(cells(6).nth(0)).toHaveText('$8,494.04');
    await expect(cells(6).nth(1)).toHaveText('$8,707.70');
    await expect(cells(6).nth(3)).toHaveText('$101,401.33');
    // The loan is gone by the last year.
    await expect(cells(14).nth(3)).toHaveText('$0.00');
  });

  test('Annual and Monthly are two views of one schedule, not a recalculation', async ({ page }) => {
    await calc(page);
    const schedule = page.locator('[data-he-schedule]');
    await expect(schedule).toHaveAttribute('data-he-view', 'yearly');
    await expect(page.locator('[data-he-rows-monthly]')).toBeHidden();
    await expect(page.locator('[data-he-when-view="yearly"]').first()).toBeVisible();

    await page.locator('[data-he-view-radio][value="monthly"]').check();
    await expect(schedule).toHaveAttribute('data-he-view', 'monthly');
    await expect(page.locator('[data-he-rows-yearly]')).toBeHidden();
    // 180 payments plus the "End of year" dividers between them.
    await expect(monthlyRows(page)).toHaveCount(180 + 14);
    // The headline is untouched — switching views computes nothing.
    await expect(primary(page)).toHaveText('$1,433.48');
  });

  test('the extra column is absent — this calculator has no extra payments', async ({ page }) => {
    await calc(page);
    await expect(page.locator('.he-table th.he-col-extra')).toBeHidden();
  });

  /* ---- closing costs ---- */

  test('closing costs are optional and reveal their fields when asked for', async ({ page }) => {
    await calc(page);
    await expect(closingResult(page)).toBeHidden();

    await page.locator('[name="includeClosingCosts"]').check();
    await expect(closingFields(page)).toBeVisible();
    await expect(page.locator('[name="closingAmount"]')).toBeFocused();
    await expect(page.locator('[name="closingTreatment"][value="deducted"]')).toBeChecked();
  });

  test('closing costs change what the loan costs, never the payment', async ({ page }) => {
    await calc(page);
    await page.locator('[name="includeClosingCosts"]').check();
    await page.fill('[name="closingAmount"]', '7500');
    await page.waitForTimeout(DEBOUNCE);

    // The payment and the totals are untouched — you still borrowed $150,000.
    await expect(primary(page)).toHaveText('$1,433.48');
    await expect(total(page)).toHaveText('$258,026.06');

    await expect(closingResult(page)).toBeVisible();
    await expect(page.locator('[data-he-closing-costs]')).toHaveText('$7,500.00');
    await expect(page.locator('[data-he-closing-net]')).toHaveText('$142,500.00');
    await expect(page.locator('[data-he-closing-apr]')).toHaveText('8.86%');
    await expect(heLive(page)).toHaveText(
      'Monthly payment: 1433 dollars and 48 cents. Real APR with closing costs: 8.86 percent.',
    );
  });

  test('deducted or paid upfront costs the same; only the cash on the day differs', async ({ page }) => {
    await calc(page);
    await page.locator('[name="includeClosingCosts"]').check();
    await page.fill('[name="closingAmount"]', '7500');
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('[data-he-closing-cash-row]')).toBeHidden();

    await page.locator('[name="closingTreatment"][value="upfront"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('[data-he-closing-apr]')).toHaveText('8.86%');
    await expect(page.locator('[data-he-closing-cash-row]')).toBeVisible();
    await expect(page.locator('[data-he-closing-cash]')).toHaveText('$7,500.00');
    await expect(page.locator('[data-he-closing-note]')).toContainText('out the same money either way');
  });

  test('closing costs can be entered as a percentage of the loan', async ({ page }) => {
    await calc(page);
    await page.locator('[name="includeClosingCosts"]').check();
    await page.selectOption('[name="closingUnit"]', 'pct');
    await expect(page.locator('[data-he-closing-affix]')).toHaveText('%');
    await page.fill('[name="closingAmount"]', '5');
    await page.waitForTimeout(DEBOUNCE);
    // 5% of $150,000 is the same $7,500 deal.
    await expect(page.locator('[data-he-closing-costs]')).toHaveText('$7,500.00');
    await expect(page.locator('[data-he-closing-apr]')).toHaveText('8.86%');
  });

  test('a stale closing amount behind a cleared checkbox never blocks the result', async ({ page }) => {
    await calc(page);
    await page.locator('[name="includeClosingCosts"]').check();
    await page.fill('[name="closingAmount"]', '999999');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');

    await page.locator('[name="includeClosingCosts"]').uncheck();
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$1,433.48');
    await expect(closingResult(page)).toBeHidden();
  });

  /* ---- validation ---- */

  test('field validation: amount > 0, rate 0–100, a whole term of 1–30 years', async ({ page }) => {
    await calc(page, { amount: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="loanAmount"]')).toHaveText(
      'Enter a loan amount greater than zero.',
    );

    await calc(page, { rate: '-1' });
    await expect(page.locator('[data-error-for="annualRatePct"]')).toHaveText(
      'Enter an interest rate of zero or more.',
    );

    await calc(page, { term: '7.5' });
    await expect(page.locator('[data-error-for="termYears"]')).toHaveText(
      'Enter a whole loan term from 1 to 30 years.',
    );
    await calc(page, { term: '31' });
    await expect(page.locator('[data-error-for="termYears"]')).toHaveText(
      'Enter a whole loan term from 1 to 30 years.',
    );
  });

  test('closing costs at or above the loan are rejected', async ({ page }) => {
    await calc(page);
    await page.locator('[name="includeClosingCosts"]').check();
    await page.fill('[name="closingAmount"]', '150000');
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('[data-error-for="closingAmount"]')).toHaveText(
      'Closing costs cannot be more than the loan amount.',
    );
  });

  test('an empty explicit submission focuses the loan amount', async ({ page }) => {
    await heSubmit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    const amount = page.locator('[name="loanAmount"]');
    await expect(amount).toBeFocused();
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
  });

  /* ---- live update / reset ---- */

  test('a valid live update recomputes without moving focus', async ({ page }) => {
    await calc(page);
    await page.fill('[name="annualRatePct"]', '6');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('$1,265.79');
    await expect(page.locator('[name="annualRatePct"]')).toBeFocused();
  });

  test('clear empties the fields and closes the closing-costs disclosure again', async ({ page }) => {
    await calc(page);
    await page.locator('[name="includeClosingCosts"]').check();
    await page.fill('[name="closingAmount"]', '7500');
    await page.waitForTimeout(DEBOUNCE);

    await page.locator('.he [data-reset]').click();
    for (const name of ['loanAmount', 'annualRatePct', 'termYears', 'closingAmount']) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    }
    await expect(page.locator('[name="includeClosingCosts"]')).not.toBeChecked();
    await expect(closingFields(page)).toBeHidden();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(heLive(page)).toHaveText('');
  });
});

test.describe('how much you can borrow: the optional second calculator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('is a separate tool with its own form and result', async ({ page }) => {
    await expect(page.locator('#hb-title')).toHaveText('The loan amount you can borrow');
    await expect(page.locator('[name="homeValue"]')).toHaveValue('');
    await expect(page.locator('[name="mortgageBalance"]')).toHaveValue('');
    // The lender's ratio is a structural default, not a personal value.
    await expect(page.locator('[name="maxLtvPct"]')).toHaveValue('80');
    await expect(hbShell(page)).toHaveAttribute('data-result-state', 'example');
  });

  test('the reference case reports the published figures', async ({ page }) => {
    await borrow(page);
    await expect(hbShell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(hbPrimary(page)).toHaveText('$230,000');
    // The headline label says it; the sentence would only repeat it.
    await expect(page.locator('#hb-result [data-result-summary-label]')).toHaveText('You may borrow up to');
    await expect(page.locator('[data-hb-summary]')).toBeHidden();
    await expect(page.locator('[data-hb-ltv]')).toHaveText('41.7%');
    await expect(page.locator('[data-hb-equity]')).toHaveText('$350,000.00');
    await expect(hbLive(page)).toHaveText(
      'You may borrow up to $230,000. Your current loan-to-value ratio is 41.7 percent.',
    );
  });

  test('a higher lender ratio lends more against the same home', async ({ page }) => {
    await borrow(page, '600000', '250000', '90');
    await expect(hbPrimary(page)).toHaveText('$290,000');
    await expect(page.locator('[data-hb-ltv]')).toHaveText('41.7%'); // the current LTV is unchanged
  });

  test('a mortgage already at the cap is an informational result, not an error', async ({ page }) => {
    await borrow(page, '500000', '400000', '80');
    await expect(hbShell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(hbPrimary(page)).toHaveText('Nothing');
    await expect(page.locator('[data-hb-summary]')).toContainText('nothing left to borrow');
    // The equity is real even though none of it is borrowable here.
    await expect(page.locator('[data-hb-equity]')).toHaveText('$100,000.00');
    expect(await page.locator('#hb-result [data-result-when~="valid"]').innerText()).not.toMatch(
      /NaN|Infinity|undefined|-\$/,
    );
  });

  test('validates its own fields independently of the loan calculator', async ({ page }) => {
    await hbSubmit(page).click();
    await expect(hbShell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="homeValue"]')).toHaveText('Enter what your home is worth.');
    // The loan calculator above is untouched by its neighbour's error.
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  });

  test('the two calculators do not interfere with one another', async ({ page }) => {
    await calc(page);
    await borrow(page);
    await expect(primary(page)).toHaveText('$1,433.48');
    await expect(hbPrimary(page)).toHaveText('$230,000');

    // Clearing one leaves the other standing.
    await page.locator('.hb [data-reset]').click();
    await expect(hbShell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$1,433.48');
  });

  test('carries the lender caveat about what else affects approval', async ({ page }) => {
    await borrow(page);
    await expect(page.locator('.hb-caveat')).toBeVisible();
    await expect(page.locator('.hb-caveat')).toContainText('debt-to-income');
  });
});

test.describe('home equity: presentation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('desktop shows the inputs, the primary action and the payment at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[name="loanAmount"]')).toBeInViewport();
    await expect(heSubmit(page)).toBeInViewport();
    await calc(page);
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page);
    await borrow(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the schedule scrolls inside its own box rather than the page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page);
    const scrolls = await page
      .locator('.he-table-wrap')
      .evaluate((el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflow === 'auto');
    expect(scrolls).toBe(true);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc(page);
    await expect(primary(page)).toBeVisible();
    await expect(donut(page)).toBeVisible();
  });

  test('the generated embed mounts the same island, both calculators and all', async ({ page }) => {
    await page.goto('/embed/finance/home-equity-loan-calculator', { waitUntil: 'domcontentloaded' });
    await calc(page);
    await expect(page.locator('#he-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$1,433.48');
    await expect(page.locator('.he-donut__svg')).toHaveCount(1);
    await borrow(page);
    await expect(hbPrimary(page)).toHaveText('$230,000');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});
