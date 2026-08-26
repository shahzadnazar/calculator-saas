import { test, expect, type Page } from '@playwright/test';

/**
 * Investment calculator — R11D1 task-first migration (finance complex-form, summary-only). Wraps the
 * UNCHANGED calculateInvestment / shared compound-interest engine; the complete-result guard lives in
 * the binding's resultValue (NaN sentinel — NO isUsableResult). Task-first: empty fields, "Calculate
 * Investment Growth" for the first result, live-after-first. NOMINAL projection; starting + monthly
 * contribution are optional individually but COLLECTIVELY must fund the projection (a form-level
 * funding error). Investment growth may be negative (shown signed; the proportion bar is hidden). The
 * latent yearly series is not rendered.
 */
const ROUTE = '/finance/investment-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#inv-result');
const primary = (page: Page) => page.locator('#inv-result [data-result-value]');
const startVal = (page: Page) => page.locator('[data-inv-start]');
const contribVal = (page: Page) => page.locator('[data-inv-contrib]');
const earnVal = (page: Page) => page.locator('[data-inv-earn]');
const interpretation = (page: Page) => page.locator('[data-inv-interpretation]');
const bar = (page: Page) => page.locator('[data-inv-bar]');
const fundingError = (page: Page) => page.locator('[data-inv-funding-error]');
const live = (page: Page) => page.locator('#inv-live');
const submit = (page: Page) => page.locator('[data-inv-submit]');
const region = (page: Page, when: string) => page.locator(`#inv-result [data-result-when~="${when}"]`);

const calc = async (page: Page, start: string, monthly: string, ret: string, years: string) => {
  await page.fill('[name="startingAmount"]', start);
  await page.fill('[name="monthlyContribution"]', monthly);
  await page.fill('[name="annualReturnPct"]', ret);
  await page.fill('[name="years"]', years);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: blank fields, empty result, Calculate Investment Growth, no auto-calc', async ({ page }) => {
  for (const n of ['startingAmount', 'monthlyContribution', 'annualReturnPct', 'years']) {
    await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
  }
  await expect(submit(page)).toHaveText('Calculate Investment Growth');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  // The example fills this calculator's OWN valid region, so it is visible on load.
  await expect(region(page, 'valid')).toBeVisible();
  await expect(live(page)).toHaveText('');
});

