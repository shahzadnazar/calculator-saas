import { test, expect, type Page } from '@playwright/test';

/**
 * Triangle calculator — R10D1 standard-form wave (calculator #22; product family GEOMETRY, runtime
 * unchanged, no isUsableResult). The final geometry migration. SSS: three side lengths → area
 * (dominant) + perimeter, angles and classification. Covers the task-first doctrine end-to-end plus
 * the CROSS-FIELD triangle-inequality domain error: one form-level message (no side uniquely blamed),
 * focus returned to Side A on explicit submit, the "sum of any two sides…" hint shown only for that
 * domain case, and the valid→invalid→valid live transitions (stale result replaced, focus kept on the
 * edited field). Task-first ORDER + first-viewport are additionally asserted by task-first-layout.spec.
 */
const ROUTE = '/math/triangle-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#tri-result');
const primary = (page: Page) => page.locator('#tri-result [data-result-value]');
const unitLabel = (page: Page) => page.locator('#tri-result [data-result-unit]');
const summaryLabel = (page: Page) => page.locator('#tri-result [data-result-summary-label]');
const interpretation = (page: Page) => page.locator('#tri-result [data-tri-interpretation]');
const perimeter = (page: Page) => page.locator('#tri-result [data-tri-perimeter]');
const angleA = (page: Page) => page.locator('#tri-result [data-tri-angle-a]');
const angleB = (page: Page) => page.locator('#tri-result [data-tri-angle-b]');
const angleC = (page: Page) => page.locator('#tri-result [data-tri-angle-c]');
const sideType = (page: Page) => page.locator('#tri-result [data-tri-side-type]');
const angleTypeEl = (page: Page) => page.locator('#tri-result [data-tri-angle-type]');
const invalidMsg = (page: Page) => page.locator('#tri-result [data-result-invalid-message]');
const domainHint = (page: Page) => page.locator('#tri-result [data-tri-domain-hint]');
const liveRegion = (page: Page) => page.locator('#tri-live');
const submit = (page: Page) => page.getByRole('button', { name: 'Solve Triangle' });
const resetBtn = (page: Page) => page.getByRole('button', { name: 'Reset' });
const region = (page: Page, when: string) => page.locator(`#tri-result [data-result-when~="${when}"]`);

const calc = async (page: Page, a: string, b: string, c: string) => {
  await page.fill('[name="a"]', a);
  await page.fill('[name="b"]', b);
  await page.fill('[name="c"]', c);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: blank sides, empty result, Solve Triangle visible', async ({ page }) => {
  await expect(page.locator('[name="a"]')).toHaveValue('');
  await expect(page.locator('[name="b"]')).toHaveValue('');
  await expect(page.locator('[name="c"]')).toHaveValue('');
  await expect(submit(page)).toBeVisible();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(liveRegion(page)).toHaveText('');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="a"]', '3');
  await page.fill('[name="b"]', '4');
  await page.fill('[name="c"]', '5');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Valid results ------------------------------------------------------ */

test('valid 3-4-5: area dominant + perimeter/angles/classification breakdown', async ({ page }) => {
  await calc(page, '3', '4', '5');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Triangle area');
  await expect(primary(page)).toHaveText('6');
  await expect(unitLabel(page)).toHaveText('square units');
  await expect(perimeter(page)).toHaveText('12');
  await expect(angleA(page)).toHaveText('36.87°');
  await expect(angleB(page)).toHaveText('53.13°');
  await expect(angleC(page)).toHaveText('90°');
  await expect(sideType(page)).toHaveText('Scalene');
  await expect(angleTypeEl(page)).toHaveText('Right');
  await expect(interpretation(page)).toHaveText('This is a right scalene triangle with an area of 6 square units.');
  // Area reads much larger than a breakdown cell.
  const areaSize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await perimeter(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(areaSize).toBeGreaterThan(cellSize * 1.5);
});

test('an equilateral triangle is acute with three equal angles', async ({ page }) => {
  await calc(page, '5', '5', '5');
  await expect(primary(page)).toHaveText('10.825');
  await expect(angleA(page)).toHaveText('60°');
  await expect(sideType(page)).toHaveText('Equilateral');
  await expect(angleTypeEl(page)).toHaveText('Acute');
  await expect(interpretation(page)).toHaveText('This is an acute equilateral triangle. All three angles are equal.');
});

test('an isosceles acute triangle (5-5-6)', async ({ page }) => {
  await calc(page, '5', '5', '6');
  await expect(primary(page)).toHaveText('12');
  await expect(sideType(page)).toHaveText('Isosceles');
  await expect(angleTypeEl(page)).toHaveText('Acute');
  await expect(interpretation(page)).toContainText('two equal sides');
});

test('an obtuse isosceles triangle (5-5-9)', async ({ page }) => {
  await calc(page, '5', '5', '9');
  await expect(primary(page)).toHaveText('9.808');
  await expect(angleC(page)).toHaveText('128.32°');
  await expect(angleTypeEl(page)).toHaveText('Obtuse');
  await expect(interpretation(page)).toHaveText('This is an obtuse isosceles triangle with two equal sides.');
});

test('decimal side lengths (3.5-4.5-5.5)', async ({ page }) => {
  await calc(page, '3.5', '4.5', '5.5');
  await expect(primary(page)).toHaveText('7.855');
  await expect(perimeter(page)).toHaveText('13.5');
  await expect(sideType(page)).toHaveText('Scalene');
  await expect(angleTypeEl(page)).toHaveText('Acute');
});

/* ---- Field validation --------------------------------------------------- */

test('an empty explicit submission focuses Side A and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const a = page.locator('[name="a"]');
  await expect(a).toBeFocused();
  await expect(a).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="a"]')).toHaveText('Enter Side A greater than zero.');
});

