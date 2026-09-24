import { test, expect, type Page } from '@playwright/test';

/**
 * Savings calculator — the accumulation calculator.
 *
 * Field set: initial deposit · annual contribution (+ yearly increase) · monthly
 * contribution (+ yearly increase) · interest rate · compound · years to save ·
 * tax rate. Result: end balance, the three parts it is made of, a proportion bar,
 * a stacked accumulation chart and an annual/monthly schedule.
 *
 * The reference case (20,000 opening, 5,000 a year rising 3%, 3% compounded
 * annually, 10 years) is asserted to the cent here as well as in the unit tests,
 * because it is the case the whole model was built to reproduce.
 */
const ROUTE = '/finance/savings-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#sv-result');
const primary = (page: Page) => page.locator('#sv-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#sv-result [data-result-summary-label]');
const liveRegion = (page: Page) => page.locator('#sv-live');
const submit = (page: Page) => page.locator('[data-sv-submit]');
const region = (page: Page, when: string) => page.locator(`#sv-result [data-result-when~="${when}"]`);
const cell = (page: Page, key: string) => page.locator(`#sv-result [data-sv-${key}]`);

/** The published reference plan. */
const REFERENCE = {
  initialDeposit: '20000',
  annualContribution: '5000',
  annualIncreasePct: '3',
  monthlyContribution: '0',
  annualRatePct: '3',
  years: '10',
};

const fillReference = async (page: Page, over: Partial<typeof REFERENCE> = {}) => {
  const v = { ...REFERENCE, ...over };
  for (const [name, value] of Object.entries(v)) {
    // Goal mode hides the monthly contribution and its increase — they are the answer
    // there, not an input, so a hidden field is skipped rather than forced.
    const field = page.locator(`[name="${name}"]`);
    if (await field.isVisible()) await field.fill(value);
  }
};

const calcReference = async (page: Page, over: Partial<typeof REFERENCE> = {}) => {
  await fillReference(page, over);
  await submit(page).click();
};

const openSchedule = async (page: Page) => {
  await page.locator('.sv-disclosure__summary').click();
  await expect(page.locator('[data-sv-schedule]')).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads with every personal field empty and a labelled example result', async ({ page }) => {
  await expect(page.locator('[name="mode"][value="project"]')).toBeChecked();
  for (const name of [
    'initialDeposit',
    'annualContribution',
    'annualIncreasePct',
    'monthlyContribution',
    'monthlyIncreasePct',
    'annualRatePct',
    'years',
    'taxRatePct',
  ]) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  // Compound is a structural default, not the visitor's own figure.
  await expect(page.locator('[name="compound"]')).toHaveValue('annually');
  await expect(submit(page)).toHaveText('Calculate');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  await expect(region(page, 'empty')).toBeHidden();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
});

test('carries the reference field set, with the reference labels', async ({ page }) => {
  const form = page.locator('form[data-form]');
  for (const label of [
    'Initial deposit',
    'Annual contribution',
    'Monthly contribution',
    'Interest rate',
    'Compound',
    'Years to save',
    'Tax rate',
  ]) {
    await expect(form.getByText(label, { exact: true })).toBeVisible();
  }
  // Each contribution carries its own yearly increase.
  await expect(form.locator('label[for="sv-annual-inc"]')).toContainText('increase');
  await expect(form.locator('label[for="sv-monthly-inc"]')).toContainText('% /year');
});

test('offers the nine compounding frequencies', async ({ page }) => {
  const options = page.locator('[name="compound"] option');
  await expect(options).toHaveCount(9);
  await expect(options).toHaveText([
    'annually',
    'semiannually',
    'quarterly',
    'monthly',
    'semimonthly',
    'biweekly',
    'weekly',
    'daily',
    'continuously',
  ]);
});

