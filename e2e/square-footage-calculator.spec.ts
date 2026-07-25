import { test, expect, type Page } from '@playwright/test';

/**
 * Square footage calculator — R10B1 standard-form wave (calculator #20; product family GEOMETRY,
 * runtime unchanged, no isUsableResult). Single mode with a CONVERTING native-select input unit.
 * Covers the task-first doctrine end-to-end plus dimension-preserving unit conversion (before/after
 * first calc, area preserved, focus retained), the conditional one-section + cost rows, the
 * optional-price hide/zero behaviour, and that price stays per square foot after a unit change.
 * Task-first ORDER + first-viewport are additionally asserted by e2e/task-first-layout.spec.ts.
 */
const ROUTE = '/everyday/square-footage-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#sf-result');
const primary = (page: Page) => page.locator('#sf-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#sf-result [data-result-summary-label]');
const interpretation = (page: Page) => page.locator('#sf-result [data-sf-interpretation]');
const sqm = (page: Page) => page.locator('#sf-result [data-sf-sqm]');
const sqyd = (page: Page) => page.locator('#sf-result [data-sf-sqyd]');
const oneSectionRow = (page: Page) => page.locator('#sf-result [data-sf-onesection-row]');
const costRow = (page: Page) => page.locator('#sf-result [data-sf-cost-row]');
const cost = (page: Page) => page.locator('#sf-result [data-sf-cost]');
const liveRegion = (page: Page) => page.locator('#sf-live');
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate Square Footage' });
const resetBtn = (page: Page) => page.getByRole('button', { name: 'Reset' });
const unitSel = (page: Page) => page.locator('[name="unit"]');
const region = (page: Page, when: string) => page.locator(`#sf-result [data-result-when~="${when}"]`);

const calc = async (page: Page, unit: string, length: string, width: string, quantity?: string, price?: string) => {
  if (unit !== 'ft') await page.selectOption('[name="unit"]', unit);
  await page.fill('[name="length"]', length);
  await page.fill('[name="width"]', width);
  if (quantity) await page.fill('[name="quantity"]', quantity);
  if (price !== undefined) await page.fill('[name="pricePerSqFt"]', price);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: blank dims, feet selected, quantity 1, price empty, result empty', async ({ page }) => {
  await expect(page.locator('[name="length"]')).toHaveValue('');
  await expect(page.locator('[name="width"]')).toHaveValue('');
  await expect(unitSel(page)).toHaveValue('ft');
  await expect(page.locator('[name="quantity"]')).toHaveValue('1');
  await expect(page.locator('[name="pricePerSqFt"]')).toHaveValue('');
  await expect(submit(page)).toBeVisible();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(liveRegion(page)).toHaveText('');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="length"]', '10');
  await page.fill('[name="width"]', '12');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Valid results, each unit ------------------------------------------- */

