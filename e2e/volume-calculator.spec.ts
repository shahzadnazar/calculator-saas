import { test, expect, type Page } from '@playwright/test';

/**
 * Volume calculator — R12C1 task-first migration (geometry shape-picker, 2 of 2). Wraps the UNCHANGED
 * calculateVolume; the complete-result guard lives in the binding's resultValue (a NaN sentinel — NO
 * isUsableResult). Task-first: empty dimensions, "Calculate Volume" for the first result,
 * live-after-first. The SHAPE is a structural select with per-shape conditional fields (shape-scoped
 * names, inactive groups hidden + disabled; default CUBE); the UNIT is interpretive (cubic label, never
 * converts). Volume is an INDEPENDENT product following the Area pattern.
 */
const ROUTE = '/math/volume-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#vo-result');
const primary = (page: Page) => page.locator('#vo-result [data-result-value]');
const unitCubed = (page: Page) => page.locator('[data-vo-unit-cubed]');
const interpretation = (page: Page) => page.locator('[data-vo-interpretation]');
const live = (page: Page) => page.locator('#vo-live');
const submit = (page: Page) => page.locator('[data-vo-submit]');
const region = (page: Page, when: string) => page.locator(`#vo-result [data-result-when~="${when}"]`);
const group = (page: Page, shape: string) => page.locator(`[data-vo-group="${shape}"]`);
const dim = (page: Page, shape: string, key: string) => page.locator(`[name="${shape}.${key}"]`);
const fieldError = (page: Page, name: string) => page.locator(`[data-error-for="${name}"]`);

