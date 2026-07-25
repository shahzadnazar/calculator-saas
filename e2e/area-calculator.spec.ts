import { test, expect, type Page } from '@playwright/test';

/**
 * Area calculator — R12B1 task-first migration (geometry shape-picker pilot). Wraps the UNCHANGED
 * calculateArea; the complete-result guard lives in the binding's resultValue (a NaN sentinel — NO
 * isUsableResult). Task-first: empty dimensions, "Calculate Area" for the first result, live-after-first.
 * The SHAPE is a structural select with per-shape conditional fields (shape-scoped names, inactive groups
 * hidden + disabled); the UNIT is interpretive (labels only, never converts).
 */
const ROUTE = '/math/area-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#ar-result');
const primary = (page: Page) => page.locator('#ar-result [data-result-value]');
const unitSq = (page: Page) => page.locator('[data-ar-unit-sq]');
const interpretation = (page: Page) => page.locator('[data-ar-interpretation]');
const live = (page: Page) => page.locator('#ar-live');
const submit = (page: Page) => page.locator('[data-ar-submit]');
const region = (page: Page, when: string) => page.locator(`#ar-result [data-result-when~="${when}"]`);
const group = (page: Page, shape: string) => page.locator(`[data-ar-group="${shape}"]`);
const dim = (page: Page, shape: string, key: string) => page.locator(`[name="${shape}.${key}"]`);
const fieldError = (page: Page, name: string) => page.locator(`[data-error-for="${name}"]`);

// shape → dimensions + the formatNumber(area, 3) the result should render.
const SHAPES: Record<string, { dims: Record<string, string>; area: string }> = {
  rectangle: { dims: { length: '8', width: '5' }, area: '40' },
  square: { dims: { side: '4' }, area: '16' },
  triangle: { dims: { base: '6', height: '4' }, area: '12' },
  circle: { dims: { radius: '5' }, area: '78.54' },
  trapezoid: { dims: { a: '6', b: '4', height: '3' }, area: '15' },
  parallelogram: { dims: { base: '6', height: '4' }, area: '24' },
  ellipse: { dims: { a: '5', b: '3' }, area: '47.124' },
};

