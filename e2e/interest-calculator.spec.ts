import { test, expect, type Page } from '@playwright/test';

/**
 * Interest calculator — compound interest accumulation.
 *
 * Field set: initial investment · annual contribution · monthly contribution ·
 * contribution timing · interest rate · compound · investment length in years and
 * months · tax rate · inflation rate. Result: the ending balance, the seven figures
 * that explain it, a proportion bar, a stacked accumulation chart and an
 * annual/monthly schedule.
 *
 * The reference case (a $20,000 investment, $5,000 a year at the beginning of each
 * period, 5% compounded annually for five years, 3% inflation) is asserted to the
 * cent here as well as in the unit tests, because it is the case the whole model was
 * built to reproduce.
 */
const ROUTE = '/finance/interest-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#interest-result');
const primary = (page: Page) => page.locator('#interest-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#interest-result [data-result-summary-label]');
const liveRegion = (page: Page) => page.locator('#interest-live');
const submit = (page: Page) => page.locator('[data-int-submit]');
const region = (page: Page, when: string) =>
  page.locator(`#interest-result [data-result-when~="${when}"]`);
const cell = (page: Page, key: string) => page.locator(`#interest-result [data-int-${key}]`);

const REFERENCE = {
  initialInvestment: '20000',
  annualContribution: '5000',
  monthlyContribution: '0',
  annualRatePct: '5',
  years: '5',
  months: '0',
};

const fillReference = async (page: Page, over: Partial<typeof REFERENCE> = {}) => {
  const v = { ...REFERENCE, ...over };
  for (const [name, value] of Object.entries(v)) await page.fill(`[name="${name}"]`, value);
};

const calcReference = async (page: Page, over: Partial<typeof REFERENCE> = {}) => {
  await fillReference(page, over);
  await submit(page).click();
};

const openSchedule = async (page: Page) => {
  await page.locator('.int-disclosure__summary').click();
  await expect(page.locator('[data-int-schedule]')).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads with every personal field empty and a labelled example result', async ({ page }) => {
  for (const name of [
    'initialInvestment',
    'annualContribution',
    'monthlyContribution',
    'annualRatePct',
    'years',
    'months',
    'taxRatePct',
  ]) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  // The three structural controls, which always carry a value.
  await expect(page.locator('[name="compound"]')).toHaveValue('annually');
  await expect(page.locator('[data-int-timing][value="beginning"]')).toBeChecked();
  await expect(page.locator('[name="inflationRatePct"]')).toHaveValue('3');

  await expect(submit(page)).toHaveText('Calculate');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  await expect(region(page, 'empty')).toBeHidden();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
});

