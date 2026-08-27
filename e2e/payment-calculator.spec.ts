import { test, expect, type Page } from '@playwright/test';

/**
 * Payment calculator — two modes over one loan.
 *
 * Fixed term takes a term and reports the monthly payment; Fixed payments takes the
 * payment and reports how long it takes. Both then show the same enrichment: the
 * payoff sentence, the two totals, a principal-against-interest ring and the full
 * schedule on annual or monthly.
 *
 * The reference case ($200,000 at 6%) is pinned in both directions — $1,687.71 a
 * month over 15 years, and 11 years 7 months at $2,000 a month — because they are
 * the same loan seen from either end.
 */
const ROUTE = '/finance/payment-calculator';
const DEBOUNCE = 350;

const shell = (page: Page) => page.locator('#pay-result');
const primary = (page: Page) => page.locator('#pay-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#pay-result [data-result-summary-label]');
const liveRegion = (page: Page) => page.locator('#pay-live');
const submit = (page: Page) => page.locator('[data-pay-submit]');
const region = (page: Page, when: string) => page.locator(`#pay-result [data-result-when~="${when}"]`);
const cell = (page: Page, key: string) => page.locator(`#pay-result [data-pay-${key}]`);

const fillShared = async (page: Page, principal = '200000', rate = '6') => {
  await page.fill('[name="principal"]', principal);
  await page.fill('[name="annualRatePct"]', rate);
};

/** Fixed term: the reference loan over 15 years. */
const calcTerm = async (page: Page, years = '15') => {
  await fillShared(page);
  await page.fill('[name="termYears"]', years);
  await submit(page).click();
};

/** Fixed payments: the reference loan at a chosen monthly amount. */
const calcPayment = async (page: Page, payment = '2000') => {
  await page.locator('[name="mode"][value="payment"]').check();
  await fillShared(page);
  await page.fill('[name="payment"]', payment);
  await submit(page).click();
};

const openSchedule = async (page: Page) => {
  await page.locator('.pay-disclosure__summary').click();
  await expect(page.locator('[data-pay-schedule]')).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads in fixed-term mode with every field empty and a labelled example', async ({ page }) => {
  await expect(page.locator('[name="mode"][value="term"]')).toBeChecked();
  for (const name of ['principal', 'annualRatePct', 'termYears', 'payment']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[data-pay-term]')).toBeVisible();
  await expect(page.locator('[data-pay-payment]')).toBeHidden();
  await expect(page.locator('[name="payment"]')).toBeDisabled();
  await expect(submit(page)).toHaveText('Calculate Payment');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  await expect(region(page, 'empty')).toBeHidden();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
});

test('offers the two modes by what is fixed', async ({ page }) => {
  const form = page.locator('form[data-form]');
  await expect(form.getByText('What is fixed?', { exact: true })).toBeVisible();
  await expect(form.getByText('Fixed term', { exact: true })).toBeVisible();
  await expect(form.getByText('Fixed payments', { exact: true })).toBeVisible();
});

