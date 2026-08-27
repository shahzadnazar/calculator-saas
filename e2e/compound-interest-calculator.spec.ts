import { test, expect, type Page } from '@playwright/test';

/**
 * Compound interest — converting a rate between compounding periods.
 *
 * Task-first: the rate starts EMPTY, the two periods are structural defaults (monthly in,
 * annually out, as the reference has them), the visitor presses Calculate for the first
 * result, live-after-first thereafter.
 *
 * Pinned to the published reference: 6% compound monthly (APR) is equivalent to 6.16778%
 * compound annually (APY). Beneath it, the ladder of what that rate earns at every one of
 * the nine periods — bars encoding the gain OVER annual compounding, which has a true zero,
 * with every exact rate printed beside its bar.
 *
 * This is deliberately not a growth projection; the Interest calculator owns that, and the
 * reference draws the same line.
 */
const ROUTE = '/finance/compound-interest-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#ci-result');
const primary = (page: Page) => page.locator('#ci-result [data-result-value]');
const summary = (page: Page) => page.locator('[data-ci-summary]');
const effective = (page: Page) => page.locator('[data-ci-effective]');
const output = (page: Page) => page.locator('[data-ci-output]');
const chart = (page: Page) => page.locator('[data-ci-chart-figure]');
const ladderRows = (page: Page) => page.locator('.ci-rate tbody tr');
const live = (page: Page) => page.locator('#ci-live');
const submit = (page: Page) => page.locator('[data-ci-submit]');
const region = (page: Page, when: string) => page.locator(`#ci-result [data-result-when~="${when}"]`);

const calc = async (page: Page, rate = '6', from = 'monthly', to = 'annually') => {
  await page.fill('[name="inputRate"]', rate);
  await page.selectOption('[name="inputCompound"]', from);
  await page.selectOption('[name="outputCompound"]', to);
  await submit(page).click();
};