test('carries the reference field set, with the reference labels', async ({ page }) => {
  const form = page.locator('form[data-form]');
  for (const label of [
    'Initial investment',
    'Annual contribution',
    'Monthly contribution',
    'Contribute at the',
    'Interest rate',
    'Compound',
    'Investment length',
    'Tax rate',
    'Inflation rate',
  ]) {
    await expect(form.getByText(label, { exact: true })).toBeVisible();
  }
  // The term is two boxes, with their units beside them.
  await expect(form.getByText('years', { exact: true })).toBeVisible();
  await expect(form.getByText('months', { exact: true })).toBeVisible();
  await expect(form.getByText('of each compounding period')).toBeVisible();
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

test('reproduces all seven reference figures to the cent', async ({ page }) => {
  await calcReference(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Ending balance');
  await expect(primary(page)).toHaveText('$54,535.20');
  await expect(cell(page, 'ending')).toHaveText('$54,535.20');
  await expect(cell(page, 'principal')).toHaveText('$45,000.00');
  await expect(cell(page, 'contrib')).toHaveText('$25,000.00');
  await expect(cell(page, 'interest')).toHaveText('$9,535.20');
  await expect(cell(page, 'interest-initial')).toHaveText('$5,525.63');
  await expect(cell(page, 'interest-contrib')).toHaveText('$4,009.56');
  await expect(cell(page, 'buying')).toHaveText('$47,042.54');
  await expect(liveRegion(page)).toHaveText('Your ending balance is 54535 dollars and 20 cents.');
});

test('the figures add up: principal + interest, and the interest split', async ({ page }) => {
  await calcReference(page, { monthlyContribution: '150', annualRatePct: '6.5', years: '9', months: '4' });
  const money = async (key: string) =>
    Number(((await cell(page, key).textContent()) ?? '').replace(/[$,]/g, ''));
  const [ending, principal, interest, ofInitial, ofContrib] = await Promise.all(
    ['ending', 'principal', 'interest', 'interest-initial', 'interest-contrib'].map(money),
  );
  // Each line is rounded to the cent on its own, so the parts can land a penny either
  // side of the total. Compared in whole cents, because summing dollars-as-floats
  // reintroduces exactly the noise this check is trying to see past.
  const pennies = (n: number) => Math.round(n * 100);
  expect(Math.abs(pennies(principal) + pennies(interest) - pennies(ending))).toBeLessThanOrEqual(1);
  expect(
    Math.abs(pennies(ofInitial) + pennies(ofContrib) - pennies(interest)),
  ).toBeLessThanOrEqual(1);
});

test('splits the ending balance into three labelled shares', async ({ page }) => {
  await calcReference(page);
  await expect(page.locator('[data-int-split]')).toBeVisible();
  await expect(cell(page, 'share-initial')).toHaveText('37%');
  await expect(cell(page, 'share-contrib')).toHaveText('46%');
  await expect(cell(page, 'share-interest')).toHaveText('17%');
  // Identity is never colour-alone: each share is named beside its swatch.
  await expect(page.locator('[data-int-split]')).toContainText('Initial investment');
  await expect(page.locator('[data-int-split]')).toContainText('Contributions');
  await expect(page.locator('[data-int-split]')).toContainText('Interest');
});

/* ---- Contribution timing ------------------------------------------------ */

test('contributing at the end earns less on identical money in', async ({ page }) => {
  await calcReference(page);
  await expect(cell(page, 'ending')).toHaveText('$54,535.20');
  await expect(cell(page, 'interest')).toHaveText('$9,535.20');

  await page.locator('[data-int-timing][value="end"]').check();
  await page.waitForTimeout(DEBOUNCE);
  await expect(cell(page, 'ending')).toHaveText('$53,153.79');
  await expect(cell(page, 'interest')).toHaveText('$8,153.79');
  // The same money went in either way.
  await expect(cell(page, 'principal')).toHaveText('$45,000.00');
});

/* ---- Tax and inflation -------------------------------------------------- */

test('hides the tax line until a tax rate is entered, then reports tax paid', async ({ page }) => {
  await calcReference(page);
  await expect(page.locator('[data-int-tax-row]')).toBeHidden();

  await page.fill('[name="taxRatePct"]', '22');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[data-int-tax-row]')).toBeVisible();
  await expect(cell(page, 'tax')).toHaveText('$2,047.54');
  await expect(cell(page, 'ending')).toHaveText('$52,259.47');
});

test('inflation changes only the buying-power line, and hides it at zero', async ({ page }) => {
  await calcReference(page);
  await expect(page.locator('[data-int-buying-row]')).toBeVisible();
  await expect(cell(page, 'buying')).toHaveText('$47,042.54');

  await page.fill('[name="inflationRatePct"]', '0');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[data-int-buying-row]')).toBeHidden();
  // The balance itself is untouched by inflation.
  await expect(cell(page, 'ending')).toHaveText('$54,535.20');
});

test('the compounding frequency changes the result', async ({ page }) => {
  await calcReference(page);
  await expect(cell(page, 'ending')).toHaveText('$54,535.20');
  await page.selectOption('[name="compound"]', 'monthly');
  await page.waitForTimeout(DEBOUNCE);
  await expect(cell(page, 'ending')).toHaveText('$54,776.32');
});

/* ---- Schedule ----------------------------------------------------------- */

test('the annual schedule reproduces the reference rows', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  const rows = page.locator('[data-int-rows="yearly"] tr');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0).locator('th, td')).toHaveText(['1', '$25,000.00', '$1,250.00', '$26,250.00']);
  await expect(rows.nth(1).locator('th, td')).toHaveText(['2', '$5,000.00', '$1,562.50', '$32,812.50']);
  await expect(rows.nth(4).locator('th, td')).toHaveText(['5', '$5,000.00', '$2,596.91', '$54,535.20']);
});

