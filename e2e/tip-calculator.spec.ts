import { test, expect, type Page } from '@playwright/test';

/**
 * Tip calculator — R9B1 standard-form wave (calculator #18; product family FINANCE-SIMPLE,
 * runtime unchanged, no isUsableResult). Single mode with an accessible tip-percentage PRESET
 * group. Covers the task-first doctrine end-to-end plus the preset behaviour: accessible names,
 * aria-pressed state, field synchronisation, no-calc-before-first, recalc-after-first, single
 * pressed at a time, and focus retention on live preset updates. Task-first ORDER + first-viewport
 * are additionally asserted by e2e/task-first-layout.spec.ts.
 */
const ROUTE = '/finance/tip-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#tp-result');
const primary = (page: Page) => page.locator('#tp-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#tp-result [data-result-summary-label]');
const interpretation = (page: Page) => page.locator('#tp-result [data-tp-interpretation]');
const tipCell = (page: Page) => page.locator('#tp-result [data-tp-tip]');
const totalCell = (page: Page) => page.locator('#tp-result [data-tp-total]');
const tipPerson = (page: Page) => page.locator('#tp-result [data-tp-tipperson]');
const liveRegion = (page: Page) => page.locator('#tp-live');
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate Tip' });
const resetBtn = (page: Page) => page.getByRole('button', { name: 'Reset' });
const preset = (page: Page, p: number) => page.locator(`[data-tp-preset="${p}"]`);
const region = (page: Page, when: string) => page.locator(`#tp-result [data-result-when~="${when}"]`);

const calc = async (page: Page, bill = '50', tip = '20', people = '2') => {
  await page.fill('[name="bill"]', bill);
  await page.fill('[name="tipPct"]', tip);
  await page.fill('[name="people"]', people);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: bill+rate blank, people=1, no preset pressed, result empty, Calculate visible', async ({ page }) => {
  await expect(page.locator('[name="bill"]')).toHaveValue('');
  await expect(page.locator('[name="tipPct"]')).toHaveValue('');
  await expect(page.locator('[name="people"]')).toHaveValue('1');
  await expect(submit(page)).toBeVisible();
  await expect(resetBtn(page)).toBeVisible();
  for (const p of [10, 15, 18, 20, 25]) await expect(preset(page, p)).toHaveAttribute('aria-pressed', 'false');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
  await expect(primary(page)).toHaveText('—');
});