test.describe('compound interest: the rate converter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('loads empty, with the reference’s own default periods', async ({ page }) => {
    await expect(page.locator('[name="inputRate"]')).toHaveValue('');
    await expect(page.locator('[name="inputCompound"]')).toHaveValue('monthly');
    await expect(page.locator('[name="outputCompound"]')).toHaveValue('annually');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(region(page, 'empty')).toBeHidden();
    await expect(live(page)).toHaveText('');
  });

  test('offers all nine compounding periods, labelled as their paperwork names them', async ({ page }) => {
    for (const name of ['inputCompound', 'outputCompound']) {
      const options = page.locator(`[name="${name}"] option`);
      await expect(options).toHaveCount(9);
      await expect(options.first()).toHaveText('Annually (APY)');
      await expect(options.nth(3)).toHaveText('Monthly (APR)');
      await expect(options.last()).toHaveText('Continuously');
    }
  });

  test('does not calculate before the first submission', async ({ page }) => {
    await page.fill('[name="inputRate"]', '6');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- the reference result ---- */

  test('the reference case prints the published figure and sentence', async ({ page }) => {
    await calc(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('6.16778%');
    await expect(summary(page)).toHaveText(
      '6% compound monthly (APR) is equivalent to 6.16778% compound annually (APY).',
    );
    await expect(effective(page)).toHaveText('6.16778%');
    await expect(live(page)).toHaveText(
      '6 percent compound monthly (APR) is equivalent to 6.16778 percent compound annually (APY).',
    );
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the answer is mirrored inline beside the inputs, as the reference shows it', async ({ page }) => {
    await calc(page);
    await expect(output(page)).toHaveText('6.16778%');
  });

  test('converting the other way gives a lower nominal rate', async ({ page }) => {
    await calc(page, '6', 'annually', 'monthly');
    await expect(primary(page)).toHaveText('5.84106%');
    await expect(summary(page)).toContainText('is equivalent to 5.84106% compound monthly (APR)');
  });

  test('a card’s APR converts to the annual cost nobody advertises', async ({ page }) => {
    await calc(page, '24.99', 'monthly', 'annually');
    await expect(primary(page)).toHaveText('28.06061%');
  });

  test('converting to the same period explains rather than pretending to convert', async ({ page }) => {
    await calc(page, '6', 'monthly', 'monthly');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('6%');
    await expect(summary(page)).toContainText('already what you asked for');
  });

  test('a 0% rate is 0% at every period', async ({ page }) => {
    await calc(page, '0', 'daily', 'annually');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('0%');
  });

  /* ---- the ladder ---- */

  test('the ladder lists all nine periods with their exact rates', async ({ page }) => {
    await calc(page);
    await expect(chart(page)).toBeVisible();
    await expect(ladderRows(page)).toHaveCount(9);

    await expect(ladderRows(page).first().locator('th')).toHaveText('annually');
    await expect(ladderRows(page).first().locator('.ci-rate__value')).toHaveText('6%');
    await expect(ladderRows(page).last().locator('th')).toHaveText('continuously');
    await expect(ladderRows(page).last().locator('.ci-rate__value')).toHaveText('6.184%');
    await expect(ladderRows(page).nth(3).locator('.ci-rate__value')).toHaveText('6.168%');
  });

  test('the bars encode the gain over annual compounding, from a true zero', async ({ page }) => {
    await calc(page);
    const widths = await page
      .locator('.ci-rate__bar')
      .evaluateAll((els) => els.map((el) => parseFloat((el as HTMLElement).style.width)));
    expect(widths).toHaveLength(9);
    // Annual compounding is the baseline, so its bar is empty rather than full.
    expect(widths[0]).toBe(0);
    // Continuous is the ceiling.
    expect(widths[8]).toBeCloseTo(100, 5);
    // Never falling — more frequent compounding can never earn less.
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1]);
    // Most of the gain is already won by monthly.
    expect(widths[3]).toBeGreaterThan(90);
  });

  test('the two periods being converted are the ones emphasised', async ({ page }) => {
    await calc(page, '6', 'monthly', 'annually');
    const highlighted = page.locator('.ci-rate__row[data-highlight]');
    await expect(highlighted).toHaveCount(2);
    await expect(highlighted.first().locator('th')).toHaveText('annually');
    await expect(highlighted.last().locator('th')).toHaveText('monthly');

    // The emphasis follows the selection, not a fixed position.
    await page.selectOption('[name="outputCompound"]', 'daily');
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('.ci-rate__row[data-highlight]').last().locator('th')).toHaveText('daily');
  });

  test('the ladder is a real table, so the numbers are readable without the bars', async ({ page }) => {
    await calc(page);
    await expect(page.locator('.ci-rate caption')).toHaveCount(1);
    await expect(page.locator('.ci-rate thead th')).toHaveText([
      'Compounding',
      'Extra over annual',
      'Effective annual rate',
    ]);
    // Every row carries its own label and value, never colour alone.
    await expect(page.locator('.ci-rate tbody th')).toHaveCount(9);
    await expect(page.locator('.ci-rate__value')).toHaveCount(9);
  });

  /* ---- validation ---- */

  test('the rate is required, non-negative and bounded', async ({ page }) => {
    await calc(page, '');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="inputRate"]')).toHaveText('Enter an interest rate.');

    await calc(page, '-1');
    await expect(page.locator('[data-error-for="inputRate"]')).toHaveText(
      'Enter an interest rate of zero or more.',
    );

    await calc(page, '201');
    await expect(page.locator('[data-error-for="inputRate"]')).toHaveText(
      'Enter an interest rate of 200% or less.',
    );
  });

  test('an empty explicit submission focuses the rate and associates the error', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    const rate = page.locator('[name="inputRate"]');
    await expect(rate).toBeFocused();
    await expect(rate).toHaveAttribute('aria-invalid', 'true');
    // The inline readout must not keep showing a rate the result has dropped.
    await expect(output(page)).toHaveText('—');
  });

  /* ---- live update / reset ---- */

  test('changing either period recalculates live without moving focus', async ({ page }) => {
    await calc(page);
    await page.fill('[name="inputRate"]', '12');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('12.6825%');
    await expect(page.locator('[name="inputRate"]')).toBeFocused();
  });

  test('clear empties the rate and restores both default periods', async ({ page }) => {
    await calc(page, '9', 'daily', 'quarterly');
    await page.click('[data-reset]');
    await expect(page.locator('[name="inputRate"]')).toHaveValue('');
    await expect(page.locator('[name="inputCompound"]')).toHaveValue('monthly');
    await expect(page.locator('[name="outputCompound"]')).toHaveValue('annually');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
    await expect(output(page)).toHaveText('—');
  });

  /* ---- presentation ---- */

  test('keyboard submission works from the rate field', async ({ page }) => {
    await page.fill('[name="inputRate"]', '6');
    await page.locator('[name="inputRate"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('6.16778%');
  });

  test('desktop shows the inputs, the action and the answer at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[name="inputRate"]')).toBeInViewport();
    await expect(submit(page)).toBeInViewport();
    await calc(page);
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme, with the emphasis still distinguishable', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc(page);
    await expect(primary(page)).toBeVisible();
    await expect(chart(page)).toBeVisible();
    const [accent, context] = await Promise.all([
      page.locator('.ci-rate__row[data-highlight] .ci-rate__bar').first().evaluate((el) => getComputedStyle(el).backgroundColor),
      page.locator('.ci-rate__row:not([data-highlight]) .ci-rate__bar').first().evaluate((el) => getComputedStyle(el).backgroundColor),
    ]);
    expect(accent).not.toBe(context);
  });

  test('the generated embed mounts the same island', async ({ page }) => {
    await page.goto('/embed/finance/compound-interest-calculator', { waitUntil: 'domcontentloaded' });
    await calc(page);
    await expect(page.locator('#ci-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('6.16778%');
    await expect(ladderRows(page)).toHaveCount(9);
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});