test('the projection period field carries min/max/step 1/100/1', async ({ page }) => {
  const y = page.locator('[name="years"]');
  await expect(y).toHaveAttribute('min', '1');
  await expect(y).toHaveAttribute('max', '100');
  await expect(y).toHaveAttribute('step', '1');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="startingAmount"]', '10000');
  await page.fill('[name="annualReturnPct"]', '7');
  await page.fill('[name="years"]', '25');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Results ------------------------------------------------------------ */

test('ordinary mixed projection: dominant value + subordinate breakdown + announcement', async ({ page }) => {
  await calc(page, '10000', '300', '7', '25');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$300,275.69');
  await expect(startVal(page)).toHaveText('$10,000');
  await expect(contribVal(page)).toHaveText('$90,000');
  await expect(earnVal(page)).toHaveText('$200,276');
  await expect(interpretation(page)).toContainText('assumed annual return of 7% for 25 years');
  await expect(live(page)).toHaveText('The projected investment value is 300276 dollars.');
  // dominant value visually larger than the breakdown figures
  const p = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const c = await startVal(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(p).toBeGreaterThan(c * 1.5);
});

test('a starting amount alone projects growth with zero contributions', async ({ page }) => {
  await calc(page, '10000', '', '7', '10');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$20,096.61');
  await expect(contribVal(page)).toHaveText('$0');
});

test('a monthly contribution alone projects with zero starting amount', async ({ page }) => {
  await calc(page, '', '100', '7', '10');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$17,308.48');
  await expect(startVal(page)).toHaveText('$0');
  await expect(contribVal(page)).toHaveText('$12,000');
});

test('a zero return equals starting + contributions (no growth)', async ({ page }) => {
  await calc(page, '10000', '300', '0', '10');
  await expect(primary(page)).toHaveText('$46,000.00');
  await expect(earnVal(page)).toHaveText('$0');
  await expect(interpretation(page)).toContainText('At a 0% return');
});

test('a negative return is valid: growth is signed negative and the proportion bar is hidden', async ({ page }) => {
  await calc(page, '10000', '300', '-5', '10');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid'); // NOT an error
  await expect(primary(page)).toHaveText('$34,434.36');
  await expect(earnVal(page)).toHaveText('−$11,566'); // U+2212 signed
  await expect(bar(page)).toBeHidden(); // no invalid CSS width for negative growth
  await expect(interpretation(page)).toContainText('projected to lose value relative to');
});

test('positive growth shows the proportion bar with non-negative segment widths', async ({ page }) => {
  await calc(page, '10000', '300', '7', '25');
  await expect(bar(page)).toBeVisible();
  const w = await page.locator('[data-inv-seg="earn"]').evaluate((el) => parseFloat((el as HTMLElement).style.width));
  expect(w).toBeGreaterThan(0);
});

test('no NaN / Infinity / undefined for an ordinary result', async ({ page }) => {
  await calc(page, '10000', '300', '7', '25');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

test('the result states USD and the nominal-projection clarification', async ({ page }) => {
  await calc(page, '10000', '300', '7', '25');
  await expect(shell(page)).toContainText('US dollars (USD)');
  await expect(shell(page)).toContainText('does not adjust for inflation, taxes or investment fees');
});

/* ---- Funding validation (collective) ------------------------------------ */

test('collective zero funding is a form-level error: focuses Starting, reveals the group message', async ({ page }) => {
  await page.fill('[name="startingAmount"]', '0');
  await page.fill('[name="monthlyContribution"]', '0');
  await page.fill('[name="annualReturnPct"]', '7');
  await page.fill('[name="years"]', '10');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[name="startingAmount"]')).toBeFocused();
  await expect(fundingError(page)).toBeVisible();
  await expect(fundingError(page)).toHaveText('Enter a starting investment or a monthly contribution greater than zero.');
});

test('an empty explicit submission focuses Starting investment', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[name="startingAmount"]')).toBeFocused();
});

test('a negative amount is a field error, not the funding error', async ({ page }) => {
  await calc(page, '-5', '300', '7', '10');
  await expect(page.locator('[data-error-for="startingAmount"]')).toHaveText('Enter a starting investment of zero or more.');
});

/* ---- Return + duration validation --------------------------------------- */

test('a return of -100 or below is invalid; a negative return above -100 is valid', async ({ page }) => {
  await calc(page, '10000', '0', '-100', '10');
  await expect(page.locator('[data-error-for="annualReturnPct"]')).toHaveText('Enter an annual return greater than -100%.');
  await calc(page, '10000', '0', '-20', '10');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

test('a fractional / zero / above-100 year is rejected; 100 is the valid boundary', async ({ page }) => {
  const msg = 'Enter a whole projection period from 1 to 100 years.';
  await calc(page, '10000', '0', '7', '2.5');
  await expect(page.locator('[data-error-for="years"]')).toHaveText(msg);
  await calc(page, '10000', '0', '7', '101');
  await expect(page.locator('[data-error-for="years"]')).toHaveText(msg);
  await calc(page, '10000', '0', '7', '100');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

/* ---- Live-after-first + reset + keyboard -------------------------------- */

test('after the first result, editing updates live and keeps focus on the edited field', async ({ page }) => {
  await calc(page, '10000', '300', '7', '25');
  await expect(primary(page)).toHaveText('$300,275.69');
  await page.fill('[name="years"]', '10');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).not.toHaveText('$300,275.69');
  await expect(page.locator('[name="years"]')).toBeFocused();
});

test('reset clears fields, result, announcement and the funding error', async ({ page }) => {
  await calc(page, '0', '0', '7', '10'); // trigger the funding error first
  await expect(fundingError(page)).toBeVisible();
  await page.click('[data-reset]');
  await expect(page.locator('[name="startingAmount"]')).toHaveValue('');
  await expect(page.locator('[name="years"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(fundingError(page)).toBeHidden();
  await expect(live(page)).toHaveText('');
});

test('keyboard submission works from a field', async ({ page }) => {
  await page.fill('[name="startingAmount"]', '10000');
  await page.fill('[name="monthlyContribution"]', '0');
  await page.fill('[name="annualReturnPct"]', '0');
  await page.locator('[name="years"]').fill('10');
  await page.locator('[name="years"]').press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$10,000.00');
});

/* ---- Responsive / theme / embed / guide / monetization ------------------ */

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calc(page, '10000', '300', '7', '25');
  await expect(primary(page)).toBeInViewport();
});

test('mobile does not overflow horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calc(page, '10000', '300', '7', '25');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calc(page, '10000', '300', '7', '25');
  await expect(primary(page)).toBeVisible();
});

test('the generated embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/finance/investment-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="startingAmount"]', '10000');
  await page.fill('[name="monthlyContribution"]', '0');
  await page.fill('[name="annualReturnPct"]', '0');
  await page.fill('[name="years"]', '10');
  await page.locator('[data-inv-submit]').click();
  await expect(page.locator('#inv-result [data-result-value]')).toHaveText('$10,000.00');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});

/* ---- Guide-embedded regression ------------------------------------------ */

test.describe('guide embed (investing-for-beginners)', () => {
  const GUIDE = '/guides/investing-for-beginners';

  test('the guide embeds one task-first calculator, empty with no stale result', async ({ page }) => {
    await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-investment]')).toHaveCount(1);
    await expect(page.locator('[name="startingAmount"]')).toHaveValue('');
    await expect(page.locator('#inv-result')).toHaveAttribute('data-result-state', 'example');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1); // no duplicated H1
  });

  test('the guide-embedded calculator computes a valid result', async ({ page }) => {
    await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
    await page.fill('[name="startingAmount"]', '10000');
    await page.fill('[name="monthlyContribution"]', '0');
    await page.fill('[name="annualReturnPct"]', '0');
    await page.fill('[name="years"]', '10');
    await page.locator('[data-inv-submit]').click();
    await expect(page.locator('#inv-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#inv-result [data-result-value]')).toHaveText('$10,000.00');
  });
});
