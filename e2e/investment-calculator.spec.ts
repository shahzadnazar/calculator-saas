import { test, expect, type Page } from '@playwright/test';

/**
 * Investment — what a starting amount plus regular contributions grows to.
 *
 * Task-first: the money and the term start EMPTY, the structural choices (compound
 * annually, contribute at the end of each month) are defaults, the visitor presses
 * Calculate for the first result, live-after-first thereafter.
 *
 * Pinned to the published reference: $20,000 at 6% compounded annually for ten years
 * with $1,000 at the end of every month ends at $198,290.40 — $20,000 started,
 * $120,000 contributed, $58,290.40 earned, a 10% / 61% / 29% ring — with an annual
 * schedule opening $32,000.00 / $1,526.53 / $33,526.53.
 */
const ROUTE = '/finance/investment-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#inv-result');
const primary = (page: Page) => page.locator('#inv-result [data-result-value]');
const startAmount = (page: Page) => page.locator('[data-inv-start]');
const contributions = (page: Page) => page.locator('[data-inv-contributions]');
const interest = (page: Page) => page.locator('[data-inv-interest]');
const donut = (page: Page) => page.locator('[data-inv-donut-figure]');
const chart = (page: Page) => page.locator('[data-inv-chart-figure]');
const live = (page: Page) => page.locator('#inv-live');
const submit = (page: Page) => page.locator('[data-inv-submit]');
const region = (page: Page, when: string) => page.locator(`#inv-result [data-result-when~="${when}"]`);
const yearlyRows = (page: Page) => page.locator('[data-inv-rows-yearly] tr');
const monthlyRows = (page: Page) => page.locator('[data-inv-rows-monthly] tr');

interface Plan {
  start: string;
  years: string;
  rate: string;
  contribution: string;
}
const REF: Plan = { start: '20000', years: '10', rate: '6', contribution: '1000' };

const calc = async (page: Page, over: Partial<Plan> = {}) => {
  const v = { ...REF, ...over };
  await page.fill('[name="startingAmount"]', v.start);
  await page.fill('[name="years"]', v.years);
  await page.fill('[name="annualReturnPct"]', v.rate);
  await page.fill('[name="contribution"]', v.contribution);
  await submit(page).click();
};