test('zero and negative sides are rejected as field errors', async ({ page }) => {
  await calc(page, '0', '4', '5');
  await expect(page.locator('[data-error-for="a"]')).toHaveText('Enter Side A greater than zero.');
  await calc(page, '3', '-4', '5');
  await expect(page.locator('[data-error-for="b"]')).toHaveText('Enter Side B greater than zero.');
});

/* ---- Triangle-inequality domain error ----------------------------------- */

test('a degenerate 1-1-2 is a domain error: form message + hint, no side uniquely blamed', async ({ page }) => {
  await calc(page, '1', '1', '2');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(invalidMsg(page)).toHaveText('These side lengths cannot form a triangle.');
  await expect(domainHint(page)).toBeVisible();
  await expect(domainHint(page)).toHaveText('The sum of any two sides must be greater than the third side.');
  // No individual side is marked invalid for an inequality-only failure.
  for (const n of ['a', 'b', 'c']) await expect(page.locator(`[name="${n}"]`)).not.toHaveAttribute('aria-invalid', 'true');
  // Focus returns to Side A (the runtime cannot, since no field is invalid).
  await expect(page.locator('[name="a"]')).toBeFocused();
});

test('an impossible 1-1-5 is a domain error and shows no partial result', async ({ page }) => {
  await calc(page, '1', '1', '5');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(invalidMsg(page)).toHaveText('These side lengths cannot form a triangle.');
  await expect(region(page, 'valid')).toBeHidden(); // no area/angles/perimeter shown
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

test('the domain failure is announced once, concisely', async ({ page }) => {
  await calc(page, '1', '1', '2');
  await expect(liveRegion(page)).toHaveText('These side lengths cannot form a triangle.');
  await expect(liveRegion(page)).not.toContainText(/area|perimeter|°/i); // no geometry, just the domain message
});

test('a field error does NOT show the triangle-formation hint', async ({ page }) => {
  await calc(page, '', '4', '5');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(domainHint(page)).toBeHidden();
});

/* ---- Live transitions --------------------------------------------------- */

test('live valid→invalid: the stale result is replaced by the domain error, focus stays on the edited field', async ({ page }) => {
  await calc(page, '3', '4', '5'); // valid, area 6
  await expect(primary(page)).toHaveText('6');
  await page.fill('[name="c"]', '100'); // 3 + 4 <= 100 → impossible
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(invalidMsg(page)).toHaveText('These side lengths cannot form a triangle.');
  await expect(region(page, 'valid')).toBeHidden(); // no stale area
  await expect(domainHint(page)).toBeVisible();
  await expect(page.locator('[name="c"]')).toBeFocused(); // focus not yanked to Side A on a live edit
});

test('live invalid→valid recovery restores the result', async ({ page }) => {
  await calc(page, '3', '4', '5');
  await page.fill('[name="c"]', '100');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await page.fill('[name="c"]', '5'); // back to a valid triangle
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('6');
});

/* ---- Announcement + Reset + integrity ------------------------------------ */

test('announces the dominant area + classification only', async ({ page }) => {
  await calc(page, '3', '4', '5');
  await expect(liveRegion(page)).toHaveText('The triangle area is 6 square units. It is a right scalene triangle.');
  await expect(liveRegion(page)).not.toContainText(/perimeter|°/i); // no perimeter, no per-angle degree values
});

test('reset clears the sides, hint and result, returns to empty', async ({ page }) => {
  await calc(page, '1', '1', '2'); // domain error state
  await expect(domainHint(page)).toBeVisible();
  await resetBtn(page).click();
  await expect(page.locator('[name="a"]')).toHaveValue('');
  await expect(page.locator('[name="b"]')).toHaveValue('');
  await expect(page.locator('[name="c"]')).toHaveValue('');
  await expect(domainHint(page)).toBeHidden();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

test('keyboard submission works, and no NaN / Infinity / undefined renders', async ({ page }) => {
  await page.fill('[name="a"]', '3');
  await page.fill('[name="b"]', '4');
  await page.fill('[name="c"]', '5');
  await page.locator('[name="c"]').press('Enter');
  await expect(primary(page)).toHaveText('6');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

/* ---- Responsive / theme ------------------------------------------------- */

test('desktop shows the dominant area within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calc(page, '3', '4', '5');
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks sides → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calc(page, '3', '4', '5');
  await expect(primary(page)).toHaveText('6');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calc(page, '3', '4', '5');
  await expect(primary(page)).toBeVisible();
});

/* ---- Embed + monetization + content corrections ------------------------- */

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/math/triangle-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="a"]', '3');
  await page.fill('[name="b"]', '4');
  await page.fill('[name="c"]', '5');
  await page.getByRole('button', { name: 'Solve Triangle' }).click();
  await expect(page.locator('#tri-result [data-result-value]')).toHaveText('6');
  await page.fill('[name="c"]', '100'); // live → impossible
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('#tri-result [data-result-invalid-message]')).toHaveText('These side lengths cannot form a triangle.');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});

test('the refined description and the base-and-height FAQ clarification shipped', async ({ page }) => {
  const html = await page.content();
  expect(html).toContain("Calculate a triangle's area, perimeter, angles and classification from three side lengths.");
  expect(html).toContain('it does not take a base-and-height input');
});
