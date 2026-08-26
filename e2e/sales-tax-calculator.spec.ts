import { test, expect, type Page } from '@playwright/test';

/**
 * Sales tax calculator — R8A1 standard-form wave (calculator #13; product family
 * MULTI-MODE, runtime unchanged). Two modes (add / remove) are a structural radio the
 * runtime recomputes on; the island syncs the amount + action labels and blanks the
 * mode-owned result on a switch. Covers the doctrine end-to-end plus the mode control,
 * zero amount/rate validity, the mode-specific dominant hierarchy, and the guide embed.
 */
const ROUTE = '/finance/sales-tax-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#tax-result');
const primary = (page: Page) => page.locator('#tax-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#tax-result [data-result-summary-label]');
const interpretation = (page: Page) => page.locator('#tax-result [data-tax-interpretation]');
const sec1Label = (page: Page) => page.locator('#tax-result [data-tax-sec1-label]');
const sec1 = (page: Page) => page.locator('#tax-result [data-tax-sec1]');
const sec2Label = (page: Page) => page.locator('#tax-result [data-tax-sec2-label]');
const sec2 = (page: Page) => page.locator('#tax-result [data-tax-sec2]');
const liveRegion = (page: Page) => page.locator('#tax-live');
const submit = (page: Page) => page.locator('[data-tax-submit]');
const amountLabel = (page: Page) => page.locator('[data-tax-amount-label]');
const region = (page: Page, when: string) => page.locator(`#tax-result [data-result-when~="${when}"]`);

const calcAdd = async (page: Page, amount = '100', rate = '8.25') => {
  await page.fill('[name="amount"]', amount);
  await page.fill('[name="rate"]', rate);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: Add mode, blank fields, result empty, Add Sales Tax action, no live note', async ({ page }) => {
  await expect(page.locator('[name="mode"][value="add"]')).toBeChecked();
  await expect(page.locator('[name="amount"]')).toHaveValue('');
  await expect(page.locator('[name="rate"]')).toHaveValue('');
  await expect(amountLabel(page)).toHaveText('Amount before tax');
  await expect(submit(page)).toHaveText('Add Sales Tax');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  // The empty placeholder is replaced by the labelled example on load.
  await expect(region(page, 'empty')).toBeHidden();
  await expect(region(page, 'valid')).toBeVisible();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(primary(page)).not.toHaveText('—');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="amount"]', '100');
  await page.fill('[name="rate"]', '8.25');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Add mode ----------------------------------------------------------- */

test('valid Add result: total dominant, tax + pre-tax subordinate', async ({ page }) => {
  await calcAdd(page, '100', '8.25');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Total including sales tax');
  await expect(primary(page)).toHaveText('$108.25');
  await expect(interpretation(page)).toContainText('The total after adding 8.25% sales tax is $108.25');
  await expect(sec1Label(page)).toHaveText('Sales tax');
  await expect(sec1(page)).toHaveText('$8.25');
  await expect(sec2Label(page)).toHaveText('Amount before tax');
  await expect(sec2(page)).toHaveText('$100.00');
  // The dominant total is visually larger than the subordinate rows.
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await sec1(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
});

test('an entered amount of 0 is valid and shows $0.00', async ({ page }) => {
  await calcAdd(page, '0', '8.25');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$0.00');
});

test('an entered rate of 0 is valid (tax-free)', async ({ page }) => {
  await calcAdd(page, '100', '0');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$100.00'); // gross == net
  await expect(sec1(page)).toHaveText('$0.00'); // no tax
});

/* ---- Mode switching ----------------------------------------------------- */

test('switching mode before the first calc updates the labels, does not calculate, preserves entries', async ({ page }) => {
  await page.fill('[name="amount"]', '100');
  await page.fill('[name="rate"]', '8.25');
  await page.check('[name="mode"][value="remove"]');
  await expect(amountLabel(page)).toHaveText('Total amount including tax');
  await expect(submit(page)).toHaveText('Remove Sales Tax');
  await expect(page.locator('[name="amount"]')).toHaveValue('100'); // preserved
  await expect(page.locator('[name="rate"]')).toHaveValue('8.25');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty'); // no calc
  await expect(liveRegion(page)).toHaveText('');
});

test('valid Remove result: pre-tax dominant, included tax + total subordinate', async ({ page }) => {
  await page.check('[name="mode"][value="remove"]');
  await page.fill('[name="amount"]', '108.25');
  await page.fill('[name="rate"]', '8.25');
  await submit(page).click();
  await expect(summaryLabel(page)).toHaveText('Amount before sales tax');
  await expect(primary(page)).toHaveText('$100.00');
  await expect(interpretation(page)).toContainText('The amount before tax in a total of $108.25 is $100.00');
  await expect(sec1Label(page)).toHaveText('Included sales tax');
  await expect(sec1(page)).toHaveText('$8.25');
  await expect(sec2Label(page)).toHaveText('Total including tax');
  await expect(sec2(page)).toHaveText('$108.25');
});

test('switching mode after a result recalculates to the new mode with no stale value, keeps focus, announces once', async ({ page }) => {
  await calcAdd(page, '108.25', '8.25'); // Add: total $117.18-ish dominant
  await expect(summaryLabel(page)).toHaveText('Total including sales tax');
  await page.check('[name="mode"][value="remove"]');
  await page.waitForTimeout(DEBOUNCE);
  // The result now consistently reflects Remove mode — never the old Add label/value pair.
  await expect(summaryLabel(page)).toHaveText('Amount before sales tax');
  await expect(primary(page)).toHaveText('$100.00'); // net of 108.25 @ 8.25%
  await expect(page.locator('[name="mode"][value="remove"]')).toBeFocused();
  await expect(liveRegion(page)).toHaveText('Amount before sales tax is 100 dollars.');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty explicit submission focuses the amount field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const amount = page.locator('[name="amount"]');
  await expect(amount).toBeFocused();
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="amount"]')).toHaveText('Enter an amount.');
});