test('does not calculate before the first submission', async ({ page }) => {
  await fillReference(page);
  await page.waitForTimeout(DEBOUNCE + 100);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- The reference case ------------------------------------------------- */

test('reproduces the reference plan to the cent', async ({ page }) => {
  await calcReference(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('End balance');
  await expect(primary(page)).toHaveText('$92,116.99');
  await expect(cell(page, 'end')).toHaveText('$92,116.99');
  await expect(cell(page, 'initial')).toHaveText('$20,000.00');
  await expect(cell(page, 'contrib')).toHaveText('$57,319.40');
  await expect(cell(page, 'interest')).toHaveText('$14,797.59');
  await expect(liveRegion(page)).toHaveText('Your end balance is 92116 dollars and 99 cents.');
});

test('splits the end balance into three labelled shares', async ({ page }) => {
  await calcReference(page);
  await expect(page.locator('[data-sv-split]')).toBeVisible();
  await expect(cell(page, 'share-initial')).toHaveText('22%');
  await expect(cell(page, 'share-contrib')).toHaveText('62%');
  await expect(cell(page, 'share-interest')).toHaveText('16%');
  // Identity is never colour-alone: each share is named in words beside its swatch.
  await expect(page.locator('[data-sv-split]')).toContainText('Initial deposit');
  await expect(page.locator('[data-sv-split]')).toContainText('Contributions');
  await expect(page.locator('[data-sv-split]')).toContainText('Interest');
});

test('the three summary parts add up to the end balance', async ({ page }) => {
  await calcReference(page, { annualRatePct: '5.5', monthlyContribution: '125', years: '17' });
  const money = async (key: string) =>
    Number(((await cell(page, key).textContent()) ?? '').replace(/[$,]/g, ''));
  const [end, initial, contributions, interest] = await Promise.all(
    ['end', 'initial', 'contrib', 'interest'].map(money),
  );
  // Each line is rounded to the cent independently, so the visible parts can land a
  // cent either side of the visible total. The underlying figures reconcile exactly —
  // the binding's guard refuses to render a result where they do not.
  expect(Math.abs(initial + contributions + interest - end)).toBeLessThanOrEqual(0.01);
});

test('hides the tax line until a tax rate is entered, then reports tax paid', async ({ page }) => {
  await calcReference(page);
  await expect(page.locator('[data-sv-tax-row]')).toBeHidden();

  await page.fill('[name="taxRatePct"]', '25');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[data-sv-tax-row]')).toBeVisible();
  await expect(cell(page, 'tax')).toHaveText('$3,589.02');
  await expect(cell(page, 'interest')).toHaveText('$10,767.06');
  await expect(cell(page, 'end')).toHaveText('$88,086.45');
});

test('the contribution increase changes the result', async ({ page }) => {
  await calcReference(page, { annualIncreasePct: '0' });
  await expect(cell(page, 'end')).toHaveText('$84,197.72');
  await page.fill('[name="annualIncreasePct"]', '3');
  await page.waitForTimeout(DEBOUNCE);
  await expect(cell(page, 'end')).toHaveText('$92,116.99');
});

test('the compounding frequency changes the result', async ({ page }) => {
  await calcReference(page);
  await expect(cell(page, 'end')).toHaveText('$92,116.99');
  await page.selectOption('[name="compound"]', 'daily');
  await page.waitForTimeout(DEBOUNCE);
  await expect(cell(page, 'end')).toHaveText('$92,364.84');
});

test('a monthly contribution compounds as an ordinary annuity', async ({ page }) => {
  await calcReference(page, {
    initialDeposit: '0',
    annualContribution: '0',
    annualIncreasePct: '0',
    monthlyContribution: '500',
    annualRatePct: '4',
    years: '5',
  });
  await page.selectOption('[name="compound"]', 'monthly');
  await page.waitForTimeout(DEBOUNCE);
  await expect(cell(page, 'end')).toHaveText('$33,149.49');
  await expect(cell(page, 'contrib')).toHaveText('$30,000.00');
  await expect(cell(page, 'interest')).toHaveText('$3,149.49');
});

/* ---- Blank optional fields ---------------------------------------------- */

test('optional fields left blank count as zero rather than blocking the calculation', async ({ page }) => {
  await page.fill('[name="initialDeposit"]', '20000');
  await page.fill('[name="annualRatePct"]', '3');
  await page.fill('[name="years"]', '10');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  // 20,000 at 3% compounded annually for ten years, with nothing added.
  await expect(cell(page, 'contrib')).toHaveText('$0.00');
  await expect(cell(page, 'end')).toHaveText('$26,878.33');
});

/* ---- Schedule ----------------------------------------------------------- */

test('the annual schedule reproduces the reference rows', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  const rows = page.locator('[data-sv-rows="yearly"] tr');
  await expect(rows).toHaveCount(10);
  await expect(rows.nth(0).locator('th, td')).toHaveText(['1', '$25,000.00', '$600.00', '$25,600.00']);
  await expect(rows.nth(1).locator('th, td')).toHaveText(['2', '$5,150.00', '$768.00', '$31,518.00']);
  await expect(rows.nth(9).locator('th, td')).toHaveText(['10', '$6,523.87', '$2,493.00', '$92,116.99']);
});

test('the first row carries the opening deposit, and the last row is the end balance', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  const rows = page.locator('[data-sv-rows="yearly"] tr');
  // Year 1 deposit = the 20,000 opening balance + the 5,000 contribution.
  await expect(rows.nth(0).locator('td').first()).toHaveText('$25,000.00');
  await expect(rows.nth(9).locator('td').last()).toHaveText(await cell(page, 'end').innerText());
});

test('switching to the monthly view is a view change, not a recalculation', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  await expect(page.locator('[data-sv-rows="yearly"] tr').first()).toBeVisible();

  await page.locator('[data-sv-view-radio][value="monthly"]').check();
  await expect(page.locator('[data-sv-rows="yearly"] tr').first()).toBeHidden();
  // 120 months plus a divider closing each of the ten years.
  await expect(page.locator('[data-sv-rows="monthly"] tr')).toHaveCount(130);
  await expect(page.locator('[data-sv-rows="monthly"] .sv-cell--yearend').first()).toHaveText(
    'End of year 1',
  );
  // The headline is untouched by a view switch.
  await expect(primary(page)).toHaveText('$92,116.99');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

test('the monthly rows close each year on the annual figure', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  await page.locator('[data-sv-view-radio][value="monthly"]').check();
  const month12 = page.locator('[data-sv-rows="monthly"] tr').nth(11);
  await expect(month12.locator('td').last()).toHaveText('$25,600.00');
});

test('the schedule table right-aligns its numbers', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  const firstNumber = page.locator('[data-sv-rows="yearly"] td.sv-num').first();
  await expect(firstNumber).toHaveCSS('text-align', 'right');
});