const selectShape = async (page: Page, shape: string) => page.selectOption('[name="shape"]', shape);
const fillShape = async (page: Page, shape: string) => {
  await selectShape(page, shape);
  for (const [k, v] of Object.entries(SHAPES[shape].dims)) await dim(page, shape, k).fill(v);
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads task-first: rectangle + m, empty dims, empty result, Calculate Area, no auto-calc', async ({ page }) => {
  await expect(page.locator('[name="shape"]')).toHaveValue('rectangle');
  await expect(page.locator('[name="unit"]')).toHaveValue('m');
  await expect(dim(page, 'rectangle', 'length')).toHaveValue('');
  await expect(dim(page, 'rectangle', 'width')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(submit(page)).toHaveText('Calculate Area');
  await page.waitForTimeout(DEBOUNCE); // no auto-calc
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('each shape reveals ONLY its required fields; inactive groups are hidden and disabled', async ({ page }) => {
  for (const shape of Object.keys(SHAPES)) {
    await selectShape(page, shape);
    await expect(group(page, shape)).toBeVisible();
    for (const key of Object.keys(SHAPES[shape].dims)) await expect(dim(page, shape, key)).toBeEnabled();
    // a different shape's group is hidden and its inputs disabled
    const other = shape === 'circle' ? 'rectangle' : 'circle';
    await expect(group(page, other)).toBeHidden();
    await expect(dim(page, other, Object.keys(SHAPES[other].dims)[0])).toBeDisabled();
  }
});

/* ---- Ordinary calculation, every shape ---------------------------------- */

for (const [shape, { area }] of Object.entries(SHAPES)) {
  test(`ordinary ${shape}: dominant area ${area} m²`, async ({ page }) => {
    await fillShape(page, shape);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText(area);
    await expect(unitSq(page)).toHaveText('m²');
  });
}

test('the interpretation names the shape and squared unit', async ({ page }) => {
  await fillShape(page, 'rectangle');
  await submit(page).click();
  await expect(interpretation(page)).toHaveText('The area of the selected rectangle is 40 m².');
});

/* ---- Unit (interpretive, never converts) -------------------------------- */

test('the squared unit label matches the selected unit', async ({ page }) => {
  await selectShape(page, 'rectangle');
  await page.selectOption('[name="unit"]', 'ft');
  await fillShape(page, 'rectangle');
  await submit(page).click();
  await expect(unitSq(page)).toHaveText('ft²');
  await expect(interpretation(page)).toContainText('ft²');
});

test('unit change BEFORE the first result does not calculate but relabels the dimension unit', async ({ page }) => {
  await page.selectOption('[name="unit"]', 'ft');
  await expect(group(page, 'rectangle').locator('[data-ar-dim-unit]').first()).toHaveText('ft');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty'); // still no result
});

test('unit change AFTER the first result relabels without converting the entered numbers', async ({ page }) => {
  await fillShape(page, 'rectangle');
  await submit(page).click();
  await expect(primary(page)).toHaveText('40');
  await page.selectOption('[name="unit"]', 'ft');
  await page.waitForTimeout(DEBOUNCE);
  // The entered numbers are unchanged and the area value is unchanged — only the unit label flips.
  await expect(dim(page, 'rectangle', 'length')).toHaveValue('8');
  await expect(primary(page)).toHaveText('40');
  await expect(unitSq(page)).toHaveText('ft²');
});

/* ---- Shape switching ---------------------------------------------------- */

test('shape change BEFORE the first result reveals fields but does not calculate', async ({ page }) => {
  await selectShape(page, 'circle');
  await expect(group(page, 'circle')).toBeVisible();
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('a valid shape switch after the first result recalculates (values retained across switches)', async ({ page }) => {
  await fillShape(page, 'circle');
  await submit(page).click();
  await expect(primary(page)).toHaveText('78.54');
  await fillShape(page, 'rectangle'); // live-after-first
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('40');
  // Switch back to circle — its radius (5) was retained while the group was inactive.
  await selectShape(page, 'circle');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('78.54');
});

test('switching to a shape with missing fields clears the stale result', async ({ page }) => {
  await fillShape(page, 'rectangle');
  await submit(page).click();
  await expect(primary(page)).toHaveText('40');
  await selectShape(page, 'triangle'); // base/height never entered
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(region(page, 'valid')).toBeHidden();
});

/* ---- Validation --------------------------------------------------------- */

test('an empty submission focuses the first active dimension and shows its error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(fieldError(page, 'rectangle.length')).toBeVisible();
  await expect(fieldError(page, 'rectangle.length')).toContainText('greater than zero');
  await expect(dim(page, 'rectangle', 'length')).toBeFocused();
});

test('zero / negative dimensions are field errors', async ({ page }) => {
  await selectShape(page, 'rectangle');
  await dim(page, 'rectangle', 'length').fill('0');
  await dim(page, 'rectangle', 'width').fill('-4');
  await submit(page).click();
  await expect(fieldError(page, 'rectangle.length')).toBeVisible();
  await expect(fieldError(page, 'rectangle.width')).toBeVisible();
});

test('field errors are associated via aria-describedby / data-error-for', async ({ page }) => {
  await submit(page).click();
  const input = dim(page, 'rectangle', 'length');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAttribute('aria-describedby', 'ar-rectangle-length-error');
  await expect(page.locator('#ar-rectangle-length-error')).toHaveAttribute('data-error-for', 'rectangle.length');
});

test('inactive shapes never receive errors', async ({ page }) => {
  await submit(page).click(); // rectangle active, invalid
  await expect(fieldError(page, 'circle.radius')).toBeHidden();
  await expect(dim(page, 'circle', 'radius')).not.toHaveAttribute('aria-invalid', 'true');
});

/* ---- Interaction -------------------------------------------------------- */

test('after the first result, editing updates live and keeps focus on the edited field', async ({ page }) => {
  await fillShape(page, 'rectangle');
  await submit(page).click();
  await expect(primary(page)).toHaveText('40');
  const w = dim(page, 'rectangle', 'width');
  await w.focus();
  await w.fill('10');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('80');
  await expect(w).toBeFocused();
});

test('the announcement states only the dominant area', async ({ page }) => {
  await fillShape(page, 'rectangle');
  await submit(page).click();
  await expect(live(page)).toHaveText('The calculated area is 40 square metres.');
});

test('reset restores rectangle + m, clears fields, result and announcement, and does not calculate', async ({ page }) => {
  await fillShape(page, 'ellipse');
  await submit(page).click();
  await expect(primary(page)).toHaveText('47.124');

  await page.locator('[data-reset]').click();
  await expect(page.locator('[name="shape"]')).toHaveValue('rectangle');
  await expect(page.locator('[name="unit"]')).toHaveValue('m');
  await expect(group(page, 'rectangle')).toBeVisible();
  await expect(group(page, 'ellipse')).toBeHidden();
  await expect(dim(page, 'rectangle', 'length')).toHaveValue('');
  await expect(dim(page, 'ellipse', 'a')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(live(page)).toHaveText('');
});

test('keyboard submission (Enter from a dimension) computes', async ({ page }) => {
  await selectShape(page, 'square');
  const side = dim(page, 'square', 'side');
  await side.fill('4');
  await side.press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('16');
});

test('no NaN / Infinity / undefined renders for an ordinary result', async ({ page }) => {
  await fillShape(page, 'circle');
  await submit(page).click();
  expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
});

/* ---- Responsive / embed / monetization ---------------------------------- */

test('desktop shows the dominant area within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await fillShape(page, 'rectangle');
  await submit(page).click();
  await expect(primary(page)).toBeInViewport();
});

test('mobile does not overflow horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await fillShape(page, 'trapezoid');
  await submit(page).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await fillShape(page, 'rectangle');
  await submit(page).click();
  await expect(primary(page)).toBeVisible();
});

test('the generated embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/math/area-calculator', { waitUntil: 'domcontentloaded' });
  await page.selectOption('[name="shape"]', 'rectangle');
  await page.fill('[name="rectangle.length"]', '8');
  await page.fill('[name="rectangle.width"]', '5');
  await page.locator('[data-ar-submit]').click();
  await expect(page.locator('#ar-result [data-result-value]')).toHaveText('40');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
