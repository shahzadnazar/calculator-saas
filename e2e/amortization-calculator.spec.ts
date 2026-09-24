import { test, expect, type Page } from '@playwright/test';

/**
 * Amortization calculator.
 *
 * Required: loan amount, term (years + months), interest rate. Everything under
 * "Optional: make extra payments" is blank and closed on load. The result carries
 * the payment, a principal-against-interest ring, the two totals, an extras panel
 * that appears only when an extra applies, and the schedule on annual or monthly.
 *
 * The reference case ($200,000 at 6% over 15 years) is asserted to the cent here as
 * well as in the unit tests, because it is the case the model was built to reproduce.
 */
const ROUTE = '/finance/amortization-calculator';
const DEBOUNCE = 350;

const shell = (page: Page) => page.locator('#am-result');
const primary = (page: Page) => page.locator('#am-result [data-result-value]');
const liveRegion = (page: Page) => page.locator('#am-live');
const submit = (page: Page) => page.locator('[data-am-submit]');
const region = (page: Page, when: string) => page.locator(`#am-result [data-result-when~="${when}"]`);
const cell = (page: Page, key: string) => page.locator(`#am-result [data-am-${key}]`);

const REFERENCE = { amount: '200000', annualInterestRate: '6', termYears: '15' };

const fillReference = async (page: Page, over: Record<string, string> = {}) => {
  for (const [name, value] of Object.entries({ ...REFERENCE, ...over })) {
    await page.fill(`[name="${name}"]`, value);
  }
};

const calcReference = async (page: Page, over: Record<string, string> = {}) => {
  await fillReference(page, over);
  await submit(page).click();
};

const openExtras = (page: Page) => page.locator('[data-am-optional] summary').click();
const openSchedule = async (page: Page) => {
  await page.locator('.am-disclosure__summary').click();
  await expect(page.locator('[data-am-schedule]')).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads with every field empty, extras closed, and a labelled example', async ({ page }) => {
  for (const name of ['amount', 'annualInterestRate', 'termYears', 'termMonths']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[data-am-optional]')).not.toHaveAttribute('open', '');
  await expect(submit(page)).toHaveText('Calculate');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  await expect(region(page, 'empty')).toBeHidden();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
});

test('every optional extra field is blank, so nothing looks pre-scheduled', async ({ page }) => {
  await openExtras(page);
  for (const name of [
    'startMonth',
    'startYear',
    'extraMonthlyAmount',
    'extraMonthlyMonth',
    'extraMonthlyYear',
    'extraYearlyAmount',
    'extraYearlyMonth',
    'extraYearlyYear',
    'extraOneTime1Amount',
    'extraOneTime1Month',
    'extraOneTime1Year',
  ]) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
});