test('the first row carries the initial investment, and the last is the ending balance', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  const rows = page.locator('[data-int-rows="yearly"] tr');
  await expect(rows.nth(0).locator('td').first()).toHaveText('$25,000.00');
  await expect(rows.nth(4).locator('td').last()).toHaveText(await cell(page, 'ending').innerText());
});

test('switching to the monthly view is a view change, not a recalculation', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  await expect(page.locator('[data-int-rows="yearly"] tr').first()).toBeVisible();

  await page.locator('[data-int-view-radio][value="monthly"]').check();
  await expect(page.locator('[data-int-rows="yearly"] tr').first()).toBeHidden();
  // 60 months plus a divider closing each of the five years.
  await expect(page.locator('[data-int-rows="monthly"] tr')).toHaveCount(65);
  await expect(page.locator('[data-int-rows="monthly"] .int-cell--yearend').first()).toHaveText(
    'End of year 1',
  );
  await expect(primary(page)).toHaveText('$54,535.20');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

test('at beginning-timing the annual contribution lands in the year’s first month', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  await page.locator('[data-int-view-radio][value="monthly"]').check();
  const rows = page.locator('[data-int-rows="monthly"] tr');
  // Month 1 carries the initial investment and the year's contribution...
  await expect(rows.nth(0).locator('td').first()).toHaveText('$25,000.00');
  // ...so month 12 has no deposit at all, and closes on the annual figure.
  await expect(rows.nth(11).locator('td').first()).toHaveText('$0.00');
  await expect(rows.nth(11).locator('td').last()).toHaveText('$26,250.00');
});

test('a term with odd months closes a short final year', async ({ page }) => {
  await calcReference(page, { months: '6' });
  await openSchedule(page);
  const rows = page.locator('[data-int-rows="yearly"] tr');
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(5).locator('th, td')).toHaveText(['6', '$5,000.00', '$1,470.23', '$61,005.42']);
  await expect(cell(page, 'ending')).toHaveText('$61,005.42');
  // The monthly view runs to 66 rows plus the five full-year dividers.
  await page.locator('[data-int-view-radio][value="monthly"]').check();
  await expect(page.locator('[data-int-rows="monthly"] tr')).toHaveCount(71);
});

test('the schedule table right-aligns its numbers', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  await expect(page.locator('[data-int-rows="yearly"] td.int-num').first()).toHaveCSS(
    'text-align',
    'right',
  );
});

/* ---- Chart -------------------------------------------------------------- */

test('draws one stacked column per year, with a named legend', async ({ page }) => {
  await calcReference(page);
  await openSchedule(page);
  const figure = page.locator('[data-int-chart-figure]');
  await expect(figure).toBeVisible();
  await expect(page.locator('[data-int-chart] .int-chart__bar')).toHaveCount(5);
  await expect(figure.locator('figcaption')).toContainText('Initial investment');
  await expect(figure.locator('figcaption')).toContainText('Contributions');
  await expect(figure.locator('figcaption')).toContainText('Interest');
  await expect(page.locator('[data-int-chart] svg')).toHaveAttribute('aria-label', /\$54,535\.20/);
});

/* ---- Validation --------------------------------------------------------- */

test('an all-empty submission reports the required fields and focuses the first', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="initialInvestment"]')).toBeVisible();
  await expect(page.locator('[data-error-for="annualRatePct"]')).toBeVisible();
  await expect(page.locator('[data-error-for="years"]')).toBeVisible();
  await expect(page.locator('[name="initialInvestment"]')).toBeFocused();
  await expect(page.locator('[name="initialInvestment"]')).toHaveAttribute('aria-invalid', 'true');
});

