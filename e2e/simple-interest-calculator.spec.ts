import { test, expect, type Page } from '@playwright/test';

/**
 * Simple interest — one formula, solved for whichever variable is missing.
 *
 * Four tabs (Balance / Principal / Term / Rate) as real radios, so they are
 * keyboard-operable; each hides the field that has become the answer. The rate and the
 * term each carry their own period, because a rate quoted per month against a term in
 * years is a real combination and multiplying them as they stand is off by twelve.
 *
 * Pinned to the published reference: $20,000 at 3% a year for 10 years earns $6,000 and
 * ends at $26,000 — a 77% / 23% ring, a flat $600 a year, and the working written out
 * as "Total Interest = ... = $6,000.00" then "End Balance = ... = $26,000.00".
 */
const ROUTE = '/finance/simple-interest-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#si-result');
const primary = (page: Page) => page.locator('#si-result [data-result-value]');
const balance = (page: Page) => page.locator('[data-si-balance]');
const interest = (page: Page) => page.locator('[data-si-interest]');
const solvedRow = (page: Page) => page.locator('[data-si-solved-row]');
const steps = (page: Page) => page.locator('[data-si-steps] .si-step');
const donut = (page: Page) => page.locator('[data-si-donut-figure]');
const chart = (page: Page) => page.locator('[data-si-chart-figure]');
const schedule = (page: Page) => page.locator('[data-si-schedule]');
const rows = (page: Page) => page.locator('[data-si-rows] tr');
const live = (page: Page) => page.locator('#si-live');
const submit = (page: Page) => page.locator('[data-si-submit]');
const region = (page: Page, when: string) => page.locator(`#si-result [data-result-when~="${when}"]`);
const row = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);

const mode = async (page: Page, value: string) => page.locator(`[name="solveFor"][value="${value}"]`).check();

/** Fill only the fields the current tab actually shows. */
const fill = async (page: Page, values: Record<string, string>) => {
  for (const [name, v] of Object.entries(values)) await page.fill(`[name="${name}"]`, v);
};
const calcBalance = async (page: Page, over: Record<string, string> = {}) => {
  await fill(page, { principal: '20000', ratePerUnitPct: '3', term: '10', ...over });
  await submit(page).click();
};