test('negative amount and negative rate are rejected', async ({ page }) => {
  await calcAdd(page, '-5', '8.25');
  await expect(page.locator('[data-error-for="amount"]')).toHaveText('Enter an amount of zero or more.');
  await calcAdd(page, '100', '-1');
  await expect(page.locator('[data-error-for="rate"]')).toHaveText('Enter a sales-tax rate of zero or more.');
});

test('keyboard submission works from a field', async ({ page }) => {
  await page.fill('[name="amount"]', '100');
  await page.locator('[name="rate"]').fill('8.25');
  await page.locator('[name="rate"]').press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$108.25');
});

/* ---- Reset -------------------------------------------------------------- */

test('reset restores Add mode + labels, clears fields, returns to empty', async ({ page }) => {
  await page.check('[name="mode"][value="remove"]');
  await page.fill('[name="amount"]', '108.25');
  await page.fill('[name="rate"]', '8.25');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await page.click('[data-reset]');
  await expect(page.locator('[name="mode"][value="add"]')).toBeChecked();
  await expect(amountLabel(page)).toHaveText('Amount before tax');
  await expect(submit(page)).toHaveText('Add Sales Tax');
  await expect(page.locator('[name="amount"]')).toHaveValue('');
  await expect(page.locator('[name="rate"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Announcement + integrity ------------------------------------------- */

test('announces the dominant result concisely, never all rows', async ({ page }) => {
  await calcAdd(page, '100', '8.25');
  await expect(liveRegion(page)).toHaveText('Total including sales tax is 108 dollars and 25 cents.');
  await expect(liveRegion(page)).not.toContainText(/Sales tax is|Amount before tax is 100 dollars/);
});

test('renders no NaN / Infinity / undefined', async ({ page }) => {
  await calcAdd(page, '100', '8.25');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Responsive / theme / embed / monetization ------------------------- */

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcAdd(page, '100', '8.25');
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcAdd(page, '100', '8.25');
  await expect(primary(page)).toHaveText('$108.25');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcAdd(page, '100', '8.25');
  await expect(primary(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/finance/sales-tax-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="amount"]', '100');
  await page.fill('[name="rate"]', '8.25');
  await page.locator('[data-tax-submit]').click();
  await expect(page.locator('#tax-result [data-result-value]')).toHaveText('$108.25');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});

/* ---- Guide embed (how-to-calculate-sales-tax) --------------------------- */

test('the guide that embeds the island renders the migrated task-first tool, both modes', async ({ page }) => {
  await page.goto('/guides/how-to-calculate-sales-tax', { waitUntil: 'domcontentloaded' });
  // Exactly one H1 (the guide's); the embedded island injects no page H1 or breadcrumb.
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('[data-tax] h1')).toHaveCount(0);
  await expect(page.locator('[data-tax] nav')).toHaveCount(0);
  // Guide prose remains present.
  await expect(page.getByText('Backing tax out of a total')).toBeVisible();
  // Empty (not prefilled) initial state, then Add works…
  await expect(page.locator('#tax-result')).toHaveAttribute('data-result-state', 'example');
  await page.fill('[name="amount"]', '100');
  await page.fill('[name="rate"]', '8.25');
  await page.locator('[data-tax-submit]').click();
  await expect(page.locator('#tax-result [data-result-value]')).toHaveText('$108.25');
  // …and Remove works.
  await page.check('[name="mode"][value="remove"]');
  await page.fill('[name="amount"]', '108.25');
  await page.locator('[data-tax-submit]').click();
  await expect(page.locator('#tax-result [data-result-value]')).toHaveText('$100.00');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(await page.content()).not.toContain('data-mon-');
});