/* ---- Chart -------------------------------------------------------------- */

test('draws one stacked column per year, with a named legend', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  const figure = page.locator('[data-sv-chart-figure]');
  await expect(figure).toBeVisible();
  await expect(page.locator('[data-sv-chart] .sv-chart__bar')).toHaveCount(10);
  await expect(figure.locator('figcaption')).toContainText('Initial deposit');
  await expect(figure.locator('figcaption')).toContainText('Contributions');
  await expect(figure.locator('figcaption')).toContainText('Interest');
  // The chart carries its own text description rather than relying on the image alone.
  await expect(page.locator('[data-sv-chart] svg')).toHaveAttribute('aria-label', /\$92,116\.99/);
});

test('stands the chart down when the balance is not a positive whole', async ({ page }) => {
  await calcReference(page, {
    initialDeposit: '1000',
    annualContribution: '0',
    annualIncreasePct: '0',
    monthlyContribution: '-500',
    annualRatePct: '0',
    years: '1',
  });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(cell(page, 'end')).toHaveText('-$5,000.00');
  await expect(page.locator('[data-sv-split]')).toBeHidden();
  await openSchedule(page);
  await expect(page.locator('[data-sv-chart-figure]')).toBeHidden();
  // ...but the schedule is still there, because the numbers are still real.
  await expect(page.locator('[data-sv-rows="yearly"] tr')).toHaveCount(1);
});

/* ---- Validation --------------------------------------------------------- */

test('an all-empty submission reports the required fields and focuses the first', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="initialDeposit"]')).toBeVisible();
  await expect(page.locator('[data-error-for="annualRatePct"]')).toBeVisible();
  await expect(page.locator('[data-error-for="years"]')).toBeVisible();
  await expect(page.locator('[name="initialDeposit"]')).toBeFocused();
  await expect(page.locator('[name="initialDeposit"]')).toHaveAttribute('aria-invalid', 'true');
});

test('rejects a fractional or out-of-range term rather than rounding it', async ({ page }) => {
  for (const bad of ['0', '10.5', '101']) {
    await fillReference(page, { years: bad });
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="years"]')).toBeVisible();
  }
});