test('does not calculate before the first submission', async ({ page }) => {
  await fillShared(page);
  await page.fill('[name="termYears"]', '15');
  await page.waitForTimeout(DEBOUNCE + 100);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Fixed term --------------------------------------------------------- */

test('fixed term reproduces the reference loan to the cent', async ({ page }) => {
  await calcTerm(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Monthly payment');
  await expect(primary(page)).toHaveText('$1,687.71');
  await expect(cell(page, 'note')).toHaveText(
    'You will need to pay $1,687.71 every month for 15 years to pay off the debt.',
  );
  await expect(cell(page, 'count-label')).toHaveText('Total of 180 payments');
  await expect(cell(page, 'total')).toHaveText('$303,788.46');
  await expect(cell(page, 'interest')).toHaveText('$103,788.46');
  await expect(liveRegion(page)).toHaveText(
    'Your estimated monthly payment is 1687 dollars and 71 cents.',
  );
});

test('draws the principal-against-interest ring with both shares labelled', async ({ page }) => {
  await calcTerm(page);
  const figure = page.locator('[data-pay-donut-figure]');
  await expect(figure).toBeVisible();
  await expect(page.locator('[data-pay-donut] circle')).toHaveCount(2);
  await expect(page.locator('[data-pay-donut] text')).toHaveText(['66%', '34%']);
  await expect(cell(page, 'share-principal')).toHaveText('66%');
  await expect(cell(page, 'share-interest')).toHaveText('34%');
  await expect(cell(page, 'share-principal-amt')).toHaveText('$200,000');
  // Identity is never colour-alone: both slices are named in the legend.
  await expect(figure).toContainText('Principal');
  await expect(figure).toContainText('Interest');
  await expect(page.locator('[data-pay-donut] svg')).toHaveAttribute('aria-label', /\$303,788\.46/);
});

test('the ring labels stay inside the drawing area', async ({ page }) => {
  await calcTerm(page);
  const svg = await page.locator('[data-pay-donut] svg').boundingBox();
  for (const label of await page.locator('[data-pay-donut] text').all()) {
    const box = await label.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(svg!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(svg!.x + svg!.width);
  }
});

test('the schedule matches the amortization calculator, row for row', async ({ page }) => {
  await calcTerm(page);
  await openSchedule(page);
  const rows = page.locator('[data-pay-rows="yearly"] tr');
  await expect(rows).toHaveCount(15);
  // The Extra column belongs to the amortization calculator, not this one.
  await expect(page.locator('[data-pay-rows="yearly"] td.pay-col-extra').first()).toBeHidden();
  await expect(rows.nth(0).locator('th, td:visible')).toHaveText([
    '1', '$11,769.23', '$8,483.33', '$191,516.67',
  ]);
  await expect(rows.nth(8).locator('th, td:visible')).toHaveText([
    '9', '$6,559.25', '$13,693.31', '$101,835.82',
  ]);
  await expect(rows.last().locator('td:visible').last()).toHaveText('$0.00');
});

test('switching to the monthly view is a view change, not a recalculation', async ({ page }) => {
  await calcTerm(page);
  await openSchedule(page);
  await expect(page.locator('[data-pay-rows="yearly"] tr').first()).toBeVisible();

  await page.locator('[data-pay-view-radio][value="monthly"]').check();
  await expect(page.locator('[data-pay-rows="yearly"] tr').first()).toBeHidden();
  // 180 months plus a divider closing each of the first 14 years.
  await expect(page.locator('[data-pay-rows="monthly"] tr')).toHaveCount(194);
  await expect(page.locator('[data-pay-rows="monthly"] .pay-cell--yearend').first()).toHaveText(
    'End of year 1',
  );
  await expect(primary(page)).toHaveText('$1,687.71');
});

/* ---- Fixed payments ----------------------------------------------------- */

test('fixed payments swaps the term for the monthly amount', async ({ page }) => {
  await page.locator('[name="mode"][value="payment"]').check();
  await expect(page.locator('[data-pay-term]')).toBeHidden();
  await expect(page.locator('[name="termYears"]')).toBeDisabled();
  await expect(page.locator('[data-pay-payment]')).toBeVisible();
  await expect(submit(page)).toHaveText('Calculate Payoff Time');
});

test('fixed payments solves for the time, to the cent', async ({ page }) => {
  await calcPayment(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Payoff time');
  await expect(primary(page)).toHaveText('11 years, 7 months');
  await expect(cell(page, 'note')).toHaveText(
    'You will need to pay $2,000.00 every month for 11 years, 7 months to pay off the debt.',
  );
  await expect(cell(page, 'count-label')).toHaveText('Total of 139 payments');
  await expect(cell(page, 'total')).toHaveText('$277,951.56');
  await expect(cell(page, 'interest')).toHaveText('$77,951.56');
  await expect(liveRegion(page)).toHaveText('Your estimated payoff time is 11 years and 7 months.');
});

test('the last payment is short, and the schedule ends on zero', async ({ page }) => {
  await calcPayment(page);
  await openSchedule(page);
  await page.locator('[data-pay-view-radio][value="monthly"]').check();
  const rows = page.locator('[data-pay-rows="monthly"] tr');
  const last = rows.last().locator('td:visible');
  await expect(last.last()).toHaveText('$0.00');
  // Interest + principal on the final row is $1,951.56, not the full $2,000.
  const cells = await last.allTextContents();
  const money = (s: string) => Number(s.replace(/[$,]/g, ''));
  expect(money(cells[0]) + money(cells[1])).toBeCloseTo(1951.56, 2);
});

test('a bigger payment clears the loan sooner', async ({ page }) => {
  await calcPayment(page, '3000');
  await expect(primary(page)).not.toHaveText('11 years, 7 months');
  const label = await cell(page, 'count-label').textContent();
  expect(Number((label ?? '').match(/\d+/)?.[0])).toBeLessThan(139);
});

/* ---- The two modes are one loan ----------------------------------------- */

test('paying the fixed-term payment clears the loan in the fixed term', async ({ page }) => {
  await calcTerm(page);
  await expect(primary(page)).toHaveText('$1,687.71');

  await page.locator('[name="mode"][value="payment"]').check();
  await page.fill('[name="payment"]', '1687.71');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('15 years');

  // 181, not 180 — and that is the honest answer rather than an off-by-one. The true
  // payment is $1,687.7135…, so paying the DISPLAYED figure underpays by a fraction of
  // a cent every month; after fifteen years that residue needs one more, tiny payment.
  // The headline still reads 15 years because the residue is worth a rounding of days.
  await expect(cell(page, 'count-label')).toHaveText('Total of 181 payments');
  await openSchedule(page);
  await page.locator('[data-pay-view-radio][value="monthly"]').check();
  const rows = page.locator('[data-pay-rows="monthly"] tr');
  const finalCells = await rows.last().locator('td:visible').allTextContents();
  const money = (t: string) => Number(t.replace(/[$,]/g, ''));
  expect(money(finalCells[0]) + money(finalCells[1])).toBeLessThan(5);
  expect(money(finalCells[finalCells.length - 1])).toBe(0);
});

/* ---- The "never" outcome ------------------------------------------------ */

test('a payment below the interest is a valid "Never", not an error', async ({ page }) => {
  await calcPayment(page, '500'); // interest alone is $1,000 a month
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Payoff time');
  await expect(primary(page)).toHaveText('Never');
  await expect(cell(page, 'note')).toContainText('does not cover the monthly interest');
  await expect(liveRegion(page)).toContainText('never be paid off');
  // Nothing below the headline describes a loan that is never repaid.
  await expect(page.locator('[data-pay-details]')).toBeHidden();
});

test('raising the payment above the interest turns "Never" into a real answer', async ({ page }) => {
  await calcPayment(page, '500');
  await expect(primary(page)).toHaveText('Never');
  await page.fill('[name="payment"]', '2000');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('11 years, 7 months');
  await expect(page.locator('[data-pay-details]')).toBeVisible();
});

/* ---- Validation --------------------------------------------------------- */

test('an all-empty submission reports the required fields and focuses the first', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="principal"]')).toBeVisible();
  await expect(page.locator('[data-error-for="annualRatePct"]')).toBeVisible();
  await expect(page.locator('[data-error-for="termYears"]')).toBeVisible();
  await expect(page.locator('[name="principal"]')).toBeFocused();
  await expect(page.locator('[name="principal"]')).toHaveAttribute('aria-invalid', 'true');
});

test('only the active mode field is required', async ({ page }) => {
  // Fixed term does not ask for a payment...
  await calcTerm(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  // ...and fixed payments does not ask for a term.
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calcPayment(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

test('rejects a zero loan, a negative rate and a fractional term', async ({ page }) => {
  await fillShared(page, '0');
  await page.fill('[name="termYears"]', '15');
  await submit(page).click();
  await expect(page.locator('[data-error-for="principal"]')).toBeVisible();

  await fillShared(page, '200000', '-1');
  await submit(page).click();
  await expect(page.locator('[data-error-for="annualRatePct"]')).toBeVisible();

  await fillShared(page);
  await page.fill('[name="termYears"]', '15.5');
  await submit(page).click();
  await expect(page.locator('[data-error-for="termYears"]')).toBeVisible();
});

test('a zero interest rate is a valid, principal-only loan', async ({ page }) => {
  await fillShared(page, '12000', '0');
  await page.fill('[name="termYears"]', '1');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$1,000.00');
  await expect(cell(page, 'interest')).toHaveText('$0.00');
});

test('never renders NaN, Infinity or a raw error', async ({ page }) => {
  await calcPayment(page, '500');
  let text = (await shell(page).innerText()) ?? '';
  expect(text).not.toMatch(/NaN|Infinity|undefined|\[object/);
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calcTerm(page, '30');
  text = (await shell(page).innerText()) ?? '';
  expect(text).not.toMatch(/NaN|Infinity|undefined|\[object/);
});

/* ---- Live-after-first, mode switching, reset ---------------------------- */

test('recalculates live after the first result without moving focus', async ({ page }) => {
  await calcTerm(page);
  await expect(page.locator('[data-live-note]')).toBeVisible();
  const rate = page.locator('[name="annualRatePct"]');
  await rate.focus();
  await rate.fill('7');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).not.toHaveText('$1,687.71');
  await expect(rate).toBeFocused();
});

test('switching mode keeps the shared fields and the entered value for a switch back', async ({ page }) => {
  await calcTerm(page);
  await page.locator('[name="mode"][value="payment"]').check();
  await expect(page.locator('[name="principal"]')).toHaveValue('200000');
  await expect(page.locator('[name="annualRatePct"]')).toHaveValue('6');
  await page.locator('[name="mode"][value="term"]').check();
  await expect(page.locator('[name="termYears"]')).toHaveValue('15');
});

test('reset clears every field, restores fixed-term mode and empties the result', async ({ page }) => {
  await calcTerm(page);
  await openSchedule(page);
  await page.locator('[data-pay-view-radio][value="monthly"]').check();
  await page.locator('[name="mode"][value="payment"]').check();

  await page.locator('[data-reset]').click();
  for (const name of ['principal', 'annualRatePct', 'termYears', 'payment']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[name="mode"][value="term"]')).toBeChecked();
  await expect(page.locator('[data-pay-term]')).toBeVisible();
  await expect(page.locator('[data-pay-view-radio][value="yearly"]')).toBeChecked();
  await expect(submit(page)).toHaveText('Calculate Payment');
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

test('lays the fields out two to a row', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const tops = await page
    .locator('form [data-field]:visible')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  // Three visible fields: the amount beside the term, then the rate.
  expect(tops).toHaveLength(3);
  expect(tops[0]).toBe(tops[1]);
  expect(tops[2]).toBeGreaterThan(tops[1]);
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calcTerm(page);
  await openSchedule(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calcTerm(page);
  await expect(primary(page)).toHaveText('$1,687.71');
});

test('the generated embed mounts the same island and computes', async ({ page }) => {
  await page.goto('/embed/finance/payment-calculator', { waitUntil: 'domcontentloaded' });
  await calcTerm(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$1,687.71');
});

test('the live page carries no monetization output', async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-monetization-region]')).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toMatch(/adsbygoogle|data-ad-client/);
});