test.describe('simple interest: the four tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('loads empty on the Balance tab, with the end balance hidden', async ({ page }) => {
    await expect(page.locator('[name="solveFor"][value="balance"]')).toBeChecked();
    for (const name of ['principal', 'ratePerUnitPct', 'term']) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
      await expect(row(page, name)).toBeVisible();
    }
    // The end balance IS the answer here, so it is not a question.
    await expect(row(page, 'endBalance')).toBeHidden();
    await expect(page.locator('[name="rateUnit"]')).toHaveValue('year');
    await expect(page.locator('[name="termUnit"]')).toHaveValue('year');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(live(page)).toHaveText('');
  });

  test('offers the reference’s four tabs, in its order', async ({ page }) => {
    await expect(page.locator('.si-tab span')).toHaveText(['Balance', 'Principal', 'Term', 'Rate']);
  });

  test('each tab stops asking for the field it is solving for', async ({ page }) => {
    const solvedField: Record<string, string> = {
      balance: 'endBalance',
      principal: 'principal',
      term: 'term',
      rate: 'ratePerUnitPct',
    };
    for (const [tab, solved] of Object.entries(solvedField)) {
      await mode(page, tab);
      // The number is never asked for on its own tab.
      await expect(page.locator(`[name="${solved}"]`)).toBeHidden();
      // Every other field is still a question.
      for (const name of ['endBalance', 'principal', 'ratePerUnitPct', 'term']) {
        if (name !== solved) await expect(page.locator(`[name="${name}"]`)).toBeVisible();
      }
    }
  });

  test('a money row disappears entirely, but a row with a unit keeps it', async ({ page }) => {
    // Principal and end balance have no unit, so nothing is left to show.
    await mode(page, 'principal');
    await expect(row(page, 'principal')).toBeHidden();
    await mode(page, 'balance');
    await expect(row(page, 'endBalance')).toBeHidden();

    // Term and rate DO have a unit, and it is what the answer comes back in — hiding
    // it would leave invisible state deciding the output.
    await mode(page, 'term');
    await expect(row(page, 'term')).toBeVisible();
    await expect(page.locator('[name="term"]')).toBeHidden();
    await expect(page.locator('[name="termUnit"]')).toBeVisible();

    await mode(page, 'rate');
    await expect(row(page, 'ratePerUnitPct')).toBeVisible();
    await expect(page.locator('[name="ratePerUnitPct"]')).toBeHidden();
    await expect(page.locator('[name="rateUnit"]')).toBeVisible();
  });

  test('offers all four periods for both the rate and the term', async ({ page }) => {
    await expect(page.locator('[name="rateUnit"] option')).toHaveText([
      'per year',
      'per month',
      'per week',
      'per day',
    ]);
    await expect(page.locator('[name="termUnit"] option')).toHaveText(['years', 'months', 'weeks', 'days']);
  });

  test('does not calculate before the first submission', async ({ page }) => {
    await fill(page, { principal: '20000', ratePerUnitPct: '3', term: '10' });
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- the reference result ---- */

  test('the reference case prints the published figures', async ({ page }) => {
    await calcBalance(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$26,000.00');
    await expect(balance(page)).toHaveText('$26,000.00');
    await expect(interest(page)).toHaveText('$6,000.00');
    await expect(live(page)).toHaveText('End balance: 26000 dollars.');
    // On the Balance tab the answer IS the balance, so no separate answer row.
    await expect(solvedRow(page)).toBeHidden();
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the calculation steps are written out as the reference shows them', async ({ page }) => {
    await calcBalance(page);
    await expect(steps(page)).toHaveCount(2);
    await expect(steps(page).nth(0)).toContainText('Total Interest = $20,000 × 3% × 10');
    await expect(steps(page).nth(0)).toContainText('= $6,000.00');
    await expect(steps(page).nth(1)).toContainText('End Balance = $20,000 + $6,000.00');
    await expect(steps(page).nth(1)).toContainText('= $26,000.00');
  });

  test('the breakdown ring splits the balance 77% / 23%', async ({ page }) => {
    await calcBalance(page);
    await expect(donut(page)).toBeVisible();
    const svg = page.locator('.si-donut__svg');
    await expect(svg).toHaveCount(1);
    await expect(svg).toHaveAttribute('role', 'img');
    expect(await svg.getAttribute('aria-label')).toContain('$26,000.00');
    await expect(page.locator('[data-si-share-principal]')).toHaveText('77%');
    await expect(page.locator('[data-si-share-interest]')).toHaveText('23%');
  });

  test('the accumulation graph runs from year 0 to the end of the term', async ({ page }) => {
    await calcBalance(page);
    await expect(chart(page)).toBeVisible();
    await expect(page.locator('.si-chart__svg')).toHaveCount(1);
    // Eleven columns: year zero plus ten years.
    await expect(page.locator('.si-chart__seg--initial')).toHaveCount(11);
    // Year zero has no interest yet, so only ten interest segments are drawn.
    await expect(page.locator('.si-chart__seg--interest')).toHaveCount(10);
    await expect(page.locator('.si-chart__tick', { hasText: 'Year 0' })).toHaveCount(1);
    await expect(page.locator('.si-chart__tick', { hasText: 'Year 10' })).toHaveCount(1);
  });

  test('the schedule is a flat $600 a year climbing to the end balance', async ({ page }) => {
    await calcBalance(page);
    await expect(schedule(page)).toBeVisible();
    await expect(rows(page)).toHaveCount(10);

    const cells = (i: number) => rows(page).nth(i).locator('td');
    await expect(rows(page).nth(0).locator('th')).toHaveText('1');
    await expect(cells(0).nth(0)).toHaveText('$600.00');
    await expect(cells(0).nth(1)).toHaveText('$20,600.00');
    await expect(cells(4).nth(1)).toHaveText('$23,000.00');
    await expect(cells(9).nth(0)).toHaveText('$600.00');
    await expect(cells(9).nth(1)).toHaveText('$26,000.00');
  });

  /* ---- the other three tabs ---- */

  test('the Principal tab solves back from an end balance', async ({ page }) => {
    await mode(page, 'principal');
    await fill(page, { endBalance: '30000', ratePerUnitPct: '3', term: '10' });
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(solvedRow(page)).toBeVisible();
    await expect(page.locator('[data-si-solved-label]')).toHaveText('Principal');
    await expect(page.locator('[data-si-solved]')).toHaveText('$23,076.92');
    await expect(balance(page)).toHaveText('$30,000.00');
  });

  test('the Term tab solves in the unit chosen beside it', async ({ page }) => {
    await mode(page, 'term');
    await fill(page, { endBalance: '30000', principal: '20000', ratePerUnitPct: '3' });
    await submit(page).click();
    await expect(page.locator('[data-si-solved-label]')).toHaveText('Term');
    await expect(page.locator('[data-si-solved]')).toHaveText('16.67 years');

    await page.selectOption('[name="termUnit"]', 'month');
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('[data-si-solved]')).toHaveText('200 months');
  });

  test('the Rate tab solves in the period it is quoted in', async ({ page }) => {
    await mode(page, 'rate');
    await fill(page, { endBalance: '30000', principal: '20000', term: '10' });
    await submit(page).click();
    await expect(page.locator('[data-si-solved-label]')).toHaveText('Interest rate');
    await expect(page.locator('[data-si-solved]')).toHaveText('5% per year');
    await expect(live(page)).toHaveText('Interest rate: 5% per year. End balance $30,000.00.');
  });

  test('a monthly rate is not multiplied against a term in years as it stands', async ({ page }) => {
    await calcBalance(page, { ratePerUnitPct: '0.25' });
    await page.selectOption('[name="rateUnit"]', 'month');
    await page.waitForTimeout(DEBOUNCE);
    // 0.25% a month for 10 years is 3% a year — $6,000, not $500.
    await expect(interest(page)).toHaveText('$6,000.00');
  });

  test('switching tabs clears a result computed for the old question', async ({ page }) => {
    await calcBalance(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await mode(page, 'rate');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- validation ---- */

  test('each visible field is required and range-checked', async ({ page }) => {
    await fill(page, { principal: '0', ratePerUnitPct: '3', term: '10' });
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="principal"]')).toHaveText(
      'Enter a principal greater than zero.',
    );

    await calcBalance(page, { ratePerUnitPct: '' });
    await expect(page.locator('[data-error-for="ratePerUnitPct"]')).toHaveText('Enter the interest rate.');

    await calcBalance(page, { term: '-1' });
    await expect(page.locator('[data-error-for="term"]')).toHaveText('Enter a term of zero or more.');
  });

  test('a balance below the principal has no positive term or rate', async ({ page }) => {
    await mode(page, 'rate');
    await fill(page, { endBalance: '15000', principal: '20000', term: '10' });
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="endBalance"]')).toHaveText(
      'The end balance must be at least the principal — simple interest only adds to it.',
    );
  });

  test('the two divisions say so rather than returning a number', async ({ page }) => {
    await mode(page, 'term');
    await fill(page, { endBalance: '26000', principal: '20000', ratePerUnitPct: '0' });
    await submit(page).click();
    await expect(page.locator('[data-error-for="ratePerUnitPct"]')).toContainText('at 0% no term ever reaches');

    await mode(page, 'rate');
    await fill(page, { endBalance: '26000', principal: '20000', term: '0' });
    await submit(page).click();
    await expect(page.locator('[data-error-for="term"]')).toContainText('in no time at all');
  });

  test('a stale value from another tab never blocks the current one', async ({ page }) => {
    await mode(page, 'principal');
    await fill(page, { endBalance: '-500' });
    await mode(page, 'balance');
    await calcBalance(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$26,000.00');
  });

  test('an empty explicit submission focuses the first field the tab asks for', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[name="principal"]')).toBeFocused();
  });

  /* ---- live update / reset ---- */

  test('a valid live update recomputes without moving focus', async ({ page }) => {
    await calcBalance(page);
    await page.fill('[name="term"]', '20');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('$32,000.00');
    await expect(page.locator('[name="term"]')).toBeFocused();
  });

  test('clear empties the fields and returns to the Balance tab', async ({ page }) => {
    await mode(page, 'rate');
    await fill(page, { endBalance: '30000', principal: '20000', term: '10' });
    await submit(page).click();
    await page.selectOption('[name="termUnit"]', 'month');

    await page.click('[data-reset]');
    await expect(page.locator('[name="solveFor"][value="balance"]')).toBeChecked();
    await expect(page.locator('[name="termUnit"]')).toHaveValue('year');
    for (const name of ['principal', 'endBalance', 'ratePerUnitPct', 'term']) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    }
    await expect(row(page, 'endBalance')).toBeHidden();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  /* ---- presentation ---- */

  test('keyboard submission works from a field', async ({ page }) => {
    await fill(page, { principal: '20000', ratePerUnitPct: '3', term: '10' });
    await page.locator('[name="term"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$26,000.00');
  });

  test('desktop shows the tabs, the inputs, the action and the balance at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.si-tabs')).toBeInViewport();
    await expect(submit(page)).toBeInViewport();
    await calcBalance(page);
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calcBalance(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calcBalance(page);
    await expect(primary(page)).toBeVisible();
    await expect(donut(page)).toBeVisible();
    await expect(chart(page)).toBeVisible();
  });

  test('the generated embed mounts the same island', async ({ page }) => {
    await page.goto('/embed/finance/simple-interest-calculator', { waitUntil: 'domcontentloaded' });
    await calcBalance(page);
    await expect(page.locator('#si-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$26,000.00');
    await expect(rows(page)).toHaveCount(10);
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});