test('does not calculate before the first submission', async ({ page }) => {
  await fillReference(page);
  await page.waitForTimeout(DEBOUNCE + 100);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- The reference case ------------------------------------------------- */

test('reproduces the reference loan to the cent', async ({ page }) => {
  await calcReference(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$1,687.71');
  await expect(cell(page, 'count-label')).toHaveText('Total of 180 monthly payments');
  await expect(cell(page, 'total')).toHaveText('$303,788.46');
  await expect(cell(page, 'interest')).toHaveText('$103,788.46');
  await expect(liveRegion(page)).toHaveText('Your monthly payment is 1687 dollars and 71 cents.');
});

test('draws the principal-against-interest ring with both shares labelled', async ({ page }) => {
  await calcReference(page);
  const figure = page.locator('[data-am-donut-figure]');
  await expect(figure).toBeVisible();
  // Two arcs, and a percentage label drawn on each.
  await expect(page.locator('[data-am-donut] circle')).toHaveCount(2);
  await expect(page.locator('[data-am-donut] text')).toHaveText(['66%', '34%']);
  // The legend names both, with their share and amount — identity is never colour alone.
  await expect(cell(page, 'share-principal')).toHaveText('66%');
  await expect(cell(page, 'share-interest')).toHaveText('34%');
  await expect(cell(page, 'share-principal-amt')).toHaveText('$200,000');
  await expect(figure).toContainText('Principal');
  await expect(figure).toContainText('Interest');
  // ...and the chart carries its own description rather than relying on the image.
  await expect(page.locator('[data-am-donut] svg')).toHaveAttribute('aria-label', /\$303,788\.46/);
});

test('the two labelled shares stay inside the drawing area', async ({ page }) => {
  await calcReference(page);
  const svg = await page.locator('[data-am-donut] svg').boundingBox();
  const labels = await page.locator('[data-am-donut] text').all();
  expect(labels).toHaveLength(2);
  for (const label of labels) {
    const box = await label.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(svg!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(svg!.x + svg!.width);
  }
});

test('a term in years and months is honoured', async ({ page }) => {
  await calcReference(page, { termYears: '5', termMonths: '6' });
  await expect(cell(page, 'count-label')).toHaveText('Total of 66 monthly payments');
  await openSchedule(page);
  await expect(page.locator('[data-am-rows="yearly"] tr')).toHaveCount(6);
});

/* ---- Schedule ----------------------------------------------------------- */

test('the annual schedule reproduces the reference rows', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  const rows = page.locator('[data-am-rows="yearly"] tr');
  await expect(rows).toHaveCount(15);
  // The Extra column is hidden without extras, so only four cells are visible.
  await expect(rows.nth(0).locator('th, td:visible')).toHaveText([
    '1', '$11,769.23', '$8,483.33', '$191,516.67',
  ]);
  await expect(rows.nth(1).locator('th, td:visible')).toHaveText([
    '2', '$11,246.00', '$9,006.57', '$182,510.10',
  ]);
  await expect(rows.nth(8).locator('th, td:visible')).toHaveText([
    '9', '$6,559.25', '$13,693.31', '$101,835.82',
  ]);
});

test('the loan is fully repaid — the last row closes on zero', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  await expect(page.locator('[data-am-rows="yearly"] tr').last().locator('td:visible').last()).toHaveText('$0.00');
});

test('switching to the monthly view is a view change, not a recalculation', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  await expect(page.locator('[data-am-rows="yearly"] tr').first()).toBeVisible();

  await page.locator('[data-am-view-radio][value="monthly"]').check();
  await expect(page.locator('[data-am-rows="yearly"] tr').first()).toBeHidden();
  // 180 months plus a divider closing each of the first 14 years.
  await expect(page.locator('[data-am-rows="monthly"] tr')).toHaveCount(194);
  await expect(page.locator('[data-am-rows="monthly"] .am-cell--yearend').first()).toHaveText(
    'End of year 1',
  );
  await expect(primary(page)).toHaveText('$1,687.71');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

test('the schedule table right-aligns its numbers', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  await expect(page.locator('[data-am-rows="yearly"] td.am-num').first()).toHaveCSS(
    'text-align',
    'right',
  );
});

/* ---- Optional extra payments -------------------------------------------- */

test('the extras panel and the Extra column stay hidden until an extra applies', async ({ page }) => {
  await calcReference(page);
  await expect(page.locator('[data-am-extras]')).toBeHidden();
  await openSchedule(page);
  await expect(page.locator('[data-am-rows="yearly"] td.am-col-extra').first()).toBeHidden();
  await expect(page.locator('[data-am-schedule]')).not.toHaveAttribute('data-am-has-extras', '');
});

test('an extra monthly payment shortens the loan and reports what it saves', async ({ page }) => {
  await calcReference(page);
  await openExtras(page);
  await page.fill('[name="extraMonthlyAmount"]', '300');
  await page.waitForTimeout(DEBOUNCE);

  await expect(page.locator('[data-am-extras]')).toBeVisible();
  await expect(cell(page, 'extra-total')).toHaveText('$42,000.00');
  await expect(cell(page, 'interest-saved')).toHaveText('$25,072.62');
  await expect(cell(page, 'time-saved')).toHaveText('3 years 3 months');
  await expect(cell(page, 'payoff')).toHaveText('11 years 9 months');
  await expect(cell(page, 'interest-without')).toHaveText('$103,788.46');
  // The scheduled payment is unchanged — extra shortens the loan, it does not shrink the bill.
  await expect(primary(page)).toHaveText('$1,687.71');
  await expect(cell(page, 'count-label')).toHaveText('Total of 141 monthly payments');
});

test('the Extra column appears once an extra applies', async ({ page }) => {
  await calcReference(page);
  await openExtras(page);
  await page.fill('[name="extraMonthlyAmount"]', '300');
  await page.waitForTimeout(DEBOUNCE);
  await openSchedule(page);
  await expect(page.locator('[data-am-schedule]')).toHaveAttribute('data-am-has-extras', '');
  await expect(page.locator('[data-am-rows="yearly"] td.am-col-extra').first()).toBeVisible();
  await expect(page.locator('[data-am-rows="yearly"] td.am-col-extra').first()).toHaveText('$3,600.00');
});

test('a one-time extra is dated from the loan start', async ({ page }) => {
  await calcReference(page);
  await openExtras(page);
  await page.selectOption('[name="startMonth"]', '1');
  await page.fill('[name="startYear"]', '2026');
  await page.fill('[name="extraOneTime1Amount"]', '10000');
  await page.selectOption('[name="extraOneTime1Month"]', '7');
  await page.fill('[name="extraOneTime1Year"]', '2026');
  await page.waitForTimeout(DEBOUNCE);

  await expect(page.locator('[data-am-extras]')).toBeVisible();
  await expect(cell(page, 'extra-total')).toHaveText('$10,000.00');
  await openSchedule(page);
  await page.locator('[data-am-view-radio][value="monthly"]').check();
  // July 2026 is the seventh payment of a loan starting January 2026.
  const rows = page.locator('[data-am-rows="monthly"] tr');
  await expect(rows.nth(6).locator('td.am-col-extra')).toHaveText('$10,000.00');
  await expect(rows.nth(5).locator('td.am-col-extra')).toHaveText('$0.00');
});

test('one-time rows are revealed on demand', async ({ page }) => {
  await openExtras(page);
  await expect(page.locator('[data-am-onetime]:visible')).toHaveCount(1);
  await page.locator('[data-am-add-onetime]').click();
  await expect(page.locator('[data-am-onetime]:visible')).toHaveCount(2);
  await page.locator('[data-am-add-onetime]').click();
  await expect(page.locator('[data-am-onetime]:visible')).toHaveCount(3);
});

test('rejects a negative extra and an out-of-range year', async ({ page }) => {
  await calcReference(page);
  await openExtras(page);
  await page.fill('[name="extraMonthlyAmount"]', '-50');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[data-error-for="extraMonthlyAmount"]')).toBeVisible();

  await page.fill('[name="extraMonthlyAmount"]', '100');
  await page.fill('[name="extraYearlyYear"]', '1700');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[data-error-for="extraYearlyYear"]')).toBeVisible();
});

/* ---- Validation --------------------------------------------------------- */

test('an all-empty submission reports the required fields and focuses the first', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="amount"]')).toBeVisible();
  await expect(page.locator('[data-error-for="annualInterestRate"]')).toBeVisible();
  await expect(page.locator('[data-error-for="termYears"]')).toBeVisible();
  await expect(page.locator('[name="amount"]')).toBeFocused();
  await expect(page.locator('[name="amount"]')).toHaveAttribute('aria-invalid', 'true');
});