test('a term of nothing at all is reported against the years box', async ({ page }) => {
  await calcReference(page, { years: '0', months: '0' });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="years"]')).toContainText('at least one month');
});

test('months alone is a valid term', async ({ page }) => {
  await calcReference(page, { years: '', months: '8' });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

test('rejects a fractional or out-of-range term rather than rounding it', async ({ page }) => {
  await calcReference(page, { years: '5.5' });
  await expect(page.locator('[data-error-for="years"]')).toBeVisible();
  await calcReference(page, { years: '5', months: '2.5' });
  await expect(page.locator('[data-error-for="months"]')).toBeVisible();
  await calcReference(page, { years: '101', months: '0' });
  await expect(page.locator('[data-error-for="years"]')).toContainText('100 years or less');
});

test('rejects negative money and rates', async ({ page }) => {
  await calcReference(page, { initialInvestment: '-100' });
  await expect(page.locator('[data-error-for="initialInvestment"]')).toBeVisible();
  await calcReference(page, { initialInvestment: '20000', annualRatePct: '-1' });
  await expect(page.locator('[data-error-for="annualRatePct"]')).toBeVisible();
});

test('bounds the tax and inflation rates to 0–100', async ({ page }) => {
  await calcReference(page);
  await page.fill('[name="taxRatePct"]', '150');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[data-error-for="taxRatePct"]')).toBeVisible();

  await page.fill('[name="taxRatePct"]', '');
  await page.fill('[name="inflationRatePct"]', '150');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[data-error-for="inflationRatePct"]')).toBeVisible();
});

test('optional fields left blank count as zero rather than blocking the calculation', async ({ page }) => {
  await page.fill('[name="initialInvestment"]', '20000');
  await page.fill('[name="annualRatePct"]', '5');
  await page.fill('[name="years"]', '5');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(cell(page, 'contrib')).toHaveText('$0.00');
  // 20,000 compounded annually at 5% for five years.
  await expect(cell(page, 'ending')).toHaveText('$25,525.63');
});

test('never renders NaN, Infinity or a raw error', async ({ page }) => {
  await calcReference(page, { initialInvestment: '0', annualRatePct: '0', years: '100' });
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
  await expect(primary(page)).not.toHaveText('$54,535.20');
  await expect(years).toBeFocused();
});

test('reset clears the fields, restores the three defaults and empties the result', async ({ page }) => {
  await calcReference(page);
  await page.selectOption('[name="compound"]', 'daily');
  await page.locator('[data-int-timing][value="end"]').check();
  await page.fill('[name="inflationRatePct"]', '7');
  await openSchedule(page);
  await page.locator('[data-int-view-radio][value="monthly"]').check();

  await page.locator('[data-reset]').click();
  for (const name of ['initialInvestment', 'annualContribution', 'annualRatePct', 'years', 'taxRatePct']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  await expect(page.locator('[name="compound"]')).toHaveValue('annually');
  await expect(page.locator('[data-int-timing][value="beginning"]')).toBeChecked();
  await expect(page.locator('[name="inflationRatePct"]')).toHaveValue('3');
  await expect(page.locator('[data-int-view-radio][value="yearly"]')).toBeChecked();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Layout, theme, embed, monetization --------------------------------- */

test('desktop shows the form, the primary action and the result at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  for (const target of [
    page.locator('h1'),
    page.locator('[name="inflationRatePct"]'),
    submit(page),
    primary(page).first(),
  ]) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  }
});

test('the term boxes stay wide enough to read an entry in', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  for (const sel of ['[name="years"]', '[name="months"]']) {
    const box = await page.locator(sel).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(48);
  }
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
  await expect(primary(page)).toHaveText('$54,535.20');
});

test('the generated embed mounts the same island and computes', async ({ page }) => {
  await page.goto('/embed/finance/interest-calculator', { waitUntil: 'domcontentloaded' });
  await calcReference(page);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$54,535.20');
});

test('the live page carries no monetization output', async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-monetization-region]')).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toMatch(/adsbygoogle|data-ad-client/);
});