test('rejects a negative interest rate but accepts a negative deposit', async ({ page }) => {
  await calcReference(page, { annualRatePct: '-1' });
  await expect(page.locator('[data-error-for="annualRatePct"]')).toBeVisible();

  await calcReference(page, { annualRatePct: '3', initialDeposit: '-5000' });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

test('bounds the tax rate to 0–100', async ({ page }) => {
  await calcReference(page, {});
  await page.fill('[name="taxRatePct"]', '150');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="taxRatePct"]')).toBeVisible();
});

test('never renders NaN, Infinity or a raw error', async ({ page }) => {
  await calcReference(page, { annualRatePct: '0', years: '100', initialDeposit: '0' });
  const text = (await shell(page).innerText()) ?? '';
  expect(text).not.toMatch(/NaN|Infinity|undefined|\[object/);
});

/* ---- Live-after-first, reset -------------------------------------------- */

test('recalculates live after the first result without moving focus', async ({ page }) => {
  await calcReference(page);
  await expect(page.locator('[data-live-note]')).toBeVisible();
  const years = page.locator('[name="years"]');
  await years.focus();
  await years.fill('20');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).not.toHaveText('$92,116.99');
  await expect(years).toBeFocused();
});

test('reset clears every field, restores the defaults and empties the result', async ({ page }) => {
  await calcReference(page);
  await page.selectOption('[name="compound"]', 'daily');
  await openSchedule(page);
  await page.locator('[data-sv-view-radio][value="monthly"]').check();

  await page.locator('[data-reset]').click();
  for (const name of ['initialDeposit', 'annualContribution', 'annualRatePct', 'years', 'taxRatePct']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[name="compound"]')).toHaveValue('annually');
  await expect(page.locator('[name="mode"][value="project"]')).toBeChecked();
  await expect(page.locator('[data-sv-view-radio][value="yearly"]')).toBeChecked();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Reach a savings goal ----------------------------------------------- */

test('goal mode swaps the monthly contribution for a target', async ({ page }) => {
  await page.check('[name="mode"][value="goal"]');
  await expect(page.locator('[data-field="monthlyContribution"]')).toBeHidden();
  await expect(page.locator('[data-field="monthlyIncreasePct"]')).toBeHidden();
  await expect(page.locator('[name="monthlyContribution"]')).toBeDisabled();
  await expect(page.locator('[data-field="goal"]')).toBeVisible();
  await expect(submit(page)).toHaveText('Calculate Contribution');
});

test('solves for a monthly contribution that actually reaches the goal', async ({ page }) => {
  await page.check('[name="mode"][value="goal"]');
  await fillReference(page);
  await page.fill('[name="goal"]', '150000');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Monthly contribution needed');
  await expect(primary(page)).toHaveText('$415.09');
  // The plan it reports lands exactly on the goal.
  await expect(cell(page, 'end')).toHaveText('$150,000.00');
  await expect(page.locator('[data-sv-goal-block]')).toContainText('$150,000.00');
});

test('a goal the plan already reaches is a valid $0 result, not an error', async ({ page }) => {
  await page.check('[name="mode"][value="goal"]');
  await fillReference(page);
  await page.fill('[name="goal"]', '1000');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$0.00');
  await expect(page.locator('[data-sv-interpretation]')).toBeVisible();
  await expect(page.locator('[data-sv-interpretation]')).toContainText('no monthly contribution');
  await expect(liveRegion(page)).toContainText('already reaches the goal');
});

test('goal mode requires a positive goal', async ({ page }) => {
  await page.check('[name="mode"][value="goal"]');
  await fillReference(page);
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="goal"]')).toBeVisible();
});

/* ---- Layout, theme, embed, monetization --------------------------------- */

test('desktop shows the form, the primary action and the result at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  for (const target of [
    page.locator('h1'),
    page.locator('[name="taxRatePct"]'),
    submit(page),
    primary(page).first(),
  ]) {
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
  const perRow = new Map<number, number>();
  for (const t of tops) perRow.set(t, (perRow.get(t) ?? 0) + 1);
  // Nine visible fields: four full rows of two, with only the last one alone.
  expect(tops).toHaveLength(9);
  expect([...perRow.values()].filter((n) => n === 2)).toHaveLength(4);
  expect([...perRow.values()].filter((n) => n === 1)).toHaveLength(1);
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calcReference(page);
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
  await expect(primary(page)).toHaveText('$92,116.99');
});

test('the generated embed mounts the same island and computes', async ({ page }) => {
  await page.goto('/embed/finance/savings-calculator', { waitUntil: 'domcontentloaded' });
  await calcReference(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$92,116.99');
});

test('the live page carries no monetization output', async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-monetization-region]')).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toMatch(/adsbygoogle|data-ad-client/);
});
