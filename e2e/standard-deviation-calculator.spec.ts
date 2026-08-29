import { test, expect, type Page } from '@playwright/test';

/**
 * Standard deviation — its own calculator, not the statistics island with a different hero.
 *
 * Every figure asserted here was read off the reference's own worked example
 * (10, 12, 23, 23, 16, 23, 21, 16 as a population) and reproduced independently before being
 * written down: σ 4.8989794855664, σ² 24, Σ(xᵢ − μ)² 192, the standard error 1.7320508075689, all
 * eight confidence rows and the frequency table.
 */
const ROUTE = '/math/standard-deviation-calculator';
const DATA = '10, 12, 23, 23, 16, 23, 21, 16';

const shell = (page: Page) => page.locator('#sd-result');
const input = (page: Page) => page.locator('[name="values"]');
const submit = (page: Page) => page.locator('[data-sd-submit]');
const live = (page: Page) => page.locator('#sd-live');
const dominant = (page: Page) => page.locator('#sd-result [data-result-value]');
const fieldError = (page: Page) => page.locator('[data-error-for="values"]');
const mode = (page: Page, value: 'population' | 'sample') =>
  page.locator(`input[name="mode"][value="${value}"]`);

const rowsOf = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((rows) =>
    rows.map((row) => Array.from(row.children).map((c) => (c.textContent ?? '').trim())),
  );

async function calculate(page: Page, data = DATA, m: 'population' | 'sample' = 'population') {
  await input(page).fill(data);
  await mode(page, m).check();
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
}

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads task-first: empty box, empty result, Population preselected', async ({ page }) => {
  await expect(input(page)).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  await expect(mode(page, 'population')).toBeChecked();
  await expect(mode(page, 'sample')).not.toBeChecked();
  await expect(submit(page)).toHaveText('Calculate');
  await expect(page.locator('[data-reset]')).toHaveText('Clear');
  await expect(live(page)).toHaveText('');
});

test('the result sits directly under the box that produces it', async ({ page }) => {
  await calculate(page);
  const form = (await page.locator('form[data-form]').boundingBox())!;
  const result = (await shell(page).boundingBox())!;
  expect(result.y).toBeGreaterThanOrEqual(form.y + form.height - 2);
});

/* ---- The reference result ----------------------------------------------- */

test('reproduces every headline figure of the reference example', async ({ page }) => {
  await calculate(page);
  await expect(page.locator('[data-sd-label]')).toHaveText('Standard Deviation, σ:');
  await expect(dominant(page)).toHaveText('4.8989794855664');
  await expect(page.locator('[data-sd-count-label]')).toHaveText('Count, N:');
  await expect(page.locator('[data-sd-count]')).toHaveText('8');
  await expect(page.locator('[data-sd-sum]')).toHaveText('144');
  await expect(page.locator('[data-sd-mean-label]')).toHaveText('Mean, μ:');
  await expect(page.locator('[data-sd-mean]')).toHaveText('18');
  await expect(page.locator('[data-sd-variance-label]')).toHaveText('Variance, σ²:');
  await expect(page.locator('[data-sd-variance]')).toHaveText('24');
});

test('shows the reference derivation, line for line', async ({ page }) => {
  await calculate(page);
  await expect(page.locator('[data-sd-formula]')).toHaveText('σ = √( (1 / N) × Σ(xᵢ - μ)² )');
  expect(await rowsOf(page, '[data-sd-steps] .sd-step')).toEqual([
    ['σ²', 'Σ(xᵢ - μ)² / N'],
    ['=', '((10 - 18)² + … + (16 - 18)²) / 8'],
    ['=', '192 / 8'],
    ['=', '24'],
    ['σ', '√24'],
    ['=', '4.8989794855664'],
  ]);
});

test('shows the reference margin-of-error table, every row', async ({ page }) => {
  await calculate(page);
  await expect(page.locator('[data-sd-sem]')).toHaveText('σx̄ = σ / √N = 1.7320508075689');
  const rows = await rowsOf(page, '[data-sd-confidence] tr');
  expect(rows.map((r) => [r[0], r[1]])).toEqual([
    ['68.3%, σx̄', '18 ±1.732 (±9.62%)'],
    ['90%, 1.645σx̄', '18 ±2.849 (±15.83%)'],
    ['95%, 1.960σx̄', '18 ±3.395 (±18.86%)'],
    ['99%, 2.576σx̄', '18 ±4.462 (±24.79%)'],
    ['99.9%, 3.291σx̄', '18 ±5.7 (±31.67%)'],
    ['99.99%, 3.891σx̄', '18 ±6.739 (±37.44%)'],
    ['99.999%, 4.417σx̄', '18 ±7.65 (±42.50%)'],
    ['99.9999%, 4.892σx̄', '18 ±8.473 (±47.07%)'],
  ]);
  // Each row also draws its error bar.
  await expect(page.locator('[data-sd-confidence] .sd-bar')).toHaveCount(8);
});

test('shows the reference frequency table', async ({ page }) => {
  await calculate(page);
  expect(await rowsOf(page, '[data-sd-frequency] tr')).toEqual([
    ['10', '1 (12.5%)'],
    ['12', '1 (12.5%)'],
    ['16', '2 (25%)'],
    ['21', '1 (12.5%)'],
    ['23', '3 (37.5%)'],
  ]);
});

/* ---- Population vs sample ----------------------------------------------- */