test('valid feet result: total area dominant + m²/yd² breakdown, USD-free unless priced', async ({ page }) => {
  await calc(page, 'ft', '10', '12');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Total area');
  await expect(primary(page)).toHaveText('120');
  await expect(sqm(page)).toHaveText('11.15');
  await expect(sqyd(page)).toHaveText('13.33');
  await expect(interpretation(page)).toHaveText('The area is 120 square feet.');
  await expect(oneSectionRow(page)).toBeHidden(); // quantity 1
  await expect(costRow(page)).toBeHidden(); // no price
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await sqm(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
});

test('the same physical area entered in inches, yards and metres all give ~120 sq ft', async ({ page }) => {
  await calc(page, 'in', '120', '144');
  await expect(primary(page)).toHaveText('120');
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calc(page, 'yd', '3.3333333', '4');
  await expect(primary(page)).toHaveText('120');
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calc(page, 'm', '3.048', '3.6576');
  await expect(primary(page)).toHaveText('120');
});

/* ---- Converting unit ---------------------------------------------------- */

test('before first calc: a unit change CONVERTS the dimensions and does not calculate', async ({ page }) => {
  await page.fill('[name="length"]', '12');
  await page.fill('[name="width"]', '6');
  await page.selectOption('[name="unit"]', 'yd'); // 12 ft → 4 yd, 6 ft → 2 yd
  await expect(page.locator('[name="length"]')).toHaveValue('4');
  await expect(page.locator('[name="width"]')).toHaveValue('2');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty'); // no calc
});

test('after first calc: a unit change converts, preserves the physical area, keeps focus on the select', async ({ page }) => {
  await calc(page, 'ft', '10', '12'); // 120 sq ft
  await expect(primary(page)).toHaveText('120');
  // Focus the select and drive the change directly (Playwright's selectOption does not retain DOM
  // focus in headless) — this exercises the same island-convert + runtime-recompute path while
  // proving neither moves focus away from the selector.
  await unitSel(page).focus();
  await unitSel(page).evaluate((el: HTMLSelectElement) => {
    el.value = 'yd'; // 10 ft → 3.333333 yd, 12 ft → 4 yd
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[name="length"]')).toHaveValue('3.333333');
  await expect(page.locator('[name="width"]')).toHaveValue('4');
  await expect(primary(page)).toHaveText('120'); // physical area preserved
  await expect(unitSel(page)).toBeFocused();
});

test('a unit change leaves quantity and the per-square-foot price untouched', async ({ page }) => {
  await calc(page, 'ft', '10', '12', '2', '5');
  await page.selectOption('[name="unit"]', 'm');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[name="quantity"]')).toHaveValue('2');
  await expect(page.locator('[name="pricePerSqFt"]')).toHaveValue('5'); // price is always per sq ft
});

/* ---- Quantity + cost ---------------------------------------------------- */

test('quantity > 1 shows the one-section row and a multi-section interpretation', async ({ page }) => {
  await calc(page, 'ft', '10', '12', '3');
  await expect(primary(page)).toHaveText('360');
  await expect(oneSectionRow(page)).toBeVisible();
  await expect(page.locator('#sf-result [data-sf-onesection]')).toHaveText('120');
  await expect(interpretation(page)).toContainText('Across 3 identical areas, the total is 360 square feet.');
});

test('cost is hidden when price is empty, shows $0.00 for an entered 0, and a value for a price', async ({ page }) => {
  await calc(page, 'ft', '10', '12');
  await expect(costRow(page)).toBeHidden();
  await page.fill('[name="pricePerSqFt"]', '0');
  await page.waitForTimeout(DEBOUNCE);
  await expect(costRow(page)).toBeVisible();
  await expect(cost(page)).toHaveText('$0.00');
  await page.fill('[name="pricePerSqFt"]', '5');
  await page.waitForTimeout(DEBOUNCE);
  await expect(cost(page)).toHaveText('$600.00'); // 120 × $5
  await expect(interpretation(page)).toContainText('At $5.00 per square foot, the estimated cost is $600.00.');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty explicit submission focuses the length field and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const length = page.locator('[name="length"]');
  await expect(length).toBeFocused();
  await expect(length).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="length"]')).toHaveText('Enter a length greater than zero.');
});

test('zero dimensions and a fractional quantity are rejected', async ({ page }) => {
  await calc(page, 'ft', '0', '12');
  await expect(page.locator('[data-error-for="length"]')).toHaveText('Enter a length greater than zero.');
  await calc(page, 'ft', '10', '12', '2.5');
  await expect(page.locator('[data-error-for="quantity"]')).toHaveText('Enter a whole number of at least 1.');
  await calc(page, 'ft', '10', '12', '1', '-1');
  await expect(page.locator('[data-error-for="pricePerSqFt"]')).toHaveText('Enter a price of zero or more, or leave it blank.');
});

/* ---- Announcement + Reset + integrity ----------------------------------- */

test('announces the dominant total area only', async ({ page }) => {
  await calc(page, 'ft', '10', '12');
  await expect(liveRegion(page)).toHaveText('The total area is 120 square feet.');
  await expect(liveRegion(page)).not.toContainText(/metre|yard|cost|\$/i);
});

test('reset clears dims + price, restores feet + quantity 1, returns to empty', async ({ page }) => {
  await calc(page, 'm', '3', '4', '2', '5');
  await resetBtn(page).click();
  await expect(page.locator('[name="length"]')).toHaveValue('');
  await expect(page.locator('[name="width"]')).toHaveValue('');
  await expect(unitSel(page)).toHaveValue('ft');
  await expect(page.locator('[name="quantity"]')).toHaveValue('1');
  await expect(page.locator('[name="pricePerSqFt"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

test('keyboard submission works, and no NaN / Infinity / undefined renders', async ({ page }) => {
  await page.fill('[name="length"]', '10');
  await page.fill('[name="width"]', '12');
  await page.locator('[name="width"]').press('Enter');
  await expect(primary(page)).toHaveText('120');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
  await expect(page.getByText('Price per square foot in USD')).toBeVisible();
});

/* ---- Responsive / theme ------------------------------------------------- */

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calc(page, 'ft', '10', '12');
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calc(page, 'ft', '10', '12');
  await expect(primary(page)).toHaveText('120');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calc(page, 'ft', '10', '12');
  await expect(primary(page)).toBeVisible();
});

/* ---- Embed + monetization ----------------------------------------------- */

test('the embed route mounts the same interactive island, conversion included', async ({ page }) => {
  await page.goto('/embed/everyday/square-footage-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="length"]', '10');
  await page.fill('[name="width"]', '12');
  await page.getByRole('button', { name: 'Calculate Square Footage' }).click();
  await expect(page.locator('#sf-result [data-result-value]')).toHaveText('120');
  await page.selectOption('[name="unit"]', 'yd');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('#sf-result [data-result-value]')).toHaveText('120'); // area preserved
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
