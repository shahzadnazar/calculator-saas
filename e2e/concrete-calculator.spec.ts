import { test, expect, type Page } from '@playwright/test';

/**
 * Concrete calculator — R10C1 standard-form wave (calculator #21; product family GEOMETRY, runtime
 * unchanged, no isUsableResult). Single rectangular-prism volume with a CONVERTING native-RADIO input
 * unit (ft/m). Covers the task-first doctrine end-to-end plus dimension-preserving unit conversion
 * (before/after first calc, volume preserved, focus retained on the radio), the fixed 40/60/80 lb bag
 * table (semantic, whole ceil counts), the optional-waste behaviour, and the NO-COST boundary — the
 * calculator computes none and the cost FAQ says so. Task-first ORDER + first-viewport are additionally
 * asserted by e2e/task-first-layout.spec.ts.
 */
const ROUTE = '/everyday/concrete-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#co-result');
const primary = (page: Page) => page.locator('#co-result [data-result-value]');
const unitLabel = (page: Page) => page.locator('#co-result [data-result-unit]');
const summaryLabel = (page: Page) => page.locator('#co-result [data-result-summary-label]');
const interpretation = (page: Page) => page.locator('#co-result [data-co-interpretation]');
const cm = (page: Page) => page.locator('#co-result [data-co-cm]');
const cf = (page: Page) => page.locator('#co-result [data-co-cf]');
const b40 = (page: Page) => page.locator('#co-result [data-co-b40]');
const b60 = (page: Page) => page.locator('#co-result [data-co-b60]');
const b80 = (page: Page) => page.locator('#co-result [data-co-b80]');
const liveRegion = (page: Page) => page.locator('#co-live');
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate Concrete' });
const resetBtn = (page: Page) => page.getByRole('button', { name: 'Reset' });
const unitRadio = (page: Page, v: string) => page.locator(`[name="unit"][value="${v}"]`);
const region = (page: Page, when: string) => page.locator(`#co-result [data-result-when~="${when}"]`);

const calc = async (page: Page, unit: string, length: string, width: string, depth: string, waste?: string) => {
  if (unit === 'm') await page.check('[name="unit"][value="m"]');
  await page.fill('[name="length"]', length);
  await page.fill('[name="width"]', width);
  await page.fill('[name="depth"]', depth);
  if (waste !== undefined) await page.fill('[name="wastePct"]', waste);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: blank dims, feet selected, waste empty, result empty', async ({ page }) => {
  await expect(page.locator('[name="length"]')).toHaveValue('');
  await expect(page.locator('[name="width"]')).toHaveValue('');
  await expect(page.locator('[name="depth"]')).toHaveValue('');
  await expect(unitRadio(page, 'ft')).toBeChecked();
  await expect(page.locator('[name="wastePct"]')).toHaveValue('');
  await expect(submit(page)).toBeVisible();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(liveRegion(page)).toHaveText('');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="length"]', '10');
  await page.fill('[name="width"]', '10');
  await page.fill('[name="depth"]', '0.5');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Valid results ------------------------------------------------------ */

test('valid feet result: cubic yards dominant + m³/ft³ breakdown + bag table, no cost', async ({ page }) => {
  await calc(page, 'ft', '10', '10', '0.5');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Concrete needed');
  await expect(primary(page)).toHaveText('1.852');
  await expect(unitLabel(page)).toHaveText('yd³');
  await expect(cm(page)).toHaveText('1.416');
  await expect(cf(page)).toHaveText('50');
  await expect(b40(page)).toHaveText('167');
  await expect(b60(page)).toHaveText('112');
  await expect(b80(page)).toHaveText('84');
  await expect(interpretation(page)).toHaveText(
    'You need approximately 1.852 cubic yards of concrete with no additional waste allowance.',
  );
  // The dominant figure reads much larger than a breakdown cell.
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await cm(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
  // No cost anywhere in the interactive calculator.
  await expect(page.locator('[data-concrete]')).not.toContainText('$');
});

test('valid metres result converts to the same family of figures', async ({ page }) => {
  await calc(page, 'm', '3', '3', '0.15');
  await expect(primary(page)).toHaveText('1.766');
  await expect(cm(page)).toHaveText('1.35');
  await expect(cf(page)).toHaveText('47.675');
  await expect(b40(page)).toHaveText('159');
  await expect(b60(page)).toHaveText('106');
  await expect(b80(page)).toHaveText('80');
});

/* ---- Waste allowance ---------------------------------------------------- */

test('a waste allowance scales the volume and is stated in the interpretation', async ({ page }) => {
  await calc(page, 'ft', '10', '10', '0.5', '10');
  await expect(primary(page)).toHaveText('2.037');
  await expect(cf(page)).toHaveText('55');
  await expect(b80(page)).toHaveText('92');
  await expect(interpretation(page)).toHaveText(
    'You need approximately 2.037 cubic yards of concrete including a 10% waste allowance.',
  );
});

test('an entered waste of 0 is valid and reads as no additional allowance', async ({ page }) => {
  await calc(page, 'ft', '10', '10', '0.5', '0');
  await expect(primary(page)).toHaveText('1.852');
  await expect(interpretation(page)).toContainText('no additional waste allowance');
});

/* ---- Converting unit (native radios) ------------------------------------ */

test('before first calc: a unit change CONVERTS the dimensions, updates the tags, does not calculate', async ({ page }) => {
  await page.fill('[name="length"]', '10');
  await page.fill('[name="width"]', '10');
  await page.fill('[name="depth"]', '0.5');
  await page.check('[name="unit"][value="m"]'); // 10 ft → 3.048 m, 0.5 ft → 0.1524 m
  await expect(page.locator('[name="length"]')).toHaveValue('3.048');
  await expect(page.locator('[name="width"]')).toHaveValue('3.048');
  await expect(page.locator('[name="depth"]')).toHaveValue('0.1524');
  await expect(page.locator('[data-co-unit-tag]')).toHaveText(['m', 'm', 'm']); // the "(ft)" tags follow
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty'); // no calc
});

test('after first calc: a unit change converts, preserves the physical volume, keeps focus on the radio', async ({ page }) => {
  await calc(page, 'ft', '10', '10', '0.5'); // 1.852 cy
  await expect(primary(page)).toHaveText('1.852');
  // Native radios retain DOM focus in headless Chromium, so page.check drives the real path.
  await page.check('[name="unit"][value="m"]');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[name="length"]')).toHaveValue('3.048');
  await expect(page.locator('[name="width"]')).toHaveValue('3.048');
  await expect(page.locator('[name="depth"]')).toHaveValue('0.1524');
  await expect(primary(page)).toHaveText('1.852'); // physical volume preserved
  await expect(unitRadio(page, 'm')).toBeFocused();
});

/* ---- Bag table ---------------------------------------------------------- */

test('the bag table exposes 40/60/80 lb row headers with whole rounded-up counts', async ({ page }) => {
  await calc(page, 'ft', '10', '10', '0.5');
  await expect(page.getByRole('rowheader', { name: '40 lb' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: '60 lb' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: '80 lb' })).toBeVisible();
  for (const cell of [b40(page), b60(page), b80(page)]) {
    expect(await cell.textContent()).toMatch(/^\d+$/); // whole numbers
  }
  await expect(b80(page)).toHaveText('84'); // ceil(83.33)
});

test('the bag-yield assumptions are shown', async ({ page }) => {
  await calc(page, 'ft', '10', '10', '0.5');
  await expect(page.getByText(/Bag estimates use approximate yields/)).toBeVisible();
});

/* ---- Validation --------------------------------------------------------- */

test('an empty explicit submission focuses length and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const length = page.locator('[name="length"]');
  await expect(length).toBeFocused();
  await expect(length).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="length"]')).toHaveText('Enter a length greater than zero.');
});