test('the sample choice changes the divisor, the symbols and every figure below the mean', async ({ page }) => {
  await calculate(page, DATA, 'sample');
  await expect(page.locator('[data-sd-label]')).toHaveText('Standard Deviation, s:');
  await expect(dominant(page)).toHaveText('5.2372293656638');
  await expect(page.locator('[data-sd-count-label]')).toHaveText('Count, n:');
  await expect(page.locator('[data-sd-mean-label]')).toHaveText('Mean, x̄:');
  await expect(page.locator('[data-sd-variance-label]')).toHaveText('Variance, s²:');
  await expect(page.locator('[data-sd-variance]')).toHaveText('27.428571428571');
  // The divisor is parenthesised: "/ n - 1" would read as a different formula.
  await expect(page.locator('[data-sd-formula]')).toHaveText('s = √( (1 / (n - 1)) × Σ(xᵢ - x̄)² )');
  expect((await rowsOf(page, '[data-sd-steps] .sd-step'))[0]).toEqual(['s²', 'Σ(xᵢ - x̄)² / (n - 1)']);
  await expect(page.locator('[data-sd-sem]')).toHaveText('sx̄ = s / √n = 1.8516401995451');
  // Count, sum and mean are the same data either way.
  await expect(page.locator('[data-sd-count]')).toHaveText('8');
  await expect(page.locator('[data-sd-mean]')).toHaveText('18');
});

test('switching the mode after a result recalculates live', async ({ page }) => {
  await calculate(page);
  await expect(dominant(page)).toHaveText('4.8989794855664');
  await mode(page, 'sample').check();
  await expect(dominant(page)).toHaveText('5.2372293656638');
  await mode(page, 'population').check();
  await expect(dominant(page)).toHaveText('4.8989794855664');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty submission asks for a number and focuses the box', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(fieldError(page)).toHaveText('Enter at least one number.');
  await expect(input(page)).toBeFocused();
});

test('an invalid token is named rather than silently dropped', async ({ page }) => {
  await input(page).fill('1, oops, 3');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(fieldError(page)).toContainText('oops');
  await expect(input(page)).toHaveAttribute('aria-invalid', 'true');
});

test('a sample of one is refused with the reason; a population of one is valid at zero', async ({ page }) => {
  await input(page).fill('5');
  await mode(page, 'sample').check();
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(fieldError(page)).toContainText('at least two');

  // Live-after-first only starts once a FIRST calculation has succeeded, and this one never did,
  // so the visitor presses Calculate again rather than the mode change recalculating for them.
  await mode(page, 'population').check();
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(dominant(page)).toHaveText('0');
});

test('never renders NaN, Infinity or a raw error', async ({ page }) => {
  for (const data of ['5', '0, 0, 0', '-4, -2, -9', '1e3, 2.5e-1']) {
    await input(page).fill(data);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
  }
});

/* ---- Lifecycle ---------------------------------------------------------- */

test('does not calculate before the primary action, then updates live', async ({ page }) => {
  await input(page).fill(DATA);
  await page.waitForTimeout(400);
  // Typing dismisses the labelled example, but it must NOT calculate — no result before the action.
  await expect(shell(page)).not.toHaveAttribute('data-result-state', 'valid');
  await expect(page.locator('[data-result-when~="valid"]')).toBeHidden();
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(page.locator('[data-live-note]')).toBeVisible();
  await input(page).fill('2, 4, 6, 8');
  await expect(dominant(page)).toHaveText('2.2360679774998');
});

test('Clear empties the box and restores Population', async ({ page }) => {
  await calculate(page, DATA, 'sample');
  await page.locator('[data-reset]').click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(input(page)).toHaveValue('');
  await expect(mode(page, 'population')).toBeChecked();
  await expect(live(page)).toHaveText('');
});

test('announces the result once, naming which standard deviation it is', async ({ page }) => {
  await calculate(page);
  await expect(live(page)).toHaveText('Population standard deviation: 4.8989794855664.');
  await mode(page, 'sample').check();
  await expect(live(page)).toHaveText('Sample standard deviation: 5.2372293656638.');
  // Scoped to the tool column, as triangle and statistics already do: the side
  // rail's search combobox has its own status region, which is that widget's,
  // not a calculator's.
  await expect(page.locator('.tool-shell__core [aria-live]')).toHaveCount(1);
});

/* ---- Workspace / responsive --------------------------------------------- */

test('desktop first viewport shows H1, the box and its action', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(submit(page)).toBeInViewport();
});

test('mobile stacks box → Calculate → result with no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const boxY = (await input(page).boundingBox())!.y;
  const buttonY = (await submit(page).boundingBox())!.y;
  const resultY = (await shell(page).boundingBox())!.y;
  expect(buttonY).toBeGreaterThan(boxY);
  expect(resultY).toBeGreaterThan(buttonY);
  await calculate(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calculate(page);
  await expect(dominant(page)).toHaveText('4.8989794855664');
});

/* ---- Embed + guide ------------------------------------------------------ */

test('the generated embed route mounts this island', async ({ page }) => {
  await page.goto('/embed/math/standard-deviation-calculator', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-sd]')).toHaveCount(1);
  await expect(page.locator('#sd-result')).toHaveAttribute('data-result-state', 'example');
  await page.locator('[name="values"]').fill(DATA);
  await page.locator('[data-sd-submit]').click();
  await expect(page.locator('#sd-result [data-result-value]')).toHaveText('4.8989794855664');
});

test('the guide embeds exactly one instance, task-first', async ({ page }) => {
  await page.goto('/guides/standard-deviation-explained', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-sd]')).toHaveCount(1);
  await expect(page.locator('#sd-result')).toHaveAttribute('data-result-state', 'example');
  await expect(page.locator('[name="values"]')).toHaveValue('');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