test('a term of nothing at all is reported against the years box', async ({ page }) => {
  await calcReference(page, { termYears: '0', termMonths: '0' });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="termYears"]')).toContainText('at least one month');
});

test('months alone is a valid term', async ({ page }) => {
  await calcReference(page, { termYears: '', termMonths: '18' });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(cell(page, 'count-label')).toHaveText('Total of 18 monthly payments');
});

test('rejects a fractional or over-long term, and a zero loan', async ({ page }) => {
  await calcReference(page, { termYears: '15.5' });
  await expect(page.locator('[data-error-for="termYears"]')).toBeVisible();
  await calcReference(page, { termYears: '31', termMonths: '0' });
  await expect(page.locator('[data-error-for="termYears"]')).toContainText('30 years or less');
  await calcReference(page, { termYears: '15', amount: '0' });
  await expect(page.locator('[data-error-for="amount"]')).toBeVisible();
});

test('a zero interest rate is a valid, principal-only loan', async ({ page }) => {
  await calcReference(page, { amount: '12000', annualInterestRate: '0', termYears: '1' });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$1,000.00');
  await expect(cell(page, 'interest')).toHaveText('$0.00');
});

test('never renders NaN, Infinity or a raw error', async ({ page }) => {
  await calcReference(page, { amount: '1', annualInterestRate: '0.01', termYears: '30' });
  const text = (await shell(page).innerText()) ?? '';
  expect(text).not.toMatch(/NaN|Infinity|undefined|\[object/);
});

/* ---- Live-after-first, reset -------------------------------------------- */

test('recalculates live after the first result without moving focus', async ({ page }) => {
  await calcReference(page);
  await expect(page.locator('[data-live-note]')).toBeVisible();
  const rate = page.locator('[name="annualInterestRate"]');
  await rate.focus();
  await rate.fill('7');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).not.toHaveText('$1,687.71');
  await expect(rate).toBeFocused();
});

test('reset clears every field, closes the extras and empties the result', async ({ page }) => {
  await calcReference(page);
  await openExtras(page);
  await page.fill('[name="extraMonthlyAmount"]', '300');
  await page.locator('[data-am-add-onetime]').click();
  await page.waitForTimeout(DEBOUNCE);
  await openSchedule(page);
  await page.locator('[data-am-view-radio][value="monthly"]').check();

  await page.locator('[data-reset]').click();
  for (const name of ['amount', 'annualInterestRate', 'termYears', 'termMonths', 'extraMonthlyAmount']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[data-am-optional]')).not.toHaveAttribute('open', '');
  await expect(page.locator('[data-am-view-radio][value="yearly"]')).toBeChecked();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Layout, theme, embed, monetization --------------------------------- */

test('desktop shows the form, the primary action and the result at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  for (const target of [page.locator('h1'), submit(page), primary(page).first()]) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  }
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calcReference(page);
  await openExtras(page);
  await openSchedule(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calcReference(page);
  await expect(primary(page)).toHaveText('$1,687.71');
});

test('the generated embed mounts the same island and computes', async ({ page }) => {
  await page.goto('/embed/finance/amortization-calculator', { waitUntil: 'domcontentloaded' });
  await calcReference(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$1,687.71');
});

test('the live page carries no monetization output', async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-monetization-region]')).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toMatch(/adsbygoogle|data-ad-client/);
});