test('zero dimensions and a negative waste are rejected', async ({ page }) => {
  await calc(page, 'ft', '0', '10', '0.5');
  await expect(page.locator('[data-error-for="length"]')).toHaveText('Enter a length greater than zero.');
  await calc(page, 'ft', '10', '10', '0.5', '-5');
  await expect(page.locator('[data-error-for="wastePct"]')).toHaveText(
    'Enter a waste allowance of zero or more, or leave it blank.',
  );
});

/* ---- Announcement + Reset + integrity ----------------------------------- */

test('announces the dominant cubic yards only', async ({ page }) => {
  await calc(page, 'ft', '10', '10', '0.5');
  await expect(liveRegion(page)).toHaveText('You need approximately 1.852 cubic yards of concrete.');
  await expect(liveRegion(page)).not.toContainText(/metre|feet|bag|\$/i);
});

test('reset clears dims + waste, restores feet + tags, returns to empty', async ({ page }) => {
  await calc(page, 'm', '3', '3', '0.15', '5');
  await resetBtn(page).click();
  await expect(page.locator('[name="length"]')).toHaveValue('');
  await expect(page.locator('[name="width"]')).toHaveValue('');
  await expect(page.locator('[name="depth"]')).toHaveValue('');
  await expect(unitRadio(page, 'ft')).toBeChecked();
  await expect(page.locator('[name="wastePct"]')).toHaveValue('');
  await expect(page.locator('[data-co-unit-tag]')).toHaveText(['ft', 'ft', 'ft']);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

test('keyboard submission works, and no NaN / Infinity / undefined renders', async ({ page }) => {
  await page.fill('[name="length"]', '10');
  await page.fill('[name="width"]', '10');
  await page.fill('[name="depth"]', '0.5');
  await page.locator('[name="depth"]').press('Enter');
  await expect(primary(page)).toHaveText('1.852');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Responsive / theme ------------------------------------------------- */

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calc(page, 'ft', '10', '10', '0.5');
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calc(page, 'ft', '10', '10', '0.5');
  await expect(primary(page)).toHaveText('1.852');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calc(page, 'ft', '10', '10', '0.5');
  await expect(primary(page)).toBeVisible();
});

/* ---- Embed + monetization + no-cost boundary ---------------------------- */

test('the embed route mounts the same interactive island, radio conversion included', async ({ page }) => {
  await page.goto('/embed/everyday/concrete-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="length"]', '10');
  await page.fill('[name="width"]', '10');
  await page.fill('[name="depth"]', '0.5');
  await page.getByRole('button', { name: 'Calculate Concrete' }).click();
  await expect(page.locator('#co-result [data-result-value]')).toHaveText('1.852');
  await page.check('[name="unit"][value="m"]');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[name="length"]')).toHaveValue('3.048');
  await expect(page.locator('#co-result [data-result-value]')).toHaveText('1.852'); // volume preserved
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});

test('the calculator computes no cost, and the cost FAQ makes that explicit', async ({ page }) => {
  await calc(page, 'ft', '10', '10', '0.5');
  await expect(page.locator('[data-concrete]')).not.toContainText('$');
  expect(await page.content()).toContain('This calculator estimates volume and bag counts, not cost');
});