test('does not calculate before the first submission — typing or clicking a preset', async ({ page }) => {
  await page.fill('[name="bill"]', '50');
  await page.fill('[name="tipPct"]', '20');
  await preset(page, 18).click(); // sets the field but must not calculate
  await expect(page.locator('[name="tipPct"]')).toHaveValue('18');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Valid results + hierarchy ------------------------------------------ */

test('valid custom-rate result: total-per-person dominant, full breakdown, USD wording', async ({ page }) => {
  await calc(page, '50', '20', '2');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Total per person');
  await expect(primary(page)).toHaveText('$30.00');
  await expect(interpretation(page)).toHaveText('Split between 2 people, each person pays $30.00.');
  await expect(tipCell(page)).toHaveText('$10.00');
  await expect(totalCell(page)).toHaveText('$60.00');
  await expect(tipPerson(page)).toHaveText('$5.00');
  await expect(page.getByText('Bill amount in USD')).toBeVisible();
  await expect(page.getByText('Amounts are in US dollars (USD).')).toBeVisible();
  // Dominant value visually larger than breakdown rows.
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await tipCell(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
});

test('valid preset-rate result: clicking a preset supplies the tip rate', async ({ page }) => {
  await page.fill('[name="bill"]', '50');
  await preset(page, 20).click();
  await page.fill('[name="people"]', '2');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$30.00');
  await expect(preset(page, 20)).toHaveAttribute('aria-pressed', 'true');
});

test('a single diner sees the whole total per person', async ({ page }) => {
  await calc(page, '50', '18', '1');
  await expect(primary(page)).toHaveText('$59.00');
  await expect(interpretation(page)).toHaveText('The total including tip is $59.00.');
});

test('an entered bill of 0 is valid: all $0, explained', async ({ page }) => {
  await calc(page, '0', '20', '2');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$0.00');
  await expect(interpretation(page)).toContainText('$0 bill');
});

test('an entered tip of 0 is valid: no tip, bill split evenly', async ({ page }) => {
  await calc(page, '50', '0', '2');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$25.00');
  await expect(tipCell(page)).toHaveText('$0.00');
});

/* ---- Preset control ----------------------------------------------------- */

test('preset buttons expose accessible names and toggle a single pressed state', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Set tip to 18 percent' })).toBeVisible();
  await preset(page, 20).click();
  await expect(page.locator('[name="tipPct"]')).toHaveValue('20');
  await expect(preset(page, 20)).toHaveAttribute('aria-pressed', 'true');
  // Only one pressed at a time.
  await preset(page, 25).click();
  await expect(preset(page, 25)).toHaveAttribute('aria-pressed', 'true');
  await expect(preset(page, 20)).toHaveAttribute('aria-pressed', 'false');
});

test('typing a matching percentage presses the preset; a custom value clears all', async ({ page }) => {
  await page.fill('[name="tipPct"]', '18');
  await expect(preset(page, 18)).toHaveAttribute('aria-pressed', 'true');
  await page.fill('[name="tipPct"]', '17');
  for (const p of [10, 15, 18, 20, 25]) await expect(preset(page, p)).toHaveAttribute('aria-pressed', 'false');
  // Entered 0 clears all positive presets too.
  await page.fill('[name="tipPct"]', '0');
  for (const p of [10, 15, 18, 20, 25]) await expect(preset(page, p)).toHaveAttribute('aria-pressed', 'false');
});

test('a preset click after the first calc recalculates and keeps focus on the preset', async ({ page }) => {
  await calc(page, '50', '20', '2');
  await expect(primary(page)).toHaveText('$30.00');
  await preset(page, 25).click();
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[name="tipPct"]')).toHaveValue('25');
  await expect(primary(page)).toHaveText('$31.25'); // (50 × 1.25) / 2
  await expect(preset(page, 25)).toBeFocused();
  await expect(preset(page, 25)).toHaveAttribute('aria-pressed', 'true');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty explicit submission focuses the bill field and associates the error', async ({ page }) => {
  await page.fill('[name="people"]', ''); // clear the default so all are empty
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const bill = page.locator('[name="bill"]');
  await expect(bill).toBeFocused();
  await expect(bill).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="bill"]')).toHaveText('Enter a bill amount.');
});

test('fractional, zero and negative people are rejected as whole-number errors', async ({ page }) => {
  await calc(page, '50', '20', '2.5');
  await expect(page.locator('[data-error-for="people"]')).toHaveText('Enter a whole number of at least 1.');
  await calc(page, '50', '20', '0');
  await expect(page.locator('[data-error-for="people"]')).toHaveText('Enter a whole number of at least 1.');
});

test('negative bill and negative tip are rejected', async ({ page }) => {
  await calc(page, '-5', '20', '2');
  await expect(page.locator('[data-error-for="bill"]')).toHaveText('Enter a bill amount of zero or more.');
  await calc(page, '50', '-1', '2');
  await expect(page.locator('[data-error-for="tipPct"]')).toHaveText('Enter a tip percentage of zero or more.');
});

/* ---- Announcement + Reset + integrity ----------------------------------- */

test('announces the dominant result concisely, never the breakdown rows', async ({ page }) => {
  await calc(page, '50', '20', '2');
  await expect(liveRegion(page)).toHaveText('Each person pays 30 dollars.');
  await expect(liveRegion(page)).not.toContainText(/Tip amount|Total bill/);
});

test('reset clears fields, restores people=1, clears preset selection, returns to empty', async ({ page }) => {
  await calc(page, '50', '20', '2');
  await preset(page, 20).click();
  await expect(preset(page, 20)).toHaveAttribute('aria-pressed', 'true');
  await resetBtn(page).click();
  await expect(page.locator('[name="bill"]')).toHaveValue('');
  await expect(page.locator('[name="tipPct"]')).toHaveValue('');
  await expect(page.locator('[name="people"]')).toHaveValue('1');
  await expect(preset(page, 20)).toHaveAttribute('aria-pressed', 'false');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

test('keyboard submission works from a field', async ({ page }) => {
  await page.fill('[name="bill"]', '50');
  await page.fill('[name="tipPct"]', '20');
  await page.locator('[name="people"]').fill('2');
  await page.locator('[name="people"]').press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$30.00');
});

test('renders no NaN / Infinity / undefined', async ({ page }) => {
  await calc(page, '50', '20', '2');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Responsive / theme ------------------------------------------------- */

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calc(page, '50', '20', '2');
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calc(page, '50', '20', '2');
  await expect(primary(page)).toHaveText('$30.00');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calc(page, '50', '20', '2');
  await expect(primary(page)).toBeVisible();
});

/* ---- Embed + monetization ----------------------------------------------- */

test('the embed route mounts the same interactive island, presets included', async ({ page }) => {
  await page.goto('/embed/finance/tip-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="bill"]', '50');
  await page.locator('[data-tp-preset="20"]').click();
  await page.fill('[name="people"]', '2');
  await page.getByRole('button', { name: 'Calculate Tip' }).click();
  await expect(page.locator('#tp-result [data-result-value]')).toHaveText('$30.00');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