// shape → dimensions + the formatNumber(volume, 3) the result should render.
const SHAPES: Record<string, { dims: Record<string, string>; volume: string }> = {
  cube: { dims: { side: '4' }, volume: '64' },
  box: { dims: { length: '8', width: '5', height: '2' }, volume: '80' },
  sphere: { dims: { radius: '3' }, volume: '113.097' },
  cylinder: { dims: { radius: '2', height: '5' }, volume: '62.832' },
  cone: { dims: { radius: '3', height: '6' }, volume: '56.549' },
  pyramid: { dims: { length: '6', width: '4', height: '9' }, volume: '72' },
  capsule: { dims: { radius: '3', height: '6' }, volume: '282.743' },
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

test('loads task-first: cube + m, empty dims, empty result, Calculate Volume, no auto-calc', async ({ page }) => {
  await expect(page.locator('[name="shape"]')).toHaveValue('cube');
  await expect(page.locator('[name="unit"]')).toHaveValue('m');
  await expect(dim(page, 'cube', 'side')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(submit(page)).toHaveText('Calculate Volume');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('each shape reveals ONLY its required fields; inactive groups are hidden and disabled', async ({ page }) => {
  for (const shape of Object.keys(SHAPES)) {
    await selectShape(page, shape);
    await expect(group(page, shape)).toBeVisible();
    for (const key of Object.keys(SHAPES[shape].dims)) await expect(dim(page, shape, key)).toBeEnabled();
    const other = shape === 'sphere' ? 'cube' : 'sphere';
    await expect(group(page, other)).toBeHidden();
    await expect(dim(page, other, Object.keys(SHAPES[other].dims)[0])).toBeDisabled();
  }
});

/* ---- Ordinary calculation, every shape ---------------------------------- */

for (const [shape, { volume }] of Object.entries(SHAPES)) {
  test(`ordinary ${shape}: dominant volume ${volume} m³`, async ({ page }) => {
    await fillShape(page, shape);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText(volume);
    await expect(unitCubed(page)).toHaveText('m³');
  });
}

test('the interpretation names the shape and cubed unit', async ({ page }) => {
  await fillShape(page, 'cube');
  await submit(page).click();
  await expect(interpretation(page)).toHaveText('The volume of the selected cube is 64 m³.');
});

/* ---- Unit (interpretive, never converts) -------------------------------- */

test('the cubed unit label matches the selected unit', async ({ page }) => {
  await selectShape(page, 'cube');
  await page.selectOption('[name="unit"]', 'ft');
  await fillShape(page, 'cube');
  await submit(page).click();
  await expect(unitCubed(page)).toHaveText('ft³');
  await expect(interpretation(page)).toContainText('ft³');
});

test('unit change BEFORE the first result does not calculate but relabels the dimension unit', async ({ page }) => {
  await page.selectOption('[name="unit"]', 'ft');
  await expect(group(page, 'cube').locator('[data-vo-dim-unit]').first()).toHaveText('ft');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('unit change AFTER the first result relabels without converting the entered numbers', async ({ page }) => {
  await fillShape(page, 'cube');
  await submit(page).click();
  await expect(primary(page)).toHaveText('64');
  await page.selectOption('[name="unit"]', 'ft');
  await page.waitForTimeout(DEBOUNCE);
  await expect(dim(page, 'cube', 'side')).toHaveValue('4');
  await expect(primary(page)).toHaveText('64');
  await expect(unitCubed(page)).toHaveText('ft³');
});

/* ---- Shape switching ---------------------------------------------------- */

test('shape change BEFORE the first result reveals fields but does not calculate', async ({ page }) => {
  await selectShape(page, 'sphere');
  await expect(group(page, 'sphere')).toBeVisible();
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('a valid shape switch after the first result recalculates (values retained across switches)', async ({ page }) => {
  await fillShape(page, 'sphere');
  await submit(page).click();
  await expect(primary(page)).toHaveText('113.097');
  await fillShape(page, 'cube');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('64');
  await selectShape(page, 'sphere'); // radius (3) retained while inactive
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('113.097');
});

test('switching to a shape with missing fields clears the stale result', async ({ page }) => {
  await fillShape(page, 'cube');
  await submit(page).click();
  await expect(primary(page)).toHaveText('64');
  await selectShape(page, 'box'); // length/width/height never entered
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(region(page, 'valid')).toBeHidden();
});

/* ---- Validation --------------------------------------------------------- */

test('an empty submission focuses the first active dimension and shows its error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(fieldError(page, 'cube.side')).toBeVisible();
  await expect(fieldError(page, 'cube.side')).toContainText('greater than zero');
  await expect(dim(page, 'cube', 'side')).toBeFocused();
});

test('zero / negative dimensions are field errors', async ({ page }) => {
  await selectShape(page, 'box');
  await dim(page, 'box', 'length').fill('0');
  await dim(page, 'box', 'width').fill('-4');
  await dim(page, 'box', 'height').fill('2');
  await submit(page).click();
  await expect(fieldError(page, 'box.length')).toBeVisible();
  await expect(fieldError(page, 'box.width')).toBeVisible();
});

test('field errors are associated via aria-describedby / data-error-for', async ({ page }) => {
  await submit(page).click();
  const input = dim(page, 'cube', 'side');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAttribute('aria-describedby', 'vo-cube-side-error');
  await expect(page.locator('#vo-cube-side-error')).toHaveAttribute('data-error-for', 'cube.side');
});

test('inactive shapes never receive errors', async ({ page }) => {
  await submit(page).click(); // cube active, invalid
  await expect(fieldError(page, 'box.length')).toBeHidden();
  await expect(dim(page, 'box', 'length')).not.toHaveAttribute('aria-invalid', 'true');
});

/* ---- Interaction -------------------------------------------------------- */

test('after the first result, editing updates live and keeps focus on the edited field', async ({ page }) => {
  await fillShape(page, 'box');
  await submit(page).click();
  await expect(primary(page)).toHaveText('80');
  const h = dim(page, 'box', 'height');
  await h.focus();
  await h.fill('4');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('160');
  await expect(h).toBeFocused();
});

test('the announcement states only the dominant volume', async ({ page }) => {
  await fillShape(page, 'cube');
  await submit(page).click();
  await expect(live(page)).toHaveText('The calculated volume is 64 cubic metres.');
});

test('reset restores cube + m, clears fields, result and announcement, and does not calculate', async ({ page }) => {
  await fillShape(page, 'capsule');
  await submit(page).click();
  await expect(primary(page)).toHaveText('282.743');

  await page.locator('[data-reset]').click();
  await expect(page.locator('[name="shape"]')).toHaveValue('cube');
  await expect(page.locator('[name="unit"]')).toHaveValue('m');
  await expect(group(page, 'cube')).toBeVisible();
  await expect(group(page, 'capsule')).toBeHidden();
  await expect(dim(page, 'cube', 'side')).toHaveValue('');
  await expect(dim(page, 'capsule', 'radius')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(live(page)).toHaveText('');
});

test('keyboard submission (Enter from a dimension) computes', async ({ page }) => {
  await selectShape(page, 'sphere');
  const radius = dim(page, 'sphere', 'radius');
  await radius.fill('3');
  await radius.press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('113.097');
});

test('no NaN / Infinity / undefined renders for an ordinary result', async ({ page }) => {
  await fillShape(page, 'capsule');
  await submit(page).click();
  expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
});

/* ---- Responsive / embed / monetization ---------------------------------- */

test('desktop shows the dominant volume within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await fillShape(page, 'cube');
  await submit(page).click();
  await expect(primary(page)).toBeInViewport();
});

test('mobile does not overflow horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await fillShape(page, 'box');
  await submit(page).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await fillShape(page, 'cube');
  await submit(page).click();
  await expect(primary(page)).toBeVisible();
});

test('the generated embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/math/volume-calculator', { waitUntil: 'domcontentloaded' });
  await page.selectOption('[name="shape"]', 'cube');
  await page.fill('[name="cube.side"]', '4');
  await page.locator('[data-vo-submit]').click();
  await expect(page.locator('#vo-result [data-result-value]')).toHaveText('64');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