test.describe('investment: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('loads empty, with the reference’s own structural defaults', async ({ page }) => {
    for (const name of ['startingAmount', 'years', 'annualReturnPct', 'contribution']) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    }
    await expect(page.locator('[name="compound"]')).toHaveValue('annually');
    await expect(page.locator('[name="contributeAt"][value="end"]')).toBeChecked();
    await expect(page.locator('[name="contributeEvery"][value="month"]')).toBeChecked();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(region(page, 'empty')).toBeHidden();
    await expect(live(page)).toHaveText('');
  });

  test('offers every compounding frequency', async ({ page }) => {
    const options = page.locator('[name="compound"] option');
    await expect(options).toHaveCount(9);
    await expect(options.first()).toHaveText('annually');
    await expect(options.last()).toHaveText('continuously');
  });

  test('does not calculate before the first submission', async ({ page }) => {
    await page.fill('[name="startingAmount"]', REF.start);
    await page.fill('[name="years"]', REF.years);
    await page.fill('[name="annualReturnPct"]', REF.rate);
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- the reference result ---- */

  test('the reference case prints every published figure', async ({ page }) => {
    await calc(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$198,290.40');
    await expect(startAmount(page)).toHaveText('$20,000.00');
    await expect(contributions(page)).toHaveText('$120,000.00');
    await expect(interest(page)).toHaveText('$58,290.40');
    await expect(live(page)).toHaveText('End balance: 198290 dollars and 40 cents.');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the ring splits the end balance 10% / 61% / 29%', async ({ page }) => {
    await calc(page);
    await expect(donut(page)).toBeVisible();
    const svg = page.locator('.inv-donut__svg');
    await expect(svg).toHaveCount(1);
    await expect(svg).toHaveAttribute('role', 'img');
    expect(await svg.getAttribute('aria-label')).toContain('$198,290.40');

    for (const key of ['start', 'contributions', 'interest']) {
      await expect(page.locator(`.inv-donut__arc--${key}`)).toHaveCount(1);
    }
    await expect(page.locator('[data-inv-share-start]')).toHaveText('10%');
    await expect(page.locator('[data-inv-share-contributions]')).toHaveText('61%');
    await expect(page.locator('[data-inv-share-interest]')).toHaveText('29%');
  });

  test('the accumulation chart stacks one column per year', async ({ page }) => {
    await calc(page);
    await expect(chart(page)).toBeVisible();
    await expect(page.locator('.inv-chart__svg')).toHaveCount(1);
    // Ten years, each split three ways.
    await expect(page.locator('.inv-chart__seg--initial')).toHaveCount(10);
    await expect(page.locator('.inv-chart__seg--contrib')).toHaveCount(10);
    await expect(page.locator('.inv-chart__seg--interest')).toHaveCount(10);
  });

  /* ---- the schedule ---- */

  test('the annual schedule reproduces the published rows to the cent', async ({ page }) => {
    await calc(page);
    await expect(yearlyRows(page)).toHaveCount(10);

    const cells = (row: number) => yearlyRows(page).nth(row).locator('td');
    await expect(yearlyRows(page).nth(0).locator('th')).toHaveText('1');
    // Year one's deposit folds in the starting amount, as the reference shows it.
    await expect(cells(0).nth(0)).toHaveText('$32,000.00');
    await expect(cells(0).nth(1)).toHaveText('$1,526.53');
    await expect(cells(0).nth(2)).toHaveText('$33,526.53');

    await expect(cells(1).nth(0)).toHaveText('$12,000.00');
    await expect(cells(1).nth(1)).toHaveText('$2,338.12');
    await expect(cells(1).nth(2)).toHaveText('$47,864.65');

    await expect(cells(5).nth(1)).toHaveText('$6,101.55');
    await expect(cells(5).nth(2)).toHaveText('$114,351.84');

    // The last year closes on the end balance.
    await expect(cells(9).nth(2)).toHaveText('$198,290.40');
  });

  test('Annual and Monthly are two views of one projection, not a recalculation', async ({ page }) => {
    await calc(page);
    const schedule = page.locator('[data-inv-schedule]');
    await expect(schedule).toHaveAttribute('data-inv-view', 'yearly');
    await expect(page.locator('[data-inv-rows-monthly]')).toBeHidden();

    await page.locator('[data-inv-view-radio][value="monthly"]').check();
    await expect(schedule).toHaveAttribute('data-inv-view', 'monthly');
    await expect(page.locator('[data-inv-rows-yearly]')).toBeHidden();
    // 120 months plus an "End of year" divider after each of the ten years.
    await expect(monthlyRows(page)).toHaveCount(130);
    // The headline is untouched — switching views computes nothing.
    await expect(primary(page)).toHaveText('$198,290.40');
  });

  test('the schedule header follows the view', async ({ page }) => {
    await calc(page);
    await expect(page.locator('[data-inv-when-view="yearly"]').first()).toBeVisible();
    await page.locator('[data-inv-view-radio][value="monthly"]').check();
    await expect(page.locator('[data-inv-when-view="monthly"]').first()).toBeVisible();
    await expect(page.locator('[data-inv-when-view="yearly"]').first()).toBeHidden();
  });

  /* ---- the structural choices ---- */

  test('contributing at the beginning of the month ends higher', async ({ page }) => {
    await calc(page);
    await page.locator('[name="contributeAt"][value="beginning"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('$199,081.24');
    // The same money went in — only the growth changed.
    await expect(contributions(page)).toHaveText('$120,000.00');
  });

  test('contributing yearly instead of monthly ends lower on the same money', async ({ page }) => {
    await calc(page, { contribution: '12000' });
    await page.locator('[name="contributeEvery"][value="year"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('$193,986.49');
    await expect(contributions(page)).toHaveText('$120,000.00');
  });

  test('compounding more often ends higher', async ({ page }) => {
    await calc(page);
    await page.selectOption('[name="compound"]', 'monthly');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('$200,267.28');
  });

  /* ---- validation ---- */

  test('field validation: a starting amount, a term of 1–100 years, a return rate', async ({ page }) => {
    await calc(page, { start: '-1' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="startingAmount"]')).toHaveText(
      'Enter a starting amount of zero or more.',
    );

    await calc(page, { years: '101' });
    await expect(page.locator('[data-error-for="years"]')).toHaveText(
      'Enter an investment length from 1 to 100 years.',
    );

    await calc(page, { rate: '' });
    await expect(page.locator('[data-error-for="annualReturnPct"]')).toHaveText('Enter a return rate.');
  });

  test('investing nothing at all is rejected', async ({ page }) => {
    await calc(page, { start: '0', contribution: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="startingAmount"]')).toHaveText(
      'Enter a starting amount or a contribution — there is nothing to invest otherwise.',
    );
  });

  test('a contribution is optional — a lump sum left alone is a real plan', async ({ page }) => {
    await calc(page, { contribution: '' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(contributions(page)).toHaveText('$0.00');
    // $20,000 at 6% compounded annually for ten years.
    await expect(primary(page)).toHaveText('$35,816.95');
  });

  test('a negative return is a real scenario, not an error', async ({ page }) => {
    await calc(page, { rate: '-5', contribution: '' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    // A losing projection has no honest part-to-whole split, so the ring stands down.
    await expect(donut(page)).toBeHidden();
    await expect(chart(page)).toBeHidden();
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('an empty explicit submission focuses the starting amount', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    const start = page.locator('[name="startingAmount"]');
    await expect(start).toBeFocused();
    await expect(start).toHaveAttribute('aria-invalid', 'true');
  });

  /* ---- live update / reset ---- */

  test('a valid live update recomputes without moving focus', async ({ page }) => {
    await calc(page);
    await page.fill('[name="years"]', '20');
    await page.waitForTimeout(DEBOUNCE);
    await expect(yearlyRows(page)).toHaveCount(20);
    await expect(page.locator('[name="years"]')).toBeFocused();
  });

  test('clear empties the fields and restores every default', async ({ page }) => {
    await calc(page);
    await page.selectOption('[name="compound"]', 'daily');
    await page.locator('[name="contributeAt"][value="beginning"]').check();
    await page.locator('[data-inv-view-radio][value="monthly"]').check();

    await page.click('[data-reset]');
    for (const name of ['startingAmount', 'years', 'annualReturnPct', 'contribution']) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    }
    await expect(page.locator('[name="compound"]')).toHaveValue('annually');
    await expect(page.locator('[name="contributeAt"][value="end"]')).toBeChecked();
    await expect(page.locator('[data-inv-schedule]')).toHaveAttribute('data-inv-view', 'yearly');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  /* ---- presentation ---- */

  test('keyboard submission works from a field', async ({ page }) => {
    await page.fill('[name="startingAmount"]', REF.start);
    await page.fill('[name="years"]', REF.years);
    await page.fill('[name="annualReturnPct"]', REF.rate);
    await page.fill('[name="contribution"]', REF.contribution);
    await page.locator('[name="contribution"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$198,290.40');
  });

  test('desktop shows the inputs, the action and the end balance at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[name="startingAmount"]')).toBeInViewport();
    await expect(submit(page)).toBeInViewport();
    await calc(page);
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally; the schedule scrolls in its own box', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const scrolls = await page
      .locator('.inv-table-wrap')
      .evaluate((el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflow === 'auto');
    expect(scrolls).toBe(true);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc(page);
    await expect(primary(page)).toBeVisible();
    await expect(donut(page)).toBeVisible();
    await expect(chart(page)).toBeVisible();
  });

  test('the generated embed mounts the same island', async ({ page }) => {
    await page.goto('/embed/finance/investment-calculator', { waitUntil: 'domcontentloaded' });
    await calc(page);
    await expect(page.locator('#inv-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('$198,290.40');
    await expect(page.locator('.inv-donut__svg')).toHaveCount(1);
    await expect(yearlyRows(page)).toHaveCount(10);
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});
